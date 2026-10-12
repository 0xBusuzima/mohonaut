# Multi-role AI review (Phase 7.1, 2026-10-12)

Three independent reviewers worked in separate sessions on `contracts/src`, `script/Deploy.s.sol`,
docs/02-04 and the simulator, without changing any source (docs/06 7.1):

| Role | Report | Evidence (run from `contracts/`) |
|---|---|---|
| Attacker: exploit every external function, prove with a PoC | [ai/ATTACKER.md](ai/ATTACKER.md) | `FOUNDRY_TEST=audit-tests/attacker FOUNDRY_OUT=out-attacker FOUNDRY_CACHE_PATH=cache-attacker forge test` (19 tests: 10 proofs, 9 failed attacks) |
| Accountant: break the docs/04 §2 invariants, propose new ones | [ai/ACCOUNTANT.md](ai/ACCOUNTANT.md) | campaign now in the main suite: `forge test --match-path "test/invariant/system/*"` (ACC-5); finding PoCs: `FOUNDRY_TEST=audit-tests/accountant FOUNDRY_OUT=out-accountant FOUNDRY_CACHE_PATH=cache-accountant forge test` (16,384-call campaign, 18 invariants, 25 proposed) |
| Specification auditor: every formula and constant against docs/02, `sim/params.json`, `sim/engine`, `sim/vectors` | [ai/SPEC.md](ai/SPEC.md) | `audit-tests/spec/spec_check.py` (62 checks), `SpecConformance.t.sol` (12 tests), `pol_cap_experiment.py` |

This is **not** an independent audit. Like the Phase 2.9 review ([FINDINGS.md](FINDINGS.md)), it
narrows what an auditor has to look at.

**Result.** No path mints beyond the emission schedule, breaks the MOHN books or moves player
funds: the accountant's campaign held supply conservation, emission caps, both mint limits, the
refine queue and accrual. One Phase 2.9 fix was found to be incomplete (AI-1), and two design
limits of the ETH side were measured and found weaker than documented (AI-2, AI-3). After
merging duplicates (ATK-1 = ACC-1, ATK-6 = ACC-2, ATK-2 + ATK-5), there are 3 Medium, 9 Low and
22 informational items.

## Medium

| ID | Source | Finding | Plan |
|---|---|---|---|
| AI-1 | ATK-1, ACC-1 | `lockBucketRoles()` can be undone: `LOCKED_ROLE`'s admin is still `DEFAULT_ADMIN_ROLE` (the 96 h Timelock), which can grant itself `LOCKED_ROLE` and rewire the POL and buyback buckets (about 85 % of fuel revenue) or revoke the core's depositor role. The Phase 2.9 critic fix is broken. | Fix: `_setRoleAdmin(LOCKED_ROLE, LOCKED_ROLE)`; asserted in `Deploy.s.sol`; regression test |
| AI-2 | ATK-3 | The daily buyback and liquidity caps scale with the pool's **active** liquidity, which concentrated just-in-time liquidity can multiply 30-60x within a block; a stolen keeper key then sandwiches 38-59 % of the spend. FINDINGS #12's acceptance argument does not hold. | Founder decision on the cap basis (bucket balance vs. the protocol's own position), then docs/02 → sim → contracts |
| AI-3 | SPEC-1 | The LiquidityManager adds at most 4 % of pool ETH per day; the simulator adds the whole POL bucket daily. With the cap, median pool ETH is 90-94 % lower in months 1-3 and the price 84-90 % lower than the docs/02 §13 results. | Founder decision: change the cap or accept it and re-run the study (docs/02 → sim) |

## Low

| ID | Source | Finding | Plan |
|---|---|---|---|
| AI-4 | ATK-2, ATK-5 | The refinery opens at Market Open *time*, not when `openMarket` runs: early refines share the hourly mint window (Market Open LP -36 %, -63 % at a 0 % fee) and refined MOHN can be traded on another pool before ours exists | Fix: refining requires `marketOpened` |
| AI-5 | ACC-4 | Scrap credit is priced after the player's own VRGDA purchases (buy, then scrap: +2,237 MOHN of capex credit at defaults) | Review with AI-2/AI-3 (economy change); credit is non-transferable and capex-only |
| AI-6 | SPEC-2 | docs/02 calls the emission schedule, splits, referral rate, machines and the Market Open formula unchangeable; they live in the upgradeable MiningCore behind the 7-day Timelock | Docs: say "only through the 7-day upgrade Timelock" |
| AI-7 | SPEC-3, SPEC-4 | `sim/params.json` still has the v0.2 daily mint cap (2M, code 500K) and a 72 h timelock (code 96 h); the simulator lacks the hourly, per-request and dev limits | Sim params and model; re-run |
| AI-8 | SPEC-5 | Pool fees: the contract burns MOHN fees and sends ETH fees to buybacks; the simulator leaves them in the pool | Sim model |
| AI-9 | SPEC-6, SPEC-12 | docs/02 tables understate first purchase prices (up to 11.8 %) and some site figures | Docs from the contracts |
| AI-10 | SPEC-7 | Dev/treasury withdrawals are promised 72 h of visibility but use the adjustable refine delay (24-168 h) | Docs, or a fixed delay |
| AI-11 | SPEC-8 | Referral conditions are checked at settlement in the contract, per day in the simulator | Sim model |
| AI-12 | SPEC-9, SPEC-10 | Buyback cap, POL cap and site cost scale limits are not in docs/02 | Docs |

## Informational

ATK-4 (daily caps reset at the UTC boundary), ATK-6 / ACC-2 (SELFDESTRUCT ETH breaks R1 as
written), ATK-7 (sequencer `startedAt == 0` read as "up"), ACC-3 (E2 false once anyone burns),
ACC-5 (vacuous or loose catalogue checks; no stateful handler for the market and ETH layer),
ACC-6 (the tank-cap invariant is not a contract invariant), ACC-7 (unsettled referral earmarks
stay locked), SPEC-11 to SPEC-25 (stale docs, missing constants in docs/02, three rounding
directions that favour players by at most a few hundred wei, a competitor name in docs/02).
Details and the planned resolution of each are in the role reports; outcomes go to
[FIXES.md](FIXES.md).
