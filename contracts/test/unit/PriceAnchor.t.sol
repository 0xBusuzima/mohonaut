// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {PriceAnchor} from "../../src/lib/PriceAnchor.sol";

/// @dev Exposes the library's storage functions.
contract PriceAnchorHarness {
    PriceAnchor.State internal s;

    function start(int24 tick, uint256 nowTs) external {
        PriceAnchor.start(s, tick, nowTs);
    }

    function update(int24 tick, uint256 nowTs) external {
        PriceAnchor.update(s, tick, nowTs);
    }

    function current(int24 tick, uint256 nowTs) external view returns (int256) {
        return PriceAnchor.current(s, tick, nowTs);
    }

    function state() external view returns (int256, uint64) {
        return (s.emaWad, s.updatedAt);
    }

    function buyLimit(int24 tick, int24 anchor) external pure returns (uint160) {
        return PriceAnchor.buyLimit(tick, anchor);
    }

    function requireNear(int24 tick, int24 anchor) external pure {
        PriceAnchor.requireNear(tick, anchor);
    }
}

/// @notice The keeper price anchor (docs/02 S10.1, AI review AI-2).
contract PriceAnchorTest is Test {
    int256 internal constant WAD = 1e18;
    PriceAnchorHarness internal h;

    function setUp() public {
        h = new PriceAnchorHarness();
    }

    function test_constants() public pure {
        assertEq(PriceAnchor.TAU, 1 hours);
        assertEq(PriceAnchor.MAX_DEVIATION, 296);
        // 1.0001^296 is about 1.030: the 3 % band.
        uint256 ratio = (uint256(TickMath.getSqrtPriceAtTick(296)) ** 2) >> 96;
        assertApproxEqRel(ratio, uint256(1.03e18) * (2 ** 96) / 1e18, 0.001e18);
    }

    function test_fold() public pure {
        assertEq(PriceAnchor.fold(5 * WAD, 100, 0), 5 * WAD, "no time, no change");
        assertEq(PriceAnchor.fold(0, 1000, 1 hours), 500 * WAD, "TAU moves halfway");
        assertEq(PriceAnchor.fold(0, -1000, 1 hours), -500 * WAD);
        assertEq(PriceAnchor.fold(0, 1000, 3 hours), 750 * WAD);
        assertEq(PriceAnchor.fold(7 * WAD, 7, 1 days), 7 * WAD, "a held average stays");
    }

    /// The new average lies between the old one and the held tick.
    function testFuzz_foldIsBetween(int256 ema, int24 tick, uint64 dt) public pure {
        ema = bound(ema, int256(TickMath.MIN_TICK) * WAD, int256(TickMath.MAX_TICK) * WAD);
        tick = int24(bound(tick, TickMath.MIN_TICK, TickMath.MAX_TICK));
        int256 r = PriceAnchor.fold(ema, tick, dt);
        int256 t = int256(tick) * WAD;
        assertGe(r, ema < t ? ema : t);
        assertLe(r, ema < t ? t : ema);
    }

    function test_toTickRoundsDown() public pure {
        assertEq(PriceAnchor.toTick(15e17), 1);
        assertEq(PriceAnchor.toTick(1e18), 1);
        assertEq(PriceAnchor.toTick(0), 0);
        assertEq(PriceAnchor.toTick(-1), -1);
        assertEq(PriceAnchor.toTick(-1e18), -1);
        assertEq(PriceAnchor.toTick(-15e17), -2);
    }

    function test_startUpdateCurrent() public {
        vm.expectRevert(PriceAnchor.AnchorNotSet.selector);
        h.current(0, 1);
        h.start(-200, 1000);
        (int256 ema, uint64 at) = h.state();
        assertEq(ema, -200 * WAD);
        assertEq(at, 1000);
        assertEq(h.current(1800, 1000 + 1 hours), 800 * WAD, "view folds the held tick");
        h.update(1800, 1000 + 1 hours);
        (ema, at) = h.state();
        assertEq(ema, 800 * WAD);
        assertEq(at, 1000 + 1 hours);
        h.update(-5000, 1000 + 1 hours); // same timestamp: unchanged
        (ema,) = h.state();
        assertEq(ema, 800 * WAD);
    }

    /// A pump held in every one-second block for 10 minutes moves the anchor only about 15 % of the
    /// way: frequent updates move it no faster than exp(-dt/TAU).
    function test_pumpHeldEveryBlockMovesTheAnchorSlowly() public {
        h.start(0, 1);
        int24 pumped = -13_863; // MOHN price x4
        uint256 t = 1;
        for (uint256 i = 0; i < 600; ++i) {
            t += 1;
            h.update(pumped, t);
        }
        (int256 ema,) = h.state();
        int24 anchor = PriceAnchor.toTick(ema);
        assertGt(anchor, pumped + PriceAnchor.MAX_DEVIATION, "still far from the pumped price");
        assertGt(anchor, (int256(pumped) * 16) / 100, "about exp(-1/6) of the gap remains");
    }

    function test_buyLimit() public view {
        assertEq(h.buyLimit(0, 0), TickMath.getSqrtPriceAtTick(-296));
        assertEq(h.buyLimit(-295, 0), TickMath.getSqrtPriceAtTick(-296));
        assertEq(h.buyLimit(500, 0), TickMath.getSqrtPriceAtTick(-296), "cheap MOHN: allowed");
        assertEq(
            h.buyLimit(TickMath.MIN_TICK + 2, TickMath.MIN_TICK + 10),
            TickMath.getSqrtPriceAtTick(TickMath.MIN_TICK + 1),
            "clamped above MIN_TICK"
        );
    }

    function test_buyLimitRevertsPastTheBand() public {
        vm.expectRevert(abi.encodeWithSelector(PriceAnchor.PriceOffAnchor.selector, -296, 0));
        h.buyLimit(-296, 0);
        vm.expectRevert(abi.encodeWithSelector(PriceAnchor.PriceOffAnchor.selector, -9000, 10));
        h.buyLimit(-9000, 10);
    }

    function test_requireNear() public {
        h.requireNear(296, 0);
        h.requireNear(-296, 0);
        h.requireNear(1000, 1000);
        vm.expectRevert(abi.encodeWithSelector(PriceAnchor.PriceOffAnchor.selector, 297, 0));
        h.requireNear(297, 0);
        vm.expectRevert(abi.encodeWithSelector(PriceAnchor.PriceOffAnchor.selector, -297, 0));
        h.requireNear(-297, 0);
    }
}
