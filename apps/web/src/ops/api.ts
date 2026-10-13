import { call } from '../social/api';

/** Operator endpoints of services/api (routes/admin.ts, routes/ops.ts). */
export interface Ticket {
  id: number;
  userId: number | null;
  wallet: string | null;
  contact: string | null;
  topic: string;
  body: string;
  status: 'open' | 'answered' | 'closed';
  note: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Announcement {
  id: number;
  kind: 'banner' | 'maintenance' | 'changelog';
  title: string;
  body: string;
  startsAt: number;
  endsAt: number | null;
}
export interface UserRow {
  id: number;
  wallet: string | null;
  displayName: string | null;
  authProvider: string;
  riskScore: number;
  flagged: boolean;
}
export interface PlayerFile {
  user: UserRow & { roles: string[] };
  crew: { id: number; name: string; tag: string } | null;
  chain: null | {
    referrer: string | null;
    referrals: number;
    siteLevel: number;
    dp: string;
    fuelEth: string;
    accrued: string;
    refined: string;
    mohnSpent: string;
    rigs: { typeId: number; owned: string; active: string }[];
    refines: { id: string; amount: string; readyAt: string; finalizedAt: string | null }[];
  };
  tickets: Ticket[];
  audit: { at: string; action: string; reason: string; actorUserId: number }[];
}
export interface Health {
  now: number;
  streams: { stream: string; block: string }[];
  head: string | null;
  lastHourClosedAt: number | null;
  keeper: { address: string | null; balanceWei: string | null };
}
export interface AuditEntry {
  id: number;
  at: string;
  actorUserId: number;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
  reason: string;
}

export const ops = {
  health: () => call<Health>('GET', '/admin/health'),
  users: (q: string) =>
    call<{ users: UserRow[] }>('GET', `/admin/users?q=${encodeURIComponent(q)}`),
  user: (id: number) => call<PlayerFile>('GET', `/admin/users/${id}`),
  flag: (id: number, body: { flagged: boolean; riskScore: number; reason: string }) =>
    call<{ ok: true }>('POST', `/admin/users/${id}/flag`, { body }),
  tickets: (status: Ticket['status']) =>
    call<{ tickets: Ticket[] }>('GET', `/admin/support?status=${status}`),
  updateTicket: (
    id: number,
    body: { status: Ticket['status']; note: string | null; reason: string },
  ) => call<{ ok: true }>('POST', `/admin/support/${id}`, { body }),
  announcements: () => call<{ announcements: Announcement[] }>('GET', '/admin/announcements'),
  announce: (body: Omit<Announcement, 'id'> & { reason: string }) =>
    call<{ id: number }>('POST', '/admin/announcements', { body }),
  endAnnouncement: (id: number, reason: string) =>
    call<{ ok: true }>('POST', `/admin/announcements/${id}/end`, { body: { reason } }),
  createSeason: (body: { name: string; startsAt: number; endsAt: number; reason: string }) =>
    call<{ id: number }>('POST', '/admin/seasons', { body }),
  renameCrew: (id: number, body: { name: string; reason: string }) =>
    call<{ ok: true }>('POST', `/admin/crews/${id}/rename`, { body }),
  setRole: (body: { userId: number; role: string; grant: boolean; reason: string }) =>
    call<{ ok: true }>('POST', '/admin/roles', { body }),
  audit: () => call<{ entries: AuditEntry[] }>('GET', '/admin/audit'),
};
