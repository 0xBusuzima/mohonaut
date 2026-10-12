/** Pure decisions of the keeper jobs (unit-tested without a chain). */

const HOUR = 3600n;
export const DAY = 86_400n;
const BPS = 10_000n;

/** MiningCore accounting has an hour boundary to close (poke() catches up ≤ 168 per call). */
export function pokeDue(now: bigint, lastUpdate: bigint): boolean {
  return now > lastUpdate && now / HOUR > lastUpdate / HOUR;
}

export function marketOpenDue(now: bigint, marketOpenTime: bigint, opened: boolean): boolean {
  return !opened && now >= marketOpenTime;
}

/**
 * The contracts' price anchor band (lib/PriceAnchor.sol MAX_DEVIATION): 296 ticks, about 3 %.
 * Keeper swaps may not move the price further than this below the anchor (docs/02 §10.1).
 */
const ANCHOR_BAND = 296;
/** A chunk moves the price about 2 % (sim/params.json max_chunk_price_move): ~198 ticks. */
const CHUNK_TICKS = 198;
/** ETH in for a 2 % move of a full-range pool: poolEth × (√1.02 − 1) ≈ 0.99 % of its ETH. */
const CHUNK_BPS = 99n;

/**
 * Today's budget and what was already spent of it, mirroring BuybackBurner.executeBuyback and
 * LiquidityManager._useDailyCap: the budget is fixed at the day's first spend as `bps` of the
 * bucket, so on a new day it is computed from the bucket as it is now.
 */
export function today(p: {
  bucket: bigint;
  bps: bigint;
  day: bigint;
  budget: bigint;
  used: bigint;
  now: bigint;
}): { budget: bigint; used: bigint } {
  if (p.day < p.now / DAY) return { budget: (p.bucket * p.bps) / BPS, used: 0n };
  return { budget: p.budget, used: p.used };
}

/** Keeper chunks per UTC day, one per 3-hour slot (sim/params.json keeper.chunks_per_day). */
const SLOTS = 8n;
export const SLOT = DAY / SLOTS;

/**
 * This slot's spend: the day's budget paced evenly over 8 three-hour slots (a missed slot is
 * caught up later), at most `chunks` 2 % chunks, at most the bucket. Stateless, so ticks stay
 * idempotent.
 */
export function slotSpend(p: {
  budget: bigint;
  used: bigint;
  bucket: bigint;
  poolEth: bigint;
  chunks: bigint;
  now: bigint;
}): bigint {
  const slot = (p.now % DAY) / SLOT;
  const target = (p.budget * (slot + 1n)) / SLOTS;
  if (target <= p.used) return 0n;
  let spend = target - p.used;
  const chunk = (p.poolEth * CHUNK_BPS * p.chunks) / BPS;
  if (spend > chunk) spend = chunk;
  if (spend > p.bucket) spend = p.bucket;
  return spend;
}

/** Ticks kept free above the anchor's lower limit (rounding, other swaps in the same block). */
const BAND_MARGIN = 10;

/**
 * Scales a buying chunk down to the room left above the anchor's lower limit: a swap that reached
 * the limit would fill only partly and miss its minOut. A full chunk moves ~CHUNK_TICKS; smaller
 * amounts move proportionally less. 0 when there is no room.
 */
export function fitToBand(spend: bigint, tick: number, anchor: number): bigint {
  const room = tick - (anchor - ANCHOR_BAND) - BAND_MARGIN;
  if (room <= 0) return 0n;
  if (room >= CHUNK_TICKS) return spend;
  return (spend * BigInt(room)) / BigInt(CHUNK_TICKS);
}

/** LiquidityManager.addLiquidity requires the price within the band on both sides. */
export function nearAnchor(tick: number, anchor: number): boolean {
  return Math.abs(tick - anchor) <= ANCHOR_BAND;
}

export function withSlippage(amount: bigint, slippageBps: bigint): bigint {
  return (amount * (BPS - slippageBps)) / BPS;
}

/** |price(spot) − price(reference)| / price(reference) in bps, prices from sqrtPriceX96. */
export function priceDeviationBps(spotSqrtX96: bigint, referenceSqrtX96: bigint): bigint {
  const spot = spotSqrtX96 * spotSqrtX96;
  const ref = referenceSqrtX96 * referenceSqrtX96;
  const diff = spot > ref ? spot - ref : ref - spot;
  return (diff * BPS) / ref;
}

export function median(values: readonly bigint[]): bigint | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}
