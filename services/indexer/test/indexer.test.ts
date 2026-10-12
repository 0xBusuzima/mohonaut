import { gini, sinkRatio } from '@mohonaut/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { contractSet } from '../src/contracts.js';
import { migrate, openDatabase } from '../src/db/client.js';
import type { Database } from '../src/db/client.js';
import * as schema from '../src/db/schema.js';
import { Indexer, rebuildProjections } from '../src/indexer.js';
import { Metrics } from '../src/metrics.js';
import type { FakeChain } from './fixtures/chain.js';
import {
  ALICE,
  BOB,
  BUYBACK_BURN,
  CAROL,
  DAY1,
  DAY2,
  EMISSION,
  FAST_AMOUNT,
  FAST_FEE,
  GENESIS_HOUR,
  LP_FEE_BURN,
  LP_FEE_ETH,
  LP_MINT,
  NEW_FUEL_PRICE,
  POOL_MANAGER,
  QUEUED,
  RIG_COST,
  SITE_COST,
  buildChain,
  deployment,
} from './fixtures/scenario.js';

const E18 = 10n ** 18n;
const contracts = contractSet(deployment, POOL_MANAGER, 1);
const open: Database[] = [];

afterEach(async () => {
  while (open.length > 0) await open.pop()?.close();
});

async function freshDb(): Promise<Database> {
  const database = await openDatabase('memory://');
  open.push(database);
  await migrate(database);
  return database;
}

async function indexAll(
  chain: FakeChain,
  maxBlockRange: bigint,
  database?: Database,
  poolPollEvery = 1,
): Promise<Database> {
  const db = database ?? (await freshDb());
  const indexer = new Indexer(
    db,
    chain,
    {
      contracts: contractSet(deployment, POOL_MANAGER, poolPollEvery),
      confirmations: 0n,
      maxBlockRange,
    },
    new Metrics(),
  );
  for (let i = 0; i < 10_000; i++) if (await indexer.step()) return db;
  throw new Error('indexer did not catch up');
}

/** Every derived table as sorted JSON rows: equal dumps mean equal state. */
async function dump(database: Database): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const name of [
    'state',
    'accounts',
    'account_days',
    'rigs',
    'machine_types',
    'hours',
    'economy_daily',
    'distribution_daily',
    'balances',
    'vrgda_sales',
    'vrgda_anchors',
    'params',
    'refine_requests',
    'timelock_ops',
    'pool_swaps',
  ]) {
    const rows = await database.query(`SELECT row_to_json(t)::text AS j FROM ${name} t ORDER BY 1`);
    out[name] = rows.map((r) => String(r['j']));
  }
  return out;
}

const one = async <T>(p: Promise<T[]>): Promise<T> => {
  const rows = await p;
  expect(rows).toHaveLength(1);
  return rows[0] as T;
};

