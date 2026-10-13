// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CryticTester} from "./CryticTester.sol";

/// @notice Runs the Medusa/Echidna property harness under Foundry: as an invariant campaign over
///         the same target functions, plus a fixed sequence that exercises every flow.
contract CryticToFoundry is Test {
    CryticTester internal tester;

    function setUp() public {
        // deployCode keeps the harness's large creation code out of this test contract.
        tester = CryticTester(deployCode("CryticTester.sol:CryticTester"));
        targetContract(address(tester));
        bytes4[] memory selectors = new bytes4[](12);
        selectors[0] = tester.buyFuel.selector;
        selectors[1] = tester.buyMachines.selector;
        selectors[2] = tester.upgradeSite.selector;
        selectors[3] = tester.setActiveRigs.selector;
        selectors[4] = tester.scrapMachines.selector;
        selectors[5] = tester.refine.selector;
        selectors[6] = tester.finalizeRefine.selector;
        selectors[7] = tester.warp.selector;
        selectors[8] = tester.poke.selector;
        selectors[9] = tester.setParam.selector;
        selectors[10] = tester.pause.selector;
        selectors[11] = tester.check_all.selector;
        targetSelector(FuzzSelector({addr: address(tester), selectors: selectors}));
    }

    function invariant_allProperties() public view {
        tester.check_all();
    }

    /// Every flow once, then all properties.
    function test_sequenceCoversEveryFlow() public {
        tester.warp(2 days);
        tester.warp(2 days); // past Market Open
        tester.buyFuel(0, 0.01 ether, 1);
        tester.buyFuel(1, 0.01 ether, 0);
        tester.warp(3 hours);
        tester.buyMachines(0, 0, 2);
        tester.upgradeSite(0);
        tester.setActiveRigs(0, 1, 1);
        tester.scrapMachines(0, 1, 1);
        tester.refine(1, 1e18, true);
        tester.refine(1, 1e18, false);
        tester.setParam(3, 600);
        tester.warp(2 days);
        tester.warp(1 days);
        tester.finalizeRefine(1, 0);
        tester.pause();
        tester.check_all();
    }
}
