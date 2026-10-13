import { schema as idx } from '@mohonaut/indexer';
import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { cardSvg } from '../src/game/card.js';
import * as socialSchema from '../src/db/schema.js';
import { fleetEfficiency } from '../src/game/achievements.js';
import { formatDepth, stratumAt } from '@mohonaut/sdk';
import { T0, call, harness, mohn, newWallet, seedAccount, signIn } from './helpers.js';

const HOUR0 = BigInt(Math.floor(T0 / 3_600_000)) - 48n;

describe('depth', () => {
  it('formats small contributions in cm and mm', () => {
    expect(formatDepth(0n)).toBe('0 mm');
    expect(formatDepth(7n)).toBe('7 mm');
    expect(formatDepth(370n)).toBe('37 cm');
    expect(formatDepth(1_240_000n)).toBe('1,240 m');
  });

  it('places strata at the docs/02 §3.4 boundaries', () => {
    expect(stratumAt(0n).current.name).toBe('Regolith');
    expect(stratumAt(1_999_999n).current.name).toBe('Regolith');
    expect(stratumAt(2_000_000n).current.name).toBe('Sediment Cover');
    expect(stratumAt(12_262_000n).current.name).toBe('Archean Gneiss');
    expect(stratumAt(12_262_000n).next?.name).toBe('Granulite Floor');
    expect(stratumAt(90_000_000n).next).toBeNull();
  });
});

describe('world, economy and leaderboards', () => {
  it('reports the World Bore from accrued emission', async () => {
    const h = await harness();
    await h.database.db.insert(idx.hours).values([
      { hour: HOUR0, emitted: mohn(1_500_000) },
      { hour: HOUR0 + 1n, emitted: mohn(600_000) },
    ]);
    const world = await call(h, 'GET', '/world');
    expect(world.json).toMatchObject({
      depth: { mm: '2100000', text: '2,100 m' },
      stratum: { name: 'Sediment Cover' },
      next: { name: 'Granite Basement' },
    });
  });

  it('serves daily economy with the 28-day sink ratio', async () => {
    const h = await harness();
    const day0 = Math.floor(T0 / 86_400_000) - 29;
    const rows = Array.from({ length: 30 }, (_, i) => ({
      day: day0 + i,
      emitted: mohn(1000),
      spendBurn: mohn(i < 15 ? 100 : 500),
      feeBurn: 0n,
      buybackBurn: 0n,
      lpFeeBurn: 0n,
      recycled: mohn(i < 15 ? 25 : 125),
      buybackFundedEth: 0n,
      buybackEth: 0n,
      revenueEth: 0n,
      fuelEth: 0n,
      minted: 0n,
      tokenBurned: 0n,
      netEmission: mohn(i < 15 ? 900 : 500),
      sinkRatio: i < 15 ? 0.125 : 0.625,
      rcr: 0,
      pStarEth: 0,
      reserveEnd: null,
      newAccounts: 1,
      activeAccounts: 2,
    }));
    await h.database.db.insert(idx.economyDaily).values(rows);
    const res = await call(h, 'GET', '/economy/daily?days=3');
    const days = res.json['days'] as { day: number; sinkRatio: number; sinkRatio28d: number }[];
    expect(days.map((d) => d.day)).toEqual([day0 + 29, day0 + 28, day0 + 27]);
    expect(days[0]?.sinkRatio).toBe(0.625);
    // window of day0+29: days 2..29 = 13 low days + 15 high days
    expect(days[0]?.sinkRatio28d).toBeCloseTo((13 * 125 + 15 * 625) / (28 * 1000), 12);
    expect((await call(h, 'GET', '/economy/daily?days=0')).status).toBe(400);
  });

  it('ranks players and crews by contribution', async () => {
    const h = await harness();
    const [a, b, c] = [newWallet(), newWallet(), newWallet()];
    await seedAccount(h.database, a.address, { accrued: mohn(3000) });
    await seedAccount(h.database, b.address, { accrued: mohn(5000) });
    await seedAccount(h.database, c.address, { accrued: mohn(10) });
    const cookie = await signIn(h, b);
    await call(h, 'PATCH', '/me', { cookie, body: { displayName: 'Bea' } });
    const board = await call(h, 'GET', '/leaderboards/contribution?limit=2');
    expect(board.json['rows']).toEqual([
      {
        rank: 1,
        address: b.address,
        displayName: 'Bea',
        contribution: { mm: '5000', text: '5 m' },
      },
      { rank: 2, address: a.address, displayName: null, contribution: { mm: '3000', text: '3 m' } },
    ]);
    expect(board.json['you']).toBeUndefined();
    // A player outside the page asks for their own place too; a wallet without a site has none.
    const mine = await call(h, 'GET', `/leaderboards/contribution?limit=2&address=${c.address}`);
    expect(mine.json['you']).toEqual({ rank: 3, contribution: { mm: '10', text: '1 cm' } });
    const none = await call(
      h,
      'GET',
      `/leaderboards/contribution?address=${newWallet().address.toLowerCase()}`,
    );
    expect(none.json['you']).toBeNull();
    // Ties go by address, as on the board.
    const [d = a, e = a] = [newWallet(), newWallet()].sort((x, y) =>
      x.address < y.address ? -1 : 1,
    );
    await seedAccount(h.database, d.address, { accrued: mohn(3000) });
    await seedAccount(h.database, e.address, { accrued: mohn(3000) });
    const tied = (await call(h, 'GET', '/leaderboards/contribution?limit=10')).json['rows'] as {
      address: string;
      rank: number;
    }[];
    for (const w of [a, d, e]) {
      const place = tied.find((r) => r.address === w.address)?.rank;
      const asked = await call(h, 'GET', `/leaderboards/contribution?address=${w.address}`);
      expect((asked.json['you'] as { rank: number }).rank).toBe(place);
    }
    const crewId = Number(
      (await call(h, 'POST', '/crews', { cookie, body: { name: 'Bea Crew', tag: 'BEA' } })).json[
        'id'
      ],
    );
    const crews = await call(h, 'GET', '/leaderboards/crews');
    expect(crews.json['rows']).toEqual([
      {
        rank: null,
        id: crewId,
        name: 'Bea Crew',
        tag: 'BEA',
        members: 1,
        contribution: { mm: '5000', text: '5 m' },
      },
    ]);
  });
});

