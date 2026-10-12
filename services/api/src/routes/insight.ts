import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { schema as idx } from '@mohonaut/indexer';
import { desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { AppEnv } from '../context.js';
import { requirePermission } from '../rbac.js';
import { rateLimit } from '../security.js';
import { AmountSchema, errors, json } from './common.js';

/**
 * Operator views of the economy (docs/03 §5 modules 1 and 8): hourly flows, balance
 * distribution, join cohorts, recent market sales and referral trees. Read-only; the public
 * daily series stays on /economy/daily.
 */
const HOUR_FIELDS = [
  'emitted',
  'spendBurn',
  'feeBurn',
  'buybackBurn',
  'lpFeeBurn',
  'recycled',
  'buybackEth',
  'revenueEth',
  'fuelEth',
  'polEthAdded',
  'machineSpend',
  'siteSpend',
  'dpSold',
] as const;

/** Referees of one referrer who registered within the same hour count as a burst. */
const BURST = 5;

export function registerInsight(app: OpenAPIHono<AppEnv>): void {
  const limited = rateLimit('admin', 120, 60, true);

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/economy',
      tags: ['admin'],
      summary: 'Hourly flows, balance distribution, cohorts and recent market sales',
      middleware: [requirePermission('economy.read'), limited] as const,
      responses: {
        200: json(
          z.object({
            hours: z.array(
              z.object({
                hour: z.number(),
                newAccounts: z.number(),
                ...Object.fromEntries(HOUR_FIELDS.map((f) => [f, AmountSchema])),
              }),
            ),
            distribution: z.array(
              z.object({
                day: z.number(),
                kind: z.string(),
                wallets: z.number(),
                total: AmountSchema,
                gini: z.number().nullable(),
                nakamoto: z.number().nullable(),
                top10Share: z.number().nullable(),
              }),
            ),
            cohorts: z.array(
              z.object({ cohortWeek: z.number(), weeksAfter: z.number(), active: z.number() }),
            ),
            sales: z.array(
              z.object({
                time: z.number(),
                account: z.string(),
                typeId: z.number(),
                qty: z.number(),
                cost: AmountSchema,
                avgUnitPriceWad: AmountSchema.nullable(),
              }),
            ),
          }),
          'Economy',
        ),
        401: errors[401],
        403: errors[403],
      },
    }),
    async (c) => {
      const database = c.var.deps.database;
      const db = database.db;
      const hours = await db.select().from(idx.hours).orderBy(desc(idx.hours.hour)).limit(48);
      const latest = await db
        .select({ day: sql<number>`max(${idx.distributionDaily.day})` })
        .from(idx.distributionDaily);
      const day = latest[0]?.day ?? null;
      const distribution =
        day === null
          ? []
          : await db.select().from(idx.distributionDaily).where(eq(idx.distributionDaily.day, day));
      const cohorts = await database.query(
        'SELECT cohort_week, weeks_after, active_accounts FROM cohort_weekly ORDER BY cohort_week DESC, weeks_after LIMIT 200',
      );
      const sales = await db
        .select()
        .from(idx.vrgdaSales)
        .orderBy(desc(idx.vrgdaSales.blockNumber), desc(idx.vrgdaSales.logIndex))
        .limit(30);
      return c.json(
        {
          hours: hours.map((h) => ({
            hour: Number(h.hour),
            newAccounts: h.newAccounts,
            ...Object.fromEntries(HOUR_FIELDS.map((f) => [f, h[f].toString()])),
          })),
          distribution: distribution.map((d) => ({
            day: d.day,
            kind: d.kind,
            wallets: d.holders,
            total: d.total.toString(),
            gini: d.gini,
            nakamoto: d.nakamoto,
            top10Share: d.top10Share,
          })),
          cohorts: cohorts.map((r) => ({
            cohortWeek: Number(r['cohort_week']),
            weeksAfter: Number(r['weeks_after']),
            active: Number(r['active_accounts']),
          })),
          sales: sales.map((s) => ({
            time: Number(s.time),
            account: s.account,
            typeId: s.typeId,
            qty: Number(s.qty),
            cost: s.cost.toString(),
            avgUnitPriceWad: s.avgUnitPriceWad === null ? null : s.avgUnitPriceWad.toString(),
          })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/referrals',
      tags: ['admin'],
      summary: 'Largest referral trees, with simple signals of farming (display only)',
      middleware: [requirePermission('referrals.read'), limited] as const,
      responses: {
        200: json(
          z.object({
            referred: z.number(),
            referrers: z.array(
              z.object({
                address: z.string(),
                referrals: z.number(),
                bonusPaid: AmountSchema,
                refereesFuelEth: AmountSchema,
                largestHourlyBurst: z.number(),
                burst: z.boolean(),
              }),
            ),
          }),
          'Referrals',
        ),
        401: errors[401],
        403: errors[403],
      },
    }),
    async (c) => {
      const database = c.var.deps.database;
      const top = await database.db
        .select()
        .from(idx.accounts)
        .where(sql`${idx.accounts.referrals} > 0`)
        .orderBy(desc(idx.accounts.referrals), idx.accounts.address)
        .limit(50);
      const [{ referred } = { referred: 0 }] = await database.db
        .select({ referred: sql<number>`count(*)::int` })
        .from(idx.accounts)
        .where(isNotNull(idx.accounts.referrer));
      const stats = await database.query(
        `SELECT referrer, coalesce(sum(fuel_eth), 0)::text AS fuel,
                coalesce(max(per_hour), 0)::int AS burst
           FROM (SELECT referrer, fuel_eth,
                        count(*) OVER (PARTITION BY referrer, registered_at / 3600) AS per_hour
                   FROM accounts WHERE referrer IS NOT NULL) r
          GROUP BY referrer`,
      );
      const byReferrer = new Map(stats.map((s) => [String(s['referrer']), s]));
      return c.json(
        {
          referred: Number(referred),
          referrers: top.map((a) => {
            const s = byReferrer.get(a.address);
            const largest = Number(s?.['burst'] ?? 0);
            return {
              address: a.address,
              referrals: a.referrals,
              bonusPaid: a.referralEarned.toString(),
              refereesFuelEth: String(s?.['fuel'] ?? '0'),
              largestHourlyBurst: largest,
              burst: largest >= BURST,
            };
          }),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/season0',
      tags: ['admin'],
      summary: 'Season 0: sign-ups per day, the Pioneer milestone funnel and D1/D7 return',
      middleware: [requirePermission('economy.read'), limited] as const,
      responses: {
        200: json(
          z.object({
            signups: z.array(z.object({ day: z.number(), count: z.number() })),
            funnel: z.object({
              registered: z.number(),
              firstRig: z.number(),
              siteLevel3: z.number(),
              refined: z.number(),
              inCrew: z.number(),
              allFive: z.number(),
              flagged: z.number(),
            }),
            retention: z.object({
              eligibleD1: z.number(),
              returnedD1: z.number(),
              eligibleD7: z.number(),
              returnedD7: z.number(),
            }),
          }),
          'Season 0',
        ),
        401: errors[401],
        403: errors[403],
      },
    }),
    async (c) => {
      const database = c.var.deps.database;
      const today = Math.floor(c.var.deps.now() / 1000 / 86_400);
      const signups = await database.query(
        `SELECT (registered_at / 86400)::int AS day, count(*)::int AS n
           FROM accounts WHERE registered_at IS NOT NULL GROUP BY 1 ORDER BY 1`,
      );
      // One row per registered account with each milestone (crew and flag come from the API's
      // users, joined by wallet; the indexer and the API share one database).
      const [f] = await database.query(
        `WITH a AS (
           SELECT acc.address,
                  acc.rigs_bought > 0 AS rig,
                  acc.site_level >= 3 AS l3,
                  (acc.refined > 0 OR EXISTS (SELECT 1 FROM refine_requests r WHERE r.account = acc.address)) AS refined,
                  EXISTS (SELECT 1 FROM users u JOIN crew_members m ON m.user_id = u.id
                           WHERE u.wallet = acc.address) AS crew,
                  EXISTS (SELECT 1 FROM users u WHERE u.wallet = acc.address AND u.flagged) AS flagged
             FROM accounts acc WHERE acc.registered_at IS NOT NULL)
         SELECT count(*)::int AS registered,
                count(*) FILTER (WHERE rig)::int AS first_rig,
                count(*) FILTER (WHERE l3)::int AS l3,
                count(*) FILTER (WHERE refined)::int AS refined,
                count(*) FILTER (WHERE crew)::int AS crew,
                count(*) FILTER (WHERE rig AND l3 AND refined AND crew AND NOT flagged)::int AS all_five,
                count(*) FILTER (WHERE flagged)::int AS flagged
           FROM a`,
      );
      // D1 / D7: of the accounts registered at least N days ago, how many acted on day N.
      const [r] = await database.query(
        `WITH reg AS (SELECT address, (registered_at / 86400)::int AS d0 FROM accounts
                       WHERE registered_at IS NOT NULL)
         SELECT count(*) FILTER (WHERE d0 + 1 < ${today})::int AS e1,
                count(*) FILTER (WHERE d0 + 1 < ${today} AND EXISTS (
                  SELECT 1 FROM account_days x WHERE x.account = reg.address AND x.day = reg.d0 + 1))::int AS r1,
                count(*) FILTER (WHERE d0 + 7 < ${today})::int AS e7,
                count(*) FILTER (WHERE d0 + 7 < ${today} AND EXISTS (
                  SELECT 1 FROM account_days x WHERE x.account = reg.address AND x.day = reg.d0 + 7))::int AS r7
           FROM reg`,
      );
      const n = (row: Record<string, unknown> | undefined, k: string) => Number(row?.[k] ?? 0);
      return c.json(
        {
          signups: signups.map((s) => ({ day: Number(s['day']), count: Number(s['n']) })),
          funnel: {
            registered: n(f, 'registered'),
            firstRig: n(f, 'first_rig'),
            siteLevel3: n(f, 'l3'),
            refined: n(f, 'refined'),
            inCrew: n(f, 'crew'),
            allFive: n(f, 'all_five'),
            flagged: n(f, 'flagged'),
          },
          retention: {
            eligibleD1: n(r, 'e1'),
            returnedD1: n(r, 'r1'),
            eligibleD7: n(r, 'e7'),
            returnedD7: n(r, 'r7'),
          },
        },
        200,
      );
    },
  );
}
