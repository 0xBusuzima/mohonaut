# Mutation testing (Gambit)

Gambit (Certora, open source) rewrites one operator at a time in a source file; the test suite
must fail for each such mutant. A surviving mutant is either a missing test or an equivalent
change that cannot alter behaviour. `run.sh` mutates one file, `run_all.sh` all of them (run it in
a dedicated copy of the repository: it rewrites sources in place). Results land in `results/`
(not committed); the table below is the latest full run.

## Latest results (2026-10-12, code after the internal audit fixes)

| File | Killed / mutants | Tests |
| --- | --- | --- |
| `lib/EmissionMath.sol` | 65 / 65 | EmissionMath unit + differential |
| `lib/VrgdaMath.sol` | 77 / 77 | fuzz + differential |
| `lib/MarketOpenMath.sol` | 12 / 12 | differential |
| `lib/SiteMath.sol` | 25 / 25 | differential + rigs |
| `lib/MohnPool.sol` | 23 / 23 | MohnPool unit + integration |
| `MohnToken.sol` | 40 / 40 | unit + invariant |
| `RevenueRouter.sol` | 125 / 125 | unit + governance + integration |
| `MiningAccounting.sol` | 428 / 428 | unit + differential |
| `MiningCore.sol` | 200 / 200 | unit + integration + script (sample of 200, seed 7) |
| `PoolActor.sol` | 36 / 38 | integration + script |
| `BuybackBurner.sol` | 96 / 97 | integration + script |
| `LiquidityManager.sol` | 126 / 130 | integration + script |
| **All** | **1,253 / 1,260 (99.4%)** | |

The first run of the audited code found real gaps: LiquidityManager stood at 102/130 and
BuybackBurner at 90/97, because their daily caps were only tested within one block and the LP event
amounts were not checked; MohnPool's liquidity maximality was only exercised by fuzzing. The tests
added for them (`test/integration/Market.t.sol` day accounting and event amounts,
`test/unit/MohnPool.t.sol`) kill those mutants.

## Remaining survivors: equivalent mutants

| Mutant | Why it cannot change behaviour |
| --- | --- |
| LiquidityManager `if (sender != address(this)) revert NotSelf()` → `if (true)` | Uniswap v4 never calls a hook for the hook's own calls (`Hooks.noSelfCall`): when `beforeInitialize` runs at all, the sender is someone else, and both versions revert. |
| LiquidityManager `if (mohnFee != 0) burn(...)` → always | Burning 0 is a no-op. |
| LiquidityManager `if (ethFee != 0) depositBuyback(...)` → always | Depositing 0 ETH changes no balance (only an event with 0). |
| LiquidityManager `if (liquidity < 1) revert ZeroLiquidity()` → never | Liquidity rounds to 0 only for additions of a few wei, below the keeper's minimum and the 2-wei `ZeroValue` guard at any realistic pool price; the PoolManager would then only settle the accrued fees. Kept as a guard. |
| BuybackBurner `if (leftover != 0) depositBuyback(...)` → always | Depositing 0 ETH is a no-op. |
| PoolActor `else if (eth > 0)` / `else if (mohnDelta > 0)` → always | Settling or taking a zero delta is a no-op in the PoolManager. |

Core contracts are above the 90% kill target (CLAUDE.md); every remaining survivor is listed here.
