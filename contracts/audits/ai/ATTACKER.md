# AI pre-screen: attacker role (2026-10-12)

Independent adversarial review of the Mohonaut contracts. This is an AI pre-screen, not an audit
(docs/04 S3: "AI on tarama ... denetimin yerini tutmaz").

## Scope read

- `contracts/src`: `MiningCore.sol`, `MiningAccounting.sol`, `MohnToken.sol`, `RevenueRouter.sol`,
  `LiquidityManager.sol`, `BuybackBurner.sol`, `PoolActor.sol`, `lib/*` (EmissionMath, VrgdaMath,
  SiteMath, MarketOpenMath, MohnPool), `interfaces/*`.
- `contracts/script/Deploy.s.sol` (role wiring, `lockBucketRoles`, hand-over assertions).
- `contracts/audits/SCOPE.md`, `contracts/audits/FINDINGS.md` (fixed items not re-reported unless
  the fix is broken).
- `docs/02` (S3-S11: emission, fuel, VRGDA, site, refinery, referral, Market Open), `docs/03`,
  `docs/04` (threat model, invariant catalogue S2, guarded launch S5.2).
- Existing tests reused as reference: `test/integration/Market.t.sol` (real v4 PoolManager
  fixture), `test/unit/*`.

## Method

1. Enumerated every external/public state-changing function (MiningCore: `buyFuel`,
   `buyMachines`, `setActiveRigs`, `scrapMachines`, `upgradeSite`, `refine`, `finalizeRefine`,
   `withdrawDevShare`, `withdrawTreasuryShare`, `openMarket`, `poke`, governance setters, `pause`,
   `extendPause`, `unpause`, `wireLiquidityManager`, `addMachineGeneration`, `upgradeToAndCall`;
   token `mint`/`burn`/`burnFrom`/`permit`; router `deposit*`/`pull*`/`withdrawOps`/`setSplit`/
   `lockBucketRoles`; LiquidityManager `openMarket`/`addLiquidity`/`collectFees`/`unlockCallback`/
   `beforeInitialize`; BuybackBurner `executeBuyback`/`setDailyBps`/`unlockCallback`; AccessControl
   `grantRole`/`revokeRole`/`renounceRole` on all four).
2. For each, listed concrete attacks (reentrancy, role graph, rounding, AMM/oracle manipulation,
   VRGDA, timelock/role bypass, UUPS, griefing/DoS, loops, mint-limit bypass, referral abuse,
   sandwiching of buybacks/additions, ETH accounting, initializer front-running).
3. Wrote Foundry PoCs against a deployment that mirrors `Deploy.s.sol` (including
   `lockBucketRoles`) and the real Robinhood Chain Uniswap v4 PoolManager runtime code
   (`audit-tests/attacker/AttackBase.sol`). Failed attacks are kept as passing "negative" tests.

All PoCs run with (from `contracts/`):

```bash
FOUNDRY_TEST=audit-tests/attacker FOUNDRY_OUT=out-attacker FOUNDRY_CACHE_PATH=cache-attacker forge test -vv
```

Result: 19 tests, 19 passed (10 attack PoCs in `Attacks.t.sol`, 9 negative tests in
`Negative.t.sol`).

## Findings

