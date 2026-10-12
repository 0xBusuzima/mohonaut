import { KOLA_LINE_M, MOHO_LINE_M, STRATA, formatDepth, stratumAt } from '@mohonaut/sdk';

/** Depth range drawn for the last, open-ended stratum (The Core starts at 85,000 m). */
const CORE_DRAWN_TO_M = 100_000;

/**
 * Position (0 = top, 1 = bottom) of a depth on the log. Every stratum gets an equal band so the
 * first strata (reached in weeks) stay readable next to the deep ones (reached in years).
 */
export function depthFraction(metres: number): number {
  const n = STRATA.length;
  for (let i = n - 1; i >= 0; i--) {
    const s = STRATA[i];
    if (s === undefined || metres < s.fromM) continue;
    const to = STRATA[i + 1]?.fromM ?? CORE_DRAWN_TO_M;
    const within = Math.min(1, (metres - s.fromM) / (to - s.fromM));
    return (i + within) / n;
  }
  return 0;
}

export interface BoreLogProps {
  /** World depth in millimetres. */
  depthMm: bigint;
  height?: number;
  width?: number;
}

/**
 * The bore log (docs/01 §4.6, docs/05 §2.4): the signature element. Lithology bands, metre
 * marks at each stratum, the Kola and Moho lines in bone, and "we are here" in gauge cyan.
 */
export function BoreLog({ depthMm, height = 480, width = 180 }: BoreLogProps) {
  const metres = Number(depthMm / 1000n);
  const { current, next } = stratumAt(depthMm);
  const band = height / STRATA.length;
  const colX = 64;
  const colW = 44;
  const here = depthFraction(metres) * height;
  const line = (m: number) => depthFraction(m) * height;
  const label = `World Bore ${formatDepth(depthMm)}, stratum ${current.numeral} ${current.name}${
    next === null ? '' : `; next: ${next.name} at ${next.fromM.toLocaleString('en-US')} m`
  }`;
  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height + 2}
      viewBox={`0 0 ${width} ${height + 2}`}
      className="font-mono"
    >
      {STRATA.map((s, i) => (
        <g key={s.name}>
          <rect
            x={colX}
            y={i * band + 1}
            width={colW}
            height={band}
            fill={s.colour}
            stroke={i === 4 ? 'var(--color-bone)' : 'var(--color-steel)'}
            strokeWidth={1}
          />
          <text
            x={colX - 6}
            y={i * band + 13}
            textAnchor="end"
            fontSize={11}
            fill="var(--fg-muted)"
          >
            {s.fromM.toLocaleString('en-US')}
          </text>
          <text x={colX + colW + 6} y={i * band + 13} fontSize={11} fill="var(--fg-muted)">
            {s.numeral}
          </text>
        </g>
      ))}
      {[
        { m: KOLA_LINE_M, name: 'KOLA' },
        { m: MOHO_LINE_M, name: 'MOHO' },
      ].map((l) => (
        <g key={l.name}>
          <line
            x1={colX - 4}
            x2={colX + colW + 4}
            y1={line(l.m) + 1}
            y2={line(l.m) + 1}
            stroke="var(--color-bone)"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
          <text x={colX + colW + 24} y={line(l.m) + 5} fontSize={10} fill="var(--fg)">
            {l.name}
          </text>
        </g>
      ))}
      <line
        data-testid="bore-here"
        x1={colX - 10}
        x2={colX + colW + 10}
        y1={here + 1}
        y2={here + 1}
        stroke="var(--color-cyan)"
        strokeWidth={3}
      />
    </svg>
  );
}
