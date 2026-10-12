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

/** A centred window over the world: a title banner, content, an optional close button. */
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
        <div className="absolute -top-6 left-1/2 -translate-x-1/2">
          <h2 className="px-btn px-btn-primary whitespace-nowrap px-6 py-2 text-2xl uppercase sm:text-3xl">
            {title}
          </h2>
        </div>
        {onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="px-btn px-btn-light absolute -top-4 -right-4 h-10 w-10 text-xl"
          >
            ×
          </button>
        )}
        <div className="overflow-y-auto px-5 pt-10 pb-6 sm:px-8">{children}</div>
      </div>
    </div>
  );
}

/** "1 Wallet — 2 Sign in — 3 Your site". */
export function Steps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="mb-4 flex items-center justify-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden="true" className="h-0.5 w-5 bg-steel" />}
          <span
            className={`grid h-6 w-6 place-items-center border-2 border-charcoal text-xs ${
              i < at ? 'bg-ok text-night' : i === at ? 'bg-orange text-night' : 'bg-bone text-steel'
            }`}
          >
            {i < at ? '✓' : i + 1}
          </span>
          <span className={i === at ? 'font-bold' : 'text-steel'}>{s}</span>
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
        <span className="text-[9px] tracking-widest uppercase md:text-[11px]">{label}</span>
        <span className="num max-w-full truncate text-sm font-bold md:text-xl">{children}</span>
      </span>
    </>
  );
  const cls = `px-btn ${accent ? 'px-btn-primary' : 'px-btn-light'} flex min-w-0 items-center gap-2 px-2 py-1.5 text-left md:px-3`;
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
