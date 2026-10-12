// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {RevenueRouter} from "../../src/RevenueRouter.sol";
import {LiquidityManager} from "../../src/LiquidityManager.sol";
import {BuybackBurner} from "../../src/BuybackBurner.sol";
import {MockAggregator} from "../../test/mocks/MockAggregator.sol";

/// @notice Attacker-side helper: swaps and arbitrary-range liquidity on any v4 pool with native ETH
///         as currency0, through the real PoolManager.
contract PoolActorAttacker is IUnlockCallback {
    IPoolManager public immutable pm;
    address public immutable owner;

    enum Op {
        Swap,
        Modify
    }

    constructor(IPoolManager pm_) {
        pm = pm_;
        owner = msg.sender;
    }

    receive() external payable {}

    function swap(PoolKey memory key, bool ethForMohn, uint256 amountIn) external returns (int256) {
        bytes memory r = pm.unlock(
            abi.encode(Op.Swap, key, ethForMohn, amountIn, int24(0), int24(0), int256(0))
        );
        return abi.decode(r, (int256));
    }

    function modify(PoolKey memory key, int24 lower, int24 upper, int256 liquidityDelta)
        external
        returns (int256 eth, int256 mohn)
    {
        bytes memory r = pm.unlock(
            abi.encode(Op.Modify, key, false, uint256(0), lower, upper, liquidityDelta)
        );
        (eth, mohn) = abi.decode(r, (int256, int256));
    }

    function withdraw(IERC20 token, address to) external {
        require(msg.sender == owner, "owner");
        if (address(token) == address(0)) {
            (bool ok,) = to.call{value: address(this).balance}("");
            require(ok, "eth");
        } else {
            token.transfer(to, token.balanceOf(address(this)));
        }
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(pm), "only pm");
        (
            Op op,
            PoolKey memory key,
            bool zeroForOne,
            uint256 amountIn,
            int24 lower,
            int24 upper,
            int256 liquidityDelta
        ) = abi.decode(data, (Op, PoolKey, bool, uint256, int24, int24, int256));
        BalanceDelta d;
        if (op == Op.Swap) {
            d = pm.swap(
                key,
                IPoolManager.SwapParams({
                    zeroForOne: zeroForOne,
                    amountSpecified: -int256(amountIn),
                    sqrtPriceLimitX96: zeroForOne
                        ? TickMath.MIN_SQRT_PRICE + 1
                        : TickMath.MAX_SQRT_PRICE - 1
                }),
                ""
            );
        } else {
            (d,) = pm.modifyLiquidity(
                key,
                IPoolManager.ModifyLiquidityParams({
                    tickLower: lower, tickUpper: upper, liquidityDelta: liquidityDelta, salt: 0
                }),
                ""
            );
        }
        int128 a0 = d.amount0();
        int128 a1 = d.amount1();
        if (a0 < 0) pm.settle{value: uint256(uint128(-a0))}();
        else if (a0 > 0) pm.take(key.currency0, address(this), uint256(uint128(a0)));
        if (a1 < 0) {
            pm.sync(key.currency1);
            IERC20(Currency.unwrap(key.currency1)).transfer(address(pm), uint256(uint128(-a1)));
            pm.settle();
        } else if (a1 > 0) {
            pm.take(key.currency1, address(this), uint256(uint128(a1)));
        }
        if (op == Op.Swap) return abi.encode(zeroForOne ? int256(a1) : int256(a0));
        return abi.encode(int256(a0), int256(a1));
    }
}

/// @notice Deployment mirroring script/Deploy.s.sol (including lockBucketRoles) against the real
///         Uniswap v4 PoolManager runtime code of Robinhood Chain.
abstract contract AttackBase is Test {
    using StateLibrary for IPoolManager;

    address internal constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address internal constant LM_ADDR = 0x00000000000000000000000000000000004c2000;
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
    address internal admin = makeAddr("timelock96h");
    address internal keeper = makeAddr("keeper");
    address[] internal drillers;

    function _deploy() internal {
        vm.warp(GENESIS - 12 hours);
        vm.etch(PM, vm.parseBytes(vm.trim(vm.readFile("test/fixtures/PoolManager.runtime.hex"))));
        feed = new MockAggregator(8, ETH_USD);
        router = new RevenueRouter(admin);
        address impl = deployCode("MiningCore.sol:MiningCore");
        address proxyAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        mohn = new MohnToken(proxyAddr);
        core = MiningCore(
            address(
                new ERC1967Proxy(
                    impl,
                    abi.encodeCall(
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
                    )
                )
            )
        );
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
        vm.startPrank(admin);
        router.grantRole(router.DEPOSITOR_ROLE(), address(core));
        router.grantRole(router.FEE_DEPOSITOR_ROLE(), LM_ADDR);
        router.grantRole(router.FEE_DEPOSITOR_ROLE(), address(bb));
        router.grantRole(router.POL_ROLE(), LM_ADDR);
        router.grantRole(router.BUYBACK_ROLE(), address(bb));
        router.lockBucketRoles(); // as Deploy.s.sol does
        lm.grantRole(lm.KEEPER_ROLE(), keeper);
        bb.grantRole(bb.KEEPER_ROLE(), keeper);
        core.wireLiquidityManager(LM_ADDR);
        vm.stopPrank();
    }

    /// @dev `n` drillers fill their Pilot Rig tanks to the genesis cap during pre-fill.
    function _prefill(uint256 n, string memory tag) internal {
        for (uint256 i = 0; i < n; ++i) {
            address d = makeAddr(string.concat(tag, vm.toString(i)));
            drillers.push(d);
            vm.deal(d, 10 ether);
            vm.prank(d);
            core.buyFuel{value: 0.00096 ether}(address(0)); // 24 L = genesis cap of a Pilot Rig
        }
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

    function _sqrtPrice() internal view returns (uint160 p) {
        (p,,,) = pm.getSlot0(_key().toId());
    }

    function _tick() internal view returns (int24 t) {
        (, t,,) = pm.getSlot0(_key().toId());
    }

    function _open() internal returns (uint256 lp) {
        uint256 before = mohn.totalSupply();
        core.openMarket();
        lp = mohn.totalSupply() - before;
    }

    /// @dev Every driller fast-refines all of its credit (chunks of at most 100K).
    function _refineAll(address[] memory who) internal returns (uint256 minted) {
        uint256 before = mohn.totalSupply();
        for (uint256 i = 0; i < who.length; ++i) {
            uint256 credit = core.pendingOf(who[i]);
            while (credit != 0) {
                uint256 a = credit > 100_000e18 ? 100_000e18 : credit;
                vm.prank(who[i]);
                core.refine(a, true);
                credit -= a;
            }
        }
        minted = mohn.totalSupply() - before;
    }
}