| ID | Severity | Title | Location | Status |
|---|---|---|---|---|
| ATK-1 | Medium | `lockBucketRoles` is bypassable: the 96 h Timelock administers `LOCKED_ROLE` and can re-grant every "frozen" bucket role (broken fix of the FINDINGS completeness-critic item) | `src/RevenueRouter.sol:27`, `:63-69` | PROVEN |
| ATK-3 | Medium | Daily buyback/LP caps do not bound a stolen keeper key: concentrated JIT liquidity inflates `_poolEth()` 30-60x for capital returned in the same block; the sandwich extracts 38-59 % of the spend (invalidates the acceptance rationale of FINDINGS #12) | `src/PoolActor.sol:101-106`, `src/BuybackBurner.sol:81`, `:113`, `src/LiquidityManager.sol:236`, `:172` | PROVEN |
| ATK-2 | Low | The refinery opens at the same instant as Market Open and shares the hourly mint window, so refines executed first shrink the Market Open LP by 36 % (63 % at a 0 % fast fee) | `src/MiningCore.sol:807-809`, `:904-910` | PROVEN |
| ATK-4 | Info | Daily caps reset at the UTC boundary: two days of cap can be spent one second apart | `src/BuybackBurner.sol:79`, `src/LiquidityManager.sol:234` | PROVEN |
| ATK-5 | Info | MOHN is mintable and tradable on a third-party pool (other fee tier, no hook) before `openMarket`; the hook only protects one pool key | `src/MiningCore.sol:807-809` | PROVEN |
| ATK-6 | Info | Invariant R1 is stated as `balance == buckets`; forced ETH (SELFDESTRUCT) makes it `>` | `src/RevenueRouter.sol` (R1, docs/04 S2) | PROVEN |
| ATK-7 | Info | Sequencer uptime check accepts `startedAt == 0` (uninitialised round) as "up" | `src/MiningCore.sol:461` | PROVEN |

Counts: Critical 0, High 0, Medium 2, Low 1, Info 4.

---

### ATK-1 (Medium): `lockBucketRoles` can be undone by the 96 h Timelock

**Description.** `lockBucketRoles()` sets the admin of `DEPOSITOR_ROLE`, `FEE_DEPOSITOR_ROLE`,
`POL_ROLE` and `BUYBACK_ROLE` to `LOCKED_ROLE` and documents that "nobody holds it, so the wiring
... can never be changed afterwards". But the admin of `LOCKED_ROLE` itself is never set, so it is
the OpenZeppelin default, `DEFAULT_ADMIN_ROLE`, which the 96 h Timelock holds after
`Deploy.s.sol`. In one Timelock batch the Timelock can `grantRole(LOCKED_ROLE, self)` and then
grant `POL_ROLE`/`BUYBACK_ROLE` to any address and revoke them from the LiquidityManager and the
BuybackBurner. Neither `test_lockBucketRoles` nor `assertHandedOver` checks
`getRoleAdmin(LOCKED_ROLE)`.

**Impact.** Exactly the issue the completeness critic raised in `FINDINGS.md` (Medium, "Fixed")
remains: the Timelock (proposer: the ops Safe) can redirect the buyback (55 %) and POL (30 %)
buckets, i.e. about 85 % of all fuel revenue, outside the bounded `setSplit`, and can brick
Market Open by revoking the LiquidityManager's `POL_ROLE`. It contradicts SCOPE.md's trust table
and docs/02 S10. Precondition: a malicious or compromised ops Safe plus the public 96 h delay.

**PoC.** `audit-tests/attacker/Attacks.t.sol::test_ATK1_timelockUnlocksFrozenBucketRoles`
drains the whole POL and buyback buckets to a third address and shows `openMarket` reverting.

```bash
FOUNDRY_TEST=audit-tests/attacker FOUNDRY_OUT=out-attacker FOUNDRY_CACHE_PATH=cache-attacker forge test --match-test test_ATK1 -vv
```

**Recommendation.** In `lockBucketRoles` also call `_setRoleAdmin(LOCKED_ROLE, LOCKED_ROLE)` (a
self-administered role nobody holds can never be granted). Add
`assertEq(getRoleAdmin(LOCKED_ROLE), LOCKED_ROLE)` and an "admin cannot grant LOCKED_ROLE" case to
`test_lockBucketRoles`, and the same `require` to `Deploy.s.sol::assertHandedOver`.

---

### ATK-3 (Medium): daily caps do not bound a stolen keeper key

**Description.** `executeBuyback` and `addLiquidity` cap the daily spend at 2 % / 4 % of
`_poolEth()`, which values the pool's *active* liquidity (`getLiquidity`) as if it were full
range. Anyone can add concentrated liquidity in the single tick spacing around the current price;
it counts fully in `getLiquidity` while needing only a tiny fraction of the capital a full-range
position would. With the keeper key (the threat SCOPE.md says the caps contain: "a stolen key
loses at most one day's capped buyback to bad pricing"), the attacker in one transaction:
pumps the price, adds a narrow JIT position (inflating the cap), calls `executeBuyback` /
`addLiquidity` with `minOut = 1` far above the honest cap, removes the JIT position and sells the
MOHN back. The swap uses `sqrtPriceLimitX96 = MIN_SQRT_PRICE + 1`, so there is no on-chain price
bound at all. FINDINGS #12 accepted cap inflation because "the keeper's own minOut still bounds
the price"; with a stolen key the attacker chooses minOut, so that rationale does not hold.

**Impact.** Measured on the real PoolManager bytecode:
- Cap inflation: narrow position of 30x the pool's liquidity costs about 7 % of pool ETH (plus the
  matching MOHN), fully returned in the same block; the buyback cap rises 31x
  (5.76e13 -> 1.79e15 wei).
- Buyback sandwich: half the buyback bucket (2.64e15 wei, 30x even the pumped cap) spent in one
  call; attacker profit 1.55e15 wei = 59 % of the spend.
- POL via `addLiquidity`: 7.08e15 wei spent (61x the honest 4 % cap); attacker profit 2.70e15 wei
  = 38 % of the spend.
Because spending is capped by design, the buckets accumulate (docs: the genesis buyback bucket is
spent "over many days"), so the value at risk is the whole unspent buyback and POL balance, not
one day's cap. Precondition: compromise of the keeper hot key.

**PoC.** `audit-tests/attacker/Attacks.t.sol`: `test_ATK3_concentratedJitInflatesDailyCaps`,
`test_ATK3b_stolenKeeperSandwichBeyondDocumentedBound`,
`test_ATK3c_stolenKeeperDrainsPolViaAddLiquidity`.

```bash
FOUNDRY_TEST=audit-tests/attacker FOUNDRY_OUT=out-attacker FOUNDRY_CACHE_PATH=cache-attacker forge test --match-test test_ATK3 -vv
```

**Recommendation.** (1) Size the caps from the protocol's *own* position
(`StateLibrary.getPositionLiquidity` for the LiquidityManager's full-range position, salt 0), not
the pool's active liquidity, or from the bucket balance (e.g. at most X % of the bucket per day).
(2) Bound price impact on-chain: replace `MIN_SQRT_PRICE + 1` with a limit derived from the
pre-swap price (e.g. at most 1-2 % impact per call), and/or require the pre-swap price to be within
X % of a price snapshot recorded in an earlier block (stops same-transaction pump-then-call).
(3) Correct the trust table in SCOPE.md until fixed.

---

### ATK-2 (Low): refines that run before `openMarket` squeeze the Market Open liquidity

**Description.** `_requireRefineOpen` opens the refinery at `genesis + 72 h`, the same instant
from which `openMarket` may run. `openMarket` clamps the LP mint to the room left in the shared
150K hourly mint window (`MiningCore.sol:904-910`, the FINDINGS #5 fix). Any fast refines that land
first (a dominant genesis whale, or simply the launch rush of players refining their genesis
credit) consume that room, and `openMarket` is permissionless, so a whale can refine and open
atomically. The pool then opens at P0 with proportionally less liquidity; the unused POL ETH stays
in the router, but `addLiquidity` may only add 4 % of the (now smaller) pool ETH per day and the
buyback cap shrinks in the same proportion.

**Impact.** With the whole genesis credit refined first (8 % fee): LP 40,480 -> 25,862 MOHN
(-36 %), pool ETH 2.88e15 -> 1.84e15 wei, 36 % of the POL ETH left in the router. With the fast fee
at its legal lower bound (0 %): LP 40,480 -> 15,067 MOHN (-63 %). The window cannot be filled
completely at Market Open (genesis credit is about 135K plus referrals), so this is a squeeze, not
a DoS (see negative test). It contradicts docs/02 S11's "LP is about 0.3 x genesis accrual".

**PoC.** `audit-tests/attacker/Attacks.t.sol::test_ATK2_refineRushSqueezesMarketOpenLiquidity`,
`::test_ATK2b_squeezeWithZeroFastFee`.

```bash
FOUNDRY_TEST=audit-tests/attacker FOUNDRY_OUT=out-attacker FOUNDRY_CACHE_PATH=cache-attacker forge test --match-test test_ATK2 -vv
```

**Recommendation.** Open the refinery (fast and standard refine, dev/treasury withdrawals) only
once `marketOpened` is true, e.g. `_requireRefineOpen` reverts `RefineClosed` while
`!c.marketOpened`. `openMarket` is permissionless, so this adds no liveness dependency, and it also
closes ATK-5. Alternatively reserve the LP's room in the window.

---

### ATK-4 (Info): UTC-day caps allow two days of spend within one second

`executeBuyback`/`addLiquidity` reset at `block.timestamp / 1 days`; spending the full cap at
23:59:59 and again at 00:00:00 doubles the per-call exposure (relevant together with ATK-3).
PoC: `test_ATK4_dayBoundaryDoublesCap`. Recommendation: a rolling 24 h window (as the mint
window does) or a per-call maximum.

### ATK-5 (Info): MOHN trades before the protocol pool exists

Fast refine works from `genesis + 72 h` even if `openMarket` has not run. Anyone can then
initialise a different ETH/MOHN pool (e.g. fee 500, no hook) at an arbitrary price and seed it;
the `beforeInitialize` hook only protects the protocol's pool key, so the first price discovery
can happen on an attacker-chosen pool. PoC: `test_ATK5_secondPoolBeforeMarketOpen`.
Recommendation: the ATK-2 fix (refinery opens with the market).

### ATK-6 (Info): R1 equality can be broken by forced ETH

`RevenueRouter` has no `receive`, but SELFDESTRUCT still transfers ETH (EIP-6780), so
`balance > buyback + pol + ops` is reachable. Harmless (stuck ETH), but an off-chain monitor that
alerts on `!=` could be griefed. PoC: `test_INFO_forcedEthBreaksR1Equality`. Recommendation:
state R1 as `>=` in docs/04 and monitoring.

### ATK-7 (Info): sequencer uptime feed with `startedAt == 0` is treated as up

Chainlink documents `startedAt == 0` on L2 uptime feeds as an uninitialised round; the check
`block.timestamp - startedAt <= SEQUENCER_GRACE` passes it. Only relevant once the Timelock
connects a feed. PoC: `test_INFO_sequencerStartedAtZeroAccepted`. Recommendation:
`if (startedAt == 0) revert SequencerDown();`.

---

## Attack ideas that did not work

PoC = passing negative test in `audit-tests/attacker/Negative.t.sol` unless noted.

1. Zero-credit caller touching the mint window (FINDINGS #1 fix): reverts before the window is read (`test_NEG_noCreditNoWindow`).
2. Filling the hourly window at Market Open so `openMarket` reverts: genesis credit (~135K + referrals) stays below 150K even at a 0 % fee (`test_NEG_cannotFillWindowToBlockOpen`).
3. Calling `openMarket` from inside another PoolManager `unlock` to interleave deltas: the LiquidityManager's own `unlock` reverts (`test_NEG_openMarketInsideUnlockReverts`).
4. Initialising the protocol pool key at a chosen price before Market Open: the hook rejects any sender but the LiquidityManager (existing `test_nobodyElseCanInitializeThePool`).
5. Forced ETH (SELFDESTRUCT or `PoolManager.take`) into BuybackBurner/LiquidityManager to DoS buybacks or additions: swept to the bucket / used as liquidity (`test_NEG_forcedEthDoesNotDos`).
6. Buy-then-scrap VRGDA arbitrage (scrap credit at the pumped price): credit < cost even at the most aggressive legal k = 0.35, r = 1,000 (`test_NEG_buyScrapLoopUnprofitable`).
7. Dust fast refines (1 wei) to grief the window: fee rounds up, 0 minted (`test_NEG_dustFastRefine`).
8. 96 h Timelock granting itself `UPGRADER_ROLE` on MiningCore: self-administered role holds (`test_NEG_paramsTimelockCannotGrantUpgrader`).
9. Initialising the implementation or front-running the proxy initializer: `_disableInitializers`; the proxy is initialised in its constructor (`test_NEG_implementationLocked`).
10. Keeping bought MOHN in the BuybackBurner: `mohnOut` is burned in the same call (`test_NEG_buybackBurnsAll`).
11. Reentrancy through the token (no hooks), router pulls (`nonReentrant`, CEI) and PoolManager callbacks (`onlyPoolManager`): no reachable path (review).
12. Earning before a position exists or after fuel expiry: `_requireCheckpointed` plus `accAtHour` snapshots; no counterexample found (review; covered by E3/E4 invariants).
13. Self-referral: ignored at registration; sybil referral is an accepted design cost (docs/02 S5.2 sybil metric <= 1 + referral rate).
14. Over-drawing the referral earmark or underflowing the treasury's `available`: per checkpoint treasury >= 5 % and earmark <= 2.7 % of emission; credits reduce both (review).
15. Pushing the pool price outside the full range to brick `addLiquidity`/`_poolEth`: needs more MOHN than CAP or astronomic ETH (arithmetic).
16. Market Open sqrt price outside TickMath bounds or P0 = 0: any active genesis fuel gives P0 > 0 and a price far inside the range (arithmetic).
17. Token daily cap (500K) blocking `openMarket`: total genesis credit is far below it (arithmetic).
18. Accumulator overflow with `activeDp = 1`: headroom of more than 1e19 hours (arithmetic).
19. ERC-7201 slot constants: recomputed, both match.
20. Front-running the CREATE2 LiquidityManager deployment: an identical init code yields the identical contract (same admin), so it only makes the script revert; no takeover.
21. Third-party JIT liquidity without the keeper: inflates the cap but nothing is spent without a keeper call (only relevant with ATK-3's precondition).

## Files

- `contracts/audit-tests/attacker/AttackBase.sol`: deployment mirroring `Deploy.s.sol` on the real PoolManager bytecode; `PoolActorAttacker` helper (swaps, arbitrary-range liquidity).
- `contracts/audit-tests/attacker/Attacks.t.sol`: PoCs ATK-1 to ATK-7.
- `contracts/audit-tests/attacker/Negative.t.sol`: failed attacks.
