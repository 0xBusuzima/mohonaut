import { PARAM_NAMES } from '@mohonaut/sdk';
import { and, eq, sql } from 'drizzle-orm';
import { zeroAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { decodeCall, toJson } from '../contracts.js';
import type { IndexedEvent } from '../contracts.js';
import {
  accounts,
  balances,
  hours,
  machineTypes,
  params,
  poolSwaps,
  refineRequests,
  rigs,
  timelockOps,
  vrgdaAnchors,
  vrgdaSales,
} from '../db/schema.js';
import { dayOf, dayOfHour } from './context.js';
import type { Ctx } from './context.js';
import { snapshotDistribution } from './daily.js';

const WAD = 10n ** 18n;

function arg(ev: IndexedEvent, key: string): unknown {
  if (!(key in ev.args)) throw new Error(`${ev.contract}.${ev.event}: missing argument ${key}`);
  return ev.args[key];
}

function big(ev: IndexedEvent, key: string): bigint {
  const v = arg(ev, key);
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(v);
  throw new Error(`${ev.contract}.${ev.event}: ${key} is not an integer`);
}

function num(ev: IndexedEvent, key: string): number {
  return Number(big(ev, key));
}

function addr(ev: IndexedEvent, key: string): Address {
  const v = arg(ev, key);
  if (typeof v !== 'string')
    throw new Error(`${ev.contract}.${ev.event}: ${key} is not an address`);
  return v as Address;
}

function hex(ev: IndexedEvent, key: string): Hex {
  return addr(ev, key) as unknown as Hex;
}

type Handler = (ctx: Ctx, ev: IndexedEvent) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  // ------------------------------------------------------------------ MiningCore: players
  'MiningCore.Registered': async (ctx, ev) => {
    const account = addr(ev, 'account');
    const referrer = addr(ev, 'referrer');
    const registered = {
      referrer: referrer === zeroAddress ? null : referrer,
      registeredAt: ev.blockTime,
      registeredBlock: ev.blockNumber,
      siteLevel: 1,
    };
    await ctx.tx
      .insert(accounts)
      .values({ address: account, ...registered })
      .onConflictDoUpdate({ target: accounts.address, set: registered });
    // The free Pilot Rig (type 0), active from the start.
    await ctx.tx.insert(rigs).values({ account, typeId: 0, owned: 1n, active: 1n });
    if (referrer !== zeroAddress) await ctx.addAccount(referrer, { referrals: 1 });
    await ctx.addHour(ev.blockTime, { newAccounts: 1 });
    await ctx.touch(account, ev.blockTime);
  },

  'MiningCore.FuelBought': async (ctx, ev) => {
    const account = addr(ev, 'account');
    const ethIn = big(ev, 'ethIn');
    await ctx.addAccount(account, { fuelEth: ethIn, litres: big(ev, 'litres') });
    await ctx.tx
      .update(accounts)
      .set({ expiryHour: big(ev, 'expiryHour') })
      .where(eq(accounts.address, account));
    await ctx.addHour(ev.blockTime, { fuelEth: ethIn });
    await ctx.touch(account, ev.blockTime);
  },

  'MiningCore.PositionUpdated': async (ctx, ev) => {
    const account = addr(ev, 'account');
    const position = { dp: big(ev, 'dp'), expiryHour: big(ev, 'expiryHour') };
    await ctx.tx
      .insert(accounts)
      .values({ address: account, ...position })
      .onConflictDoUpdate({ target: accounts.address, set: position });
  },

  'MiningCore.MachineTypeAdded': async (ctx, ev) => {
    await ctx.tx.insert(machineTypes).values({
      typeId: num(ev, 'typeId'),
      generation: num(ev, 'generation'),
      dp: big(ev, 'dp'),
      burn: big(ev, 'burn'),
      premiumBps: num(ev, 'premiumBps'),
      minLevel: num(ev, 'minLevel'),
      addedAt: ev.blockTime,
    });
  },

  'MiningCore.MachinesBought': async (ctx, ev) => {
    const account = addr(ev, 'account');
    const typeId = num(ev, 'typeId');
    const qty = big(ev, 'qty');
    const cost = big(ev, 'cost');
    const [type] = await ctx.tx.select().from(machineTypes).where(eq(machineTypes.typeId, typeId));
    const units = type === undefined ? null : qty * type.dp;
    // Average VRGDA unit price of the batch, without the tier premium.
    const avgUnitPriceWad =
      type === undefined || units === null || units === 0n
        ? null
        : (cost * WAD * 10_000n) / ((10_000n + BigInt(type.premiumBps)) * units);
    await ctx.tx.insert(vrgdaSales).values({
      blockNumber: ev.blockNumber,
      logIndex: ev.logIndex,
      time: ev.blockTime,
      account,
      typeId,
      qty,
      units,
      cost,
      avgUnitPriceWad,
    });
    await ctx.bump(
      rigs,
      [rigs.account, rigs.typeId],
      { account, typeId },
      { owned: qty, active: qty },
    );
    await ctx.addAccount(account, { rigsBought: qty, mohnSpent: cost });
    await ctx.addHour(ev.blockTime, { machineSpend: cost, dpSold: units ?? 0n });
    await ctx.touch(account, ev.blockTime);
  },

  'MiningCore.MachinesScrapped': async (ctx, ev) => {
    const account = addr(ev, 'account');
    const typeId = num(ev, 'typeId');
    const qty = big(ev, 'qty');
    // Scrapping switches off rigs beyond the remaining count (MiningCore.scrapMachines).
    await ctx.tx
      .update(rigs)
      .set({
        owned: sql`${rigs.owned} - ${qty}`,
        active: sql`least(${rigs.active}, ${rigs.owned} - ${qty})`,
      })
      .where(and(eq(rigs.account, account), eq(rigs.typeId, typeId)));
    await ctx.addAccount(account, { rigsScrapped: qty });
    await ctx.touch(account, ev.blockTime);
  },

  'MiningCore.ActiveRigsSet': async (ctx, ev) => {
    const account = addr(ev, 'account');
    await ctx.tx
      .update(rigs)
      .set({ active: big(ev, 'active') })
      .where(and(eq(rigs.account, account), eq(rigs.typeId, num(ev, 'typeId'))));
    await ctx.touch(account, ev.blockTime);
  },

  'MiningCore.SiteUpgraded': async (ctx, ev) => {
    const account = addr(ev, 'account');
    const cost = big(ev, 'cost');
    await ctx.tx
      .update(accounts)
      .set({ siteLevel: num(ev, 'level') })
      .where(eq(accounts.address, account));
    await ctx.addAccount(account, { mohnSpent: cost });
    await ctx.addHour(ev.blockTime, { siteSpend: cost });
    await ctx.touch(account, ev.blockTime);
  },

  'MiningCore.Accrued': async (ctx, ev) => {
    await ctx.addAccount(addr(ev, 'account'), { accrued: big(ev, 'amount') });
  },

  'MiningCore.ReferralCredited': async (ctx, ev) => {
    await ctx.addAccount(addr(ev, 'referrer'), { referralEarned: big(ev, 'amount') });
  },

  // ------------------------------------------------------------------ MiningCore: refinery
  'MiningCore.Refined': async (ctx, ev) => {
    const account = addr(ev, 'account');
    const amount = big(ev, 'amount');
    const fee = big(ev, 'fee');
    // The fee was settled just before as SpendSettled(fee - fee/2, fee/2); move its burned
    // half from the spending burn to the fee burn (same transaction, same hour).
    const feeBurn = fee - fee / 2n;
    await ctx.addAccount(account, { refined: amount, minted: big(ev, 'minted') });
    await ctx.addHour(ev.blockTime, {
      refined: amount,
      refineFee: fee,
      feeBurn,
      spendBurn: -feeBurn,
    });
    await ctx.touch(account, ev.blockTime);
  },

  'MiningCore.RefineQueued': async (ctx, ev) => {
    const account = addr(ev, 'account');
    const amount = big(ev, 'amount');
    await ctx.tx.insert(refineRequests).values({
      account,
      requestId: big(ev, 'id'),
      amount,
      readyAt: big(ev, 'readyAt'),
      queuedAt: ev.blockTime,
    });
    await ctx.addAccount(account, { refined: amount });
    await ctx.addHour(ev.blockTime, { refined: amount });
    await ctx.touch(account, ev.blockTime);
  },

  'MiningCore.RefineFinalized': async (ctx, ev) => {
    const account = addr(ev, 'account');
    await ctx.tx
      .update(refineRequests)
      .set({ finalizedAt: ev.blockTime })
      .where(and(eq(refineRequests.account, account), eq(refineRequests.requestId, big(ev, 'id'))));
    await ctx.addAccount(account, { minted: big(ev, 'amount') });
  },

  // ------------------------------------------------------------------ MiningCore: economy
  'MiningCore.SpendSettled': async (ctx, ev) => {
    const toReserve = big(ev, 'toReserve');
    ctx.state.recycledSince += toReserve;
    await ctx.addHour(ev.blockTime, { spendBurn: big(ev, 'burned'), recycled: toReserve });
  },

  'MiningCore.MarketOpened': async (ctx, ev) => {
    ctx.state.lpMintedSince += big(ev, 'mohnLp');
  },

  'MiningCore.HourClosed': async (ctx, ev) => {
    // HourClosed(h) is emitted at the boundary that opens hour h. The reserve only moves by
    // emission, recycling and the Market Open LP mint, so the emission of hour h - 1 is exact.
    const hour = big(ev, 'hour');
    const reserve = big(ev, 'reserve');
    const s = ctx.state;
    const emitted = s.reserveAtClose + s.recycledSince - s.lpMintedSince - reserve;
    if (emitted < 0n) throw new Error(`negative emission for hour ${hour - 1n}`);
    await ctx.bump(hours, hours.hour, { hour: hour - 1n }, { emitted });
    await ctx.tx
      .update(hours)
      .set({ reserveEnd: reserve })
      .where(eq(hours.hour, hour - 1n));
    const opening = { activeDpStart: big(ev, 'activeDp'), emissionRate: big(ev, 'hourEmission') };
    await ctx.tx
      .insert(hours)
      .values({ hour, ...opening })
      .onConflictDoUpdate({ target: hours.hour, set: opening });
    ctx.dirtyDays.add(dayOfHour(hour - 1n));
    ctx.dirtyDays.add(dayOfHour(hour));
    s.reserveAtClose = reserve;
    s.recycledSince = 0n;
    s.lpMintedSince = 0n;
  },

  'MiningCore.ParamChanged': async (ctx, ev) => {
    const param = num(ev, 'param');
    const row = {
      name: PARAM_NAMES[param] ?? `Param${param}`,
      value: big(ev, 'newValue'),
      previous: big(ev, 'oldValue'),
      changedAt: ev.blockTime,
    };
    await ctx.tx
      .insert(params)
      .values({ param, ...row })
      .onConflictDoUpdate({ target: params.param, set: row });
  },

  'MiningCore.VrgdaReanchored': async (ctx, ev) => {
    await ctx.tx.insert(vrgdaAnchors).values({
      blockNumber: ev.blockNumber,
      logIndex: ev.logIndex,
      time: ev.blockTime,
      lnAnchor: big(ev, 'lnAnchor'),
      anchorTime: big(ev, 'anchorTime'),
      anchorSold: big(ev, 'anchorSold'),
    });
  },

  // ------------------------------------------------------------------ token
  'MohnToken.Transfer': async (ctx, ev) => {
    const from = addr(ev, 'from');
    const to = addr(ev, 'to');
    const value = big(ev, 'value');
    if (from === zeroAddress) await ctx.addHour(ev.blockTime, { minted: value });
    else await ctx.bump(balances, balances.address, { address: from }, { balance: -value });
    if (to === zeroAddress) await ctx.addHour(ev.blockTime, { tokenBurned: value });
    else await ctx.bump(balances, balances.address, { address: to }, { balance: value });
  },

  // ------------------------------------------------------------------ ETH revenue
  'RevenueRouter.Deposited': async (ctx, ev) => {
    await ctx.addHour(ev.blockTime, {
      revenueEth: big(ev, 'amount'),
      buybackFundedEth: big(ev, 'toBuyback'),
    });
  },

  'BuybackBurner.BuybackExecuted': async (ctx, ev) => {
    await ctx.addHour(ev.blockTime, {
      buybackEth: big(ev, 'ethIn'),
      buybackBurn: big(ev, 'mohnBurned'),
    });
  },

  'LiquidityManager.FeesCollected': async (ctx, ev) => {
    // The ETH side goes to the buyback bucket: revenue, unlike unspent buyback ETH that the
    // BuybackBurner sweeps back (BuybackDeposited, not counted).
    await ctx.addHour(ev.blockTime, {
      lpFeeBurn: big(ev, 'mohnBurned'),
      buybackFundedEth: big(ev, 'ethToBuyback'),
    });
  },

  'LiquidityManager.LiquidityAdded': async (ctx, ev) => {
    await ctx.addHour(ev.blockTime, { polEthAdded: big(ev, 'ethIn') });
  },

  // ------------------------------------------------------------------ timelocks
  'ParamsTimelock.CallScheduled': (ctx, ev) => scheduled(ctx, ev),
  'UpgradeTimelock.CallScheduled': (ctx, ev) => scheduled(ctx, ev),
  'ParamsTimelock.CallExecuted': (ctx, ev) => executed(ctx, ev),
  'UpgradeTimelock.CallExecuted': (ctx, ev) => executed(ctx, ev),
  'ParamsTimelock.Cancelled': (ctx, ev) => cancelled(ctx, ev),
  'UpgradeTimelock.Cancelled': (ctx, ev) => cancelled(ctx, ev),

  // ------------------------------------------------------------------ pool stream
  'PoolManager.Swap': async (ctx, ev) => {
    await ctx.tx.insert(poolSwaps).values({
      blockNumber: ev.blockNumber,
      logIndex: ev.logIndex,
      time: ev.blockTime,
      sender: addr(ev, 'sender'),
      amount0: big(ev, 'amount0'),
      amount1: big(ev, 'amount1'),
      sqrtPriceX96: big(ev, 'sqrtPriceX96'),
      liquidity: big(ev, 'liquidity'),
      tick: num(ev, 'tick'),
      fee: num(ev, 'fee'),
    });
  },
};

