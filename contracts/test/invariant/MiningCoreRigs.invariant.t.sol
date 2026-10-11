// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {SiteMath} from "../../src/lib/SiteMath.sol";
import {MockAggregator} from "../mocks/MockAggregator.sol";
import {MockRouter} from "../mocks/MockRouter.sol";

/// @notice Random fuel, rig purchases, switches, scraps, site upgrades and time jumps.
contract RigsHandler is Test {
    MiningCore public immutable core;
    MockAggregator public immutable feed;
    address[] public actors;

    uint256 public s1Violations; // a spend whose burn/reserve split is not exactly 80/20
    uint256 public spends;

    constructor(MiningCore core_, MockAggregator feed_) {
        core = core_;
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

    function buyFuel(uint256 actorSeed, uint256 weiAmount) external {
        feed.set(2500e8, block.timestamp, block.timestamp);
        _catchUp();
        // bound() logs through the console, which would consume a prank: compute it first.
        uint256 value = bound(weiAmount, 1e12, 0.05 ether);
        vm.prank(_actor(actorSeed));
        try core.buyFuel{value: value}(address(0)) {} catch {}
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

    function warp(uint32 dt) external {
        vm.warp(block.timestamp + bound(dt, 1, 2 days));
    }
}

contract MiningCoreRigsInvariantTest is Test {
    MiningCore internal core;
    MohnToken internal mohn;
    RigsHandler internal handler;
    MiningCore.MachineType[] internal catalogAtStart;

    function setUp() public {
        uint64 genesis = 1_800_003_600 - (1_800_003_600 % 3600);
        vm.warp(genesis - 12 hours);
        MockAggregator feed = new MockAggregator(8, 2500e8);
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
                            address(new MockRouter()),
                            address(feed),
                            address(0),
                            genesis,
                            0.1e18
                        )
                    )
                )
            )
        );
        for (uint256 i = 0; i < core.machineTypeCount(); ++i) {
            catalogAtStart.push(core.machineType(i));
        }
        handler = new RigsHandler(core, feed);
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

    /// E2 with spending: reserve + miners' unspent credit + dev + treasury + burned + supply = CAP.
    function invariant_supplyConservation() public view {
        assertEq(
            core.reserve() + core.minersDistributed() - core.unrefinedSpent() + core.devPending()
                + core.treasuryPending() + core.burnedForever() + mohn.totalSupply(),
            EmissionMath.CAP
        );
    }

    /// E1 with spending: what miners can still claim never exceeds what they were given minus
    /// what they spent (plus, before a checkpoint, the not-yet-checkpointed emission).
    function invariant_claimsBoundedBySpendableDistribution() public view {
        uint256 sum;
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            sum += core.pendingOf(handler.actors(i));
        }
        uint256 bound_ = core.minersDistributed() - core.unrefinedSpent();
        if (core.lastUpdate() != vm.getBlockTimestamp()) bound_ += core.reserve();
        assertLe(sum, bound_);
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

    /// The handler's spend path is live (not vacuous): a fixed sequence buys and upgrades.
    function test_handlerExercisesSpending() public {
        handler.warp(2 days); // into genesis
        handler.warp(2 days); // past Market Open: full-size tanks
        handler.buyFuel(0, 0.01 ether);
        handler.warp(3 hours);
        handler.buyMachines(0, 0, 2);
        handler.upgradeSite(0);
        assertEq(handler.spends(), 2);
        assertEq(core.vrgdaSold(), 100);
        assertEq(core.siteOf(handler.actors(0)).level, 2);
        assertEq(handler.s1Violations(), 0);
    }

    /// Sold units only grow with purchases; the VRGDA counter equals all DP ever bought.
    function invariant_soldMatchesBoughtDp() public view {
        uint256 bought;
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            address a = handler.actors(i);
            for (uint256 t = 1; t < core.machineTypeCount(); ++t) {
                bought += uint256(core.machineType(t).dp) * core.rigsOf(a, t).owned;
            }
        }
        // Scrapping removes rigs but not sales, so sold >= DP still owned.
        assertGe(core.vrgdaSold(), bought);
    }
}
