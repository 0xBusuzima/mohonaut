'use client';

import { useNow } from '../lib/clock';
import { formatUnits18 } from '../lib/format';
import { useReducedMotion } from '../lib/motion';

export interface CounterProps {
  /** Amount (18 decimals) at `since`. */
  base: bigint;
  /** Increase per hour (18 decimals), e.g. the player's current share of emission. */
  perHour: bigint;
  /** Unix seconds of `base`. */
  since: number;
  unit: string;
  digits?: number;
}

/** Value at `nowMs`, derived from the formula; no chain call needed (docs/03 §4.1). */
export function counterValue(base: bigint, perHour: bigint, since: number, nowMs: number): bigint {
  const elapsedMs = BigInt(Math.max(0, Math.floor(nowMs - since * 1000)));
  return base + (perHour * elapsedMs) / 3_600_000n;
}

/**
 * A live counter (e.g. unrefined MOHN). Ticks every 250 ms, or every second when the player
 * prefers reduced motion. Screen readers get the rate, not a constantly changing number.
 */
export function Counter({ base, perHour, since, unit, digits = 4 }: CounterProps) {
  const reduced = useReducedMotion();
  const nowMs = useNow(reduced ? 1000 : 250);
  const value = counterValue(base, perHour, since, nowMs ?? since * 1000);
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="num text-3xl text-data" aria-hidden="true">
        {formatUnits18(value, digits)}
      </span>
      <span className="font-condensed text-lg uppercase text-fg-muted" aria-hidden="true">
        {unit}
      </span>
      <span className="sr-only">
        {`${formatUnits18(value, 2)} ${unit}, rising about ${formatUnits18(perHour, 2)} ${unit} per hour`}
      </span>
    </span>
  );
}
