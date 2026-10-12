import {
  CAP,
  MAX_SITE_LEVEL,
  WAD,
  fuelLineWad,
  hourlyEmission,
  sitePads,
  splitEmission,
} from '@mohonaut/sdk';
import { GEN1_RIGS } from '../lib/catalog';
import type { GameState } from './state';

/**
 * The Training Site (docs/09 §A): the game run locally, no wallet, no chain, no tokens. The same
 * formulas where they matter (the hourly emission from the reserve, the 90% players' slice split
 * by Drill Power, pads and fuel line per level); practice ETH and practice $MOHN with no value;
 * illustrative prices; other drillers simulated so the share falls as they join. Pure functions:
 * the page advances the clock and applies the player's actions.
 */

const HOUR = 3600;
const DAY = 24 * HOUR;
/** Diesel at $0.10 a litre with ETH at $2,500 (the training site's fixed rate). */
const TRAINING_LITRES_PER_ETH = 25_000n * WAD;
const MAX_TANK_HOURS = 720;
const REFINE_QUEUE_S = 72 * HOUR;
const FAST_REFINE_FEE_BPS = 800n;
const SCRAP_BPS = 2_000n;
/** Practice $MOHN per DP for rig prices, before each tier's premium. */
const PRICE_PER_DP = 8n * WAD;
/** Other drillers' DP at the start, and how much it grows per simulated day. */
const OTHERS_START = 2_000n;
const OTHERS_GROWTH_BPS_PER_DAY = 300n;

export interface TrainingState {
  /** Simulated seconds since the training started. */
  t: number;
  level: number;
  /** Litres in the tank (18 decimals). */
  tank: bigint;
  rigs: { owned: number; active: number }[];
  /** Unrefined practice $MOHN. */
  pending: bigint;
  /** Refined practice $MOHN ("wallet"). */
  wallet: bigint;
  scrapCredit: bigint;
  /** Practice ETH for diesel. */
  eth: bigint;
  /** The world: emitted so far and what is left in the reserve. */
  emitted: bigint;
  reserve: bigint;
  othersDp: bigint;
  refines: { id: number; amount: bigint; readyAt: number }[];
  nextRefine: number;
}

export function newTraining(): TrainingState {
  return {
    t: 0,
    level: 1,
    tank: 24n * WAD,
    rigs: GEN1_RIGS.map((_, i) => (i === 0 ? { owned: 1, active: 1 } : { owned: 0, active: 0 })),
    pending: 600n * WAD,
    wallet: 0n,
    scrapCredit: 0n,
    eth: WAD / 20n,
    emitted: 0n,
    reserve: CAP,
    othersDp: OTHERS_START,
    refines: [],
    nextRefine: 0,
  };
}

const burnWad = (i: number) =>
  BigInt(Math.round((GEN1_RIGS[i]?.litresPerHour ?? 0) * 1e6)) * 10n ** 12n;
const dpOf = (i: number) => BigInt(GEN1_RIGS[i]?.dp ?? 0);
const minLevel = (i: number) => [0, 1, 3, 6, 10, 15][i] ?? 99;

export function trainingDp(s: TrainingState): bigint {
  return s.rigs.reduce((sum, r, i) => sum + BigInt(r.active) * dpOf(i), 0n);
}

function trainingBurn(s: TrainingState): bigint {
  return s.rigs.reduce((sum, r, i) => sum + BigInt(r.active) * burnWad(i), 0n);
}

/** Practice price of `qty` rigs of a type: per DP, plus the tier's premium. */
export function trainingRigCost(typeId: number, qty: number): bigint {
  const premium = BigInt(GEN1_RIGS[typeId]?.premiumPct ?? 0);
  return (PRICE_PER_DP * dpOf(typeId) * BigInt(qty) * (100n + premium)) / 100n;
}

/** Practice price of the next site level: 150 × L^2.2 (docs/02, at a price index of 1). */
function trainingUpgradeCost(level: number): bigint | null {
  if (level >= MAX_SITE_LEVEL) return null;
  return BigInt(Math.round(150 * level ** 2.2)) * WAD;
}

