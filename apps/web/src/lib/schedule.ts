import { CAP, DELTA_H_WAD, WAD } from '@mohonaut/sdk';

const CAP_MOHN = Number(CAP / WAD);
const DELTA_H = Number(DELTA_H_WAD) / Number(WAD);

/**
 * Hours of drilling until the World Bore is `metres` deep (depth = $MOHN mined / 1,000), on the
 * emission schedule alone: someone drills every hour and nothing returns to the reserve.
 */
export function hoursToDepth(metres: number): number {
  const mined = metres * 1000;
  if (mined >= CAP_MOHN) return Infinity;
  return Math.log(1 - mined / CAP_MOHN) / Math.log(1 - DELTA_H);
}

/** "5 hours" under a day, "40 days" under a year, "2.4 years" after. */
export function formatSpan(hours: number): string {
  if (hours < 24)
    return `${Math.max(1, Math.round(hours))} hour${Math.round(hours) > 1 ? 's' : ''}`;
  const days = hours / 24;
  if (days < 365) return `${Math.round(days)} days`;
  return `${(days / 365.25).toFixed(1)} years`;
}
