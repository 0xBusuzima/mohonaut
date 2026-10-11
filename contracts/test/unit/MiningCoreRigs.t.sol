// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, stdJson} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {MiningAccounting} from "../../src/MiningAccounting.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {SiteMath} from "../../src/lib/SiteMath.sol";
import {MockAggregator} from "../mocks/MockAggregator.sol";
import {MockRouter} from "../mocks/MockRouter.sol";

/// @notice Rigs, drill sites, VRGDA purchases, scrap credit and new generations (docs/02 S6-S7).
contract MiningCoreRigsTest is Test {
    using stdJson for string;

    MiningCore internal core;
    MohnToken internal mohn;
    MockAggregator internal ethUsd;
    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint64 internal constant GENESIS = 1_800_003_600 - (1_800_003_600 % 3600);
    int256 internal constant ETH_USD = 2500e8;

    // ERC-7201 bases (see the contracts) and field offsets, used to set up far-off states.
    bytes32 internal constant CORE_SLOT =
        0x23f0141ec1bbecd7265da6fbc91f7278ae21b7e83f5560ce12ee55220b9da600;
    bytes32 internal constant ACCOUNTING_SLOT =
        0xffbd18af881f3cb72d134f7e3a89e907f9a94d70a5ca7c94762e1b3a26acba00;
    uint256 internal constant VRGDA_SOLD_OFFSET = 9; // sequencerFeed and genesisTime share a slot
    uint256 internal constant EMITTED_OFFSET = 11;

    uint256 internal constant ROTARY = 1;
    uint256 internal constant TOP_DRIVE = 2;
    uint256 internal constant PLASMA = 5;

    function setUp() public {
        vm.warp(GENESIS - 12 hours);
        ethUsd = new MockAggregator(8, ETH_USD);
        (core, mohn) = _deploy(address(0));
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    /// @param tokenMinter address(0): the core mints (production wiring); otherwise a token whose
    ///        minter is this test, so wallet payments can be exercised before refining exists.
    function _deploy(address tokenMinter) internal returns (MiningCore c, MohnToken t) {
        MockRouter router = new MockRouter();
        MiningCore impl = new MiningCore();
        address proxyAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        t = new MohnToken(tokenMinter == address(0) ? proxyAddr : tokenMinter);
        bytes memory init = abi.encodeCall(
            MiningCore.initialize,
            (
                admin,
                address(t),
                address(router),
                address(ethUsd),
                address(0),
                GENESIS,
                0.1e18,
                address(0xDE7),
                address(0x7EA5)
            )
        );
        c = MiningCore(address(new ERC1967Proxy(address(impl), init)));
        if (tokenMinter == address(0)) assertEq(address(c), proxyAddr, "token minter == proxy");
    }

    function _fresh() internal {
        ethUsd.set(ETH_USD, vm.getBlockTimestamp(), vm.getBlockTimestamp());
    }

    /// Registers `who` with a pre-fill tank, then mines alone until `hoursAfterGenesis`.
    function _mine(MiningCore c, address who, uint256 hoursAfterGenesis) internal {
        _fresh();
        vm.prank(who);
        c.buyFuel{value: 0.0009 ether}(address(0)); // 22.5 L, under the genesis tank cap
        vm.warp(GENESIS + hoursAfterGenesis * 1 hours);
        c.poke();
    }

    function _unrefined(address who) internal view returns (uint256) {
        return core.positionOf(who).unrefined;
    }

    function _setSold(MiningCore c, uint256 sold) internal {
        vm.store(address(c), bytes32(uint256(CORE_SLOT) + VRGDA_SOLD_OFFSET), bytes32(sold));
        assertEq(c.vrgdaSold(), sold, "slot offset");
    }

    function _setEmitted(uint256 amount) internal {
        vm.store(address(core), bytes32(uint256(ACCOUNTING_SLOT) + EMITTED_OFFSET), bytes32(amount));
        assertEq(core.emitted(), amount, "slot offset");
    }

    /// E2 with counters. `externallyMinted`: tokens this test minted outside the emission (only
    /// possible with the test-minter token fixture).
    function _conservation(MiningCore c, MohnToken t, uint256 externallyMinted) internal view {
        assertEq(
            c.reserve() + c.minersDistributed() - c.unrefinedSpent() + c.devPending()
                + c.treasuryPending() + c.burnedForever() + t.totalSupply(),
            EmissionMath.CAP + externallyMinted,
            "E2"
        );
    }

    // ------------------------------------------------------------------ catalog

    function test_gen1CatalogSeeded() public view {
        assertEq(core.machineTypeCount(), 6);
        assertEq(core.generations(), 1);
        uint32[6] memory dp = [uint32(10), 50, 150, 420, 1000, 2700];
        uint128[6] memory burn = [uint128(0.25e18), 1e18, 2.5e18, 6e18, 12.5e18, 30e18];
        uint16[6] memory premium = [uint16(0), 0, 800, 1700, 2700, 4000];
        uint8[6] memory minLevel = [uint8(1), 1, 3, 6, 10, 15];
        for (uint256 i = 0; i < 6; ++i) {
            MiningCore.MachineType memory m = core.machineType(i);
            assertEq(m.dp, dp[i]);
            assertEq(m.burn, burn[i]);
            assertEq(m.premiumBps, premium[i]);
            assertEq(m.minLevel, minLevel[i]);
            assertEq(m.generation, 1);
        }
    }

    function test_registrationGivesOnePilotRig() public {
        _mine(core, alice, 0);
        MiningCore.Rigs memory r = core.rigsOf(alice, 0);
        assertEq(r.owned, 1);
        assertEq(r.active, 1);
        assertEq(core.siteOf(alice).rigs, 1);
    }

    // ------------------------------------------------------------------ buying

    function test_buyFromUnrefined_burns80_recycles20() public {
        _mine(core, alice, 10);
        vm.prank(alice);
        core.poke();
        uint256 cost = core.quoteMachines(ROTARY, 2);
        uint256 reserveBefore = core.reserve();
        uint256 creditBefore = core.pendingOf(alice);

        vm.expectEmit(address(core));
        emit MiningCore.MachinesBought(alice, ROTARY, 2, cost);
        vm.prank(alice);
        core.buyMachines(ROTARY, 2, cost, false);

        uint256 toReserve = (cost * 2000) / 10_000;
        assertEq(core.pendingOf(alice), creditBefore - cost, "paid from unrefined");
        assertEq(core.reserve(), reserveBefore + toReserve, "20 % recycled");
        assertEq(core.burnedForever(), cost - toReserve, "80 % burned");
        assertEq(core.unrefinedSpent(), cost);
        assertEq(core.vrgdaSold(), 100);
        MiningCore.Site memory s = core.siteOf(alice);
        assertEq(s.dp, 110);
        assertEq(s.burn, 2.25e18);
        assertEq(s.rigs, 3);
        assertEq(core.activeDp(), 110, "new rigs run at once");
        _conservation(core, mohn, 0);
    }

    function test_costMatchesClosedFormAndRises() public {
        _mine(core, alice, 10);
        uint256 price = core.unitPrice();
        uint256 elapsed = 10 hours;
        int256 lnP0 = FixedPointMathLib.lnWad(10e18);
        int256 decay = FixedPointMathLib.lnWad(0.85e18);
        int256 x = lnP0 + FixedPointMathLib.sMulWad(decay, int256((elapsed * 1e18) / 1 days));
        assertEq(price, uint256(FixedPointMathLib.expWad(x)), "p(t, 0)");

        uint256 cost = core.quoteMachines(ROTARY, 1);
        vm.prank(alice);
        core.buyMachines(ROTARY, 1, cost, false);
        assertGt(core.unitPrice(), price, "selling ahead raises the price (V2)");
        assertGt(core.quoteMachines(ROTARY, 1), cost);
    }

    function test_buyReverts() public {
        vm.prank(alice);
        vm.expectRevert(MiningCore.NotRegistered.selector);
        core.buyMachines(ROTARY, 1, type(uint256).max, false);

        _mine(core, alice, 10);
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.UnknownMachine.selector, 0));
        core.buyMachines(0, 1, type(uint256).max, false);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.UnknownMachine.selector, 6));
        core.buyMachines(6, 1, type(uint256).max, false);
        vm.expectRevert(MiningCore.ZeroValue.selector);
        core.buyMachines(ROTARY, 0, type(uint256).max, false);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.TooManyUnits.selector, 10_050));
        core.buyMachines(ROTARY, 201, type(uint256).max, false);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.LevelTooLow.selector, 3));
        core.buyMachines(TOP_DRIVE, 1, type(uint256).max, false);
        vm.expectRevert(MiningCore.NoFreePad.selector);
        core.buyMachines(ROTARY, 4, type(uint256).max, false);
        uint256 cost = core.quoteMachines(ROTARY, 1);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.CostAboveMax.selector, cost));
        core.buyMachines(ROTARY, 1, cost - 1, false);
        vm.stopPrank();
    }

    function test_fuelLineFull() public {
        (MiningCore c, MohnToken t) = _deploy(address(this));
        _mine(c, alice, 1);
        t.mint(alice, 400_000e18); // under the 500K daily mint cap
        vm.startPrank(alice);
        t.approve(address(c), type(uint256).max);
        c.upgradeSite(type(uint256).max, true);
        c.upgradeSite(type(uint256).max, true); // L3: 6 pads, 8.93 L/h
        c.buyMachines(TOP_DRIVE, 3, type(uint256).max, true); // 0.25 + 7.5 L/h
        uint256 capacity = SiteMath.fuelLineCapacity(3);
        vm.expectRevert(
            abi.encodeWithSelector(MiningCore.FuelLineFull.selector, 10.25e18, capacity)
        );
        c.buyMachines(TOP_DRIVE, 1, type(uint256).max, true);
        vm.stopPrank();
    }

    function test_insufficientCredit_thenWalletPayment() public {
        (MiningCore c, MohnToken t) = _deploy(address(this));
        _mine(c, alice, 0); // registered, nothing earned yet
        uint256 cost = c.quoteMachines(ROTARY, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.InsufficientCredit.selector, cost));
        c.buyMachines(ROTARY, 1, cost, false);

        t.mint(alice, cost);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(c), 0, cost
            )
        );
        c.buyMachines(ROTARY, 1, cost, true);

        vm.startPrank(alice);
        t.approve(address(c), cost);
        vm.expectEmit(address(c));
        emit MiningCore.Paid(alice, 0, 0, cost);
        c.buyMachines(ROTARY, 1, cost, true);
        vm.stopPrank();
        assertEq(t.balanceOf(alice), 0, "wallet tokens burned");
        assertEq(t.totalSupply(), 0);
        assertEq(c.burnedForever(), cost - (cost * 2000) / 10_000);
        _conservation(c, t, cost);
    }

    function test_paymentOrder_creditThenUnrefinedThenWallet() public {
        (MiningCore c, MohnToken t) = _deploy(address(this));
        _mine(c, alice, 0);
        vm.warp(GENESIS + 30 minutes); // ~937 MOHN earned: enough for one rotary rig, not four
        vm.startPrank(alice);
        c.buyMachines(ROTARY, 1, type(uint256).max, false);
        c.scrapMachines(ROTARY, 1);
        uint256 credit = c.siteOf(alice).scrapCredit;
        assertGt(credit, 0);
        uint256 unrefined = c.pendingOf(alice);
        vm.stopPrank();

        // Cost of 3 rotary rigs exceeds credit + unrefined: the rest comes from the wallet.
        uint256 cost = c.quoteMachines(ROTARY, 3);
        assertGt(cost, credit + unrefined);
        uint256 fromWallet = cost - credit - unrefined;
        uint256 burnedBefore = c.burnedForever();
        t.mint(alice, fromWallet);
        vm.startPrank(alice);
        t.approve(address(c), fromWallet);
        vm.expectEmit(address(c));
        emit MiningCore.Paid(alice, credit, unrefined, fromWallet);
        c.buyMachines(ROTARY, 3, cost, true);
        vm.stopPrank();
        assertEq(c.siteOf(alice).scrapCredit, 0);
        assertEq(c.pendingOf(alice), 0);
        assertEq(t.balanceOf(alice), 0);
        // Scrap credit is not MOHN: only the MOHN part is burned and recycled (S1).
        uint256 spent = cost - credit;
        assertEq(c.burnedForever() - burnedBefore, spent - (spent * 2000) / 10_000);
        _conservation(c, t, fromWallet);
    }

    // ------------------------------------------------------------------ scrap

    function test_scrap_idleFirst_creditAt20Percent() public {
        _mine(core, alice, 10);
        vm.startPrank(alice);
        core.buyMachines(ROTARY, 2, type(uint256).max, false);
        core.setActiveRigs(ROTARY, 1);
        uint256 price = core.unitPrice();
        vm.expectEmit(address(core));
        emit MiningCore.MachinesScrapped(alice, ROTARY, 1, (50 * price * 2000) / 10_000);
        core.scrapMachines(ROTARY, 1);
        vm.stopPrank();

        MiningCore.Rigs memory r = core.rigsOf(alice, ROTARY);
        assertEq(r.owned, 1);
        assertEq(r.active, 1, "the idle rig went first");
        MiningCore.Site memory s = core.siteOf(alice);
        assertEq(s.dp, 60);
        assertEq(s.rigs, 2);
        assertEq(s.scrapCredit, (50 * price * 2000) / 10_000);
    }

    function test_scrapActiveRig_reducesDrillPower() public {
        _mine(core, alice, 10);
        vm.startPrank(alice);
        core.buyMachines(ROTARY, 1, type(uint256).max, false);
        core.scrapMachines(ROTARY, 1);
        vm.stopPrank();
        assertEq(core.siteOf(alice).dp, 10);
        assertEq(core.siteOf(alice).burn, 0.25e18);
        assertEq(core.activeDp(), 10);
    }

    function test_scrapPilotRig_freesPadWithoutCredit() public {
        _mine(core, alice, 10);
        vm.prank(alice);
        core.scrapMachines(0, 1);
        MiningCore.Site memory s = core.siteOf(alice);
        assertEq(s.rigs, 0);
        assertEq(s.dp, 0);
        assertEq(s.scrapCredit, 0);
        assertEq(core.activeDp(), 0);
        vm.prank(alice);
        core.buyMachines(ROTARY, 3, type(uint256).max, false);
        vm.prank(alice);
        core.buyMachines(ROTARY, 1, type(uint256).max, false); // the freed fourth pad
    }

    function test_scrapReverts() public {
        vm.prank(alice);
        vm.expectRevert(MiningCore.NotRegistered.selector);
        core.scrapMachines(0, 1);
        _mine(core, alice, 1);
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.UnknownMachine.selector, 6));
        core.scrapMachines(6, 1);
        vm.expectRevert(MiningCore.NotOwned.selector);
        core.scrapMachines(0, 0);
        vm.expectRevert(MiningCore.NotOwned.selector);
        core.scrapMachines(0, 2);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ on / off

    function test_setActiveRigs_offAndOn() public {
        _mine(core, alice, 10);
        vm.startPrank(alice);
        core.buyMachines(ROTARY, 2, type(uint256).max, false);
        vm.expectEmit(address(core));
        emit MiningCore.ActiveRigsSet(alice, ROTARY, 0);
        core.setActiveRigs(ROTARY, 0);
        assertEq(core.siteOf(alice).dp, 10);
        assertEq(core.siteOf(alice).burn, 0.25e18);
        assertEq(core.activeDp(), 10);
        core.setActiveRigs(ROTARY, 2);
        assertEq(core.siteOf(alice).dp, 110);
        assertEq(core.activeDp(), 110);
        core.setActiveRigs(0, 0); // the Pilot Rig can rest too
        assertEq(core.activeDp(), 100);
        vm.stopPrank();
    }

    function test_setActiveRigsReverts() public {
        vm.prank(alice);
        vm.expectRevert(MiningCore.NotRegistered.selector);
        core.setActiveRigs(0, 1);

        (MiningCore c, MohnToken t) = _deploy(address(this));
        _mine(c, alice, 1);
        t.mint(alice, 400_000e18); // under the 500K daily mint cap
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.UnknownMachine.selector, 6));
        c.setActiveRigs(6, 0);
        vm.expectRevert(MiningCore.NotOwned.selector);
        c.setActiveRigs(0, 2);

        t.approve(address(c), type(uint256).max);
        c.upgradeSite(type(uint256).max, true);
        c.upgradeSite(type(uint256).max, true);
        c.buyMachines(TOP_DRIVE, 3, type(uint256).max, true);
        c.setActiveRigs(TOP_DRIVE, 0);
        c.buyMachines(ROTARY, 2, type(uint256).max, true); // 0.25 + 2 L/h running
        vm.expectRevert(
            abi.encodeWithSelector(
                MiningCore.FuelLineFull.selector, 9.75e18, SiteMath.fuelLineCapacity(3)
            )
        );
        c.setActiveRigs(TOP_DRIVE, 3);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ site

    function test_upgradeSite_costUsesPriceIndex() public {
        _mine(core, alice, 10);
        uint256 idx = (core.unitPrice() * 1e18) / 10e18;
        uint256 cost = core.quoteSiteUpgrade(1);
        assertEq(cost, FixedPointMathLib.mulDivUp(150e18, idx, 1e18));
        vm.expectEmit(address(core));
        emit MiningCore.SiteUpgraded(alice, 2, cost);
        vm.prank(alice);
        core.upgradeSite(cost, false);
        assertEq(core.siteOf(alice).level, 2);
        _conservation(core, mohn, 0);
    }

    function test_upgradeSiteReverts() public {
        vm.prank(alice);
        vm.expectRevert(MiningCore.NotRegistered.selector);
        core.upgradeSite(type(uint256).max, false);
        _mine(core, alice, 10);
        uint256 cost = core.quoteSiteUpgrade(1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.CostAboveMax.selector, cost));
        core.upgradeSite(cost - 1, false);
    }

    function test_upgradeSite_toLevel30_thenInvalidLevel() public {
        (MiningCore c, MohnToken t) = _deploy(address(this));
        _mine(c, alice, 1);
        // ~2.3M * idx MOHN in total; the token's daily mint cap (500K) spreads minting over days.
        for (uint256 day = 0; day < 6; ++day) {
            t.mint(alice, 450_000e18);
            vm.warp(vm.getBlockTimestamp() + 1 days);
        }
        c.poke();
        vm.startPrank(alice);
        t.approve(address(c), type(uint256).max);
        for (uint256 level = 1; level < 30; ++level) {
            c.upgradeSite(type(uint256).max, true);
        }
        assertEq(c.siteOf(alice).level, 30);
        vm.expectRevert(abi.encodeWithSelector(SiteMath.InvalidLevel.selector, 30));
        c.upgradeSite(type(uint256).max, true);
        vm.stopPrank();
        _conservation(c, t, 6 * 450_000e18);
    }

    /// Differential: idx clamps at 0.25 and 4 reproduce sim/vectors/outpost_costs.json (up to the
    /// contract's round-up of 1 wei).
    function test_siteCostClampsMatchVectors() public {
        string memory json =
            vm.readFile(string.concat(vm.projectRoot(), "/../sim/vectors/outpost_costs.json"));
        vm.warp(GENESIS + 30 days); // no sales for 30 days: p = 10 * 0.85^30, far below 0.25 * p0
        _checkIdxExamples(json, 0.25e18);
        _setSold(core, 120_000); // 60 days ahead of schedule: p far above 4 * p0
        _checkIdxExamples(json, 4e18);
    }

    function _checkIdxExamples(string memory json, uint256 idx) internal view {
        uint256 checked = 0;
        for (
            uint256 i = 0;
            vm.keyExistsJson(json, string.concat(".idx_examples[", vm.toString(i), "]"));
            ++i
        ) {
            string memory row = string.concat(".idx_examples[", vm.toString(i), "]");
            if (vm.parseUint(json.readString(string.concat(row, ".idx_wad"))) != idx) continue;
            uint256 level = json.readUint(string.concat(row, ".level"));
            uint256 want = vm.parseUint(json.readString(string.concat(row, ".cost_wad")));
            // forge-lint: disable-next-line(unsafe-typecast)
            assertApproxEqAbs(core.quoteSiteUpgrade(uint8(level)), want, 1);
            ++checked;
        }
        assertGt(checked, 0, "examples found");
    }

    /// Differential through the core: quotes equal sim/vectors/vrgda_costs.json tier costs.
    function test_quotesMatchVrgdaVectors() public {
        string memory json =
            vm.readFile(string.concat(vm.projectRoot(), "/../sim/vectors/vrgda_costs.json"));
        uint256 checked = 0;
        for (uint256 i = 0; i < 61; ++i) {
            string memory row = string.concat(".rows[", vm.toString(i), "]");
            if (!vm.keyExistsJson(json, string.concat(row, ".tier"))) continue;
            uint256 tier = json.readUint(string.concat(row, ".tier"));
            uint256 q = vm.parseUint(json.readString(string.concat(row, ".q_units")));
            if (bytes(json.readString(string.concat(row, ".tier_cost_wad"))).length > 58) continue;
            uint256 want = vm.parseUint(json.readString(string.concat(row, ".tier_cost_wad")));
            if (want < 1e12) continue; // a few wei: covered by the library differential test
            vm.warp(GENESIS + vm.parseUint(json.readString(string.concat(row, ".t_seconds"))));
            _setSold(core, vm.parseUint(json.readString(string.concat(row, ".n_units"))));
            MiningCore.MachineType memory m = core.machineType(tier);
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 got = core.quoteMachines(tier, uint32(q / m.dp));
            assertApproxEqRel(got, want, 1e6, "tier cost"); // 1e-12
            ++checked;
        }
        assertGt(checked, 20);
    }

    // ------------------------------------------------------------------ generations

    function _gen2() internal pure returns (MiningCore.MachineType[] memory types) {
        types = new MiningCore.MachineType[](2);
        types[0] = MiningCore.MachineType(80, 500, 4, 0, 1.2e18); // 66.7 DP per L/h
        types[1] = MiningCore.MachineType(3100, 4500, 18, 0, 30e18); // 103.3 DP per L/h
    }

    function test_addGeneration() public {
        vm.warp(GENESIS + 45 days);
        _setEmitted(2_000_000e18);
        vm.expectEmit(address(core));
        emit MiningCore.MachineTypeAdded(6, 2, 80, 1.2e18, 500, 4);
        vm.prank(admin);
        core.addMachineGeneration(_gen2());
        assertEq(core.machineTypeCount(), 8);
        assertEq(core.generations(), 2);
        assertEq(core.machineType(7).generation, 2, "assigned, not taken from input");
        assertEq(core.machineType(PLASMA).dp, 2700, "existing types unchanged (M2)");

        // The next generation needs Granite Basement (6,000 m) and another 45 days, and is capped
        // at +15 % over the new best (103.3 DP per L/h).
        MiningCore.MachineType[] memory gen3 = new MiningCore.MachineType[](1);
        gen3[0] = MiningCore.MachineType(3570, 0, 20, 0, 30e18); // 119 DP per L/h
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.StratumNotReached.selector, 3));
        core.addMachineGeneration(gen3);
        _setEmitted(6_000_000e18);
        vm.expectRevert(MiningCore.GenerationTooSoon.selector);
        core.addMachineGeneration(gen3);
        vm.warp(vm.getBlockTimestamp() + 45 days);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.BadMachine.selector, 0));
        core.addMachineGeneration(gen3);
        gen3[0].dp = 3560; // 118.7 <= 103.3 * 1.15
        core.addMachineGeneration(gen3);
        vm.stopPrank();
        assertEq(core.generations(), 3);
    }

    function test_addGenerationReverts() public {
        vm.warp(GENESIS + 45 days);
        _setEmitted(2_000_000e18);
        MiningCore.MachineType[] memory types = _gen2();
        bytes32 role = core.CATALOG_ROLE();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role
            )
        );
        core.addMachineGeneration(types);

        vm.startPrank(admin);
        vm.expectRevert(MiningCore.BadGeneration.selector);
        core.addMachineGeneration(new MiningCore.MachineType[](0));
        vm.expectRevert(MiningCore.BadGeneration.selector);
        core.addMachineGeneration(new MiningCore.MachineType[](9));

        MiningCore.MachineType memory ok = types[0];
        for (uint256 i = 0; i < 6; ++i) {
            MiningCore.MachineType memory b = MiningCore.MachineType(80, 500, 4, 0, 1.2e18);
            if (i == 0) b.dp = 0;
            if (i == 1) b.dp = 10_001;
            if (i == 2) b.burn = 0;
            if (i == 3) b.minLevel = 0;
            if (i == 4) b.minLevel = 31;
            if (i == 5) b.premiumBps = 10_001;
            MiningCore.MachineType[] memory one = new MiningCore.MachineType[](2);
            one[0] = ok;
            one[1] = b;
            vm.expectRevert(abi.encodeWithSelector(MiningCore.BadMachine.selector, 1));
            core.addMachineGeneration(one);
        }
        vm.stopPrank();
    }

    function test_addGeneration_needsStratumAndInterval() public {
        vm.warp(GENESIS + 44 days);
        _setEmitted(1_999_999e18);
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.StratumNotReached.selector, 2));
        core.addMachineGeneration(_gen2());
        _setEmitted(2_000_000e18);
        vm.expectRevert(MiningCore.GenerationTooSoon.selector);
        core.addMachineGeneration(_gen2());
        vm.stopPrank();
    }

    /// Generations past VIII all need The Core's depth (85,000 m).
    function test_stratumThresholdsAllGenerations() public {
        uint32[8] memory metres =
            [uint32(2000), 6000, 12_262, 20_000, 35_000, 60_000, 85_000, 85_000];
        MiningCore.MachineType[] memory one = new MiningCore.MachineType[](1);
        one[0] = MiningCore.MachineType(50, 0, 1, 0, 1e18);
        vm.warp(GENESIS);
        vm.startPrank(admin);
        for (uint256 g = 0; g < 8; ++g) {
            vm.warp(vm.getBlockTimestamp() + 45 days);
            _setEmitted(uint256(metres[g]) * 1000e18 - 1);
            vm.expectRevert(abi.encodeWithSelector(MiningCore.StratumNotReached.selector, g + 2));
            core.addMachineGeneration(one);
            _setEmitted(uint256(metres[g]) * 1000e18);
            core.addMachineGeneration(one);
        }
        vm.stopPrank();
        assertEq(core.generations(), 9);
    }
}
