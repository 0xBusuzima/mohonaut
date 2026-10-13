import { schema as idx } from '@mohonaut/indexer';
import { describe, expect, it } from 'vitest';
import type { Harness } from './helpers.js';
import { T0, call, harness, newWallet, signIn } from './helpers.js';

const NOW = Math.floor(T0 / 1000);

async function adminHarness(): Promise<{ h: Harness; admin: string }> {
  const wallet = newWallet();
  const h = await harness({ adminWallets: [wallet.address] });
  return { h, admin: await signIn(h, wallet) };
}

describe('announcements', () => {
  it('shows banners only inside their window and keeps a changelog', async () => {
    const { h, admin } = await adminHarness();
    const publish = (body: Record<string, unknown>) =>
      call(h, 'POST', '/admin/announcements', {
        cookie: admin,
        body: { body: '', endsAt: null, reason: 'test', ...body },
      });
    expect((await publish({ kind: 'banner', title: 'Live now', startsAt: NOW - 60 })).status).toBe(
      201,
    );
    await publish({ kind: 'maintenance', title: 'Later', startsAt: NOW + 3600 });
    await publish({ kind: 'banner', title: 'Over', startsAt: NOW - 7200, endsAt: NOW - 3600 });
    await publish({ kind: 'changelog', title: 'v0.4: crews', startsAt: NOW - 10 });

    const res = await call(h, 'GET', '/announcements');
    const json = res.json as { active: { title: string }[]; changelog: { title: string }[] };
    expect(json.active.map((a) => a.title)).toEqual(['Live now']);
    expect(json.changelog.map((a) => a.title)).toEqual(['v0.4: crews']);
    expect(res.res.headers.get('cache-control')).toBe('public, max-age=60');
  });

  it('ends an announcement now, audited, and rejects a window that ends before it starts', async () => {
    const { h, admin } = await adminHarness();
    const bad = await call(h, 'POST', '/admin/announcements', {
      cookie: admin,
      body: {
        kind: 'banner',
        title: 'Bad',
        body: '',
        startsAt: NOW,
        endsAt: NOW - 1,
        reason: 'x y z',
      },
    });
    expect(bad.status).toBe(400);
    const { json } = await call(h, 'POST', '/admin/announcements', {
      cookie: admin,
      body: {
        kind: 'banner',
        title: 'Up now',
        body: '',
        startsAt: NOW - 5,
        endsAt: null,
        reason: 'launch',
      },
    });
    const id = Number(json['id']);
    expect(
      (
        await call(h, 'POST', `/admin/announcements/${id}/end`, {
          cookie: admin,
          body: { reason: 'done' },
        })
      ).status,
    ).toBe(200);
    const active = (await call(h, 'GET', '/announcements')).json['active'] as unknown[];
    expect(active).toEqual([]);
    const audit = (await call(h, 'GET', '/admin/audit', { cookie: admin })).json['entries'] as {
      action: string;
      target: string;
    }[];
    expect(audit.slice(0, 2).map((a) => a.action)).toEqual([
      'announcement.end',
      'announcement.create',
    ]);
    expect(audit[0]?.target).toBe(`announcement:${id}`);
  });
});

describe('support inbox', () => {
  it('takes requests from signed-in and anonymous players and updates them with an audit trail', async () => {
    const { h, admin } = await adminHarness();
    const player = newWallet();
    const cookie = await signIn(h, player);
    const mine = await call(h, 'POST', '/support', {
      cookie,
      body: { topic: 'transaction', body: 'My refine has not arrived.', contact: '', wallet: null },
    });
    expect(mine.status).toBe(201);
    const anon = await call(h, 'POST', '/support', {
      body: {
        topic: 'safety',
        body: 'A fake site is copying the game.',
        contact: 'me@example.com',
        wallet: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
      },
    });
    expect(anon.status).toBe(201);

    const open = (await call(h, 'GET', '/admin/support', { cookie: admin })).json['tickets'] as {
      id: number;
      wallet: string | null;
      userId: number | null;
      contact: string | null;
    }[];
    expect(open).toHaveLength(2);
    const signedIn = open.find((t) => t.id === Number(mine.json['id']));
    expect(signedIn?.wallet).toBe(player.address);
    expect(signedIn?.contact).toBeNull();
    expect(open.find((t) => t.id === Number(anon.json['id']))?.wallet).toBe(
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    );

    const upd = await call(h, 'POST', `/admin/support/${String(mine.json['id'])}`, {
      cookie: admin,
      body: { status: 'closed', note: 'queue was 72 h; arrived', reason: 'resolved' },
    });
    expect(upd.status).toBe(200);
    const closed = (await call(h, 'GET', '/admin/support?status=closed', { cookie: admin })).json[
      'tickets'
    ] as { note: string }[];
    expect(closed.map((t) => t.note)).toEqual(['queue was 72 h; arrived']);
  });

  it('refuses short messages and needs the bot check', async () => {
    const { h } = await adminHarness();
    const short = await call(h, 'POST', '/support', {
      body: { topic: 'bug', body: 'help', contact: null, wallet: null },
    });
    expect(short.status).toBe(400);
    h.turnstileOk.value = false;
    const bot = await call(h, 'POST', '/support', {
      body: { topic: 'bug', body: 'Something is broken here.', contact: null, wallet: null },
    });
    expect(bot.status).toBe(403);
  });

  it('takes collaboration requests (migration 1003) and refuses unknown topics', async () => {
    const { h } = await adminHarness();
    const ok = await call(h, 'POST', '/support', {
      body: {
        topic: 'collab',
        body: 'A crew banner for our community, unpaid.',
        contact: '@someone',
        wallet: null,
      },
    });
    expect(ok.status).toBe(201);
    const bad = await call(h, 'POST', '/support', {
      body: { topic: 'promo', body: 'Pay me to post about you.', contact: null, wallet: null },
    });
    expect(bad.status).toBe(400);
  });
});

