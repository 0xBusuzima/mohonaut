'use client';

import { sitePads } from '@mohonaut/sdk';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Address } from 'viem';
import { RigPicture } from '../../components/RigPicture';
import { ForemanMo } from '../../game/pixel/ForemanMo';
import { rigName } from '../../game/play';
import type { GameState } from '../../game/state';
import { levelPost, rigTypePost, xIntentUrl } from '../../social/share';
import { PxButton, PxModal } from './px';

/** What this device has already shown a wallet: its highest site level and the rig types run. */
export interface SiteMarks {
  level: number;
  types: number[];
}

export type Milestone = { kind: 'level'; level: number } | { kind: 'rig'; typeId: number };

const key = (address: string) => `mohonaut.milestones.${address.toLowerCase()}`;

function seenMarks(address: string): SiteMarks | null {
  try {
    const raw = window.localStorage.getItem(key(address));
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return null;
    const { level, types } = v as Record<string, unknown>;
    if (typeof level !== 'number' || !Array.isArray(types)) return null;
    return { level, types: types.filter((t): t is number => typeof t === 'number') };
  } catch {
    return null;
  }
}

function rememberMarks(address: string, marks: SiteMarks): void {
  try {
    window.localStorage.setItem(key(address), JSON.stringify(marks));
  } catch {
    // Storage blocked: the milestone may be shown again next time.
  }
}

/** The site as it stands: its level and the rig types it has on its pads. */
function marksOf(player: NonNullable<GameState['player']>, rigs: GameState['rigs']) {
  return { level: player.level, types: rigs.filter((r) => r.owned > 0).map((r) => r.id) };
}

/**
 * Milestones in `now` that `seen` has not shown (pure, for tests): the highest new site level,
 * then each rig type run for the first time. Level 1 and the Pilot Rig come with opening the
 * site, so they are not news.
 */
export function newMilestones(seen: SiteMarks, now: SiteMarks): Milestone[] {
  const out: Milestone[] = [];
  if (now.level > Math.max(seen.level, 1)) out.push({ kind: 'level', level: now.level });
  for (const t of now.types)
    if (t !== 0 && !seen.types.includes(t)) out.push({ kind: 'rig', typeId: t });
  return out;
}

const merge = (a: SiteMarks, m: Milestone): SiteMarks =>
  m.kind === 'level'
    ? { ...a, level: Math.max(a.level, m.level) }
    : { ...a, types: [...a.types, m.typeId] };

/**
 * A new site level or the first rig of a type since this device last looked: Foreman Mo says so
 * once, with a post to share (docs/05 §3.4). A first visit only notes the site as it stands.
 * Otherwise shows `children`.
 */
export function MilestoneNotice({
  address,
  state,
  children,
}: {
  address: Address;
  state: GameState;
  children?: ReactNode;
}) {
  const player = state.player;
  // A failed read shows less than the site holds; it is no snapshot to keep.
  const now =
    player === null || !player.registered || player.readFailed === true
      ? null
      : marksOf(player, state.rigs);
  const [seen, setSeen] = useState<SiteMarks | null>(() => seenMarks(address));
  // A first visit (nothing stored): the site as it stands is the starting point, not news.
  if (seen === null && now !== null) setSeen(now);
  useEffect(() => {
    if (seen !== null && seenMarks(address) === null) rememberMarks(address, seen);
  }, [address, seen]);
  const next = now === null || seen === null ? undefined : newMilestones(seen, now)[0];
  if (next === undefined) return <>{children}</>;
  const close = () => {
    const marks = merge(seenMarks(address) ?? (seen as SiteMarks), next);
    rememberMarks(address, marks);
    setSeen(merge(seen as SiteMarks, next));
  };
  const post =
    next.kind === 'level'
      ? levelPost({ level: next.level, pads: sitePads(next.level), address })
      : rigTypePost({ rig: rigName(next.typeId), address });
  const unlocked = next.kind === 'level' ? state.rigs.filter((r) => r.minLevel === next.level) : [];
  return (
    <PxModal
      title={next.kind === 'level' ? 'Site level up' : 'New rig on the pads'}
      onClose={close}
    >
      {next.kind === 'level' ? (
        <div className="flex items-center gap-4">
          <ForemanMo scale={3} label="Foreman Mo, waving from the shack" />
          <div>
            <p className="text-2xl text-amber">Level {next.level}</p>
            <p className="mt-2">
              The fence moved out: your site has {sitePads(next.level)} pads now.
            </p>
            {unlocked.length > 0 && (
              <p className="mt-2 text-cyan">
                New in the Market: {unlocked.map((r) => rigName(r.id)).join(', ')}.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div>
          <RigPicture id={next.typeId} name={rigName(next.typeId)} />
          <p className="mt-3 text-2xl text-amber">{rigName(next.typeId)}</p>
          <p className="mt-1">Your first one is on its pad. Mo says it sounds right.</p>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <PxButton className="grow" onClick={close}>
          Back to work
        </PxButton>
        <a
          href={xIntentUrl(post)}
          target="_blank"
          rel="noopener noreferrer"
          className="px-btn px-btn-dark px-4 py-2 text-lg"
        >
          Share on X
        </a>
      </div>
    </PxModal>
  );
}
