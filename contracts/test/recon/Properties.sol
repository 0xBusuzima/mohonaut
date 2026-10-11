// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MiningCore} from "../../src/MiningCore.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {SiteMath} from "../../src/lib/SiteMath.sol";
import {Setup} from "./Setup.sol";

/// @title Properties
/// @notice The docs/04 S2 invariant catalog as boolean properties shared by Medusa
///         (`invariant_*` property mode), Echidna (`check_all`, assertion mode) and Foundry
///         (test/recon/CryticToFoundry.t.sol). Ghost variables are kept by the target functions.
abstract contract Properties is Setup {
    uint256 internal s1Violations; // a spend not split exactly 80/20
    uint256 internal b1Violations; // > 150K minted within 60 minutes
    uint256 internal rateViolations; // a parameter changed twice within its period
    uint256[] internal mintTimes;
    uint256[] internal mintAmounts;
    mapping(uint256 param => uint256 timestamp) internal lastParamChange;
    uint256 internal lastGuardianPauseGhost;

    /// T1: supply never exceeds CAP.
    function invariant_T1_supplyBelowCap() public view returns (bool) {
        return mohn.totalSupply() <= EmissionMath.CAP;
    }

    /// E2: reserve + miners' outstanding credit + dev + treasury + burned + queued + supply = CAP.
    function invariant_E2_conservation() public view returns (bool) {
        return core.reserve() + core.minersDistributed() + core.referralPaid()
                - core.unrefinedSpent() - core.unrefinedRefined() + core.devPending()
                + core.treasuryPending() + core.burnedForever() + core.refineQueued()
                + mohn.totalSupply() == EmissionMath.CAP;
    }

    /// E1: what accounts can still use never exceeds what they were given minus what they used
    /// (plus, before a checkpoint, the not-yet-checkpointed emission).
    ///      pendingOf() replays every unprocessed hour (view-only loop); the keeper pokes hourly, so
    ///      the property is skipped while accounting is more than 168 hours behind.
    function invariant_E1_claimsBounded() public view returns (bool) {
        if (core.lastUpdate() + 168 hours < block.timestamp) return true;
        uint256 sum;
        for (uint256 i = 0; i < actors.length; ++i) {
            sum += core.pendingOf(address(actors[i]));
        }
        uint256 bound = core.minersDistributed() + core.referralPaid() - core.unrefinedSpent()
            - core.unrefinedRefined();
        if (core.lastUpdate() != block.timestamp) bound += core.reserve();
        return sum <= bound;
    }

    /// E3: active DP equals the DP of fuelled positions.
    function invariant_E3_activeDp() public view returns (bool) {
        uint256 sum;
        uint64 hour = core.currentHour();
        for (uint256 i = 0; i < actors.length; ++i) {
            MiningCore.Position memory p = core.positionOf(address(actors[i]));
            if (p.expiryHour > hour) sum += p.dp;
        }
        return core.activeDp() == sum;
    }

    /// M1: pads and fuel line respected; site totals equal the sum over rig types.
    function invariant_M1_padsAndCapacity() public view returns (bool) {
        uint256 types = core.machineTypeCount();
        for (uint256 i = 0; i < actors.length; ++i) {
            MiningCore.Site memory s = core.siteOf(address(actors[i]));
            if (!s.registered) continue;
            uint256 owned;
            uint256 dp;
            uint256 burn;
            for (uint256 t = 0; t < types; ++t) {
                MiningCore.Rigs memory r = core.rigsOf(address(actors[i]), t);
                MiningCore.MachineType memory m = core.machineType(t);
                if (r.active > r.owned) return false;
                owned += r.owned;
                dp += uint256(m.dp) * r.active;
                burn += uint256(m.burn) * r.active;
            }
            if (
                s.rigs != owned || owned > SiteMath.slots(s.level)
                    || s.burn > SiteMath.fuelLineCapacity(s.level) || s.dp != dp || s.burn != burn
            ) return false;
        }
        return true;
    }

    /// M2: existing machine types never change.
    function invariant_M2_catalogImmutable() public view returns (bool) {
        for (uint256 i = 0; i < catalogAtStart.length; ++i) {
            MiningCore.MachineType memory m = core.machineType(i);
            MiningCore.MachineType memory a = catalogAtStart[i];
            if (
                m.dp != a.dp || m.burn != a.burn || m.premiumBps != a.premiumBps
                    || m.minLevel != a.minLevel || m.generation != a.generation
            ) return false;
        }
        return true;
    }

    /// S1: every MOHN spend is split exactly 80 % burned / 20 % reserve.
    function invariant_S1_spendSplit() public view returns (bool) {
        return s1Violations == 0;
    }

    /// B1: never more than 150K minted within 60 minutes.
    function invariant_B1_hourlyMint() public view returns (bool) {
        return b1Violations == 0;
    }

    /// R1: the router's ETH balance equals its buckets.
    function invariant_R1_routerBuckets() public view returns (bool) {
        return address(router).balance
            == router.buybackBalance() + router.polBalance() + router.opsBalance();
    }

    /// R2: referral credit is at most 3 % of the miners' share.
    function invariant_R2_referralBounded() public view returns (bool) {
        return core.referralPaid() * 10_000 <= core.minersDistributed() * 300;
    }

    /// P1: every parameter within bounds, and never changed twice within its period.
    function invariant_P1_params() public view returns (bool) {
        for (uint256 i = 0; i < 8; ++i) {
            MiningCore.Param p = MiningCore.Param(i);
            (uint256 min, uint256 max,,) = core.paramBounds(p);
            uint256 v = core.paramValue(p);
            if (v < min || v > max) return false;
        }
        return rateViolations == 0;
    }

    /// P2: a Guardian pause never reaches beyond 72 hours after it started.
    function invariant_P2_pauseBounded() public view returns (bool) {
        return core.pausedUntil() <= lastGuardianPauseGhost + core.GUARDIAN_PAUSE();
    }

    /// Echidna (assertion mode) entry point: all properties at once.
    function check_all() public view {
        assert(invariant_T1_supplyBelowCap());
        assert(invariant_E2_conservation());
        assert(invariant_E1_claimsBounded());
        assert(invariant_E3_activeDp());
        assert(invariant_M1_padsAndCapacity());
        assert(invariant_M2_catalogImmutable());
        assert(invariant_S1_spendSplit());
        assert(invariant_B1_hourlyMint());
        assert(invariant_R1_routerBuckets());
        assert(invariant_R2_referralBounded());
        assert(invariant_P1_params());
        assert(invariant_P2_pauseBounded());
    }
}