describe('player file and health', () => {
  it('collects a player’s roles, tickets and moderation history', async () => {
    const { h, admin } = await adminHarness();
    const player = newWallet();
    const cookie = await signIn(h, player);
    const id = Number((await call(h, 'GET', '/me', { cookie })).json['id']);
    await call(h, 'POST', '/support', {
      cookie,
      body: { topic: 'account', body: 'Please check my site name.', contact: null, wallet: null },
    });
    await call(h, 'POST', `/admin/users/${id}/flag`, {
      cookie: admin,
      body: { flagged: true, riskScore: 40, reason: 'shared funding' },
    });
    const res = await call(h, 'GET', `/admin/users/${id}`, { cookie: admin });
    expect(res.status).toBe(200);
    const file = res.json as {
      user: { wallet: string; flagged: boolean; roles: string[] };
      chain: unknown;
      tickets: unknown[];
      audit: { action: string; reason: string }[];
    };
    expect(file.user).toMatchObject({ wallet: player.address, flagged: true, roles: [] });
    expect(file.chain).toBeNull(); // no on-chain account yet
    expect(file.tickets).toHaveLength(1);
    expect(file.audit).toEqual([
      expect.objectContaining({ action: 'user.flag', reason: 'shared funding' }),
    ]);
    expect((await call(h, 'GET', '/admin/users/999999', { cookie: admin })).status).toBe(404);
  });

  it('reports indexer streams and the keeper balance, and survives a dead RPC', async () => {
    const { h, admin } = await adminHarness();
    h.deps.cfg = {
      ...h.deps.cfg,
      deployment: {
        ...h.deps.cfg.deployment,
        Keeper: '0xbA27372EaE81EE53d7D434deD7D3299A383C2a6c',
      },
    };
    h.deps.chain = { getBlockNumber: async () => 1234n, getBalance: async () => 5n * 10n ** 15n };
    const ok = (await call(h, 'GET', '/admin/health', { cookie: admin })).json;
    expect(ok).toMatchObject({
      head: '1234',
      lastHourClosedAt: null,
      keeper: {
        address: '0xbA27372EaE81EE53d7D434deD7D3299A383C2a6c',
        balanceWei: '5000000000000000',
      },
    });
    h.deps.chain = {
      getBlockNumber: async () => {
        throw new Error('rpc down');
      },
      getBalance: async () => 0n,
    };
    const down = (await call(h, 'GET', '/admin/health', { cookie: admin })).json;
    expect(down).toMatchObject({ head: null, keeper: { balanceWei: null } });
  });
});

describe('player file with an on-chain site', () => {
  it('shows the site, rigs and refine queue the indexer recorded (checksummed addresses)', async () => {
    const wallet = newWallet();
    const h = await harness({ adminWallets: [wallet.address] });
    const admin = await signIn(h, wallet);
    const player = newWallet();
    const cookie = await signIn(h, player);
    const id = Number((await call(h, 'GET', '/me', { cookie })).json['id']);
    // The indexer stores addresses as the chain's events carry them: checksummed.
    await h.database.db.insert(idx.accounts).values({
      address: player.address,
      siteLevel: 3,
      dp: 260n,
      fuelEth: 10n ** 15n,
      referrals: 2,
      registeredAt: 1n,
    });
    await h.database.db.insert(idx.refineRequests).values({
      account: player.address,
      requestId: 0n,
      amount: 5n * 10n ** 18n,
      readyAt: 2_000n,
      queuedAt: 1_000n,
    });
    const file = (await call(h, 'GET', `/admin/users/${id}`, { cookie: admin })).json as {
      chain: { siteLevel: number; referrals: number; refines: { amount: string }[] } | null;
    };
    expect(file.chain).toMatchObject({ siteLevel: 3, referrals: 2 });
    expect(file.chain?.refines).toEqual([
      expect.objectContaining({ amount: (5n * 10n ** 18n).toString() }),
    ]);
  });
});
