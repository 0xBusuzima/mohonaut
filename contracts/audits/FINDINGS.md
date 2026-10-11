# Internal audit findings (Phase 2.9, 2026-10-12)

Method: a multi-agent review of `contracts/src` and `script/Deploy.s.sol`. Seven specialist
reviewers worked independently (accounting, economy, access control, Uniswap v4, math, liveness,
spec conformance) and produced 38 raw findings, 20 after deduplication. Every finding then went
to three skeptics with different lenses (correctness, exploitability, spec/intent) who tried to
refute it. A finding was kept with ≥ 2 confirmations. A completeness critic looked for anything
the reviewers missed. This review is **not** an independent audit; it narrows what one has to
look at.

Result: 14 confirmed, 6 refuted, 4 critic findings. Every confirmed or critic finding is listed
below with its resolution and the test that proves it. Test paths are relative to `contracts/`.

## Confirmed findings

| # | Severity | Finding | Resolution | Proof |
|---|---|---|---|---|
| 1 | **High** | Anyone with no credit could trip the global mint breaker with `refine(200_000e18, true)` (the breaker ran before the balance check) and freeze every mint path; repeatable after each Timelock reset | **Fixed.** The caller's credit is withdrawn before the mint window is touched, and the breaker became a hard hourly rate limit: a mint that does not fit reverts (`MintWindowFull`) for its caller only; there is no global frozen state | `unit/MiningCoreRefinery.t.sol` `test_zeroCreditCallerCannotTouchTheWindow`, `test_overLimitMintRevertsAndOthersContinue` |
| 2 | High | A standard refine above 150K could never be finalized and could be used to trip the breaker | **Fixed.** Requests are capped at 100K (`RefineTooLarge`), so each fits an empty window; finalize reverts and retries instead of tripping | `test_requestSizeCapped`, `test_finalizeWaitsForRoom` |
| 3 | Medium | Permissionless `finalizeRefine` let a third party bunch matured requests to trip the breaker | **Fixed** by the rate-limit design (no trip; the over-limit finalize reverts) | `test_finalizeWaitsForRoom` |
| 4 | Medium | Tripping cost nothing even with a real balance (the over-limit request was not executed) | **Fixed** by the rate-limit design | `test_overLimitMintRevertsAndOthersContinue` |
| 5 | Medium | `openMarket` sized the LP from the live POL bucket; a late Market Open could exceed the breaker and become impossible | **Fixed.** The LP is clamped to the room left in the hourly window; the pool still opens at P0 and only the matching POL ETH is used, the rest stays in the bucket | `integration/Market.t.sol` `test_openMarketClampsLpToTheMintLimit` |
| 6 | Low | The 1M LP cap exceeded the 150K breaker | **Fixed** with #5 | same |
| 7 | Medium | The 96 h Timelock (role admin of `UPGRADER_ROLE`) could grant itself upgrades and skip the 7-day Timelock | **Fixed.** `UPGRADER_ROLE` administers itself; `Deploy.s.sol` asserts it | `unit/Governance.t.sol` `test_adminCannotGrantItselfUpgrades`; `script/Deploy.t.sol` (`assertHandedOver`) |
| 8 | Medium | ETH sent to the BuybackBurner outside a buyback (e.g. via `PoolManager.take`) made `executeBuyback` underflow: a cheap DoS of buybacks | **Fixed.** The spend comes from the swap delta; any ETH left in the contract is swept to the buyback bucket | `integration/Market.t.sol` `test_strayEthDoesNotBlockBuyback` |
| 9 | Low | `addLiquidity` reinvested accrued LP fees instead of burning MOHN fees and sending ETH fees to buyback | **Fixed.** Fees accrued before an addition are routed like `collectFees` | `test_addLiquidityRoutesAccruedFees` |
| 10 | Low | Treasury withdrawals could drain the pool that referral credit is paid from, so the "immutable" 3 % referral was discretionary | **Fixed.** 3 % of every miners' share is earmarked inside the treasury share (`referralReserve`); the treasury can only withdraw the rest; unqualified accruals release their earmark | `unit/MiningCoreRefinery.t.sol` `test_treasuryCannotStarveReferrals`, `test_unqualifiedAccrualReleasesEarmark` |
| 11 | Low | `Deploy.s.sol` did not validate `GENESIS_TIME`; a genesis whose Market Open had already passed made `openMarket` impossible | **Fixed.** Refused (`GenesisTooLate`); mainnet needs ≥ 24 h of pre-fill; `ALLOW_CLOSED_GENESIS` exists for testnet playgrounds only | `script/Deploy.t.sol` `test_lateGenesisRefused` |
| 12 | Low | A stolen keeper key can move pool depth within a block and so inflate the daily buyback/LP caps | **Accepted, documented.** The keeper's own `minOut` still bounds the price; the cap only sizes the spend. Raised in `SCOPE.md` known issues for the independent audit | `test_pumpBeforeBuyback_isBoundedByCapAndMinOut` |
| 13 | Low / info | The genesis tank cap uses the current burn rate; switching rigs off after buying fuel lets a player buy more genesis fuel | **Accepted, documented.** The extra fuel is paid in ETH (55 % buyback, 30 % POL), so the POL ETH and P0 rise together and the LP MOHN amount stays ≈ 0.3 × genesis accrual; no value is extracted | Reasoning in `SCOPE.md` |
| 14 | Info | docs/03 listed a `register(referrer)` function that does not exist | **Fixed** in docs/03 (registration happens in the first `buyFuel`) | — |

## Completeness critic

| Severity | Finding | Resolution |
|---|---|---|
| Medium | The 96 h Timelock (admin of the router's roles) could grant itself the POL/buyback roles and redirect those buckets, bypassing the bounded split | **Fixed.** `RevenueRouter.lockBucketRoles()` (called once by the deploy script) makes the deposit, fee, POL and buyback roles administered by a role nobody holds; only the ops role stays manageable. Test: `unit/RevenueRouter.t.sol` `test_lockBucketRoles`; `Deploy.s.sol` asserts it |
| Low | Queued dev/treasury withdrawals cannot be cancelled after a recipient key is compromised | Accepted, documented: at most 100K per day, each visible for 72 h; the Guardian can pause finalization while the Timelock rotates the recipient |
| Low | The Timelock can chain `extendPause` calls | Accepted (also refuted by the verifiers): every extension is a public 96 h Timelock operation |
| Low | Refining opens at genesis + 72 h even if nobody has called `openMarket` yet | Accepted, documented: `openMarket` is permissionless and the keeper calls it at that moment |

## Refuted (not acted upon)

Referral threshold applied to the triggering purchase; VRGDA "known issue 2" mitigation; unlimited
`extendPause` (governance, public); partial-broadcast handover check; immutable ETH/USD feed
(upgrade path exists); dev/treasury visibility tied to the adjustable refine delay (the delay's
lower bound is 24 h and every change is a public Timelock operation).