describe('profiles and badges', () => {
  it('shows a public profile with earned badges', async () => {
    const h = await harness();
    const player = newWallet();
    await seedAccount(h.database, player.address, {
      accrued: mohn(1240),
      fuelEth: 10n ** 16n,
      rigsBought: 2n,
      dp: 210n,
    });
    await h.database.db.insert(idx.machineTypes).values([
      {
        typeId: 0,
        generation: 1,
        dp: 10n,
        burn: 25n * 10n ** 16n,
        premiumBps: 0,
        minLevel: 1,
        addedAt: 0n,
      },
      {
        typeId: 1,
        generation: 1,
        dp: 100n,
        burn: 10n ** 18n,
        premiumBps: 1000,
        minLevel: 1,
        addedAt: 0n,
      },
    ]);
    await h.database.db.insert(idx.rigs).values([
      { account: player.address, typeId: 0, owned: 1n, active: 0n },
      { account: player.address, typeId: 1, owned: 2n, active: 2n },
    ]);
    // The World Bore passed the Kola Line in HOUR0 + 1, while the player was fuelled.
    await h.database.db.insert(idx.hours).values([
      { hour: HOUR0, emitted: mohn(12_000_000) },
      { hour: HOUR0 + 1n, emitted: mohn(500_000) },
    ]);
    await h.database.db.insert(idx.events).values({
      blockNumber: 5n,
      logIndex: 0,
      txHash: '0x01',
      blockTime: HOUR0 * 3600n,
      address: '0x1000000000000000000000000000000000000002',
      contract: 'MiningCore',
      event: 'PositionUpdated',
      topics: [],
      data: '0x',
      args: { account: player.address, dp: '210', expiryHour: (HOUR0 + 500n).toString() },
    });
    // A complete Fossils set: its title shows on the profile.
    const [user] = await h.database.db
      .insert(socialSchema.users)
      .values({ authProvider: 'siwe', providerUserId: player.address, wallet: player.address })
      .returning({ id: socialSchema.users.id });
    await h.database.db.insert(socialSchema.surveyFinds).values(
      Array.from({ length: 6 }, (_, i) => ({
        userId: user?.id ?? 0,
        day: 20_000 + i,
        itemId: `fossils-${i + 1}`,
      })),
    );
    const profile = await call(h, 'GET', `/profiles/${player.address.toLowerCase()}`);
    expect(profile.status).toBe(200);
    expect(profile.json['titles']).toEqual(['Fossil Hunter']);
    expect(profile.json).toMatchObject({
      address: player.address,
      registered: true,
      activeDp: '210',
      contribution: { text: '1 m' },
      crew: null,
    });
    const badges = (profile.json['badges'] as { id: string }[]).map((b) => b.id);
    // 2 active rigs of 100 DP burning 1 L/h each: efficiency 100 >= 80.
    expect(badges).toEqual(['spud-in', 'rig-up', 'fuel-saver', 'kola-witness', 'core-collector']);
    expect((await call(h, 'GET', `/profiles/${newWallet().address}`)).status).toBe(404);
    expect((await call(h, 'GET', '/profiles/0x123')).status).toBe(400);
  });

  it('gives a plaque for a top-10 place in a season that has ended, never to a flagged account', async () => {
    const h = await harness();
    const now = Math.floor(T0 / 1000);
    await h.database.db.insert(socialSchema.seasons).values([
      { name: 'Season 0', startsAt: now - 30 * 86_400, endsAt: now - 86_400 },
      { name: 'Season 1', startsAt: now - 86_400, endsAt: now + 50 * 86_400 },
    ]);
    // Twelve drillers in season 0; the most accrued first. The top one is flagged.
    const drillers = Array.from({ length: 12 }, () => newWallet().address);
    const d = (i: number): string => drillers[i] ?? '';
    await h.database.db.insert(idx.events).values(
      drillers.map((account, i) => ({
        blockNumber: BigInt(10 + i),
        logIndex: 0,
        txHash: `0x${(10 + i).toString(16)}`,
        blockTime: BigInt(now - 10 * 86_400),
        address: '0x1000000000000000000000000000000000000002',
        contract: 'MiningCore',
        event: 'Accrued',
        topics: [],
        data: '0x',
        args: { account, amount: mohn(1_000 - i).toString() },
      })),
    );
    await h.database.db.insert(socialSchema.users).values({
      authProvider: 'siwe',
      providerUserId: d(0),
      wallet: d(0),
      flagged: true,
    });
    for (const a of drillers) await seedAccount(h.database, a, {});
    const plaques = async (a: string) =>
      (await call(h, 'GET', `/profiles/${a}`)).json['plaques'] as unknown[];
    expect(await plaques(d(0))).toEqual([]);
    // The flagged account takes no place: the second becomes first, the eleventh tenth.
    expect(await plaques(d(1))).toEqual([{ season: 1, name: 'Season 0', rank: 1 }]);
    expect(await plaques(d(10))).toEqual([{ season: 1, name: 'Season 0', rank: 10 }]);
    expect(await plaques(d(11))).toEqual([]);
    // The public season table ranks the same way.
    const board = await call(h, 'GET', '/seasons/1/leaderboard');
    const rows = board.json['rows'] as { rank: number; address: string }[];
    expect(rows[0]).toMatchObject({ rank: 1, address: d(1) });
    expect(rows.map((r) => r.address)).not.toContain(d(0));

    // A season still running gives no plaque, however far ahead a driller is.
    await h.database.db.insert(idx.events).values({
      blockNumber: 99n,
      logIndex: 0,
      txHash: '0x99',
      blockTime: BigInt(now - 3_600),
      address: '0x1000000000000000000000000000000000000002',
      contract: 'MiningCore',
      event: 'Accrued',
      topics: [],
      data: '0x',
      args: { account: d(11), amount: mohn(1_000_000).toString() },
    });
    expect(await plaques(d(11))).toEqual([]);

    // An ended season's top ten is kept for ten minutes: a new flag counts after that.
    await h.database.db.insert(socialSchema.users).values({
      authProvider: 'siwe',
      providerUserId: d(1),
      wallet: d(1),
      flagged: true,
    });
    expect(await plaques(d(2))).toEqual([{ season: 1, name: 'Season 0', rank: 2 }]);
    h.clock.now += 601_000;
    expect(await plaques(d(1))).toEqual([]);
    expect(await plaques(d(2))).toEqual([{ season: 1, name: 'Season 0', rank: 1 }]);
  });

  it('computes fleet efficiency over active rigs only', () => {
    expect(fleetEfficiency([])).toBeNull();
    expect(fleetEfficiency([{ active: 1n, dp: 10n, burnWad: 25n * 10n ** 16n }])).toBe(40);
    expect(
      fleetEfficiency([
        { active: 1n, dp: 10n, burnWad: 25n * 10n ** 16n },
        { active: 0n, dp: 100n, burnWad: 10n ** 18n },
      ]),
    ).toBe(40);
  });
});

