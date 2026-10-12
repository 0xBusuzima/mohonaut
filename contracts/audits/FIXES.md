# Fixes for the multi-role AI review (Phase 7.1)

Every item of [AI_REVIEW.md](AI_REVIEW.md) with its outcome, the change and the test that proves
it. Test paths are relative to `contracts/`. Items marked **Decision** wait for the founder:
they change the economy, so they go docs/02 → `sim/params.json` → simulation → vectors →
contracts (CLAUDE.md).

| ID | Outcome | Change | Proof |
|---|---|---|---|
| AI-1 (ATK-1, ACC-1) | **Fixed** | `lockBucketRoles` also makes `LOCKED_ROLE` its own admin; `Deploy.s.sol` asserts it (`assertHandedOver`) | `unit/RevenueRouter.t.sol` `test_lockCannotBeUndoneThroughLockedRole`; the attacker PoC `Attacks.t.sol` ATK-1 now fails |
| AI-2 (ATK-3) | **Decision** | Base the buyback/LP daily caps on something JIT liquidity cannot inflate (the bucket balance or the protocol's own position) and add an on-chain price anchor. `SCOPE.md` now states the real exposure | — |
| AI-3 (SPEC-1) | **Decision** | Either change the 4 %/day POL cap or keep it and re-run the docs/02 §13 study with it (the spec auditor's `pol_cap_experiment.py` shows the effect) | — |
| AI-4 (ATK-2, ATK-5) | **Fixed** | Refining and dev/treasury withdrawals require `marketOpened`, not just Market Open time | `unit/MiningCoreRefinery.t.sol` `test_refineWaitsForOpenMarketNotTheClock`; harnesses mark the market open at its time (`test/utils/MarketOpenCheat.sol`) |
| AI-5 (ACC-4) | **Decision** (with AI-2/AI-3) | Price scrap credit independently of the player's own purchases (e.g. at the VRGDA target price) | — |
| AI-6 (SPEC-2) | **Fixed (docs)** | docs/02 §0 principle 4 and SCOPE.md: those items change only through the 7-day upgrade Timelock | docs/02 v1.0.2 |
| AI-7 (SPEC-3, SPEC-4) | Planned | `sim/params.json`: 500K daily cap, 96 h timelock, hourly/request/dev limits in the model; re-run with the decisions above | — |
| AI-8 (SPEC-5) | Planned | Simulator: burn pool MOHN fees, send ETH fees to buybacks | — |
| AI-9 (SPEC-6, SPEC-12) | **Fixed (docs)** for §6.1; §7 figures with the re-run | docs/02 §6.1 column now states it excludes the in-batch rise | docs/02 v1.0.2 |
| AI-10 (SPEC-7) | **Fixed (docs)** | docs/02: withdrawals are visible for the queue length (default 72 h, 24-168 h) | docs/02 v1.0.2 |
| AI-11 (SPEC-8) | Planned | Simulator: evaluate referral conditions at settlement | — |
| AI-12 (SPEC-9, 10, 17-21) | **Fixed (docs)** | docs/02 appendix "Kodlanmış sınırlar" | docs/02 v1.0.2 |
| ATK-4 | Accepted | The UTC-day reset lets two days of cap be spent a second apart; covered by AI-2's redesign | — |
| ATK-6 / ACC-2 | **Fixed (docs)** | docs/04 R1 is now `balance ≥ buckets` (forced ETH stays locked) | docs/04 §2 |
| ATK-7 | **Fixed** | `startedAt == 0` (uninitialised round) reads as sequencer down | `unit/MiningCoreFuel.t.sol` `test_sequencerUninitialisedRoundIsDown` |
| ACC-3 | **Fixed (docs)** | docs/04 E2 includes an external-burn term | docs/04 §2 |
| ACC-5 | Planned | Move the accountant's NEW-1 to NEW-15 invariants into `test/invariant` and `test/recon`; add a stateful handler for the market/ETH layer | — |
| ACC-6 | Planned | Restate the tank invariant as "tank ≤ cap at the time of the last fuel purchase" | — |
| ACC-7 | Accepted | Earmarks of accounts that never settle again stay in the treasury share; at most 3 % of their accrual | — |
| SPEC-11 | **Fixed (docs)** | docs/02 §4 uses PREC (1e36) | docs/02 v1.0.2 |
| SPEC-13 | Accepted | The 1M LP cap is dominated by the 150K hourly room; kept as a second bound | — |
| SPEC-14 | **Fixed** | "breaker reset" removed from MiningCore NatSpec and SCOPE.md | — |
| SPEC-16 | Planned | Rename old v0.2 names in params.json, PARAMS.md and the vectors README | — |
| SPEC-22, 23, 24 | Accepted | Rounding in the players' favour by at most a few hundred wei per call | — |
| SPEC-25 | **Fixed** | Competitor name removed from docs/02 | — |
