'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../lib/motion';
import { useLowPower } from '../../lib/power';
import { PORTRAIT_H, PORTRAIT_W, drawPortrait } from './portrait';

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
    const draw = () => drawPortrait(c, typeId, running, (performance.now() - t0) / 1000, motion);
    draw();
    if (!motion) return;
    const id = window.setInterval(draw, 90);
    return () => window.clearInterval(id);
  }, [typeId, running, motion]);

  return (
    <canvas
      ref={canvas}
      width={PORTRAIT_W}
      height={PORTRAIT_H}
      aria-hidden="true"
      className="pixel-canvas block"
      style={{ width: PORTRAIT_W * scale, height: PORTRAIT_H * scale }}
    />
  );
}
