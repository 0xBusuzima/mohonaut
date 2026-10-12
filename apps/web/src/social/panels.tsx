'use client';

import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Address } from 'viem';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Table } from '../components/Table';
import { useToast } from '../components/Toast';
import { formatUtc } from '../lib/format';
import { NOTIFY_EVENTS, api, apiMessage } from './api';
import type { ContributionRow, Me, NotifyEvent, Prefs } from './api';
import { ME_KEY, useMe } from './session';
import { contributionPost, profileUrl, shortAddress, xIntentUrl } from './share';

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

/** Wraps the off-chain features: they need a SIWE session. */
export function SignedIn({ children }: { children: (me: Me) => ReactNode }) {
  const { me, loading } = useMe();
  const { openConnectModal } = useConnectModal();
  if (loading) return <p role="status">Checking your session…</p>;
  if (me === null) {
    return (
      <Card title="Sign in">
        <p className="max-w-2xl">
          Crews, the Survey, your profile name and alerts live off-chain. Sign a message with your
          wallet to use them. The signature only logs you in; it cannot move funds.
        </p>
        <Button
          className="mt-4"
          onClick={() => openConnectModal?.()}
          disabled={openConnectModal === undefined}
        >
          Sign in
        </Button>
      </Card>
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
    return <p role="status">{crew.isError ? apiMessage(crew.error) : 'Loading your crew…'}</p>;
  const c = crew.data;
  return (
    <Card
      label="Crew"
      title={`${c.name} [${c.tag}]`}
      actions={
        c.ranked ? (
          <Badge tone="ok">Ranked</Badge>
        ) : (
          <Badge>{`${c.members.length} of ${CREW_MIN} to rank`}</Badge>
        )
      }
    >
      <p>
        Together you have cored <span className="num">{c.contribution.text}</span> of the World
        Bore. Crews are social only: no shared Drill Power, no shared rewards.
      </p>
      <div className="mt-4">
        <Table
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
                  {m.captain && <Badge tone="data">Captain</Badge>}
                </>
              ),
            },
            { key: 'c', header: 'Cored', numeric: true, render: (m) => m.contribution.text },
          ]}
        />
      </div>
      <Button
        className="mt-4"
        variant="secondary"
        busy={busy === 'leave'}
        onClick={async () => {
          if (await write('leave', api.leaveCrew, `You left ${c.name}`))
            await client.invalidateQueries({ queryKey: ME_KEY });
        }}
      >
        Leave crew
      </Button>
    </Card>
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
    }
  }

  return (
    <>
      <Card label="Crew" title="Start a crew">
        <p className="max-w-2xl text-fg-muted">
          {CREW_MIN} to {CREW_MAX} players. A crew ranks once it has {CREW_MIN} members. Crews never
          pool Drill Power or rewards.
        </p>
        <form
          onSubmit={(e) => void create(e)}
          className="mt-4 grid gap-4 sm:grid-cols-[1fr_8rem_auto] sm:items-end"
        >
          <label className="block">
            <span className="text-fg-muted">Name (3 to 24 letters, digits, spaces, - or _)</span>
            <input
              required
              pattern="[A-Za-z0-9][A-Za-z0-9 _\-]{2,23}"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded border border-line bg-surface-sunken px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-fg-muted">Tag (3 to 5)</span>
            <input
              required
              pattern="[A-Za-z0-9]{3,5}"
              value={tag}
              onChange={(e) => setTag(e.target.value.toUpperCase())}
              className="mt-1 block w-full rounded border border-line bg-surface-sunken px-3 py-2 uppercase"
            />
          </label>
          <Button type="submit" busy={busy === 'create'}>
            Create
          </Button>
        </form>
      </Card>
      <Card label="Crews" title="Join a crew">
        {crews.data === undefined ? (
          <p role="status">{crews.isError ? apiMessage(crews.error) : 'Loading crews…'}</p>
        ) : (
          <Table
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
                  <Button
                    size="sm"
                    variant="secondary"
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
                      }
                    }}
                  >
                    Join
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ survey

