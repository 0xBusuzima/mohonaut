import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { addFlows, revenueCoverageRatio, sinkRatio, ZERO_FLOWS } from '@mohonaut/sdk';
import type { Flows } from '@mohonaut/sdk';
import type { AppEnv } from '../context.js';
import { contributionRanking, crewRanking, dpSales, economyDays, worldEmitted } from '../data.js';
import { KOLA_LINE_M, MOHO_LINE_M, formatDepth, millimetres, stratumAt } from '@mohonaut/sdk';
import { AddressSchema, AmountSchema, DepthSchema, json } from './common.js';

const depth = (mm: bigint) => ({ mm: mm.toString(), text: formatDepth(mm) });

const StratumSchema = z.object({ numeral: z.string(), name: z.string(), fromM: z.number() });

const nullableNumber = (x: number | null) => (x === null || !Number.isFinite(x) ? null : x);

export function registerWorld(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/world',
      tags: ['world'],
      summary: 'World Bore depth and stratum (docs/02 §3.4)',
      responses: {
        200: json(
          z.object({
            depth: DepthSchema,
            stratum: StratumSchema,
            next: StratumSchema.nullable(),
            kolaLineM: z.number(),
            mohoLineM: z.number(),
          }),
          'World Bore',
        ),
      },
    }),
    async (c) => {
      const mm = millimetres(await worldEmitted(c.var.deps.database));
      const { current, next } = stratumAt(mm);
      c.header('Cache-Control', 'public, max-age=60');
      return c.json(
        {
          depth: depth(mm),
          stratum: current,
          next,
          kolaLineM: KOLA_LINE_M,
          mohoLineM: MOHO_LINE_M,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/market/prices',
      tags: ['economy'],
      summary:
        'The auction price of Drill Power, day by day (docs/01 §4.4): the average paid per DP before tier premiums, oldest first',
      request: { query: z.object({ days: z.coerce.number().int().min(1).max(30).default(7) }) },
      responses: {
        200: json(
          z.object({
            days: z.array(
              z.object({
                day: z.number(),
                date: z.string(),
                /** Wei of $MOHN per DP, weighted by DP sold; null on a day without sales. */
                perDp: AmountSchema.nullable(),
                dpSold: AmountSchema,
                sales: z.number(),
              }),
            ),
          }),
          'DP price by day',
        ),
      },
    }),
    async (c) => {
      const { days } = c.req.valid('query');
      const today = Math.floor(c.var.deps.now() / 1000 / 86_400);
      const first = today - days + 1;
      const sales = await dpSales(c.var.deps.database, first * 86_400);
      const out = Array.from({ length: days }, (_, i) => {
        const day = first + i;
        const rows = sales.filter(
          (s) => Math.floor(Number(s.time) / 86_400) === day && s.units !== null && s.units > 0n,
        );
        const dpSold = rows.reduce((n, s) => n + (s.units ?? 0n), 0n);
        const paid = rows.reduce((n, s) => n + (s.avgUnitPriceWad ?? 0n) * (s.units ?? 0n), 0n);
        return {
          day,
          date: new Date(day * 86_400_000).toISOString().slice(0, 10),
          perDp: dpSold === 0n ? null : (paid / dpSold / 10n ** 18n).toString(),
          dpSold: dpSold.toString(),
          sales: rows.length,
        };
      });
      c.header('Cache-Control', 'public, max-age=30');
      return c.json({ days: out }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/economy/daily',
      tags: ['economy'],
      summary: 'Daily economy (newest first) with the 28-day sink ratio (docs/02 §10)',
      request: { query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) },
      responses: {
        200: json(
          z.object({
            days: z.array(
              z.object({
                day: z.number(),
                date: z.string(),
                emitted: AmountSchema,
                burned: AmountSchema,
                recycled: AmountSchema,
                netEmission: AmountSchema,
                buybackEth: AmountSchema,
                revenueEth: AmountSchema,
                sinkRatio: z.number().nullable(),
                sinkRatio28d: z.number().nullable(),
                rcr: z.number().nullable(),
                pStarEth: z.number().nullable(),
                newAccounts: z.number(),
                activeAccounts: z.number(),
              }),
            ),
          }),
          'Days',
        ),
      },
    }),
    async (c) => {
      const { days } = c.req.valid('query');
      // 27 extra days so the oldest returned day has a full 28-day window.
      const rows = (await economyDays(c.var.deps.database, days + 27)).reverse();
      const flowsOf = (r: (typeof rows)[number]): Flows => ({
        emitted: r.emitted,
        spendBurn: r.spendBurn,
        feeBurn: r.feeBurn,
        buybackBurn: r.buybackBurn,
        lpFeeBurn: r.lpFeeBurn,
        recycled: r.recycled,
        buybackFundedEth: r.buybackFundedEth,
      });
      const out = rows.map((r, i) => {
        const window = rows
          .slice(Math.max(0, i - 27), i + 1)
          .map(flowsOf)
          .reduce(addFlows, ZERO_FLOWS);
        return {
          day: r.day,
          date: new Date(r.day * 86_400_000).toISOString().slice(0, 10),
          emitted: r.emitted.toString(),
          burned: (r.spendBurn + r.feeBurn + r.buybackBurn + r.lpFeeBurn).toString(),
          recycled: r.recycled.toString(),
          netEmission: r.netEmission.toString(),
          buybackEth: r.buybackEth.toString(),
          revenueEth: r.revenueEth.toString(),
          sinkRatio: r.sinkRatio,
          sinkRatio28d: nullableNumber(sinkRatio(window)),
          rcr: nullableNumber(revenueCoverageRatio(flowsOf(r))),
          pStarEth: r.pStarEth,
          newAccounts: r.newAccounts,
          activeAccounts: r.activeAccounts,
        };
      });
      c.header('Cache-Control', 'public, max-age=300');
      return c.json({ days: out.slice(-days).reverse() }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/leaderboards/contribution',
      tags: ['leaderboards'],
      summary: 'Players by their contribution to the World Bore',
      request: {
        query: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).max(100_000).default(0),
        }),
      },
      responses: {
        200: json(
          z.object({
            rows: z.array(
              z.object({
                rank: z.number(),
                address: AddressSchema,
                displayName: z.string().nullable(),
                contribution: DepthSchema,
              }),
            ),
          }),
          'Ranking',
        ),
      },
    }),
    async (c) => {
      const { limit, offset } = c.req.valid('query');
      const rows = await contributionRanking(c.var.deps.database, limit, offset);
      c.header('Cache-Control', 'public, max-age=60');
      return c.json(
        {
          rows: rows.map((r, i) => ({
            rank: offset + i + 1,
            address: r.address,
            displayName: r.displayName,
            contribution: depth(millimetres(r.accrued)),
          })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/leaderboards/crews',
      tags: ['leaderboards'],
      summary: 'Crews by their members’ contribution (crews of 5+ are ranked)',
      responses: {
        200: json(
          z.object({
            rows: z.array(
              z.object({
                rank: z.number().nullable(),
                id: z.number(),
                name: z.string(),
                tag: z.string(),
                members: z.number(),
                contribution: DepthSchema,
              }),
            ),
          }),
          'Ranking',
        ),
      },
    }),
    async (c) => {
      const crews = await crewRanking(c.var.deps.database);
      let rank = 0;
      c.header('Cache-Control', 'public, max-age=60');
      return c.json(
        {
          rows: crews.map((crew) => ({
            rank: crew.members >= 5 ? ++rank : null,
            id: crew.id,
            name: crew.name,
            tag: crew.tag,
            members: crew.members,
            contribution: depth(millimetres(crew.accrued)),
          })),
        },
        200,
      );
    },
  );
}
