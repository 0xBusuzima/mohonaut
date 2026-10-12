import {
  buybackBurnerAbi,
  liquidityManagerAbi,
  miningCoreAbi,
  quoteEthForMohn,
  revenueRouterAbi,
} from '@mohonaut/sdk';
import { schema } from '@mohonaut/indexer';
import type { Database, Deployment } from '@mohonaut/indexer';
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import { BaseError, ContractFunctionRevertedError, getAddress } from 'viem';
import type { Abi, Address } from 'viem';
import { manualFeedAbi, poolState } from './chain.js';
import type { Clients } from './chain.js';
import type { Config, JobName } from './config.js';
import type { Metrics } from './metrics.js';
import {
  DAY,
  dailyRoom,
  dailyWindowOpen,
  marketOpenDue,
  median,
  pokeDue,
  priceDeviationBps,
  ranToday,
  withSlippage,
} from './plan.js';

export interface JobContext {
  cfg: Config;
  deployment: Deployment;
  clients: Clients;
  database: Database;
  metrics: Metrics;
  poolManager: Address;
  /** Latest block time (chain time, not the server clock). */
  now: bigint;
}

/** A short outcome for logs and the `keeper_jobs_total{outcome}` metric. */
type Outcome = string;

const MAX_POKES_PER_TICK = 10;
const MAX_FINALIZE_PER_TICK = 20;
const GAS_MARGIN_PCT = 125n;

/** Simulates first (no gas is spent on a call that would revert), then sends and waits. */
async function send(
  ctx: JobContext,
  job: JobName,
  call: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] },
): Promise<void> {
  const { request } = await ctx.clients.publicClient.simulateContract({
    ...call,
    account: ctx.clients.address,
  } as never);
  if (ctx.clients.walletClient === null) {
    ctx.metrics.txs.inc({ task: job, status: 'simulated' });
    return; // dry run
  }
  // Estimates of nested Uniswap calls sit at the edge (the 63/64 rule); a 25 % margin avoids
  // out-of-gas reverts (seen on anvil for openMarket). Unused gas is not charged.
  const gas = await ctx.clients.publicClient.estimateContractGas({
    ...call,
    account: ctx.clients.address,
  } as never);
  const hash = await ctx.clients.walletClient.writeContract({
    ...(request as object),
    gas: (gas * GAS_MARGIN_PCT) / 100n,
  } as never);
  const receipt = await ctx.clients.publicClient.waitForTransactionReceipt({
    hash,
    timeout: 120_000,
  });
  ctx.metrics.txs.inc({ task: job, status: receipt.status });
  if (receipt.status !== 'success') throw new Error(`${job}: transaction ${hash} reverted`);
}

/** The custom error name (and arguments) of a reverted call, if any. */
export function revertName(err: unknown): string | null {
  if (!(err instanceof BaseError)) return null;
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
  return revert instanceof ContractFunctionRevertedError ? (revert.data?.errorName ?? null) : null;
}

const core = (ctx: JobContext) =>
  ({ address: ctx.deployment.MiningCore, abi: miningCoreAbi }) as const;

async function feed(ctx: JobContext): Promise<Outcome> {
  const address = ctx.deployment.EthUsdFeed;
  if (address === undefined || ctx.deployment.chainId === 4663) return 'not testnet';
  const read = ctx.clients.publicClient;
  const owner = await read.readContract({ address, abi: manualFeedAbi, functionName: 'owner' });
  if (getAddress(owner) !== ctx.clients.address) return 'not owner';
  const [, answer, , updatedAt] = await read.readContract({
    address,
    abi: manualFeedAbi,
    functionName: 'latestRoundData',
  });
  if (ctx.now - updatedAt < ctx.cfg.feedRefreshAfterS) return 'fresh';
  // Testnet has no ETH/USD feed: the keeper re-publishes the last answer to keep it fresh.
  await send(ctx, 'feed', { address, abi: manualFeedAbi, functionName: 'set', args: [answer] });
  return 'refreshed';
}

