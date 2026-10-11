// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

/// @title VrgdaMath
/// @notice LinearVRGDA prices for drill power (docs/02 S6.2), in MOHN wei per DP unit.
/// @dev p(t, n) = p0 * (1 - k)^(t - n / r), t in days since genesis, n = DP units sold so far.
///      Unit j of a purchase that starts at n costs p(t, n + j), j = 0..q-1 (the spec's convention,
///      sim/vectors/vrgda_costs.json), so a batch of q units costs
///      p(t, n) * (a^q - 1) / (a - 1) with a = (1 - k)^(-1 / r).
///      Inputs: lnP0 = ln(p0 in wei-per-unit / 1e18) and decay = ln(1 - k), both WAD (decay < 0).
///      Prices far ahead of schedule overflow expWad and revert; far behind they round to 0.
library VrgdaMath {
    uint256 internal constant WAD = 1e18;

    /// @notice Price of the next DP unit after `elapsed` seconds with `sold` units sold.
    function unitPrice(uint256 elapsed, uint256 sold, int256 lnP0, int256 decay, uint256 r)
        internal
        pure
        returns (uint256)
    {
        // Days on schedule minus days elapsed, in WAD. Both terms are far below 2^255.
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 behind = int256((elapsed * WAD) / 1 days) - int256((sold * WAD) / r);
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(FixedPointMathLib.expWad(lnP0 + FixedPointMathLib.sMulWad(decay, behind)));
    }

    /// @notice Cost of `q` units bought at once, starting at unit price `price`. Rounds up.
    function batchCost(uint256 price, uint256 q, int256 decay, uint256 r)
        internal
        pure
        returns (uint256)
    {
        // ln(a) = -decay / r > 0 per unit. a^q - 1 and a - 1 are both positive and computed
        // directly by expWad, so the ratio keeps ~1e-14 relative precision.
        // Casts: q and r are DP unit counts (far below 2^255); expWad of a positive input is > 1e18.
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 lnA = -decay / int256(r);
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 lnAq = (-decay * int256(q)) / int256(r);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 aMinusOne = uint256(FixedPointMathLib.expWad(lnA)) - WAD;
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 aqMinusOne = uint256(FixedPointMathLib.expWad(lnAq)) - WAD;
        return FixedPointMathLib.fullMulDivUp(price, aqMinusOne, aMinusOne);
    }
}
