'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../lib/motion';
import { useLowPower } from '../../lib/power';
import { rect } from './draw';
import { P } from './palette';
import { drawRig, padTile } from './world';

const W = 80;
const H = 92;
const PAD_Y = 58; // the pad's top corner; the rig stands on its centre, 16 px lower

/** One rig on its pad, as on the site, for the market and rig cards. Scaled up by `scale`. */
export function RigPortrait({
  typeId,
  running = true,
  scale = 3,
}: {
  typeId: number;
  running?: boolean;
  scale?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const lowPower = useLowPower();
  const motion = running && !reduced && !lowPower;

  useEffect(() => {
    const c = canvas.current?.getContext('2d');
    if (!c) return;
    const t0 = performance.now();
    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      c.clearRect(0, 0, W, H);
      // A lamp pool under the pad.
      c.globalAlpha = running ? 0.18 : 0.08;
      for (let r = 0; r < 4; r++)
        rect(c, 8 + r * 4, 66 + r * 2, W - 16 - r * 8, 24 - r * 4, P.glow);
      c.globalAlpha = 1;
      padTile(c, W / 2, PAD_Y, true, false);
      drawRig(c, W / 2, PAD_Y + 16, typeId, running, t, motion, typeId * 7);
    };
    draw();
    if (!motion) return;
    const id = window.setInterval(draw, 90);
    return () => window.clearInterval(id);
  }, [typeId, running, motion]);

  return (
    <canvas
      ref={canvas}
      width={W}
      height={H}
      aria-hidden="true"
      className="pixel-canvas block"
      style={{ width: W * scale, height: H * scale }}
    />
  );
}
