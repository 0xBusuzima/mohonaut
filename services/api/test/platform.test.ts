import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { apiTables } from '../src/db/schema.js';
import { MemoryStore } from '../src/store.js';
import { call, harness, newWallet, signIn } from './helpers.js';

describe('rate limits', () => {
  it('limits sign-in attempts per IP and resets with the window', async () => {
    const h = await harness();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++)
      statuses.push((await call(h, 'GET', '/auth/nonce', { ip: '192.0.2.1' })).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    const limited = await call(h, 'GET', '/auth/nonce', { ip: '192.0.2.1' });
    expect(limited.status).toBe(429);
    expect(limited.res.headers.get('retry-after')).toBe('60');
    // Another IP is unaffected; the same IP recovers in the next window.
    expect((await call(h, 'GET', '/auth/nonce', { ip: '192.0.2.2' })).status).toBe(200);
    h.clock.now += 60_000;
    expect((await call(h, 'GET', '/auth/nonce', { ip: '192.0.2.1' })).status).toBe(200);
  });

  it('limits per player, not per IP, where a player is signed in', async () => {
    const h = await harness();
    const a = await signIn(h, newWallet(), '192.0.2.10');
    const b = await signIn(h, newWallet(), '192.0.2.10');
    for (let i = 0; i < 10; i++) {
      await call(h, 'POST', '/survey', { cookie: a, body: {}, ip: '192.0.2.10' });
    }
    expect(
      (await call(h, 'POST', '/survey', { cookie: a, body: {}, ip: '192.0.2.10' })).status,
    ).toBe(429);
    expect(
      (await call(h, 'POST', '/survey', { cookie: b, body: {}, ip: '192.0.2.10' })).status,
    ).toBe(200);
  });

  it('memory store counters expire', async () => {
    let now = 0;
    const store = new MemoryStore(() => now);
    expect(await store.incr('k', 10)).toBe(1);
    expect(await store.incr('k', 10)).toBe(2);
    now = 10_000;
    expect(await store.incr('k', 10)).toBe(1);
    await store.set('n', 'v', 5);
    expect(await store.take('n')).toBe('v');
    expect(await store.take('n')).toBeNull();
  });
});

describe('OpenAPI', () => {
  it('documents every route', async () => {
    const h = await harness();
    const doc = await call(h, 'GET', '/openapi.json');
    const paths = Object.keys(doc.json['paths'] as object).sort();
    expect(paths).toEqual(
      [
        '/admin/audit',
        '/admin/crews/{id}/rename',
        '/admin/roles',
        '/admin/seasons',
        '/admin/users',
        '/admin/users/{id}/flag',
        '/auth/external',
        '/auth/logout',
        '/auth/nonce',
        '/auth/siwe',
        '/cards/{address}',
        '/crews',
        '/crews/leave',
        '/crews/{id}',
        '/crews/{id}/join',
        '/economy/daily',
        '/leaderboards/contribution',
        '/leaderboards/crews',
        '/me',
        '/me/collection',
        '/me/notifications',
        '/profiles/{address}',
        '/seasons',
        '/seasons/{id}/leaderboard',
        '/survey',
        '/world',
      ].sort(),
    );
  });

  it('answers unknown paths and health checks', async () => {
    const h = await harness();
    expect((await call(h, 'GET', '/nope')).status).toBe(404);
    expect((await h.app.request('/healthz')).status).toBe(200);
    const res = await h.app.request('/world');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('schema', () => {
  it.each(apiTables.map((t) => [getTableConfig(t).name, t] as const))(
    'Drizzle table %s matches migrations/1001_api_init.sql',
    async (name, table) => {
      const h = await harness();
      const rows = await h.database.query(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${name}' ORDER BY column_name`,
      );
      const actual = rows.map((r) => [
        r['column_name'],
        r['data_type'],
        r['is_nullable'] === 'YES',
      ]);
      const expected = getTableConfig(table)
        .columns.map((c) => [
          c.name,
          c
            .getSQLType()
            .replace(/\(.*\)$/, '')
            .replace('bigserial', 'bigint')
            .replace('serial', 'integer')
            .replace('timestamp with time zone', 'timestamp with time zone'),
          !c.notNull,
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      expect(actual).toEqual(expected);
    },
  );
});

describe('configuration', () => {
  const base = {
    DATABASE_URL: 'memory://',
    DEPLOYMENT_FILE: new URL('../../../deployments/46630.json', import.meta.url).pathname.replace(
      /^\/([A-Za-z]:)/,
      '$1',
    ),
    WEB_ORIGIN: 'https://mohonaut.com/play',
    SURVEY_SECRET: 's'.repeat(32),
  };

  it('normalises the origin and parses admin wallets', () => {
    const wallet = newWallet().address;
    const cfg = loadConfig({ ...base, ADMIN_WALLETS: ` ${wallet.toLowerCase()} ` });
    expect(cfg.webOrigin).toBe('https://mohonaut.com');
    expect(cfg.adminWallets).toEqual([wallet]);
  });

  it('refuses an unsafe production setup', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', REDIS_URL: 'redis://x' })).toThrow(
      'TURNSTILE_SECRET',
    );
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', TURNSTILE_SECRET: 'x' })).toThrow(
      'REDIS_URL',
    );
    expect(() => loadConfig({ ...base, SURVEY_SECRET: 'short' })).toThrow();
    expect(() => loadConfig({ ...base, EXTERNAL_AUTH_NAME: 'privy' })).toThrow('EXTERNAL_AUTH');
  });
});

describe('metrics', () => {
  it('counts requests by route template, not raw path', async () => {
    const h = await harness();
    await h.app.request('/world');
    await h.app.request('/profiles/0x0000000000000000000000000000000000000001');
    await h.app.request('/does-not-exist');
    const text = (await h.deps.metrics?.registry.metrics()) ?? '';
    expect(text).toContain('api_requests_total{route="/world",method="GET",status="200"} 1');
    expect(text).toContain(
      'api_requests_total{route="/profiles/:address",method="GET",status="404"} 1',
    );
    expect(text).toContain('api_requests_total{route="unmatched",method="GET",status="404"} 1');
    expect(text).not.toContain('0x0000000000000000000000000000000000000001');
  });
});
