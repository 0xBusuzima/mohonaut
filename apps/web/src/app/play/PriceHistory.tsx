'use client';

import { useQuery } from '@tanstack/react-query';
import { formatMohn } from '../../lib/format';
import { api, apiEnabled } from '../../social/api';
import type { DpPriceDay } from '../../social/api';

const BAR_W = 10;
const GAP = 4;
const H = 40;

/** Bars of the average paid per DP each day; a stub on days without sales. Pure, for tests. */
export function PriceBars({ days }: { days: readonly DpPriceDay[] }) {
  const prices = days.map((d) => (d.perDp === null ? null : BigInt(d.perDp)));
  const max = prices.reduce<bigint>((m, p) => (p !== null && p > m ? p : m), 0n);
  const summary = days
    .map((d, i) => {
      const p = prices[i];
      const today = i === days.length - 1 ? ' (today)' : '';
      return `${d.date.slice(5)}${today}: ${p === null || p === undefined ? 'no sales' : formatMohn(p)}`;
    })
    .join(', ');
  const w = days.length * (BAR_W + GAP) - GAP;
  return (
    <svg
      role="img"
      aria-label={`Average paid per DP, last ${days.length} days. ${summary}.`}
      width={w * 2}
      height={H * 2}
      viewBox={`0 0 ${w} ${H}`}
      shapeRendering="crispEdges"
      className="block"
    >
      <rect x={0} y={H - 1} width={w} height={1} fill="#59626c" />
      {prices.map((p, i) => {
        const x = i * (BAR_W + GAP);
        if (p === null || max === 0n)
          return <rect key={i} x={x} y={H - 3} width={BAR_W} height={2} fill="#59626c" />;
        const h = Math.max(2, Math.round((Number((p * 1000n) / max) / 1000) * (H - 2)));
        return (
          <rect
            key={i}
            x={x}
            y={H - 1 - h}
            width={BAR_W}
            height={h}
            fill={i === days.length - 1 ? '#2ee6d6' : '#1a9e97'}
          />
        );
      })}
    </svg>
  );
}

/** The market's transparency chart (docs/01 4.4): what DP cost each of the last 7 days. */
export function PriceHistory() {
  const q = useQuery({
    queryKey: ['market-prices'],
    queryFn: api.marketPrices,
    enabled: apiEnabled,
    // Fresh while the market is open: a sale shows up within half a minute.
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  });
  const days = q.data?.days;
  if (days === undefined || days.every((d) => d.perDp === null)) return null;
  return (
    <div className="mb-4 flex flex-wrap items-end justify-center gap-4">
      <PriceBars days={days} />
      <p className="max-w-56 text-sm text-concrete">
        Average paid per DP, last 7 days (today in cyan). The auction price falls while sales run
        behind its schedule and rises when they run ahead.
      </p>
    </div>
  );
}
