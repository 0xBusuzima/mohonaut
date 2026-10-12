// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {MockAggregator} from "../mocks/MockAggregator.sol";
import {MockRouter, ReenteringRouter} from "../mocks/MockRouter.sol";

contract MiningCoreFuelTest is Test {
    MiningCore internal core;
    MockAggregator internal ethUsd;
    MockRouter internal router;
    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal constant DEV = address(0xDE7);
    address internal constant TREASURY = address(0x7EA5);

    uint64 internal constant GENESIS = 1_800_003_600 - (1_800_003_600 % 3600);
    uint64 internal genesisHour = GENESIS / 3600;
    uint256 internal constant PRICE = 0.1e18; // $0.10 per litre
    int256 internal constant ETH_USD = 2500e8; // $2,500 with 8 decimals

    function setUp() public {
        vm.warp(GENESIS - 12 hours); // inside the 24 h pre-fill window
        ethUsd = new MockAggregator(8, ETH_USD);
        router = new MockRouter();
        core = _deploy(address(router), address(0));
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _deploy(address router_, address sequencer) internal returns (MiningCore) {
        MiningCore impl = new MiningCore();
        address proxyAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        MohnToken mohn = new MohnToken(proxyAddr);
        bytes memory init = abi.encodeCall(
            MiningCore.initialize,
            (
                admin,
                address(mohn),
                router_,
                address(ethUsd),
                sequencer,
                GENESIS,
                PRICE,
                DEV,
                TREASURY
            )
        );
        MiningCore c = MiningCore(address(new ERC1967Proxy(address(impl), init)));
        assertEq(address(c), proxyAddr, "token minter == proxy");
        return c;
    }

    /// Chainlink heartbeat is 24 h; after long warps the test must publish a fresh price.
    function _freshPrice() internal {
        ethUsd.set(ETH_USD, block.timestamp, block.timestamp);
    }

    function _litres(uint256 weiAmount) internal pure returns (uint256) {
        return (weiAmount * uint256(ETH_USD) * 1e10) / PRICE;
    }

    // ------------------------------------------------------------- registration

    function test_firstPurchaseRegistersWithPilotRig() public {
        vm.prank(alice);
        core.buyFuel{value: 0.0004 ether}(bob);
        MiningCore.Site memory s = core.siteOf(alice);
        assertTrue(s.registered);
        assertEq(s.level, 1);
        assertEq(s.referrer, bob);
        assertEq(s.dp, 10);
        assertEq(s.burn, 0.25e18);
        assertEq(s.tank, _litres(0.0004 ether));
        assertEq(core.activeDp(), 10);
        assertEq(router.totalDeposited(), 0.0004 ether);
    }

    function test_selfReferralIgnored_andReferrerSetOnce() public {
        vm.startPrank(alice);
        core.buyFuel{value: 0.0001 ether}(alice);
        assertEq(core.siteOf(alice).referrer, address(0));
        core.buyFuel{value: 0.0001 ether}(bob);
        assertEq(core.siteOf(alice).referrer, address(0), "set only on registration");
        vm.stopPrank();
    }

    function test_preFillNotOpen() public {
        vm.warp(GENESIS - 24 hours - 1);
        vm.prank(alice);
        vm.expectRevert(MiningCore.PreFillNotOpen.selector);
        core.buyFuel{value: 0.001 ether}(address(0));
    }

    function test_zeroValueReverts() public {
        vm.prank(alice);
        vm.expectRevert(MiningCore.ZeroValue.selector);
        core.buyFuel(address(0));
    }

    // ------------------------------------------------------------- pricing

    function test_quoteLitres() public view {
        // 1 ETH = $2,500 = 25,000 litres at $0.10
        assertEq(core.quoteLitres(1 ether), 25_000e18);
    }

    function test_feedWith18Decimals() public {
        ethUsd = new MockAggregator(18, 2500e18);
        MiningCore c = _deploy(address(router), address(0));
        assertEq(c.quoteLitres(1 ether), 25_000e18);
    }

    function test_feedWithMoreThan18Decimals() public {
        ethUsd = new MockAggregator(20, 2500e20);
        MiningCore c = _deploy(address(router), address(0));
        assertEq(c.quoteLitres(1 ether), 25_000e18);
    }

    // ------------------------------------------------------------- expiry and caps

    function test_expiryFromGenesis() public {
        // 24 litres at 0.25 l/h = 96 h of running, starting at genesis (no burn during pre-fill)
        uint256 weiFor24 = (24e18 * PRICE) / (uint256(ETH_USD) * 1e10);
        vm.prank(alice);
        core.buyFuel{value: weiFor24}(address(0));
        assertEq(core.positionOf(alice).expiryHour, genesisHour + 96);
    }

    function test_genesisTankCap() public {
        // Max during pre-fill: burn × (MarketOpen + 24 h − genesis) = 0.25 × 96 = 24 litres
        uint256 tooMuch = 0.001 ether; // 25 litres
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.TankCapExceeded.selector, 24e18));
        core.buyFuel{value: tooMuch}(address(0));
    }

    function test_capacityTankCapAfterMarketOpen() public {
        vm.warp(GENESIS + 72 hours);
        while (!core.poke()) {}
        _freshPrice();
        // capacity(L1) = 6 l/h × 720 h = 4,320 litres = 0.1728 ETH at $2,500
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.TankCapExceeded.selector, 4320e18));
        core.buyFuel{value: 0.1729 ether}(address(0));
        vm.prank(alice);
        core.buyFuel{value: 0.1728 ether}(address(0));
        assertEq(core.siteOf(alice).tank, 4320e18);
    }

    // ------------------------------------------------------------- consumption

    function test_fuelBurnsOnlyAfterGenesis() public {
        vm.prank(alice);
        core.buyFuel{value: 0.0004 ether}(address(0)); // 10 litres = 40 h
        vm.warp(GENESIS - 1);
        assertEq(core.tankOf(alice), 10e18, "no burn during pre-fill");
        vm.warp(GENESIS + 4 hours);
        assertEq(core.tankOf(alice), 9e18);
    }

    function test_burnStopsAtExpiryBoundary() public {
        vm.prank(alice);
        core.buyFuel{value: 0.0004 ether}(address(0)); // 10 litres = 40 h
        vm.warp(GENESIS + 100 hours);
        assertEq(core.tankOf(alice), 0);
        while (!core.poke()) {}
        assertEq(core.activeDp(), 0);
    }

    function test_refuelExtendsExpiry() public {
        vm.startPrank(alice);
        core.buyFuel{value: 0.0004 ether}(address(0)); // 40 h
        vm.warp(GENESIS + 10 hours);
        core.buyFuel{value: 0.0004 ether}(address(0)); // +40 h
        vm.stopPrank();
        assertEq(core.positionOf(alice).expiryHour, genesisHour + 80);
        assertEq(core.siteOf(alice).tank, 17.5e18);
    }

    function test_fractionalHourStaysInTank() public {
        vm.warp(GENESIS + 72 hours);
        while (!core.poke()) {}
        _freshPrice();
        uint256 weiForHalfHourMore = (0.375e18 * PRICE) / (uint256(ETH_USD) * 1e10); // 1.5 h
        vm.prank(alice);
        core.buyFuel{value: weiForHalfHourMore}(address(0));
        uint64 expiry = core.positionOf(alice).expiryHour;
        assertEq(expiry, genesisHour + 73, "rounded down to the hour boundary");
        vm.warp(uint256(expiry) * 3600 + 5 hours);
        assertGt(core.tankOf(alice), 0, "remainder kept");
    }

    function test_earnsAfterGenesis() public {
        vm.prank(alice);
        core.buyFuel{value: 0.0009 ether}(address(0)); // 22.5 litres = 90 h
        vm.warp(GENESIS + 1 hours);
        (uint256 miners,,) = EmissionMath.split(EmissionMath.hourlyEmission(EmissionMath.CAP));
        assertApproxEqAbs(core.pendingOf(alice), miners, 1);
    }

    // ------------------------------------------------------------- oracle safety

    function test_oracleStale() public {
        ethUsd.set(ETH_USD, block.timestamp, block.timestamp - 26 hours - 1);
        vm.prank(alice);
        vm.expectRevert(MiningCore.OracleStale.selector);
        core.buyFuel{value: 0.0001 ether}(address(0));
    }

    function test_oracleNonPositive() public {
        ethUsd.set(0, block.timestamp, block.timestamp);
        vm.prank(alice);
        vm.expectRevert(MiningCore.OracleInvalid.selector);
        core.buyFuel{value: 0.0001 ether}(address(0));
    }

    function test_oracleFutureTimestamp() public {
        ethUsd.set(ETH_USD, block.timestamp, block.timestamp + 1);
        vm.prank(alice);
        vm.expectRevert(MiningCore.OracleInvalid.selector);
        core.buyFuel{value: 0.0001 ether}(address(0));
    }

    function test_sequencerDownAndGrace() public {
        MockAggregator seq = new MockAggregator(0, 0);
        MiningCore c = _deploy(address(router), address(seq));
        seq.set(1, block.timestamp - 2 hours, block.timestamp); // down
        vm.prank(alice);
        vm.expectRevert(MiningCore.SequencerDown.selector);
        c.buyFuel{value: 0.0001 ether}(address(0));

        seq.set(0, block.timestamp - 30 minutes, block.timestamp); // up, but inside grace
        vm.prank(alice);
        vm.expectRevert(MiningCore.SequencerDown.selector);
        c.buyFuel{value: 0.0001 ether}(address(0));

        seq.set(0, block.timestamp - 2 hours, block.timestamp); // up, grace passed
        vm.prank(alice);
        c.buyFuel{value: 0.0001 ether}(address(0));
    }

    /// AI review ATK-7: startedAt == 0 marks an uninitialised round; it must not read as "up".
    function test_sequencerUninitialisedRoundIsDown() public {
        MockAggregator seq = new MockAggregator(0, 0);
        MiningCore c = _deploy(address(router), address(seq));
        seq.set(0, 0, block.timestamp);
        vm.prank(alice);
        vm.expectRevert(MiningCore.SequencerDown.selector);
        c.buyFuel{value: 0.0001 ether}(address(0));
    }

    function test_staleOracleDoesNotStopMining() public {
        vm.prank(alice);
        core.buyFuel{value: 0.0004 ether}(address(0));
        ethUsd.set(ETH_USD, block.timestamp, block.timestamp - 30 hours);
        vm.warp(GENESIS + 2 hours);
        core.poke();
        assertGt(core.pendingOf(alice), 0);
    }

    // ------------------------------------------------------------- security

    function test_reentrantRouterReverts() public {
        ReenteringRouter evil = new ReenteringRouter();
        MiningCore c = _deploy(address(evil), address(0));
        evil.setCore(address(c));
        vm.prank(alice);
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        c.buyFuel{value: 0.0001 ether}(address(0));
    }

    function test_initializeOnlyOnce() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        core.initialize(
            admin, address(1), address(1), address(1), address(0), GENESIS, PRICE, DEV, TREASURY
        );
    }

    function test_implementationCannotBeInitialized() public {
        MiningCore impl = new MiningCore();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(
            admin, address(1), address(1), address(1), address(0), GENESIS, PRICE, DEV, TREASURY
        );
    }

    function test_onlyUpgraderCanUpgrade() public {
        MiningCore next = new MiningCore();
        bytes32 role = core.UPGRADER_ROLE(); // read before prank: prank applies to the next call
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role
            )
        );
        core.upgradeToAndCall(address(next), "");
        vm.prank(admin);
        core.upgradeToAndCall(address(next), "");
    }

    function test_initializeRejectsZeroAddresses() public {
        MiningCore impl = new MiningCore();
        address[3] memory tokens = [address(0), address(1), address(1)];
        address[3] memory devs = [DEV, address(0), DEV];
        address[3] memory treasuries = [TREASURY, TREASURY, address(0)];
        for (uint256 i = 0; i < 3; ++i) {
            bytes memory init = abi.encodeCall(
                MiningCore.initialize,
                (
                    admin,
                    tokens[i],
                    address(router),
                    address(ethUsd),
                    address(0),
                    GENESIS,
                    PRICE,
                    devs[i],
                    treasuries[i]
                )
            );
            vm.expectRevert(MiningCore.ZeroAddress.selector);
            new ERC1967Proxy(address(impl), init);
        }
    }

    function test_views() public view {
        assertEq(core.genesisTime(), GENESIS);
        assertEq(core.marketOpenTime(), GENESIS + 72 hours);
        assertEq(core.fuelPriceUsdWad(), PRICE);
        assertEq(core.router(), address(router));
        assertTrue(core.token() != address(0));
    }

    // ------------------------------------------------------------- fuzz

    function testFuzz_litresMatchPrice(uint96 weiAmount) public view {
        assertEq(core.quoteLitres(weiAmount), _litres(weiAmount));
    }

    function testFuzz_tankNeverIncreasesWithoutPurchase(uint32 dt1, uint32 dt2) public {
        vm.prank(alice);
        core.buyFuel{value: 0.0009 ether}(address(0));
        vm.warp(GENESIS + bound(dt1, 0, 200 hours));
        uint256 t1 = core.tankOf(alice);
        vm.warp(vm.getBlockTimestamp() + bound(dt2, 0, 200 hours));
        assertLe(core.tankOf(alice), t1);
    }
}
