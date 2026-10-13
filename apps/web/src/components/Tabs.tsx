'use client';

import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

/** WAI-ARIA tabs: arrow keys, Home and End move between tabs; only the active panel renders. */
export function Tabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  const [active, setActive] = useState(tabs[0]?.id ?? '');
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.id === active),
  );

  function onKey(e: KeyboardEvent) {
    const last = tabs.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : e.key === 'ArrowLeft'
          ? (index + last) % tabs.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    const tab = tabs[next];
    if (tab === undefined) return;
    setActive(tab.id);
    refs.current[next]?.focus();
  }

  const current = tabs[index];
  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKey}
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={i === index}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => setActive(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 font-condensed text-sm font-semibold tracking-wide whitespace-nowrap uppercase ${
              i === index
                ? 'border-orange text-fg'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current !== undefined && (
        <div
          role="tabpanel"
          id={`${base}-panel-${current.id}`}
          aria-labelledby={`${base}-tab-${current.id}`}
          tabIndex={0}
          className="flex flex-col gap-6 pt-6"
        >
          {current.content}
        </div>
      )}
    </div>
  );
}
