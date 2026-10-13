# ACCOUNTANT review: accounting invariants of the Mohonaut contracts

Role: independent AI reviewer, accounting lens (supply, emission, reserve, credit, queues, ETH
buckets, VRGDA counters, rate-limit state). Date: 2026-10-12. Scope: `contracts/src` at the Phase
2.9 state described in `audits/SCOPE.md`, `audits/FINDINGS.md` and `audits/TRACEABILITY.md`.
This is **not** an independent audit. Nothing under `src/`, `script/`, `test/` or `foundry.toml` was
changed; every artefact of this review lives in `contracts/audit-tests/accountant/`.

How to run (from `contracts/`, Git Bash: `export PATH="$PATH:/c/Users/yazic/.foundry/bin"` first):

```bash
FOUNDRY_TEST=audit-tests/accountant FOUNDRY_OUT=out-accountant FOUNDRY_CACHE_PATH=cache-accountant forge test -vv
```

Result on 2026-10-12: 9 tests, 9 passed (5 finding reproductions, 1 scrap PoC, the invariant
campaign with 18 invariants at 256 runs x depth 64 = 16,384 calls, a fixed non-vacuity sequence and
a deterministic 600-step random walk that prints how often each flow succeeded). Runtime about 55 s.

| File | Content |
|---|---|
| `audit-tests/accountant/AccountantBase.sol` | Deploys proxy + token + real RevenueRouter + mock feed (same as the economy suite) |
| `audit-tests/accountant/AccountantFindings.t.sol` | Reproductions of ACC-1, ACC-2, ACC-3, ACC-6, ACC-7 |
| `audit-tests/accountant/AccountantScrap.t.sol` | Reproduction of ACC-4 (scrap credit ordering) |
| `audit-tests/accountant/AccountantHandler.sol` | New handler: wallet payments, holder burns/transfers, dev/treasury withdrawals, every `setParam`, `setSplit`, Guardian pause / `extendPause` / `unpause`, oracle moves, `addMachineGeneration`; ghosts for the new invariants |
| `audit-tests/accountant/Accountant.invariant.t.sol` | NEW-1 to NEW-15 (S5) plus M1/P1/queue, non-vacuity tests |

## 1. Summary

The MOHN books in `MiningAccounting` / `MiningCore` held under every sequence I could construct:
the new, stricter invariants (exact E1 with a no-leak lower bound, emission-share identity, reserve
identity, fuel solvency, schedule-vs-activeDp, exact mint-window bookkeeping, E5/E6 at every hour
boundary with recycling, wallet-path S1) all pass a 16,384-call campaign that also drives the entry
points the repository's handlers skip. No sequence broke supply conservation, emission caps, the
hourly/daily mint limits, the refine queue or the per-account vs global accrual relation.

The one material finding is outside the MOHN books: the `lockBucketRoles()` fix for the internal
audit's completeness-critic finding can be undone by the 96 h Timelock in two calls (ACC-1). The
rest are a Low economic issue in scrap-credit pricing (ACC-4) and Info items: invariants stated as
equalities that are false in the live system (ACC-2, ACC-3, ACC-6), test-suite blind spots that
make several catalogue invariants vacuous or loose (ACC-5), and a permanently earmarked slice of
the treasury share (ACC-7).

| ID | Severity | Title | Location | Status |
|---|---|---|---|---|
| ACC-1 | **Medium** | `LOCKED_ROLE` is administered by `DEFAULT_ADMIN_ROLE`: the Timelock can re-grant the "frozen" bucket roles and redirect the POL and buyback ETH | `RevenueRouter.sol` `lockBucketRoles` (L63-71), `LOCKED_ROLE` (L27) | Open, reproduced |
| ACC-2 | Info | R1 (`balance == buckets`) and "core never holds ETH" are breakable with forced ETH; that ETH is stuck forever | `RevenueRouter.sol`; `MiningCore.sol` (proxy); docs/04 S2 R1 | Open, reproduced |
| ACC-3 | Info | E2 as written in docs/04 S2 is false once anyone burns MOHN outside MiningCore (holder `burn`, buyback, LP fee burn) | docs/04 S2 E2; all E2 properties | Open, reproduced |
| ACC-4 | Low | Scrap credit is priced after the player's own purchases: "buy, then scrap" yields more capex value than "scrap, then buy" for the same fleet | `MiningCore.sol` `scrapMachines` (L577); docs/02 S6.4 | Open, reproduced |
| ACC-5 | Info | Several catalogue invariants are asserted vacuously or with a bound too loose to catch a bug (M2, E1 after a warp, E5, T3 "via B1", S1 wallet path, E4 in MiningCore) | `test/invariant/*`, `test/recon/*`, `audits/TRACEABILITY.md` | Open, argued (S3) |
| ACC-6 | Info | `invariant_tankWithinCapacity` is not an invariant of the contract (the tank cap is not retroactive) | `test/invariant/MiningCoreFuel.invariant.t.sol` | Open, reproduced |
| ACC-7 | Info | The referral earmark of accounts that never settle again stays locked in `treasuryPending` forever | `MiningAccounting.sol` `_checkpoint` (L163), `_returnReferral` (L280) | Open, reproduced |

