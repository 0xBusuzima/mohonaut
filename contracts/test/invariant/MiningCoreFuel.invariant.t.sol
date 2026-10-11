// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {MockAggregator} from "../mocks/MockAggregator.sol";
import {MockRouter} from "../mocks/MockRouter.sol";

contract FuelHandler is Test {
    MiningCore public immutable core;
    MockAggregator public immutable feed;
    address[] public actors;
    uint256 public ghostEthIn;

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
                            0.1e18
                        )
                    )
                )
            )
        );
        handler = new FuelHandler(core, feed);
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

    /// Supply conservation still holds with real fuel flows.
    function invariant_supplyConservation() public view {
        assertEq(
            core.reserve() + core.minersDistributed() + core.devPending() + core.treasuryPending(),
            EmissionMath.CAP
        );
    }

    /// No tank ever exceeds its capacity cap (4,320 litres at level 1).
    function invariant_tankWithinCapacity() public view {
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            assertLe(core.siteOf(handler.actors(i)).tank, 6e18 * core.MAX_TANK_HOURS());
        }
    }
}
