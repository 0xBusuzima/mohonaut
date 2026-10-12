// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {MiningAccounting} from "../../src/MiningAccounting.sol";
import {MiningCore} from "../../src/MiningCore.sol";
import {RevenueRouter} from "../../src/RevenueRouter.sol";
import {AccountantBase} from "./AccountantBase.sol";

contract EthReceiver {
    receive() external payable {}
}

/// @notice Sends its whole balance to `target` with SELFDESTRUCT. Under EIP-6780 (Cancun and later,
///         so also Prague) the opcode still transfers the balance even though the code survives
///         unless it runs in the creating transaction; the target cannot refuse it.
contract ForceSend {
    constructor(address payable target) payable {
        selfdestruct(target);
    }
}

/// @notice Audit (ACCOUNTANT): concrete call sequences for findings ACC-1 to ACC-3.
contract AccountantFindingsTest is AccountantBase {
    function setUp() public {
        _deploy();
    }

    // ------------------------------------------------------------------ ACC-1

    /// ACC-1: lockBucketRoles() makes LOCKED_ROLE the admin of the four bucket roles, but
    /// LOCKED_ROLE itself keeps the default admin (DEFAULT_ADMIN_ROLE = the 96 h Timelock).
    /// The Timelock grants itself LOCKED_ROLE and then rewires the buckets: the POL and buyback
    /// ETH can be pulled by any address it chooses, and the fuel deposit path can be cut.
    function test_ACC1_timelockReclaimsLockedBucketRoles() public {
        address lmAddr = address(new EthReceiver());
        address bbAddr = address(new EthReceiver());
        address thief = address(new EthReceiver());
        RevenueRouter r = new RevenueRouter(address(this)); // this contract = the Timelock
        r.grantRole(r.DEPOSITOR_ROLE(), address(core));
        r.grantRole(r.POL_ROLE(), lmAddr);
        r.grantRole(r.BUYBACK_ROLE(), bbAddr);
        r.grantRole(r.FEE_DEPOSITOR_ROLE(), lmAddr);
        r.lockBucketRoles();

        // The documented guarantee holds for a direct attempt...
        bytes32 polRole = r.POL_ROLE();
        bytes32 lockedRole = r.LOCKED_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, address(this), lockedRole
            )
        );
        r.grantRole(polRole, thief);

        // Revenue arrives.
        vm.deal(address(core), 10 ether);
        vm.prank(address(core));
        r.deposit{value: 10 ether}();
        uint256 pol = r.polBalance();
        uint256 buyback = r.buybackBalance();
        assertGt(pol + buyback, 0);

        // ...but not for the two-step one: LOCKED_ROLE's admin is still DEFAULT_ADMIN_ROLE.
        assertEq(r.getRoleAdmin(lockedRole), r.DEFAULT_ADMIN_ROLE(), "LOCKED_ROLE admin == 0x00");
        r.grantRole(lockedRole, address(this));
        r.grantRole(r.POL_ROLE(), thief);
        r.grantRole(r.BUYBACK_ROLE(), thief);
        r.revokeRole(r.POL_ROLE(), lmAddr);
        r.revokeRole(r.BUYBACK_ROLE(), bbAddr);
        r.revokeRole(r.DEPOSITOR_ROLE(), address(core)); // fuel purchases would now revert

        vm.startPrank(thief);
        r.pullPol(pol);
        r.pullBuyback(buyback);
        vm.stopPrank();
        assertEq(thief.balance, pol + buyback, "POL + buyback ETH redirected");
        assertFalse(r.hasRole(r.POL_ROLE(), lmAddr), "LiquidityManager unwired");
    }

    // ------------------------------------------------------------------ ACC-2

    /// ACC-2: R1 is asserted as an equality (balance == buckets), but ETH can be forced into the
    /// router (and into the MiningCore proxy) with SELFDESTRUCT. That ETH is in no bucket and no
    /// function can ever move it: R1 and "core never holds ETH" break, and the ETH is stuck.
    function test_ACC2_forcedEthBreaksR1AndIsStuck() public {
        // Normal revenue first.
        vm.warp(GENESIS);
        _fresh();
        address driller = makeAddr("driller");
        vm.deal(driller, 1 ether);
        vm.prank(driller);
        core.buyFuel{value: 0.0009 ether}(address(0));
        uint256 buckets = router.buybackBalance() + router.polBalance() + router.opsBalance();
        assertEq(address(router).balance, buckets, "R1 before");

        new ForceSend{value: 1 ether}(payable(address(router)));
        new ForceSend{value: 1 ether}(payable(address(core)));

        assertEq(address(router).balance, buckets + 1 ether, "R1 equality broken");
        assertEq(address(core).balance, 1 ether, "core holds ETH");
        // Every exit of the router is bounded by a bucket, so the extra ether can never leave.
        address ops = address(new EthReceiver());
        router.grantRole(router.OPS_ROLE(), ops);
        uint256 opsBucket = router.opsBalance();
        vm.prank(ops);
        vm.expectRevert(
            abi.encodeWithSelector(RevenueRouter.InsufficientBucket.selector, opsBucket)
        );
        router.withdrawOps(opsBucket + 1);
    }

    // ------------------------------------------------------------------ ACC-3

    /// ACC-3: MohnToken is ERC20Burnable, so any holder can burn. docs/04 S2 states E2 as
    /// "totalSupply + pending + queue + R + burnedForever == CAP"; a plain holder burn (and every
    /// BuybackBurner / LiquidityManager burn) lowers totalSupply with no core counter rising. The
    /// equality is false in the live system; the invariant suites only hold because no handler
    /// ever burns (Market.t.sol's _conservation adds bb.totalBurned + lm.mohnFeesBurned, but a
    /// holder burn is still missing).
    function test_ACC3_holderBurnBreaksE2AsSpecified() public {
        address driller = makeAddr("driller");
        vm.deal(driller, 1 ether);
        vm.prank(driller);
        core.buyFuel{value: 0.0009 ether}(address(0));
        vm.warp(GENESIS + 72 hours + 1 hours);
        _catchUp();
        uint256 pending = core.pendingOf(driller);
        assertGt(pending, 0);
        vm.prank(driller);
        core.refine(50_000e18, true);
        assertEq(_e2Sum(), _cap(), "E2 holds before the burn");

        uint256 bal = mohn.balanceOf(driller);
        vm.prank(driller);
        mohn.burn(bal / 2);
        assertEq(_e2Sum(), _cap() - bal / 2, "E2 equality fails by exactly the holder burn");
    }

    // ------------------------------------------------------------------ ACC-6

    /// ACC-6: test/invariant/MiningCoreFuel.invariant.t.sol asserts tank <= capacity x
    /// maxTankHours as an invariant, but the cap is only checked at purchase: a (bounded, rate
    /// limited) Timelock decrease of MaxTankHours leaves existing tanks above it. The property
    /// only holds there because that handler never changes parameters.
    function test_ACC6_tankCapIsNotRetroactive() public {
        vm.warp(GENESIS + 73 hours);
        _catchUp();
        _fresh();
        address driller = makeAddr("driller");
        vm.deal(driller, 1 ether);
        vm.prank(driller);
        core.buyFuel{value: 0.17 ether}(address(0)); // 4,250 L of the 4,320 L cap (level 1)
        core.setParam(MiningCore.Param.MaxTankHours, 168);
        uint256 capNow = 6e18 * core.maxTankHours();
        assertGt(core.tankOf(driller), capNow, "tank above the current cap");
    }

    // ------------------------------------------------------------------ ACC-7

    /// ACC-7: the referral earmark is 3 % of every miners' share, released only when the account
    /// that earned it settles. Accrual of an account with no referrer that never acts again keeps
    /// its earmark locked inside treasuryPending forever, although no referral can ever be owed.
    function test_ACC7_earmarkOfDormantAccountsNeverReleased() public {
        address alice = makeAddr("alice"); // will never act again
        address bob = makeAddr("bob");
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);
        vm.prank(alice);
        core.buyFuel{value: 0.0009 ether}(address(0)); // no referrer
        vm.prank(bob);
        core.buyFuel{value: 0.0009 ether}(address(0)); // no referrer
        vm.warp(GENESIS + 100 hours); // both tanks are empty by now
        _catchUp();
        _fresh();
        vm.prank(bob);
        core.buyFuel{value: 0.001 ether}(address(0)); // bob settles: his earmark is released
        assertEq(core.siteOf(alice).referrer, address(0));
        assertEq(core.siteOf(bob).referrer, address(0));
        uint256 locked = core.referralReserve();
        // What is still earmarked is 3 % of alice's unsettled accrual: no referral can be owed.
        assertApproxEqAbs(locked, (core.pendingOf(alice) * 300) / 10_000, 1e6);
        assertGt(locked, 0);
        uint256 pendingTreasury = core.treasuryPending();
        vm.expectRevert(
            abi.encodeWithSelector(
                MiningAccounting.InsufficientShare.selector, pendingTreasury - locked
            )
        );
        vm.prank(TREASURY);
        core.withdrawTreasuryShare(pendingTreasury);
    }
}
