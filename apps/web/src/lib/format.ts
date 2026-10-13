/**
 * Number formatting for the game: token amounts are bigint wei; the UI never converts balances
 * or emission shares to USD (docs/01 §6, docs/05 §6).
 */

const WAD = 10n ** 18n;

/** `amount` (18 decimals) with `digits` fraction digits, rounded down, thousands separated. */
export function formatUnits18(amount: bigint, digits = 2): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / WAD;
  const scale = 10n ** BigInt(digits);
  const fraction = ((abs % WAD) * scale) / WAD;
  const text =
    digits === 0
      ? whole.toLocaleString('en-US')
      : `${whole.toLocaleString('en-US')}.${fraction.toString().padStart(digits, '0')}`;
  return negative ? `-${text}` : text;
}

export const formatMohn = (wei: bigint, digits = 2) => `${formatUnits18(wei, digits)} MOHN`;
export const formatEth = (wei: bigint, digits = 5) => `${formatUnits18(wei, digits)} ETH`;

/** An ETH amount for an input field: at most 6 decimals, rounded down, no unit. */
export function formatEthInput(wei: bigint): string {
  const micro = wei / 10n ** 12n;
  const frac = (micro % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return frac === '' ? `${micro / 1_000_000n}` : `${micro / 1_000_000n}.${frac}`;
}
export const formatLitres = (wad: bigint, digits = 1) => `${formatUnits18(wad, digits)} ℓ`;

/** "3 d 4 h", "5 h 12 min", "8 min" */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0 min';
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${Math.max(m, 1)} min`;
}

/** "14 Oct 22:00 UTC": game times are always UTC. */
export function formatUtc(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${month} ${hh}:${mm} UTC`;
}
