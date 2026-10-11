// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {MiningAccounting} from "../../src/MiningAccounting.sol";
import {AccountingHarness} from "../utils/AccountingHarness.sol";

/// @notice Random positions, refuels, removals and time jumps (weighted toward hour boundaries).
contract AccountingHandler is Test {
    AccountingHarness public immutable core;
    address[] public actors;

    // Ghosts
    uint256 public maxHourDistributed; // largest amount distributed within one hour
    uint256 public lastHourReserveStart;
    uint64 public trackedHour;
    uint256 public inactiveGrowthViolations;

    constructor(AccountingHarness core_) {
        core = core_;
        for (uint256 i = 0; i < 6; ++i) {
            actors.push(makeAddr(string.concat("miner", vm.toString(i))));
        }
        trackedHour = core.currentHour();
        lastHourReserveStart = core.reserve();
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _catchUp() internal {
        while (!core.poke()) {}
        _trackHour();
    }

    function _trackHour() internal {
        uint64 h = core.currentHour();
        if (h != trackedHour) {
            trackedHour = h;
            lastHourReserveStart = core.reserve();
        } else {
            uint256 spent = lastHourReserveStart - core.reserve();
            if (spent > maxHourDistributed) maxHourDistributed = spent;
        }
    }

    function setPosition(uint256 actorSeed, uint128 dp, uint16 hoursAhead) external {
        _catchUp();
        address a = actors[actorSeed % actors.length];
        dp = uint128(bound(dp, 0, 1e15));
        uint64 expiry = core.currentHour() + uint64(bound(hoursAhead, 0, 72));
        core.setPosition(a, dp, expiry);
    }

    function warp(uint32 secondsForward, bool toBoundary) external {
        uint256 nowTs = vm.getBlockTimestamp();
        if (toBoundary) {
            vm.warp((nowTs / 1 hours + 1 + (secondsForward % 3)) * 1 hours);
        } else {
            vm.warp(nowTs + bound(secondsForward, 1, 2 days));
        }
        if (secondsForward % 2 == 0) _catchUp();
    }

    function pokeAndCheckInactive(uint256 actorSeed) external {
        address a = actors[actorSeed % actors.length];
        MiningAccounting.Position memory p = core.positionOf(a);
        bool inactive = p.expiryHour <= core.currentHour();
        uint256 before = core.pendingOf(a);
        _catchUp();
        if (inactive && core.pendingOf(a) != before) ++inactiveGrowthViolations;
    }
}

contract MiningAccountingInvariantTest is Test {
    AccountingHarness internal core;
    AccountingHandler internal handler;

    function setUp() public {
        uint64 genesis = 1_800_003_600 - (1_800_003_600 % 3600);
        vm.warp(genesis - 1 hours);
        core = new AccountingHarness(genesis);
        handler = new AccountingHandler(core);
        targetContract(address(handler));
    }

    /// E2 (no spending yet): reserve + everything distributed == CAP exactly.
    function invariant_supplyConservation() public view {
        assertEq(
            core.reserve() + core.minersDistributed() + core.devPending() + core.treasuryPending(),
            EmissionMath.CAP
        );
    }

    /// E1: what miners can claim never exceeds what was distributed to miners. When accounting
    /// is caught up the bound is exact; otherwise pendingOf() also previews the not-yet-checkpointed
    /// emission, which can at most be this hour's emission per elapsed hour (bounded by the reserve).
    function invariant_claimsBoundedByDistribution() public view {
        uint256 sum;
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            sum += core.pendingOf(handler.actors(i));
        }
        if (core.lastUpdate() == vm.getBlockTimestamp()) {
            assertLe(sum, core.minersDistributed());
        } else {
            assertLe(sum, core.minersDistributed() + core.reserve());
        }
    }

    /// E3: active DP equals the sum of DP of positions whose expiry is after the current hour.
    function invariant_activeDpMatchesPositions() public view {
        uint256 sum;
        uint64 hour = core.currentHour();
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            MiningAccounting.Position memory p = core.positionOf(handler.actors(i));
            if (p.expiryHour > hour) sum += p.dp;
        }
        assertEq(core.activeDp(), sum);
    }

    /// E4: an expired position never earns after its boundary.
    function invariant_expiredNeverEarns() public view {
        assertEq(handler.inactiveGrowthViolations(), 0);
    }

    /// E5: within a single hour, no more than that hour's emission leaves the reserve.
    function invariant_hourlyEmissionBound() public view {
        assertLe(handler.maxHourDistributed(), EmissionMath.hourlyEmission(EmissionMath.CAP));
    }
}
