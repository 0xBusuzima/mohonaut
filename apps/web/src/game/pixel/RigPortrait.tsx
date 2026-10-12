'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../lib/motion';
import { useLowPower } from '../../lib/power';
import { ellipse, hash, px, rect } from './draw';
import { P } from './palette';
import { drawRig, padTile } from './world';

const W = 100;
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
      // Night backdrop: sky, a few stars, a ridge, dark land.
      rect(c, 0, 0, W, 24, P.skyTop);
      rect(c, 0, 24, W, 20, P.skyMid);
      for (let i = 0; i < 14; i++) {
        px(c, Math.floor(hash(i, 1) * W), Math.floor(hash(i, 2) * 40), i % 4 ? P.starDim : P.star);
      }
      for (let x = 0; x < W; x++) {
        const h = Math.round(Math.sin(x / 11 + typeId) * 3 + Math.sin(x / 5) + 6);
        rect(c, x, 50 - h, 1, h, P.hillFar);
      }
      rect(c, 0, 50, W, H - 50, P.earth);
      for (let i = 0; i < 40; i++) {
        px(c, Math.floor(hash(i, 3) * W), 50 + Math.floor(hash(i, 4) * (H - 50)), P.earthSpeck);
      }
      // The rig's own lamp pool.
      c.globalAlpha = running ? 0.22 : 0.08;
      ellipse(c, W / 2, PAD_Y + 18, 46, 23, P.glow);
      ellipse(c, W / 2, PAD_Y + 18, 32, 16, P.glow);
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
