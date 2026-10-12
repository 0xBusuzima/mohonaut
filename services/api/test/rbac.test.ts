import { describe, expect, it } from 'vitest';
import { auditLog } from '../src/db/schema.js';
import type { Role } from '../src/db/schema.js';
import { PERMISSIONS } from '../src/rbac.js';
import type { Harness } from './helpers.js';
import { call, harness, newWallet, signIn } from './helpers.js';

type Who = 'anonymous' | 'player' | Role;
const WHO: Who[] = ['anonymous', 'player', 'admin', 'economist', 'support', 'moderator'];

/** Every admin endpoint with the permission it needs and a valid request. */
const ENDPOINTS: {
  permission: keyof typeof PERMISSIONS;
  method: string;
  path: (ids: { user: number; crew: number }) => string;
  body?: (ids: { user: number; crew: number }) => unknown;
  ok: number;
}[] = [
  { permission: 'users.read', method: 'GET', path: () => '/admin/users?q=0x', ok: 200 },
  {
    permission: 'users.flag',
    method: 'POST',
    path: (ids) => `/admin/users/${ids.user}/flag`,
    body: () => ({ flagged: true, riskScore: 60, reason: 'shared funding cluster' }),
    ok: 200,
  },
  {
    permission: 'crews.moderate',
    method: 'POST',
    path: (ids) => `/admin/crews/${ids.crew}/rename`,
    body: () => ({
      name: `Renamed ${Math.random().toString(36).slice(2, 8)}`,
      reason: 'offensive name',
    }),
    ok: 200,
  },
  {
    permission: 'seasons.write',
    method: 'POST',
    path: () => '/admin/seasons',
    body: () => ({
      name: 'Season 1',
      startsAt: 1_800_000_000,
      endsAt: 1_804_838_400,
      reason: 'calendar',
    }),
    ok: 201,
  },
  {
    permission: 'roles.write',
    method: 'POST',
    path: () => '/admin/roles',
    body: (ids) => ({ userId: ids.user, role: 'support', grant: true, reason: 'new support hire' }),
    ok: 200,
  },
  { permission: 'audit.read', method: 'GET', path: () => '/admin/audit', ok: 200 },
];

async function setup(): Promise<{
  h: Harness;
  cookies: Record<Who, string | undefined>;
  ids: { user: number; crew: number };
}> {
  const adminWallet = newWallet();
  const h = await harness({ adminWallets: [adminWallet.address] });
  const cookies: Record<Who, string | undefined> = {
    anonymous: undefined,
    player: await signIn(h, newWallet()),
    admin: await signIn(h, adminWallet),
    economist: undefined,
    support: undefined,
    moderator: undefined,
  };
  // The bootstrap admin grants the other roles (each grant is audited).
  for (const role of ['economist', 'support', 'moderator'] as const) {
    const cookie = await signIn(h, newWallet());
    cookies[role] = cookie;
    const id = Number((await call(h, 'GET', '/me', { cookie })).json['id']);
    const res = await call(h, 'POST', '/admin/roles', {
      cookie: cookies.admin,
      body: { userId: id, role, grant: true, reason: 'test setup' },
    });
    expect(res.status).toBe(200);
  }
  const user = Number((await call(h, 'GET', '/me', { cookie: cookies.player })).json['id']);
  const crew = Number(
    (
      await call(h, 'POST', '/crews', {
        cookie: cookies.player,
        body: { name: 'Target Crew', tag: 'TGT' },
      })
    ).json['id'],
  );
  return { h, cookies, ids: { user, crew } };
}

describe('admin authorization matrix', () => {
  it('allows exactly the roles of PERMISSIONS on every admin endpoint', async () => {
    const { h, cookies, ids } = await setup();
    const results: string[] = [];
    for (const e of ENDPOINTS) {
      for (const who of WHO) {
        const res = await call(h, e.method, e.path(ids), {
          cookie: cookies[who],
          ...(e.body === undefined ? {} : { body: e.body(ids) }),
        });
        const permitted =
          who !== 'anonymous' &&
          who !== 'player' &&
          (PERMISSIONS[e.permission] as readonly string[]).includes(who);
        const expected = who === 'anonymous' ? 401 : permitted ? e.ok : 403;
        results.push(
          `${e.method} ${e.path(ids)} as ${who}: ${res.status === expected ? 'ok' : `${res.status} != ${expected}`}`,
        );
      }
    }
    expect(results.filter((r) => !r.endsWith(': ok'))).toEqual([]);
  });

  it('records every operator write in the audit log, which cannot be changed', async () => {
    const { h, cookies, ids } = await setup();
    await call(h, 'POST', `/admin/users/${ids.user}/flag`, {
      cookie: cookies.moderator,
      body: { flagged: true, riskScore: 80, reason: 'bot cluster' },
    });
    const audit = await call(h, 'GET', '/admin/audit', { cookie: cookies.admin });
    const entries = audit.json['entries'] as {
      action: string;
      target: string;
      before: unknown;
      after: unknown;
      reason: string;
    }[];
    expect(entries[0]).toMatchObject({
      action: 'user.flag',
      target: `user:${ids.user}`,
      before: { flagged: false, riskScore: 0 },
      after: { flagged: true, riskScore: 80 },
      reason: 'bot cluster',
    });
    expect(entries.filter((e) => e.action === 'role.grant')).toHaveLength(3);

    await expect(h.database.db.update(auditLog).set({ reason: 'edited' })).rejects.toThrow();
    await expect(h.database.db.delete(auditLog)).rejects.toThrow();
    await expect(h.database.exec('TRUNCATE audit_log')).rejects.toThrow();
  });

  it('requires a reason for every write', async () => {
    const { h, cookies, ids } = await setup();
    const res = await call(h, 'POST', `/admin/users/${ids.user}/flag`, {
      cookie: cookies.admin,
      body: { flagged: true, riskScore: 10 },
    });
    expect(res.status).toBe(400);
  });

  it('a revoked role stops working', async () => {
    const { h, cookies } = await setup();
    const id = Number((await call(h, 'GET', '/me', { cookie: cookies.support })).json['id']);
    expect((await call(h, 'GET', '/admin/users?q=0x', { cookie: cookies.support })).status).toBe(
      200,
    );
    await call(h, 'POST', '/admin/roles', {
      cookie: cookies.admin,
      body: { userId: id, role: 'support', grant: false, reason: 'left the team' },
    });
    expect((await call(h, 'GET', '/admin/users?q=0x', { cookie: cookies.support })).status).toBe(
      403,
    );
  });
});
