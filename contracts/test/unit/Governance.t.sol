// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, stdJson} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {RevenueRouter} from "../../src/RevenueRouter.sol";
import {VrgdaMath} from "../../src/lib/VrgdaMath.sol";
import {SiteMath} from "../../src/lib/SiteMath.sol";
import {MockAggregator} from "../mocks/MockAggregator.sol";
import {MockRouter} from "../mocks/MockRouter.sol";

/// @notice A V2 implementation for the upgrade test: same storage, one new function.
contract MiningCoreV2 is MiningCore {
    function version() external pure returns (uint256) {
        return 2;
    }
}

/// @notice Bounded, rate-limited parameters (P1), Guardian pause (P2), role matrix,
///         immutability of everything else, and UUPS upgrades (docs/02 S12, docs/03 S3.8).
contract GovernanceTest is Test {
    using stdJson for string;

    MiningCore internal core;
    MohnToken internal mohn;
    MockAggregator internal ethUsd;
    address internal timelock = makeAddr("timelock");
    address internal upgrader = makeAddr("upgradeTimelock");
    address internal guardian = makeAddr("guardian");
    address internal alice = makeAddr("alice");
    address internal stranger = makeAddr("stranger");

    uint64 internal constant GENESIS = 1_800_003_600 - (1_800_003_600 % 3600);
    int256 internal constant ETH_USD = 2500e8;
    bytes32 internal constant CORE_SLOT =
        0x23f0141ec1bbecd7265da6fbc91f7278ae21b7e83f5560ce12ee55220b9da600;
    uint256 internal constant VRGDA_SOLD_OFFSET = 9;

    function setUp() public {
        vm.warp(GENESIS - 12 hours);
        ethUsd = new MockAggregator(8, ETH_USD);
        MockRouter router = new MockRouter();
        // deployCode keeps the large creation codes out of this test contract (size limit).
        address impl = deployCode("MiningCore.sol:MiningCore");
        address proxyAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        mohn = new MohnToken(proxyAddr);
        bytes memory init = abi.encodeCall(
            MiningCore.initialize,
            (
                timelock,
                address(mohn),
                address(router),
                address(ethUsd),
                address(0),
                GENESIS,
                0.1e18,
                address(0xDE7),
                address(0x7EA5)
            )
        );
        core = MiningCore(address(new ERC1967Proxy(impl, init)));
        vm.startPrank(timelock);
        core.grantRole(core.GUARDIAN_ROLE(), guardian);
        core.grantRole(core.UPGRADER_ROLE(), upgrader);
        core.revokeRole(core.UPGRADER_ROLE(), timelock);
        vm.stopPrank();
        vm.deal(alice, 10 ether);
    }

    function _fresh() internal {
        ethUsd.set(ETH_USD, vm.getBlockTimestamp(), vm.getBlockTimestamp());
    }

    function _set(MiningCore.Param p, uint256 value) internal {
        vm.prank(timelock);
        core.setParam(p, value);
    }

    // ------------------------------------------------------------------ setParam (P1)

    function test_everyParamBoundedSteppedAndRateLimited() public {
        for (uint256 i = 0; i <= uint256(MiningCore.Param.SiteCostScale); ++i) {
            _checkParam(MiningCore.Param(i));
        }
    }

    function _checkParam(MiningCore.Param p) internal {
        (uint256 min, uint256 max, uint256 stepBps, uint64 period) = core.paramBounds(p);
        uint256 v = core.paramValue(p);
        assertGe(v, min, "initial >= min");
        assertLe(v, max, "initial <= max");
        vm.startPrank(timelock);
        if (min > 0) {
            vm.expectRevert(abi.encodeWithSelector(MiningCore.ParamOutOfBounds.selector, min, max));
            core.setParam(p, min - 1);
        }
        vm.expectRevert(abi.encodeWithSelector(MiningCore.ParamOutOfBounds.selector, min, max));
        core.setParam(p, max + 1);
        uint256 next = stepBps == 0 ? (v == max ? min : max) : _checkStep(p, v, min, max, stepBps);

        vm.expectEmit(address(core));
        emit MiningCore.ParamChanged(p, v, next);
        core.setParam(p, next);
        assertEq(core.paramValue(p), next);
        vm.expectRevert(
            abi.encodeWithSelector(
                MiningCore.RateLimited.selector, uint64(vm.getBlockTimestamp()) + period
            )
        );
        core.setParam(p, next);
        vm.warp(vm.getBlockTimestamp() + period);
        core.setParam(p, next); // allowed again after the period
        vm.stopPrank();
    }

    /// Checks that a step beyond stepBps reverts; returns the largest allowed step.
    function _checkStep(MiningCore.Param p, uint256 v, uint256 min, uint256 max, uint256 stepBps)
        internal
        returns (uint256)
    {
        uint256 lo = (v * (10_000 - stepBps)) / 10_000;
        uint256 hi = (v * (10_000 + stepBps)) / 10_000;
        uint256 target = hi + 1 > max ? lo - 1 : hi + 1;
        if (target >= min && target <= max) {
            vm.expectRevert(abi.encodeWithSelector(MiningCore.ParamStepTooLarge.selector, lo, hi));
            core.setParam(p, target);
        }
        return hi > max ? lo : hi;
    }

    function test_onlyTimelockSetsParams() public {
        bytes32 role = core.DEFAULT_ADMIN_ROLE();
        vm.prank(guardian);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, guardian, role
            )
        );
        core.setParam(MiningCore.Param.FuelPrice, 0.11e18);
    }

    function test_fuelPriceChangesLitresPerEth() public {
        _fresh();
        uint256 before = core.quoteLitres(1 ether);
        _set(MiningCore.Param.FuelPrice, 0.125e18); // +25 %
        assertEq(core.quoteLitres(1 ether), (before * 100) / 125);
    }

    function test_tankStalenessDelayFeeAndSiteScaleTakeEffect() public {
        _set(MiningCore.Param.MaxTankHours, 168);
        assertEq(core.maxTankHours(), 168);

        _set(MiningCore.Param.OracleStaleness, 25 hours);
        ethUsd.set(ETH_USD, vm.getBlockTimestamp(), vm.getBlockTimestamp() - 25 hours - 1);
        vm.prank(alice);
        vm.expectRevert(MiningCore.OracleStale.selector);
        core.buyFuel{value: 0.0001 ether}(address(0));

        uint256 cost = core.quoteSiteUpgrade(1);
        _set(MiningCore.Param.SiteCostScale, 12_500);
        assertEq(core.quoteSiteUpgrade(1), FixedPointMathLib.mulDivUp(cost, 12_500, 10_000));

        _set(MiningCore.Param.RefineDelay, 24 hours);
        _set(MiningCore.Param.FastRefineFee, 0);
        assertEq(core.paramValue(MiningCore.Param.RefineDelay), 24 hours);
        assertEq(core.paramValue(MiningCore.Param.FastRefineFee), 0);
    }

    /// Changing r or k must not move the price at that moment (docs/02 S12, re-anchoring).
    function test_vrgdaChangesKeepThePriceContinuous() public {
        vm.warp(GENESIS + 40 days);
        vm.store(
            address(core), bytes32(uint256(CORE_SLOT) + VRGDA_SOLD_OFFSET), bytes32(uint256(70_000))
        );
        uint256 before = core.unitPrice();
        _set(MiningCore.Param.VrgdaR, 1500e18);
        assertApproxEqRel(core.unitPrice(), before, 1e6, "r change: no jump");
        vm.warp(vm.getBlockTimestamp() + 30 days);
        uint256 mid = core.unitPrice();
        _set(MiningCore.Param.VrgdaK, 0.1125e18);
        assertApproxEqRel(core.unitPrice(), mid, 1e6, "k change: no jump");
        vm.warp(vm.getBlockTimestamp() + 1 days);
        // One day without sales at k = 0.1125: the price falls by exactly that factor.
        assertApproxEqRel(core.unitPrice(), (mid * 8875) / 10_000, 1e6, "new k applies");
    }

    /// sim/vectors/vrgda_reanchor.json: four sequential r changes, price continuous each time.
    struct Anchor {
        int256 lnAnchor;
        uint256 t;
        uint256 n;
    }

    function test_reanchorMatchesVectors() public view {
        string memory json =
            vm.readFile(string.concat(vm.projectRoot(), "/../sim/vectors/vrgda_reanchor.json"));
        Anchor memory a = Anchor(FixedPointMathLib.lnWad(10e18), 0, 0);
        for (uint256 i = 0; i < 4; ++i) {
            a = _reanchorRow(json, string.concat(".rows[", vm.toString(i), "]"), a);
        }
    }

    function _reanchorRow(string memory json, string memory row, Anchor memory a)
        internal
        pure
        returns (Anchor memory next)
    {
        int256 decay = FixedPointMathLib.lnWad(0.85e18);
        string memory tDays = json.readString(string.concat(row, ".t_days"));
        uint256 t = (vm.parseUint(_digits(tDays)) * 1 days) / _scale(tDays);
        uint256 n = vm.parseUint(json.readString(string.concat(row, ".n_units")));
        uint256 rOld = _wad(json.readString(string.concat(row, ".r_old")));
        uint256 rNew = _wad(json.readString(string.concat(row, ".r_new")));
        assertApproxEqRel(
            VrgdaMath.unitPrice(t - a.t, n - a.n, a.lnAnchor, decay, rOld),
            vm.parseUint(json.readString(string.concat(row, ".price_before_wad"))),
            1e6
        );
        next = Anchor(VrgdaMath.lnPrice(t - a.t, n - a.n, a.lnAnchor, decay, rOld), t, n);
        assertApproxEqRel(
            VrgdaMath.unitPrice(0, 0, next.lnAnchor, decay, rNew),
            vm.parseUint(json.readString(string.concat(row, ".price_after_wad"))),
            1e6
        );
        assertApproxEqRel(
            VrgdaMath.unitPrice(1 days, 1000, next.lnAnchor, decay, rNew),
            vm.parseUint(json.readString(string.concat(row, ".price_t_plus_1d_n_plus_1000_wad"))),
            1e6
        );
    }

    /// "1406.25" -> 1406.25e18
    function _wad(string memory dec) internal pure returns (uint256) {
        return (vm.parseUint(_digits(dec)) * 1e18) / _scale(dec);
    }

    /// Removes the decimal point: "401.5" -> "4015".
    function _digits(string memory dec) internal pure returns (string memory) {
        bytes memory b = bytes(dec);
        bytes memory out = new bytes(b.length);
        uint256 k = 0;
        for (uint256 i = 0; i < b.length; ++i) {
            if (b[i] != ".") out[k++] = b[i];
        }
        assembly {
            mstore(out, k)
        }
        return string(out);
    }

    /// 10^(digits after the point).
    function _scale(string memory dec) internal pure returns (uint256 s) {
        bytes memory b = bytes(dec);
        s = 1;
        bool after_ = false;
        for (uint256 i = 0; i < b.length; ++i) {
            if (after_) s *= 10;
            if (b[i] == ".") after_ = true;
        }
    }

    // ------------------------------------------------------------------ pause (P2)

    function test_guardianPause_endsByItself_andCannotBeLifted() public {
        vm.expectEmit(address(core));
        emit MiningCore.Paused(guardian, uint64(vm.getBlockTimestamp()) + 72 hours);
        vm.prank(guardian);
        core.pause();
        uint64 until = core.pausedUntil();
        assertEq(until, vm.getBlockTimestamp() + 72 hours);

        _fresh();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.ProtocolPaused.selector, until));
        core.buyFuel{value: 0.0001 ether}(address(0));
        core.poke(); // accounting keeps running

        bytes32 role = core.DEFAULT_ADMIN_ROLE();
        vm.startPrank(guardian);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, guardian, role
            )
        );
        core.unpause();
        vm.expectRevert(
            abi.encodeWithSelector(
                MiningCore.PauseCooldown.selector, uint64(vm.getBlockTimestamp()) + 7 days
            )
        );
        core.pause(); // no back-to-back pauses
        vm.stopPrank();

        vm.warp(until);
        _fresh();
        vm.prank(alice);
        core.buyFuel{value: 0.0001 ether}(address(0)); // the pause ended by itself
    }

    function test_guardianCanPauseAgainAfterCooldown() public {
        vm.prank(guardian);
        core.pause();
        vm.warp(vm.getBlockTimestamp() + 7 days);
        vm.prank(guardian);
        core.pause();
        assertEq(core.pausedUntil(), vm.getBlockTimestamp() + 72 hours);
    }

    function test_timelockExtendsAndLiftsPauses() public {
        vm.prank(guardian);
        core.pause();
        uint64 max = uint64(vm.getBlockTimestamp()) + 30 days;
        vm.startPrank(timelock);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.PauseTooLong.selector, max));
        core.extendPause(max + 1);
        core.extendPause(max);
        assertEq(core.pausedUntil(), max);
        vm.expectEmit(address(core));
        emit MiningCore.Unpaused();
        core.unpause();
        vm.stopPrank();
        assertEq(core.pausedUntil(), 0);
    }

    function test_guardianPauseNeverShortensALongerPause() public {
        vm.prank(timelock);
        core.extendPause(uint64(vm.getBlockTimestamp()) + 10 days);
        vm.prank(guardian);
        core.pause();
        assertEq(core.pausedUntil(), vm.getBlockTimestamp() + 10 days);
    }

    function test_everyPlayerActionStopsWhilePaused() public {
        vm.prank(guardian);
        core.pause();
        uint64 until = core.pausedUntil();
        bytes[] memory calls = new bytes[](10);
        calls[0] = abi.encodeCall(MiningCore.buyFuel, (address(0)));
        calls[1] = abi.encodeCall(MiningCore.buyMachines, (1, 1, 1, false));
        calls[2] = abi.encodeCall(MiningCore.setActiveRigs, (0, 0));
        calls[3] = abi.encodeCall(MiningCore.scrapMachines, (0, 1));
        calls[4] = abi.encodeCall(MiningCore.upgradeSite, (1, false));
        calls[5] = abi.encodeCall(MiningCore.refine, (1, true));
        calls[6] = abi.encodeCall(MiningCore.finalizeRefine, (alice, 0));
        calls[7] = abi.encodeCall(MiningCore.withdrawDevShare, (1));
        calls[8] = abi.encodeCall(MiningCore.withdrawTreasuryShare, (1));
        calls[9] = abi.encodeCall(MiningCore.openMarket, ());
        for (uint256 i = 0; i < calls.length; ++i) {
            vm.prank(alice);
            (bool ok, bytes memory ret) = address(core).call(calls[i]);
            assertFalse(ok);
            assertEq(ret, abi.encodeWithSelector(MiningCore.ProtocolPaused.selector, until));
        }
    }

    // ------------------------------------------------------------------ other setters

    function test_setRecipientsAndSequencerFeed() public {
        vm.startPrank(timelock);
        vm.expectRevert(MiningCore.ZeroAddress.selector);
        core.setRecipients(address(0), address(1));
        vm.expectEmit(address(core));
        emit MiningCore.RecipientsChanged(address(11), address(12));
        core.setRecipients(address(11), address(12));
        assertEq(core.devRecipient(), address(11));
        assertEq(core.treasuryRecipient(), address(12));
        vm.expectRevert(
            abi.encodeWithSelector(
                MiningCore.RateLimited.selector, uint64(vm.getBlockTimestamp()) + 30 days
            )
        );
        core.setRecipients(address(13), address(14));

        vm.expectEmit(address(core));
        emit MiningCore.SequencerFeedChanged(address(ethUsd));
        core.setSequencerFeed(address(ethUsd));
        vm.expectRevert(
            abi.encodeWithSelector(
                MiningCore.RateLimited.selector, uint64(vm.getBlockTimestamp()) + 30 days
            )
        );
        core.setSequencerFeed(address(0));
        vm.stopPrank();
    }

    function test_routerSplitBoundedAndRateLimited() public {
        RevenueRouter router = RevenueRouter(
            payable(deployCode("RevenueRouter.sol:RevenueRouter", abi.encode(timelock)))
        );
        vm.startPrank(timelock);
        vm.expectRevert(RevenueRouter.SplitOutOfBounds.selector);
        router.setSplit(2999, 3000);
        vm.expectRevert(RevenueRouter.SplitOutOfBounds.selector);
        router.setSplit(6000, 3500); // ops 5 %
        vm.expectRevert(RevenueRouter.SplitOutOfBounds.selector);
        router.setSplit(3000, 1999);
        vm.expectRevert(RevenueRouter.SplitOutOfBounds.selector);
        router.setSplit(3000, 5001);
        vm.expectRevert(RevenueRouter.SplitOutOfBounds.selector);
        router.setSplit(6001, 2000);
        vm.expectRevert(RevenueRouter.SplitOutOfBounds.selector);
        router.setSplit(3000, 2000); // ops 50 %
        vm.expectEmit(address(router));
        emit RevenueRouter.SplitChanged(6000, 2500, 1500);
        router.setSplit(6000, 2500);
        assertEq(router.buybackBps(), 6000);
        assertEq(router.polBps(), 2500);
        vm.expectRevert(
            abi.encodeWithSelector(
                RevenueRouter.RateLimited.selector, uint64(vm.getBlockTimestamp()) + 30 days
            )
        );
        router.setSplit(5500, 3000);
        vm.stopPrank();
        vm.prank(stranger);
        vm.expectRevert();
        router.setSplit(5500, 3000);
    }

    // ------------------------------------------------------------------ roles and immutability

    /// Every privileged MiningCore function rejects a caller without its role (role x function).
    function test_roleMatrix() public {
        bytes32 admin = core.DEFAULT_ADMIN_ROLE();
        bytes[] memory calls = new bytes[](11);
        bytes32[] memory roles = new bytes32[](11);
        calls[0] = abi.encodeCall(MiningCore.setParam, (MiningCore.Param.FuelPrice, 0.1e18));
        roles[0] = admin;
        calls[1] = abi.encodeCall(MiningCore.extendPause, (1));
        roles[1] = admin;
        calls[2] = abi.encodeCall(MiningCore.unpause, ());
        roles[2] = admin;
        calls[3] = abi.encodeCall(MiningCore.setRecipients, (address(1), address(1)));
        roles[3] = admin;
        calls[4] = abi.encodeCall(MiningCore.setSequencerFeed, (address(1)));
        roles[4] = admin;
        calls[5] = abi.encodeCall(MiningCore.setParam, (MiningCore.Param.MaxTankHours, 168));
        roles[5] = admin;
        calls[6] = abi.encodeCall(MiningCore.wireLiquidityManager, (address(1)));
        roles[6] = admin;
        calls[7] =
            abi.encodeCall(MiningCore.addMachineGeneration, (new MiningCore.MachineType[](1)));
        roles[7] = core.CATALOG_ROLE();
        calls[8] = abi.encodeCall(MiningCore.pause, ());
        roles[8] = core.GUARDIAN_ROLE();
        calls[9] = abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(1), "");
        roles[9] = core.UPGRADER_ROLE();
        calls[10] = abi.encodeCall(IAccessControl.grantRole, (admin, stranger));
        roles[10] = admin;
        address[3] memory callers = [stranger, guardian, alice];
        for (uint256 i = 0; i < calls.length; ++i) {
            for (uint256 j = 0; j < callers.length; ++j) {
                if (core.hasRole(roles[i], callers[j])) continue;
                vm.prank(callers[j]);
                (bool ok, bytes memory ret) = address(core).call(calls[i]);
                assertFalse(ok);
                assertEq(
                    ret,
                    abi.encodeWithSelector(
                        IAccessControl.AccessControlUnauthorizedAccount.selector,
                        callers[j],
                        roles[i]
                    )
                );
            }
        }
    }

    /// The token, CAP, emission schedule, 90/5/5 split, 80/20 spend split, referral rate, existing
    /// machines and the Market Open formula have no setter: the state-changing functions in
    /// MiningCore's compiled ABI are exactly this reviewed list (views may grow freely).
    function test_stateChangingSurfaceIsReviewed() public view {
        string[24] memory reviewed = [
            "addMachineGeneration",
            "buyFuel",
            "buyMachines",
            "extendPause",
            "finalizeRefine",
            "grantRole",
            "initialize",
            "openMarket",
            "pause",
            "poke",
            "refine",
            "renounceRole",
            "revokeRole",
            "scrapMachines",
            "setActiveRigs",
            "setParam",
            "setRecipients",
            "setSequencerFeed",
            "unpause",
            "upgradeSite",
            "upgradeToAndCall",
            "wireLiquidityManager",
            "withdrawDevShare",
            "withdrawTreasuryShare"
        ];
        string memory artifact = vm.readFile("out/MiningCore.sol/MiningCore.json");
        uint256 found = 0;
        for (uint256 i = 0; vm.keyExistsJson(artifact, _abiPath(i, "")); ++i) {
            if (
                keccak256(bytes(artifact.readString(_abiPath(i, ".type")))) != keccak256("function")
            ) {
                continue;
            }
            bytes32 mutability =
                keccak256(bytes(artifact.readString(_abiPath(i, ".stateMutability"))));
            if (mutability == keccak256("view") || mutability == keccak256("pure")) continue;
            string memory name = artifact.readString(_abiPath(i, ".name"));
            bool known = false;
            for (uint256 j = 0; j < reviewed.length; ++j) {
                if (keccak256(bytes(reviewed[j])) == keccak256(bytes(name))) known = true;
            }
            assertTrue(known, string.concat("unreviewed state-changing function: ", name));
            ++found;
        }
        assertEq(found, reviewed.length, "a reviewed function disappeared");
    }

    function _abiPath(uint256 i, string memory field) internal pure returns (string memory) {
        return string.concat(".abi[", vm.toString(i), "]", field);
    }

    /// Audit fix: the 96 h admin cannot grant itself the upgrader role (only upgraders can), so
    /// upgrades always go through the 7-day Timelock.
    function test_adminCannotGrantItselfUpgrades() public {
        bytes32 upgraderRole = core.UPGRADER_ROLE();
        assertEq(core.getRoleAdmin(upgraderRole), upgraderRole);
        vm.prank(timelock);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, timelock, upgraderRole
            )
        );
        core.grantRole(upgraderRole, timelock);
        vm.prank(upgrader); // the upgrade Timelock may hand the role over (or renounce to ossify)
        core.grantRole(upgraderRole, makeAddr("nextUpgradeTimelock"));
    }

    function test_upgradeOnlyByUpgraderKeepsState() public {
        _fresh();
        vm.prank(alice);
        core.buyFuel{value: 0.0005 ether}(address(0));
        uint256 reserve = core.reserve();
        uint256 tank = core.siteOf(alice).tank;
        MiningCoreV2 next = MiningCoreV2(deployCode("Governance.t.sol:MiningCoreV2"));

        bytes32 role = core.UPGRADER_ROLE();
        vm.prank(timelock);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, timelock, role
            )
        );
        core.upgradeToAndCall(address(next), "");

        vm.prank(upgrader);
        core.upgradeToAndCall(address(next), "");
        assertEq(MiningCoreV2(address(core)).version(), 2);
        assertEq(core.reserve(), reserve);
        assertEq(core.siteOf(alice).tank, tank);
        assertEq(core.machineTypeCount(), 6);
        assertEq(core.maxTankHours(), 720);
        assertTrue(core.hasRole(core.GUARDIAN_ROLE(), guardian));
    }
}
