/**
 * Pure game arithmetic for the HUD (docs/01 §6): honest numbers in game units, never USD.
 */

const BPS = 10_000n;

/** The miners' share of an hour's emission: 90 %, rounded down like EmissionMath.split. */
export function minersShare(hourEmission: bigint): bigint {
  return (hourEmission * 9_000n) / BPS;
}

/**
 * Current estimate of what `dp` mines per hour: miners' share × dp ÷ network active DP.
 * It falls as others join (the HUD says so).
 */
export function perHourEstimate(dp: bigint, networkDp: bigint, hourEmission: bigint): bigint {
  if (dp === 0n || networkDp === 0n) return 0n;
  return (minersShare(hourEmission) * dp) / networkDp;
}

/** "0.42%": the player's share of network Drill Power. */
export function shareOfNetwork(dp: bigint, networkDp: bigint): string {
  if (networkDp === 0n || dp === 0n) return '0%';
  const bps = (dp * 1_000_000n) / networkDp; // hundred-thousandths
  return `${(Number(bps) / 10_000).toFixed(2)}%`;
}

/** Efficiency of a rig or fleet: DP per litre per hour. */
export function efficiency(dp: bigint, burnWad: bigint): number | null {
  if (burnWad === 0n) return null;
  return Number((dp * 10n ** 18n * 100n) / burnWad) / 100;
}

/** maxCost with slippage headroom (VRGDA prices move with time and other buyers). */
export function withHeadroom(cost: bigint, bps = 200n): bigint {
  return cost + (cost * bps) / BPS;
}

const HOUR = 3600;
const GENESIS_TANK_GRACE = 24 * HOUR; // MiningCore.GENESIS_TANK_GRACE

/**
 * Litres (WAD) the tank still takes now, as MiningCore._maxTank computes it: fuel line capacity
 * x maxTankHours, and until Market Open only what the rigs burn by Market Open + 24 h (the
 * genesis tank limit, docs/02 §11).
 */
export function tankRoom(p: {
  now: number;
  genesisTime: number;
  marketOpenTime: number;
  maxTankHours: number;
  capacityPerHour: bigint;
  burn: bigint;
  tank: bigint;
}): bigint {
  let cap = p.capacityPerHour * BigInt(p.maxTankHours);
  if (p.now < p.marketOpenTime) {
    const runFrom = Math.max(p.now, p.genesisTime);
    const genesis =
      (p.burn * BigInt(p.marketOpenTime + GENESIS_TANK_GRACE - runFrom)) / BigInt(HOUR);
    if (genesis < cap) cap = genesis;
  }
  return cap > p.tank ? cap - p.tank : 0n;
}

/** ETH (wei) that buys at most `litres`, 1 % under the quote so a price tick cannot overshoot. */
export function weiForAtMostLitres(litres: bigint, litresPerEth: bigint): bigint {
  if (litresPerEth === 0n) return 0n;
  return (((litres * 10n ** 18n) / litresPerEth) * 99n) / 100n;
}

/** ETH (wei) needed for `litres` (WAD) given the quote of 1e18 wei → `litresPerEth`. */
export function weiForLitres(litres: bigint, litresPerEth: bigint): bigint {
  if (litresPerEth === 0n) return 0n;
  return (litres * 10n ** 18n + litresPerEth - 1n) / litresPerEth;
}

/** MiningCore.MAX_UNITS_PER_TX: Drill Power one purchase may add. */
const MAX_UNITS_PER_TX = 10_000n;

/**
 * How many rigs of one type a purchase can add now, as buyMachines checks it: a free pad each,
 * room on the fuel line for their burn, and at most 10,000 DP in one transaction.
 */
export function maxRigsToBuy(p: {
  freePads: number;
  fuelLine: bigint;
  burn: bigint;
  rigBurn: bigint;
  rigDp: bigint;
}): number {
  const byLine = p.rigBurn === 0n ? Infinity : Number((p.fuelLine - p.burn) / p.rigBurn);
  const byTx = p.rigDp === 0n ? Infinity : Number(MAX_UNITS_PER_TX / p.rigDp);
  return Math.max(0, Math.min(p.freePads, byLine, byTx));
}

/**
 * `emitted` as of `now`: the stored value from the last checkpoint plus the hour's slice since,
 * while someone drills, after Genesis and outside a pause. For display only; the next hours'
 * slices are a little smaller, so a checkpoint long ago is overstated by about 0.05% a day.
 */
export function emittedAt(p: {
  emitted: bigint;
  hourEmission: bigint;
  activeDp: bigint;
  lastUpdate: number;
  pausedUntil: number;
  genesisTime: number;
  now: number;
}): bigint {
  const from = Math.max(p.lastUpdate, p.genesisTime, p.pausedUntil);
  if (p.activeDp === 0n || p.now <= from) return p.emitted;
  return p.emitted + (p.hourEmission * BigInt(p.now - from)) / 3600n;
}