async function scheduled(ctx: Ctx, ev: IndexedEvent): Promise<void> {
  const target = addr(ev, 'target');
  const data = hex(ev, 'data');
  const call = decodeCall(target, data, ctx.contracts.byAddress);
  const delay = big(ev, 'delay');
  await ctx.tx.insert(timelockOps).values({
    timelock: ev.contract,
    opId: hex(ev, 'id'),
    opIndex: num(ev, 'index'),
    target,
    value: big(ev, 'value'),
    data,
    predecessor: hex(ev, 'predecessor'),
    delay,
    fn: call?.fn ?? null,
    args: call === null ? null : (toJson(call.args) as unknown[]),
    scheduledAt: ev.blockTime,
    readyAt: ev.blockTime + delay,
  });
}

async function executed(ctx: Ctx, ev: IndexedEvent): Promise<void> {
  await ctx.tx
    .update(timelockOps)
    .set({ executedAt: ev.blockTime })
    .where(
      and(
        eq(timelockOps.timelock, ev.contract),
        eq(timelockOps.opId, hex(ev, 'id')),
        eq(timelockOps.opIndex, num(ev, 'index')),
      ),
    );
}

async function cancelled(ctx: Ctx, ev: IndexedEvent): Promise<void> {
  await ctx.tx
    .update(timelockOps)
    .set({ cancelledAt: ev.blockTime })
    .where(and(eq(timelockOps.timelock, ev.contract), eq(timelockOps.opId, hex(ev, 'id'))));
}

/** Applies one event to the derived tables. Events without a handler are only stored raw. */
export async function project(ctx: Ctx, ev: IndexedEvent): Promise<void> {
  if (ev.contract !== 'PoolManager') {
    // End-of-day snapshots for every day that ended before this event.
    const day = dayOf(ev.blockTime);
    if (ctx.state.lastDay === null) ctx.state.lastDay = day;
    while (ctx.state.lastDay < day) {
      await snapshotDistribution(ctx, ctx.state.lastDay);
      ctx.state.lastDay += 1;
    }
  }
  const handler = HANDLERS[`${ev.contract}.${ev.event}`];
  if (handler !== undefined) await handler(ctx, ev);
}
