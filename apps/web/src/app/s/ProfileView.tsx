'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { isAddress } from 'viem';
import type { Address } from 'viem';
import { Card } from '../../components/Card';
import { BadgeShelf } from '../../game/BadgeShelf';
import { FIND_SETS } from '../../game/finds';
import { PlaqueList } from '../../game/PlaqueList';
import { GEN1_RIGS } from '../../lib/catalog';
import { api, apiEnabled, apiMessage } from '../../social/api';
import type { Profile } from '../../social/api';
import { shortAddress } from '../../social/share';

/** The address in /s/<address> (Cloudflare serves this page for every /s/* path). */
export function addressFromPath(path: string): Address | null {
  const part = path.split('/').filter(Boolean)[1] ?? '';
  return isAddress(part, { strict: false }) ? (part as Address) : null;
}

/** The pixel site loads after the profile (it is the heaviest part of the page). */
const SiteView = dynamic(() => import('./SiteView').then((m) => m.SiteView), { ssr: false });

type View =
  { kind: 'loading' } | { kind: 'error'; text: string } | { kind: 'ok'; profile: Profile };

/** A public drill site: no wallet needed (docs/01 §4.10). */
const noSubscribe = () => () => {};

export function ProfileView() {
  // The page is static and the address lives in the URL; null while prerendering.
  const path = useSyncExternalStore(
    noSubscribe,
    () => window.location.pathname,
    () => null,
  );
  const address = path === null ? undefined : addressFromPath(path);
  const [view, setView] = useState<View>({ kind: 'loading' });

  useEffect(() => {
    if (address === undefined || address === null || !apiEnabled) return;
    api
      .profile(address)
      .then((profile) => setView({ kind: 'ok', profile }))
      .catch((err: unknown) => setView({ kind: 'error', text: apiMessage(err) }));
  }, [address]);

  if (address === undefined) return <p role="status">Loading…</p>;
  if (address === null) {
    return (
      <>
        <h1 className="font-display text-5xl font-black tracking-wide uppercase">Drill site</h1>
        <p className="mt-4">This link has no valid wallet address in it.</p>
      </>
    );
  }
  const name =
    view.kind === 'ok' && view.profile.displayName !== null
      ? view.profile.displayName
      : shortAddress(address);
  return (
    <>
      <h1 className="font-display text-5xl font-black tracking-wide break-words uppercase">
        {name}
      </h1>
      <p className="num mt-2 text-sm break-all text-fg-muted">{address}</p>
      {!apiEnabled && (
        <p className="mt-6">Live profiles appear once the game server is connected.</p>
      )}
      {view.kind === 'loading' && apiEnabled && (
        <p role="status" className="mt-6">
          Reading the site…
        </p>
      )}
      {view.kind === 'error' && <p className="mt-6">{view.text}</p>}
      {view.kind === 'ok' && <Site profile={view.profile} />}
      <Card className="mt-8" title="Open your own drill site">
        <p>
          Your first diesel purchase opens a site with a free Pilot Rig. Join the race to the Moho.
        </p>
        <a
          href={`/play/?ref=${address}`}
          className="mt-4 inline-flex h-11 items-center rounded-md bg-orange px-5 font-condensed font-semibold tracking-wide text-night uppercase"
        >
          Start drilling
        </a>
      </Card>
    </>
  );
}

function Site({ profile: p }: { profile: Profile }) {
  const rigs = p.rigs.filter((r) => r.owned !== '0');
  return (
    <div className="mt-6 flex flex-col gap-6">
      {(p.titles ?? []).length > 0 && (
        <p className="font-condensed text-lg tracking-wide text-amber uppercase">
          {(p.titles ?? []).join(' · ')}
        </p>
      )}
      <p className="text-lg">
        {p.registered ? (
          <>
            Has cored <strong>{p.contribution.text}</strong> of the World Bore
            {p.crew !== null && (
              <>
                {' '}
                with Crew {p.crew.name} [{p.crew.tag}]
              </>
            )}
            .
          </>
        ) : (
          'Has not opened a drill site yet.'
        )}
      </p>
      {p.registered && <SiteView profile={p} />}
      {p.registered && (
        <Card label="Drill site" title={`Site L${p.siteLevel}`}>
          <ul className="flex flex-col gap-1">
            {rigs.map((r) => (
              <li key={r.typeId}>
                {GEN1_RIGS[r.typeId]?.name ?? `Rig type ${r.typeId}`}{' '}
                <span className="num text-fg-muted">× {r.owned}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {p.badges.length > 0 && (
        <Card label="Badges" title="Badges">
          <BadgeShelf awarded={p.badges.map((b) => b.id)} />
        </Card>
      )}
      {(p.plaques ?? []).length > 0 && (
        <Card label="Seasons" title="Season plaques">
          <PlaqueList plaques={p.plaques ?? []} />
        </Card>
      )}
      <Card label="Core Collection" title="Collection">
        <p>
          <span className="num">{p.collection.finds}</span> finds
          {p.collection.completedSets.length > 0 && (
            <>
              , complete sets:{' '}
              {p.collection.completedSets
                .map((id) => FIND_SETS.find((s) => s.id === id)?.name ?? id)
                .join(', ')}
            </>
          )}
          .
        </p>
      </Card>
    </div>
  );
}
