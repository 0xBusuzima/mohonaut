'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../lib/motion';
import { useLowPower } from '../lib/power';
import { rigShape } from './rigs';

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

/**
 * The drill site at night (docs/01 §7): pads on wet graphite, each rig type drawn by rigs.ts in
 * safety orange while running (lamp lit, steam rising) and steel grey when switched off.
 * Decorative: the same facts are listed as text next to it.
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
        const shape = rigShape(pad.typeId, pad.running);
        const rig = new PIXI.Graphics();
        rig.position.set(p.x, p.y);
        for (const part of shape.parts) {
          if (part.kind === 'line') {
            rig.poly(part.points, false).stroke({
              color: part.color,
              width: part.width,
              cap: 'round',
              join: 'round',
            });
          } else if (part.kind === 'poly') {
            rig.poly(part.points).fill(part.fill);
          } else if (part.kind === 'rect') {
            rig.rect(part.x, part.y, part.w, part.h).fill(part.fill);
          } else {
            rig.circle(part.x, part.y, part.r).fill(part.fill);
          }
        }
        world.addChild(rig);
        if (pad.running) {
          const s = new PIXI.Graphics();
          s.circle(p.x, p.y + shape.steamY - 6, 5).fill({ color: 0xece7dc, alpha: 0.35 });
          world.addChild(s);
          steam.push({ g: s, phase: i * 0.7 });
        }
      });
      // Fit the whole site into the canvas (rigs, steam and all pads), up to 2.2x.
      const bounds = world.getLocalBounds();
      const centre = () => {
        const scale = Math.min(
          2.2,
          (app.screen.width * 0.9) / bounds.width,
          (app.screen.height * 0.85) / (bounds.height + 20),
        );
        world.scale.set(scale);
        world.x = app.screen.width / 2 - (bounds.x + bounds.width / 2) * scale;
        world.y = app.screen.height / 2 - (bounds.y + bounds.height / 2 - 6) * scale;
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
