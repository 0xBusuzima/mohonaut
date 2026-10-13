// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {console2} from "forge-std/console2.sol";

import {SystemBase} from "../../test/invariant/system/SystemBase.sol";

/// @notice Audit (ACCOUNTANT) ACC-4: scrap credit is priced at the VRGDA price after the player's
///         own purchases, so "buy first, scrap after" yields more capex value than "scrap first,
///         buy after" for the same final fleet. Default parameters (k = 0.15, r = 2,000).
contract AccountantScrapTest is SystemBase {
    uint256 internal constant TURBO = 4; // 1,000 DP, 12.5 L/h, level 10
    uint256 internal constant PLASMA = 5; // 2,700 DP, 30 L/h, level 15
    address internal whale = makeAddr("whale");

    function setUp() public {
        _deploy();
        vm.warp(GENESIS + 73 hours);
        _catchUp();
        _fresh();
        vm.deal(whale, 1 ether);
        vm.startPrank(whale);
        core.buyFuel{value: 0.001 ether}(address(0));
        mohn.approve(address(core), type(uint256).max);
        vm.stopPrank();
        // PoC funding only: give the whale liquid MOHN (bypasses the minter; conservation is
        // not what this test is about).
        deal(address(mohn), whale, 20_000_000e18, true);
        vm.startPrank(whale);
        for (uint256 l = 1; l < 15; ++l) {
            core.upgradeSite(type(uint256).max, true);
        }
        // An existing fleet of 10 Turbodrills (10,000 DP), bought over two weeks, kept idle.
        for (uint256 i = 0; i < 5; ++i) {
            core.buyMachines(TURBO, 2, type(uint256).max, true);
            core.setActiveRigs(TURBO, 0);
            vm.warp(vm.getBlockTimestamp() + 3 days);
            _catchUp();
        }
        vm.stopPrank();
    }

    /// Capex value the whale holds: liquid MOHN + unrefined credit + scrap credit.
    function _value() internal view returns (uint256) {
        return mohn.balanceOf(whale) + core.pendingOf(whale) + core.siteOf(whale).scrapCredit;
    }

    function test_ACC4_buyBeforeScrapInflatesScrapCredit() public {
        uint256 snap = vm.snapshotState();

        // Path A: scrap the old fleet, then buy 3 Plasma Bores (credit is spent first).
        vm.startPrank(whale);
        core.scrapMachines(TURBO, 10);
        core.buyMachines(PLASMA, 3, type(uint256).max, true);
        vm.stopPrank();
        uint256 valueA = _value();
        uint256 burnedA = core.burnedForever();

        vm.revertToState(snap);

        // Path B: same block, same final fleet, opposite order.
        uint256 priceBefore = core.unitPrice();
        vm.startPrank(whale);
        core.buyMachines(PLASMA, 3, type(uint256).max, true);
        uint256 priceAfter = core.unitPrice();
        core.scrapMachines(TURBO, 10);
        vm.stopPrank();
        uint256 valueB = _value();
        uint256 burnedB = core.burnedForever();

        assertEq(core.rigsOf(whale, PLASMA).owned, 3);
        assertEq(core.rigsOf(whale, TURBO).owned, 0);
        uint256 bonus = valueB - valueA;
        // bonus == 0.2 * 10,000 DP * (price after the pump - price before), to rounding.
        assertApproxEqRel(bonus, (10_000 * (priceAfter - priceBefore) * 2000) / 10_000, 1e12);
        assertGt(bonus, 1000e18, "free capex value");
        console2.log("unit price before / after the pump", priceBefore, priceAfter);
        console2.log("extra capex value (MOHN wei) for the same fleet", bonus);
        // Path B burned more now, but holds non-burning credit for later capex: the sink shrinks
        // by 80 % of the bonus once that credit is spent.
        console2.log("burnedForever A / B", burnedA, burnedB);
    }
}
