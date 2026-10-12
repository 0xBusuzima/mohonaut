'use client';

import { useNow } from '../lib/clock';
import { formatUnits18 } from '../lib/format';
import { useReducedMotion } from '../lib/motion';
import { useLowPower } from '../lib/power';

export interface CounterProps {
  /** Amount (18 decimals) at `since`. */
  base: bigint;
  /** Increase per hour (18 decimals), e.g. the player's current share of emission. */
  perHour: bigint;
  /** Unix seconds of `base`. */
  since: number;
  unit: string;
  digits?: number;
  /** Classes for the number (size and colour). */
  numberClass?: string;
}

/** Value at `nowMs`, derived from the formula; no chain call needed (docs/03 §4.1). */
export function counterValue(base: bigint, perHour: bigint, since: number, nowMs: number): bigint {
  const elapsedMs = BigInt(Math.max(0, Math.floor(nowMs - since * 1000)));
  return base + (perHour * elapsedMs) / 3_600_000n;
}

/**
 * A live counter (e.g. unrefined MOHN). Ticks every 250 ms, or every second when the player
 * prefers reduced motion or low-power mode is on. Screen readers get the rate, not a constantly changing number.
 */
export function Counter({
  base,
  perHour,
  since,
  unit,
  digits = 4,
  numberClass = 'text-3xl text-data',
}: CounterProps) {
  const reduced = useReducedMotion();
  const lowPower = useLowPower();
  const nowMs = useNow(reduced || lowPower ? 1000 : 250);
  const value = counterValue(base, perHour, since, nowMs ?? since * 1000);
  const u = unit === '' ? '' : ` ${unit}`;
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={`num ${numberClass}`} aria-hidden="true">
        {formatUnits18(value, digits)}
      </span>
      {unit !== '' && (
        <span className="font-condensed text-lg uppercase text-fg-muted" aria-hidden="true">
          {unit}
        </span>
      )}
      <span className="sr-only">
        {`${formatUnits18(value, 2)}${u}, rising about ${formatUnits18(perHour, 2)}${u} per hour`}
      </span>
    </span>
  );
}