describe('contribution card', () => {
  it('renders a PNG without earnings or prices', async () => {
    const h = await harness();
    const player = newWallet();
    await seedAccount(h.database, player.address, { accrued: mohn(1_240_000) });
    const res = await h.app.request(`/cards/${player.address}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(bytes.length).toBeGreaterThan(10_000);

    const svg = cardSvg({
      contributionMm: 1_240_000n,
      worldDepthMm: 9_870_000n,
      crew: 'Night <Shift>',
      name: 'Bea',
      badges: ['spud-in', 'no-such-badge'],
    });
    expect(svg).toMatch(/I've cored <tspan[^>]*>1,240<\/tspan> m/);
    expect(svg).toContain('#FF6B1A'); // Safety Orange logo (docs/05 §2.4)
    expect(svg).toContain('Night &lt;Shift&gt;');
    // One plate (unknown ids are skipped), in the badge row at 4x.
    expect(svg).toMatch(/<rect x="68" y="462" /);
    expect(svg).not.toMatch(/<rect x="1[2-7]\d" y="(4[6-9]\d|50\d)" /);
    for (const banned of ['$', 'USD', 'ROI', 'APY', 'APR', 'profit', 'earn'])
      expect(svg).not.toContain(banned);
    // Season plaques follow the badges, best first and three at most: gold after one badge.
    const withPlaques = cardSvg({
      contributionMm: 1n,
      worldDepthMm: 1n,
      crew: null,
      name: 'Bea',
      badges: ['spud-in'],
      plaques: [7, 1, 4, 2],
      titles: ['Fossil Hunter', 'Rig <Historian>'],
    });
    expect(withPlaques).toContain(
      'Bea · <tspan fill="#FFB31A">Fossil Hunter</tspan> · <tspan fill="#FFB31A">Rig &lt;Historian&gt;</tspan>',
    );
    // A wide name and all four titles: the ones that do not fit before Foreman Mo become "+N".
    const crowded = cardSvg({
      contributionMm: 1n,
      worldDepthMm: 1n,
      crew: null,
      name: 'WWWWWWWWWWWWWWWWWWWW',
      titles: ['Fossil Hunter', 'Core Librarian', 'Bit Collector', 'Rig Historian'],
    });
    expect(crowded).toContain('WWWWWWWWWWWWWWWWWWWW · <tspan fill="#FFB31A">Fossil Hunter</tspan>');
    expect(crowded).not.toContain('Rig Historian');
    expect(crowded).toMatch(/<tspan fill="#FFB31A">\+[1-3]<\/tspan><\/text>/);
    // The first plaque is the gold one (its shine), in the slot after the badge.
    expect(withPlaques).toContain('<rect x="136" y="470" width="4" height="4" fill="#ffe27a"/>');
    expect(withPlaques).toContain('<rect x="248" y="466" width="40"'); // the third plaque
    expect(withPlaques).not.toContain('<rect x="368" y="466"'); // no fourth
    // No drill site yet: the site's own share image.
    const unknown = await h.app.request(`/cards/${getAddress(newWallet().address)}`);
    expect(unknown.status).toBe(302);
    expect(unknown.headers.get('location')).toBe('https://mohonaut.com/og.png');
  });
});

describe('timelock queue', () => {
  it('lists pending operations soonest first and recent executed or cancelled ones', async () => {
    const h = await harness();
    const base = {
      timelock: 'ParamsTimelock',
      opIndex: 0,
      target: '0x1000000000000000000000000000000000000002',
      value: 0n,
      data: '0x',
      predecessor: '0x00',
      delay: 345_600n,
      fn: 'setParam',
      args: [0, '120000000000000000'],
    };
    await h.database.db.insert(idx.timelockOps).values([
      { ...base, opId: '0xa', scheduledAt: 100n, readyAt: 500n, salt: '0x5a' },
      { ...base, opId: '0xb', scheduledAt: 50n, readyAt: 400n },
      { ...base, opId: '0xc', scheduledAt: 10n, readyAt: 20n, executedAt: 30n },
      { ...base, opId: '0xd', scheduledAt: 10n, readyAt: 20n, cancelledAt: 40n },
    ]);
    const res = await call(h, 'GET', '/governance/timelock');
    const json = res.json as unknown as { pending: { opId: string }[]; recent: { opId: string }[] };
    expect(json.pending.map((o) => o.opId)).toEqual(['0xb', '0xa']);
    expect(json.recent.map((o) => o.opId)).toEqual(['0xd', '0xc']);
    expect(res.json['pending']).toMatchObject([
      { fn: 'setParam', args: [0, '120000000000000000'], salt: null },
      { salt: '0x5a', data: '0x', value: '0', predecessor: '0x00', delay: 345_600 },
    ]);
  });

  it('lists every parameter changed so far', async () => {
    const h = await harness();
    await h.database.db.insert(idx.params).values({
      param: 0,
      name: 'FuelPrice',
      value: 12n * 10n ** 16n,
      previous: 10n ** 17n,
      changedAt: 1_800_000_000n,
    });
    const res = await call(h, 'GET', '/governance/params');
    expect(res.json).toEqual({
      params: [
        {
          param: 0,
          name: 'FuelPrice',
          value: '120000000000000000',
          previous: '100000000000000000',
          changedAt: 1_800_000_000,
        },
      ],
    });
  });
});

describe('DP price by day', () => {
  it('averages what was paid per DP each day, weighted by DP sold, oldest first', async () => {
    const h = await harness();
    const today = Math.floor(T0 / 1000 / 86_400);
    const at = (daysAgo: number, hour: number) => BigInt((today - daysAgo) * 86_400 + hour * 3600);
    const WAD = 10n ** 18n;
    const sale = (n: number, time: bigint, units: bigint, perDp: bigint) => ({
      blockNumber: BigInt(n),
      logIndex: 0,
      time,
      account: '0x0000000000000000000000000000000000000001',
      typeId: 1,
      qty: 1n,
      units,
      cost: perDp * units,
      // The indexer keeps the price per DP scaled by WAD.
      avgUnitPriceWad: perDp * WAD,
    });
    await h.database.db.insert(idx.vrgdaSales).values([
      sale(1, at(8, 1), 50n, 9n * WAD), // before the window
      sale(2, at(2, 3), 50n, 10n * WAD),
      sale(3, at(2, 9), 150n, 8n * WAD),
      sale(4, at(0, 1), 50n, 12n * WAD),
    ]);
    const res = await call(h, 'GET', '/market/prices');
    expect(res.status).toBe(200);
    const days = res.json['days'] as { day: number; perDp: string | null; sales: number }[];
    expect(days).toHaveLength(7);
    expect(days[0]?.day).toBe(today - 6);
    expect(days.map((d) => d.sales)).toEqual([0, 0, 0, 0, 2, 0, 1]);
    // (50 x 10 + 150 x 8) / 200 = 8.5 MOHN per DP.
    expect(days[4]?.perDp).toBe(((85n * WAD) / 10n).toString());
    expect(days[6]?.perDp).toBe((12n * WAD).toString());
    expect(days[0]?.perDp).toBeNull();
  });
});

describe('DP price by day, edges', () => {
  it('cuts days at UTC midnight, skips rows without units, and follows a chain that runs ahead', async () => {
    const h = await harness();
    const today = Math.floor(T0 / 1000 / 86_400);
    const WAD = 10n ** 18n;
    const row = (n: number, time: number, units: bigint | null) => ({
      blockNumber: BigInt(n),
      logIndex: 0,
      time: BigInt(time),
      account: '0x0000000000000000000000000000000000000001',
      typeId: 1,
      qty: 1n,
      units,
      cost: 1n,
      avgUnitPriceWad: 10n * WAD * WAD,
    });
    await h.database.db.insert(idx.vrgdaSales).values([
      row(1, today * 86_400, 50n), // exactly midnight: today
      row(2, today * 86_400 - 1, 50n), // a second before: yesterday
      row(3, today * 86_400 + 60, null), // no units: skipped
    ]);
    const res = await call(h, 'GET', '/market/prices');
    expect(res.res.headers.get('cache-control')).toBe('public, max-age=30');
    const days = res.json['days'] as { day: number; sales: number }[];
    expect(days.slice(-2).map((d) => d.sales)).toEqual([1, 1]);

    // A sale a day ahead of the API's clock (the chain runs ahead): that day is today.
    await h.database.db.insert(idx.vrgdaSales).values([row(4, (today + 1) * 86_400 + 5, 50n)]);
    const ahead = (await call(h, 'GET', '/market/prices')).json['days'] as { day: number }[];
    expect(ahead.at(-1)?.day).toBe(today + 1);

    expect((await call(h, 'GET', '/market/prices?days=0')).status).toBe(400);
    expect((await call(h, 'GET', '/market/prices?days=31')).status).toBe(400);
  });
});
