// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MarketSetup} from "./MarketSetup.sol";

/// @title MarketProperties
/// @notice docs/04 S2 market-layer invariants (L1 as NEW-17, NEW-18 to NEW-20, K1 to K3) as
///         boolean properties for Medusa (`invariant_*`), Echidna (`check_market`, assertion
///         mode) and Foundry (CryticMarketToFoundry.t.sol). Ghosts are kept by the targets.
abstract contract MarketProperties is MarketSetup {
    uint256 internal ghostBuybackDeposits;
    uint256 internal ghostBuybackPulled;
    uint256 internal ghostBuybackReturned;
    uint256 internal ghostPolDeposits;
    uint256 internal ghostPolPulled;
    uint256 internal liquidityDecreases;
    uint256 internal bandViolations;
    uint256 internal anchorMoves;
    uint256 internal strayBuybackEth;
    uint256 internal reopenSuccesses;

    /// NEW-17 (L1): the protocol position's liquidity never decreases.
    function invariant_L1_liquidityNeverDecreases() public view returns (bool) {
        return liquidityDecreases == 0;
    }

    /// K1: a day's keeper spend stays within the budget fixed at its first spend.
    function invariant_K1_dayBudgets() public view returns (bool) {
        return bb.spentInDay() <= bb.dayBudget() && lm.addedInDay() <= lm.addBudget();
    }

    /// K2: keeper swaps start and end inside the anchor band. K3: the anchor never moves within
    /// a block.
    function invariant_K2_K3_anchor() public view returns (bool) {
        return bandViolations == 0 && anchorMoves == 0;
    }

    /// NEW-18: ETH through the BuybackBurner is conserved and it never keeps any.
    function invariant_buybackEthConserved() public view returns (bool) {
        return buybackAtOpen + ghostBuybackDeposits + lm.ethFeesToBuyback() + ghostBuybackReturned
                == router.buybackBalance() + ghostBuybackPulled
            && bb.totalEthSpent() == ghostBuybackPulled - ghostBuybackReturned
            && strayBuybackEth == 0;
    }

    /// NEW-19: the POL bucket and MOHN burns are conserved; R1.
    function invariant_polEthAndBurns() public view returns (bool) {
        return polAtOpen + ghostPolDeposits == router.polBalance() + ghostPolPulled
            && mohn.totalSupply() + bb.totalBurned() + lm.mohnFeesBurned() == supplyAtOpen
            && address(router).balance
                >= router.buybackBalance() + router.polBalance() + router.opsBalance();
    }

    /// NEW-20: Market Open happened once and cannot happen again.
    function invariant_marketOpenOnce() public view returns (bool) {
        return lm.opened() && reopenSuccesses == 0;
    }

    function check_market() public view {
        assert(invariant_L1_liquidityNeverDecreases());
        assert(invariant_K1_dayBudgets());
        assert(invariant_K2_K3_anchor());
        assert(invariant_buybackEthConserved());
        assert(invariant_polEthAndBurns());
        assert(invariant_marketOpenOnce());
    }
}
