/**
 * Economy health metrics (docs/02 §10, §12, §13), shared by the indexer, the API and the
 * admin panel. Definitions follow sim/engine/metrics.py; flows are MOHN wei unless noted.
 */

/** MOHN and ETH flows of a period (an hour, a day or a trailing window). */
export interface Flows {
  /** Emission distributed to miners, dev and treasury. */
  emitted: bigint;
  /** 80 % of every MOHN spend (rigs, site upgrades). */
  spendBurn: bigint;
  /** Burned half of the fast-refine fee. */
  feeBurn: bigint;
  /** MOHN bought back with ETH and burned. */
  buybackBurn: bigint;
  /** MOHN-side Uniswap fees of the protocol position, burned. */
  lpFeeBurn: bigint;
  /** Returned to the emission reserve: 20 % of every spend and the other half of the fee. */
  recycled: bigint;
  /** ETH (wei) the revenue router allocated to buybacks: R_ETH × α. */
  buybackFundedEth: bigint;
}

export const ZERO_FLOWS: Readonly<Flows> = Object.freeze({
  emitted: 0n,
  spendBurn: 0n,
  feeBurn: 0n,
  buybackBurn: 0n,
  lpFeeBurn: 0n,
  recycled: 0n,
  buybackFundedEth: 0n,
});

export function addFlows(a: Flows, b: Flows): Flows {
  return {
    emitted: a.emitted + b.emitted,
    spendBurn: a.spendBurn + b.spendBurn,
    feeBurn: a.feeBurn + b.feeBurn,
    buybackBurn: a.buybackBurn + b.buybackBurn,
    lpFeeBurn: a.lpFeeBurn + b.lpFeeBurn,
    recycled: a.recycled + b.recycled,
    buybackFundedEth: a.buybackFundedEth + b.buybackFundedEth,
  };
}

export function burned(f: Flows): bigint {
  return f.spendBurn + f.feeBurn + f.buybackBurn + f.lpFeeBurn;
}

function ratio(num: bigint, den: bigint): number {
  return den === 0n ? Number.NaN : Number(num) / Number(den);
}

/** SR = (burned + returned to the reserve) / emitted. NaN when nothing was emitted. */
export function sinkRatio(f: Flows): number {
  return ratio(burned(f) + f.recycled, f.emitted);
}

/** NE = E − burns (can be negative: the supply shrank). */
export function netEmission(f: Flows): bigint {
  return f.emitted - burned(f);
}

/**
 * RCR = buyback USD / (E · P). Valued at the buybacks' own execution price, this is the MOHN
 * bought back per MOHN emitted, so no price feed is needed.
 */
export function revenueCoverageRatio(f: Flows): number {
  return ratio(f.buybackBurn, f.emitted);
}

/**
 * P* = R_ETH · α · β / E with β = 1: the MOHN price (in ETH per MOHN) at which the buyback
 * would absorb the whole emission. Multiply by ETH/USD for the USD figure.
 */
export function zeroInflationPriceEth(f: Flows): number {
  return ratio(f.buybackFundedEth, f.emitted);
}

type Amount = bigint | number;

function sortedNumbers(values: readonly Amount[], descending: boolean): number[] {
  const v = values.map(Number);
  return v.sort((a, b) => (descending ? b - a : a - b));
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const x of values) total += x;
  return total;
}

/** Gini coefficient over wallets (0 = equal, → 1 = one wallet holds everything). */
export function gini(values: readonly Amount[]): number {
  const v = sortedNumbers(values, false);
  const total = sum(v);
  if (v.length === 0 || total <= 0) return Number.NaN;
  let prev = 0;
  let cum = 0;
  let area = 0;
  for (const x of v) {
    cum += x;
    const share = cum / total;
    area += share + prev;
    prev = share;
  }
  return 1 - area / v.length;
}

/** Nakamoto coefficient: the fewest wallets that together hold more than 50 %. */
export function nakamoto(values: readonly Amount[]): number {
  const v = sortedNumbers(values, true);
  const total = sum(v);
  if (v.length === 0 || total <= 0) return Number.NaN;
  const half = total / 2;
  let cum = 0;
  for (let i = 0; i < v.length; i++) {
    cum += v[i] as number;
    if (cum > half) return i + 1;
  }
  return v.length;
}

/** Share of the total held by the `n` largest wallets. */
export function topShare(values: readonly Amount[], n: number): number {
  const v = sortedNumbers(values, true);
  const total = sum(v);
  if (total <= 0) return Number.NaN;
  return sum(v.slice(0, n)) / total;
}
