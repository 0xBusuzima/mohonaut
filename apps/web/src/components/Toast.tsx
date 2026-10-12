'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type ToastTone = 'info' | 'success' | 'warning' | 'alarm';

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  body?: string;
}

interface ToastItem extends Required<Pick<ToastInput, 'title'>> {
  id: number;
  tone: ToastTone;
  body: string | undefined;
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

const TONE: Record<ToastTone, string> = {
  info: 'border-line',
  success: 'border-good',
  warning: 'border-warn',
  alarm: 'border-bad',
};

/** Shows toasts in two live regions: alarms interrupt (assertive), the rest wait (polite). */
export function ToastProvider({
  children,
  timeoutMs = 6000,
}: {
  children: ReactNode;
  timeoutMs?: number;
}) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback(
    (id: number) => setItems((all) => all.filter((t) => t.id !== id)),
    [],
  );
  const push = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setItems((all) => [
        ...all.slice(-3),
        { id, tone: t.tone ?? 'info', title: t.title, body: t.body },
      ]);
      if (t.tone !== 'alarm') setTimeout(() => dismiss(id), timeoutMs); // alarms stay until closed
    },
    [dismiss, timeoutMs],
  );
  const regions = useMemo(
    () => [
      { live: 'assertive' as const, list: items.filter((t) => t.tone === 'alarm') },
      { live: 'polite' as const, list: items.filter((t) => t.tone !== 'alarm') },
    ],
    [items],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {regions.map((r) => (
          <div key={r.live} aria-live={r.live} className="flex w-full max-w-md flex-col gap-2">
            {r.list.map((t) => (
              <Toast key={t.id} item={t} onClose={() => dismiss(t.id)} />
            ))}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  return (
    <div
      role={item.tone === 'alarm' ? 'alert' : 'status'}
      className={`pointer-events-auto rounded-lg border-l-4 bg-surface-raised p-4 shadow-lg ${TONE[item.tone]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{item.title}</p>
          {item.body !== undefined && <p className="mt-1 text-fg-muted">{item.body}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="rounded px-2 text-fg-muted hover:text-fg"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function useToast(): (t: ToastInput) => void {
  const push = useContext(ToastContext);
  if (push === null) throw new Error('useToast needs a ToastProvider');
  return push;
}
