// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, stdJson} from "forge-std/Test.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";

/// @notice Differential test: Solidity emission math vs the simulator's golden vectors.
contract EmissionMathDiffTest is Test {
    using stdJson for string;

    string internal json;

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/../sim/vectors/emission_hourly.json"));
    }

    function test_constantsMatchVectors() public view {
        assertEq(EmissionMath.DELTA_H_WAD, vm.parseUint(json.readString(".DELTA_H_WAD")));
        assertEq(EmissionMath.CAP, vm.parseUint(json.readString(".R0_wei")));
    }

    /// Every hour is computed; checkpoint rows are compared field by field. Because the reserve
    /// is chained, an exact match at hour 1999 also proves every hour before it.
    /// (packages/sdk compares all 2000 rows individually; cheatcode JSON reads are memory-heavy.)
    function test_first2000HoursMatchVectorsExactly() public view {
        uint256 reserve = EmissionMath.CAP;
        for (uint256 h = 0; h < 2000; ++h) {
            if (!_isCheckpoint(h)) {
                reserve -= EmissionMath.hourlyEmission(reserve);
                continue;
            }
            string memory row = string.concat(".rows[", vm.toString(h), "]");
            assertEq(reserve, vm.parseUint(json.readString(string.concat(row, "[1]"))), "R_h");

            uint256 emission = EmissionMath.hourlyEmission(reserve);
            assertEq(emission, vm.parseUint(json.readString(string.concat(row, "[2]"))), "E_h");

            (uint256 miners, uint256 dev, uint256 treasury) = EmissionMath.split(emission);
            assertEq(miners, vm.parseUint(json.readString(string.concat(row, "[3]"))), "miners");
            assertEq(dev, vm.parseUint(json.readString(string.concat(row, "[4]"))), "dev");
            assertEq(treasury, vm.parseUint(json.readString(string.concat(row, "[5]"))), "treasury");

            reserve -= emission;
        }
    }

    function _isCheckpoint(uint256 h) private pure returns (bool) {
        return h <= 2 || h == 500 || h == 999 || h == 1500 || h == 1999;
    }
}
