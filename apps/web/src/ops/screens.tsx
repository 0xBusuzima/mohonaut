'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Table } from '../components/Table';
import { useToast } from '../components/Toast';
import { GEN1_RIGS } from '../lib/catalog';
import { formatEth, formatMohn, formatUtc } from '../lib/format';
import { apiMessage } from '../social/api';
import { ops } from './api';
import type { Announcement, Ticket } from './api';
import { ROLES } from './permissions';

const field = 'mt-1 block w-full rounded border border-line bg-surface-sunken px-3 py-2';

/** Runs an operator write: busy flag, toast, refresh. Every write carries a reason. */
function useOpsWrite() {
  const toast = useToast();
  const client = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  async function write(key: string, fn: () => Promise<unknown>, done: string, refresh: string[][]) {
    setBusy(key);
    try {
      await fn();
      toast({ tone: 'success', title: done });
      for (const k of refresh) await client.invalidateQueries({ queryKey: k });
      return true;
    } catch (err) {
      toast({ tone: 'warning', title: 'Not saved', body: apiMessage(err) });
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { write, busy };
}

function Reason({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-fg-muted">Reason (kept in the audit log)</span>
      <input
        required
        minLength={3}
        maxLength={500}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={field}
      />
    </label>
  );
}

function Loading<T>({
  q,
  children,
}: {
  q: { data: T | undefined; isError: boolean; error: unknown };
  children: (d: T) => ReactNode;
}) {
  if (q.data !== undefined) return <>{children(q.data)}</>;
  return <p role="status">{q.isError ? apiMessage(q.error) : 'Loading…'}</p>;
}

/** Unix seconds from a <input type="datetime-local"> value read as UTC. */
export function utcInputToUnix(value: string): number | null {
  // Strict shape first: Date.parse accepts odd strings (it reads "x:00Z" as the year 2000).
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}:00Z`);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

// ------------------------------------------------------------------ health (module 12)

export function HealthScreen() {
  const q = useQuery({ queryKey: ['ops', 'health'], queryFn: ops.health, refetchInterval: 30_000 });
  return (
    <Loading q={q}>
      {(h) => {
        const head = h.head === null ? null : BigInt(h.head);
        const sinceHour = h.lastHourClosedAt === null ? null : h.now - h.lastHourClosedAt;
        const lowKeeper = h.keeper.balanceWei !== null && BigInt(h.keeper.balanceWei) < 10n ** 15n;
        return (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card label="Indexer" title="Streams">
              <Table
                caption="Indexer streams and lag"
                rows={h.streams}
                rowKey={(s) => s.stream}
                columns={[
                  { key: 's', header: 'Stream', render: (s) => s.stream },
                  { key: 'b', header: 'Block', numeric: true, render: (s) => s.block },
                  {
                    key: 'l',
                    header: 'Behind',
                    numeric: true,
                    render: (s) =>
                      head === null ? 'RPC unknown' : `${head - BigInt(s.block)} blocks`,
                  },
                ]}
              />
            </Card>
            <Card label="Chain" title="Hours and keeper">
              <ul className="flex flex-col gap-2">
                <li>
                  Last hour closed:{' '}
                  {sinceHour === null ? (
                    <Badge tone="warning">never</Badge>
                  ) : (
                    <>
                      <span className="num">{Math.floor(sinceHour / 60)} min ago</span>{' '}
                      {sinceHour > 2 * 3600 && <Badge tone="alarm">keeper late</Badge>}
                    </>
                  )}
                </li>
                <li>
                  Keeper <span className="num break-all">{h.keeper.address ?? 'not set'}</span>
                </li>
                <li>
                  Balance{' '}
                  <span className="num">
                    {h.keeper.balanceWei === null
                      ? 'unknown'
                      : formatEth(BigInt(h.keeper.balanceWei))}
                  </span>{' '}
                  {lowKeeper && <Badge tone="alarm">top up</Badge>}
                </li>
              </ul>
              <p className="mt-4 text-fg-muted">
                Alerts for the same signals go to Telegram (infra/monitoring). Pausing is a Guardian
                Safe action, never a button here: follow the runbook.
              </p>
            </Card>
          </div>
        );
      }}
    </Loading>
  );
}

// ------------------------------------------------------------------ players (modules 4, 5)

export function PlayersScreen({ canFlag }: { canFlag: boolean }) {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const results = useQuery({
    queryKey: ['ops', 'users', search],
    enabled: search.length >= 2,
    queryFn: () => ops.users(search),
  });
  return (
    <>
      <Card label="Players" title="Find a player">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="block grow">
            <span className="text-fg-muted">Wallet (start) or display name</span>
            <input
              value={q}
              minLength={2}
              onChange={(e) => setQ(e.target.value)}
              className={field}
            />
          </label>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        {search.length >= 2 && (
          <div className="mt-4">
            <Loading q={results}>
              {(d) => (
                <Table
                  caption="Search results"
                  rows={d.users}
                  rowKey={(u) => String(u.id)}
                  empty="No player matches."
                  columns={[
                    { key: 'id', header: 'ID', numeric: true, render: (u) => u.id },
                    { key: 'n', header: 'Name', render: (u) => u.displayName ?? '—' },
                    {
                      key: 'w',
                      header: 'Wallet',
                      render: (u) => (
                        <span className="num break-all">{u.wallet ?? u.authProvider}</span>
                      ),
                    },
                    {
                      key: 'r',
                      header: 'Risk',
                      numeric: true,
                      render: (u) =>
                        u.flagged ? (
                          <Badge tone="alarm">{`flagged ${u.riskScore}`}</Badge>
                        ) : (
                          u.riskScore
                        ),
                    },
                    {
                      key: 'open',
                      header: 'File',
                      render: (u) => (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected(u.id)}
                          aria-label={`Open player ${u.id}`}
                        >
                          Open
                        </Button>
                      ),
                    },
                  ]}
                />
              )}
            </Loading>
          </div>
        )}
      </Card>
      {selected !== null && <PlayerFileCard id={selected} canFlag={canFlag} />}
    </>
  );
}

function PlayerFileCard({ id, canFlag }: { id: number; canFlag: boolean }) {
  const q = useQuery({ queryKey: ['ops', 'user', id], queryFn: () => ops.user(id) });
  return (
    <Loading q={q}>
      {(f) => (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card
            label={`Player ${f.user.id}`}
            title={f.user.displayName ?? f.user.wallet ?? 'No name'}
          >
            <ul className="flex flex-col gap-1">
              <li>
                Wallet{' '}
                <span className="num break-all">
                  {f.user.wallet ?? `— (${f.user.authProvider})`}
                </span>
              </li>
              <li>Crew: {f.crew === null ? '—' : `${f.crew.name} [${f.crew.tag}]`}</li>
              <li>Roles: {f.user.roles.length === 0 ? '—' : f.user.roles.join(', ')}</li>
              <li>
                Risk <span className="num">{f.user.riskScore}</span>{' '}
                {f.user.flagged && <Badge tone="alarm">flagged: off-chain rewards frozen</Badge>}
              </li>
            </ul>
            {f.chain === null ? (
              <p className="mt-4 text-fg-muted">No on-chain site yet.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-1">
                <li>
                  Site L<span className="num">{f.chain.siteLevel}</span> ·{' '}
                  <span className="num">{f.chain.dp}</span> DP
                </li>
                <li>
                  Rigs:{' '}
                  {f.chain.rigs
                    .filter((r) => r.owned !== '0')
                    .map(
                      (r) =>
                        `${r.owned}× ${GEN1_RIGS[r.typeId]?.name ?? `type ${r.typeId}`} (${r.active} on)`,
                    )
                    .join(', ') || '—'}
                </li>
                <li>
                  Diesel bought <span className="num">{formatEth(BigInt(f.chain.fuelEth))}</span>
                </li>
                <li>
                  Accrued <span className="num">{formatMohn(BigInt(f.chain.accrued))}</span> ·
                  refined <span className="num">{formatMohn(BigInt(f.chain.refined))}</span> · spent{' '}
                  <span className="num">{formatMohn(BigInt(f.chain.mohnSpent))}</span>
                </li>
                <li>
                  Referrer <span className="num break-all">{f.chain.referrer ?? '—'}</span> ·
                  referred <span className="num">{f.chain.referrals}</span>
                </li>
              </ul>
            )}
            <p className="mt-4 text-fg-muted">
              No one can touch on-chain assets from here, by design. Flags only freeze off-chain
              rewards (badges, season prizes).
            </p>
          </Card>
          <div className="flex flex-col gap-6">
            {canFlag && (
              <FlagForm id={f.user.id} flagged={f.user.flagged} risk={f.user.riskScore} />
            )}
            <Card label="History" title="Moderation and support">
              <ul className="flex flex-col gap-2">
                {f.audit.map((a) => (
                  <li key={`${a.at}-${a.action}`}>
                    <span className="num text-fg-muted">{a.at.slice(0, 16).replace('T', ' ')}</span>{' '}
                    {a.action} by #{a.actorUserId}: {a.reason}
                  </li>
                ))}
                {f.tickets.map((t) => (
                  <li key={`t${t.id}`}>
                    <span className="num text-fg-muted">
                      {t.createdAt.slice(0, 16).replace('T', ' ')}
                    </span>{' '}
                    ticket #{t.id} ({t.topic}, {t.status})
                  </li>
                ))}
                {f.audit.length === 0 && f.tickets.length === 0 && (
                  <li className="text-fg-muted">Nothing yet.</li>
                )}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </Loading>
  );
}

function FlagForm({ id, flagged, risk }: { id: number; flagged: boolean; risk: number }) {
  const { write, busy } = useOpsWrite();
  const [on, setOn] = useState(flagged);
  const [score, setScore] = useState(String(risk));
  const [reason, setReason] = useState('');
  return (
    <Card label="Anti-cheat" title="Flag">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void write(
            'flag',
            () => ops.flag(id, { flagged: on, riskScore: Number(score), reason }),
            'Flag saved',
            [['ops', 'user']],
          ).then((ok) => ok && setReason(''));
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
          Flagged (freeze off-chain rewards)
        </label>
        <label className="block">
          <span className="text-fg-muted">Risk score 0 to 100</span>
          <input
            type="number"
            min={0}
            max={100}
            required
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className={field}
          />
        </label>
        <Reason value={reason} onChange={setReason} />
        <Button type="submit" variant="secondary" busy={busy === 'flag'} className="self-start">
          Save flag
        </Button>
      </form>
    </Card>
  );
}

// ------------------------------------------------------------------ support (module 9)

export function SupportScreen({ canWrite }: { canWrite: boolean }) {
  const [status, setStatus] = useState<Ticket['status']>('open');
  const q = useQuery({ queryKey: ['ops', 'tickets', status], queryFn: () => ops.tickets(status) });
  return (
    <Card
      label="Support"
      title="Inbox"
      actions={
        <label className="flex items-center gap-2">
          <span className="sr-only">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Ticket['status'])}
            className="rounded border border-line bg-surface-sunken px-2 py-1"
          >
            <option value="open">Open</option>
            <option value="answered">Answered</option>
            <option value="closed">Closed</option>
          </select>
        </label>
      }
    >
      <Loading q={q}>
        {(d) =>
          d.tickets.length === 0 ? (
            <p className="text-fg-muted">No {status} requests.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {d.tickets.map((t) => (
                <TicketItem key={t.id} ticket={t} canWrite={canWrite} />
              ))}
            </ul>
          )
        }
      </Loading>
    </Card>
  );
}

function TicketItem({ ticket: t, canWrite }: { ticket: Ticket; canWrite: boolean }) {
  const { write, busy } = useOpsWrite();
  const [status, setStatus] = useState(t.status);
  const [note, setNote] = useState(t.note ?? '');
  const [reason, setReason] = useState('');
  return (
    <li className="border-t border-line pt-4">
      <p className="flex flex-wrap items-center gap-2">
        <Badge>{t.topic}</Badge>{' '}
        <span className="num text-fg-muted">
          #{t.id} · {t.createdAt.slice(0, 16).replace('T', ' ')} UTC
        </span>
        {t.userId !== null && <span className="text-fg-muted">player #{t.userId}</span>}
      </p>
      <p className="mt-2 whitespace-pre-wrap">{t.body}</p>
      <p className="mt-1 text-sm text-fg-muted">
        {t.wallet !== null && <span className="num break-all">{t.wallet}</span>}{' '}
        {t.contact !== null && <>· {t.contact}</>}
      </p>
      {canWrite && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void write(
              `t${t.id}`,
              () => ops.updateTicket(t.id, { status, note: note === '' ? null : note, reason }),
              'Request updated',
              [['ops', 'tickets']],
            );
          }}
          className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr]"
        >
          <label className="block">
            <span className="text-fg-muted">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Ticket['status'])}
              className={field}
            >
              <option value="open">Open</option>
              <option value="answered">Answered</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label className="block">
            <span className="text-fg-muted">Internal note</span>
            <input
              value={note}
              maxLength={4000}
              onChange={(e) => setNote(e.target.value)}
              className={field}
            />
          </label>
          <div className="sm:col-span-2">
            <Reason value={reason} onChange={setReason} />
          </div>
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            busy={busy === `t${t.id}`}
            className="self-start"
          >
            Save
          </Button>
        </form>
      )}
    </li>
  );
}

// ------------------------------------------------------------------ announcements (module 7)

export function AnnouncementsScreen({ now }: { now: number }) {
  const q = useQuery({ queryKey: ['ops', 'announcements'], queryFn: ops.announcements });
  const { write, busy } = useOpsWrite();
  const [kind, setKind] = useState<Announcement['kind']>('banner');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [endReason, setEndReason] = useState('');

  function publish(e: FormEvent) {
    e.preventDefault();
    const startsAt = utcInputToUnix(start) ?? now;
    void write(
      'publish',
      () => ops.announce({ kind, title, body, startsAt, endsAt: utcInputToUnix(end), reason }),
      'Published',
      [['ops', 'announcements']],
    ).then((ok) => {
      if (ok) {
        setTitle('');
        setBody('');
        setReason('');
      }
    });
  }

  return (
    <>
      <Card label="Announcements" title="Publish">
        <form onSubmit={publish} className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-fg-muted">Kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Announcement['kind'])}
              className={field}
            >
              <option value="banner">Banner (site and game)</option>
              <option value="maintenance">Maintenance notice</option>
              <option value="changelog">Changelog entry</option>
            </select>
          </label>
          <label className="block">
            <span className="text-fg-muted">Title (English, 3 to 120)</span>
            <input
              required
              minLength={3}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={field}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-fg-muted">Text (optional for banners)</span>
            <textarea
              maxLength={4000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className={field}
            />
          </label>
          <label className="block">
            <span className="text-fg-muted">Starts (UTC; empty = now)</span>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={field}
            />
          </label>
          <label className="block">
            <span className="text-fg-muted">Ends (UTC; empty = until taken down)</span>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={field}
            />
          </label>
          <div className="sm:col-span-2">
            <Reason value={reason} onChange={setReason} />
          </div>
          <Button type="submit" busy={busy === 'publish'} className="self-start">
            Publish
          </Button>
        </form>
        <p className="mt-4 text-fg-muted">
          Every notice follows the public copy rules of docs/05 §6.
        </p>
      </Card>
      <Card label="Announcements" title="All">
        <Loading q={q}>
          {(d) => (
            <>
              <Reason value={endReason} onChange={setEndReason} />
              <ul className="mt-4 flex flex-col gap-3">
                {d.announcements.map((a) => {
                  const live = a.startsAt <= now && (a.endsAt === null || a.endsAt > now);
                  return (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"
                    >
                      <span>
                        <Badge tone={live ? 'ok' : 'neutral'}>{live ? 'live' : a.kind}</Badge>{' '}
                        {a.title}{' '}
                        <span className="num text-fg-muted">
                          {formatUtc(a.startsAt)}
                          {a.endsAt !== null && ` to ${formatUtc(a.endsAt)}`}
                        </span>
                      </span>
                      {(a.endsAt === null || a.endsAt > now) && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={endReason.length < 3}
                          busy={busy === `end${a.id}`}
                          onClick={() =>
                            void write(
                              `end${a.id}`,
                              () => ops.endAnnouncement(a.id, endReason),
                              'Taken down',
                              [['ops', 'announcements']],
                            )
                          }
                        >
                          Take down
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Loading>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ seasons, crews (modules 6, 8)

export function SeasonsScreen() {
  const { write, busy } = useOpsWrite();
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Card label="Seasons" title="Announce a season">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const startsAt = utcInputToUnix(start);
          const endsAt = utcInputToUnix(end);
          if (startsAt === null || endsAt === null) return;
          void write(
            'season',
            () => ops.createSeason({ name, startsAt, endsAt, reason }),
            `${name} announced`,
            [['seasons']],
          );
        }}
        className="grid gap-4 sm:grid-cols-3"
      >
        <label className="block">
          <span className="text-fg-muted">Name</span>
          <input
            required
            minLength={3}
            maxLength={64}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </label>
        <label className="block">
          <span className="text-fg-muted">Starts (UTC)</span>
          <input
            required
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={field}
          />
        </label>
        <label className="block">
          <span className="text-fg-muted">Ends (UTC)</span>
          <input
            required
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={field}
          />
        </label>
        <div className="sm:col-span-3">
          <Reason value={reason} onChange={setReason} />
        </div>
        <Button type="submit" busy={busy === 'season'} className="self-start">
          Announce
        </Button>
      </form>
      <p className="mt-4 text-fg-muted">
        Season prizes from the treasury are paid as Safe transactions, never from this panel.
      </p>
    </Card>
  );
}

export function CrewsScreen() {
  const { write, busy } = useOpsWrite();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Card label="Crews" title="Rename an offensive crew">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void write('rename', () => ops.renameCrew(Number(id), { name, reason }), 'Crew renamed', [
            ['crews'],
          ]);
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <label className="block">
          <span className="text-fg-muted">Crew ID</span>
          <input
            required
            type="number"
            min={1}
            value={id}
            onChange={(e) => setId(e.target.value)}
            className={field}
          />
        </label>
        <label className="block">
          <span className="text-fg-muted">New name</span>
          <input
            required
            pattern="[A-Za-z0-9][A-Za-z0-9 _\-]{2,23}"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </label>
        <div className="sm:col-span-2">
          <Reason value={reason} onChange={setReason} />
        </div>
        <Button type="submit" variant="secondary" busy={busy === 'rename'} className="self-start">
          Rename
        </Button>
      </form>
    </Card>
  );
}

// ------------------------------------------------------------------ roles, audit (module 11)

export function RolesScreen() {
  const { write, busy } = useOpsWrite();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<string>('support');
  const [grant, setGrant] = useState(true);
  const [reason, setReason] = useState('');
  return (
    <Card label="Access" title="Operator roles">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void write(
            'role',
            () => ops.setRole({ userId: Number(userId), role, grant, reason }),
            grant ? 'Role granted' : 'Role removed',
            [['ops', 'audit']],
          );
        }}
        className="grid gap-4 sm:grid-cols-3"
      >
        <label className="block">
          <span className="text-fg-muted">Player ID</span>
          <input
            required
            type="number"
            min={1}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className={field}
          />
        </label>
        <label className="block">
          <span className="text-fg-muted">Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={field}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-fg-muted">Change</span>
          <select
            value={grant ? 'grant' : 'remove'}
            onChange={(e) => setGrant(e.target.value === 'grant')}
            className={field}
          >
            <option value="grant">Grant</option>
            <option value="remove">Remove</option>
          </select>
        </label>
        <div className="sm:col-span-3">
          <Reason value={reason} onChange={setReason} />
        </div>
        <Button type="submit" variant="secondary" busy={busy === 'role'} className="self-start">
          Save
        </Button>
      </form>
    </Card>
  );
}

export function AuditScreen() {
  const q = useQuery({ queryKey: ['ops', 'audit'], queryFn: ops.audit });
  return (
    <Card label="Audit log" title="Every operator action (append-only)">
      <Loading q={q}>
        {(d) => (
          <Table
            caption="Audit log"
            rows={d.entries}
            rowKey={(a) => String(a.id)}
            columns={[
              {
                key: 'at',
                header: 'When (UTC)',
                render: (a) => <span className="num">{a.at.slice(0, 16).replace('T', ' ')}</span>,
              },
              { key: 'who', header: 'By', render: (a) => `#${a.actorUserId}` },
              { key: 'what', header: 'Action', render: (a) => `${a.action} ${a.target}` },
              { key: 'why', header: 'Reason', render: (a) => a.reason },
              {
                key: 'diff',
                header: 'Before → after',
                render: (a) => (
                  <code className="text-xs break-all">{`${JSON.stringify(a.before)} → ${JSON.stringify(a.after)}`}</code>
                ),
              },
            ]}
          />
        )}
      </Loading>
    </Card>
  );
}
