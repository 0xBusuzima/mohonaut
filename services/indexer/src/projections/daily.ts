import {
  gini,
  nakamoto,
  netEmission,
  revenueCoverageRatio,
  sinkRatio,
  topShare,
  zeroInflationPriceEth,
} from '@mohonaut/sdk';
import { and, count, desc, eq, gt, gte, isNotNull, lt, sql } from 'drizzle-orm';
import type { Address } from 'viem';
import {
  accountDays,
  accounts,
  balances,
  distributionDaily,
  economyDaily,
  hours,
} from '../db/schema.js';
import type { Ctx } from './context.js';

const finite = (x: number): number | null => (Number.isFinite(x) ? x : null);

async function insertDistribution(
  ctx: Ctx,
  day: number,
  kind: 'mohn' | 'dp',
  values: bigint[],
): Promise<void> {
  const total = values.reduce((a, b) => a + b, 0n);
  await ctx.tx
    .insert(distributionDaily)
    .values({
      day,
      kind,
      holders: values.length,
      total,
      gini: finite(gini(values)),
      nakamoto: finite(nakamoto(values)),
      top10Share: finite(topShare(values, 10)),
    })
    .onConflictDoNothing();
}

/** End-of-day distribution of MOHN holdings (protocol contracts excluded) and active DP. */
export async function snapshotDistribution(ctx: Ctx, day: number): Promise<void> {
  const holders = await ctx.tx.select().from(balances).where(gt(balances.balance, 0n));
  await insertDistribution(
    ctx,
    day,
    'mohn',
    holders
      .filter((h) => !ctx.contracts.protocolAddresses.has(h.address as Address))
      .map((h) => h.balance),
  );
  const endHour = BigInt(day + 1) * 24n;
  const miners = await ctx.tx
    .select({ dp: accounts.dp })
    .from(accounts)
    .where(and(gt(accounts.dp, 0n), gt(accounts.expiryHour, endHour)));
  await insertDistribution(
    ctx,
    day,
    'dp',
    miners.map((m) => m.dp),
  );
}

const sum = (column: Parameters<typeof sql>[1]) => sql<string>`coalesce(sum(${column}), 0)`;

/** Recomputes the economy_daily row of `day` from its hours (formulas from packages/sdk). */
export async function recomputeDay(ctx: Ctx, day: number): Promise<void> {
  const from = BigInt(day) * 24n;
  const inDay = and(gte(hours.hour, from), lt(hours.hour, from + 24n));
  const [t] = await ctx.tx
    .select({
      emitted: sum(hours.emitted),
      spendBurn: sum(hours.spendBurn),
      feeBurn: sum(hours.feeBurn),
      buybackBurn: sum(hours.buybackBurn),
      lpFeeBurn: sum(hours.lpFeeBurn),
      recycled: sum(hours.recycled),
      buybackFundedEth: sum(hours.buybackFundedEth),
      buybackEth: sum(hours.buybackEth),
      revenueEth: sum(hours.revenueEth),
      fuelEth: sum(hours.fuelEth),
      minted: sum(hours.minted),
      tokenBurned: sum(hours.tokenBurned),
      newAccounts: sum(hours.newAccounts),
    })
    .from(hours)
    .where(inDay);
  if (t === undefined) return;
  const [last] = await ctx.tx
    .select({ reserveEnd: hours.reserveEnd })
    .from(hours)
    .where(and(inDay, isNotNull(hours.reserveEnd)))
    .orderBy(desc(hours.hour))
    .limit(1);
  const [active] = await ctx.tx
    .select({ n: count() })
    .from(accountDays)
    .where(eq(accountDays.day, day));
  const flows = {
    emitted: BigInt(t.emitted),
    spendBurn: BigInt(t.spendBurn),
    feeBurn: BigInt(t.feeBurn),
    buybackBurn: BigInt(t.buybackBurn),
    lpFeeBurn: BigInt(t.lpFeeBurn),
    recycled: BigInt(t.recycled),
    buybackFundedEth: BigInt(t.buybackFundedEth),
  };
  const row = {
    ...flows,
    buybackEth: BigInt(t.buybackEth),
    revenueEth: BigInt(t.revenueEth),
    fuelEth: BigInt(t.fuelEth),
    minted: BigInt(t.minted),
    tokenBurned: BigInt(t.tokenBurned),
    netEmission: netEmission(flows),
    sinkRatio: finite(sinkRatio(flows)),
    rcr: finite(revenueCoverageRatio(flows)),
    pStarEth: finite(zeroInflationPriceEth(flows)),
    reserveEnd: last?.reserveEnd ?? null,
    newAccounts: Number(t.newAccounts),
    activeAccounts: active?.n ?? 0,
  };
  await ctx.tx
    .insert(economyDaily)
    .values({ day, ...row })
    .onConflictDoUpdate({ target: economyDaily.day, set: row });
}
