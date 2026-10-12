// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// @title PriceAnchor
/// @notice A time-weighted moving average of the pool tick (docs/02 S10.1, AI review AI-2). The
///         hook folds in the tick that held since the last swap, weighted by how long it held:
///         ema += (tick - ema) * dt / (dt + TAU). A price pushed for one block barely moves the
///         average; holding it for TAU against arbitrage moves it halfway. Keeper swaps
///         (buybacks, liquidity adds) may only trade within MAX_DEVIATION ticks of it.
library PriceAnchor {
    /// @notice Averaging time constant.
    uint256 internal constant TAU = 1 hours;
    /// @notice 296 ticks = 1.0001^296, about 3 %.
    int24 internal constant MAX_DEVIATION = 296;
    int256 internal constant WAD = 1e18;

    struct State {
        int256 emaWad; // average tick, 18 decimals
        uint64 updatedAt; // time of the last swap folded in
    }

    error AnchorNotSet();
    error PriceOffAnchor(int24 tick, int24 anchor);

    /// @dev At pool initialization: the average starts at the opening price.
    function start(State storage s, int24 tick, uint256 nowTs) internal {
        s.emaWad = int256(tick) * WAD;
        s.updatedAt = SafeCast.toUint64(nowTs);
    }

    /// @notice The average as it would be now, given the tick that held since the last update.
    function current(State storage s, int24 heldTick, uint256 nowTs)
        internal
        view
        returns (int256)
    {
        if (s.updatedAt == 0) revert AnchorNotSet();
        return fold(s.emaWad, heldTick, nowTs - s.updatedAt);
    }

    /// @dev Called before every swap with the tick that held until now.
    function update(State storage s, int24 heldTick, uint256 nowTs) internal {
        s.emaWad = current(s, heldTick, nowTs);
        s.updatedAt = SafeCast.toUint64(nowTs);
    }

    /// @notice ema + (tick - ema) * dt / (dt + TAU), rounded toward zero (pure, tested alone).
    function fold(int256 emaWad, int24 tick, uint256 dt) internal pure returns (int256) {
        if (dt == 0) return emaWad;
        // dt < 2^64 and |tick| < 2^24: no overflow.
        // forge-lint: disable-next-line(unsafe-typecast)
        return emaWad + ((int256(tick) * WAD - emaWad) * int256(dt)) / int256(dt + TAU);
    }

    /// @notice The average as a tick (rounded toward negative infinity).
    function toTick(int256 emaWad) internal pure returns (int24) {
        int256 t = emaWad / WAD;
        // Intended: detects whether the division truncated, to round negatives down.
        // forge-lint: disable-next-line(divide-before-multiply)
        if (emaWad < 0 && t * WAD != emaWad) t -= 1;
        // forge-lint: disable-next-line(unsafe-typecast)
        return int24(t);
    }

    /// @notice Price limit for an ETH -> MOHN swap (zeroForOne: the tick falls): no lower than
    ///         MAX_DEVIATION below the average. Reverts if the price already sits below that.
    function buyLimit(int24 tick, int24 anchor) internal pure returns (uint160) {
        int24 floor = anchor - MAX_DEVIATION;
        if (floor < TickMath.MIN_TICK + 1) floor = TickMath.MIN_TICK + 1;
        if (tick <= floor) revert PriceOffAnchor(tick, anchor);
        return TickMath.getSqrtPriceAtTick(floor);
    }

    /// @notice Liquidity is added only while the price is within MAX_DEVIATION of the average.
    function requireNear(int24 tick, int24 anchor) internal pure {
        int24 d = tick > anchor ? tick - anchor : anchor - tick;
        if (d > MAX_DEVIATION) revert PriceOffAnchor(tick, anchor);
    }
}
