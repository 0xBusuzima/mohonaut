'use client';

import { useEffect, useState } from 'react';
import { MINING_CORE, RPC_URL, isTestnet } from '../../game/chain-id';
import { readChainStatus, statusRows } from '../../game/chain-status';
import type { ChainStatus } from '../../game/chain-status';
import { useNow } from '../../lib/clock';
import { formatUtc } from '../../lib/format';

/** The game's own state, read from the chain every 30 s (our servers are not involved). */
export function ChainStatusBoard() {
  const [status, setStatus] = useState<{ read: ChainStatus; at: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const read = () =>
      readChainStatus(RPC_URL, MINING_CORE)
        .then((s) => {
          if (!live) return;
          setStatus({ read: s, at: Math.floor(Date.now() / 1000) });
          setFailed(false);
        })
        .catch(() => {
          if (live) setFailed(true);
        });
    void read();
    const id = window.setInterval(() => void read(), 30_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  const nowMs = useNow(30_000);
  const rows =
    status === null || nowMs === null
      ? []
      : statusRows(status.read, Math.floor(nowMs / 1000), formatUtc);
  return (
    <section aria-labelledby="chain-status" className="mt-8">
      <h2 id="chain-status" className="font-display text-3xl font-black tracking-wide uppercase">
        On the chain{isTestnet ? ' (testnet)' : ''}
      </h2>
      <p className="mt-2 text-fg-muted">
        Read in your browser straight from the public RPC, so it still works if our servers do not.
      </p>
      {failed && (
        <p role="status" className="mt-4 text-warn">
          Can&apos;t reach the chain&apos;s RPC from here right now. Trying again every 30 seconds.
          {status !== null && ` What follows is the last good read, at ${formatUtc(status.at)}.`}
        </p>
      )}
      {status === null ? (
        !failed && (
          <p role="status" className="mt-4 text-fg-muted">
            Reading the chain…
          </p>
        )
      ) : (
        <dl className="mt-4 grid max-w-3xl grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className="font-semibold">
                <span aria-hidden="true" className={r.ok ? 'text-good' : 'text-warn'}>
                  {r.ok ? '●' : '▲'}
                </span>{' '}
                {r.label}
              </dt>
              <dd className={r.ok ? '' : 'text-warn'}>
                <span className="sr-only">{r.ok ? 'OK. ' : 'Attention. '}</span>
                {r.text}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
