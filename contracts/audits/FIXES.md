# Fixes for the multi-role AI review (Phase 7.1)

Every item of [AI_REVIEW.md](AI_REVIEW.md) with its outcome, the change and the test that proves
it. Test paths are relative to `contracts/`. Items marked **Decision** wait for the founder:
they change the economy, so they go docs/02 → `sim/params.json` → simulation → vectors →
contracts (CLAUDE.md).

| ID | Outcome | Change | Proof |
|---|---|---|---|
| AI-1 (ATK-1, ACC-1) | **Fixed** | `lockBucketRoles` also makes `LOCKED_ROLE` its own admin; `Deploy.s.sol` asserts it (`assertHandedOver`) | `unit/RevenueRouter.t.sol` `test_lockCannotBeUndoneThroughLockedRole`; the attacker PoC `Attacks.t.sol` ATK-1 now fails |
| AI-2 (ATK-3) | **Fixed (v1.1, founder decision: bucket caps + price anchor)** | Daily budgets come from the buckets (buyback 1/20, POL 1/7 of the balance at the day's first spend); the hook keeps a 1-hour time-weighted tick (`lib/PriceAnchor.sol`) and keeper swaps stop 296 ticks (~3 %) past it, liquidity goes in only within that band. docs/02 §10.1, docs/03 ADR-017, docs/04 K1-K3 | `integration/Market.t.sol` `test_jitLiquidityDoesNotRaiseTheCaps`, `test_stolenKeeperSandwichIsBounded`, `test_pumpBeforeBuyback_isBlockedByTheAnchor`, `test_buybackStopsAtTheAnchor`, `test_addLiquidityOnlyNearTheAnchor`; `unit/PriceAnchor.t.sol`; the attacker PoCs ATK-3, 3b, 3c now fail |
| AI-3 (SPEC-1) | **Fixed (v1.1, founder decision: bucket-based cap)** | POL additions: at most 1/7 of the POL bucket per day, in chunks of ~2 % price impact every 3 hours; the simulator models exactly that (`sim/params.json` `keeper`) and docs/02 §13 was re-run with it | `sim/tests`, `sim/RAPOR.md` |
| AI-4 (ATK-2, ATK-5) | **Fixed** | Refining and dev/treasury withdrawals require `marketOpened`, not just Market Open time | `unit/MiningCoreRefinery.t.sol` `test_refineWaitsForOpenMarketNotTheClock`; harnesses mark the market open at its time (`test/utils/MarketOpenCheat.sol`) |
| AI-5 (ACC-4) | **Accepted (founder decision)** | Scrap credit keeps its price: it cannot be transferred and is only spent on equipment, and a buy-scrap loop loses to the 80 % burn. Documented in docs/02 v1.1 | — |
| AI-6 (SPEC-2) | **Fixed (docs)** | docs/02 §0 principle 4 and SCOPE.md: those items change only through the 7-day upgrade Timelock | docs/02 v1.0.2 |
| AI-7 (SPEC-3, SPEC-4) | **Partly fixed** | `sim/params.json`: 500K daily cap and 96 h timelock (v1.1); the hourly/request/dev limits in the model remain planned | `sim/tests` |
| AI-8 (SPEC-5) | **Fixed** | Simulator: swap fees accrue outside the reserves (Uniswap v4) and are collected daily, MOHN fees burned and ETH fees to the buyback bucket, as the LiquidityManager does; docs/02 §10 states the routing | `sim/tests/test_amm.py` |
| AI-9 (SPEC-6, SPEC-12) | **Fixed (docs)** for §6.1; §7 figures with the re-run | docs/02 §6.1 column now states it excludes the in-batch rise | docs/02 v1.0.2 |
| AI-10 (SPEC-7) | **Fixed (docs)** | docs/02: withdrawals are visible for the queue length (default 72 h, 24-168 h) | docs/02 v1.0.2 |
| AI-11 (SPEC-8) | **Fixed (docs)** | docs/02 §9 states when the conditions are checked (once per settlement, applied to the whole interval). The daily simulator keeps its per-day check, which matches for players who act at least daily; the credit stays bounded by 3 % of the invitee's accrual and mints nothing new | docs/02 §9 |
| AI-12 (SPEC-9, 10, 17-21) | **Fixed (docs)** | docs/02 appendix "Kodlanmış sınırlar" | docs/02 v1.0.2 |
| ATK-4 | Accepted | The UTC-day reset still lets two days' budgets be spent a second apart, but each is 1/20 of the bucket and both swaps share the same price anchor band, so the second one cannot buy past it either | `integration/Market.t.sol` `test_buybackStopsAtTheAnchor` |
| ATK-6 / ACC-2 | **Fixed (docs)** | docs/04 R1 is now `balance ≥ buckets` (forced ETH stays locked) | docs/04 §2 |
| ATK-7 | **Fixed** | `startedAt == 0` (uninitialised round) reads as sequencer down | `unit/MiningCoreFuel.t.sol` `test_sequencerUninitialisedRoundIsDown` |
| ACC-3 | **Fixed (docs)** | docs/04 E2 includes an external-burn term | docs/04 §2 |
| ACC-5 | **Fixed** | NEW-1 to NEW-15 moved into the main suite (`test/invariant/system`; the handler now opens the market at its time, so refine and withdrawal paths are exercised again after AI-4); a market/ETH handler on the real PoolManager bytecode adds NEW-17 to NEW-20 and K1 to K3, in Foundry (`test/invariant/market`) and for Medusa/Echidna (`test/recon/market/CryticMarketTester`) | docs/04 §2 "Ek invariantlar" |
| ACC-6 | **Fixed** | The tank invariant is now NEW-25b: right after every successful purchase, tank ≤ the cap in force then; the fuel handler also changes `MaxTankHours`, which made the old form fail | `invariant/MiningCoreFuel.invariant.t.sol` `invariant_tankWithinCapAtPurchase`, `test_capChangeIsNotRetroactive`; recon `invariant_tankWithinCapAtPurchase` |
| ACC-7 | Accepted | Earmarks of accounts that never settle again stay in the treasury share; at most 3 % of their accrual | — |
| SPEC-11 | **Fixed (docs)** | docs/02 §4 uses PREC (1e36) | docs/02 v1.0.2 |
| SPEC-13 | Accepted | The 1M LP cap is dominated by the 150K hourly room; kept as a second bound | — |
| SPEC-14 | **Fixed** | "breaker reset" removed from MiningCore NatSpec and SCOPE.md | — |
| SPEC-16 | Planned | Rename old v0.2 names in params.json, PARAMS.md and the vectors README | — |
| SPEC-22, 23, 24 | Accepted | Rounding in the players' favour by at most a few hundred wei per call | — |
| SPEC-25 | **Fixed** | Competitor name removed from docs/02 | — |
