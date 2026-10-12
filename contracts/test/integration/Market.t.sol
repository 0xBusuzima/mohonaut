// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "@uniswap/v4-core/src/libraries/FixedPoint96.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {CustomRevert} from "@uniswap/v4-core/src/libraries/CustomRevert.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

import {MiningCore} from "../../src/MiningCore.sol";
import {LiquidityManager} from "../../src/LiquidityManager.sol";
import {BuybackBurner} from "../../src/BuybackBurner.sol";
import {PoolActor} from "../../src/PoolActor.sol";
import {MarketOpenMath} from "../../src/lib/MarketOpenMath.sol";
import {PriceAnchor} from "../../src/lib/PriceAnchor.sol";
import {PoolSwapper} from "../utils/PoolSwapper.sol";
import {MarketBase} from "../utils/MarketBase.sol";

/// @notice Market Open, buyback & burn, protocol liquidity and fees (setup: test/utils/MarketBase.sol).
contract MarketTest is MarketBase {
    using StateLibrary for IPoolManager;

    // ------------------------------------------------------------------ market open

    function test_openMarket_formulaPriceAndLockedLiquidity() public {
        uint256 polEth = router.polBalance();
        uint256 p0 = MarketOpenMath.openingPrice(core.genesisFuelUsd(), core.genesisMinerAccrual());
        uint256 expectedLp = MarketOpenMath.lpAmount(polEth, 2500e18, p0);
        uint160 expectedSqrt = MarketOpenMath.sqrtPriceX96(2500e18, p0);
        assertEq(core.genesisFuelUsd(), 10 * 2.25e18, "10 x 22.5 L at $0.10");
        assertGt(core.genesisMinerAccrual(), 134_000e18, "~90 % of 72 h emission");
        uint256 reserveBefore = core.reserve();

        vm.expectEmit(address(core));
        emit MiningCore.MarketOpened(p0, 2500e18, polEth, expectedLp, expectedSqrt);
        vm.prank(makeAddr("anyone"));
        uint256 lp = _open();

        assertEq(lp, expectedLp);
        assertApproxEqRel(lp, 40_000e18, 0.1e18, "about 40K MOHN, as in docs/02 S11");
        assertEq(core.reserve(), reserveBefore - lp, "minted from the reserve");
        assertTrue(core.marketOpened());
        assertTrue(lm.opened());
        assertEq(_sqrtPrice(), expectedSqrt, "pool opens at the formula price");
        assertGt(_liquidity(), 0);
        assertEq(router.polBalance(), 0, "all POL ETH went into the pool");
        assertLt(LM_ADDR.balance, 1e12, "only rounding dust stays");
        assertLt(mohn.balanceOf(LM_ADDR), 1e15, "only rounding dust stays");
        _conservation();
    }

    /// The LiquidityManager's MarketOpened event reports exactly what went into the pool: the
    /// POL ETH and the minted MOHN minus the rounding dust that stays in the contract.
    function test_openMarketEventReportsExactAmounts() public {
        uint256 polEth = router.polBalance();
        vm.recordLogs();
        uint256 lp = _open();
        (uint256 ethIn, uint256 mohnIn, uint128 liquidity) = _lmMarketOpened(vm.getRecordedLogs());
        assertEq(ethIn + LM_ADDR.balance, polEth, "ETH in + dust = POL ETH");
        assertEq(mohnIn + mohn.balanceOf(LM_ADDR), lp, "MOHN in + dust = LP mint");
        assertEq(liquidity, _liquidity());
    }

    function _lmMarketOpened(Vm.Log[] memory logs)
        internal
        pure
        returns (uint256 ethIn, uint256 mohnIn, uint128 liquidity)
    {
        bytes32 topic = keccak256("MarketOpened(uint160,uint256,uint256,uint128)");
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].emitter == LM_ADDR && logs[i].topics[0] == topic) {
                (, ethIn, mohnIn, liquidity) =
                    abi.decode(logs[i].data, (uint160, uint256, uint256, uint128));
                return (ethIn, mohnIn, liquidity);
            }
        }
        revert("no MarketOpened from the LiquidityManager");
    }

    function test_openMarketGuards() public {
        vm.warp(MARKET_OPEN - 1);
        vm.expectRevert(MiningCore.MarketNotOpenYet.selector);
        core.openMarket();
        vm.warp(MARKET_OPEN);
        _open();
        vm.expectRevert(MiningCore.MarketAlreadyOpen.selector);
        core.openMarket();
        vm.expectRevert(LiquidityManager.NotCore.selector);
        lm.openMarket(1, 0);
        vm.prank(address(core));
        vm.expectRevert(LiquidityManager.AlreadyOpen.selector);
        lm.openMarket(1, 0);
    }

    function test_nobodyElseCanInitializeThePool() public {
        PoolKey memory key = _key();
        // The hook rejects any initializer but the LiquidityManager itself.
        vm.expectRevert(
            abi.encodeWithSelector(
                CustomRevert.WrappedError.selector,
                LM_ADDR,
                IHooks.beforeInitialize.selector,
                abi.encodeWithSelector(LiquidityManager.NotSelf.selector),
                abi.encodeWithSelector(Hooks.HookCallFailed.selector)
            )
        );
        pm.initialize(key, TickMath.getSqrtPriceAtTick(0));
        vm.expectRevert(PoolActor.NotPoolManager.selector);
        lm.beforeInitialize(address(lm), key, 1);
    }

    function test_hookAddressIsChecked() public {
        vm.expectRevert(LiquidityManager.BadHookAddress.selector);
        deployCode(
            "LiquidityManager.sol:LiquidityManager",
            abi.encode(admin, address(core), PM, address(mohn), address(router))
        );
    }

    function test_lmConstructorRejectsZeroAddresses() public {
        address target = address(uint160(LM_ADDR) + (1 << 14)); // same hook bits, free address
        vm.expectRevert(PoolActor.ZeroAddress.selector);
        deployCodeTo(
            "LiquidityManager.sol:LiquidityManager",
            abi.encode(address(0), address(core), PM, address(mohn), address(router)),
            target
        );
        vm.expectRevert(PoolActor.ZeroAddress.selector);
        deployCodeTo(
            "LiquidityManager.sol:LiquidityManager",
            abi.encode(admin, address(0), PM, address(mohn), address(router)),
            target
        );
    }

    function test_wiringIsOneTime() public {
        assertEq(core.liquidityManager(), LM_ADDR);
        vm.startPrank(admin);
        vm.expectRevert(MiningCore.AlreadyWired.selector);
        core.wireLiquidityManager(address(1));
        vm.stopPrank();
        MiningCore fresh = _deployCore();
        vm.startPrank(admin);
        vm.expectRevert(MiningCore.ZeroAddress.selector);
        fresh.wireLiquidityManager(address(0));
        vm.stopPrank();
        vm.expectRevert(MiningCore.ZeroAddress.selector);
        fresh.openMarket(); // not wired
        vm.prank(admin);
        fresh.wireLiquidityManager(address(1));
        vm.expectRevert(MarketOpenMath.NoGenesisActivity.selector);
        fresh.openMarket(); // nobody mined during its genesis
    }

    /// Audit fix: a large POL bucket (e.g. a late Market Open) no longer blocks the opening. The
    /// LP is clamped to the hourly mint limit, the pool still opens at P0, and the POL ETH that
    /// does not pair with the clamped LP stays in the router for addLiquidity.
    function test_openMarketClampsLpToTheMintLimit() public {
        vm.deal(address(core), 100 ether);
        vm.prank(address(core));
        router.deposit{value: 100 ether}(); // 30 ETH more POL: the formula LP is far above 150K
        uint256 polBefore = router.polBalance();
        uint256 p0 = MarketOpenMath.openingPrice(core.genesisFuelUsd(), core.genesisMinerAccrual());
        uint256 lp = _open();
        assertEq(lp, 150_000e18, "clamped to the hourly mint limit");
        assertTrue(core.marketOpened());
        assertEq(_sqrtPrice(), MarketOpenMath.sqrtPriceX96(2500e18, p0), "still opens at P0");
        uint256 used = (lp * p0) / 2500e18;
        assertEq(router.polBalance(), polBefore - used, "the rest stays in the POL bucket");
        _conservation();
    }

    // ------------------------------------------------------------------ buyback

    /// Today's buyback budget if the day's first buyback happened now: 1/20 of the bucket.
    function _bbBudget() internal view returns (uint256) {
        return (router.buybackBalance() * bb.dailyBps()) / 10_000;
    }

    /// Today's addLiquidity budget if the day's first addition happened now: 1/7 of the bucket.
    function _addBudget() internal view returns (uint256) {
        return (router.polBalance() * lm.ADD_DAILY_BPS()) / 10_000;
    }

    /// A keeper-sized chunk: about 1 % price impact, well inside the 3 % anchor band.
    function _chunk() internal view returns (uint256) {
        return lm.poolEth() / 200;
    }

    function _poolTick() internal view returns (int24 tick) {
        (, tick,,) = pm.getSlot0(_id());
    }

    function test_buyback_burnsEverythingBought() public {
        vm.prank(keeper);
        vm.expectRevert(PoolActor.MarketNotOpen.selector);
        bb.executeBuyback(1e12, 0);

        _open();
        uint256 supply = mohn.totalSupply();
        uint256 bucket = router.buybackBalance();
        // The genesis buyback bucket is spent over many days, at most 1/20 a day (docs/02 S10.1).
        assertEq(bb.dailyBps(), bb.INITIAL_DAILY_BPS());
        uint256 ethIn = _chunk();
        assertLt(ethIn, _bbBudget());
        vm.prank(keeper);
        bb.executeBuyback(ethIn, 1);
        assertGt(bb.totalBurned(), 0);
        assertEq(mohn.totalSupply(), supply - bb.totalBurned(), "100 % burned");
        assertEq(mohn.balanceOf(address(bb)), 0);
        assertEq(bb.totalEthSpent(), ethIn);
        assertEq(router.buybackBalance(), bucket - ethIn);
        assertEq(bb.dayBudget(), (bucket * 500) / 10_000, "fixed at the day's first buyback");
        _conservation();
    }

    /// v1.1: a buyback larger than the pool can absorb stops 3 % past the anchor; the unspent
    /// ETH goes back to the bucket, and a second buyback in the same block cannot go further.
    function test_buybackStopsAtTheAnchor() public {
        _open();
        uint256 bucket = router.buybackBalance();
        uint256 budget = _bbBudget();
        int24 anchorTick = lm.anchorTick();
        assertGt(budget, lm.poolEth() / 20, "the genesis budget is large for the young pool");

        vm.prank(keeper);
        bb.executeBuyback(budget, 1);
        uint256 spent = bb.totalEthSpent();
        assertGt(spent, 0);
        assertLt(spent, budget, "stopped at the price limit");
        assertEq(router.buybackBalance(), bucket - spent, "unspent ETH back in the bucket");
        assertEq(bb.spentInDay(), budget, "the day's budget counts what was asked");
        int24 tick = _poolTick();
        assertEq(tick, anchorTick - PriceAnchor.MAX_DEVIATION, "exactly at the 3 % limit");
        assertEq(lm.anchorTick(), anchorTick, "a swap in the same block does not move the anchor");

        vm.warp(MARKET_OPEN + 1 days);
        uint256 chunk = _chunk();
        vm.prank(keeper);
        bb.executeBuyback(chunk, 1); // the next day, near the anchor again: allowed
        _conservation();
    }

    function test_buybackGuards() public {
        _open();
        uint256 cap = _bbBudget();
        uint256 chunk = _chunk();
        bytes32 role = bb.KEEPER_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, address(this), role
            )
        );
        bb.executeBuyback(1e12, 0);

        vm.startPrank(keeper);
        vm.expectRevert(BuybackBurner.ZeroValue.selector);
        bb.executeBuyback(0, 0);
        vm.expectRevert(abi.encodeWithSelector(BuybackBurner.DailyCapExceeded.selector, cap));
        bb.executeBuyback(cap + 1, 0);
        vm.expectRevert(); // SlippageExceeded inside the callback
        bb.executeBuyback(chunk, type(uint256).max);
        bb.executeBuyback(chunk, 1);
        // The budget was fixed at the day's first buyback; the shrinking bucket does not move it.
        vm.expectRevert(
            abi.encodeWithSelector(BuybackBurner.DailyCapExceeded.selector, cap - chunk)
        );
        bb.executeBuyback(cap - chunk + 1, 0);
        vm.stopPrank();

        vm.warp(MARKET_OPEN + 1 days); // a new UTC day: a new budget from the bucket as it is now
        uint256 next = _bbBudget();
        vm.prank(keeper);
        bb.executeBuyback(chunk, 1);
        assertEq(bb.dayBudget(), next);
    }

    /// Manipulation scenario (docs/06 2.6, AI review AI-2): someone pumps the pool right before
    /// the keeper's buyback. The anchor has not moved, so the buyback cannot buy into the pump at
    /// all; holding the pumped price for minutes moves the anchor only a little.
    function test_pumpBeforeBuyback_isBlockedByTheAnchor() public {
        _open();
        uint256 chunk = _chunk();
        int24 anchorBefore = lm.anchorTick();
        vm.deal(address(trader), 1 ether);
        trader.swap(_key(), true, lm.poolEth()); // doubles the ETH side: MOHN price up ~4x
        int24 pumped = _poolTick();
        assertEq(lm.anchorTick(), anchorBefore, "same block: the anchor has not moved");

        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(PriceAnchor.PriceOffAnchor.selector, pumped, anchorBefore)
        );
        bb.executeBuyback(chunk, 1);

        skip(10 minutes); // the pump held for 10 minutes against arbitrage
        int24 anchorLater = lm.anchorTick();
        assertLt(anchorLater, anchorBefore, "the anchor follows");
        assertGt(anchorLater, pumped + PriceAnchor.MAX_DEVIATION, "but only slowly");
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(PriceAnchor.PriceOffAnchor.selector, pumped, anchorLater)
        );
        bb.executeBuyback(chunk, 1);
        assertEq(bb.totalEthSpent(), 0);
        _conservation();
    }

    function test_buybackDailyBpsBoundedAndRateLimited() public {
        assertEq(bb.dailyBps(), 500);
        bytes32 role = bb.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, address(this), role
            )
        );
        bb.setDailyBps(1000);
        vm.startPrank(admin);
        vm.expectRevert(BuybackBurner.DailyBpsOutOfBounds.selector);
        bb.setDailyBps(499);
        vm.expectRevert(BuybackBurner.DailyBpsOutOfBounds.selector);
        bb.setDailyBps(2501);
        vm.expectEmit(address(bb));
        emit BuybackBurner.DailyBpsChanged(1000);
        bb.setDailyBps(1000);
        assertEq(bb.dailyBps(), 1000);
        vm.expectRevert(
            abi.encodeWithSelector(
                BuybackBurner.RateLimited.selector, uint64(vm.getBlockTimestamp()) + 7 days
            )
        );
        bb.setDailyBps(2500);
        vm.warp(vm.getBlockTimestamp() + 7 days);
        bb.setDailyBps(2500);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ liquidity

    function test_addLiquidity_growsLockedPosition() public {
        _open();
        vm.deal(address(core), 1 ether);
        vm.prank(address(core));
        router.deposit{value: 1 ether}(); // more POL ETH arrives from fuel sales
        uint128 before = _liquidity();
        uint256 ethIn = 2 * _chunk();

        vm.prank(keeper);
        lm.addLiquidity(ethIn, 1);
        assertGt(_liquidity(), before);
        assertLt(LM_ADDR.balance, ethIn / 100, "nearly all ETH went in");
        _conservation();
    }

    function test_addLiquidityGuards() public {
        vm.prank(keeper);
        vm.expectRevert(PoolActor.MarketNotOpen.selector);
        lm.addLiquidity(1e12, 0);
        _open();
        vm.deal(address(core), 1 ether);
        vm.prank(address(core));
        router.deposit{value: 1 ether}();
        uint256 cap = _addBudget();
        uint256 ethIn = 2 * _chunk();
        bytes32 role = lm.KEEPER_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, address(this), role
            )
        );
        lm.addLiquidity(1e12, 0);
        vm.startPrank(keeper);
        vm.expectRevert(LiquidityManager.ZeroValue.selector);
        lm.addLiquidity(1, 0);
        vm.expectRevert(abi.encodeWithSelector(LiquidityManager.DailyCapExceeded.selector, cap));
        lm.addLiquidity(cap + 1, 0);
        vm.expectRevert(); // SlippageExceeded inside the callback
        lm.addLiquidity(ethIn, type(uint256).max);
        lm.addLiquidity(ethIn, 1);
        vm.stopPrank();
    }

    /// v1.1: liquidity goes in only while the price is within 3 % of the anchor, in either
    /// direction. A price below the anchor (MOHN cheap) still allows buybacks.
    function test_addLiquidityOnlyNearTheAnchor() public {
        _open();
        vm.deal(address(core), 1 ether);
        vm.prank(address(core));
        router.deposit{value: 1 ether}();
        int24 anchorBefore = lm.anchorTick();
        uint256 ethIn = 2 * _chunk();
        vm.deal(address(trader), 1 ether);
        uint256 bought = trader.swap(_key(), true, lm.poolEth() / 5);
        int24 pumped = _poolTick();
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(PriceAnchor.PriceOffAnchor.selector, pumped, anchorBefore)
        );
        lm.addLiquidity(ethIn, 1);

        skip(1 days); // the anchor catches up with the new price
        trader.swap(_key(), false, bought); // and back: now well above the anchor
        int24 dumped = _poolTick();
        int24 anchorNow = lm.anchorTick();
        assertGt(dumped, anchorNow + PriceAnchor.MAX_DEVIATION);
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(PriceAnchor.PriceOffAnchor.selector, dumped, anchorNow)
        );
        lm.addLiquidity(ethIn, 1);

        uint256 chunk = _chunk();
        vm.prank(keeper);
        bb.executeBuyback(chunk, 1);
        assertGt(bb.totalBurned(), 0);
        _conservation();
    }

    /// The daily budget is fixed at the day's first addition (1/7 of the POL bucket then),
    /// accumulates over the UTC day and is set again at the next day; LiquidityAdded reports the
    /// ETH used, the MOHN bought and the liquidity added.
    function test_addLiquidityDayAccountingAndEvent() public {
        _open();
        vm.deal(address(core), 1 ether);
        vm.prank(address(core));
        router.deposit{value: 1 ether}();
        uint256 budget = _addBudget();
        uint256 first = 2 * _chunk();
        uint128 before = _liquidity();

        vm.recordLogs();
        vm.prank(keeper);
        lm.addLiquidity(first, 1);
        (uint256 ethIn, uint256 mohnBought, uint128 added) = _liquidityAdded(vm.getRecordedLogs());
        assertEq(ethIn, first, "event reports the ETH used");
        assertGt(mohnBought, 0);
        assertEq(added, _liquidity() - before, "event reports the liquidity added");
        assertEq(lm.addDay(), vm.getBlockTimestamp() / 1 days);
        assertEq(lm.addedInDay(), first);
        assertEq(lm.addBudget(), budget);

        skip(1 hours); // same UTC day: the first addition still counts
        uint256 remaining = budget - first;
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(LiquidityManager.DailyCapExceeded.selector, remaining)
        );
        lm.addLiquidity(remaining + 2, 1);

        vm.warp((vm.getBlockTimestamp() / 1 days + 1) * 1 days + 1); // next UTC day: a new budget
        uint256 next = _addBudget();
        assertLt(next, budget, "the bucket shrank, so did the budget");
        uint256 second = 2 * _chunk();
        vm.prank(keeper);
        lm.addLiquidity(second, 1);
        assertEq(lm.addedInDay(), second);
        assertEq(lm.addBudget(), next);
        assertEq(lm.addDay(), vm.getBlockTimestamp() / 1 days);
    }

    function _liquidityAdded(Vm.Log[] memory logs)
        internal
        pure
        returns (uint256 ethIn, uint256 mohnBought, uint128 liquidity)
    {
        bytes32 topic = keccak256("LiquidityAdded(uint256,uint256,uint128)");
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].emitter == LM_ADDR && logs[i].topics[0] == topic) {
                return abi.decode(logs[i].data, (uint256, uint256, uint128));
            }
        }
        revert("no LiquidityAdded");
    }

    /// The buyback budget accumulates over the UTC day (also hours later) and is set again from
    /// the bucket at the next day.
    function test_buybackDayAccounting() public {
        _open();
        uint256 budget = _bbBudget();
        uint256 chunk = _chunk();
        vm.prank(keeper);
        bb.executeBuyback(chunk, 1);
        assertEq(bb.day(), vm.getBlockTimestamp() / 1 days);
        assertEq(bb.spentInDay(), chunk);
        assertEq(bb.dayBudget(), budget);

        skip(1 hours);
        uint256 remaining = budget - chunk;
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(BuybackBurner.DailyCapExceeded.selector, remaining));
        bb.executeBuyback(remaining + 1, 1);

        vm.warp((vm.getBlockTimestamp() / 1 days + 1) * 1 days + 1);
        uint256 next = _bbBudget();
        assertLt(next, budget, "the bucket shrank, so did the budget");
        vm.prank(keeper);
        bb.executeBuyback(chunk, 1);
        assertEq(bb.spentInDay(), chunk);
        assertEq(bb.dayBudget(), next);
        assertEq(bb.day(), vm.getBlockTimestamp() / 1 days);
    }

    function test_collectFees_burnsMohnAndFundsBuyback() public {
        _open();
        vm.deal(address(trader), 1 ether);
        uint256 bought = trader.swap(_key(), true, lm.poolEth() / 20); // ETH fees accrue
        trader.swap(_key(), false, bought / 2); // MOHN fees accrue
        uint256 buybackBefore = router.buybackBalance();
        uint256 supply = mohn.totalSupply();

        vm.prank(makeAddr("anyone"));
        lm.collectFees();
        assertGt(lm.ethFeesToBuyback(), 0);
        assertGt(lm.mohnFeesBurned(), 0);
        assertEq(router.buybackBalance(), buybackBefore + lm.ethFeesToBuyback());
        assertEq(mohn.totalSupply(), supply - lm.mohnFeesBurned());
        _conservation();

        vm.prank(makeAddr("anyone"));
        lm.collectFees(); // nothing new: a no-op
    }

    /// Audit fix: ETH that reaches the BuybackBurner outside a buyback (e.g. through a
    /// PoolManager.take by anyone) cannot block buybacks; it is swept into the buyback bucket.
    function test_strayEthDoesNotBlockBuyback() public {
        _open();
        vm.deal(address(bb), 1 ether); // as if someone took ETH from the PoolManager to it
        uint256 bucket = router.buybackBalance();
        uint256 chunk = _chunk();
        vm.prank(keeper);
        bb.executeBuyback(chunk, 1);
        assertEq(address(bb).balance, 0);
        assertEq(router.buybackBalance(), bucket - chunk + 1 ether, "stray ETH swept to the bucket");
        assertEq(bb.totalEthSpent(), chunk);
    }

    /// Audit fix: fees accrued before an addLiquidity are burned / sent to buyback, not reinvested.
    function test_addLiquidityRoutesAccruedFees() public {
        _open();
        vm.deal(address(trader), 1 ether);
        uint256 bought = trader.swap(_key(), true, lm.poolEth() / 20);
        trader.swap(_key(), false, bought / 2);
        skip(1 days); // the anchor settles at the traded price
        vm.deal(address(core), 1 ether);
        vm.prank(address(core));
        router.deposit{value: 1 ether}();
        uint256 supply = mohn.totalSupply();
        uint256 ethIn = 2 * _chunk(); // before the prank: a call would consume it
        vm.prank(keeper);
        lm.addLiquidity(ethIn, 1);
        assertGt(lm.mohnFeesBurned(), 0, "MOHN fees burned");
        assertGt(lm.ethFeesToBuyback(), 0, "ETH fees to buyback");
        assertEq(mohn.totalSupply(), supply - lm.mohnFeesBurned());
        _conservation();
    }

    // ------------------------------------------------------------------ AI-2 regressions

    /// A trader with its own MOHN and ETH, for the manipulation regressions below.
    function _attacker() internal returns (PoolSwapper x) {
        x = new PoolSwapper(pm);
        vm.deal(address(x), 10 ether);
        vm.startPrank(drillers[9]);
        core.refine(10_000e18, true);
        IERC20(address(mohn)).transfer(address(x), 9_200e18);
        vm.stopPrank();
    }

    /// One tick spacing around the current tick, `mult` x the pool's active liquidity.
    function _narrowRange(uint256 mult)
        internal
        view
        returns (int24 lower, int24 upper, int256 liq)
    {
        int24 t = _poolTick();
        lower = (t / 60) * 60;
        if (t < 0 && t % 60 != 0) lower -= 60;
        upper = lower + 60;
        liq = int256(uint256(_liquidity()) * mult);
    }

    /// AI-2 (ATK-3): just-in-time concentrated liquidity no longer raises the daily caps. They
    /// come from the buckets, which only fuel revenue fills.
    function test_jitLiquidityDoesNotRaiseTheCaps() public {
        _open();
        vm.deal(address(core), 1 ether);
        vm.prank(address(core));
        router.deposit{value: 1 ether}();
        uint256 bbBudget = _bbBudget();
        uint256 addBudget = _addBudget();
        uint256 poolEthBefore = lm.poolEth();
        PoolSwapper x = _attacker();
        (int24 lower, int24 upper, int256 liq) = _narrowRange(30);
        x.modify(_key(), lower, upper, liq);
        assertGt(lm.poolEth(), poolEthBefore * 20, "the pool-depth reading is inflated");

        vm.startPrank(keeper);
        vm.expectRevert(abi.encodeWithSelector(BuybackBurner.DailyCapExceeded.selector, bbBudget));
        bb.executeBuyback(bbBudget + 1, 1);
        vm.expectRevert(
            abi.encodeWithSelector(LiquidityManager.DailyCapExceeded.selector, addBudget)
        );
        lm.addLiquidity(addBudget + 1, 1);
        vm.stopPrank();
    }

    /// AI-2 (ATK-3b, ATK-3c): the stolen-keeper sandwich. Pumping first makes both keeper swaps
    /// revert; without a pump, a narrow position that takes the whole buyback sells at most 3 %
    /// above the anchor, so its gain is bounded by that band plus the pool fee.
    function test_stolenKeeperSandwichIsBounded() public {
        _open();
        vm.deal(address(core), 1 ether);
        vm.prank(address(core));
        router.deposit{value: 1 ether}();
        uint256 budget = _bbBudget();
        uint256 addIn = 2 * _chunk();
        int24 anchorTick = lm.anchorTick();
        PoolSwapper x = _attacker();

        uint256 snap = vm.snapshotState();
        x.swap(_key(), true, lm.poolEth() / 2);
        int24 pumped = _poolTick();
        vm.startPrank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(PriceAnchor.PriceOffAnchor.selector, pumped, anchorTick)
        );
        bb.executeBuyback(budget, 1);
        vm.expectRevert(
            abi.encodeWithSelector(PriceAnchor.PriceOffAnchor.selector, pumped, anchorTick)
        );
        lm.addLiquidity(addIn, 1);
        vm.stopPrank();
        vm.revertToState(snap);

        uint256 eth0 = address(x).balance;
        uint256 mohn0 = mohn.balanceOf(address(x));
        (int24 lower, int24 upper, int256 liq) = _narrowRange(40);
        x.modify(_key(), lower, upper, liq);
        vm.prank(keeper);
        bb.executeBuyback(budget, 1);
        x.modify(_key(), lower, upper, -liq);
        uint256 spent = bb.totalEthSpent();
        assertGt(spent, 0);
        assertGe(_poolTick(), anchorTick - PriceAnchor.MAX_DEVIATION, "stopped at the band");

        // The attacker's gain, valuing the MOHN it sold at the anchor price.
        uint256 ethGained = address(x).balance - eth0;
        uint256 mohnSold = mohn0 - mohn.balanceOf(address(x));
        uint160 sqrtAnchor = TickMath.getSqrtPriceAtTick(anchorTick);
        uint256 mohnAtAnchor = FullMath.mulDiv(
            FullMath.mulDiv(mohnSold, FixedPoint96.Q96, sqrtAnchor), FixedPoint96.Q96, sqrtAnchor
        );
        uint256 gain = ethGained > mohnAtAnchor ? ethGained - mohnAtAnchor : 0;
        assertLe(gain * 10_000, spent * 330, "at most the 3 % band plus the 0.3 % fee");
        _conservation();
    }

    function test_unexpectedEthRejected() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = LM_ADDR.call{value: 1}("");
        assertFalse(ok);
        (ok,) = address(bb).call{value: 1}("");
        assertFalse(ok);
        vm.expectRevert(PoolActor.NotPoolManager.selector);
        lm.unlockCallback("");
        vm.expectRevert(PoolActor.NotPoolManager.selector);
        bb.unlockCallback("");
    }

    function test_constructorsRejectZeroAddresses() public {
        vm.expectRevert(PoolActor.ZeroAddress.selector);
        deployCode(
            "BuybackBurner.sol:BuybackBurner",
            abi.encode(admin, address(0), address(mohn), address(router), LM_ADDR)
        );
        vm.expectRevert(PoolActor.ZeroAddress.selector);
        deployCode(
            "BuybackBurner.sol:BuybackBurner",
            abi.encode(address(0), PM, address(mohn), address(router), LM_ADDR)
        );
    }

    // ------------------------------------------------------------------ L1

    /// L1: the LiquidityManager has no way to remove liquidity. Its external surface is exactly
    /// this list (from the compiled ABI); adding any function makes this test fail.
    function test_noLiquidityRemovalFunction() public view {
        string memory artifact = vm.readFile("out/LiquidityManager.sol/LiquidityManager.json");
        string[26] memory allowed = [
            "ADD_DAILY_BPS()",
            "DEFAULT_ADMIN_ROLE()",
            "KEEPER_ROLE()",
            "addBudget()",
            "addDay()",
            "addLiquidity(uint256,uint256)",
            "addedInDay()",
            "anchorTick()",
            "beforeInitialize(address,(address,address,uint24,int24,address),uint160)",
            "beforeSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),bytes)",
            "collectFees()",
            "core()",
            "ethFeesToBuyback()",
            "getRoleAdmin(bytes32)",
            "grantRole(bytes32,address)",
            "hasRole(bytes32,address)",
            "mohn()",
            "mohnFeesBurned()",
            "openMarket(uint160,uint256)",
            "opened()",
            "poolEth()",
            "poolKey()",
            "poolManager()",
            "renounceRole(bytes32,address)",
            "revokeRole(bytes32,address)",
            "router()"
        ];
        string[] memory keys = vm.parseJsonKeys(artifact, ".methodIdentifiers");
        // supportsInterface and unlockCallback complete the surface.
        assertEq(keys.length, allowed.length + 2, "unexpected external function");
        for (uint256 i = 0; i < allowed.length; ++i) {
            assertTrue(
                vm.keyExistsJson(
                    artifact, string.concat(".methodIdentifiers.['", allowed[i], "']")
                ),
                allowed[i]
            );
        }
    }

    /// L1 under trading: the protocol position's liquidity only ever grows.
    function test_liquidityNeverDecreases() public {
        _open();
        uint128 last = _liquidity();
        vm.deal(address(trader), 10 ether);
        vm.deal(address(core), 10 ether);
        for (uint256 i = 0; i < 6; ++i) {
            uint256 bought = trader.swap(_key(), true, lm.poolEth() / 50);
            trader.swap(_key(), false, bought);
            lm.collectFees();
            vm.prank(address(core));
            router.deposit{value: 0.1 ether}();
            uint256 ethIn = 2 * _chunk();
            vm.prank(keeper);
            lm.addLiquidity(ethIn, 1);
            assertGe(_liquidity(), last);
            last = _liquidity();
            vm.warp(vm.getBlockTimestamp() + 1 days);
        }
        _conservation();
    }
}
