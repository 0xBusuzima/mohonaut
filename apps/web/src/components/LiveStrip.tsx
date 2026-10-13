'use client';

import { useEffect, useState } from 'react';
import { formatMohn } from '../lib/format';
import { API_URL, NETWORK } from '../lib/site';

interface World {
  depth: { mm: string; text: string };
  stratum: { numeral: string; name: string };
}

interface Day {
  date: string;
  emitted: string;
  burned: string;
  newAccounts: number;
  activeAccounts: number;
}

type State =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'ready'; world: World; day: Day | null; at: Date };

/**
 * The live numbers of the landing page (docs/05 §3.2 S2). Every tile names its source, period
 * and update time; nothing is shown in USD.
 */
export function LiveStrip() {
  const [state, setState] = useState<State>(API_URL === '' ? { kind: 'off' } : { kind: 'loading' });
  useEffect(() => {
    if (API_URL === '') return undefined;
    let live = true;
    Promise.all([
      fetch(`${API_URL}/world`).then((r) => r.json() as Promise<World>),
      fetch(`${API_URL}/economy/daily?days=1`).then((r) => r.json() as Promise<{ days: Day[] }>),
    ])
      .then(([world, economy]) => {
        if (live) setState({ kind: 'ready', world, day: economy.days[0] ?? null, at: new Date() });
      })
      .catch(() => {
        if (live) setState({ kind: 'off' });
      });
    return () => {
      live = false;
    };
  }, []);

  if (state.kind !== 'ready') {
    return (
      <p className="rounded-lg border border-line p-4 text-fg-muted">
        {state.kind === 'loading'
          ? 'Reading the chain…'
          : 'Live numbers appear here when Season 0 runs on testnet.'}
      </p>
    );
  }
  const updated = `${state.at.toISOString().slice(11, 16)} UTC`;
  const source = `Source: ${NETWORK.name} via the Mohonaut indexer`;
  const tiles = [
    {
      label: 'World Bore',
      value: state.world.depth.text,
      note: `Stratum ${state.world.stratum.numeral} — ${state.world.stratum.name}`,
    },
    ...(state.day === null
      ? []
      : [
          {
            label: 'Emission',
            value: formatMohn(BigInt(state.day.emitted), 0),
            note: state.day.date,
          },
          {
            label: 'Burned or returned',
            value: formatMohn(BigInt(state.day.burned), 0),
            note: state.day.date,
          },
          {
            label: 'Drill sites active',
            value: String(state.day.activeAccounts),
            note: state.day.date,
          },
        ]),
  ];
  return (
    <div>
      {NETWORK.testnet && (
        <p className="mb-2 font-stencil text-sm tracking-widest text-warn uppercase">Testnet</p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.label} className="rounded-lg border border-line bg-surface-raised p-4">
            <p className="font-condensed text-sm uppercase text-fg-muted">{t.label}</p>
            <p className="num mt-1 text-2xl text-data">{t.value}</p>
            <p className="mt-1 text-sm text-fg-muted">{t.note}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-fg-muted">
        {source} · updated {updated} ·{' '}
        <a href="/economy/" className="text-data underline">
          all numbers
        </a>
      </p>
    </div>
  );
}
