'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../lib/motion';
import { useLowPower } from '../../lib/power';
import { ART, COLORS } from './mo-art';

/**
 * Foreman Mo (docs/01 §7, docs/05 §2.3): the one mascot, a mole foreman in a safety-orange hard
 * hat with a warm white headlamp, thick round glasses and a hi-vis vest. Our own 24x24 pixel art;
 * his glasses catch the light and his lamp glints.
 */
export function ForemanMo({ scale = 3, label }: { scale?: number; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const lowPower = useLowPower();
  const still = reduced || lowPower;

  useEffect(() => {
    const c = canvas.current?.getContext('2d');
    if (!c) return undefined;
    const draw = (blink: boolean, glint: boolean) => {
      c.clearRect(0, 0, 24, 24);
      ART.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          let ch = row[x] ?? '.';
          if (blink && ch === 'w' && y > 4) ch = 'e';
          if (ch === 'w' && y === 3 && !glint) ch = 'y';
          const col = COLORS[ch];
          if (col === undefined) continue;
          c.fillStyle = col;
          c.fillRect(x, y, 1, 1);
        }
      });
    };
    draw(false, true);
    if (still) return undefined;
    let tick = 0;
    const id = window.setInterval(() => {
      tick++;
      // A blink every four seconds or so, the lamp glints on and off.
      draw(tick % 27 === 0, tick % 8 < 5);
    }, 150);
    return () => window.clearInterval(id);
  }, [still]);

  return (
    <canvas
      ref={canvas}
      width={24}
      height={24}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className="pixel-canvas block shrink-0"
      style={{ width: 24 * scale, height: 24 * scale }}
    />
  );
}
