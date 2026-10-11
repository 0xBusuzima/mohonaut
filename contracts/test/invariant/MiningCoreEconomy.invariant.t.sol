// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {SiteMath} from "../../src/lib/SiteMath.sol";
import {MockAggregator} from "../mocks/MockAggregator.sol";
import {RevenueRouter} from "../../src/RevenueRouter.sol";

/// @notice Random fuel (with referrers), rig purchases, switches, scraps, site upgrades, refines,
///         finalizations, dev/treasury withdrawals and time jumps.
/// @dev forge-std's bound() logs through the console, which would consume a pending vm.prank:
///      every bound() runs before the prank.
contract EconomyHandler is Test {
    MiningCore public immutable core;
    MohnToken public immutable mohn;
    MockAggregator public immutable feed;
    address public constant DEV = address(0xDE7);
    address public constant TREASURY = address(0x7EA5);
    address[] public actors;

    uint256 public s1Violations; // a spend whose burn/reserve split is not exactly 80/20
    uint256 public b1Violations; // more than the breaker limit minted within 60 minutes
    uint256 public spends;
    uint256[] internal mintTimes;
    uint256[] internal mintAmounts;

    constructor(MiningCore core_, MohnToken mohn_, MockAggregator feed_) {
        core = core_;
        mohn = mohn_;
        feed = feed_;
        for (uint256 i = 0; i < 4; ++i) {
            address a = makeAddr(string.concat("driller", vm.toString(i)));
            actors.push(a);
            vm.deal(a, 1_000 ether);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _catchUp() internal {
        while (!core.poke()) {}
    }

    /// Records mints for the B1 check: nothing above the limit within any 60 minutes.
    function _recordMint(uint256 supplyBefore) internal {
        uint256 supply = mohn.totalSupply();
        if (supply <= supplyBefore) return;
        mintTimes.push(block.timestamp);
        mintAmounts.push(supply - supplyBefore);
        uint256 windowTotal = 0;
        for (uint256 i = mintTimes.length; i > 0; --i) {
            if (mintTimes[i - 1] + 60 minutes <= block.timestamp) break;
            windowTotal += mintAmounts[i - 1];
        }
        if (windowTotal > core.MINT_BREAKER_LIMIT()) ++b1Violations;
    }

    function buyFuel(uint256 actorSeed, uint256 weiAmount, uint256 refSeed) external {
        feed.set(2500e8, block.timestamp, block.timestamp);
        _catchUp();
        uint256 value = bound(weiAmount, 1e12, 0.05 ether);
        vm.prank(_actor(actorSeed));
        try core.buyFuel{value: value}(_actor(refSeed)) {} catch {}
    }

    /// Runs `action` as `who` and checks S1 on the MOHN it spent.
    function _spend(address who, bytes memory action) internal {
        uint256 spentBefore = core.unrefinedSpent();
        uint256 burnedBefore = core.burnedForever();
        uint256 reserveBefore = core.reserve();
        vm.prank(who);
        (bool ok,) = address(core).call(action);
        if (!ok) return;
        uint256 spent = core.unrefinedSpent() - spentBefore;
        uint256 toReserve = (spent * 2000) / 10_000;
        if (
            core.burnedForever() - burnedBefore != spent - toReserve
                || core.reserve() - reserveBefore != toReserve
        ) ++s1Violations;
        if (spent != 0) ++spends;
    }

    function buyMachines(uint256 actorSeed, uint256 typeSeed, uint32 qty) external {
        _catchUp();
        uint256 typeId = 1 + (typeSeed % 5);
        qty = uint32(bound(qty, 1, 4));
        _spend(
            _actor(actorSeed),
            abi.encodeCall(MiningCore.buyMachines, (typeId, qty, type(uint256).max, false))
        );
    }

    function upgradeSite(uint256 actorSeed) external {
        _catchUp();
        _spend(
            _actor(actorSeed), abi.encodeCall(MiningCore.upgradeSite, (type(uint256).max, false))
        );
    }

    function setActiveRigs(uint256 actorSeed, uint256 typeSeed, uint32 active) external {
        _catchUp();
        address who = _actor(actorSeed);
        uint256 typeId = typeSeed % 6;
        active = uint32(bound(active, 0, core.rigsOf(who, typeId).owned));
        vm.prank(who);
        try core.setActiveRigs(typeId, active) {} catch {}
    }

    function scrapMachines(uint256 actorSeed, uint256 typeSeed, uint32 qty) external {
        _catchUp();
        address who = _actor(actorSeed);
        uint256 typeId = typeSeed % 6;
        uint32 owned = core.rigsOf(who, typeId).owned;
        if (owned == 0) return;
        qty = uint32(bound(qty, 1, owned));
        vm.prank(who);
        try core.scrapMachines(typeId, qty) {} catch {}
    }

    function refine(uint256 actorSeed, uint256 amount, bool fast) external {
        _catchUp();
        address who = _actor(actorSeed);
        uint256 pending = core.pendingOf(who);
        if (pending == 0) return;
        amount = bound(amount, 1, pending);
        uint256 supplyBefore = mohn.totalSupply();
        vm.prank(who);
        try core.refine(amount, fast) {} catch {}
        _recordMint(supplyBefore);
    }

    function finalizeRefine(uint256 ownerSeed, uint256 idSeed) external {
        _catchUp();
        address owner = ownerSeed % 6 == 4 ? DEV : ownerSeed % 6 == 5 ? TREASURY : _actor(ownerSeed);
        uint256 count = core.refineRequestCount(owner);
        if (count == 0) return;
        uint256 supplyBefore = mohn.totalSupply();
        try core.finalizeRefine(owner, idSeed % count) {} catch {}
        _recordMint(supplyBefore);
    }

    function withdrawShare(bool dev, uint256 amount) external {
        _catchUp();
        uint256 pending = dev ? core.devPending() : core.treasuryPending();
        if (pending == 0) return;
        amount = bound(amount, 1, pending);
        vm.prank(dev ? DEV : TREASURY);
        if (dev) {
            try core.withdrawDevShare(amount) {} catch {}
        } else {
            try core.withdrawTreasuryShare(amount) {} catch {}
        }
    }

    function warp(uint32 dt) external {
        vm.warp(block.timestamp + bound(dt, 1, 2 days));
    }
}

contract MiningCoreEconomyInvariantTest is Test {
    MiningCore internal core;
    MohnToken internal mohn;
    RevenueRouter internal router;
    EconomyHandler internal handler;
    MiningCore.MachineType[] internal catalogAtStart;

    function setUp() public {
        uint64 genesis = 1_800_003_600 - (1_800_003_600 % 3600);
        vm.warp(genesis - 12 hours);
        MockAggregator feed = new MockAggregator(8, 2500e8);
        router = new RevenueRouter(address(this));
        MiningCore impl = new MiningCore();
        address proxyAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        mohn = new MohnToken(proxyAddr);
        core = MiningCore(
            address(
                new ERC1967Proxy(
                    address(impl),
                    abi.encodeCall(
                        MiningCore.initialize,
                        (
                            address(this),
                            address(mohn),
                            address(router),
                            address(feed),
                            address(0),
                            genesis,
                            0.1e18,
                            address(0xDE7),
                            address(0x7EA5)
                        )
                    )
                )
            )
        );
        assertEq(address(core), proxyAddr, "token minter == proxy");
        router.grantRole(router.DEPOSITOR_ROLE(), address(core));
        for (uint256 i = 0; i < core.machineTypeCount(); ++i) {
            catalogAtStart.push(core.machineType(i));
        }
        handler = new EconomyHandler(core, mohn, feed);
        targetContract(address(handler));
    }

    /// M1: pads and fuel line respected; site totals equal the sum over rig types.
    function invariant_padsCapacityAndTotals() public view {
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
                assertLe(r.active, r.owned, "active <= owned");
                owned += r.owned;
                dp += uint256(m.dp) * r.active;
                burn += uint256(m.burn) * r.active;
            }
            assertEq(s.rigs, owned, "pad count");
            assertLe(owned, SiteMath.slots(s.level), "pads");
            assertLe(s.burn, SiteMath.fuelLineCapacity(s.level), "fuel line");
            assertEq(s.dp, dp, "site DP");
            assertEq(s.burn, burn, "site burn");
            assertEq(core.positionOf(a).dp, s.dp, "accounting DP");
        }
    }

    /// R1: the router's ETH balance equals its three buckets.
    function invariant_routerBuckets() public view {
        assertEq(
            address(router).balance,
            router.buybackBalance() + router.polBalance() + router.opsBalance()
        );
    }

    /// M2: existing machine types never change.
    function invariant_catalogImmutable() public view {
        assertEq(core.machineTypeCount(), catalogAtStart.length);
        for (uint256 i = 0; i < catalogAtStart.length; ++i) {
            MiningCore.MachineType memory m = core.machineType(i);
            assertEq(m.dp, catalogAtStart[i].dp);
            assertEq(m.burn, catalogAtStart[i].burn);
            assertEq(m.premiumBps, catalogAtStart[i].premiumBps);
            assertEq(m.minLevel, catalogAtStart[i].minLevel);
            assertEq(m.generation, catalogAtStart[i].generation);
        }
    }

    /// S1: every MOHN spend is split exactly 80 % burned / 20 % reserve (floor to the reserve).
    function invariant_spendSplit() public view {
        assertEq(handler.s1Violations(), 0);
    }

    /// B1: never more than the breaker limit minted within 60 minutes.
    function invariant_hourlyMintBreaker() public view {
        assertEq(handler.b1Violations(), 0);
    }

    /// E2 over every flow: reserve + miners' outstanding credit + dev + treasury + burned + queued
    /// + supply == CAP.
    function invariant_supplyConservation() public view {
        assertEq(
            core.reserve() + core.minersDistributed() + core.referralPaid() - core.unrefinedSpent()
                - core.unrefinedRefined() + core.devPending() + core.treasuryPending()
                + core.burnedForever() + core.refineQueued() + mohn.totalSupply(),
            EmissionMath.CAP
        );
    }

    /// E1: what accounts can still refine or spend never exceeds what they were given minus what
    /// they used (plus, before a checkpoint, the not-yet-checkpointed emission).
    function invariant_claimsBoundedByDistribution() public view {
        uint256 sum;
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            sum += core.pendingOf(handler.actors(i));
        }
        uint256 bound_ = core.minersDistributed() + core.referralPaid() - core.unrefinedSpent()
            - core.unrefinedRefined();
        if (core.lastUpdate() != vm.getBlockTimestamp()) bound_ += core.reserve();
        assertLe(sum, bound_);
    }

    /// R2: referral credit is at most 3 % of the miners' share (so at most 2.7 % of emission,
    /// below the treasury's 5 %), and it is taken from the treasury share, never minted anew
    /// (the latter is part of E2).
    function invariant_referralBounded() public view {
        assertLe(core.referralPaid() * 10_000, core.minersDistributed() * 300);
    }

    /// The queue total equals the open requests of every owner.
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

    /// E3: active DP equals the DP of fuelled positions.
    function invariant_activeDpMatchesPositions() public view {
        uint256 sum;
        uint64 hour = core.currentHour();
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            address a = handler.actors(i);
            if (core.positionOf(a).expiryHour > hour) sum += core.positionOf(a).dp;
        }
        assertEq(core.activeDp(), sum);
    }

    /// Scrapping removes rigs but not sales, so sold >= DP still owned.
    function invariant_soldCoversOwnedDp() public view {
        uint256 owned;
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            address a = handler.actors(i);
            for (uint256 t = 1; t < core.machineTypeCount(); ++t) {
                owned += uint256(core.machineType(t).dp) * core.rigsOf(a, t).owned;
            }
        }
        assertGe(core.vrgdaSold(), owned);
    }

    /// The handler's spend, refine and referral paths are live (not vacuous).
    function test_handlerExercisesEveryFlow() public {
        handler.warp(2 days); // into genesis
        handler.warp(2 days); // past Market Open: full-size tanks, refinery open
        handler.buyFuel(0, 0.01 ether, 0);
        handler.buyFuel(1, 0.01 ether, 0); // driller1 invited by driller0
        handler.warp(3 hours);
        handler.buyMachines(0, 0, 2);
        handler.upgradeSite(0);
        assertEq(handler.spends(), 2);
        assertEq(core.vrgdaSold(), 100);
        assertEq(core.siteOf(handler.actors(0)).level, 2);

        handler.refine(1, 1e18, true);
        assertGt(mohn.totalSupply(), 0, "fast refine minted");
        assertGt(core.referralPaid(), 0, "referrer credited");
        handler.refine(1, 1e18, false);
        handler.withdrawShare(true, 1e18);
        assertEq(core.refineRequestCount(handler.DEV()), 1);
        handler.warp(2 days);
        handler.warp(1 days);
        handler.finalizeRefine(1, 0);
        handler.finalizeRefine(4, 0);
        assertEq(core.refineQueued(), 0, "both queues finalized");
        assertEq(handler.s1Violations(), 0);
        assertEq(handler.b1Violations(), 0);
    }
}
