// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {SwapMath} from "@uniswap/v4-core/src/libraries/SwapMath.sol";
import {MohnPool} from "../../src/lib/MohnPool.sol";

/// @notice liquidityFor returns the largest full-range liquidity the amounts can fund: the pool
///         (rounding up, as the PoolManager does) never asks for more than is given, and a
///         slightly larger liquidity would need more of one side.
contract MohnPoolTest is Test {
    uint160 internal sqrtA;
    uint160 internal sqrtB;

    function setUp() public {
        sqrtA = TickMath.getSqrtPriceAtTick(MohnPool.tickLower());
        sqrtB = TickMath.getSqrtPriceAtTick(MohnPool.tickUpper());
    }

    function _assertMaximal(uint160 sqrtP, uint256 eth, uint256 mohn) internal view {
        uint128 l = MohnPool.liquidityFor(sqrtP, eth, mohn);
        assertLe(SqrtPriceMath.getAmount0Delta(sqrtP, sqrtB, l, true), eth, "eth side");
        assertLe(SqrtPriceMath.getAmount1Delta(sqrtA, sqrtP, l, true), mohn, "mohn side");
        uint128 bigger = l + l / 1e6 + 1;
        assertTrue(
            SqrtPriceMath.getAmount0Delta(sqrtP, sqrtB, bigger, true) > eth
                || SqrtPriceMath.getAmount1Delta(sqrtA, sqrtP, bigger, true) > mohn,
            "not maximal"
        );
    }

    function test_maximalNearTheUpperBound() public view {
        // Price near the top of the range: the ETH side binds.
        _assertMaximal(sqrtB / 2, 1e18, type(uint128).max);
    }

    function test_maximalNearTheLowerBound() public view {
        // Price near the bottom of the range: the MOHN side binds.
        _assertMaximal(sqrtA * 2, 1e40, 1);
    }

    function testFuzz_maximal(uint160 sqrtP, uint256 eth, uint256 mohn) public view {
        sqrtP = uint160(bound(sqrtP, uint256(sqrtA) * 2, sqrtB / 2));
        eth = bound(eth, 1, 1 << 100);
        mohn = bound(mohn, 1, 1 << 100);
        vm.assume(MohnPool.liquidityFor(sqrtP, eth, mohn) < type(uint128).max / 2);
        _assertMaximal(sqrtP, eth, mohn);
    }

    function test_poolIdVector() public pure {
        // The same vector is checked in packages/sdk/test/pool.test.ts (the indexer filters the
        // PoolManager's logs by this id).
        PoolId id = PoolIdLibrary.toId(
            MohnPool.key(
                0x1111111111111111111111111111111111111111,
                0x0000000000000000000000000000000000002000
            )
        );
        assertEq(
            PoolId.unwrap(id), 0xe618da777871bd937c464672d56433cb28488bc498fe65a461f94636532e43da
        );
    }

    function test_quoteVector() public pure {
        // An exact-input ETH -> MOHN swap inside the full range (no tick crossing): the keeper
        // quotes it off-chain (packages/sdk quoteEthForMohn) to set minOut. Same vector there.
        (uint160 next,, uint256 out,) = SwapMath.computeSwapStep(
            1e27, TickMath.MIN_SQRT_PRICE + 1, 1e22, -int256(1e17), MohnPool.FEE
        );
        assertEq(out, 15_883_124_355_272);
        assertEq(next, 999_999_874_160_924_234_619_179_008);
    }
}
