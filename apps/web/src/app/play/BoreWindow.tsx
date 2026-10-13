'use client';

import { KOLA_LINE_M, MOHO_LINE_M, STRATA, formatDepth, stratumAt } from '@mohonaut/sdk';
import { useEffect, useRef } from 'react';
import { depthFraction } from '../../components/BoreLog';
import { hash } from '../../game/pixel/draw';
import { formatSpan, hoursToDepth } from '../../lib/schedule';

const BAND = 18; // art pixels per stratum
const W = 34;
const H = BAND * STRATA.length;
const SCALE = 2;
const COL_X = 9; // the core column's left edge
const COL_W = 16;

/** Darken a #rrggbb colour by `k` (0..1). */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - k));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/**
 * The World Bore as a pixel core column (the brand's well log, docs/05 §2.4): one band per
 * stratum in its lithology colour with its own texture, the Kola and Moho lines, the drilled core
 * above today's depth and the rock still to come below it, dimmed.
 */
function CoreColumn({ metres }: { metres: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current?.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, W, H);
    const here = Math.round(depthFraction(metres) * H);
    STRATA.forEach((s, i) => {
      const top = i * BAND;
      for (let y = top; y < top + BAND; y++) {
        for (let x = COL_X; x < COL_X + COL_W; x++) {
          const n = hash(x, y, i);
          // Texture per stratum: grains, beds, crystals, banding, olivine, melt.
          let k: number;
          if (i === 0 || i === 1) k = n < 0.18 ? 0.25 : n > 0.9 ? -0.15 : 0;
          else if (i === 2) k = n < 0.12 ? 0.35 : n > 0.85 ? -0.25 : 0;
          else if (i === 3) k = (y - top) % 4 < 2 ? 0.18 : 0;
          else if (i === 4) k = n < 0.2 ? -0.3 : 0;
          else if (i === 5) k = n < 0.15 ? -0.2 : n > 0.9 ? 0.3 : 0;
          else if (i === 6) k = (x + y) % 5 === 0 ? -0.2 : 0;
          else k = n < 0.25 ? 0.15 : 0;
          c.fillStyle = shade(s.colour, Math.max(0, Math.min(0.9, (y > here ? 0.55 : 0) + k)));
          c.fillRect(x, y, 1, 1);
        }
      }
      // Stratum boundary.
      c.fillStyle = '#0e1013';
      c.fillRect(COL_X, top, COL_W, 1);
    });
    // Casing walls.
    c.fillStyle = '#39414a';
    c.fillRect(COL_X - 2, 0, 2, H);
    c.fillRect(COL_X + COL_W, 0, 2, H);
    // The Kola and Moho lines in bone, across the column and a little beyond.
    for (const m of [KOLA_LINE_M, MOHO_LINE_M]) {
      const y = Math.round(depthFraction(m) * H);
      c.fillStyle = '#ece7dc';
      for (let x = COL_X - 4; x < COL_X + COL_W + 4; x += 2) c.fillRect(x, y, 1, 1);
    }
    // Today's depth: the bit in cyan and a marker on the left.
    c.fillStyle = '#2ee6d6';
    c.fillRect(COL_X - 2, here, COL_W + 4, 1);
    c.fillRect(COL_X + COL_W / 2 - 2, here - 2, 4, 3);
    c.fillRect(0, here - 2, 4, 5);
    c.fillRect(4, here - 1, 2, 3);
    c.fillRect(6, here, 1, 1);
  }, [metres]);
  return (
    <canvas
      ref={canvas}
      width={W}
      height={H}
      aria-hidden="true"
      className="pixel-canvas block shrink-0"
      style={{ width: W * SCALE, height: H * SCALE }}
    />
  );
}

/** The World Bore window: today's depth, the core column and the strata beside it. */
export function BoreWindow({ depthMm }: { depthMm: bigint }) {
  const metres = Number(depthMm / 1000n);
  const { current, next } = stratumAt(depthMm);
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <p className="text-4xl text-cyan">{formatDepth(depthMm)}</p>
        <p className="mt-1 text-lg">
          Stratum {current.numeral}: {current.name}
        </p>
        {next !== null && (
          <p className="text-sm text-concrete">
            {next.name} from {next.fromM.toLocaleString('en-US')} m (
            {(next.fromM - metres).toLocaleString('en-US')} m to go, about{' '}
            {formatSpan(hoursToDepth(next.fromM) - hoursToDepth(Number(depthMm) / 1000))} of
            drilling on the emission schedule)
          </p>
        )}
      </div>
      <div className="px-inset flex justify-center gap-3 p-3">
        <CoreColumn metres={metres} />
        <ol aria-label="Strata of the World Bore" className="flex flex-col">
          {STRATA.map((s) => {
            const reached = metres >= s.fromM;
            const isCurrent = s.numeral === current.numeral;
            return (
              <li
                key={s.numeral}
                className={`flex items-center gap-2 text-sm leading-tight ${
                  isCurrent ? 'text-amber' : reached ? 'text-bone' : 'text-concrete'
                }`}
                style={{ height: BAND * SCALE }}
              >
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 border border-[#0b0d10]"
                  style={{ background: s.colour }}
                />
                <span>
                  {s.numeral} {s.name}
                  <span className="block text-xs text-concrete">
                    from {s.fromM.toLocaleString('en-US')} m
                    {s.fromM === KOLA_LINE_M ? ', the Kola line' : ''}
                    {s.fromM === MOHO_LINE_M ? ', the Moho' : ''}
                    {isCurrent ? ' · here' : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="text-sm text-concrete">
        Every driller cores this one shared bore. It deepens as $MOHN is mined, 1,000 MOHN per
        metre, and the rock gets harder the deeper it goes.
      </p>
    </div>
  );
}
