// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, stdJson} from "forge-std/Test.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {AccountingHarness} from "../utils/AccountingHarness.sol";

/// @notice The on-chain checkpoint loop must reproduce sim/vectors/emission_hourly.json when DP is
///         active for every full hour (the vectors' assumption).
contract MiningAccountingDiffTest is Test {
    using stdJson for string;

    uint64 internal constant GENESIS = 1_800_003_600 - (1_800_003_600 % 3600);
    string internal json;

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/../sim/vectors/emission_hourly.json"));
    }

    function _row(uint256 h, uint256 col) internal view returns (uint256) {
        return vm.parseUint(
            json.readString(string.concat(".rows[", vm.toString(h), "][", vm.toString(col), "]"))
        );
    }

    function test_reserveAndSplitTrackVectors_hourlyPokes() public {
        vm.warp(GENESIS);
        AccountingHarness core = new AccountingHarness(GENESIS);
        core.setPosition(address(0xA11CE), 1_000, type(uint64).max);

        uint256 devSum;
        uint256 treasurySum;
        uint256 minersSum;
        for (uint256 h = 0; h < 2000; ++h) {
            if (h <= 2 || h == 500 || h == 999 || h == 1500 || h == 1999) {
                assertEq(core.reserve(), _row(h, 1), "R_h");
                assertEq(core.hourEmission(), _row(h, 2), "E_h");
                assertEq(core.devPending(), devSum, "dev cumulative");
                assertEq(core.treasuryPending(), treasurySum, "treasury cumulative");
                assertEq(core.minersDistributed(), minersSum, "miners cumulative");
            }
            (uint256 m, uint256 d, uint256 t) = EmissionMath.split(core.hourEmission());
            minersSum += m;
            devSum += d;
            treasurySum += t;
            vm.warp(GENESIS + (h + 1) * 1 hours);
            core.poke();
        }
    }

    function test_singleCatchUpEqualsHourlyPokes() public {
        vm.warp(GENESIS);
        AccountingHarness hourly = new AccountingHarness(GENESIS);
        AccountingHarness lazy = new AccountingHarness(GENESIS);
        hourly.setPosition(address(0xA11CE), 1_000, type(uint64).max);
        lazy.setPosition(address(0xA11CE), 1_000, type(uint64).max);
        for (uint256 h = 1; h <= 500; ++h) {
            vm.warp(GENESIS + h * 1 hours);
            hourly.poke();
        }
        while (!lazy.poke()) {}
        assertEq(lazy.reserve(), hourly.reserve());
        assertEq(lazy.reserve(), _row(500, 1), "matches vector after 500 hours");
        assertEq(lazy.pendingOf(address(0xA11CE)), hourly.pendingOf(address(0xA11CE)));
    }
}