Counts: Critical 0, High 0, Medium 1, Low 1, Info 5. Proposed invariants: 25 (15 implemented and
passing in the new harness, 10 specified for the market/ETH layer and governance state).

## 2. Invariant coverage matrix (docs/04 S2)

"Econ" = `test/invariant/MiningCoreEconomy.invariant.t.sol`, "Acc" = `MiningAccounting.invariant.t.sol`
(AccountingHarness, not MiningCore), "Fuel" = `MiningCoreFuel.invariant.t.sol`, "Gov" =
`Governance.invariant.t.sol`, "Tok" = `MohnToken.invariant.t.sol` (standalone token, a fake minter),
"Recon" = `test/recon/Properties.sol` (Medusa, Echidna, `CryticToFoundry`), "Halmos" =
`test/formal/MohnToken.halmos.t.sol`. "This review" = `audit-tests/accountant/`.

| Code | Foundry handler | Medusa/Echidna property | Halmos | Gap found | This review |
|---|---|---|---|---|---|
| T1 supply <= CAP | Tok `invariant_supplyNeverExceedsCap` | `invariant_T1_supplyBelowCap` | `prove_totalSupplyNeverExceedsCap` | none | - |
| T2 only minter, fixed | Tok `invariant_onlyMinterMints` | not asserted (token only driven through core) | `prove_onlyMinterCanMint` | immutable by construction; fine | - |
| T3 <= 500K / UTC day | Tok only (standalone token) | **not asserted**; TRACEABILITY says "via B1", but B1 (150K per 60-65 min) allows ~3.3M per day, so B1 does not imply T3 | `prove_dailyMintNeverExceedsCap` | never checked in the integrated system | NEW-9 asserts `mintedToday() <= DAILY_MINT_CAP` in the system |
| B1 <= 150K / 60 min | Econ `invariant_hourlyMintBreaker` (ghost over refine/finalize mints) | `invariant_B1_hourlyMint` | - | `openMarket`'s LP mint is in no handler; the window's own bookkeeping is never compared to the ghost | NEW-9 (exact window) |
| E1 claims <= distributed | Acc, Econ `invariant_claimsBoundedByDistribution` | `invariant_E1_claimsBounded` | - | after a `warp` the bound adds `reserve()` (~CAP), so the check is vacuous whenever the last call was a warp; no lower bound (credit could leak unnoticed); Recon skips when > 168 h behind | NEW-5 (snapshot + catch-up, exact upper bound, dust lower bound) |
| E2 conservation | Acc, Fuel, Econ `invariant_supplyConservation`; `integration/Market.t.sol` `_conservation()` | `invariant_E2_conservation` | planned | no handler burns MOHN or pays from the wallet; the equality is false with holder burns (ACC-3) | NEW-1, NEW-2, NEW-3 |
| E3 activeDp = sum of fuelled DP | Acc, Econ, Fuel | `invariant_E3_activeDp` | - | the `dpEndingAt` schedule itself is never checked | NEW-6 |
| E4 expired never earns | Acc `invariant_expiredNeverEarns` (harness only, no referral) | **not asserted** (TRACEABILITY: "via E1/E3") | - | not checked in MiningCore, where referral credit also moves `pendingOf` | proposed NEW-16 |
| E5 <= E_h per hour | Acc `invariant_hourlyEmissionBound` | **not asserted** | - | compares to `hourlyEmission(CAP)` (the maximum ever), measures from the first call in the hour, not from the boundary; never with recycling | NEW-13 (every boundary, net of recycling) |
| E6 E_h = floor(R_h * delta) | `differential/EmissionMath.diff.t.sol` (pure function) | **not asserted** | - | never checked on the stored `hourEmission` along a stateful run with recycling | NEW-13 (from `HourClosed` events) |
| M1 pads / fuel line | Econ `invariant_padsCapacityAndTotals` | `invariant_M1_padsAndCapacity` | - | iterates the 6 gen-1 types only (`typeSeed % 6`) | M1 over the live catalog |
| M2 catalog immutable | Econ `invariant_catalogImmutable` | `invariant_M2_catalogImmutable` | - | **vacuous**: no handler calls `addMachineGeneration`; Econ also asserts the count never changes, so it would fail spuriously if one did | NEW-15 (generations added in the run) |
| V1 no bulk discount | `fuzz/VrgdaMath.fuzz.t.sol` (pure) | **not asserted** | - | not stateful | - |
| V2 monotone | fuzz (pure) + unit | **not asserted** | - | price continuity across re-anchoring never asserted statefully (Recon calls `setParam` on r/k but has no property for it) | NEW-8 |
| S1 80/20 | Econ `invariant_spendSplit` | `invariant_S1_spendSplit` | - | every handler passes `payFromWallet=false`: the `burnFrom` path is never fuzzed; the fast-refine fee split is not covered | NEW-14 (wallet included) |
| R1 router balance = buckets | Econ `invariant_routerBuckets`; unit `testFuzz_r1` | `invariant_R1_routerBuckets` | - | deposits only (no pulls, no `depositBuyback`, no `setSplit`); equality breakable by forced ETH (ACC-2) | NEW-11 (provenance, split exactness with `setSplit`) |
| R2 referral <= treasury share | Econ `invariant_referralBounded` | `invariant_R2_referralBounded` | - | `referralReserve <= treasuryPending` never asserted | NEW-4 |
| P1 bounded, rate-limited | Gov (setParam only) | `invariant_P1_params` | - | `setRecipients`, `setSequencerFeed`, `router.setSplit`, `bb.setDailyBps` rate limits only unit-tested | proposed NEW-24 |
| P2 pause <= 72 h | Gov `invariant_guardianPauseBounded` | `invariant_P2_pauseBounded` | planned | `extendPause` / `unpause` in no handler | NEW-12 (exact model) |
| L1 liquidity locked | integration only (`test_noLiquidityRemovalFunction`, fixed loop `test_liquidityNeverDecreases`) | **not asserted** | planned | no stateful handler drives swaps / buyback / addLiquidity / collectFees | proposed NEW-17 |

