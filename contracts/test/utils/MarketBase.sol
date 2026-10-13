// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {RevenueRouter} from "../../src/RevenueRouter.sol";
import {LiquidityManager} from "../../src/LiquidityManager.sol";
import {BuybackBurner} from "../../src/BuybackBurner.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {MockAggregator} from "../mocks/MockAggregator.sol";
import {PoolSwapper} from "./PoolSwapper.sol";

/// @notice Shared setup of the market tests: MiningCore, token, router, LiquidityManager (the pool's
///         hook) and BuybackBurner against the real Uniswap v4 PoolManager bytecode of Robinhood
///         Chain (etched at its canonical address; the fixture's code hash is checked against the
///         hash read from mainnet and testnet). Ten drillers mine through genesis; the clock
///         stands at Market Open.
abstract contract MarketBase is Test {
    using StateLibrary for IPoolManager;

    address internal constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    bytes32 internal constant PM_CODEHASH =
        0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626;
    /// Low 14 bits = 0x2080: the beforeInitialize and beforeSwap hook flags.
    address internal constant LM_ADDR = 0x00000000000000000000000000000000004C2080;
    uint64 internal constant GENESIS = 1_800_003_600 - (1_800_003_600 % 3600);
    uint64 internal constant MARKET_OPEN = GENESIS + 72 hours;
    int256 internal constant ETH_USD = 2500e8;

    IPoolManager internal pm = IPoolManager(PM);
    MockAggregator internal feed;
    RevenueRouter internal router;
    MohnToken internal mohn;
    MiningCore internal core;
    LiquidityManager internal lm;
    BuybackBurner internal bb;
    PoolSwapper internal trader;
    address internal admin = makeAddr("admin");
    address internal keeper = makeAddr("keeper");
    address[] internal drillers;

    function setUp() public virtual {
        vm.warp(GENESIS - 12 hours);
        bytes memory code =
            vm.parseBytes(vm.trim(vm.readFile("test/fixtures/PoolManager.runtime.hex")));
        assertEq(keccak256(code), PM_CODEHASH, "fixture == on-chain PoolManager");
        vm.etch(PM, code);

        feed = new MockAggregator(8, ETH_USD);
        router = new RevenueRouter(admin);
        core = _deployCore();
        deployCodeTo(
            "LiquidityManager.sol:LiquidityManager",
            abi.encode(admin, address(core), PM, address(mohn), address(router)),
            LM_ADDR
        );
        lm = LiquidityManager(payable(LM_ADDR));
        bb = BuybackBurner(
            payable(deployCode(
                    "BuybackBurner.sol:BuybackBurner",
                    abi.encode(admin, PM, address(mohn), address(router), LM_ADDR)
                ))
        );
        trader = new PoolSwapper(pm);

        vm.startPrank(admin);
        router.grantRole(router.DEPOSITOR_ROLE(), address(core));
        router.grantRole(router.FEE_DEPOSITOR_ROLE(), LM_ADDR);
        router.grantRole(router.POL_ROLE(), LM_ADDR);
        router.grantRole(router.BUYBACK_ROLE(), address(bb));
        router.grantRole(router.FEE_DEPOSITOR_ROLE(), address(bb)); // returns unspent ETH
        lm.grantRole(lm.KEEPER_ROLE(), keeper);
        bb.grantRole(bb.KEEPER_ROLE(), keeper);
        core.wireLiquidityManager(LM_ADDR);
        vm.stopPrank();

        // Ten drillers fill their tanks in pre-fill and mine through genesis.
        for (uint256 i = 0; i < 10; ++i) {
            address d = makeAddr(string.concat("driller", vm.toString(i)));
            drillers.push(d);
            vm.deal(d, 10 ether);
            vm.prank(d);
            core.buyFuel{value: 0.0009 ether}(address(0));
        }
        vm.warp(MARKET_OPEN);
        _catchUp();
        _fresh();
    }

    function _deployCore() internal returns (MiningCore c) {
        // deployCode keeps the large creation codes out of this test contract (size limit).
        address impl = deployCode("MiningCore.sol:MiningCore");
        address proxyAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        mohn = new MohnToken(proxyAddr);
        bytes memory init = abi.encodeCall(
            MiningCore.initialize,
            (
                admin,
                address(mohn),
                address(router),
                address(feed),
                address(0),
                GENESIS,
                0.1e18,
                address(0xDE7),
                address(0x7EA5)
            )
        );
        c = MiningCore(address(new ERC1967Proxy(impl, init)));
        assertEq(address(c), proxyAddr);
    }

    function _catchUp() internal {
        while (!core.poke()) {}
    }

    function _fresh() internal {
        feed.set(ETH_USD, vm.getBlockTimestamp(), vm.getBlockTimestamp());
    }

    function _key() internal view returns (PoolKey memory) {
        return lm.poolKey();
    }

    function _id() internal view returns (PoolId) {
        return _key().toId();
    }

    function _sqrtPrice() internal view returns (uint160 p) {
        (p,,,) = pm.getSlot0(_id());
    }

    function _liquidity() internal view returns (uint128) {
        return pm.getLiquidity(_id());
    }

    /// E2 including MOHN burned outside MiningCore (buybacks, LP fee burns).
    function _conservation() internal view {
        assertEq(
            core.reserve() + core.minersDistributed() + core.referralPaid() - core.unrefinedSpent()
                - core.unrefinedRefined() + core.devPending() + core.treasuryPending()
                + core.burnedForever() + core.refineQueued() + mohn.totalSupply() + bb.totalBurned()
                + lm.mohnFeesBurned(),
            EmissionMath.CAP,
            "E2"
        );
    }

    function _open() internal returns (uint256 lp) {
        uint256 supplyBefore = mohn.totalSupply();
        core.openMarket();
        lp = mohn.totalSupply() - supplyBefore;
    }
}
