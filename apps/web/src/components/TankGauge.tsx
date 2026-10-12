import { formatLitres, formatUtc } from '../lib/format';

export interface TankGaugeProps {
  /** Litres in the tank (18 decimals). */
  tank: bigint;
  /** Tank capacity in litres (18 decimals). */
  capacity: bigint;
  /** Active burn in litres per hour (18 decimals); 0 when every rig is off. */
  burnPerHour: bigint;
  /** Unix seconds now. */
  now: number;
}

export type TankState = 'running' | 'low' | 'empty' | 'idle';

/** Seconds of drilling left at the current burn (null when nothing burns). */
export function secondsLeft(tank: bigint, burnPerHour: bigint): number | null {
  if (burnPerHour === 0n) return null;
  return Number((tank * 3600n) / burnPerHour);
}

export function tankState(tank: bigint, burnPerHour: bigint): TankState {
  if (tank === 0n) return 'empty';
  const left = secondsLeft(tank, burnPerHour);
  if (left === null) return 'idle';
  return left < 24 * 3600 ? 'low' : 'running';
}

const BAR: Record<TankState, string> = {
  running: 'bg-data',
  idle: 'bg-concrete',
  low: 'bg-warn',
  empty: 'bg-bad',
};

/** "Tank: 432.0 ℓ · burn 12.0 ℓ/h · runs until 14 Oct 22:00 UTC" (docs/05 §2.2). */
export function TankGauge({ tank, capacity, burnPerHour, now }: TankGaugeProps) {
  const state = tankState(tank, burnPerHour);
  const left = secondsLeft(tank, burnPerHour);
  const pct = capacity === 0n ? 0 : Number((tank * 1000n) / capacity) / 10;
  const until =
    state === 'empty'
      ? 'empty: rigs stopped'
      : left === null
        ? 'no rig running'
        : `runs until ${formatUtc(now + left)}`;
  return (
    <div>
      <div
        role="meter"
        aria-label="Diesel tank"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={`${formatLitres(tank)}, ${until}`}
        className="h-4 w-full overflow-hidden rounded border border-line bg-surface-sunken"
      >
        <div className={`h-full ${BAR[state]}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="mt-2 text-fg">
        Tank: <span className="num">{formatLitres(tank)}</span> · burn{' '}
        <span className="num">{formatLitres(burnPerHour)}/h</span> ·{' '}
        <span className={state === 'low' ? 'text-warn' : state === 'empty' ? 'text-bad' : ''}>
          {until}
        </span>
      </p>
    </div>
  );
}
