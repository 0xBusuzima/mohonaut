// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {console2} from "forge-std/console2.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {SiteMath} from "../../src/lib/SiteMath.sol";
import {AccountantBase} from "./AccountantBase.sol";
import {AccountantHandler} from "./AccountantHandler.sol";

/// @notice Audit (ACCOUNTANT): the proposed invariants (ACCOUNTANT.md S5) over a handler that also
///         drives wallet payments, holder burns, transfers, dev/treasury withdrawals, every
///         parameter, the router split, pauses, oracle moves and new generations.
/// forge-config: default.invariant.runs = 256
/// forge-config: default.invariant.depth = 64
contract AccountantInvariantTest is AccountantBase {
    AccountantHandler internal handler;
    uint256 internal constant HOUR = 1 hours;
    /// Rounding dust allowed between distributed and assignable miner credit (wei).
    uint256 internal constant LEAK_DUST = 1e6;

    function setUp() public {
        _deploy();
        handler = new AccountantHandler(core, mohn, router, feed);
        core.grantRole(core.DEFAULT_ADMIN_ROLE(), address(handler));
        core.grantRole(core.GUARDIAN_ROLE(), address(handler));
        core.grantRole(core.CATALOG_ROLE(), address(handler));
        router.grantRole(router.DEFAULT_ADMIN_ROLE(), address(handler));
        targetContract(address(handler));
        bytes4[] memory s = new bytes4[](20);
        s[0] = handler.buyFuel.selector;
        s[1] = handler.buyMachines.selector;
        s[2] = handler.upgradeSite.selector;
        s[3] = handler.setActiveRigs.selector;
        s[4] = handler.scrapMachines.selector;
        s[5] = handler.refine.selector;
        s[6] = handler.finalizeRefine.selector;
        s[7] = handler.withdrawShare.selector;
        s[8] = handler.burnTokens.selector;
        s[9] = handler.transferTokens.selector;
        s[10] = handler.poke.selector;
        s[11] = handler.warp.selector;
        s[12] = handler.setEthUsd.selector;
        s[13] = handler.setParam.selector;
        s[14] = handler.setSplit.selector;
        s[15] = handler.guardianPause.selector;
        s[16] = handler.extendPause.selector;
        s[17] = handler.unpause.selector;
        s[18] = handler.addGeneration.selector;
        s[19] = handler.warp.selector; // time weighted twice
        targetSelector(FuzzSelector({addr: address(handler), selectors: s}));
    }

    // ------------------------------------------------------------------ MOHN conservation

    /// NEW-1 (E2 restated): E2 plus MOHN burned by holders outside MiningCore.
    function invariant_E2_withExternalBurns() public view {
        assertEq(_e2Sum() + handler.ghostExternalBurned(), _cap(), "E2 + external burns");
    }

    /// NEW-2: every emitted wei is in exactly one of the three shares (90/5/5 books balance):
    /// emitted == miners + dev (pending + withdrawn) + treasury (pending + withdrawn + referral).
    function invariant_emissionSharesBalance() public view {
        assertEq(
            core.emitted(),
            core.minersDistributed() + core.devPending() + handler.ghostDevWithdrawn()
                + core.treasuryPending() + handler.ghostTreasuryWithdrawn() + core.referralPaid()
        );
    }

    /// NEW-3: reserve identity: reserve + emitted == CAP + everything recycled (20 % of spends,
    /// half the fast-refine fee). Guards the World Depth source (emitted) against drift.
    function invariant_reserveIdentity() public view {
        assertEq(core.reserve() + core.emitted(), _cap() + handler.ghostRecycled());
    }

    /// NEW-4: the referral earmark is always covered by the treasury share (else
    /// withdrawTreasuryShare underflows with a Panic instead of InsufficientShare).
    function invariant_referralEarmarkCovered() public view {
        assertLe(core.referralReserve(), core.treasuryPending());
        assertLe(core.referralPaid() * 10_000, core.minersDistributed() * 300, "R2");
    }

    /// NEW-5 (E1 tight + no leak): after catching up, the credit the accounts can use is at most
    /// what was distributed to them, and at least that minus rounding dust (nothing is lost).
    /// Runs on a state snapshot so the catch-up does not leak into the campaign.
    function invariant_E1_tightAndNoLeak() public {
        uint256 snap = vm.snapshotState();
        while (!core.poke()) {}
        uint256 sum;
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            sum += core.pendingOf(handler.actors(i));
        }
        uint256 assigned = core.minersDistributed() + core.referralPaid() - core.unrefinedSpent()
            - core.unrefinedRefined();
        vm.revertToState(snap);
        assertLe(sum, assigned, "E1 exact");
        assertLe(assigned - sum, LEAK_DUST, "miner credit leaked");
    }

    // ------------------------------------------------------------------ emission schedule

    /// NEW-13 (E5 / E6 stateful): at every HourClosed boundary E_h == floor(R_h * delta), what
    /// left the reserve during the hour (net of recycling) <= that hour's E_h, acc monotone.
    function invariant_E5_E6_hourly() public view {
        assertEq(handler.e5Violations(), 0, "E5");
        assertEq(handler.e6Violations(), 0, "E6");
        assertEq(handler.accMonotoneViolations(), 0, "acc monotone");
    }

    /// NEW-6 (E3 restated on the schedule): activeDp equals the DP still scheduled to end after
    /// the current hour (no stale dpEndingAt entry).
    function invariant_E3_scheduleMatchesActiveDp() public view {
        uint64 hour = core.currentHour();
        uint256 n = handler.actorCount();
        uint64[] memory seen = new uint64[](n);
        uint256 scheduled;
        uint256 positions;
        for (uint256 i = 0; i < n; ++i) {
            MiningCore.Position memory p = core.positionOf(handler.actors(i));
            if (p.expiryHour <= hour) continue;
            positions += p.dp;
            bool dup;
            for (uint256 j = 0; j < i; ++j) {
                if (seen[j] == p.expiryHour) dup = true;
            }
            seen[i] = p.expiryHour;
            if (!dup) scheduled += core.dpEndingAt(p.expiryHour);
        }
        assertEq(core.activeDp(), positions, "E3");
        assertEq(scheduled, positions, "schedule");
    }

    // ------------------------------------------------------------------ fuel

    /// NEW-7 (fuel solvency): an active position always has the litres for its remaining active
    /// time (1 wei tolerance for the rounded-up consumption), and the settled tank only drops.
    function invariant_fuelCoversActivePeriod() public view {
        uint64 hour = core.currentHour();
        uint256 genesis = core.genesisTime();
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            address a = handler.actors(i);
            MiningCore.Site memory s = core.siteOf(a);
            uint256 tank = core.tankOf(a);
            assertLe(tank, s.tank, "tankOf <= settled tank");
            uint64 expiry = core.positionOf(a).expiryHour;
            if (expiry <= hour) continue;
            uint256 start = block.timestamp > genesis ? block.timestamp : genesis;
            uint256 end = uint256(expiry) * HOUR;
            if (end <= start) continue;
            assertGe((tank + 1) * HOUR, s.burn * (end - start), "fuel solvency");
        }
    }

    // ------------------------------------------------------------------ rigs, VRGDA, catalog

    function invariant_M1_padsCapacityTotals() public view {
        uint256 types = core.machineTypeCount();
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            address a = handler.actors(i);
            MiningCore.Site memory s = core.siteOf(a);
            if (!s.registered) continue;
            uint256 owned;
            uint256 dp;
            uint256 burn;
            for (uint256 t = 0; t < types; ++t) {
                MiningCore.Rigs memory r = core.rigsOf(a, t);
                MiningCore.MachineType memory m = core.machineType(t);
                assertLe(r.active, r.owned);
                owned += r.owned;
                dp += uint256(m.dp) * r.active;
                burn += uint256(m.burn) * r.active;
            }
            assertEq(s.rigs, owned, "pads");
            assertLe(owned, SiteMath.slots(s.level));
            assertLe(s.burn, SiteMath.fuelLineCapacity(s.level));
            assertEq(s.dp, dp, "site DP");
            assertEq(s.burn, burn, "site burn");
            assertEq(core.positionOf(a).dp, s.dp, "accounting DP");
        }
    }

    /// NEW-8: the VRGDA sales counter equals the DP units actually sold; re-anchoring never moves
    /// the price; scrap credit is exactly 20 % of DP x unit price (0 for the Pilot Rig).
    function invariant_vrgdaAndScrap() public view {
        assertEq(core.vrgdaSold(), handler.ghostUnitsSold(), "sold counter");
        assertEq(handler.reanchorJumps(), 0, "re-anchor continuity");
        assertEq(handler.scrapCreditViolations(), 0, "scrap credit");
    }

    /// NEW-15 (M2 append-only): existing entries never change, generations added in the run too.
    function invariant_M2_catalogAppendOnly() public view {
        assertEq(core.machineTypeCount(), handler.catalogLength());
        for (uint256 i = 0; i < handler.catalogLength(); ++i) {
            MiningCore.MachineType memory m = core.machineType(i);
            MiningCore.MachineType memory g = handler.catalogAt(i);
            assertEq(m.dp, g.dp);
            assertEq(m.burn, g.burn);
            assertEq(m.premiumBps, g.premiumBps);
            assertEq(m.minLevel, g.minLevel);
            assertEq(m.generation, g.generation);
        }
    }

    // ------------------------------------------------------------------ spends, mints, queues

    /// NEW-14 (S1 incl. wallet): 80/20 over unrefined credit AND wallet MOHN burned via burnFrom.
    function invariant_S1_includingWallet() public view {
        assertEq(handler.s1Violations(), 0);
    }

    /// NEW-9 (B1 exact): the breaker's view of the window equals the ghost record of mints in
    /// the same 13 buckets (no lost or phantom bucket).
    function invariant_B1_windowExact() public view {
        uint256 used = handler.ghostWindowMinted();
        assertLe(used, core.MINT_BREAKER_LIMIT(), "B1");
        assertEq(core.mintRoom(), core.MINT_BREAKER_LIMIT() - used, "window bookkeeping");
        assertLe(mohn.mintedToday(), mohn.DAILY_MINT_CAP(), "T3");
    }

    function invariant_refineQueueTotal() public view {
        uint256 open;
        address[6] memory owners = [
            handler.actors(0),
            handler.actors(1),
            handler.actors(2),
            handler.actors(3),
            handler.DEV(),
            handler.TREASURY()
        ];
        for (uint256 o = 0; o < owners.length; ++o) {
            uint256 count = core.refineRequestCount(owners[o]);
            for (uint256 id = 0; id < count; ++id) {
                open += core.refineRequest(owners[o], id).amount;
            }
        }
        assertEq(core.refineQueued(), open);
    }

    /// NEW-10: Market Open inputs are frozen once genesis is over.
    function invariant_genesisInputsFrozen() public view {
        assertEq(handler.frozenViolations(), 0);
    }

    // ------------------------------------------------------------------ ETH

    /// NEW-11 (R1 with provenance): every fuel wei is in the router, split exactly by the bps in
    /// force at deposit time; nothing else entered (no pulls in this harness).
    function invariant_R1_ethProvenance() public view {
        assertEq(address(core).balance, 0, "core holds no ETH");
        assertEq(address(router).balance, handler.ghostFuelEth(), "router balance");
        assertEq(router.buybackBalance(), handler.ghostBuybackIn(), "buyback bucket");
        assertEq(router.polBalance(), handler.ghostPolIn(), "POL bucket");
        assertEq(
            router.buybackBalance() + router.polBalance() + router.opsBalance(),
            address(router).balance,
            "R1"
        );
        uint256 spent;
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            spent += core.siteOf(handler.actors(i)).fuelSpentWei;
        }
        assertEq(spent, handler.ghostFuelEth(), "fuelSpentWei");
    }

    // ------------------------------------------------------------------ governance

    /// NEW-12 (P2 as a model): pausedUntil follows Guardian pause (max with now + 72 h),
    /// extendPause (set) and unpause (0) exactly; Guardian pauses are >= 7 days apart.
    function invariant_P2_pauseModel() public view {
        assertEq(core.pausedUntil(), handler.ghostPausedUntil(), "pause model");
        assertEq(handler.guardianCooldownViolations(), 0, "guardian cooldown");
        assertLe(core.pausedUntil(), vm.getBlockTimestamp() + 31 days);
    }

    function invariant_P1_paramsBounded() public view {
        for (uint256 i = 0; i < 8; ++i) {
            MiningCore.Param p = MiningCore.Param(i);
            (uint256 min, uint256 max,,) = core.paramBounds(p);
            uint256 v = core.paramValue(p);
            assertGe(v, min);
            assertLe(v, max);
        }
    }

    /// Non-vacuity: one fixed sequence through every new flow, then all invariants.
    function test_sequenceHitsEveryNewFlow() public {
        handler.buyFuel(0, 0.0009 ether, 1); // pre-fill (genesis tank cap)
        handler.buyFuel(1, 0.0009 ether, 0); // acct1 invited by acct0
        handler.warp(2 days);
        handler.warp(2 days); // past Market Open
        handler.buyFuel(0, 0.01 ether, 1);
        handler.buyFuel(1, 0.01 ether, 0);
        handler.warp(5 hours);
        handler.refine(0, type(uint256).max, true); // all of acct0's credit to the wallet
        handler.buyMachines(0, 0, 2, true); // from the wallet
        handler.buyMachines(1, 0, 1, false); // from unrefined credit
        handler.upgradeSite(1, false);
        handler.scrapMachines(0, 1, 1);
        handler.transferTokens(0, 2, 1e18);
        handler.burnTokens(2, 1e17);
        handler.refine(1, 1e18, false);
        handler.withdrawShare(true, 1e18);
        handler.withdrawShare(false, 1e18);
        handler.setParam(1, 2500e18); // VrgdaR within the 25 % step
        handler.setSplit(4000, 3000);
        handler.buyFuel(1, 0.001 ether, 0);
        handler.guardianPause();
        handler.extendPause(uint64(block.timestamp + 1 days));
        handler.unpause();
        handler.warp(2 days);
        handler.warp(2 days);
        handler.finalizeRefine(1, 0);
        handler.finalizeRefine(4, 0);
        handler.poke();
        assertGt(handler.hits("walletPay"), 0, "wallet path");
        assertGt(handler.hits("holderBurn"), 0, "holder burn");
        assertGt(handler.hits("withdrawTreasury"), 0, "treasury");
        assertGt(handler.hits("finalize"), 0, "finalize");
        assertGt(handler.hits("setSplit"), 0, "split");
        assertGt(handler.hits("extendPause"), 0, "extend");
        invariant_E2_withExternalBurns();
        invariant_emissionSharesBalance();
        invariant_reserveIdentity();
        invariant_referralEarmarkCovered();
        invariant_E1_tightAndNoLeak();
        invariant_E5_E6_hourly();
        invariant_E3_scheduleMatchesActiveDp();
        invariant_fuelCoversActivePeriod();
        invariant_M1_padsCapacityTotals();
        invariant_vrgdaAndScrap();
        invariant_S1_includingWallet();
        invariant_B1_windowExact();
        invariant_refineQueueTotal();
        invariant_R1_ethProvenance();
        invariant_P2_pauseModel();
    }

    /// Non-vacuity: a deterministic pseudo-random walk; prints how often each flow succeeded.
    function test_randomWalkHitsFlows() public {
        uint256 seed = 42;
        for (uint256 i = 0; i < 600; ++i) {
            seed = uint256(keccak256(abi.encode(seed)));
            uint256 a = seed >> 8;
            uint256 b = seed >> 72;
            uint256 c = seed >> 136;
            uint256 op = seed % 16;
            if (op == 0) handler.buyFuel(a, b % 0.05 ether, c);
            else if (op == 1) handler.buyMachines(a, b, uint32(c), c % 2 == 0);
            else if (op == 2) handler.upgradeSite(a, b % 2 == 0);
            else if (op == 3) handler.setActiveRigs(a, b, uint32(c));
            else if (op == 4) handler.scrapMachines(a, b, uint32(c));
            else if (op == 5) handler.refine(a, b, c % 2 == 0);
            else if (op == 6) handler.finalizeRefine(a, b);
            else if (op == 7) handler.withdrawShare(a % 2 == 0, b);
            else if (op == 8) handler.burnTokens(a, b);
            else if (op == 9) handler.transferTokens(a, b, c);
            else if (op == 10) handler.setParam(uint8(a), b);
            else if (op == 11 && a % 4 == 0) handler.guardianPause();
            else if (op == 12 && a % 8 == 0) handler.unpause();
            else if (op == 13 && a % 4 == 0) handler.addGeneration(uint32(b));
            else handler.warp(uint32(a % 1 days));
        }
        string[15] memory tags = [
            "buyFuel",
            "buyMachines",
            "walletPay",
            "upgradeSite",
            "setActiveRigs",
            "scrap",
            "refineFast",
            "refineQueued",
            "finalize",
            "withdrawDev",
            "withdrawTreasury",
            "holderBurn",
            "setParam",
            "pause",
            "addGeneration"
        ];
        for (uint256 i = 0; i < tags.length; ++i) {
            console2.log(tags[i], handler.hits(bytes32(bytes(tags[i]))));
        }
        console2.log("referralPaid", core.referralPaid());
        console2.log("emitted", core.emitted());
        invariant_E2_withExternalBurns();
        invariant_emissionSharesBalance();
        invariant_reserveIdentity();
        invariant_E1_tightAndNoLeak();
        invariant_E5_E6_hourly();
        invariant_fuelCoversActivePeriod();
        invariant_B1_windowExact();
        invariant_S1_includingWallet();
    }
}
