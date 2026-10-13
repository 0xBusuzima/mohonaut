'use client';

import { PLAQUE_ART, PLAQUE_PALETTES, plaqueTier } from '@mohonaut/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Address } from 'viem';
import { PxButton, PxSection, PxTable, PxTag } from '../app/play/px';
import { useToast } from '../components/Toast';
import { BadgeShelf } from '../game/BadgeShelf';
import { PlaqueList } from '../game/PlaqueList';
import { FIND_PALETTE, FIND_SETS } from '../game/finds';
import { PixelSvg } from '../game/pixel/PixelSvg';
import { useSignIn } from '../game/signin';
import { formatUtc } from '../lib/format';
import { NOTIFY_EVENTS, api, apiMessage } from './api';
import type { Collection, ContributionRow, Me, NotifyEvent, Prefs } from './api';
import { ME_KEY, useMe } from './session';
import { contributionPost, findPost, profileUrl, shortAddress, xIntentUrl } from './share';

/**
 * The game's off-chain windows: crews, the daily Survey, seasons and the all-time board, the
 * profile with invite link and alerts. Drawn with the game's pixel parts (`app/play/px`).
 */

const CREW_MIN = 5;
const CREW_MAX = 25;
const DAY_S = 86_400;

const EVENT_LABELS: Record<NotifyEvent, string> = {
  'fuel-low': 'My tank is running low',
  'refine-ready': 'A refine is ready to collect',
  stratum: 'The World Bore enters a new stratum',
  season: 'Season start and end',
  announcements: 'Game announcements',
};

const FIND_ICON = new Map(FIND_SETS.flatMap((s) => s.items.map((i) => [i.id, i.icon] as const)));

const INPUT = 'px-input mt-1 block w-full px-3 py-2 text-base';
const HINT = 'text-sm text-concrete';

