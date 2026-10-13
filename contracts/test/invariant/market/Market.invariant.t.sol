// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {console2} from "forge-std/console2.sol";

import {MarketBase} from "../../utils/MarketBase.sol";
import {MarketHandler} from "./MarketHandler.sol";

/// @notice Market-layer invariants (docs/04 S2: L1 as NEW-17, NEW-18 to NEW-20, K1 to K3) over
///         random third-party trading, just-in-time liquidity, revenue, keeper buybacks and
///         liquidity additions, fee collection and time, on the real PoolManager bytecode.
/// forge-config: default.invariant.runs = 128
/// forge-config: default.invariant.depth = 64
contract MarketInvariantTest is MarketBase {
    MarketHandler internal handler;
    uint256 internal buybackAtOpen;
    uint256 internal polAtOpen;
    uint256 internal supplyAtOpen;

    function setUp() public override {
        super.setUp();
        _open();
        // The trader holds MOHN to sell and to pair just-in-time liquidity with.
        for (uint256 i = 0; i < 5; ++i) {
            vm.startPrank(drillers[i]);
            core.refine(10_000e18, true);
            mohn.transfer(address(trader), mohn.balanceOf(drillers[i]));
            vm.stopPrank();
        }
        handler = new MarketHandler(pm, core, mohn, router, lm, bb, trader, keeper);
        vm.startPrank(admin);
        lm.grantRole(lm.KEEPER_ROLE(), address(handler));
        bb.grantRole(bb.KEEPER_ROLE(), address(handler));
        vm.stopPrank();
        buybackAtOpen = router.buybackBalance();
        polAtOpen = router.polBalance();
        supplyAtOpen = mohn.totalSupply();
        targetContract(address(handler));
        bytes4[] memory s = new bytes4[](11);
        s[0] = handler.buy.selector;
        s[1] = handler.sell.selector;
        s[2] = handler.jit.selector;
        s[3] = handler.deposit.selector;
        s[4] = handler.buyback.selector;
        s[5] = handler.buyback.selector; // keeper calls weighted twice
        s[6] = handler.addLiquidity.selector;
        s[7] = handler.addLiquidity.selector;
        s[8] = handler.collectFees.selector;
        s[9] = handler.reopen.selector;
        s[10] = handler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: s}));
    }

    /// NEW-17 (L1 under random sequences): the protocol position's liquidity never decreases.
    function invariant_L1_liquidityNeverDecreases() public view {
        assertEq(handler.liquidityDecreases(), 0);
    }

    /// K1: a day's keeper spend stays within the budget fixed at its first spend.
    function invariant_K1_dayBudgets() public view {
        assertLe(bb.spentInDay(), bb.dayBudget(), "buyback");
        assertLe(lm.addedInDay(), lm.addBudget(), "addLiquidity");
    }

    /// K2: keeper swaps start inside and end inside the anchor band. K3: the anchor never moves
    /// within a block.
    function invariant_K2_K3_anchor() public view {
        assertEq(handler.bandViolations(), 0, "band");
        assertEq(handler.anchorMoves(), 0, "anchor moved within a block");
    }

    /// NEW-18: ETH through the BuybackBurner. The bucket holds what came in (fuel share, LP ETH
    /// fees, returned leftovers) minus what was pulled; what was pulled and not returned was paid
    /// into the pool; the BuybackBurner never keeps ETH.
    function invariant_buybackEthConserved() public view {
        assertEq(
            buybackAtOpen + handler.ghostBuybackDeposits() + lm.ethFeesToBuyback()
                + handler.ghostBuybackReturned(),
            router.buybackBalance() + handler.ghostBuybackPulled(),
            "bucket"
        );
        assertEq(
            bb.totalEthSpent(),
            handler.ghostBuybackPulled() - handler.ghostBuybackReturned(),
            "spent"
        );
        assertEq(handler.strayBuybackEth(), 0, "BuybackBurner kept ETH");
    }

    /// NEW-19: ETH through the LiquidityManager and MOHN burns. The POL bucket holds the fuel
    /// share minus what was pulled; supply falls exactly by the buyback and LP-fee burns.
    function invariant_polEthAndBurns() public view {
        assertEq(
            polAtOpen + handler.ghostPolDeposits(),
            router.polBalance() + handler.ghostPolPulled(),
            "POL bucket"
        );
        assertEq(mohn.totalSupply() + bb.totalBurned() + lm.mohnFeesBurned(), supplyAtOpen);
        assertGe(
            address(router).balance,
            router.buybackBalance() + router.polBalance() + router.opsBalance(),
            "R1"
        );
    }

    /// NEW-20: Market Open happened once and cannot happen again; E2 with the external burns.
    function invariant_marketOpenOnceAndConservation() public view {
        assertTrue(core.marketOpened() && lm.opened());
        assertEq(handler.reopenSuccesses(), 0);
        _conservation();
    }

    /// Non-vacuity: a fixed sequence through every flow, then all invariants.
    function test_sequenceHitsEveryFlow() public {
        handler.deposit(1 ether);
        handler.addLiquidity(1e13); // near the anchor: before any trading
        handler.buy(1e15);
        handler.sell(1e20);
        handler.jit(30);
        handler.buyback(1e12);
        handler.jit(0);
        handler.warp(6 hours);
        handler.addLiquidity(1e13);
        handler.collectFees();
        handler.reopen();
        handler.warp(1 days);
        handler.buyback(type(uint256).max);
        handler.addLiquidity(type(uint256).max);
        string[9] memory tags = [
            "deposit",
            "buy",
            "sell",
            "jitOpen",
            "jitClose",
            "buyback",
            "addLiquidity",
            "collect",
            "deposit"
        ];
        for (uint256 i = 0; i < tags.length; ++i) {
            assertGt(handler.hits(bytes32(bytes(tags[i]))), 0, tags[i]);
        }
        _all();
    }

    /// Non-vacuity: a deterministic pseudo-random walk; prints how often each flow succeeded.
    function test_randomWalkHitsFlows() public {
        uint256 seed = 7;
        for (uint256 i = 0; i < 300; ++i) {
            seed = uint256(keccak256(abi.encode(seed)));
            uint256 a = seed >> 8;
            uint256 op = seed % 10;
            if (op == 0) handler.buy(a);
            else if (op == 1) handler.sell(a);
            else if (op == 2) handler.jit(a);
            else if (op == 3) handler.deposit(a);
            else if (op == 4 || op == 5) handler.buyback(a);
            else if (op == 6 || op == 7) handler.addLiquidity(a);
            else if (op == 8) handler.collectFees();
            else handler.warp(a);
        }
        string[8] memory tags =
            ["buy", "sell", "jitOpen", "jitClose", "deposit", "buyback", "addLiquidity", "collect"];
        for (uint256 i = 0; i < tags.length; ++i) {
            console2.log(tags[i], handler.hits(bytes32(bytes(tags[i]))));
        }
        _all();
    }

    function _all() internal view {
        invariant_L1_liquidityNeverDecreases();
        invariant_K1_dayBudgets();
        invariant_K2_K3_anchor();
        invariant_buybackEthConserved();
        invariant_polEthAndBurns();
        invariant_marketOpenOnceAndConservation();
    }
}
