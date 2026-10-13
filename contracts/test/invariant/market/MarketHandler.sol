// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {Position} from "@uniswap/v4-core/src/libraries/Position.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {MiningCore} from "../../../src/MiningCore.sol";
import {MohnToken} from "../../../src/MohnToken.sol";
import {RevenueRouter} from "../../../src/RevenueRouter.sol";
import {LiquidityManager} from "../../../src/LiquidityManager.sol";
import {BuybackBurner} from "../../../src/BuybackBurner.sol";
import {MohnPool} from "../../../src/lib/MohnPool.sol";
import {PriceAnchor} from "../../../src/lib/PriceAnchor.sol";
import {PoolSwapper} from "../../utils/PoolSwapper.sol";

/// @notice Market-layer handler (AI review ACC-5): third-party buys and sells, just-in-time
///         narrow liquidity, fuel revenue into the buckets, keeper buybacks and liquidity
///         additions within their budgets, fee collection, attempts to open the market again,
///         and time. Keeps ghosts for NEW-17 to NEW-20 and K1 to K3 (docs/04 S2).
/// @dev bound() logs through the console, which would consume a pending prank: bound first.
contract MarketHandler is Test {
    using StateLibrary for IPoolManager;

    IPoolManager public immutable pm;
    MiningCore public immutable core;
    MohnToken public immutable mohn;
    RevenueRouter public immutable router;
    LiquidityManager public immutable lm;
    BuybackBurner public immutable bb;
    PoolSwapper public immutable trader;
    address public immutable keeper;
    PoolId internal immutable id;
    bytes32 internal immutable positionId;

    // one just-in-time position at a time
    bool public jitOpen;
    int24 internal jitLower;
    int24 internal jitUpper;
    int256 internal jitLiquidity;

    // ETH ghosts (NEW-18, NEW-19)
    uint256 public ghostBuybackDeposits;
    uint256 public ghostBuybackPulled;
    uint256 public ghostBuybackReturned;
    uint256 public ghostPolDeposits;
    uint256 public ghostPolPulled;

    // violations
    uint128 public lastPositionLiquidity;
    uint256 public liquidityDecreases;
    uint256 public bandViolations;
    uint256 public anchorMoves;
    uint256 public strayBuybackEth;
    uint256 public reopenSuccesses;

    // coverage (non-vacuity)
    mapping(bytes32 action => uint256 successes) public hits;

    constructor(
        IPoolManager pm_,
        MiningCore core_,
        MohnToken mohn_,
        RevenueRouter router_,
        LiquidityManager lm_,
        BuybackBurner bb_,
        PoolSwapper trader_,
        address keeper_
    ) {
        pm = pm_;
        core = core_;
        mohn = mohn_;
        router = router_;
        lm = lm_;
        bb = bb_;
        trader = trader_;
        keeper = keeper_;
        id = lm_.poolKey().toId();
        positionId = Position.calculatePositionKey(
            address(lm_), MohnPool.tickLower(), MohnPool.tickUpper(), bytes32(0)
        );
        lastPositionLiquidity = pm_.getPositionLiquidity(id, positionId);
    }

    /// K3: a call in the same block never moves the anchor (it folds time, not swaps); L1 after
    /// every call.
    modifier checked() {
        int24 anchorBefore = lm.anchorTick();
        _;
        if (lm.anchorTick() != anchorBefore) ++anchorMoves;
        uint128 liquidity = pm.getPositionLiquidity(id, positionId);
        if (liquidity < lastPositionLiquidity) ++liquidityDecreases;
        lastPositionLiquidity = liquidity;
        if (address(bb).balance != 0) ++strayBuybackEth;
    }

    // ------------------------------------------------------------------ third parties

    function buy(uint256 seed) external checked {
        uint256 amount = bound(seed, 1e9, lm.poolEth() / 10 + 1e9);
        vm.deal(address(trader), address(trader).balance + amount);
        try trader.swap(_key(), true, amount) {
            ++hits["buy"];
        } catch {}
    }

    function sell(uint256 seed) external checked {
        uint256 balance = mohn.balanceOf(address(trader));
        if (balance < 1e9) return;
        uint256 amount = bound(seed, 1e9, balance);
        try trader.swap(_key(), false, amount) {
            ++hits["sell"];
        } catch {}
    }

    /// Opens a narrow position around the price (1-40x the pool's active liquidity), or closes
    /// the open one.
    function jit(uint256 seed) external checked {
        if (jitOpen) {
            try trader.modify(_key(), jitLower, jitUpper, -jitLiquidity) {
                jitOpen = false;
                ++hits["jitClose"];
            } catch {}
            return;
        }
        uint256 mult = bound(seed, 1, 40);
        (, int24 tick,,) = pm.getSlot0(id);
        int24 lower = (tick / 60) * 60;
        if (tick < 0 && tick % 60 != 0) lower -= 60;
        int256 liquidity = int256(uint256(pm.getLiquidity(id)) * mult);
        vm.deal(address(trader), address(trader).balance + 10 ether);
        try trader.modify(_key(), lower, lower + 60, liquidity) {
            (jitOpen, jitLower, jitUpper, jitLiquidity) = (true, lower, lower + 60, liquidity);
            ++hits["jitOpen"];
        } catch {}
    }

    /// Fuel revenue reaching the router (MiningCore is its depositor).
    function deposit(uint256 seed) external checked {
        uint256 amount = bound(seed, 1e12, 1 ether);
        uint256 buyback = router.buybackBalance();
        uint256 pol = router.polBalance();
        vm.deal(address(core), amount);
        vm.prank(address(core));
        router.deposit{value: amount}();
        ghostBuybackDeposits += router.buybackBalance() - buyback;
        ghostPolDeposits += router.polBalance() - pol;
        ++hits["deposit"];
    }

    // ------------------------------------------------------------------ keeper

    function buyback(uint256 seed) external checked {
        (uint256 budget, uint256 used) = _today(
            bb.day(), bb.dayBudget(), bb.spentInDay(), router.buybackBalance(), bb.dailyBps()
        );
        if (used >= budget) return;
        uint256 amount = bound(seed, 1, budget - used);
        int24 anchor = lm.anchorTick();
        (, int24 tickBefore,,) = pm.getSlot0(id);
        uint256 spentBefore = bb.totalEthSpent();
        vm.prank(keeper);
        try bb.executeBuyback(amount, 0) {
            uint256 paid = bb.totalEthSpent() - spentBefore;
            ghostBuybackPulled += amount;
            ghostBuybackReturned += amount - paid;
            // K2: it may start only above the band floor and never ends below it.
            if (tickBefore <= anchor - PriceAnchor.MAX_DEVIATION) ++bandViolations;
            if (_belowFloor(anchor)) ++bandViolations;
            ++hits["buyback"];
        } catch {}
    }

    function addLiquidity(uint256 seed) external checked {
        (uint256 budget, uint256 used) = _today(
            lm.addDay(), lm.addBudget(), lm.addedInDay(), router.polBalance(), lm.ADD_DAILY_BPS()
        );
        if (used + 2 > budget) return;
        uint256 amount = bound(seed, 2, budget - used);
        int24 anchor = lm.anchorTick();
        (, int24 tickBefore,,) = pm.getSlot0(id);
        vm.prank(keeper);
        try lm.addLiquidity(amount, 0) {
            ghostPolPulled += amount;
            // K2: only within the band, and its swap never ends below the floor.
            int24 d = tickBefore > anchor ? tickBefore - anchor : anchor - tickBefore;
            if (d > PriceAnchor.MAX_DEVIATION) ++bandViolations;
            if (_belowFloor(anchor)) ++bandViolations;
            ++hits["addLiquidity"];
        } catch {}
    }

    function collectFees() external checked {
        lm.collectFees();
        ++hits["collect"];
    }

    /// NEW-20: Market Open happens once.
    function reopen() external checked {
        try core.openMarket() {
            ++reopenSuccesses;
        } catch {}
        vm.prank(address(core));
        try lm.openMarket(1, 0) {
            ++reopenSuccesses;
        } catch {}
    }

    function warp(uint256 seed) external {
        vm.warp(vm.getBlockTimestamp() + bound(seed, 1, 6 hours));
    }

    // ------------------------------------------------------------------ helpers

    /// The price (not the tick: at an initialized tick boundary the pool reports tick - 1 for
    /// the boundary price itself) went below the band floor.
    function _belowFloor(int24 anchor) internal view returns (bool) {
        (uint160 sqrtPriceX96,,,) = pm.getSlot0(id);
        return sqrtPriceX96 < TickMath.getSqrtPriceAtTick(anchor - PriceAnchor.MAX_DEVIATION);
    }

    /// The day's budget and spend as the contract will see them on its next call.
    function _today(uint64 day, uint256 budget, uint256 used, uint256 bucket, uint256 bps)
        internal
        view
        returns (uint256, uint256)
    {
        if (day < vm.getBlockTimestamp() / 1 days) return ((bucket * bps) / 10_000, 0);
        return (budget, used);
    }

    function _key() internal view returns (PoolKey memory) {
        return lm.poolKey();
    }
}