describe('indexer on a fixed history', () => {
  it('derives hourly emission exactly from the reserve (sim/vectors/emission_hourly.json)', async () => {
    const database = await indexAll(buildChain(), 100_000n);
    const hours = await database.db.select().from(schema.hours).orderBy(schema.hours.hour);
    const byHour = new Map(hours.map((h) => [h.hour, h]));
    for (let k = 0; k < 48; k++) {
      expect(byHour.get(GENESIS_HOUR + BigInt(k))?.emitted, `hour ${k}`).toBe(EMISSION[k]?.[1]);
    }
    const day1 = await one(database.db.select().from(schema.economyDaily).where(eqDay(DAY1)));
    expect(day1.emitted).toBe(EMISSION.slice(0, 24).reduce((a, [, e]) => a + e, 0n));
  });

  it('splits burns by source and computes the day metrics with the sdk formulas', async () => {
    const database = await indexAll(buildChain(), 100_000n);
    const day1 = await one(database.db.select().from(schema.economyDaily).where(eqDay(DAY1)));
    const spendBurn = (RIG_COST * 8n) / 10n + (SITE_COST * 8n) / 10n;
    const feeBurn = FAST_FEE - FAST_FEE / 2n;
    const recycled = RIG_COST + SITE_COST - spendBurn + FAST_FEE / 2n;
    expect(day1).toMatchObject({
      spendBurn,
      feeBurn,
      recycled,
      buybackBurn: 0n,
      minted: FAST_AMOUNT - FAST_FEE,
      tokenBurned: SITE_COST,
      newAccounts: 0,
      activeAccounts: 2,
    });
    expect(day1.netEmission).toBe(day1.emitted - spendBurn - feeBurn);
    expect(day1.sinkRatio).toBeCloseTo(
      Number(spendBurn + feeBurn + recycled) / Number(day1.emitted),
      12,
    );
    expect(day1.sinkRatio).toBe(
      sinkRatio({
        emitted: day1.emitted,
        spendBurn,
        feeBurn,
        buybackBurn: 0n,
        lpFeeBurn: 0n,
        recycled,
        buybackFundedEth: 0n,
      }),
    );

    const day2 = await one(database.db.select().from(schema.economyDaily).where(eqDay(DAY2)));
    const fuel2 = E18 / 25n;
    expect(day2).toMatchObject({
      buybackBurn: BUYBACK_BURN,
      lpFeeBurn: LP_FEE_BURN,
      buybackFundedEth: (fuel2 * 55n) / 100n + LP_FEE_ETH,
      revenueEth: fuel2,
      fuelEth: fuel2,
      minted: LP_MINT,
      tokenBurned: BUYBACK_BURN + LP_FEE_BURN,
      newAccounts: 1,
      activeAccounts: 2,
    });
    expect(day2.rcr).toBeCloseTo(Number(BUYBACK_BURN) / Number(day2.emitted), 15);
    expect(day2.pStarEth).toBeCloseTo(Number(day2.buybackFundedEth) / Number(day2.emitted), 15);

    // Pre-fill day: fuel and revenue but no emission (metrics undefined, stored as null).
    const prefill = await one(
      database.db
        .select()
        .from(schema.economyDaily)
        .where(eqDay(DAY1 - 1)),
    );
    expect(prefill).toMatchObject({
      emitted: 0n,
      newAccounts: 2,
      fuelEth: (3n * E18) / 100n,
      sinkRatio: null,
      rcr: null,
    });
  });

  it('tracks accounts, rigs, the refinery, balances and distributions', async () => {
    const database = await indexAll(buildChain(), 100_000n);
    const alice = await one(database.db.select().from(schema.accounts).where(eqAddr(ALICE)));
    expect(alice).toMatchObject({
      referrer: null,
      siteLevel: 2,
      dp: 210n,
      referrals: 2,
      rigsBought: 2n,
      mohnSpent: RIG_COST + SITE_COST,
      accrued: 1500n * E18,
      refined: FAST_AMOUNT,
      minted: FAST_AMOUNT - FAST_FEE,
    });
    const bob = await one(database.db.select().from(schema.accounts).where(eqAddr(BOB)));
    expect(bob).toMatchObject({ referrer: ALICE, refined: QUEUED, minted: 0n });

    const rigs = await database.db
      .select()
      .from(schema.rigs)
      .orderBy(schema.rigs.account, schema.rigs.typeId);
    expect(
      rigs.filter((r) => r.account === ALICE).map((r) => [r.typeId, r.owned, r.active]),
    ).toEqual([
      [0, 1n, 1n],
      [1, 2n, 1n],
    ]);
    const sale = await one(database.db.select().from(schema.vrgdaSales));
    expect(sale).toMatchObject({
      units: 200n,
      avgUnitPriceWad: (RIG_COST * E18 * 10_000n) / (11_000n * 200n),
    });
    const request = await one(database.db.select().from(schema.refineRequests));
    expect(request).toMatchObject({ account: BOB, amount: QUEUED, finalizedAt: null });

    const balances = new Map(
      (await database.db.select().from(schema.balances)).map((b) => [b.address, b.balance]),
    );
    expect(balances.get(ALICE)).toBe(FAST_AMOUNT - FAST_FEE - 100n * E18 - SITE_COST);
    expect(balances.get(CAROL)).toBe(100n * E18);
    expect(balances.get(POOL_MANAGER)).toBe(LP_MINT - BUYBACK_BURN - LP_FEE_BURN);

    const dist = await database.db
      .select()
      .from(schema.distributionDaily)
      .orderBy(schema.distributionDaily.day, schema.distributionDaily.kind);
    const aliceMohn = FAST_AMOUNT - FAST_FEE - 100n * E18 - SITE_COST;
    const holders = [aliceMohn, 100n * E18];
    expect(dist.map((d) => [d.day, d.kind, d.holders, d.total])).toEqual([
      [DAY1 - 1, 'dp', 2, 20n], // both pre-fill players are fuelled
      [DAY1 - 1, 'mohn', 0, 0n],
      [DAY1, 'dp', 1, 210n], // Bob's fuel ran out during the day
      [DAY1, 'mohn', 2, aliceMohn + 100n * E18], // the PoolManager is protocol-owned
      [DAY2, 'dp', 2, 220n],
      [DAY2, 'mohn', 2, aliceMohn + 100n * E18],
    ]);
    expect(dist[3]?.gini).toBeCloseTo(gini(holders), 12);
    expect(dist[3]?.nakamoto).toBe(1);
    expect(dist[1]?.gini).toBeNull(); // nobody holds MOHN before genesis
  });

  it('decodes timelock operations and parameter changes', async () => {
    const database = await indexAll(buildChain(), 100_000n);
    const op = await one(database.db.select().from(schema.timelockOps));
    expect(op).toMatchObject({
      timelock: 'ParamsTimelock',
      fn: 'setParam',
      args: [0, NEW_FUEL_PRICE.toString()],
    });
    expect(op.readyAt - op.scheduledAt).toBe(345_600n);
    expect(op.executedAt).not.toBeNull();
    expect(await database.query('SELECT * FROM timelock_queue')).toHaveLength(0);
    const param = await one(database.db.select().from(schema.params));
    expect(param).toMatchObject({
      param: 0,
      name: 'FuelPrice',
      value: NEW_FUEL_PRICE,
      previous: 10n ** 17n,
    });
  });

  it('keeps only our pool swaps and serves the read views', async () => {
    const database = await indexAll(buildChain(), 100_000n);
    expect(await database.db.select().from(schema.poolSwaps)).toHaveLength(1);
    const mined = await database.query('SELECT address FROM leaderboard_mined');
    expect(mined.map((r) => r['address'])).toEqual([ALICE, BOB, CAROL]);
    const cohorts = await database.query('SELECT * FROM cohort_weekly ORDER BY 1, 2');
    expect(cohorts.length).toBeGreaterThan(0);
  });
});

