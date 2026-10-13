import { STRATA } from '@mohonaut/sdk';
import type { ReactNode } from 'react';

type Tone = 'neutral' | 'ok' | 'warning' | 'alarm' | 'data';

const TONES: Record<Tone, string> = {
  neutral: 'border-line text-fg-muted',
  ok: 'border-good text-good',
  warning: 'border-warn text-warn',
  alarm: 'border-bad text-bad',
  data: 'border-data text-data',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 font-condensed text-sm font-semibold uppercase tracking-wide ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** A stratum chip in its lithology colour (docs/05 §2.4). */
export function StratumBadge({ index }: { index: number }) {
  const s = STRATA[index];
  if (s === undefined) return null;
  const dark = index === 4; // Granulite Floor is darker than the panels: outline it
  return (
    <span className="inline-flex items-center gap-2 font-condensed text-sm font-semibold uppercase tracking-wide">
      <span
        aria-hidden="true"
        className={`h-3 w-6 rounded-sm ${dark ? 'border border-bone' : ''}`}
        style={{ background: s.colour }}
      />
      {s.numeral} — {s.name}
    </span>
  );
}