## 3. Handler entry-point coverage gaps

Every external state-changing function and the stateful suites that call it ("-" = none; unit and
integration tests are not stateful handlers).

| Contract.function | Econ | Fuel | Gov | Acc | Tok | Recon | This review |
|---|---|---|---|---|---|---|---|
| MiningCore.buyFuel | yes (price fixed 2500) | yes | - | - | - | yes (price fixed) | yes, ETH/USD moves 1000-5000 |
| MiningCore.buyMachines | `payFromWallet=false` only | - | - | - | - | false only | both |
| MiningCore.upgradeSite | false only | - | - | - | - | false only | both |
| MiningCore.setActiveRigs / scrapMachines | yes | - | - | - | - | yes | yes (+ credit formula) |
| MiningCore.refine | yes | - | - | - | - | yes | yes |
| MiningCore.finalizeRefine | yes (incl. dev/treasury) | - | - | - | - | actors only | yes |
| MiningCore.withdrawDevShare / withdrawTreasuryShare | yes | - | - | - | - | **-** | yes |
| MiningCore.poke | via catch-up | yes | - | yes (harness) | - | yes | yes (+ HourClosed checks) |
| MiningCore.openMarket | **-** | - | - | - | - | **-** | **-** (needs PoolManager fixture) |
| MiningCore.addMachineGeneration | **-** | - | - | - | - | **-** | yes |
| MiningCore.setParam | - | - | yes (no players) | - | - | yes | yes (with players) |
| MiningCore.pause | - | - | yes | - | - | yes | yes |
| MiningCore.extendPause / unpause | **-** | - | **-** | - | - | **-** | yes |
| MiningCore.setRecipients / setSequencerFeed | **-** | - | **-** | - | - | **-** | **-** |
| MiningCore.wireLiquidityManager / upgradeToAndCall / role functions | - | - | - | - | - | - | - (unit only) |
| MohnToken.burn / transfer (holders) | **-** | - | - | - | yes (standalone) | **-** | yes |
| MohnToken.burnFrom (core wallet path) | **-** | - | - | - | - | **-** | yes |
| MohnToken.permit / transferFrom | - | - | - | - | - | - | - |
| RevenueRouter.pullBuyback / pullPol / withdrawOps / depositBuyback | **-** | - | - | - | - | **-** | **-** |
| RevenueRouter.setSplit / lockBucketRoles | **-** | - | - | - | - | **-** | setSplit only |
| BuybackBurner.executeBuyback / setDailyBps | **-** | - | - | - | - | **-** | **-** |
| LiquidityManager.addLiquidity / collectFees (+ third-party pool swaps) | **-** | - | - | - | - | **-** | **-** |

