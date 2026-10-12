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
 * Room left today under a contract's daily cap (`bps` of the pool's ETH), mirroring
 * BuybackBurner.executeBuyback and LiquidityManager._useDailyCap.
 */
export function dailyRoom(p: {
  poolEth: bigint;
  bps: bigint;
  day: bigint;
  usedInDay: bigint;
  now: bigint;
}): bigint {
  const cap = (p.poolEth * p.bps) / BPS;
  const used = p.day < p.now / DAY ? 0n : p.usedInDay;
  return cap > used ? cap - used : 0n;
}

/** The daily job already ran today (the contract recorded a spend for the current UTC day). */
export function ranToday(day: bigint, usedInDay: bigint, now: bigint): boolean {
  return day === now / DAY && usedInDay > 0n;
}

/** Daily jobs wait until this UTC hour so the day's revenue has accumulated in the bucket. */
export function dailyWindowOpen(now: bigint, hourUtc: number): boolean {
  return (now % DAY) / HOUR >= BigInt(hourUtc);
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