/** Runs an API write with a busy flag and a toast for the outcome. */
function useWrite() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function write(key: string, fn: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(key);
    try {
      await fn();
      toast({ tone: 'success', title: done });
      return true;
    } catch (err) {
      toast({ tone: 'warning', title: 'Not done', body: apiMessage(err) });
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { write, busy };
}

function Status({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-concrete">
      {children}
    </p>
  );
}

/** Wraps the off-chain features: they need a SIWE session. */
export function SignedIn({ children }: { children: (me: Me) => ReactNode }) {
  const { me, loading } = useMe();
  const login = useSignIn();
  if (loading) return <Status>Checking your session…</Status>;
  if (me === null) {
    return (
      <PxSection title="Sign in">
        <p>
          Crews, the Survey, your profile name and alerts live off-chain. Sign a message with your
          wallet to use them. The signature only logs you in; it cannot move funds.
        </p>
        <PxButton className="self-start" busy={login.busy} onClick={() => void login.signIn()}>
          Sign in
        </PxButton>
        {login.error !== null && <p className="text-sm text-[#ff7a6e]">{login.error}</p>}
      </PxSection>
    );
  }
  return <>{children(me)}</>;
}

// ------------------------------------------------------------------ crew

export function CrewPanel({ me }: { me: Me }) {
  return me.crewId === null ? <FindCrew /> : <MyCrew id={me.crewId} />;
}

function MyCrew({ id }: { id: number }) {
  const client = useQueryClient();
  const crew = useQuery({ queryKey: ['crew', id], queryFn: () => api.crew(id) });
  const { write, busy } = useWrite();
  if (crew.data === undefined)
    return <Status>{crew.isError ? apiMessage(crew.error) : 'Loading your crew…'}</Status>;
  const c = crew.data;
  return (
    <PxSection
      label="Crew"
      title={`${c.name} [${c.tag}]`}
      actions={
        c.ranked ? (
          <PxTag tone="ok">Ranked</PxTag>
        ) : (
          <PxTag>{`${c.members.length} of ${CREW_MIN} to rank`}</PxTag>
        )
      }
    >
      <p>
        Together you have cored <span className="text-cyan">{c.contribution.text}</span> of the
        World Bore. Crews are social only: no shared Drill Power, no shared rewards.
      </p>
      <PxTable
        caption={`Members of ${c.name}`}
        rows={c.members}
        rowKey={(m) => m.wallet ?? m.displayName ?? 'member'}
        columns={[
          {
            key: 'name',
            header: 'Member',
            render: (m) => (
              <>
                {m.displayName ?? shortAddress(m.wallet)}{' '}
                {m.captain && <PxTag tone="data">Captain</PxTag>}
              </>
            ),
          },
          { key: 'c', header: 'Cored', numeric: true, render: (m) => m.contribution.text },
        ]}
      />
      <PxButton
        variant="light"
        className="self-start"
        busy={busy === 'leave'}
        onClick={async () => {
          if (await write('leave', api.leaveCrew, `You left ${c.name}`))
            await client.invalidateQueries({ queryKey: ME_KEY });
          await client.invalidateQueries({ queryKey: ['profile'] }); // the crew flag
        }}
      >
        Leave crew
      </PxButton>
    </PxSection>
  );
}

function FindCrew() {
  const client = useQueryClient();
  const crews = useQuery({ queryKey: ['crews'], queryFn: api.crews });
  const { write, busy } = useWrite();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');

  async function create(e: FormEvent) {
    e.preventDefault();
    if (await write('create', () => api.createCrew(name, tag), `Crew ${name} created`)) {
      await client.invalidateQueries({ queryKey: ME_KEY });
      await client.invalidateQueries({ queryKey: ['profile'] }); // the crew flag
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PxSection label="Crew" title="Start a crew">
        <p className={HINT}>
          {CREW_MIN} to {CREW_MAX} players. A crew ranks once it has {CREW_MIN} members. Crews never
          pool Drill Power or rewards.
        </p>
        <form
          onSubmit={(e) => void create(e)}
          className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end"
        >
          <label className="block">
            <span className={HINT}>Name (3 to 24 letters, digits, spaces, - or _)</span>
            <input
              required
              pattern="[A-Za-z0-9][A-Za-z0-9 _\-]{2,23}"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className="block">
            <span className={HINT}>Tag (3 to 5)</span>
            <input
              required
              pattern="[A-Za-z0-9]{3,5}"
              value={tag}
              onChange={(e) => setTag(e.target.value.toUpperCase())}
              className={`${INPUT} uppercase`}
            />
          </label>
          <PxButton type="submit" busy={busy === 'create'}>
            Create
          </PxButton>
        </form>
      </PxSection>
      <PxSection label="Crews" title="Join a crew">
        {crews.data === undefined ? (
          <Status>{crews.isError ? apiMessage(crews.error) : 'Loading crews…'}</Status>
        ) : (
          <PxTable
            caption="Crews by World Bore contribution"
            rows={crews.data.rows}
            rowKey={(r) => String(r.id)}
            empty="No crews yet. Start the first one."
            columns={[
              { key: 'rank', header: 'Rank', numeric: true, render: (r) => r.rank ?? '—' },
              { key: 'name', header: 'Crew', render: (r) => `${r.name} [${r.tag}]` },
              {
                key: 'members',
                header: 'Members',
                numeric: true,
                render: (r) => `${r.members} / ${CREW_MAX}`,
              },
              { key: 'c', header: 'Cored', numeric: true, render: (r) => r.contribution.text },
              {
                key: 'join',
                header: 'Join',
                render: (r) => (
                  <PxButton
                    variant="light"
                    className="!px-2 !py-1 !text-sm"
                    disabled={r.members >= CREW_MAX}
                    busy={busy === `join-${r.id}`}
                    aria-label={`Join ${r.name}`}
                    onClick={async () => {
                      if (
                        await write(
                          `join-${r.id}`,
                          () => api.joinCrew(r.id),
                          `Welcome to ${r.name}`,
                        )
                      ) {
                        await client.invalidateQueries({ queryKey: ME_KEY });
                        await client.invalidateQueries({ queryKey: ['profile'] }); // the crew flag
                      }
                    }}
                  >
                    Join
                  </PxButton>
                ),
              },
            ]}
          />
        )}
      </PxSection>
    </div>
  );
}

// ------------------------------------------------------------------ survey

export function SurveyPanel({ now, address }: { now: number; address: Address }) {
  const client = useQueryClient();
  const collection = useQuery({ queryKey: ['collection'], queryFn: api.collection });
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ text: string; id: string; name: string } | null>(null);
  const today = Math.floor(now / DAY_S);
  const doneToday = collection.data?.finds.some((f) => f.day === today) ?? false;

  async function survey() {
    setBusy(true);
    try {
      const r = await api.survey();
      setLast({
        text: r.isNew ? `You found: ${r.find.name}` : `Today's find was: ${r.find.name}`,
        id: r.find.id,
        name: r.find.name,
      });
      await client.invalidateQueries({ queryKey: ['collection'] });
      // A completed set adds its decor to the site.
      await client.invalidateQueries({ queryKey: ['profile'] });
    } catch (err) {
      toast({ tone: 'warning', title: 'Not done', body: apiMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PxSection label="Survey" title="Today's survey">
        <p className={HINT}>
          One free survey per day turns up a core sample, fossil or old drilling part for your
          collection. Finds are cosmetic: they cannot be bought or sold and change nothing in the
          economy.
        </p>
        {last !== null && (
          <div className="flex items-center gap-3">
            {FIND_ICON.get(last.id) !== undefined && (
              <PixelSvg rows={FIND_ICON.get(last.id) ?? []} palette={FIND_PALETTE} size={48} />
            )}
            <p role="status" className="text-lg text-amber">
              {last.text}
            </p>
            <a
              href={xIntentUrl(findPost({ find: last.name, address }))}
              target="_blank"
              rel="noopener noreferrer"
              className="px-btn px-btn-dark ml-auto px-3 py-1 text-base"
            >
              Share on X
            </a>
          </div>
        )}
        <PxButton
          className="self-start"
          busy={busy}
          disabled={doneToday}
          onClick={() => void survey()}
        >
          {doneToday ? 'Surveyed today' : 'Survey'}
        </PxButton>
        {doneToday && <p className={HINT}>Next survey from {formatUtc((today + 1) * DAY_S)}.</p>}
      </PxSection>
      <PxSection label="Core Collection" title="Your sets">
        {collection.data === undefined ? (
          <Status>{collection.isError ? apiMessage(collection.error) : 'Loading…'}</Status>
        ) : (
          <CollectionBoard collection={collection.data} />
        )}
      </PxSection>
    </div>
  );
}

/** The four sets as shelves of six: found finds in colour, the rest as dark outlines. */
function CollectionBoard({ collection }: { collection: Collection }) {
  const found = new Set(collection.finds.map((f) => f.itemId));
  return (
    <div className="flex flex-col gap-3">
      {FIND_SETS.map((set) => {
        const progress = collection.sets.find((s) => s.id === set.id);
        return (
          <div key={set.id} className="px-inset p-3">
            <p className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {set.name}{' '}
                {progress?.complete === true && <PxTag tone="ok">{progress.title}</PxTag>}
              </span>
              <span className="text-cyan">
                {progress?.found ?? 0} / {progress?.total ?? set.items.length}
              </span>
            </p>
            <ul className="grid grid-cols-6 gap-2">
              {set.items.map((item) => {
                const have = found.has(item.id);
                return (
                  <li
                    key={item.id}
                    title={have ? item.name : 'Not found yet'}
                    className={`grid aspect-square place-items-center border-2 ${have ? 'border-steel bg-[#1b1f24]' : 'border-[#262c33]'}`}
                  >
                    <PixelSvg rows={item.icon} palette={FIND_PALETTE} size={36} dim={!have} />
                    <span className="sr-only">{have ? item.name : 'Not found yet'}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ seasons

export function SeasonsPanel({ address }: { address: Address | undefined }) {
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: api.seasons });
  const season = seasons.data?.seasons[0];
  const board = useQuery({
    queryKey: ['season', season?.id],
    enabled: season !== undefined,
    queryFn: () => api.seasonBoard(season?.id ?? 0),
  });
  const overall = useQuery({ queryKey: ['contribution'], queryFn: api.contributionBoard });
  return (
    <div className="flex flex-col gap-4">
      <PxSection label="Season" title={season?.name ?? 'No season yet'}>
        {season !== undefined && (
          <p className={HINT}>
            {formatUtc(season.startsAt)} to {formatUtc(season.endsAt)}. Ranked by World Bore
            contribution during the season. When it ends, the top ten get a plaque on their shack
            wall (cosmetic).
          </p>
        )}
        {board.data !== undefined && (
          <Board
            rows={board.data.rows}
            caption={`${season?.name ?? 'Season'} leaderboard`}
            address={address}
            plaques
          />
        )}
      </PxSection>
      <PxSection label="All time" title="World Bore contribution">
        {overall.data === undefined ? (
          <Status>{overall.isError ? apiMessage(overall.error) : 'Loading…'}</Status>
        ) : (
          <Board
            rows={overall.data.rows}
            caption="All-time contribution leaderboard"
            address={address}
          />
        )}
      </PxSection>
    </div>
  );
}

function Board({
  rows,
  caption,
  address,
  plaques = false,
}: {
  rows: ContributionRow[];
  caption: string;
  address: Address | undefined;
  /** A season board: the top ten places carry a plaque when the season ends. */
  plaques?: boolean;
}) {
  const mine = address?.toLowerCase();
  return (
    <PxTable
      caption={caption}
      rows={rows}
      rowKey={(r) => r.address}
      columns={[
        {
          key: 'rank',
          header: 'Rank',
          numeric: true,
          render: (r) =>
            plaques && r.rank <= 10 ? (
              <span className="inline-flex items-center gap-1">
                <PixelSvg
                  rows={PLAQUE_ART}
                  palette={PLAQUE_PALETTES[plaqueTier(r.rank)]}
                  size={16}
                />
                {r.rank}
                <span className="sr-only">, plaque place</span>
              </span>
            ) : (
              r.rank
            ),
        },
        {
          key: 'who',
          header: 'Driller',
          render: (r) => (
            <a
              href={`/s/${r.address.toLowerCase()}`}
              className={`underline ${r.address.toLowerCase() === mine ? 'text-amber' : 'text-bone'}`}
            >
              {r.displayName ?? shortAddress(r.address)}
              {r.address.toLowerCase() === mine ? ' (you)' : ''}
            </a>
          ),
        },
        { key: 'c', header: 'Cored', numeric: true, render: (r) => r.contribution.text },
      ]}
    />
  );
}

// ------------------------------------------------------------------ profile, share, alerts

export function ProfilePanel({ me, address }: { me: Me; address: Address }) {
  return (
    <div className="flex flex-col gap-4">
      <NameCard me={me} />
      <BadgesCard address={address} />
      <ShareCard address={address} />
      <AlertsCard />
    </div>
  );
}

function NameCard({ me }: { me: Me }) {
  const client = useQueryClient();
  const { write, busy } = useWrite();
  const [name, setName] = useState(me.displayName ?? '');
  return (
    <PxSection label="Profile" title={me.displayName ?? 'Pick a name'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void write('name', () => api.setName(name), 'Name saved').then(async (ok) => {
            if (ok) await client.invalidateQueries({ queryKey: ME_KEY });
          });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="block grow">
          <span className={HINT}>Display name (3 to 20 letters, digits or _)</span>
          <input
            required
            pattern="[A-Za-z0-9_]{3,20}"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
          />
        </label>
        <PxButton type="submit" variant="light" busy={busy === 'name'}>
          Save
        </PxButton>
      </form>
    </PxSection>
  );
}

function BadgesCard({ address }: { address: Address }) {
  const profile = useQuery({ queryKey: ['profile', address], queryFn: () => api.profile(address) });
  return (
    <PxSection label="Badges" title="Badges">
      {profile.data === undefined ? (
        <Status>{profile.isError ? apiMessage(profile.error) : 'Loading…'}</Status>
      ) : (
        <>
          <BadgeShelf awarded={profile.data.badges.map((b) => b.id)} all />
          {(profile.data.plaques ?? []).length > 0 && (
            <>
              <h3 className="mt-4 text-amber">Season plaques</h3>
              <PlaqueList plaques={profile.data.plaques ?? []} />
            </>
          )}
        </>
      )}
    </PxSection>
  );
}

function ShareCard({ address }: { address: Address }) {
  const toast = useToast();
  const profile = useQuery({ queryKey: ['profile', address], queryFn: () => api.profile(address) });
  const world = useQuery({ queryKey: ['world'], queryFn: api.world });
  const link = profileUrl(address);
  const text =
    profile.data !== undefined && world.data !== undefined
      ? contributionPost({
          contributionMm: BigInt(profile.data.contribution.mm),
          crew: profile.data.crew?.name ?? null,
          boreMm: BigInt(world.data.depth.mm),
          address,
        })
      : null;
  return (
    <PxSection label="Share" title="Your drill site card">
      {profile.data?.registered === true && (
        <img
          src={api.cardUrl(address)}
          alt="Your share card: World Bore contribution, crew and the bore's depth"
          width={1200}
          height={630}
          className="h-auto w-full max-w-xl border-[3px] border-[#0b0d10]"
        />
      )}
      <p className={HINT}>
        Your public page doubles as your invite link. Sharing gives no in-game bonus; it just shows
        your site.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {text !== null && (
          <a
            href={xIntentUrl(text)}
            target="_blank"
            rel="noopener noreferrer"
            className="px-btn px-btn-primary px-4 py-2 text-lg"
          >
            Post on X
          </a>
        )}
        <PxButton
          variant="light"
          onClick={() =>
            void navigator.clipboard
              .writeText(link)
              .then(() => toast({ tone: 'success', title: 'Invite link copied' }))
              .catch(() => toast({ tone: 'warning', title: 'Copy failed', body: link }))
          }
        >
          Copy invite link
        </PxButton>
        <a href={`/s/${address.toLowerCase()}`} className="text-amber underline">
          Public page
        </a>
      </div>
    </PxSection>
  );
}

function AlertsCard() {
  const prefs = useQuery({ queryKey: ['prefs'], queryFn: api.prefs });
  return (
    <PxSection label="Alerts" title="Notifications">
      {prefs.data === undefined ? (
        <Status>{prefs.isError ? apiMessage(prefs.error) : 'Loading…'}</Status>
      ) : (
        <AlertsForm initial={prefs.data} />
      )}
    </PxSection>
  );
}

function AlertsForm({ initial }: { initial: Prefs }) {
  const client = useQueryClient();
  const { write, busy } = useWrite();
  const [email, setEmail] = useState(initial.email ?? '');
  const [telegram, setTelegram] = useState(initial.telegramChatId ?? '');
  const [events, setEvents] = useState<NotifyEvent[]>(initial.events);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const next: Prefs = {
          email: email.trim() === '' ? null : email.trim(),
          telegramChatId: telegram.trim() === '' ? null : telegram.trim(),
          events,
        };
        void write('prefs', () => api.setPrefs(next), 'Alerts saved').then(async (ok) => {
          if (ok) await client.invalidateQueries({ queryKey: ['prefs'] });
        });
      }}
      className="flex flex-col gap-3"
    >
      <fieldset>
        <legend className={HINT}>Tell me when</legend>
        {NOTIFY_EVENTS.map((ev) => (
          <label key={ev} className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-orange"
              checked={events.includes(ev)}
              onChange={(e) =>
                setEvents((all) => (e.target.checked ? [...all, ev] : all.filter((x) => x !== ev)))
              }
            />
            {EVENT_LABELS[ev]}
          </label>
        ))}
      </fieldset>
      <label className="block">
        <span className={HINT}>Email (optional)</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className={HINT}>Telegram chat id (optional)</span>
        <input
          inputMode="numeric"
          pattern="-?[0-9]{1,20}"
          value={telegram}
          onChange={(e) => setTelegram(e.target.value)}
          className={INPUT}
        />
      </label>
      <PxButton type="submit" variant="light" busy={busy === 'prefs'} className="self-start">
        Save alerts
      </PxButton>
    </form>
  );
}