Main gaps, in order of risk: (1) the whole ETH/market layer (router pulls, BuybackBurner,
LiquidityManager, pool swaps, `openMarket`) has no stateful handler, so R1-with-pulls, the
buyback/LP ETH flows and L1 are only checked by fixed sequences; (2) the wallet payment path
(`burnFrom`) was never fuzzed before this review; (3) `addMachineGeneration`, `extendPause`,
`unpause`, `setRecipients`, `setSequencerFeed` are in no handler; (4) Recon has no dev/treasury
withdrawals, so its E2/B1 never see share mints; (5) every handler pins ETH/USD at 2,500, so the
oracle-dependent tank and genesis-fuel paths are fuzzed at one price.

Remaining gap after this review: the market layer. A handler over `test/integration/Market.t.sol`'s
setup (etched PoolManager, `PoolSwapper`) driving `openMarket`, swaps, `executeBuyback`,
`addLiquidity`, `collectFees`, `withdrawOps` is the next step (NEW-17 to NEW-20).

## 4. Findings

### ACC-1 (Medium): the Timelock can undo `lockBucketRoles()`

**Location.** `src/RevenueRouter.sol` L25-27 (`LOCKED_ROLE`), L63-71 (`lockBucketRoles`).

**Issue.** `lockBucketRoles()` sets the admin of `DEPOSITOR_ROLE`, `FEE_DEPOSITOR_ROLE`, `POL_ROLE`
and `BUYBACK_ROLE` to `LOCKED_ROLE`, documented as "Nobody holds it". But the admin of `LOCKED_ROLE`
itself is never set, so in OpenZeppelin `AccessControl` it is `DEFAULT_ADMIN_ROLE` (0x00), held by
the 96 h Timelock. The fix of the internal audit's completeness-critic finding ("the Timelock could
grant itself the POL/buyback roles and redirect those buckets") is therefore reversible.

**Sequence** (each step a public 96 h Timelock operation; they can be batched in one):
1. `router.grantRole(LOCKED_ROLE, timelock)` (allowed: admin of `LOCKED_ROLE` is 0x00).
2. `router.grantRole(POL_ROLE, X)`, `router.grantRole(BUYBACK_ROLE, X)`; optionally
   `revokeRole(POL_ROLE, liquidityManager)`, `revokeRole(DEPOSITOR_ROLE, core)`.
3. `X.pullPol(polBalance)`, `X.pullBuyback(buybackBalance)`.

**Impact.** 85 % of fuel revenue (buyback 55 % + POL 30 %) becomes discretionary; the deployed
`Deploy.s.sol` check `getRoleAdmin(POL_ROLE) == LOCKED_ROLE` still passes. Revoking
`DEPOSITOR_ROLE` from MiningCore makes every `buyFuel` revert (new players cannot join, tanks run
dry). Bounded by the 96 h public delay, hence Medium rather than High, the same rating the internal
audit gave the original issue.

**Test.** `audit-tests/accountant/AccountantFindings.t.sol::test_ACC1_timelockReclaimsLockedBucketRoles`
(`... forge test --match-test test_ACC1 -vvv`). The repository's `test_lockBucketRoles` only tries a
direct `grantRole(POL_ROLE, ...)`.

**Recommendation.** In `lockBucketRoles()` also call `_setRoleAdmin(LOCKED_ROLE, LOCKED_ROLE)` (a
self-administered role with no member can never be granted), and assert
`getRoleAdmin(LOCKED_ROLE) == LOCKED_ROLE` in `Deploy.s.sol::assertHandedOver` and in the unit test,
plus a negative test for the two-step path. Add NEW-25 (role-admin graph invariant).

