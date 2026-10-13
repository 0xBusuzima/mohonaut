# @mohonaut/keeper

The low-privilege operator (docs/03 §4.5). Every tick (default 60 s) it runs these jobs in
order. Each job reads the chain first and acts only when needed, so ticks are idempotent and safe
to retry. Every transaction is simulated before it is sent.

| Job            | When                                                                                                                                        | Call                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feed`         | Testnet only: the keeper-owned `ManualEthUsdFeed` is older than `FEED_REFRESH_AFTER_S` (20 h; MiningCore rejects prices older than 25–30 h) | `set(lastAnswer)` (re-publishes the last price)                                                                                                                                                                                       |
| `poke`         | An hour boundary passed since MiningCore's `lastUpdate`                                                                                     | `poke()` (≤ 10 per tick, each closes ≤ 168 hours)                                                                                                                                                                                     |
| `openMarket`   | Market Open time reached and the market is not open                                                                                         | `MiningCore.openMarket()` (permissionless; the keeper is first)                                                                                                                                                                       |
| `finalize`     | Standard refines whose delay passed (candidates from the indexer, checked on chain, within the hourly mint room)                            | `finalizeRefine(account, id)`                                                                                                                                                                                                         |
| `buyback`      | Market open; one chunk per 3-hour UTC slot (indexer)                                                                                               | `executeBuyback(ethIn, minOut)`: today's budget (1/20 of the buyback bucket, fixed by the contract at the day's first buyback) paced evenly over 8 three-hour slots, at most one chunk that moves the price about 2 % (0.99 % of the pool's ETH), scaled to the room left in the anchor band |
| `addLiquidity` | Same                                                                                                                                        | `addLiquidity(ethIn, minMohnOut)`: the same pacing on the POL bucket, at most two chunks (half is swapped)                                                                                                                            |

**Price guard.** `minOut` is the exact Uniswap v4 quote at the current pool price
(`packages/sdk` `quoteEthForMohn`, checked against Solidity `SwapMath`) minus `SLIPPAGE_BPS`.
Before that, the pool price must be within `MAX_PRICE_DEVIATION_BPS` (10 %) of a reference: the
median of the last 24 hours' swap prices and the Market Open price, from the indexer. The chunk
must also fit inside the contracts' price anchor band (`LiquidityManager.anchorTick()`, a 1-hour
time-weighted average; swaps may move the price at most 3 % below it, and liquidity goes in only
within 3 % of it). A pumped pool is skipped (`keeper_guard_trips_total`), not traded against. The
contracts' own budgets (per day 1/20 of the buyback bucket, 1/7 of the POL bucket) and the anchor bound the spend whatever the
keeper does (docs/02 §10.1, docs/04 T9).

**One keeper at a time.** With Postgres, the keeper holds a session advisory lock; a second
instance stands by (`keeper_lock_held 0`) and takes over when the first one's connection ends.

## Key

The key has `KEEPER_ROLE` on the BuybackBurner and the LiquidityManager, owns the testnet feed,
and can do nothing else (docs/03 §3.8). Keep only a small ETH balance on it (alert:
`keeper_balance_wei`). Give it to the keeper in one of two ways, never committed:

- **Foundry keystore (preferred):** `cast wallet import keeper --interactive` once (you type the
  key and a password into cast; it stores the key encrypted under `~/.foundry/keystores/keeper`),
  then `KEEPER_KEYSTORE=~/.foundry/keystores/keeper`. The password is typed at start, or read
  from `KEEPER_PASSWORD_FILE` on a server (a file outside the repository, readable only by the
  service user).
- **Raw key** in `KEEPER_PRIVATE_KEY`, injected by the server's secret manager.

`DRY_RUN=true` needs no key: every decision is made and every transaction simulated from the
deployment's keeper address, and nothing is sent.

## Run

```bash
cp .env.example .env     # then edit; never commit .env
npm run build
node dist/main.js once   # one tick, print what each job did, exit
node dist/main.js        # every TICK_INTERVAL_MS; metrics on METRICS_HOST:METRICS_PORT/metrics
```

The keeper reads the indexer's database (refine queue, reference price). On a server with
Postgres the indexer runs as its own process. On one machine with embedded PGlite (which one
process at a time can open), set `RUN_INDEXER=true`: the keeper then indexes before each tick.

## Metrics

`keeper_balance_wei`, `keeper_jobs_total{task,outcome}`, `keeper_tx_total{task,status}`,
`keeper_errors_total{task}`, `keeper_guard_trips_total{task}`,
`keeper_last_success_timestamp_seconds{task}`, `keeper_lock_held`.

## Tests

`npm test`: decisions (`plan.ts`), configuration, the keystore (a throwaway key made with
`cast wallet new`). The end-to-end test runs the real deploy script on anvil with the chain's
PoolManager bytecode, three players, the indexer and the keeper, and travels through pre-fill,
genesis hours, Market Open, a buyback, a liquidity addition and a finalized refine:

```bash
KEEPER_E2E=1 FOUNDRY_BIN=~/.foundry/bin npx vitest run test/e2e
```

CI runs it on Postgres (`keeper-e2e` job), including the two-keeper lock test.
