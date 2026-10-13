// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// @title MohnPool
/// @notice The ETH/MOHN Uniswap v4 pool used for protocol liquidity and buybacks: native ETH as
///         currency0, 0.3 % fee (sim/params.json amm.fee), tick spacing 60, full range. Its hook is
///         the LiquidityManager, which only implements beforeInitialize so that nobody else can
///         initialize the pool at their own price before Market Open.
library MohnPool {
    uint24 internal constant FEE = 3000;
    int24 internal constant TICK_SPACING = 60;
    uint256 internal constant Q96 = 1 << 96;

    /// @notice Hook permission bits of the LiquidityManager address: beforeInitialize only.
    uint160 internal constant HOOK_FLAGS = (1 << 13) | (1 << 7);

    function key(address mohn, address hooks) internal pure returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(mohn),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(hooks)
        });
    }

    function tickLower() internal pure returns (int24) {
        return TickMath.minUsableTick(TICK_SPACING);
    }

    function tickUpper() internal pure returns (int24) {
        return TickMath.maxUsableTick(TICK_SPACING);
    }

    /// @notice Largest full-range liquidity that `eth` and `mohn` can fund at `sqrtPriceX96`
    ///         (rounded down, so the pool never asks for more than is available).
    function liquidityFor(uint160 sqrtPriceX96, uint256 eth, uint256 mohn)
        internal
        pure
        returns (uint128)
    {
        uint256 sqrtA = TickMath.getSqrtPriceAtTick(tickLower());
        uint256 sqrtB = TickMath.getSqrtPriceAtTick(tickUpper());
        uint256 sqrtP = sqrtPriceX96;
        // amount0 = L * (sqrtB - sqrtP) / (sqrtP * sqrtB) * Q96  =>  L = amount0 * sqrtP * sqrtB / Q96 / (sqrtB - sqrtP)
        uint256 l0 = Math.mulDiv(eth, Math.mulDiv(sqrtP, sqrtB, Q96), sqrtB - sqrtP);
        // amount1 = L * (sqrtP - sqrtA) / Q96  =>  L = amount1 * Q96 / (sqrtP - sqrtA)
        uint256 l1 = Math.mulDiv(mohn, Q96, sqrtP - sqrtA);
        uint256 l = Math.min(l0, l1);
        // forge-lint: disable-next-line(unsafe-typecast)
        return l > type(uint128).max ? type(uint128).max : uint128(l);
    }
}
