// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {Position} from "@uniswap/v4-core/src/libraries/Position.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

import {MohnToken} from "../../../src/MohnToken.sol";
import {RevenueRouter} from "../../../src/RevenueRouter.sol";
import {LiquidityManager} from "../../../src/LiquidityManager.sol";
import {BuybackBurner} from "../../../src/BuybackBurner.sol";
import {MohnPool} from "../../../src/lib/MohnPool.sol";
import {PoolSwapper} from "../../utils/PoolSwapper.sol";
import {PoolManagerCode} from "./PoolManagerCode.sol";

/// @notice The cheatcodes the market harness needs, shared by Foundry, Medusa and Echidna.
interface IHevmMarket {
    function warp(uint256) external;
    function deal(address, uint256) external;
}

/// @title MarketSetup
/// @notice Deploys the market layer for the property fuzzers: the real Uniswap v4 PoolManager
///         bytecode (code hash checked; deployed with CREATE because Medusa does not run etched
///         code, with its NoDelegateCall self-address patched), RevenueRouter, MohnToken, LiquidityManager at a
///         CREATE2 address with the hook bits, BuybackBurner and a third-party trader. MiningCore
///         is left out (the harness would exceed the 96 KB code size limit): the tester stands in
///         for it as the token's minter, the router's depositor and the caller of openMarket,
///         and it is the keeper. The whole-system properties run in test/recon/CryticTester.sol.
abstract contract MarketSetup {
    using StateLibrary for IPoolManager;

    IHevmMarket internal constant hevm = IHevmMarket(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    bytes32 internal constant PM_CODEHASH =
        0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626;
    uint256 internal constant LP_MOHN = 40_000e18;

    IPoolManager internal pm;
    MohnToken internal mohn;
    RevenueRouter internal router;
    LiquidityManager internal lm;
    BuybackBurner internal bb;
    PoolSwapper internal trader;
    PoolId internal poolId;
    bytes32 internal positionId;

    uint256 internal buybackAtOpen;
    uint256 internal polAtOpen;
    uint256 internal supplyAtOpen;

    function _setup() internal {
        hevm.warp(1_800_000_000);
        hevm.deal(address(this), 1_000_000 ether);
        pm = _deployPoolManager(); // first creation: nonce 1

        router = new RevenueRouter(address(this));
        mohn = new MohnToken(address(this));
        lm = _deployLiquidityManager();
        bb = new BuybackBurner(
            address(this), address(pm), address(mohn), address(router), address(lm)
        );
        trader = new PoolSwapper(pm);

        router.grantRole(router.DEPOSITOR_ROLE(), address(this));
        router.grantRole(router.FEE_DEPOSITOR_ROLE(), address(lm));
        router.grantRole(router.POL_ROLE(), address(lm));
        router.grantRole(router.BUYBACK_ROLE(), address(bb));
        router.grantRole(router.FEE_DEPOSITOR_ROLE(), address(bb));
        lm.grantRole(lm.KEEPER_ROLE(), address(this));
        bb.grantRole(bb.KEEPER_ROLE(), address(this));

        // Genesis revenue, then Market Open at the price of LP_MOHN for the POL ETH.
        router.deposit{value: 10 ether}();
        uint256 pol = router.polBalance();
        mohn.mint(address(lm), LP_MOHN);
        uint160 sqrtPriceX96 =
            uint160(FixedPointMathLib.sqrt((LP_MOHN << 96) / pol) * (uint256(1) << 48));
        lm.openMarket(sqrtPriceX96, pol);

        mohn.mint(address(trader), 100_000e18);
        hevm.deal(address(trader), 1000 ether);

        poolId = lm.poolKey().toId();
        positionId = Position.calculatePositionKey(
            address(lm), MohnPool.tickLower(), MohnPool.tickUpper(), bytes32(0)
        );
        buybackAtOpen = router.buybackBalance();
        polAtOpen = router.polBalance();
        supplyAtOpen = mohn.totalSupply();
    }

    /// The PoolManager runtime with NoDelegateCall's self-address set to where CREATE puts it
    /// (this contract's first creation), behind a 10-byte constructor that returns it.
    function _deployPoolManager() internal returns (IPoolManager deployed) {
        bytes memory runtime = PoolManagerCode.RUNTIME;
        require(keccak256(runtime) == PM_CODEHASH, "PoolManager code");
        address predicted = address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), address(this), uint8(1)))
                )
            )
        );
        uint256 offset = PoolManagerCode.SELF_OFFSET;
        // Overwrite the 20 address bytes at `offset`, keeping the 12 bytes after them.
        assembly ("memory-safe") {
            let p := add(add(runtime, 32), offset)
            let rest := and(mload(p), 0xffffffffffffffffffffffff)
            mstore(p, or(shl(96, predicted), rest))
        }
        // PUSH2 len, DUP1, PUSH1 10, PUSH0, CODECOPY, PUSH0, RETURN
        bytes memory init =
            abi.encodePacked(hex"61", uint16(runtime.length), hex"80600a5f395ff3", runtime);
        address created;
        assembly ("memory-safe") {
            created := create(0, add(init, 32), mload(init))
        }
        require(created == predicted, "PoolManager address");
        deployed = IPoolManager(created);
    }

    /// CREATE2 with the first salt whose address carries exactly the pool's hook bits.
    function _deployLiquidityManager() internal returns (LiquidityManager) {
        bytes memory args =
            abi.encode(address(this), address(this), address(pm), address(mohn), address(router));
        bytes32 initHash = keccak256(abi.encodePacked(type(LiquidityManager).creationCode, args));
        for (uint256 salt = 0;; ++salt) {
            address predicted = address(
                uint160(
                    uint256(
                        keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initHash))
                    )
                )
            );
            if (uint160(predicted) & Hooks.ALL_HOOK_MASK == MohnPool.HOOK_FLAGS) {
                return new LiquidityManager{salt: bytes32(salt)}(
                    address(this), address(this), address(pm), address(mohn), address(router)
                );
            }
        }
    }

    function _positionLiquidity() internal view returns (uint128) {
        return pm.getPositionLiquidity(poolId, positionId);
    }

    function _tick() internal view returns (int24 tick) {
        (, tick,,) = pm.getSlot0(poolId);
    }
}
