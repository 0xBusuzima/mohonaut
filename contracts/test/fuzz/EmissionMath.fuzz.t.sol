// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";

contract EmissionMathFuzzTest is Test {
    /// Split never creates or loses a wei.
    function testFuzz_splitConservesEmission(uint256 emission) public pure {
        emission = bound(emission, 0, EmissionMath.CAP);
        (uint256 miners, uint256 dev, uint256 treasury) = EmissionMath.split(emission);
        assertEq(miners + dev + treasury, emission);
        assertLe(miners, (emission * 9) / 10);
        assertLe(dev, emission / 20);
    }

    /// minersShare is exactly the miners' part of split.
    function testFuzz_minersShareMatchesSplit(uint256 emission) public pure {
        emission = bound(emission, 0, EmissionMath.CAP);
        (uint256 miners,,) = EmissionMath.split(emission);
        assertEq(EmissionMath.minersShare(emission), miners);
    }

    /// An hour can never emit more than the reserve holds, and emits nothing from an empty reserve.
    function testFuzz_emissionBoundedByReserve(uint256 reserve) public pure {
        reserve = bound(reserve, 0, EmissionMath.CAP);
        uint256 emission = EmissionMath.hourlyEmission(reserve);
        assertLe(emission, reserve);
        if (reserve == 0) assertEq(emission, 0);
    }

    /// A larger reserve never emits less (monotonic).
    function testFuzz_emissionMonotonic(uint256 a, uint256 b) public pure {
        a = bound(a, 0, EmissionMath.CAP);
        b = bound(b, a, EmissionMath.CAP);
        assertLe(EmissionMath.hourlyEmission(a), EmissionMath.hourlyEmission(b));
    }
}