/** Advances the simulation by `seconds`: emission accrues to the player's share, rigs burn. */
export function tick(s: TrainingState, seconds: number): TrainingState {
  let next = { ...s };
  let left = seconds;
  // Whole steps of at most a minute, so an empty tank stops accrual at the right moment.
  while (left > 0) {
    const dt = Math.min(60, left);
    left -= dt;
    const hourly = splitEmission(hourlyEmission(next.reserve)).miners;
    const emitted = (hourlyEmission(next.reserve) * BigInt(dt)) / BigInt(HOUR);
    const burn = (trainingBurn(next) * BigInt(dt)) / BigInt(HOUR);
    const fuelled = next.tank > 0n;
    const dp = fuelled ? trainingDp(next) : 0n;
    const share =
      dp === 0n ? 0n : (hourly * BigInt(dt) * dp) / (BigInt(HOUR) * (dp + next.othersDp));
    const growth =
      (next.othersDp * OTHERS_GROWTH_BPS_PER_DAY * BigInt(dt)) / (10_000n * BigInt(DAY));
    next = {
      ...next,
      t: next.t + dt,
      tank: next.tank > burn ? next.tank - burn : 0n,
      pending: next.pending + share,
      emitted: next.emitted + emitted,
      reserve: next.reserve - emitted,
      othersDp: next.othersDp + (growth > 0n ? growth : 0n),
    };
  }
  return next;
}

export type TrainingCall = { fn: string; args: readonly unknown[]; value?: bigint | undefined };
export type TrainingResult = { state: TrainingState; error: string | null };

const fail = (state: TrainingState, error: string): TrainingResult => ({ state, error });

/** Pays from scrap credit first, then unrefined; null when there is not enough. */
function pay(s: TrainingState, cost: bigint): TrainingState | null {
  const fromScrap = s.scrapCredit < cost ? s.scrapCredit : cost;
  const rest = cost - fromScrap;
  if (rest > s.pending) return null;
  return { ...s, scrapCredit: s.scrapCredit - fromScrap, pending: s.pending - rest };
}

