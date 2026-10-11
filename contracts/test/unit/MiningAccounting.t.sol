// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MiningAccounting} from "../../src/MiningAccounting.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {AccountingHarness} from "../utils/AccountingHarness.sol";

contract MiningAccountingTest is Test {
    AccountingHarness internal core;
    uint64 internal constant GENESIS = 1_800_000_000 - (1_800_000_000 % 3600) + 3600;
    uint64 internal genesisHour;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint64 internal constant FAR = type(uint64).max; // never expires

    function setUp() public {
        vm.warp(GENESIS - 1 days); // pre-fill window
        core = new AccountingHarness(GENESIS);
        genesisHour = GENESIS / 3600;
    }

    function _warpTo(uint256 ts) internal {
        vm.warp(ts);
    }

    /// Long gaps need several pokes (MAX_HOURS_PER_POKE); actions require full catch-up.
    function _catchUp() internal {
        while (!core.poke()) {}
    }

    function _now() internal view returns (uint256) {
        return vm.getBlockTimestamp();
    }

    // ------------------------------------------------------------- init

    function test_init() public view {
        assertEq(core.reserve(), EmissionMath.CAP);
        assertEq(core.hourEmission(), EmissionMath.hourlyEmission(EmissionMath.CAP));
        assertEq(core.currentHour(), genesisHour);
        assertEq(core.lastUpdate(), GENESIS);
    }

    function test_init_revertsWhenNotHourAligned() public {
        vm.expectRevert(MiningAccounting.GenesisNotHourAligned.selector);
        new AccountingHarness(GENESIS + 1);
    }

    // ------------------------------------------------------------- emission

    function test_nothingEmittedBeforeGenesis() public {
        core.setPosition(alice, 100, FAR);
        _warpTo(GENESIS - 1);
        core.poke();
        assertEq(core.pendingOf(alice), 0);
        assertEq(core.reserve(), EmissionMath.CAP);
    }

    function test_soleMinerGetsNinetyPercentOfFullHour() public {
        core.setPosition(alice, 100, FAR);
        _warpTo(GENESIS + 1 hours);
        core.poke();
        uint256 e = EmissionMath.hourlyEmission(EmissionMath.CAP);
        (uint256 miners, uint256 dev, uint256 treasury) = EmissionMath.split(e);
        assertApproxEqAbs(core.pendingOf(alice), miners, 1, "alice ~ miners share");
        assertLe(core.pendingOf(alice), miners);
        assertEq(core.devPending(), dev);
        assertEq(core.treasuryPending(), treasury);
        assertEq(core.reserve(), EmissionMath.CAP - e);
    }

    function test_equalDpSplitsEqually() public {
        core.setPosition(alice, 300, FAR);
        core.setPosition(bob, 300, FAR);
        _warpTo(GENESIS + 5 hours + 1234);
        assertEq(core.pendingOf(alice), core.pendingOf(bob));
    }

    function test_proRataByDp() public {
        core.setPosition(alice, 100, FAR);
        core.setPosition(bob, 300, FAR);
        _warpTo(GENESIS + 10 hours);
        core.poke();
        assertApproxEqAbs(core.pendingOf(bob), 3 * core.pendingOf(alice), 3);
    }

    function test_noMinersMeansReserveKeepsEmission() public {
        _warpTo(GENESIS + 3 hours);
        core.poke();
        assertEq(core.reserve(), EmissionMath.CAP);
        assertEq(core.minersDistributed(), 0);
        assertEq(core.devPending(), 0);
    }

    function test_partialHourSegmentsNeverExceedHourEmission() public {
        core.setPosition(alice, 7, FAR);
        uint256 e = core.hourEmission();
        for (uint256 i = 1; i <= 7; ++i) {
            _warpTo(GENESIS + i * 500); // 7 pokes inside the first hour (3500 s)
            core.poke();
        }
        uint256 distributed = EmissionMath.CAP - core.reserve();
        assertLe(distributed, (e * 3500) / 3600);
    }

    function test_pathIndependence_onePokeVsHourly() public {
        AccountingHarness other = new AccountingHarness(GENESIS);
        core.setPosition(alice, 50, FAR);
        other.setPosition(alice, 50, FAR);
        for (uint256 h = 1; h <= 48; ++h) {
            _warpTo(GENESIS + h * 1 hours);
            core.poke();
        }
        other.poke(); // a single call catches up 48 hours
        assertEq(core.reserve(), other.reserve());
        assertEq(core.pendingOf(alice), other.pendingOf(alice));
        assertEq(core.devPending(), other.devPending());
    }

    // ------------------------------------------------------------- expiry

    function test_expiredPositionStopsAtBoundary() public {
        core.setPosition(alice, 100, genesisHour + 3); // fuel for 3 hours
        core.setPosition(bob, 100, FAR);
        _warpTo(GENESIS + 3 hours);
        core.poke();
        uint256 aliceAt3 = core.pendingOf(alice);
        assertEq(core.accAtHour(genesisHour + 3) * 100 / core.PREC(), aliceAt3, "boundary snapshot");
        assertEq(core.activeDp(), 100, "alice left at the boundary");
        _warpTo(GENESIS + 10 hours);
        core.poke();
        assertEq(core.pendingOf(alice), aliceAt3, "no accrual after expiry");
        assertGt(core.pendingOf(bob), aliceAt3);
    }

    function test_expiredPositionSettlesExactlyOnce() public {
        core.setPosition(alice, 100, genesisHour + 2);
        _warpTo(GENESIS + 6 hours);
        core.settle(alice);
        uint256 first = core.positionOf(alice).unrefined;
        core.settle(alice);
        assertEq(core.positionOf(alice).unrefined, first);
        assertGt(first, 0);
    }

    function test_reactivationAfterExpiry() public {
        core.setPosition(alice, 100, genesisHour + 1);
        core.setPosition(bob, 100, FAR);
        _warpTo(GENESIS + 5 hours);
        uint256 before = core.pendingOf(alice);
        core.setPosition(alice, 100, genesisHour + 10); // refuel
        assertEq(core.activeDp(), 200);
        _warpTo(GENESIS + 6 hours);
        assertGt(core.pendingOf(alice), before);
    }

    function test_inactiveFromStart() public {
        _warpTo(GENESIS + 2 hours);
        core.setPosition(alice, 100, genesisHour + 1); // expiry already in the past
        assertEq(core.activeDp(), 0);
        _warpTo(GENESIS + 5 hours);
        assertEq(core.pendingOf(alice), 0);
    }

    function test_changeDpMidHour() public {
        core.setPosition(alice, 100, FAR);
        core.setPosition(bob, 100, FAR);
        _warpTo(GENESIS + 30 minutes);
        core.setPosition(alice, 300, FAR);
        assertEq(core.activeDp(), 400);
        _warpTo(GENESIS + 1 hours);
        core.poke();
        // First 30 min split 1:1, next 30 min split 3:1.
        assertGt(core.pendingOf(alice), core.pendingOf(bob));
        assertEq(core.dpEndingAt(FAR), 400);
    }

    function test_removePosition() public {
        core.setPosition(alice, 100, genesisHour + 10);
        _warpTo(GENESIS + 1 hours);
        core.setPosition(alice, 0, 0);
        assertEq(core.activeDp(), 0);
        assertEq(core.dpEndingAt(genesisHour + 10), 0);
        uint256 credited = core.positionOf(alice).unrefined;
        _warpTo(GENESIS + 4 hours);
        assertEq(core.pendingOf(alice), credited);
    }

    // ------------------------------------------------------------- liveness

    function test_longIdleNeedsMultiplePokes() public {
        core.setPosition(alice, 100, FAR);
        _warpTo(GENESIS + 400 hours);
        vm.expectRevert(MiningAccounting.CheckpointBehind.selector);
        core.setPosition(bob, 1, FAR);
        assertFalse(core.poke()); // 168 h
        assertFalse(core.poke()); // 336 h
        assertTrue(core.poke()); // 400 h
        core.setPosition(bob, 1, FAR);
        assertEq(core.currentHour(), genesisHour + 400);
    }

    function test_viewMatchesSettle() public {
        core.setPosition(alice, 123, genesisHour + 30);
        core.setPosition(bob, 77, FAR);
        _warpTo(GENESIS + 41 hours + 17 minutes);
        uint256 viewAlice = core.pendingOf(alice);
        uint256 viewBob = core.pendingOf(bob);
        core.settle(alice);
        core.settle(bob);
        assertEq(core.positionOf(alice).unrefined, viewAlice);
        assertEq(core.positionOf(bob).unrefined, viewBob);
    }

    /// Gas of catching up a full week in one call (reported, and bounded well below block limits).
    function test_gas_pokeOneWeek() public {
        core.setPosition(alice, 100, FAR);
        _warpTo(GENESIS + 168 hours);
        uint256 g = gasleft();
        core.poke();
        uint256 used = g - gasleft();
        emit log_named_uint("gas for 168-hour poke", used);
        assertLt(used, 10_000_000);
    }

    // ------------------------------------------------------------- fuzz

    function testFuzz_conservation(uint128 dpA, uint128 dpB, uint32 t1, uint32 t2) public {
        dpA = uint128(bound(dpA, 1, 1e12));
        dpB = uint128(bound(dpB, 1, 1e12));
        core.setPosition(alice, dpA, FAR);
        _warpTo(GENESIS + bound(t1, 1, 30 days));
        _catchUp();
        core.setPosition(bob, dpB, FAR);
        _warpTo(_now() + bound(t2, 1, 30 days));
        _catchUp();
        uint256 distributed = EmissionMath.CAP - core.reserve();
        assertEq(distributed, core.minersDistributed() + core.devPending() + core.treasuryPending());
        assertLe(core.pendingOf(alice) + core.pendingOf(bob), core.minersDistributed());
    }
}