### ACC-2 (Info): forced ETH breaks R1 and the "core holds no ETH" property and is stuck

**Location.** `src/RevenueRouter.sol` (no `receive`, no sweep); `MiningCore` proxy; docs/04 S2 R1;
`invariant_routerBuckets`, `invariant_R1_routerBuckets`, `invariant_routerReceivesAllFuelEth`.

**Sequence.** Deploy a contract with value whose constructor `selfdestruct(router)` (EIP-6780
still transfers the balance). `router.balance == buckets + v`; the same works on the core proxy.

**Impact.** No protocol funds are at risk (the sender loses its own ETH), but R1 as an equality is
not a property of the deployed contracts, and the forced ETH can never leave (every exit is bounded
by a bucket, `_debit`). If the indexer or an alert ever checks R1 with `==`, anyone can trigger it
for 1 wei (no such rule exists today in `infra/monitoring`).

**Test.** `AccountantFindings.t.sol::test_ACC2_forcedEthBreaksR1AndIsStuck`.

**Recommendation.** Restate R1 as `balance >= buyback + pol + ops` (equality only in handlers that
cannot force ETH) and "core holds no ETH" as "core balance never grows through any function". An
optional `sweepSurplus()` (anyone; credits `balance - buckets` to the buyback bucket) removes the
stuck-ETH case.

### ACC-3 (Info): E2 as specified is false under burns outside MiningCore

**Location.** docs/04 S2 E2 (and docs/02 S4): `totalSupply + pending + queue + R + burnedForever ==
CAP`. `MohnToken` is `ERC20Burnable`; BuybackBurner and LiquidityManager also burn.

**Sequence.** Mine past Market Open, `refine(fast)`, then the holder calls `mohn.burn(x)`: the E2
sum drops by exactly `x` because no core counter tracks it.

**Impact.** None on-chain. Every E2 property in the repo holds only because no handler burns
(`Market.t.sol::_conservation` adds `bb.totalBurned() + lm.mohnFeesBurned()` but still not holder
burns). A future off-chain E2 monitor written from docs/04 would alarm on the first holder burn.

**Test.** `AccountantFindings.t.sol::test_ACC3_holderBurnBreaksE2AsSpecified`.

**Recommendation.** Restate E2 with an explicit external-burn term:
`reserve + outstanding credit + devPending + treasuryPending + burnedForever + refineQueued +
totalSupply + externallyBurned == CAP`, where `externallyBurned` is the MOHN burned by any path
other than MiningCore's `burnFrom` (holder `burn`, `BuybackBurner`, `LiquidityManager` fee burns).
On-chain only `E2 sum <= CAP` can be checked; handlers and an indexer can keep `externallyBurned`
from `Transfer(_, address(0), x)` events (NEW-1).

### ACC-4 (Low): scrap credit is priced after the player's own VRGDA purchases

**Location.** `src/MiningCore.sol` L577 (`credit = dp * qty * _unitPrice(c) * 20 %`), spec docs/02
S6.4 ("net effect is still a sink").

**Issue.** The credit uses the price after every sale so far, including the scrapping player's own
purchases a moment earlier. For the same final fleet, buying the new rigs first and scrapping the
old ones second yields extra credit `0.2 * U_old * (p_after - p_before)` where `p_after =
p_before * a^q` (`a = (1-k)^(-1/r)`, `q` = DP units just bought). Capex paid with credit burns
nothing, so the protocol sink shrinks by 80 % of that bonus.

**Sequence** (default k = 0.15, r = 2,000; `AccountantScrap.t.sol`): a level-15 site with 10 idle
Turbodrills (10,000 DP). Path A: `scrapMachines(TURBO, 10)` then `buyMachines(PLASMA, 3)`. Path B
(same block): `buyMachines(PLASMA, 3)` then `scrapMachines(TURBO, 10)`. Same fleet; path B holds
2,236.8 MOHN more capex value (price 1.20 to 2.32 MOHN/DP), matching the formula to 1e-6.

**Extreme case (precise argument, UNPROVEN as practical).** Buying `q` units and scrapping the same
units returns `0.2 * q * a^q * ln(a) / (a^q - 1)` of the cost as credit, about `0.2 * L` for
`L = q ln a` large. With governance at its bounds (k = 0.35, r = 1,000, `ln a = 4.3e-4`) and two
10,000-unit purchases before scrapping (L = 8.6) the ratio is about 1.7: more credit than MOHN
spent, a capex-credit "printer" whose price side effect (price x e^8.6) blocks every other buyer for
about 20 days. Needs millions of MOHN, so not practical today.

