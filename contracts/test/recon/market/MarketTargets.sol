// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {PriceAnchor} from "../../../src/lib/PriceAnchor.sol";
import {MarketProperties} from "./MarketProperties.sol";

/// @title MarketTargets
/// @notice The market actions the fuzzers call: third-party buys and sells, just-in-time
///         narrow liquidity, revenue, keeper buybacks and additions within their budgets, fee
///         collection, attempts to open the market again, and time. Reverts are allowed.
abstract contract MarketTargets is MarketProperties {
    using StateLibrary for IPoolManager;

    bool internal jitOpen;
    int24 internal jitLower;
    int256 internal jitLiquidity;
    uint128 internal lastPositionLiquidity;

    /// K3 and L1 after every action; the BuybackBurner never keeps ETH.
    modifier checked() {
        int24 anchorBefore = lm.anchorTick();
        _;
        if (lm.anchorTick() != anchorBefore) ++anchorMoves;
        uint128 liquidity = _positionLiquidity();
        if (liquidity < lastPositionLiquidity) ++liquidityDecreases;
        lastPositionLiquidity = liquidity;
        if (address(bb).balance != 0) ++strayBuybackEth;
    }

    function _clamp(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) {
        return hi <= lo ? lo : lo + (x % (hi - lo + 1));
    }

    function _key() internal view returns (PoolKey memory) {
        return lm.poolKey();
    }

    function buy(uint256 seed) public checked {
        uint256 amount = _clamp(seed, 1e9, lm.poolEth() / 10 + 1e9);
        if (address(trader).balance < amount) hevm.deal(address(trader), amount * 2);
        try trader.swap(_key(), true, amount) {} catch {}
    }

    function sell(uint256 seed) public checked {
        uint256 balance = mohn.balanceOf(address(trader));
        if (balance < 1e9) return;
        try trader.swap(_key(), false, _clamp(seed, 1e9, balance)) {} catch {}
    }

    function jit(uint256 seed) public checked {
        if (jitOpen) {
            try trader.modify(_key(), jitLower, jitLower + 60, -jitLiquidity) {
                jitOpen = false;
            } catch {}
            return;
        }
        int24 tick = _tick();
        int24 lower = (tick / 60) * 60;
        if (tick < 0 && tick % 60 != 0) lower -= 60;
        int256 liquidity = int256(uint256(pm.getLiquidity(poolId)) * _clamp(seed, 1, 40));
        try trader.modify(_key(), lower, lower + 60, liquidity) {
            (jitOpen, jitLower, jitLiquidity) = (true, lower, liquidity);
        } catch {}
    }

    function deposit(uint256 seed) public checked {
        uint256 buyback = router.buybackBalance();
        uint256 pol = router.polBalance();
        router.deposit{value: _clamp(seed, 1e12, 1 ether)}();
        ghostBuybackDeposits += router.buybackBalance() - buyback;
        ghostPolDeposits += router.polBalance() - pol;
    }

    function buyback(uint256 seed) public checked {
        (uint256 budget, uint256 used) = _today(
            bb.day(), bb.dayBudget(), bb.spentInDay(), router.buybackBalance(), bb.dailyBps()
        );
        if (used >= budget) return;
        uint256 amount = _clamp(seed, 1, budget - used);
        int24 anchor = lm.anchorTick();
        int24 tickBefore = _tick();
        uint256 spentBefore = bb.totalEthSpent();
        try bb.executeBuyback(amount, 0) {
            ghostBuybackPulled += amount;
            ghostBuybackReturned += amount - (bb.totalEthSpent() - spentBefore);
            if (tickBefore <= anchor - PriceAnchor.MAX_DEVIATION) ++bandViolations;
            if (_belowFloor(anchor)) ++bandViolations;
        } catch {}
    }

    function addLiquidity(uint256 seed) public checked {
        (uint256 budget, uint256 used) = _today(
            lm.addDay(), lm.addBudget(), lm.addedInDay(), router.polBalance(), lm.ADD_DAILY_BPS()
        );
        if (used + 2 > budget) return;
        uint256 amount = _clamp(seed, 2, budget - used);
        int24 anchor = lm.anchorTick();
        int24 tickBefore = _tick();
        try lm.addLiquidity(amount, 0) {
            ghostPolPulled += amount;
            int24 d = tickBefore > anchor ? tickBefore - anchor : anchor - tickBefore;
            if (d > PriceAnchor.MAX_DEVIATION) ++bandViolations;
            if (_belowFloor(anchor)) ++bandViolations;
        } catch {}
    }

    /// The price (not the tick: at an initialized tick boundary the pool reports tick - 1 for
    /// the boundary price itself) went below the band floor.
    function _belowFloor(int24 anchor) internal view returns (bool) {
        (uint160 sqrtPriceX96,,,) = pm.getSlot0(poolId);
        return sqrtPriceX96 < TickMath.getSqrtPriceAtTick(anchor - PriceAnchor.MAX_DEVIATION);
    }

    function collectFees() public checked {
        lm.collectFees();
    }

    function reopen() public checked {
        try lm.openMarket(1, 0) {
            ++reopenSuccesses;
        } catch {}
    }

    function warp(uint256 dt) public {
        // Read before the warp on purpose: the new time is computed from the old one.
        // forge-lint: disable-next-line(environment-read-across-mutation)
        hevm.warp(block.timestamp + _clamp(dt, 1, 6 hours));
    }

    /// The day's budget and spend as the contract will see them on its next call.
    function _today(uint64 day, uint256 budget, uint256 used, uint256 bucket, uint256 bps)
        internal
        view
        returns (uint256, uint256)
    {
        if (day < block.timestamp / 1 days) return ((bucket * bps) / 10_000, 0);
        return (budget, used);
    }
}
