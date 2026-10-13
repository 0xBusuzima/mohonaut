'use client';

import { useEffect, useRef, useState } from 'react';
import { reportError } from '../../lib/errors';
import { useReducedMotion } from '../../lib/motion';
import { useLowPower } from '../../lib/power';
import { siteEffects } from './fx';
import { drawWorld, siteRows, worldSize } from './world';
import type { Hit, HitBox, WorldFx, WorldModel } from './world';

/** Pointer travel (CSS px) after which a press is a drag, not a click. */
const DRAG_PX = 6;

/**
 * The full-screen pixel world: a low-resolution canvas scaled up by a whole number with
 * `image-rendering: pixelated`, redrawn about 12 times a second (once when motion is reduced).
 * Clicking a building or a pad calls `onSelect`. Where the site is larger than the screen (phones)
 * it can be dragged around. `contained`: fills its positioned parent instead of the screen, and
 * leaves touch scrolling to the page (no dragging).
 */
export function PixelWorld({
  model,
  onSelect,
  label,
  describe,
  contained = false,
}: {
  model: Omit<WorldModel, 'hover' | 'motion' | 'pan' | 'fx'>;
  onSelect?: ((hit: Hit) => void) | undefined;
  label: string;
  /** A short name for what the pointer is over, shown above it ("Diesel tank"). */
  describe?: ((hit: Hit) => string | null) | undefined;
  contained?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hits = useRef<HitBox[]>([]);
  const press = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverBox, setHoverBox] = useState<HitBox | null>(null);
  const hover = hoverBox?.id ?? null;
  const [size, setSize] = useState({ w: 640, h: 360, scale: 3, maxX: 0, maxY: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const reduced = useReducedMotion();
  const lowPower = useLowPower();
  const motion = !reduced && !lowPower;
  const rows = siteRows(model.pads.length);
  const fx = useRef<WorldFx[]>([]);
  const before = useRef<Omit<WorldModel, 'hover' | 'motion' | 'pan' | 'fx'> | null>(null);

  // One-off effects when the site changes (fx.ts): a rig drops in, diesel arrives, pads open.
  // An empty site (not opened yet, or no chain reading) is not remembered, so the rigs do not
  // drop in again when the chain answers after an outage. A still scene plays no effects.
  useEffect(() => {
    if (model.pads.length === 0) return;
    const was = before.current;
    before.current = model;
    if (was === null || !motion) return;
    const now = performance.now() / 1000;
    fx.current = [...fx.current.filter((f) => now - f.at < 3), ...siteEffects(was, model, now)];
  }, [model, motion]);

  useEffect(() => {
    const box = contained ? canvas.current?.parentElement : null;
    const fit = () => {
      const vw = box?.clientWidth ?? window.innerWidth;
      const vh = box?.clientHeight ?? window.innerHeight;
      // The nearest whole-number scale at which the site fills the screen; phones get at least
      // 2x so rigs stay readable, and the part that does not fit is reached by dragging.
      const world = worldSize(rows);
      const fitScale = Math.round(Math.min(vw / world.w, vh / world.h));
      const scale = Math.max(vw < 768 ? 2 : 1, fitScale);
      const w = Math.ceil(vw / scale);
      const h = Math.ceil(vh / scale);
      setSize({
        w,
        h,
        scale,
        maxX: Math.max(0, Math.ceil((world.w - w) / 2)),
        maxY: Math.max(0, Math.ceil((world.h - h) / 2)),
      });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [rows, contained]);

  // The camera stays inside the site, also when the screen or the site changes size.
  const clampX = (x: number) => Math.max(-size.maxX, Math.min(size.maxX, Math.round(x)));
  const clampY = (y: number) => Math.max(-size.maxY, Math.min(size.maxY, Math.round(y)));
  const vx = clampX(pan.x);
  const vy = clampY(pan.y);
  const canPan = !contained && (size.maxX > 0 || size.maxY > 0);

  // Set by a drawing error: the scene stays stopped (and reported once) for this mount.
  const broken = useRef(false);
  useEffect(() => {
    const el = canvas.current;
    const c = el?.getContext('2d');
    if (el === null || c === null || c === undefined) return undefined;
    c.imageSmoothingEnabled = false;
    let frame = 0;
    let last = 0;
    const draw = (now: number) => {
      if (broken.current) return;
      try {
        hits.current = drawWorld(c, size.w, size.h, now / 1000, {
          ...model,
          hover,
          motion,
          pan: { x: vx, y: vy },
          fx: fx.current,
        });
      } catch (err) {
        // A drawing bug stops the scene (once, reported), not the game around it.
        broken.current = true;
        reportError(err);
      }
    };
    if (!motion) {
      draw(0);
      return undefined;
    }
    draw(performance.now());
    const loop = (now: number) => {
      // 10 frames a second: plenty for pixel art, and kind to phone batteries (the margin lets
      // a 60 Hz display hit every sixth frame).
      if (now - last >= 95) {
        last = now;
        draw(now);
      }
      if (!broken.current) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [size, model, hover, motion, vx, vy]);

  const hitAt = (clientX: number, clientY: number): HitBox | null => {
    const at = canvas.current?.getBoundingClientRect();
    const x = (clientX - (at?.left ?? 0)) / size.scale;
    const y = (clientY - (at?.top ?? 0)) / size.scale;
    let best: HitBox | null = null;
    for (const h of hits.current) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        if (best === null || h.w * h.h < best.w * best.h) best = h;
      }
    }
    return best;
  };

  let cursor = 'default';
  if (dragging) cursor = 'grabbing';
  else if (hover !== null && onSelect !== undefined) cursor = 'pointer';
  else if (canPan) cursor = 'grab';

  const tip = hoverBox !== null && describe !== undefined ? describe(hoverBox.id) : null;

  return (
    <>
      <canvas
        ref={canvas}
        width={size.w}
        height={size.h}
        role="img"
        aria-label={label}
        className={`pixel-canvas ${contained ? 'absolute inset-0' : 'fixed inset-0 h-dvh w-screen touch-none'}`}
        style={{ width: size.w * size.scale, height: size.h * size.scale, cursor }}
        onPointerDown={(e) => {
          if (!canPan) return;
          press.current = { x: e.clientX, y: e.clientY, px: vx, py: vy };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (p !== null && canPan) {
            const dx = e.clientX - p.x;
            const dy = e.clientY - p.y;
            if (dragging || Math.hypot(dx, dy) > DRAG_PX) {
              setDragging(true);
              setPan({ x: clampX(p.px + dx / size.scale), y: clampY(p.py + dy / size.scale) });
              return;
            }
          }
          setHoverBox(onSelect === undefined ? null : hitAt(e.clientX, e.clientY));
        }}
        onPointerUp={(e) => {
          press.current = null;
          if (dragging) {
            setDragging(false);
            return;
          }
          const h = hitAt(e.clientX, e.clientY);
          if (h !== null) onSelect?.(h.id);
        }}
        onPointerCancel={() => {
          press.current = null;
          setDragging(false);
        }}
        onPointerLeave={() => setHoverBox(null)}
      />
      {tip !== null && hoverBox !== null && (
        <div
          aria-hidden="true"
          className={`px-dark pointer-events-none z-10 -translate-x-1/2 -translate-y-full px-2 py-0.5 font-pixel text-sm whitespace-nowrap text-amber ${contained ? 'absolute' : 'fixed'}`}
          style={{
            left: (hoverBox.x + hoverBox.w / 2) * size.scale,
            top: hoverBox.y * size.scale - 4,
          }}
        >
          {tip}
        </div>
      )}
    </>
  );
}