async function poke(ctx: JobContext): Promise<Outcome> {
  for (let i = 0; i < MAX_POKES_PER_TICK; i++) {
    const lastUpdate = await ctx.clients.publicClient.readContract({
      ...core(ctx),
      functionName: 'lastUpdate',
    });
    if (!pokeDue(ctx.now, lastUpdate)) return i === 0 ? 'up to date' : `poked ${i}`;
    await send(ctx, 'poke', { ...core(ctx), functionName: 'poke' });
    if (ctx.clients.walletClient === null) return 'poked 1'; // a simulation changes nothing
  }
  return `poked ${MAX_POKES_PER_TICK}, still behind`;
}

async function openMarket(ctx: JobContext): Promise<Outcome> {
  const read = ctx.clients.publicClient;
  const [opened, openTime] = await Promise.all([
    read.readContract({ ...core(ctx), functionName: 'marketOpened' }),
    read.readContract({ ...core(ctx), functionName: 'marketOpenTime' }),
  ]);
  if (!marketOpenDue(ctx.now, openTime, opened)) return opened ? 'open' : 'not yet';
  await send(ctx, 'openMarket', { ...core(ctx), functionName: 'openMarket' });
  return 'opened';
}

async function finalize(ctx: JobContext): Promise<Outcome> {
  const { refineRequests } = schema;
  // Candidates from the indexer; the chain is the source of truth for each one.
  const due = await ctx.database.db
    .select()
    .from(refineRequests)
    .where(and(isNull(refineRequests.finalizedAt), lte(refineRequests.readyAt, ctx.now)))
    .orderBy(asc(refineRequests.readyAt))
    .limit(MAX_FINALIZE_PER_TICK);
  if (due.length === 0) return 'nothing due';
  const read = ctx.clients.publicClient;
  let room = await read.readContract({ ...core(ctx), functionName: 'mintRoom' });
  let done = 0;
  for (const r of due) {
    const account = getAddress(r.account);
    const request = await read.readContract({
      ...core(ctx),
      functionName: 'refineRequest',
      args: [account, r.requestId],
    });
    if (request.amount === 0n || BigInt(request.readyAt) > ctx.now) continue;
    if (request.amount > room) break; // the hourly mint window is full: retry next tick
    try {
      await send(ctx, 'finalize', {
        ...core(ctx),
        functionName: 'finalizeRefine',
        args: [account, r.requestId],
      });
    } catch (err) {
      if (revertName(err) === 'MintWindowFull') break;
      throw err;
    }
    room -= request.amount;
    done += 1;
  }
  return `finalized ${done}`;
}

/**
 * Reference price for the manipulation guard: median sqrtPrice of the last 24 hours' swaps and
 * the Market Open price (from the indexer), so one block's pump cannot move it.
 */
async function referenceSqrtPrice(ctx: JobContext): Promise<bigint | null> {
  const { poolSwaps, events } = schema;
  const swaps = await ctx.database.db
    .select({ p: poolSwaps.sqrtPriceX96 })
    .from(poolSwaps)
    .where(gte(poolSwaps.time, ctx.now - DAY));
  const opened = await ctx.database.db
    .select({ args: events.args })
    .from(events)
    .where(and(eq(events.contract, 'MiningCore'), eq(events.event, 'MarketOpened')));
  const prices = swaps.map((s) => s.p);
  for (const o of opened) {
    const p = o.args['sqrtPriceX96'];
    if (typeof p === 'string') prices.push(BigInt(p));
  }
  return median(prices);
}

/** Spot price and liquidity if the pool is within the allowed deviation of the reference. */
async function guardedPool(
  ctx: JobContext,
  job: JobName,
): Promise<{ sqrtPriceX96: bigint; liquidity: bigint } | string> {
  const pool = await poolState(ctx.clients, ctx.deployment, ctx.poolManager);
  const reference = await referenceSqrtPrice(ctx);
  if (reference === null) return 'no reference price yet';
  const deviation = priceDeviationBps(pool.sqrtPriceX96, reference);
  if (deviation > ctx.cfg.maxPriceDeviationBps) {
    ctx.metrics.guardTrips.inc({ task: job });
    return `skipped: pool price ${deviation} bps from reference`;
  }
  return pool;
}

