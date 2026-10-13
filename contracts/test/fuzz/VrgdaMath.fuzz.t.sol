// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {VrgdaMath} from "../../src/lib/VrgdaMath.sol";

/// @notice V1 (no bulk discount) and V2 (price monotonicity), docs/04 S2.
contract VrgdaMathFuzzTest is Test {
    uint256 internal constant R = 2000e18; // DP units per day, WAD
    int256 internal lnP0;
    int256 internal decay;

    function setUp() public {
        lnP0 = FixedPointMathLib.lnWad(10e18);
        decay = FixedPointMathLib.lnWad(0.85e18);
    }

    /// Keeps prices inside expWad's range: at most 50 days ahead of schedule.
    function _bounded(uint256 t, uint256 n) internal pure returns (uint256, uint256) {
        t = bound(t, 0, 3650 days);
        n = bound(n, 0, (t * R) / 1 days / 1e18 + 100_000);
        return (t, n);
    }

    function _price(uint256 t, uint256 n) internal view returns (uint256) {
        return VrgdaMath.unitPrice(t, n, lnP0, decay, R);
    }

    /// V1: buying q1 + q2 units at once never costs less than buying them one batch after the
    /// other (beyond 1e-12 relative or a few wei of rounding).
    function testFuzz_noBulkDiscount(uint256 t, uint256 n, uint256 q1, uint256 q2) public view {
        (t, n) = _bounded(t, n);
        q1 = bound(q1, 1, 9999);
        q2 = bound(q2, 1, 10_000 - q1);
        uint256 once = VrgdaMath.batchCost(_price(t, n), q1 + q2, decay, R);
        uint256 split = VrgdaMath.batchCost(_price(t, n), q1, decay, R)
            + VrgdaMath.batchCost(_price(t, n + q1), q2, decay, R);
        uint256 tol = split / 1e12 + 2 * (q1 + q2);
        assertGe(once + tol, split, "bulk discount");
        assertLe(once, split + tol, "bulk premium beyond rounding");
    }

    /// A batch never costs less than q units at the first unit's price.
    function testFuzz_batchAtLeastFirstUnitPrice(uint256 t, uint256 n, uint256 q) public view {
        (t, n) = _bounded(t, n);
        q = bound(q, 1, 10_000);
        uint256 price = _price(t, n);
        assertGe(VrgdaMath.batchCost(price, q, decay, R), price * q);
    }

    /// V2: selling ahead raises the price, time without sales lowers it.
    function testFuzz_priceMonotone(uint256 t, uint256 n, uint256 dn, uint256 dt) public view {
        (t, n) = _bounded(t, n);
        dn = bound(dn, 1, 10_000);
        dt = bound(dt, 1, 30 days);
        uint256 price = _price(t, n);
        assertGe(_price(t, n + dn), price, "more sold, not cheaper");
        assertLe(_price(t + dt, n), price, "later, not dearer");
        if (price > 1e15) {
            assertGt(_price(t, n + dn), price, "strictly dearer");
            if (dt >= 1 hours) assertLt(_price(t + dt, n), price, "strictly cheaper");
        }
    }

    /// On schedule (n = t * r) the price is p0, up to rounding.
    function testFuzz_onSchedulePriceIsP0(uint256 daysElapsed) public view {
        daysElapsed = bound(daysElapsed, 0, 3650);
        assertApproxEqRel(_price(daysElapsed * 1 days, daysElapsed * R / 1e18), 10e18, 1e6);
    }
}
