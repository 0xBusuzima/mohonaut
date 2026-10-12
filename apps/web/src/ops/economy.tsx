'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { Table } from '../components/Table';
import { GEN1_RIGS } from '../lib/catalog';
import { formatEth, formatMohn, formatUtc } from '../lib/format';
import { apiMessage, call } from '../social/api';

/** Operator economy views (docs/03 §5 modules 1, 8 and 10). Read-only. */

interface Hour {
  hour: number;
  newAccounts: number;
  emitted: string;
  spendBurn: string;
  feeBurn: string;
  buybackBurn: string;
  lpFeeBurn: string;
  recycled: string;
  buybackEth: string;
  revenueEth: string;
  fuelEth: string;
  machineSpend: string;
  siteSpend: string;
}
interface Economy {
  hours: Hour[];
  distribution: {
    day: number;
    kind: string;
    wallets: number;
    gini: number | null;
    nakamoto: number | null;
    top10Share: number | null;
  }[];
  cohorts: { cohortWeek: number; weeksAfter: number; active: number }[];
  sales: {
    time: number;
    account: string;
    typeId: number;
    qty: number;
    cost: string;
    avgUnitPriceWad: string | null;
  }[];
}
interface Day {
  date: string;
  emitted: string;
  burned: string;
  netEmission: string;
  revenueEth: string;
  sinkRatio: number | null;
  sinkRatio28d: number | null;
  rcr: number | null;
  activeAccounts: number;
  newAccounts: number;
}
interface Referrals {
  referred: number;
  referrers: {
    address: string;
    referrals: number;
    bonusPaid: string;
    refereesFuelEth: string;
    largestHourlyBurst: number;
    burst: boolean;
  }[];
}

const insight = {
  economy: () => call<Economy>('GET', '/admin/economy'),
  days: () => call<{ days: Day[] }>('GET', '/economy/daily?days=30'),
  referrals: () => call<Referrals>('GET', '/admin/referrals'),
};

/** Every MOHN burn of an hour, whatever its source. */
export function burnedIn(
  h: Pick<Hour, 'spendBurn' | 'feeBurn' | 'buybackBurn' | 'lpFeeBurn'>,
): bigint {
  return BigInt(h.spendBurn) + BigInt(h.feeBurn) + BigInt(h.buybackBurn) + BigInt(h.lpFeeBurn);
}

const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);
const ratio = (x: number | null) => (x === null ? '—' : x.toFixed(2));

/** Emission (orange) against burns (data blue) per hour, oldest left; decorative, table below. */
function FlowChart({ hours }: { hours: Hour[] }) {
  const rows = [...hours].reverse();
  const max = rows.reduce((m, h) => {
    const e = BigInt(h.emitted);
    const b = burnedIn(h);
    return e > m ? e : b > m ? b : m;
  }, 1n);
  const w = 8;
  const height = 80;
  const y = (v: bigint) => Number((v * BigInt(height)) / max);
  return (
    <svg
      viewBox={`0 0 ${rows.length * w * 2} ${height}`}
      className="h-24 w-full"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      {rows.map((h, i) => (
        <g key={h.hour}>
          <rect
            x={i * w * 2}
            y={height - y(BigInt(h.emitted))}
            width={w - 1}
            height={y(BigInt(h.emitted))}
            className="fill-orange"
          />
          <rect
            x={i * w * 2 + w}
            y={height - y(burnedIn(h))}
            width={w - 1}
            height={y(burnedIn(h))}
            className="fill-data"
          />
        </g>
      ))}
    </svg>
  );
}

