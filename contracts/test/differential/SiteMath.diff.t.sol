// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, stdJson} from "forge-std/Test.sol";
import {SiteMath} from "../../src/lib/SiteMath.sol";

/// @notice SiteMath tables must equal sim/vectors/outpost_costs.json exactly.
contract SiteMathDiffTest is Test {
    using stdJson for string;

    function test_tablesMatchVectors() public view {
        string memory json =
            vm.readFile(string.concat(vm.projectRoot(), "/../sim/vectors/outpost_costs.json"));
        for (uint256 level = 1; level <= 30; ++level) {
            string memory row = string.concat(".rows[", vm.toString(level - 1), "]");
            assertEq(SiteMath.slots(level), json.readUint(string.concat(row, ".slots")), "slots");
            assertEq(
                SiteMath.fuelLineCapacity(level),
                vm.parseUint(json.readString(string.concat(row, ".capacity_kw_wad"))),
                "capacity"
            );
            if (level < 30) {
                assertEq(
                    SiteMath.upgradeCost(level),
                    vm.parseUint(json.readString(string.concat(row, ".next_level_cost_wad"))),
                    "upgrade cost"
                );
            }
        }
    }

    function test_invalidLevelsRevert() public {
        vm.expectRevert(abi.encodeWithSelector(SiteMath.InvalidLevel.selector, 0));
        this.slotsOf(0);
        vm.expectRevert(abi.encodeWithSelector(SiteMath.InvalidLevel.selector, 31));
        this.capacityOf(31);
        vm.expectRevert(abi.encodeWithSelector(SiteMath.InvalidLevel.selector, 30));
        this.costOf(30);
        vm.expectRevert(abi.encodeWithSelector(SiteMath.InvalidLevel.selector, 0));
        this.costOf(0);
    }

    // External wrappers so expectRevert can observe library reverts.
    function slotsOf(uint256 level) external pure returns (uint256) {
        return SiteMath.slots(level);
    }

    function capacityOf(uint256 level) external pure returns (uint256) {
        return SiteMath.fuelLineCapacity(level);
    }

    function costOf(uint256 level) external pure returns (uint256) {
        return SiteMath.upgradeCost(level);
    }
}
