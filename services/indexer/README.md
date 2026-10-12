# @mohonaut/indexer

Our own log poller (docs/03 §4.3, ADR-010): every ~10 s it reads only our contracts' logs over a
block range with `eth_getLogs`, stores them raw, and derives the read models the API, the
economy page and the admin panel use. No per-block subscription, so it fits a free RPC tier.

## What it stores

| Table / view | Content |
|---|---|
| `events` | Every log of MohnToken, MiningCore, RevenueRouter, BuybackBurner, LiquidityManager and both timelocks, plus the MOHN pool's `Swap` logs (raw topics and data, decoded arguments) |
| `accounts`, `rigs`, `account_days` | Players: referrer, site level, drill power, fuel, spending, accrual, refines, referrals; rigs owned and active; days with activity |
| `hours` | Hourly economy. `emitted` is exact: the reserve moves only by emission, recycling and the Market Open LP mint, so emission = reserve at the previous boundary + recycled − LP mint − reserve now. An hour is closed when someone checkpoints after it (the keeper pokes hourly) |
| `economy_daily` | Daily flows and the docs/02 §10 metrics (SR, NE, RCR, P\* in ETH) with the formulas of `packages/sdk` |
| `distribution_daily` | End-of-day Gini, Nakamoto coefficient and top-10 share of MOHN holders (protocol contracts excluded) and of active drill power |
| `machine_types`, `vrgda_sales`, `vrgda_anchors`, `params` | Catalog, every rig sale with its average VRGDA unit price, re-anchors, current parameters |
| `refine_requests`, `timelock_ops` | Standard refine queue; timelock operations with the decoded call |
| `pool_swaps` | Swaps of the ETH/MOHN pool (price history) |
| views | `leaderboard_drill_power`, `leaderboard_mined`, `cohort_weekly`, `timelock_queue` |

Hours and days are absolute indexes (`timestamp / 3600`, `timestamp / 86400`), like MiningCore.

## Run

```bash
cp .env.example .env    # then edit; never commit .env
npm run build
node dist/main.js       # migrate, then poll forever; /metrics and /healthz on METRICS_PORT
node dist/main.js sync  # migrate, index up to the head, exit (backfills, CI)
node dist/main.js rebuild  # recompute every derived table from the stored raw events (no RPC)
```

`DATABASE_URL`: `postgres://…` in production, `pglite://<directory>` (embedded Postgres, free, no
server) for local work, `memory://` in tests. Stop a PGlite-backed process with Ctrl+C (it
flushes on exit); a killed process can lose its local database. Migrations are plain SQL in
`migrations/`, applied once each at start.

The deployment file (`deployments/<chainId>[-name].json`) gives the addresses and `startBlock`;
the PoolManager address is read from `LiquidityManager.poolManager()`.

## RPC budget

Robinhood Chain makes ~10 blocks per second. Per 10 s poll the indexer makes one
`eth_blockNumber` (10 CU) and one `eth_getLogs` (75 CU); the pool stream is polled on every 6th
tick while it is at the head. Block times are fetched once per block that has our logs (16 CU),
because the chain's RPC returns `blockTimestamp: "0x0"` in logs. That is about 25–27M compute
units per month on Alchemy's table (free tier: 30M); `indexer_rpc_compute_units_total` tracks the
estimate. The public RPC (`https://rpc.testnet.chain.robinhood.com`) needs no key. If the budget
gets tight, raise `POLL_INTERVAL_MS` (15 s ≈ 18M CU/month).

Reorgs: the indexer stays `CONFIRMATIONS` blocks (default 20 ≈ 2 s) behind the head.

## Metrics

`indexer_block{stream}`, `indexer_head_block`, `indexer_events_total{contract,event}`,
`indexer_rpc_requests_total{method}`, `indexer_rpc_compute_units_total`, `indexer_errors_total`,
`indexer_last_success_timestamp_seconds`. `/healthz` is 503 when no poll succeeded for six intervals.

## Tests

`npm test`: the SQL schema matches the Drizzle definitions; an RPC mapping test against a local
HTTP server; a fixed two-day history (emission from `sim/vectors/emission_hourly.json`, spending,
refines, Market Open, buyback, LP fees, a timelock change, swaps) checked against expected values;
and determinism: one batch, one block per batch, a rebuild from raw events, a re-index over
existing data, a throttled stream and a range-limited provider all give identical tables.