**Test.** `audit-tests/accountant/AccountantScrap.t.sol::test_ACC4_buyBeforeScrapInflatesScrapCredit`
(funds the whale with `deal(..., adjust=true)`; conservation is not the subject of this PoC).

**Recommendation.** Price scrap credit at `min(current price, price at the start of the block /
UTC day)` (store a per-day opening price), or at the price the rig was bought at (store per-type
average cost), or do not count units bought with scrap credit in `vrgdaSold`. Then add NEW-22.

### ACC-5 (Info): vacuous or loose assertions in the existing suites

Precise arguments (no test needed, see the matrix):
- **M2** cannot fail in Econ or Recon: no handler calls `addMachineGeneration`; and
  `assertEq(core.machineTypeCount(), catalogAtStart.length)` would be a false positive if one did.
- **E1** in Econ/Recon adds `core.reserve()` to the bound whenever `lastUpdate != now`. The handler
  catches up before every action, so the check is exact only when the last call was not `warp`;
  after a warp the bound is about CAP and nothing can fail. There is also no lower bound, so credit
  that silently disappears (users losing accrual) is invisible.
- **E5** (`Acc`) compares to `hourlyEmission(CAP)`, the largest emission there will ever be, and
  measures from the first handler call inside an hour; it never sees recycling (harness only).
- **T3** is claimed in Recon "via B1"; B1 permits about 150K x 22 = 3.3M per day.
- **S1** never sees the wallet path (`payFromWallet` is `false` in every handler).
- **E4** is not checked in MiningCore (only in the AccountingHarness, which has no referral hook).

**Recommendation.** Adopt NEW-5, NEW-9, NEW-13, NEW-14, NEW-15, NEW-16 (implemented or specified
below) in `test/invariant` and `test/recon`, and correct TRACEABILITY.md (T3, E4, E5, E6, V1, V2, L1
are not Recon properties today).

### ACC-6 (Info): the tank cap is not retroactive, so `invariant_tankWithinCapacity` is not a contract invariant

**Location.** `test/invariant/MiningCoreFuel.invariant.t.sol::invariant_tankWithinCapacity`;
`MiningCore.buyFuel` checks `_maxTank` only at purchase.

**Sequence.** Fill a level-1 tank to 4,250 L (cap 4,320 L), Timelock `setParam(MaxTankHours, 168)`
(allowed: step 0, any value within 168-2,160): the tank is above `6 L/h x 168 h = 1,008 L`. The
suite only passes because its handler never changes parameters.

**Impact.** None on-chain (the player keeps fuel they paid for; further purchases revert until it
burns down). The property would fail as soon as governance is added to that handler.

**Test.** `AccountantFindings.t.sol::test_ACC6_tankCapIsNotRetroactive`.

**Recommendation.** Replace with NEW-25b: "right after a successful `buyFuel`, `tank <= _maxTank`
at that moment" (a ghost in the handler), plus NEW-7 (fuel solvency).

### ACC-7 (Info): earmark of dormant accounts is never released

