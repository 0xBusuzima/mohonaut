// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {RevenueRouter} from "../../src/RevenueRouter.sol";

contract EthSink {
    receive() external payable {}
}

/// @notice ETH buckets (docs/02 S10): 55/30/15 split, pull-only payouts, R1.
contract RevenueRouterTest is Test {
    RevenueRouter internal router;
    address internal admin = makeAddr("admin");
    address internal core = makeAddr("core");
    address internal ops = address(new EthSink());
    address internal buyback = address(new EthSink());
    address internal pol = address(new EthSink());
    address internal lm = address(new EthSink());

    function setUp() public {
        router = new RevenueRouter(admin);
        vm.startPrank(admin);
        router.grantRole(router.DEPOSITOR_ROLE(), core);
        router.grantRole(router.OPS_ROLE(), ops);
        router.grantRole(router.BUYBACK_ROLE(), buyback);
        router.grantRole(router.POL_ROLE(), pol);
        router.grantRole(router.FEE_DEPOSITOR_ROLE(), lm);
        vm.stopPrank();
        vm.deal(core, 100 ether);
        vm.deal(lm, 100 ether);
    }

    function _r1() internal view {
        assertEq(
            address(router).balance,
            router.buybackBalance() + router.polBalance() + router.opsBalance(),
            "R1"
        );
    }

    function test_constructorRejectsZeroAdmin() public {
        vm.expectRevert(RevenueRouter.ZeroAddress.selector);
        new RevenueRouter(address(0));
    }

    function test_depositSplits55_30_15() public {
        vm.expectEmit(address(router));
        emit RevenueRouter.Deposited(1 ether, 0.55 ether, 0.3 ether, 0.15 ether);
        vm.prank(core);
        router.deposit{value: 1 ether}();
        assertEq(router.buybackBalance(), 0.55 ether);
        assertEq(router.polBalance(), 0.3 ether);
        assertEq(router.opsBalance(), 0.15 ether);
        _r1();
    }

    function test_roundingDustGoesToOps() public {
        vm.prank(core);
        router.deposit{value: 7}(); // 3.85 -> 3, 2.1 -> 2, ops 2
        assertEq(router.buybackBalance(), 3);
        assertEq(router.polBalance(), 2);
        assertEq(router.opsBalance(), 2);
        _r1();
    }

    function test_pullsPayOnlyTheirOwnRole() public {
        vm.prank(core);
        router.deposit{value: 1 ether}();
        vm.prank(buyback);
        router.pullBuyback(0.5 ether);
        vm.prank(pol);
        router.pullPol(0.3 ether);
        vm.prank(ops);
        router.withdrawOps(0.15 ether);
        assertEq(buyback.balance, 0.5 ether);
        assertEq(pol.balance, 0.3 ether);
        assertEq(ops.balance, 0.15 ether);
        assertEq(router.buybackBalance(), 0.05 ether);
        _r1();

        vm.prank(pol);
        vm.expectRevert(abi.encodeWithSelector(RevenueRouter.InsufficientBucket.selector, 0));
        router.pullPol(1);
        bytes32 polRole = router.POL_ROLE();
        vm.prank(buyback);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, buyback, polRole
            )
        );
        router.pullPol(0);
        vm.prank(buyback);
        vm.expectRevert(
            abi.encodeWithSelector(RevenueRouter.InsufficientBucket.selector, 0.05 ether)
        );
        router.pullBuyback(0.05 ether + 1);
    }

    function test_roles() public {
        bytes32 depositor = router.DEPOSITOR_ROLE();
        bytes32 feeDepositor = router.FEE_DEPOSITOR_ROLE();
        bytes32 opsRole = router.OPS_ROLE();
        address stranger = makeAddr("stranger");
        vm.deal(stranger, 1 ether);
        vm.startPrank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, depositor
            )
        );
        router.deposit{value: 1}();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, feeDepositor
            )
        );
        router.depositBuyback{value: 1}();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, opsRole
            )
        );
        router.withdrawOps(0);
        vm.stopPrank();
    }

    function test_feeDepositGoesToBuyback() public {
        vm.prank(lm);
        router.depositBuyback{value: 1 ether}();
        assertEq(router.buybackBalance(), 1 ether);
        _r1();
    }

    function testFuzz_r1(uint96 a, uint96 b, uint96 fee) public {
        vm.deal(core, uint256(a) + b);
        vm.deal(lm, fee);
        vm.startPrank(core);
        router.deposit{value: a}();
        router.deposit{value: b}();
        vm.stopPrank();
        vm.prank(lm);
        router.depositBuyback{value: fee}();
        _r1();
        assertEq(address(router).balance, uint256(a) + b + fee);
    }
}