/** Applies one of the game's calls (the same names and arguments as MiningCore). */
export function applyCall(s: TrainingState, call: TrainingCall): TrainingResult {
  const padsUsed = s.rigs.reduce((n, r) => n + r.owned, 0);
  if (call.fn === 'buyFuel') {
    const wei = call.value ?? 0n;
    if (wei <= 0n) return fail(s, 'Enter an amount of practice ETH.');
    if (wei > s.eth) return fail(s, 'Not enough practice ETH.');
    const litres = (wei * TRAINING_LITRES_PER_ETH) / WAD;
    const room = fuelLineWad(s.level) * BigInt(MAX_TANK_HOURS) - s.tank;
    if (litres > room) return fail(s, 'The tank does not hold that much.');
    return { state: { ...s, eth: s.eth - wei, tank: s.tank + litres }, error: null };
  }
  if (call.fn === 'buyMachines') {
    const typeId = Number(call.args[0]);
    const qty = Number(call.args[1]);
    if (typeId <= 0 || typeId >= GEN1_RIGS.length || qty <= 0) return fail(s, 'Unknown rig.');
    if (s.level < minLevel(typeId)) return fail(s, `Needs site level ${minLevel(typeId)}.`);
    if (padsUsed + qty > sitePads(s.level)) return fail(s, 'No free pad.');
    if (trainingBurn(s) + burnWad(typeId) * BigInt(qty) > fuelLineWad(s.level))
      return fail(s, 'The fuel line is full.');
    const paid = pay(s, trainingRigCost(typeId, qty));
    if (paid === null) return fail(s, 'Not enough unrefined $MOHN.');
    const rigs = paid.rigs.map((r, i) =>
      i === typeId ? { owned: r.owned + qty, active: r.active + qty } : r,
    );
    return { state: { ...paid, rigs }, error: null };
  }
  if (call.fn === 'setActiveRigs') {
    const typeId = Number(call.args[0]);
    const active = Number(call.args[1]);
    const r = s.rigs[typeId];
    if (r === undefined || active < 0 || active > r.owned) return fail(s, 'No such rig.');
    const rigs = s.rigs.map((x, i) => (i === typeId ? { ...x, active } : x));
    if (trainingBurn({ ...s, rigs }) > fuelLineWad(s.level))
      return fail(s, 'The fuel line is full.');
    return { state: { ...s, rigs }, error: null };
  }
  if (call.fn === 'scrapMachines') {
    const typeId = Number(call.args[0]);
    const qty = Number(call.args[1]);
    const r = s.rigs[typeId];
    if (r === undefined || qty <= 0 || qty > r.owned) return fail(s, 'No such rig.');
    const credit = typeId === 0 ? 0n : (trainingRigCost(typeId, qty) * SCRAP_BPS) / 10_000n;
    const owned = r.owned - qty;
    const rigs = s.rigs.map((x, i) =>
      i === typeId ? { owned, active: Math.min(x.active, owned) } : x,
    );
    return { state: { ...s, rigs, scrapCredit: s.scrapCredit + credit }, error: null };
  }
  if (call.fn === 'upgradeSite') {
    const cost = trainingUpgradeCost(s.level);
    if (cost === null) return fail(s, 'Your site is at the top level.');
    const paid = pay(s, cost);
    if (paid === null) return fail(s, 'Not enough unrefined $MOHN.');
    return { state: { ...paid, level: s.level + 1 }, error: null };
  }
  if (call.fn === 'refine') {
    const amount = BigInt(call.args[0] as bigint);
    const fast = call.args[1] === true;
    if (amount <= 0n || amount > s.pending) return fail(s, 'Not enough unrefined $MOHN.');
    if (fast) {
      const fee = (amount * FAST_REFINE_FEE_BPS) / 10_000n;
      return {
        state: { ...s, pending: s.pending - amount, wallet: s.wallet + amount - fee },
        error: null,
      };
    }
    const refines = [...s.refines, { id: s.nextRefine, amount, readyAt: s.t + REFINE_QUEUE_S }];
    return {
      state: { ...s, pending: s.pending - amount, refines, nextRefine: s.nextRefine + 1 },
      error: null,
    };
  }
  if (call.fn === 'finalizeRefine') {
    const id = Number(call.args[1]);
    const q = s.refines.find((x) => x.id === id);
    if (q === undefined) return fail(s, 'No such refine.');
    if (q.readyAt > s.t) return fail(s, 'Still in the queue.');
    return {
      state: { ...s, wallet: s.wallet + q.amount, refines: s.refines.filter((x) => x.id !== id) },
      error: null,
    };
  }
  return fail(s, 'Not part of the training site.');
}

/**
 * The training site as the game's state, so the game's own HUD and windows show it. `base` is
 * the unix time the training started; simulated time runs from there.
 */
export function trainingGameState(s: TrainingState, base: number): GameState {
  const at = base + s.t;
  const fuelled = s.tank > 0n;
  const dp = fuelled ? trainingDp(s) : 0n;
  return {
    at,
    network: {
      activeDp: dp + s.othersDp,
      hourEmission: hourlyEmission(s.reserve),
      emitted: s.emitted,
      pausedUntil: 0,
      marketOpened: true,
      marketOpenTime: base - DAY,
      genesisTime: base - 4 * DAY,
      litresPerEth: TRAINING_LITRES_PER_ETH,
      maxTankHours: MAX_TANK_HOURS,
    },
    rigs: GEN1_RIGS.map((rig, i) => ({
      id: i,
      dp: dpOf(i),
      burn: burnWad(i),
      premiumBps: rig.premiumPct * 100,
      minLevel: minLevel(i),
      generation: 1,
      price: i === 0 ? 0n : trainingRigCost(i, 1),
      owned: s.rigs[i]?.owned ?? 0,
      active: s.rigs[i]?.active ?? 0,
    })),
    player: {
      registered: true,
      level: s.level,
      dp: trainingDp(s),
      burn: trainingBurn(s),
      tank: s.tank,
      pending: s.pending,
      scrapCredit: s.scrapCredit,
      padsUsed: s.rigs.reduce((n, r) => n + r.owned, 0),
      walletMohn: s.wallet,
      siteUpgradePrice: trainingUpgradeCost(s.level),
      refines: s.refines.map((q) => ({ id: q.id, amount: q.amount, readyAt: base + q.readyAt })),
    },
  };
}
