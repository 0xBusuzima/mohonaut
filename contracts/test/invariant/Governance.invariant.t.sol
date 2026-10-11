// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {MohnToken} from "../../src/MohnToken.sol";
import {MockAggregator} from "../mocks/MockAggregator.sol";
import {MockRouter} from "../mocks/MockRouter.sol";

/// @notice Random parameter changes by the Timelock, random Guardian pauses, random time jumps.
contract GovernanceHandler is Test {
    MiningCore public immutable core;
    address public immutable timelock;
    address public immutable guardian;

    uint256 public rateViolations; // two successful changes of one parameter within its period
    uint256 public changes;
    mapping(uint256 param => uint256 timestamp) public lastChange;

    constructor(MiningCore core_, address timelock_, address guardian_) {
        core = core_;
        timelock = timelock_;
        guardian = guardian_;
    }

    function setParam(uint8 paramSeed, uint256 value) external {
        MiningCore.Param p = MiningCore.Param(paramSeed % 8);
        (uint256 min, uint256 max,,) = core.paramBounds(p);
        // Mostly in range (so changes happen), sometimes out of range (must revert).
        value = paramSeed % 5 == 0 ? value : bound(value, min, max);
        vm.prank(timelock);
        try core.setParam(p, value) {
            (,,, uint64 period) = core.paramBounds(p);
            uint256 last = lastChange[uint256(p)];
            if (last != 0 && block.timestamp < last + period) ++rateViolations;
            lastChange[uint256(p)] = block.timestamp;
            ++changes;
        } catch {}
    }

    function pause() external {
        vm.prank(guardian);
        try core.pause() {} catch {}
    }

    function warp(uint32 dt) external {
        vm.warp(block.timestamp + bound(dt, 1, 20 days));
    }
}

contract GovernanceInvariantTest is Test {
    MiningCore internal core;
    GovernanceHandler internal handler;

    function setUp() public {
        uint64 genesis = 1_800_003_600 - (1_800_003_600 % 3600);
        vm.warp(genesis - 12 hours);
        address timelock = makeAddr("timelock");
        address guardian = makeAddr("guardian");
        MockAggregator feed = new MockAggregator(8, 2500e8);
        MockRouter router = new MockRouter();
        address impl = deployCode("MiningCore.sol:MiningCore");
        address proxyAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        MohnToken mohn = new MohnToken(proxyAddr);
        core = MiningCore(
            address(
                new ERC1967Proxy(
                    impl,
                    abi.encodeCall(
                        MiningCore.initialize,
                        (
                            timelock,
                            address(mohn),
                            address(router),
                            address(feed),
                            address(0),
                            genesis,
                            0.1e18,
                            address(0xDE7),
                            address(0x7EA5)
                        )
                    )
                )
            )
        );
        vm.startPrank(timelock);
        core.grantRole(core.GUARDIAN_ROLE(), guardian);
        vm.stopPrank();
        handler = new GovernanceHandler(core, timelock, guardian);
        targetContract(address(handler));
    }

    /// P1: every parameter always within its coded bounds.
    function invariant_paramsWithinBounds() public view {
        for (uint256 i = 0; i < 8; ++i) {
            MiningCore.Param p = MiningCore.Param(i);
            (uint256 min, uint256 max,,) = core.paramBounds(p);
            uint256 v = core.paramValue(p);
            assertGe(v, min);
            assertLe(v, max);
        }
    }

    /// P1: no parameter changed twice within its rate-limit period.
    function invariant_rateLimitsHold() public view {
        assertEq(handler.rateViolations(), 0);
    }

    /// P2: a Guardian-only pause never lasts more than 72 hours from now.
    function invariant_guardianPauseBounded() public view {
        assertLe(core.pausedUntil(), vm.getBlockTimestamp() + core.GUARDIAN_PAUSE());
    }

    /// The handler really changes parameters (not vacuous).
    function test_handlerChangesParams() public {
        handler.setParam(1, 0); // VrgdaR within bounds: lower edge rejected by the step rule
        handler.setParam(3, 600); // FastRefineFee
        assertEq(handler.changes(), 1);
        handler.pause();
        assertGt(core.pausedUntil(), 0);
    }
}
