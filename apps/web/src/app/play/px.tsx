'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef } from 'react';

/** Pixel-art UI parts for the full-screen game (styles in globals.css, `.px-*`). */

export function PxButton({
  variant = 'primary',
  className = '',
  busy = false,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'light' | 'dark';
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled === true || busy}
      aria-busy={busy || undefined}
      className={`px-btn px-btn-${variant} px-4 py-2 text-lg ${className}`}
    >
      {busy ? 'Working…' : children}
    </button>
  );
}

/**
 * A centred window over the world: a steel control panel with a hazard-striped head, the title
 * on the left in amber, an optional close button on the right.
 */
export function PxModal({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose?: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    if (onClose === undefined) return undefined;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-night/55 p-3">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`px-panel relative flex max-h-[92dvh] w-full flex-col font-pixel outline-none ${wide ? 'max-w-5xl' : 'max-w-md'}`}
      >
        <div aria-hidden="true" className="px-hazard mx-[5px] mt-[5px] h-3 shrink-0" />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b-[3px] border-[#0b0d10] px-5 py-3">
          <h2 className="text-2xl tracking-wider text-amber uppercase sm:text-3xl">{title}</h2>
          {onClose !== undefined && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="px-btn px-btn-light h-10 w-10 shrink-0 text-xl leading-none"
            >
              ×
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-5 pt-5 pb-6 sm:px-7">{children}</div>
      </div>
    </div>
  );
}

/** "1 Wallet — 2 Sign in — 3 Your site". */
export function Steps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="mb-4 flex items-center justify-center gap-1.5 text-sm sm:gap-2">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5 whitespace-nowrap sm:gap-2">
          {i > 0 && <span aria-hidden="true" className="h-0.5 w-3 bg-concrete sm:w-5" />}
          <span
            className={`grid h-6 w-6 place-items-center border-2 border-[#0b0d10] text-xs ${
              i < at ? 'bg-ok text-night' : i === at ? 'bg-orange text-night' : 'bg-steel text-bone'
            }`}
          >
            {i < at ? '✓' : i + 1}
          </span>
          <span className={i === at ? 'font-bold text-bone' : 'text-concrete'}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** A HUD readout: an icon, a small label and a big value. */
export function HudChip({
  icon,
  label,
  children,
  onClick,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  onClick?: () => void;
  accent?: boolean;
}) {
  const body = (
    <>
      <span className="hidden shrink-0 sm:block">{icon}</span>
      <span className="flex min-w-0 flex-col items-start leading-none">
        <span
          className={`text-[9px] tracking-widest uppercase md:text-[11px] ${accent ? '' : 'text-concrete'}`}
        >
          {label}
        </span>
        <span
          className={`num max-w-full truncate text-sm font-bold md:text-xl ${accent ? '' : 'text-cyan'}`}
        >
          {children}
        </span>
      </span>
    </>
  );
  // Instrument read-outs: cyan figures on a dark plate; the accent one is safety orange.
  const cls = `px-btn ${accent ? 'px-btn-primary' : 'px-btn-dark'} flex min-w-0 items-center gap-2 px-2 py-1.5 text-left md:px-3`;
  return onClick === undefined ? (
    <div className={cls}>{body}</div>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

/** Our own 12x12 pixel icons (crisp rectangles; no icon packs). */
const ICONS: Record<string, string[]> = {
  fuel: [
    '...######...',
    '..#oooooo#..',
    '.#oo####oo#.',
    '.#o######o#.',
    '.#o#yyyy#o#.',
    '.#o#yyyy#o#.',
    '.#o#yyyy#o#.',
    '.#o#yyyy#o#.',
    '.#o######o#.',
    '.#oooooooo#.',
    '..########..',
    '............',
  ],
  coin: [
    '...######...',
    '..#yyyyyy#..',
    '.#yy####yy#.',
    '#yy#yyyy#yy#',
    '#y#yy##yy#y#',
    '#y#y#yy#y#y#',
    '#y#y#yy#y#y#',
    '#y#yy##yy#y#',
    '#yy#yyyy#yy#',
    '.#yy####yy#.',
    '..#yyyyyy#..',
    '...######...',
  ],
  core: [
    '....####....',
    '...#cccc#...',
    '...#c##c#...',
    '...#cccc#...',
    '...#####....',
    '...#tttt#...',
    '...#tttt#...',
    '...######...',
    '...#oooo#...',
    '...#oooo#...',
    '...######...',
    '............',
  ],
  rig: [
    '.....##.....',
    '....#yy#....',
    '....####....',
    '....#..#....',
    '...#o..o#...',
    '...#oooo#...',
    '..#o....o#..',
    '..#oooooo#..',
    '.#o......o#.',
    '.#oooooooo#.',
    '############',
    '............',
  ],
  market: [
    '############',
    '#oooooooooo#',
    '#o#o#o#o#oo#',
    '#oooooooooo#',
    '#o#o#o#o#oo#',
    '#oooooooooo#',
    '#ooo####ooo#',
    '#ooo#bb#ooo#',
    '#ooo#bb#ooo#',
    '############',
    '............',
    '............',
  ],
  trophy: [
    '############',
    '#y#yyyyyy#y#',
    '#y#yyyyyy#y#',
    '.#yyyyyyyy#.',
    '..#yyyyyy#..',
    '...#yyyy#...',
    '....#yy#....',
    '....#yy#....',
    '...######...',
    '..#oooooo#..',
    '..########..',
    '............',
  ],
  crew: [
    '..###..###..',
    '.#bbb##bbb#.',
    '.#bbb##bbb#.',
    '..###..###..',
    '.#ooo##ooo#.',
    '#ooooo#oooo#',
    '#ooooo#oooo#',
    '############',
    '............',
    '............',
    '............',
    '............',
  ],
  lock: [
    '....####....',
    '...#bbbb#...',
    '..#b#..#b#..',
    '..#b#..#b#..',
    '..#b#..#b#..',
    '.##########.',
    '.#yyyyyyyy#.',
    '.#yyy##yyy#.',
    '.#yyy##yyy#.',
    '.#yyyyyyyy#.',
    '.##########.',
    '............',
  ],
  link: [
    '............',
    '.####..####.',
    '#oooo##oooo#',
    '#o##o##o##o#',
    '#o#..##..#o#',
    '#o##o##o##o#',
    '#oooo##oooo#',
    '.####..####.',
    '............',
    '............',
    '............',
    '............',
  ],
};
const ICON_COLORS: Record<string, string> = {
  '#': '#16191d',
  o: '#ff6b1a',
  y: '#ffb31a',
  c: '#2ee6d6',
  t: '#0d6e6a',
  b: '#ece7dc',
};

export function PxIcon({ name, size = 24 }: { name: keyof typeof ICONS; size?: number }) {
  const rows = ICONS[name] ?? [];
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      className="block"
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === '.' ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={ICON_COLORS[ch]} />
          ),
        ),
      )}
    </svg>
  );
}
