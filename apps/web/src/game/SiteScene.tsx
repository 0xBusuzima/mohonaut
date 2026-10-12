'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../lib/motion';
import { useLowPower } from '../lib/power';

export interface ScenePad {
  /** Rig type on this pad, or null for an empty pad. */
  typeId: number | null;
  running: boolean;
}

/** Pads in an isometric grid, 4 per row, front to back (pure, tested). */
export function padPositions(count: number, tileW = 96): { x: number; y: number }[] {
  const tileH = tileW / 2;
  return Array.from({ length: count }, (_, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    return { x: (col - row) * (tileW / 2), y: (col + row) * (tileH / 2) };
  });
}

const RIG_HEIGHT = [26, 34, 42, 50, 58, 66, 70, 74];

/**
 * The drill site at night (docs/01 §7): pads on wet graphite, rigs in safety orange, steam from
 * the running ones. Placeholder geometry until the sprite atlas (docs/06 8.1). Decorative: the
 * same facts are listed as text next to it.
 */
export function SiteScene({ pads, label }: { pads: ScenePad[]; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const lowPower = useLowPower();
  const still = reduced || lowPower;

  useEffect(() => {
    const el = host.current;
    if (el === null) return undefined;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    void (async () => {
      const PIXI = await import('pixi.js');
      // Shader code without eval, so the Content-Security-Policy needs no 'unsafe-eval'.
      await import('pixi.js/unsafe-eval');
      const app = new PIXI.Application();
      await app.init({
        background: '#0e1013',
        resizeTo: el,
        antialias: !lowPower,
        autoDensity: true,
        // Low-power mode draws at 1x and only when something changes.
        resolution: lowPower ? 1 : window.devicePixelRatio || 1,
        autoStart: !still,
      });
      if (cancelled) {
        app.destroy(true);
        return;
      }
      el.appendChild(app.canvas);
      const world = new PIXI.Container();
      app.stage.addChild(world);
      const positions = padPositions(pads.length);
      const steam: { g: InstanceType<typeof PIXI.Graphics>; phase: number }[] = [];
      positions.forEach((p, i) => {
        const pad = pads[i];
        const g = new PIXI.Graphics();
        g.poly([p.x, p.y - 24, p.x + 48, p.y, p.x, p.y + 24, p.x - 48, p.y])
          .fill(0x22272d)
          .stroke({ color: 0x39414a, width: 1 });
        world.addChild(g);
        if (pad === undefined || pad.typeId === null) return;
        const h = RIG_HEIGHT[pad.typeId] ?? 50;
        const colour = pad.running ? 0xff6b1a : 0x39414a;
        const rig = new PIXI.Graphics();
        rig
          .moveTo(p.x - 14, p.y)
          .lineTo(p.x, p.y - h)
          .lineTo(p.x + 14, p.y)
          .moveTo(p.x - 9, p.y - h / 3)
          .lineTo(p.x + 9, p.y - h / 3)
          .moveTo(p.x - 5, p.y - (2 * h) / 3)
          .lineTo(p.x + 5, p.y - (2 * h) / 3)
          .stroke({ color: colour, width: 3 });
        rig.rect(p.x - 10, p.y - 6, 20, 8).fill(pad.running ? 0xffb31a : 0x22272d);
        world.addChild(rig);
        if (pad.running) {
          const s = new PIXI.Graphics();
          s.circle(p.x, p.y - h - 6, 5).fill({ color: 0xece7dc, alpha: 0.35 });
          world.addChild(s);
          steam.push({ g: s, phase: i * 0.7 });
        }
      });
      const centre = () => {
        world.x = app.screen.width / 2;
        world.y = app.screen.height / 2 - Math.ceil(pads.length / 4) * 12;
      };
      centre();
      app.renderer.on('resize', () => {
        centre();
        if (still) app.render();
      });
      if (still) {
        app.render();
      } else {
        let t = 0;
        app.ticker.add((tick) => {
          t += tick.deltaTime / 60;
          for (const s of steam) {
            const k = (t + s.phase) % 2;
            s.g.y = -k * 14;
            s.g.alpha = 1 - k / 2;
          }
        });
      }
      destroy = () => app.destroy(true, { children: true });
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [pads, reduced, lowPower, still]);

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-lg border border-line sm:h-96">
      <div ref={host} aria-hidden="true" className="absolute inset-0" />
      <p className="sr-only">{label}</p>
    </div>
  );
}