export function EconomyScreen() {
  const e = useQuery({
    queryKey: ['ops', 'economy'],
    queryFn: insight.economy,
    refetchInterval: 300_000,
  });
  const d = useQuery({ queryKey: ['economy', 'days'], queryFn: insight.days });
  if (e.data === undefined)
    return <p role="status">{e.isError ? apiMessage(e.error) : 'Loading…'}</p>;
  const { hours, distribution, cohorts, sales } = e.data;
  const last24 = hours.slice(0, 24);
  const sum = (f: (h: Hour) => bigint) => last24.reduce((s, h) => s + f(h), 0n);
  const emitted = sum((h) => BigInt(h.emitted));
  const burned = sum(burnedIn);
  const revenue = sum((h) => BigInt(h.revenueEth));
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card label="Last 24 hours" title="Emitted">
          <p className="num text-2xl">{formatMohn(emitted, 0)}</p>
        </Card>
        <Card label="Last 24 hours" title="Burned">
          <p className="num text-2xl">{formatMohn(burned, 0)}</p>
          <p className="text-fg-muted">
            Sink ratio {emitted === 0n ? '—' : ratio(Number((burned * 10_000n) / emitted) / 10_000)}
          </p>
        </Card>
        <Card label="Last 24 hours" title="Revenue">
          <p className="num text-2xl">{formatEth(revenue)}</p>
          <p className="text-fg-muted">New sites {last24.reduce((s, h) => s + h.newAccounts, 0)}</p>
        </Card>
      </div>
      <Card label="Hourly" title="Emission against burns (48 h)">
        <FlowChart hours={hours} />
        <p className="text-sm text-fg-muted">
          Orange: emitted. Blue: burned (spend, fees, buybacks, LP fees).
        </p>
      </Card>
      <Card label="Daily" title="Last 30 days">
        {d.data === undefined ? (
          <p role="status">{d.isError ? apiMessage(d.error) : 'Loading…'}</p>
        ) : (
          <Table
            caption="Daily economy"
            rows={d.data.days}
            rowKey={(r) => r.date}
            columns={[
              { key: 'd', header: 'Day', render: (r) => r.date },
              {
                key: 'e',
                header: 'Emitted',
                numeric: true,
                render: (r) => formatMohn(BigInt(r.emitted), 0),
              },
              {
                key: 'b',
                header: 'Burned',
                numeric: true,
                render: (r) => formatMohn(BigInt(r.burned), 0),
              },
              {
                key: 'sr',
                header: 'SR / 28 d',
                numeric: true,
                render: (r) => `${ratio(r.sinkRatio)} / ${ratio(r.sinkRatio28d)}`,
              },
              { key: 'rcr', header: 'RCR', numeric: true, render: (r) => ratio(r.rcr) },
              {
                key: 'rev',
                header: 'Revenue',
                numeric: true,
                render: (r) => formatEth(BigInt(r.revenueEth)),
              },
              {
                key: 'a',
                header: 'Active / new',
                numeric: true,
                render: (r) => `${r.activeAccounts} / ${r.newAccounts}`,
              },
            ]}
          />
        )}
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card label="Distribution" title="Who holds what">
          <Table
            caption="Balance distribution, latest day"
            rows={distribution}
            rowKey={(r) => r.kind}
            empty="Not computed yet."
            columns={[
              {
                key: 'k',
                header: 'Of',
                render: (r) => (r.kind === 'dp' ? 'Drill Power' : '$MOHN'),
              },
              { key: 'h', header: 'Wallets', numeric: true, render: (r) => r.wallets },
              { key: 'g', header: 'Gini', numeric: true, render: (r) => ratio(r.gini) },
              { key: 't', header: 'Top 10', numeric: true, render: (r) => pct(r.top10Share) },
              { key: 'n', header: 'Nakamoto', numeric: true, render: (r) => r.nakamoto ?? '—' },
            ]}
          />
        </Card>
        <Card label="Cohorts" title="Weekly join cohorts">
          <Table
            caption="Active accounts by join week and weeks since"
            rows={cohorts.slice(0, 40)}
            rowKey={(r) => `${r.cohortWeek}-${r.weeksAfter}`}
            empty="No cohorts yet."
            columns={[
              {
                key: 'c',
                header: 'Joined (week of)',
                render: (r) => formatUtc(r.cohortWeek * 604_800).slice(0, 11),
              },
              { key: 'w', header: 'Week', numeric: true, render: (r) => `+${r.weeksAfter}` },
              { key: 'a', header: 'Active', numeric: true, render: (r) => r.active },
            ]}
          />
        </Card>
      </div>
      <Card label="Equipment Market" title="Recent sales">
        <Table
          caption="Recent rig sales"
          rows={sales}
          rowKey={(r) => `${r.time}-${r.account}-${r.typeId}`}
          empty="No sales yet."
          columns={[
            { key: 't', header: 'When', render: (r) => formatUtc(r.time) },
            {
              key: 'r',
              header: 'Rig',
              render: (r) => `${r.qty}× ${GEN1_RIGS[r.typeId]?.name ?? `type ${r.typeId}`}`,
            },
            {
              key: 'c',
              header: 'Cost',
              numeric: true,
              render: (r) => formatMohn(BigInt(r.cost), 0),
            },
            {
              key: 'u',
              header: 'Per DP unit',
              numeric: true,
              render: (r) =>
                r.avgUnitPriceWad === null ? '—' : formatMohn(BigInt(r.avgUnitPriceWad), 4),
            },
          ]}
        />
      </Card>
    </>
  );
}

export function ReferralsScreen() {
  const q = useQuery({ queryKey: ['ops', 'referrals'], queryFn: insight.referrals });
  if (q.data === undefined)
    return <p role="status">{q.isError ? apiMessage(q.error) : 'Loading…'}</p>;
  return (
    <Card label="Referrals" title={`${q.data.referred} players came through an invite`}>
      <Table
        caption="Largest referral trees"
        rows={q.data.referrers}
        rowKey={(r) => r.address}
        empty="No referrals yet."
        columns={[
          {
            key: 'a',
            header: 'Referrer',
            render: (r) => <span className="num break-all">{r.address}</span>,
          },
          { key: 'n', header: 'Referred', numeric: true, render: (r) => r.referrals },
          {
            key: 'f',
            header: 'Their diesel',
            numeric: true,
            render: (r) => formatEth(BigInt(r.refereesFuelEth)),
          },
          {
            key: 'e',
            header: 'Bonus paid',
            numeric: true,
            render: (r) => formatMohn(BigInt(r.bonusPaid)),
          },
          {
            key: 's',
            header: 'Signal',
            render: (r) =>
              r.burst ? (
                <Badge tone="warning">{`${r.largestHourlyBurst} in one hour`}</Badge>
              ) : (
                <span className="text-fg-muted">—</span>
              ),
          },
        ]}
      />
      <p className="mt-4 text-fg-muted">
        Signals are hints for a look in the player file, not verdicts. The on-chain referral bonus
        cannot be taken back; only off-chain rewards can be frozen.
      </p>
    </Card>
  );
}

export function SponsorshipScreen() {
  return (
    <Card label="Sponsored gas" title="Not used in v1">
      <p className="max-w-2xl">
        Players pay their own network fees in v1 (docs/03): there is no paymaster, no allow-list and
        no budget to watch. If sponsored gas is ever added, its policy (who, per-player cap, monthly
        budget) and spend chart belong here, funded only from operations revenue.
      </p>
    </Card>
  );
}
