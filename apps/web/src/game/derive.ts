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

/** ETH (wei) needed for `litres` (WAD) given the quote of 1e18 wei → `litresPerEth`. */
export function weiForLitres(litres: bigint, litresPerEth: bigint): bigint {
  if (litresPerEth === 0n) return 0n;
  return (litres * 10n ** 18n + litresPerEth - 1n) / litresPerEth;
}
