'use client';

import { useEffect, useState } from 'react';
import { api, apiEnabled } from '../social/api';
import type { Notice } from '../social/api';

const DISMISSED = 'mohonaut.dismissed';

function dismissed(): number[] {
  try {
    return JSON.parse(window.localStorage.getItem(DISMISSED) ?? '[]') as number[];
  } catch {
    return [];
  }
}

/**
 * Banners and maintenance notices from the operator panel (docs/03 §5 module 7), above the
 * page. In the flow, not floating: a floating notice would cover buttons. It only takes space
 * while a notice is live, and each can be dismissed.
 */
export function AnnouncementBar() {
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    if (!apiEnabled) return undefined;
    let live = true;
    api
      .announcements(true)
      .then((r) => {
        const hidden = new Set(dismissed());
        if (live) setNotices(r.active.filter((n) => !hidden.has(n.id)));
      })
      .catch(() => undefined); // no banner when the API is down
    return () => {
      live = false;
    };
  }, []);
  const n = notices[0];
  if (n === undefined) return null;
  return (
    <aside
      aria-label="Announcement"
      className={`border-b-2 bg-surface-raised px-4 py-2 ${n.kind === 'maintenance' ? 'border-warn' : 'border-data'}`}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-condensed text-sm tracking-wide text-fg-muted uppercase">
          {n.kind === 'maintenance' ? 'Maintenance' : 'Notice'}
        </p>
        <p className="font-semibold">{n.title}</p>
        {n.body !== '' && <p className="text-sm">{n.body}</p>}
        <button
          type="button"
          className="ml-auto text-sm text-data underline"
          onClick={() => {
            try {
              const next = [...dismissed(), n.id].slice(-50);
              window.localStorage.setItem(DISMISSED, JSON.stringify(next));
            } catch {
              // not remembered; hidden for this page view
            }
            setNotices((all) => all.slice(1));
          }}
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}