async function buyback(ctx: JobContext): Promise<Outcome> {
  const read = ctx.clients.publicClient;
  if (!(await read.readContract({ ...core(ctx), functionName: 'marketOpened' })))
    return 'market closed';
  const bb = { address: ctx.deployment.BuybackBurner, abi: buybackBurnerAbi } as const;
  const [day, spent, bps, poolEth, bucket] = await Promise.all([
    read.readContract({ ...bb, functionName: 'day' }),
    read.readContract({ ...bb, functionName: 'spentInDay' }),
    read.readContract({ ...bb, functionName: 'dailyBps' }),
    read.readContract({
      address: ctx.deployment.LiquidityManager,
      abi: liquidityManagerAbi,
      functionName: 'poolEth',
    }),
    read.readContract({
      address: ctx.deployment.RevenueRouter,
      abi: revenueRouterAbi,
      functionName: 'buybackBalance',
    }),
  ]);
  if (ranToday(day, spent, ctx.now)) return 'done today';
  if (!dailyWindowOpen(ctx.now, ctx.cfg.dailyJobsHourUtc)) return 'waiting for the daily window';
  const room = dailyRoom({ poolEth, bps: BigInt(bps), day, usedInDay: spent, now: ctx.now });
  const ethIn = bucket < room ? bucket : room;
  if (ethIn < ctx.cfg.minDailySpendWei) return 'below minimum';
  const pool = await guardedPool(ctx, 'buyback');
  if (typeof pool === 'string') return pool;
  const minOut = withSlippage(
    quoteEthForMohn(pool.sqrtPriceX96, pool.liquidity, ethIn).mohnOut,
    ctx.cfg.slippageBps,
  );
  await send(ctx, 'buyback', { ...bb, functionName: 'executeBuyback', args: [ethIn, minOut] });
  return `bought back with ${ethIn} wei`;
}

async function addLiquidity(ctx: JobContext): Promise<Outcome> {
  const read = ctx.clients.publicClient;
  if (!(await read.readContract({ ...core(ctx), functionName: 'marketOpened' })))
    return 'market closed';
  const lm = { address: ctx.deployment.LiquidityManager, abi: liquidityManagerAbi } as const;
  const [day, added, bps, poolEth, bucket] = await Promise.all([
    read.readContract({ ...lm, functionName: 'addDay' }),
    read.readContract({ ...lm, functionName: 'addedInDay' }),
    read.readContract({ ...lm, functionName: 'ADD_DAILY_BPS' }),
    read.readContract({ ...lm, functionName: 'poolEth' }),
    read.readContract({
      address: ctx.deployment.RevenueRouter,
      abi: revenueRouterAbi,
      functionName: 'polBalance',
    }),
  ]);
  if (ranToday(day, added, ctx.now)) return 'done today';
  if (!dailyWindowOpen(ctx.now, ctx.cfg.dailyJobsHourUtc)) return 'waiting for the daily window';
  const room = dailyRoom({ poolEth, bps, day, usedInDay: added, now: ctx.now });
  let ethIn = bucket < room ? bucket : room;
  ethIn -= ethIn % 2n; // half is swapped, half is paired
  if (ethIn < ctx.cfg.minDailySpendWei) return 'below minimum';
  const pool = await guardedPool(ctx, 'addLiquidity');
  if (typeof pool === 'string') return pool;
  const minOut = withSlippage(
    quoteEthForMohn(pool.sqrtPriceX96, pool.liquidity, ethIn / 2n).mohnOut,
    ctx.cfg.slippageBps,
  );
  await send(ctx, 'addLiquidity', { ...lm, functionName: 'addLiquidity', args: [ethIn, minOut] });
  return `added ${ethIn} wei`;
}

export const JOBS: Record<JobName, (ctx: JobContext) => Promise<Outcome>> = {
  feed,
  poke,
  openMarket,
  finalize,
  buyback,
  addLiquidity,
};