describe('determinism and idempotency', () => {
  it('gives the same state for any batching, a rebuild, a re-index and a range-limited provider', async () => {
    const reference = await dump(await indexAll(buildChain(), 100_000n));

    const perBlock = await indexAll(buildChain(), 1n);
    expect(await dump(perBlock)).toEqual(reference);

    await rebuildProjections(perBlock, contracts);
    expect(await dump(perBlock)).toEqual(reference);

    // Re-index from the start: raw events conflict and no projection is applied twice.
    const chain = buildChain();
    const again = await indexAll(chain, 100_000n);
    const eventCount = (await again.query('SELECT count(*)::int AS n FROM events'))[0]?.['n'];
    await again.db.delete(schema.cursors);
    await indexAll(chain, 100_000n, again);
    expect(await dump(again)).toEqual(reference);
    expect((await again.query('SELECT count(*)::int AS n FROM events'))[0]?.['n']).toBe(eventCount);

    // A throttled stream that is behind still catches up before the indexer reports done.
    const throttledChain = buildChain();
    const throttled = await indexAll(throttledChain, 5n, undefined, 6);
    expect(await dump(throttled)).toEqual(reference);
    const head = await throttledChain.head();
    expect((await throttled.db.select().from(schema.cursors)).map((c) => c.block)).toEqual([
      head,
      head,
    ]);

    const limited = buildChain();
    limited.rangeLimit = 7n;
    expect(await dump(await indexAll(limited, 1000n))).toEqual(reference);
  });

  it('stores every log of our contracts and none of other pools', async () => {
    const chain = buildChain();
    const database = await indexAll(chain, 100_000n);
    const stored = (await database.query('SELECT count(*)::int AS n FROM events'))[0]?.['n'];
    expect(stored).toBe(chain.allLogs.length - 1);
  });
});

import { eq } from 'drizzle-orm';
function eqDay(day: number) {
  return eq(schema.economyDaily.day, day);
}
function eqAddr(address: string) {
  return eq(schema.accounts.address, address);
}