**Location.** `MiningAccounting._checkpoint` L163 (earmarks 3 % of every miners' share),
`MiningCore._onAccrued` / `MiningAccounting._returnReferral` (release only on the earner's settle).

**Issue.** The earmark is created for all miners' share, with or without a referrer, and released
only when the account that earned it settles. An account that never acts again keeps 3 % of its
unsettled accrual earmarked forever, although (with no referrer, or with a referrer who stops
fuelling) no referral can be owed. Upper bound: 2.7 % of all emission accrued by dormant accounts;
it stays in `treasuryPending` (not lost, not withdrawable).

**Test.** `AccountantFindings.t.sol::test_ACC7_earmarkOfDormantAccountsNeverReleased` (two
accounts without referrers; after one settles, `referralReserve == 3 % of the dormant account's
pending`, and `withdrawTreasuryShare(treasuryPending)` reverts with `InsufficientShare`).

**Recommendation.** Accept and document (the treasury always keeps at least 2.3 % of emission
free), or earmark per referred account only: keep `referredDp` (active DP of accounts with a
referrer) and earmark `3 % x minersSum x referredDp / activeDp`. Then NEW-21 (exact earmark book)
becomes exact rather than an upper bound.

## 5. Proposed new invariants

Implemented and passing in `audit-tests/accountant/Accountant.invariant.t.sol` (NEW-1 to NEW-15):

| ID | Statement | Why | Where |
|---|---|---|---|
| NEW-1 | `reserve + (minersDistributed + referralPaid - unrefinedSpent - unrefinedRefined) + devPending + treasuryPending + burnedForever + refineQueued + totalSupply + externallyBurned == CAP` (ghost `externallyBurned` = holder, buyback and LP-fee burns) | E2 that is true in the live system (ACC-3) | `invariant_E2_withExternalBurns`; Recon: add a `burnTokens` target + ghost |
| NEW-2 | `emitted == minersDistributed + devPending + devWithdrawn + treasuryPending + treasuryWithdrawn + referralPaid` | the 90/5/5 books and the World Depth source agree to the wei | `invariant_emissionSharesBalance` |
| NEW-3 | `reserve + emitted == CAP + recycled - lpMintedFromReserve` (ghost `recycled` = 20 % of spends + half of fast fees) | emission is drawn from, and recycling returns to, the same reserve; catches a lost or double-counted recycle | `invariant_reserveIdentity` (LP term needs the market handler) |
| NEW-4 | `referralReserve <= treasuryPending` and `referralPaid * 10,000 <= minersDistributed * 300` | otherwise `withdrawTreasuryShare` panics and referral could exceed its source | `invariant_referralEarmarkCovered` |
| NEW-5 | after a full catch-up (state snapshot): `sum pendingOf(a) <= assigned` and `assigned - sum pendingOf(a) <= 1e6 wei`, with `assigned = minersDistributed + referralPaid - unrefinedSpent - unrefinedRefined` | exact E1 plus a no-leak lower bound (users never silently lose accrual) | `invariant_E1_tightAndNoLeak` |
| NEW-6 | `activeDp == sum over distinct expiry hours h > currentHour of dpEndingAt[h] == sum of DP of positions with expiryHour > currentHour` | catches stale or double schedule entries before they reach `activeDp` | `invariant_E3_scheduleMatchesActiveDp` |
| NEW-7 | for every active position: `(tankOf(a) + 1) * 3600 >= burn(a) * (expiryHour * 3600 - max(now, genesis))`, and `tankOf(a) <= site.tank` | fuel solvency: no second of mining without paid fuel; the settled tank only drops | `invariant_fuelCoversActivePeriod` |
| NEW-8 | `vrgdaSold == sum of DP units bought`; `unitPrice()` unchanged by `setParam(VrgdaR / VrgdaK)`; scrap credit `== dp * qty * unitPrice * 20 %`, 0 for the Pilot Rig | counter integrity, re-anchor continuity (docs/02 S12), scrap formula | `invariant_vrgdaAndScrap` |
| NEW-9 | `mintRoom() == 150K - (ghost mints in the current 13 five-minute buckets)` and `mohn.mintedToday() <= 500K` | the ring buffer never loses or invents a bucket; T3 checked in the integrated system | `invariant_B1_windowExact` |
| NEW-10 | after the Market Open hour boundary `genesisMinerAccrual` is constant; after `marketOpenTime` `genesisFuelUsd` is constant | P0 inputs cannot move after genesis | `invariant_genesisInputsFrozen` |
| NEW-11 | `router.balance == sum fuel wei` (without pulls), `buybackBalance == sum floor(v * buybackBps_at_deposit)`, same for POL, `sum fuelSpentWei == sum fuel wei`, core balance 0 | ETH provenance per bucket, including `setSplit` | `invariant_R1_ethProvenance` |
| NEW-12 | `pausedUntil` equals the model `pause: max(until, now + 72h); extendPause(u): u; unpause: 0`; Guardian pauses >= 7 days apart; `pausedUntil <= now + 30 days` | P2 with every pause entry point | `invariant_P2_pauseModel` |
| NEW-13 | at every `HourClosed(h, acc, active, R, E)`: `E == floor(R * DELTA_H_WAD / 1e18)`; `R_prev + recycledInHour - R <= E_prev`; `acc` non-decreasing | E5 and E6 on the stored state, with recycling | `invariant_E5_E6_hourly` (handler reads the events) |
| NEW-14 | each spend: `burnedForever delta == spent - floor(spent / 5)` and `reserve delta == floor(spent / 5)` with `spent = unrefined used + wallet burned` | S1 on the `burnFrom` path | `invariant_S1_includingWallet` |
| NEW-15 | catalog entries never change and the count only grows by accepted generations | M2 non-vacuous | `invariant_M2_catalogAppendOnly` |

Specified, not implemented (need the market handler or new ghosts):

| ID | Statement | Why | Suggested handler / property |
|---|---|---|---|
| NEW-16 | for an account with `expiryHour <= currentHour`, `pendingOf` never increases (referral credit requires the referrer to have fuel) | E4 in MiningCore, including the referral hook | Econ/Recon: snapshot `pendingOf` of expired actors before each call |
| NEW-17 | the LiquidityManager position's liquidity is non-decreasing across `openMarket`, `addLiquidity`, `collectFees`, `executeBuyback` and arbitrary third-party swaps | L1 under random sequences (today a fixed 6-step loop) | new market handler over `Market.t.sol` setup + `PoolSwapper`; Recon property |
| NEW-18 | `sum buyback deposits (fuel share + ethFeesToBuyback + BB leftovers) == buybackBalance + sum pullBuyback`; `bb.totalEthSpent <= sum pullBuyback`; `address(bb).balance == 0` after every call | ETH conservation through BuybackBurner | market handler |
| NEW-19 | `sum fuel POL share == polBalance + sum pullPol`; `address(lm).balance <= dust` after `addLiquidity`; `lm.mohnFeesBurned` and `bb.totalBurned` equal the token burns they cause | ETH/MOHN conservation through LiquidityManager | market handler |
| NEW-20 | after `openMarket`: `reserve` dropped by exactly the LP minted, `LP <= min(1M, mint room)`, `marketOpened && lm.opened`, and `openMarket` can never succeed twice | one-time Market Open accounting | market handler |
| NEW-21 | `referralReserve == sum floor(3 % x minersSum_checkpoint) - referralPaid - sum released` (ghost from `HourClosed`/`ReferralCredited` and per-accrual releases) | exact earmark book, not only the upper bound | Econ ghost |
| NEW-22 | scrap credit ever granted for a rig <= 20 % x the price at which equivalent DP could be bought before the scrapper's own purchases that day | makes "scrap is a sink" (docs/02 S6.4) true; fails today (ACC-4) | Econ: ghost per account |
| NEW-23 | every open refine request has `readyAt <= enqueuedAt + 168 h`; `refineQueued == sum of open request amounts` for every owner incl. dev/treasury | funds are never locked longer than the maximum delay; queue book | Recon (owners incl. DEV/TREASURY) |
| NEW-24 | two successful `setRecipients`, `setSequencerFeed`, `router.setSplit` or `bb.setDailyBps` calls are at least their period apart; every value within its bounds | P1 for the setters outside `setParam` | Gov handler |
| NEW-25 | role-admin graph: `getRoleAdmin(LOCKED_ROLE) == LOCKED_ROLE` and nobody holds `LOCKED_ROLE`; core `getRoleAdmin(UPGRADER_ROLE) == UPGRADER_ROLE`; (b) right after a successful `buyFuel`, `tank <= _maxTank` at that moment | ACC-1 class; correct form of the tank cap (ACC-6) | unit + Gov handler with role calls; Fuel handler ghost |

## 6. Things checked that held

- Supply conservation across spend (unrefined and wallet), fast refine fee (half burned, half to
  reserve), queued refine, dev/treasury withdrawals, referral credit (moves treasury to referrer).
- Per-account vs global accrual: exact upper bound and dust-level lower bound (NEW-5) with
  referral, expiry boundaries, refuels, rig toggles and parameter changes interleaved.
- Hour-boundary accounting with recycling: E5/E6 hold at every boundary (NEW-13); `acc` monotone.
- Fuel: consumption rounds up and runtime down, and every recompute starts from the settled tank,
  so an active position always has the fuel for its remaining time (NEW-7).
- Hourly mint window: the 13-bucket ring buffer equals the ghost record exactly (NEW-9).
- Referral earmark never exceeds the treasury share (NEW-4); `_takeShare` cannot panic.
- VRGDA re-anchoring keeps the price bit-identical (NEW-8).
- Timelock pause model and Guardian cooldown (NEW-12); parameters stay in bounds (P1).

Not reviewed in depth (other roles): Uniswap v4 settlement arithmetic in `PoolActor`, oracle
edge cases, upgrade safety.
