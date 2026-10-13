'use client';

import { useEffect, useState } from 'react';
import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { Table } from '../../components/Table';
import { formatDuration, formatMohn, formatUtc } from '../../lib/format';
import { API_URL, DEPLOYMENT, NETWORK } from '../../lib/site';
import type { DpPriceDay } from '../../social/api';

interface Day {
  day: number;
  date: string;
  emitted: string;
  burned: string;
  recycled: string;
  netEmission: string;
  buybackEth: string;
  revenueEth: string;
  sinkRatio: number | null;
  sinkRatio28d: number | null;
  rcr: number | null;
  newAccounts: number;
  activeAccounts: number;
}

interface Op {
  timelock: string;
  opId: string;
  target: string;
  fn: string | null;
  args: unknown[] | null;
  readyAt: number;
  executedAt: number | null;
  cancelledAt: number | null;
}

interface Data {
  world: { depth: { text: string }; stratum: { numeral: string; name: string } };
  days: Day[];
  queue: { pending: Op[]; recent: Op[] };
  /** Rig sales by day (GET /market/prices), oldest first. */
  prices: DpPriceDay[];
  at: Date;
}

const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);
const targetName = (address: string) =>
  Object.entries(DEPLOYMENT).find(
    ([, v]) => typeof v === 'string' && v.toLowerCase() === address.toLowerCase(),
  )?.[0] ?? address;

export function EconomyDashboard() {
  const [data, setData] = useState<Data | null | 'off'>(API_URL === '' ? 'off' : null);
  useEffect(() => {
    if (API_URL === '') return undefined;
    let live = true;
    const get = <T,>(path: string) =>
      fetch(`${API_URL}${path}`).then((r) => r.json() as Promise<T>);
    Promise.all([
      get<Data['world']>('/world'),
      get<{ days: Day[] }>('/economy/daily?days=30'),
      get<Data['queue']>('/governance/timelock'),
      get<{ days: DpPriceDay[] }>('/market/prices?days=7'),
    ])
      .then(([world, economy, queue, prices]) => {
        if (live)
          setData({ world, days: economy.days, queue, prices: prices.days, at: new Date() });
      })
      .catch(() => {
        if (live) setData('off');
      });
    return () => {
      live = false;
    };
  }, []);

  if (data === 'off' || data === null) {
    return (
      <p className="rounded-lg border border-line p-4 text-fg-muted">
        {data === null
          ? 'Reading the chain…'
          : 'Live numbers appear here when Season 0 runs on testnet.'}
      </p>
    );
  }
  const nowS = Math.floor(data.at.getTime() / 1000);
  const source = `Source: ${NETWORK.name} via the Mohonaut indexer · updated ${data.at.toISOString().slice(11, 16)} UTC`;
  return (
    <div className="flex flex-col gap-8">
      {NETWORK.testnet && <Badge tone="warning">Testnet: nothing here has value</Badge>}
      <Card label="Progress" title={`World Bore ${data.world.depth.text}`}>
        <p>
          Stratum {data.world.stratum.numeral} — {data.world.stratum.name}
        </p>
        <p className="mt-2 text-sm text-fg-muted">{source}</p>
      </Card>

      <section>
        <h2 className="font-display text-3xl font-black tracking-wide uppercase">Last 30 days</h2>
        <p className="mt-2 text-fg-muted">
          Sink ratio = (burned + returned to the reserve) ÷ emitted. Net emission = emitted −
          burned. Buyback coverage = $MOHN bought back ÷ $MOHN emitted. Every figure is in $MOHN;
          nothing is shown in USD.
        </p>
        <div className="mt-4">
          <Table
            caption="Daily economy"
            rowKey={(d) => String(d.day)}
            rows={data.days}
            columns={[
              { key: 'date', header: 'Day (UTC)', render: (d) => d.date },
              {
                key: 'emitted',
                header: 'Emitted',
                numeric: true,
                render: (d) => formatMohn(BigInt(d.emitted), 0),
              },
              {
                key: 'burned',
                header: 'Burned',
                numeric: true,
                render: (d) => formatMohn(BigInt(d.burned), 0),
              },
              {
                key: 'ne',
                header: 'Net emission',
                numeric: true,
                render: (d) => formatMohn(BigInt(d.netEmission), 0),
              },
              { key: 'sr', header: 'Sink ratio', numeric: true, render: (d) => pct(d.sinkRatio) },
              { key: 'sr28', header: 'SR 28 d', numeric: true, render: (d) => pct(d.sinkRatio28d) },
              { key: 'rcr', header: 'Buyback coverage', numeric: true, render: (d) => pct(d.rcr) },
              {
                key: 'active',
                header: 'Active sites',
                numeric: true,
                render: (d) => d.activeAccounts,
              },
            ]}
          />
        </div>
        <p className="mt-2 text-sm text-fg-muted">{source}</p>
      </section>

      <section id="market">
        <h2 className="font-display text-3xl font-black tracking-wide uppercase">
          Equipment market
        </h2>
        <p className="mt-2 text-fg-muted">
          What players paid per Drill Power each day, before tier premiums, from every rig sale on
          the chain. The auction price falls while sales run behind its schedule and rises when they
          run ahead; nobody sets it by hand.
        </p>
        <div className="mt-4">
          <Table
            caption="Rig sales, last 7 days"
            rowKey={(d) => String(d.day)}
            rows={[...data.prices].reverse()}
            columns={[
              { key: 'date', header: 'Day (UTC)', render: (d) => d.date },
              {
                key: 'perDp',
                header: 'Average per DP',
                numeric: true,
                render: (d) => (d.perDp === null ? '—' : formatMohn(BigInt(d.perDp))),
              },
              { key: 'dp', header: 'DP sold', numeric: true, render: (d) => d.dpSold },
              { key: 'sales', header: 'Sales', numeric: true, render: (d) => d.sales },
            ]}
          />
        </div>
        <p className="mt-2 text-sm text-fg-muted">{source}</p>
      </section>

      <section id="timelock">
        <h2 className="font-display text-3xl font-black tracking-wide uppercase">Timelock queue</h2>
        <p className="mt-2 text-fg-muted">
          Every adjustable setting waits 96 hours here before anyone can execute it; contract
          upgrades wait 7 days.
        </p>
        <div className="mt-4">
          <Table
            caption="Pending changes"
            empty="No pending changes."
            rowKey={(o) => o.opId}
            rows={data.queue.pending}
            columns={[
              {
                key: 'what',
                header: 'Change',
                render: (o) =>
                  `${targetName(o.target)}.${o.fn ?? 'call'}(${(o.args ?? []).join(', ')})`,
              },
              { key: 'via', header: 'Timelock', render: (o) => o.timelock },
              {
                key: 'ready',
                header: 'Executable',
                render: (o) =>
                  o.readyAt > nowS
                    ? `${formatUtc(o.readyAt)} (in ${formatDuration(o.readyAt - nowS)})`
                    : `since ${formatUtc(o.readyAt)}`,
              },
            ]}
          />
        </div>
        <p className="mt-2 text-sm text-fg-muted">{source}</p>
      </section>
    </div>
  );
}
