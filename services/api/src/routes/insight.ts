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
}
