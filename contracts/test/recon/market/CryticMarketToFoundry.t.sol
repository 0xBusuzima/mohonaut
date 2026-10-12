// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CryticMarketTester} from "./CryticMarketTester.sol";

/// @notice Runs the market property harness under Foundry: an invariant campaign over the same
///         target functions, plus a fixed sequence through every flow.
/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 64
contract CryticMarketToFoundry is Test {
    CryticMarketTester internal tester;

    function setUp() public {
        // deployCode keeps the harness's large creation code out of this test contract.
        tester = CryticMarketTester(deployCode("CryticMarketTester.sol:CryticMarketTester"));
        targetContract(address(tester));
        bytes4[] memory selectors = new bytes4[](11);
        selectors[0] = tester.buy.selector;
        selectors[1] = tester.sell.selector;
        selectors[2] = tester.jit.selector;
        selectors[3] = tester.deposit.selector;
        selectors[4] = tester.buyback.selector;
        selectors[5] = tester.addLiquidity.selector;
        selectors[6] = tester.collectFees.selector;
        selectors[7] = tester.reopen.selector;
        selectors[8] = tester.warp.selector;
        selectors[9] = tester.buyback.selector;
        selectors[10] = tester.check_market.selector;
        targetSelector(FuzzSelector({addr: address(tester), selectors: selectors}));
    }

    function invariant_allMarketProperties() public view {
        tester.check_market();
    }

    /// Every flow once, then all properties.
    function test_sequenceCoversEveryFlow() public {
        tester.deposit(1 ether);
        tester.addLiquidity(1e15);
        tester.buy(1e15);
        tester.sell(1e20);
        tester.jit(30);
        tester.buyback(1e15);
        tester.jit(0);
        tester.collectFees();
        tester.reopen();
        tester.warp(6 hours);
        tester.warp(6 hours);
        tester.warp(6 hours);
        tester.warp(6 hours);
        tester.buyback(type(uint256).max);
        tester.addLiquidity(type(uint256).max);
        tester.check_market();
    }
}
