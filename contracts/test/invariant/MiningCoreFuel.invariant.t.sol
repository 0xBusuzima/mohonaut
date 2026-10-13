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

contract FuelHandler is Test {
    MiningCore public immutable core;
    MockAggregator public immutable feed;
    address[] public actors;
    uint256 public ghostEthIn;
    /// NEW-25b: purchases that left a tank above the cap in force at that moment.
    uint256 public tankCapViolations;
    uint256 public tankCapChanges;

    constructor(MiningCore core_, MockAggregator feed_) {
        core = core_;
        feed = feed_;
        for (uint256 i = 0; i < 5; ++i) {
            address a = makeAddr(string.concat("driller", vm.toString(i)));
            actors.push(a);
            vm.deal(a, 1_000 ether);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function buyFuel(uint256 actorSeed, uint256 weiAmount, uint256 refSeed) external {
        address a = actors[actorSeed % actors.length];
        weiAmount = bound(weiAmount, 1, 0.2 ether);
        feed.set(2500e8, block.timestamp, block.timestamp);
        while (!core.poke()) {}
        vm.prank(a);
        try core.buyFuel{value: weiAmount}(actors[refSeed % actors.length]) {
            ghostEthIn += weiAmount;
            MiningCore.Site memory s = core.siteOf(a);
            if (s.tank > SiteMath.fuelLineCapacity(s.level) * core.maxTankHours()) {
                ++tankCapViolations;
            }
        } catch {}
    }

    /// Timelock lowers or raises the tank cap (168-2,160 h, once per 7 days). The cap applies
    /// to new purchases only; fuel already bought stays (AI review ACC-6).
    function setMaxTankHours(uint256 hoursSeed) external {
        uint256 value = bound(hoursSeed, 168, 2160);
        try core.setParam(MiningCore.Param.MaxTankHours, value) {
            ++tankCapChanges;
        } catch {}
    }

    function warp(uint32 dt) external {
        vm.warp(block.timestamp + bound(dt, 1, 3 days));
    }

    function poke() external {
        core.poke();
    }
}

contract MiningCoreFuelInvariantTest is Test {
    MiningCore internal core;
    MockRouter internal router;
    FuelHandler internal handler;

    function setUp() public {
        uint64 genesis = 1_800_003_600 - (1_800_003_600 % 3600);
        vm.warp(genesis - 12 hours);
        MockAggregator feed = new MockAggregator(8, 2500e8);
        router = new MockRouter();
        MiningCore impl = new MiningCore();
        address proxyAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        MohnToken mohn = new MohnToken(proxyAddr);
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
        handler = new FuelHandler(core, feed);
        core.grantRole(core.DEFAULT_ADMIN_ROLE(), address(handler));
        targetContract(address(handler));
    }

    /// Every wei of fuel revenue reaches the router, and nothing else does.
    function invariant_routerReceivesAllFuelEth() public view {
        assertEq(router.totalDeposited(), handler.ghostEthIn());
        assertEq(address(core).balance, 0, "core never holds ETH");
        uint256 spent;
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            spent += core.siteOf(handler.actors(i)).fuelSpentWei;
        }
        assertEq(spent, handler.ghostEthIn());
    }

    /// Active DP equals the DP of sites whose fuel expiry is after the current hour.
    function invariant_activeDpMatchesFuelledSites() public view {
        uint256 sum;
        uint64 hour = core.currentHour();
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            address a = handler.actors(i);
            if (core.positionOf(a).expiryHour > hour) sum += core.siteOf(a).dp;
        }
        assertEq(core.activeDp(), sum);
    }

    /// Supply conservation still holds with real fuel flows. Fuel bought with a referrer moves
    /// referral credit from the treasury share to the referrer (no spending or refining here).
    function invariant_supplyConservation() public view {
        assertEq(
            core.reserve() + core.minersDistributed() + core.referralPaid() + core.devPending()
                + core.treasuryPending(),
            EmissionMath.CAP
        );
    }

    /// NEW-25b (AI review ACC-6): right after every successful purchase the tank is within the cap
    /// in force at that moment (fuel line capacity x maxTankHours). The cap is not retroactive: a
    /// later, lower cap leaves fuel already bought in the tank, so "tank <= cap" at any time is
    /// not a property of the contract.
    function invariant_tankWithinCapAtPurchase() public view {
        assertEq(handler.tankCapViolations(), 0);
    }

    /// Non-vacuity: a purchase, a lower cap, and the tank above the new cap stays legal.
    function test_capChangeIsNotRetroactive() public {
        handler.warp(13 hours); // into genesis
        handler.warp(3 days); // past Market Open: no genesis tank limit
        handler.buyFuel(0, 0.15 ether, 1); // 3,750 L of the 4,320 L level-1 tank
        uint256 tank = core.siteOf(handler.actors(0)).tank;
        handler.setMaxTankHours(168);
        assertEq(handler.tankCapChanges(), 1);
        assertGt(tank, SiteMath.fuelLineCapacity(1) * core.maxTankHours(), "above the new cap");
        assertEq(handler.tankCapViolations(), 0);
    }
}
