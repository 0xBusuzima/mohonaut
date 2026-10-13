'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef } from 'react';

export { PxIcon } from '../../game/pixel/icons';

/** Pixel-art UI parts for the full-screen game (styles in globals.css, `.px-*`). */

/** Marks the page as the game while mounted (toasts and other page-wide styles follow). */
export function usePixelGame(): void {
  useEffect(() => {
    document.body.classList.add('pixel-game');
    return () => document.body.classList.remove('pixel-game');
  }, []);
}

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
  // The latest close handler, so a parent re-render (the state refreshes every few seconds)
  // neither re-binds the keys nor pulls focus out of a field being typed in.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const el = ref.current;
    el?.focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current?.();
      if (e.key !== 'Tab' || el === null) return;
      // Keep Tab inside the window.
      const items = [
        ...el.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]',
        ),
      ];
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) return;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, []);
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

/** A block inside a window: a small amber label, a title, optional actions on the right. */
export function PxSection({
  label,
  title,
  actions,
  children,
}: {
  label?: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-dark flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {label !== undefined && (
            <p className="text-xs tracking-widest text-amber uppercase">{label}</p>
          )}
          <h3 className="text-xl text-bone">{title}</h3>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A small stamped tag: "Captain", "Ranked", "1 of 5 to rank". */
export function PxTag({
  tone = 'plain',
  children,
}: {
  tone?: 'plain' | 'ok' | 'data';
  children: ReactNode;
}) {
  const cls =
    tone === 'ok'
      ? 'bg-ok text-night'
      : tone === 'data'
        ? 'bg-cyan text-night'
        : 'bg-steel text-bone';
  return (
    <span className={`inline-block px-1.5 py-0.5 text-xs font-bold uppercase ${cls}`}>
      {children}
    </span>
  );
}

interface PxColumn<Row> {
  key: string;
  header: string;
  numeric?: boolean;
  render: (row: Row) => ReactNode;
}

/** A plain data table in the instrument style (caption for screen readers, scoped headers). */
export function PxTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  empty = 'Nothing yet.',
}: {
  caption: string;
  columns: PxColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  empty?: string;
}) {
  return (
    // Focusable so keyboard users can scroll wide tables (axe: scrollable-region-focusable).
    <div tabIndex={0} className="px-inset overflow-x-auto">
      <table className="w-full border-collapse text-left text-base">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b-[3px] border-[#0b0d10]">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-3 py-2 text-xs tracking-widest text-concrete uppercase ${c.numeric === true ? 'text-right' : ''}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-4 text-center text-concrete">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-[#262c33]">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-1.5 ${c.numeric === true ? 'text-right text-cyan' : ''}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
