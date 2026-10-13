import { millimetres } from '@mohonaut/sdk';
import type { GameState } from './state';

/** What the site looked like when the player last had the game open (stored on the device). */
export interface ShiftSnapshot {
  at: number;
  pending: string;
  tank: string;
  emitted: string;
}

/** What happened while the player was away. */
export interface ShiftReport {
  /** Seconds away. */
  away: number;
  /** Unrefined $MOHN cored (18 decimals). */
  cored: bigint;
  /** Litres of diesel burned (18 decimals). */
  diesel: bigint;
  /** How much deeper the World Bore is, in millimetres. */
  boreMm: bigint;
  tankEmpty: boolean;
}

/** Away for at least this long before Foreman Mo gives a shift report. */
const MIN_AWAY_S = 3600;

export function snapshotOf(s: GameState): ShiftSnapshot | null {
  const p = s.player;
  if (p === null || !p.registered || p.readFailed === true) return null;
  return {
    at: s.at,
    pending: p.pending.toString(),
    tank: p.tank.toString(),
    emitted: s.network.emitted.toString(),
  };
}

const atLeastZero = (x: bigint) => (x > 0n ? x : 0n);

/**
 * The shift report for a returning player, or null when they were not away long enough or
 * nothing ran. Spending in between (on another device) only lowers what it shows.
 */
export function shiftReport(prev: ShiftSnapshot, now: GameState): ShiftReport | null {
  const p = now.player;
  if (p === null || !p.registered || p.readFailed === true) return null;
  const away = now.at - prev.at;
  if (away < MIN_AWAY_S) return null;
  const cored = atLeastZero(p.pending - BigInt(prev.pending));
  const diesel = atLeastZero(BigInt(prev.tank) - p.tank);
  if (cored === 0n && diesel === 0n) return null;
  return {
    away,
    cored,
    diesel,
    boreMm: atLeastZero(millimetres(now.network.emitted) - millimetres(BigInt(prev.emitted))),
    tankEmpty: p.tank === 0n,
  };
}
