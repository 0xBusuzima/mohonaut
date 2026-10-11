// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {MiningAccounting} from "../../src/MiningAccounting.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {EmissionMath} from "../../src/lib/EmissionMath.sol";
import {MockAggregator} from "../mocks/MockAggregator.sol";
import {MockRouter} from "../mocks/MockRouter.sol";

/// @notice Refinery, referral credit, dev/treasury withdrawals and the hourly mint breaker
///         (docs/02 S2, S3.3, S8, S9).
contract MiningCoreRefineryTest is Test {
    MiningCore internal core;
    MohnToken internal mohn;
    MockAggregator internal ethUsd;
    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal constant DEV = address(0xDE7);
    address internal constant TREASURY = address(0x7EA5);

    uint64 internal constant GENESIS = 1_800_003_600 - (1_800_003_600 % 3600);
    uint64 internal constant MARKET_OPEN = GENESIS + 72 hours;
    int256 internal constant ETH_USD = 2500e8;

    bytes32 internal constant ACCOUNTING_SLOT =
        0xffbd18af881f3cb72d134f7e3a89e907f9a94d70a5ca7c94762e1b3a26acba00;
    uint256 internal constant DEV_PENDING_OFFSET = 5;
    uint256 internal constant POSITIONS_OFFSET = 10;

    function setUp() public {
        vm.warp(GENESIS - 12 hours);
        ethUsd = new MockAggregator(8, ETH_USD);
        MockRouter router = new MockRouter();
        MiningCore impl = new MiningCore();
        address proxyAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        mohn = new MohnToken(proxyAddr);
        bytes memory init = abi.encodeCall(
            MiningCore.initialize,
            (
                admin,
                address(mohn),
                address(router),
                address(ethUsd),
                address(0),
                GENESIS,
                0.1e18,
                DEV,
                TREASURY
            )
        );
        core = MiningCore(address(new ERC1967Proxy(address(impl), init)));
        assertEq(address(core), proxyAddr, "token minter == proxy");
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _fresh() internal {
        ethUsd.set(ETH_USD, vm.getBlockTimestamp(), vm.getBlockTimestamp());
    }

    function _catchUp() internal {
        while (!core.poke()) {}
    }

    /// Alice fuels in pre-fill and mines alone through genesis; returns at Market Open.
    function _aliceMinesThroughGenesis() internal {
        _fresh();
        vm.prank(alice);
        core.buyFuel{value: 0.0009 ether}(address(0)); // 22.5 L: until Market Open + 24 h
        vm.warp(MARKET_OPEN);
        _catchUp();
    }

    function _setUnrefined(address who, uint256 amount) internal {
        bytes32 base = keccak256(abi.encode(who, uint256(ACCOUNTING_SLOT) + POSITIONS_OFFSET));
        vm.store(address(core), bytes32(uint256(base) + 2), bytes32(amount));
        assertEq(core.positionOf(who).unrefined, amount, "slot offset");
    }

    function _setDevPending(uint256 amount) internal {
        vm.store(
            address(core), bytes32(uint256(ACCOUNTING_SLOT) + DEV_PENDING_OFFSET), bytes32(amount)
        );
        assertEq(core.devPending(), amount, "slot offset");
    }

    /// E2 over every flow of this phase.
    function _conservation() internal view {
        assertEq(
            core.reserve() + core.minersDistributed() + core.referralPaid() - core.unrefinedSpent()
                - core.unrefinedRefined() + core.devPending() + core.treasuryPending()
                + core.burnedForever() + core.refineQueued() + mohn.totalSupply(),
            EmissionMath.CAP,
            "E2"
        );
    }

    // ------------------------------------------------------------------ refine

    function test_refineClosedDuringGenesis() public {
        _fresh();
        vm.prank(alice);
        core.buyFuel{value: 0.0009 ether}(address(0));
        vm.warp(MARKET_OPEN - 1);
        _catchUp();
        vm.startPrank(alice);
        vm.expectRevert(MiningCore.RefineClosed.selector);
        core.refine(1e18, true);
        vm.expectRevert(MiningCore.RefineClosed.selector);
        core.refine(1e18, false);
        vm.stopPrank();
        vm.prank(DEV);
        vm.expectRevert(MiningCore.RefineClosed.selector);
        core.withdrawDevShare(1e18);
    }

    function test_fastRefine_feeHalfBurnedHalfReserve() public {
        _aliceMinesThroughGenesis();
        uint256 unrefined = core.pendingOf(alice);
        uint256 reserveBefore = core.reserve();
        vm.expectEmit(address(core));
        emit MiningCore.Refined(alice, 1000e18, 920e18, 80e18);
        vm.prank(alice);
        core.refine(1000e18, true);
        assertEq(mohn.balanceOf(alice), 920e18);
        assertEq(core.pendingOf(alice), unrefined - 1000e18);
        assertEq(core.burnedForever(), 40e18);
        assertEq(core.reserve(), reserveBefore + 40e18);
        assertEq(core.unrefinedRefined(), 1000e18);
        _conservation();
    }

    function test_fastRefineFeeRoundsUp() public {
        _aliceMinesThroughGenesis();
        vm.prank(alice);
        core.refine(1, true); // fee = ceil(0.08 wei) = 1 wei
        assertEq(mohn.balanceOf(alice), 0);
        assertEq(core.burnedForever(), 1);
        _conservation();
    }

    function test_standardRefine_queueAndFinalize() public {
        _aliceMinesThroughGenesis();
        uint64 readyAt = MARKET_OPEN + 72 hours;
        vm.expectEmit(address(core));
        emit MiningCore.RefineQueued(alice, 0, 500e18, readyAt);
        vm.prank(alice);
        core.refine(500e18, false);
        assertEq(core.refineQueued(), 500e18);
        assertEq(core.refineRequestCount(alice), 1);
        MiningCore.RefineRequest memory r = core.refineRequest(alice, 0);
        assertEq(r.amount, 500e18);
        assertEq(r.readyAt, readyAt);
        assertEq(mohn.totalSupply(), 0, "queued MOHN is not minted");
        _conservation();

        vm.warp(readyAt - 1);
        _catchUp();
        vm.expectRevert(abi.encodeWithSelector(MiningCore.NotReady.selector, readyAt));
        core.finalizeRefine(alice, 0);

        vm.warp(readyAt);
        _catchUp();
        vm.expectEmit(address(core));
        emit MiningCore.RefineFinalized(alice, 0, 500e18);
        vm.prank(bob); // anyone may finalize; tokens go to the owner
        core.finalizeRefine(alice, 0);
        assertEq(mohn.balanceOf(alice), 500e18);
        assertEq(mohn.balanceOf(bob), 0);
        assertEq(core.refineQueued(), 0);
        _conservation();

        vm.expectRevert(MiningCore.AlreadyFinalized.selector);
        core.finalizeRefine(alice, 0);
        vm.expectRevert(MiningCore.UnknownRequest.selector);
        core.finalizeRefine(alice, 1);
    }

    function test_refineReverts() public {
        _aliceMinesThroughGenesis();
        uint256 unrefined = core.pendingOf(alice);
        vm.startPrank(alice);
        vm.expectRevert(MiningCore.ZeroValue.selector);
        core.refine(0, false);
        vm.expectRevert(
            abi.encodeWithSelector(MiningAccounting.InsufficientUnrefined.selector, unrefined)
        );
        core.refine(unrefined + 1, false);
        vm.expectRevert(
            abi.encodeWithSelector(MiningAccounting.InsufficientUnrefined.selector, unrefined)
        );
        core.refine(unrefined + 1, true);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ referral

    /// Bob joins with Alice as referrer after Market Open and spends >= 0.003 ETH on fuel.
    function _bobJoinsUnderAlice(uint256 bobFuelWei) internal {
        _aliceMinesThroughGenesis();
        _fresh();
        vm.prank(alice);
        core.buyFuel{value: 0.01 ether}(address(0)); // keep Alice fuelled
        vm.prank(bob);
        core.buyFuel{value: bobFuelWei}(alice);
    }

    function test_referralPaysThreePercentFromTreasury() public {
        _bobJoinsUnderAlice(0.004 ether);
        vm.warp(MARKET_OPEN + 5 hours);
        _catchUp();
        uint256 bobEarned = core.pendingOf(bob);
        uint256 credit = (bobEarned * 300) / 10_000;
        uint256 aliceBefore = core.pendingOf(alice);
        uint256 treasuryBefore = core.treasuryPending();

        vm.expectEmit(address(core));
        emit MiningAccounting.ReferralCredited(alice, bob, credit);
        vm.prank(bob);
        core.refine(1e18, false); // any settling action credits the referrer
        assertEq(core.pendingOf(alice), aliceBefore + credit);
        assertEq(core.treasuryPending(), treasuryBefore - credit);
        assertEq(core.referralPaid(), credit);
        assertEq(core.pendingOf(bob), bobEarned - 1e18, "the invitee keeps everything");
        _conservation();
    }

    function test_noReferralBelowFuelThreshold() public {
        _bobJoinsUnderAlice(0.0029 ether);
        vm.warp(MARKET_OPEN + 5 hours);
        _catchUp();
        vm.prank(bob);
        core.refine(1e18, false);
        assertEq(core.referralPaid(), 0);
    }

    function test_noReferralWhileReferrerHasNoFuel() public {
        _aliceMinesThroughGenesis(); // Alice's tank lasts until Market Open + 24 h only
        _fresh();
        vm.prank(bob);
        core.buyFuel{value: 0.05 ether}(alice);
        vm.warp(MARKET_OPEN + 30 hours);
        _catchUp();
        _fresh();
        vm.prank(bob);
        core.buyFuel{value: 0.001 ether}(alice);
        assertEq(core.referralPaid(), 0);
    }

    function test_referralCappedByTreasuryShare() public {
        _bobJoinsUnderAlice(0.004 ether);
        vm.warp(MARKET_OPEN + 5 hours);
        _catchUp();
        uint256 treasury = core.treasuryPending();
        vm.prank(TREASURY);
        core.withdrawTreasuryShare(treasury); // empties the treasury share
        vm.prank(bob);
        core.refine(1e18, false);
        assertEq(core.referralPaid(), 0, "nothing left to pay from");
        _conservation();
    }

    // ------------------------------------------------------------------ dev / treasury

    function test_devWithdrawal_queuedAndLimited() public {
        _aliceMinesThroughGenesis();
        uint256 pending = core.devPending();
        assertGt(pending, 0);

        vm.prank(alice);
        vm.expectRevert(MiningCore.NotRecipient.selector);
        core.withdrawDevShare(1);
        vm.prank(alice);
        vm.expectRevert(MiningCore.NotRecipient.selector);
        core.withdrawTreasuryShare(1);

        vm.startPrank(DEV);
        vm.expectRevert(MiningCore.ZeroValue.selector);
        core.withdrawDevShare(0);
        vm.expectRevert(
            abi.encodeWithSelector(MiningAccounting.InsufficientShare.selector, pending)
        );
        core.withdrawDevShare(pending + 1);
        core.withdrawDevShare(pending);
        vm.stopPrank();
        assertEq(core.devPending(), 0);
        assertEq(core.refineRequest(DEV, 0).amount, pending, "standard queue only");
        assertEq(core.refineRequest(DEV, 0).readyAt, MARKET_OPEN + 72 hours);
        _conservation();
    }

    function test_shareDailyLimit() public {
        _aliceMinesThroughGenesis();
        _setDevPending(500_000e18);
        vm.startPrank(DEV);
        core.withdrawDevShare(60_000e18);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.ShareLimitExceeded.selector, 40_000e18));
        core.withdrawDevShare(40_001e18);
        core.withdrawDevShare(40_000e18);
        vm.expectRevert(abi.encodeWithSelector(MiningCore.ShareLimitExceeded.selector, 0));
        core.withdrawDevShare(1);
        vm.warp(vm.getBlockTimestamp() + 1 days);
        _catchUp();
        uint256 pending = core.devPending(); // 400K plus a day of dev share
        core.withdrawDevShare(100_000e18); // a new UTC day
        vm.stopPrank();
        assertEq(core.devPending(), pending - 100_000e18);
    }

    function test_treasuryWithdrawalSeparateLimit() public {
        _aliceMinesThroughGenesis();
        uint256 pending = core.treasuryPending();
        vm.prank(TREASURY);
        core.withdrawTreasuryShare(pending);
        assertEq(core.refineRequest(TREASURY, 0).amount, pending);
        assertEq(core.devRecipient(), DEV);
        assertEq(core.treasuryRecipient(), TREASURY);
    }

    // ------------------------------------------------------------------ mint breaker

    function test_breakerTripsAndStopsAllMintPaths() public {
        _aliceMinesThroughGenesis();
        _setUnrefined(alice, 400_000e18);
        vm.startPrank(alice);
        core.refine(100_000e18, false); // queued for later
        core.refine(100_000e18, true); // 92K minted
        uint256 balance = mohn.balanceOf(alice);
        uint256 unrefinedBefore = core.positionOf(alice).unrefined;

        vm.expectEmit(address(core));
        emit MiningCore.MintBreakerTripped(92_000e18 + 64_400e18);
        core.refine(70_000e18, true); // 64.4K more would make 156.4K: trips, mints nothing
        assertTrue(core.mintBreakerTripped());
        assertEq(mohn.balanceOf(alice), balance);
        assertEq(core.positionOf(alice).unrefined, unrefinedBefore, "nothing refined");

        vm.expectRevert(MiningCore.MintPaused.selector);
        core.refine(1e18, true);
        vm.stopPrank();

        vm.warp(MARKET_OPEN + 72 hours);
        _catchUp();
        vm.expectRevert(MiningCore.MintPaused.selector);
        core.finalizeRefine(alice, 0);

        bytes32 role = core.DEFAULT_ADMIN_ROLE();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role
            )
        );
        core.resetMintBreaker();

        vm.expectEmit(address(core));
        emit MiningCore.MintBreakerReset();
        vm.prank(admin);
        core.resetMintBreaker();
        core.finalizeRefine(alice, 0);
        assertEq(mohn.balanceOf(alice), balance + 100_000e18);
    }

    function test_breakerTripOnFinalizeKeepsRequest() public {
        _aliceMinesThroughGenesis();
        _setUnrefined(alice, 400_000e18);
        vm.startPrank(alice);
        core.refine(100_000e18, false);
        core.refine(100_000e18, false);
        vm.stopPrank();
        vm.warp(MARKET_OPEN + 72 hours);
        _catchUp();
        core.finalizeRefine(alice, 0);
        core.finalizeRefine(alice, 1); // 200K within the window: trips
        assertTrue(core.mintBreakerTripped());
        assertEq(core.refineRequest(alice, 1).amount, 100_000e18, "still queued");
        assertEq(mohn.balanceOf(alice), 100_000e18);
    }

    function test_breakerWindowSlides() public {
        _aliceMinesThroughGenesis();
        _setUnrefined(alice, 400_000e18);
        vm.startPrank(alice);
        core.refine(100_000e18, true); // 92K at t0

        vm.warp(MARKET_OPEN + 65 minutes); // the t0 bucket has left the 13-bucket window
        _catchUp();
        core.refine(100_000e18, true); // another 92K: fine
        assertFalse(core.mintBreakerTripped());

        vm.warp(MARKET_OPEN + 120 minutes); // 55 minutes later: the previous 92K still counts
        _catchUp();
        core.refine(100_000e18, true);
        vm.stopPrank();
        assertTrue(core.mintBreakerTripped());
    }

    function test_breakerSameBucketAccumulates() public {
        _aliceMinesThroughGenesis();
        _setUnrefined(alice, 400_000e18);
        vm.startPrank(alice);
        for (uint256 i = 0; i < 16; ++i) {
            core.refine(10_000e18, true); // 9.2K each, all in one 5-minute bucket
        }
        assertFalse(core.mintBreakerTripped(), "16 x 9.2K = 147.2K");
        core.refine(10_000e18, true);
        vm.stopPrank();
        assertTrue(core.mintBreakerTripped(), "156.4K");
    }
}