export function SurveyPanel({ now }: { now: number }) {
  const client = useQueryClient();
  const collection = useQuery({ queryKey: ['collection'], queryFn: api.collection });
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const today = Math.floor(now / DAY_S);
  const doneToday = collection.data?.finds.some((f) => f.day === today) ?? false;

  async function survey() {
    setBusy(true);
    try {
      const r = await api.survey();
      setLast(r.isNew ? `You found: ${r.find.name}` : `Today's find was: ${r.find.name}`);
      await client.invalidateQueries({ queryKey: ['collection'] });
    } catch (err) {
      toast({ tone: 'warning', title: 'Not done', body: apiMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card label="Survey" title="Today's survey">
        <p className="max-w-2xl text-fg-muted">
          One free survey per day turns up a core sample, fossil or old drilling part for your
          collection. Finds are cosmetic: they cannot be bought or sold and change nothing in the
          economy.
        </p>
        {last !== null && (
          <p role="status" className="mt-4 font-semibold">
            {last}
          </p>
        )}
        <Button className="mt-4" busy={busy} disabled={doneToday} onClick={() => void survey()}>
          {doneToday ? 'Surveyed today' : 'Survey'}
        </Button>
        {doneToday && (
          <p className="mt-2 text-fg-muted">Next survey from {formatUtc((today + 1) * DAY_S)}.</p>
        )}
      </Card>
      <Card label="Core Collection" title="Your sets">
        {collection.data === undefined ? (
          <p role="status">{collection.isError ? apiMessage(collection.error) : 'Loading…'}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {collection.data.sets.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"
              >
                <span>
                  {s.name} {s.complete && <Badge tone="ok">{s.title}</Badge>}
                </span>
                <span className="num">
                  {s.found} / {s.total}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
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
    <>
      <Card label="Season" title={season?.name ?? 'No season yet'}>
        {season !== undefined && (
          <p className="text-fg-muted">
            {formatUtc(season.startsAt)} to {formatUtc(season.endsAt)}. Ranked by World Bore
            contribution during the season.
          </p>
        )}
        {board.data !== undefined && (
          <div className="mt-4">
            <Board
              rows={board.data.rows}
              caption={`${season?.name ?? 'Season'} leaderboard`}
              address={address}
            />
          </div>
        )}
      </Card>
      <Card label="All time" title="World Bore contribution">
        {overall.data === undefined ? (
          <p role="status">{overall.isError ? apiMessage(overall.error) : 'Loading…'}</p>
        ) : (
          <Board
            rows={overall.data.rows}
            caption="All-time contribution leaderboard"
            address={address}
          />
        )}
      </Card>
    </>
  );
}

function Board({
  rows,
  caption,
  address,
}: {
  rows: ContributionRow[];
  caption: string;
  address: Address | undefined;
}) {
  const mine = address?.toLowerCase();
  return (
    <Table
      caption={caption}
      rows={rows}
      rowKey={(r) => r.address}
      columns={[
        { key: 'rank', header: 'Rank', numeric: true, render: (r) => r.rank },
        {
          key: 'who',
          header: 'Driller',
          render: (r) => (
            <a href={`/s/${r.address.toLowerCase()}`} className="text-data underline">
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
    <>
      <NameCard me={me} />
      <ShareCard address={address} />
      <AlertsCard />
    </>
  );
}

function NameCard({ me }: { me: Me }) {
  const client = useQueryClient();
  const { write, busy } = useWrite();
  const [name, setName] = useState(me.displayName ?? '');
  return (
    <Card label="Profile" title={me.displayName ?? 'Pick a name'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void write('name', () => api.setName(name), 'Name saved').then(async (ok) => {
            if (ok) await client.invalidateQueries({ queryKey: ME_KEY });
          });
        }}
        className="flex flex-wrap items-end gap-4"
      >
        <label className="block">
          <span className="text-fg-muted">Display name (3 to 20 letters, digits or _)</span>
          <input
            required
            pattern="[A-Za-z0-9_]{3,20}"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded border border-line bg-surface-sunken px-3 py-2"
          />
        </label>
        <Button type="submit" variant="secondary" busy={busy === 'name'}>
          Save
        </Button>
      </form>
    </Card>
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
    <Card label="Share" title="Your drill site card">
      {profile.data?.registered === true && (
        <img
          src={api.cardUrl(address)}
          alt="Your share card: World Bore contribution, crew and the bore's depth"
          width={1200}
          height={630}
          className="h-auto w-full max-w-xl rounded border border-line"
        />
      )}
      <p className="mt-4 text-fg-muted">
        Your public page doubles as your invite link. Sharing gives no in-game bonus; it just shows
        your site.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {text !== null && (
          <a
            href={xIntentUrl(text)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center rounded-md bg-orange px-5 font-condensed font-semibold tracking-wide text-night uppercase"
          >
            Post on X
          </a>
        )}
        <Button
          variant="secondary"
          onClick={() =>
            void navigator.clipboard
              .writeText(link)
              .then(() => toast({ tone: 'success', title: 'Invite link copied' }))
              .catch(() => toast({ tone: 'warning', title: 'Copy failed', body: link }))
          }
        >
          Copy invite link
        </Button>
        <a
          href={`/s/${address.toLowerCase()}`}
          className="inline-flex h-11 items-center text-data underline"
        >
          Public page
        </a>
      </div>
    </Card>
  );
}

function AlertsCard() {
  const prefs = useQuery({ queryKey: ['prefs'], queryFn: api.prefs });
  return (
    <Card label="Alerts" title="Notifications">
      {prefs.data === undefined ? (
        <p role="status">{prefs.isError ? apiMessage(prefs.error) : 'Loading…'}</p>
      ) : (
        <AlertsForm initial={prefs.data} />
      )}
    </Card>
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
      className="flex flex-col gap-4"
    >
      <fieldset>
        <legend className="text-fg-muted">Tell me when</legend>
        {NOTIFY_EVENTS.map((ev) => (
          <label key={ev} className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
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
        <span className="text-fg-muted">Email (optional)</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded border border-line bg-surface-sunken px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-fg-muted">Telegram chat id (optional)</span>
        <input
          inputMode="numeric"
          pattern="-?[0-9]{1,20}"
          value={telegram}
          onChange={(e) => setTelegram(e.target.value)}
          className="mt-1 block w-full rounded border border-line bg-surface-sunken px-3 py-2"
        />
      </label>
      <Button type="submit" variant="secondary" busy={busy === 'prefs'} className="self-start">
        Save alerts
      </Button>
    </form>
  );
}
