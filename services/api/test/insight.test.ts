import { schema as idx } from '@mohonaut/indexer';
import { describe, expect, it } from 'vitest';
import { crewMembers, crews, users } from '../src/db/schema.js';
import { call, harness, newWallet, signIn } from './helpers.js';

const E18 = 10n ** 18n;
const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;

describe('operator economy views', () => {
  it('serves hourly flows, the latest distribution, cohorts and recent sales', async () => {
    const admin = newWallet();
    const h = await harness({ adminWallets: [admin.address] });
    const cookie = await signIn(h, admin);
    const db = h.database.db;
    await db.insert(idx.hours).values([
      { hour: 500_000n, emitted: 2083n * E18, spendBurn: 10n * E18, newAccounts: 3 },
      { hour: 500_001n, emitted: 2080n * E18, buybackBurn: 5n * E18, newAccounts: 1 },
    ]);
    await db.insert(idx.distributionDaily).values([
      {
        day: 20_800,
        kind: 'mohn',
        holders: 10,
        total: 100n,
        gini: 0.5,
        nakamoto: 2,
        top10Share: 0.9,
      },
      {
        day: 20_801,
        kind: 'mohn',
        holders: 12,
        total: 120n,
        gini: 0.45,
        nakamoto: 3,
        top10Share: 0.8,
      },
      { day: 20_801, kind: 'dp', holders: 8, total: 900n, gini: 0.3, nakamoto: 2, top10Share: 1 },
    ]);
    await db.insert(idx.vrgdaSales).values({
      blockNumber: 10n,
      logIndex: 1,
      time: 1_800_000_000n,
      account: addr(1),
      typeId: 1,
      qty: 2n,
      units: 100n,
      cost: 500n * E18,
      avgUnitPriceWad: 5n * E18,
    });

    const res = await call(h, 'GET', '/admin/economy', { cookie });
    expect(res.status).toBe(200);
    const json = res.json as {
      hours: { hour: number; emitted: string; buybackBurn: string }[];
      distribution: { kind: string; day: number }[];
      sales: { qty: number; cost: string }[];
    };
    expect(json.hours.map((r) => r.hour)).toEqual([500_001, 500_000]);
    expect(json.hours[0]).toMatchObject({
      emitted: (2080n * E18).toString(),
      buybackBurn: (5n * E18).toString(),
    });
    expect(json.distribution.map((d) => `${d.kind}@${d.day}`).sort()).toEqual([
      'dp@20801',
      'mohn@20801',
    ]);
    expect(json.sales).toEqual([
      expect.objectContaining({ qty: 2, cost: (500n * E18).toString() }),
    ]);
  });

  it('ranks referral trees and flags a burst of sign-ups in one hour', async () => {
    const admin = newWallet();
    const h = await harness({ adminWallets: [admin.address] });
    const cookie = await signIn(h, admin);
    const farm = addr(100);
    const honest = addr(200);
    await h.database.db.insert(idx.accounts).values([
      { address: farm, referrals: 6, referralEarned: 3n * E18, registeredAt: 1_000n },
      { address: honest, referrals: 2, referralEarned: E18, registeredAt: 1_000n },
      // Six referees of `farm` inside one hour, two of `honest` a day apart.
      ...[1, 2, 3, 4, 5, 6].map((i) => ({
        address: addr(i),
        referrer: farm,
        registeredAt: 7_200n + BigInt(i),
        fuelEth: 10n ** 14n,
      })),
      { address: addr(7), referrer: honest, registeredAt: 7_200n, fuelEth: 10n ** 16n },
      { address: addr(8), referrer: honest, registeredAt: 93_600n, fuelEth: 10n ** 16n },
    ]);
    const res = await call(h, 'GET', '/admin/referrals', { cookie });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({
      referred: 8,
      referrers: [
        {
          address: farm,
          referrals: 6,
          bonusPaid: (3n * E18).toString(),
          refereesFuelEth: (6n * 10n ** 14n).toString(),
          largestHourlyBurst: 6,
          burst: true,
        },
        {
          address: honest,
          referrals: 2,
          bonusPaid: E18.toString(),
          refereesFuelEth: (2n * 10n ** 16n).toString(),
          largestHourlyBurst: 1,
          burst: false,
        },
      ],
    });
  });
});

describe('Season 0 analytics', () => {
  it('counts sign-ups, the Pioneer funnel and D1/D7 returns', async () => {
    const admin = newWallet();
    const h = await harness({ adminWallets: [admin.address] });
    const cookie = await signIn(h, admin);
    const db = h.database.db;
    const DAY = 86_400n;
    const today = BigInt(Math.floor(h.clock.now / 1000)) / DAY;
    const d0 = today - 10n; // registered ten days ago: D1 and D7 are both eligible
    // A: all five milestones; B: rig only; C: registered yesterday (not eligible yet).
    const [a, b, cc] = [addr(1), addr(2), addr(3)];
    await db.insert(idx.accounts).values([
      { address: a, registeredAt: d0 * DAY + 100n, rigsBought: 2n, siteLevel: 3, refined: 1n },
      { address: b, registeredAt: d0 * DAY + 200n, rigsBought: 1n, siteLevel: 1 },
      { address: cc, registeredAt: (today - 1n) * DAY },
    ]);
    await db.insert(idx.accountDays).values([
      { account: a, day: Number(d0 + 1n) },
      { account: a, day: Number(d0 + 7n) },
      { account: b, day: Number(d0 + 1n) },
    ]);
    // A is in a crew through its API user.
    const [user] = await db
      .insert(users)
      .values({ wallet: a, authProvider: 'siwe', providerUserId: 'a' })
      .returning({ id: users.id });
    const [crew] = await db
      .insert(crews)
      .values({ name: 'Night Shift', tag: 'NIGHT', captainUserId: user?.id ?? 0 })
      .returning({ id: crews.id });
    await db.insert(crewMembers).values({ userId: user?.id ?? 0, crewId: crew?.id ?? 0 });

    const res = await call(h, 'GET', '/admin/season0', { cookie });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({
      signups: [
        { day: Number(d0), count: 2 },
        { day: Number(today - 1n), count: 1 },
      ],
      funnel: {
        registered: 3,
        firstRig: 2,
        siteLevel3: 1,
        refined: 1,
        inCrew: 1,
        allFive: 1,
        flagged: 0,
      },
      retention: { eligibleD1: 2, returnedD1: 2, eligibleD7: 2, returnedD7: 1 },
    });
  });
});
