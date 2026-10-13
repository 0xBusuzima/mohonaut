import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { getAddress } from 'viem';
import type { Address } from 'viem';
import type { AppEnv } from '../context.js';
import {
  account,
  activeDuringHour,
  crewOfUser,
  findsOf,
  fleet,
  hasRefined,
  kolaCrossingHour,
  seasonPlaques,
  userByWallet,
  worldEmitted,
} from '../data.js';
import { ACHIEVEMENTS, earnedAchievements, fleetEfficiency } from '../game/achievements.js';
import { MAINNET_CHAIN_ID } from '../faucet.js';
import { renderCardPng } from '../game/card.js';
import { formatDepth, millimetres } from '@mohonaut/sdk';
import { completedSets } from '../game/survey.js';
import { AddressSchema, DepthSchema, errors, json } from './common.js';

const BadgeSchema = z.object({ id: z.string(), name: z.string(), description: z.string() });

const DEFAULT_CARD = 'https://mohonaut.com/og.png';

async function profileOf(deps: AppEnv['Variables']['deps'], address: Address) {
  const db = deps.database;
  const acct = await account(db, address);
  const user = await userByWallet(db, address);
  const crew = user === null ? null : await crewOfUser(db, user.id);
  const finds = user === null ? [] : await findsOf(db, user.id);
  const sets = completedSets(finds.map((f) => f.itemId));
  const rigs = await fleet(db, address);
  const kola = await kolaCrossingHour(db);
  const earned = earnedAchievements({
    fuelEth: acct?.fuelEth ?? 0n,
    rigsBought: acct?.rigsBought ?? 0n,
    efficiency: fleetEfficiency(rigs),
    witnessedKola: kola !== null && (await activeDuringHour(db, address, kola)),
    completedSets: sets.length,
    inCrew: crew !== null,
    siteLevel: acct?.siteLevel ?? 0,
    refined: (acct?.refined ?? 0n) > 0n || (await hasRefined(db, address)),
    testnet: deps.cfg.deployment.chainId !== MAINNET_CHAIN_ID,
    flagged: user?.flagged ?? false,
  });
  return { acct, user, crew, finds, sets, rigs, earned };
}

export function registerProfile(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/profiles/{address}',
      tags: ['profile'],
      summary:
        'Public profile: drill site, World Bore contribution, crew, badges (no wallet needed)',
      request: { params: z.object({ address: AddressSchema }) },
      responses: {
        200: json(
          z.object({
            address: AddressSchema,
            displayName: z.string().nullable(),
            registered: z.boolean(),
            siteLevel: z.number(),
            activeDp: z.string(),
            fuelledUntilHour: z.string(),
            rigs: z.array(z.object({ typeId: z.number(), owned: z.string(), active: z.string() })),
            contribution: DepthSchema,
            crew: z.object({ id: z.number(), name: z.string(), tag: z.string() }).nullable(),
            badges: z.array(BadgeSchema),
            /** Top-10 places in seasons that have ended: cosmetic plaques on the site. */
            plaques: z.array(z.object({ season: z.number(), name: z.string(), rank: z.number() })),
            collection: z.object({ finds: z.number(), completedSets: z.array(z.string()) }),
          }),
          'Profile',
        ),
        404: errors[404],
      },
    }),
    async (c) => {
      const address = getAddress(c.req.valid('param').address);
      const p = await profileOf(c.var.deps, address);
      if (p.acct === null && p.user === null)
        throw new HTTPException(404, { message: 'unknown player' });
      const nowHour = BigInt(Math.floor(c.var.deps.now() / 3_600_000));
      const fuelled = (p.acct?.expiryHour ?? 0n) > nowHour;
      const mm = millimetres(p.acct?.accrued ?? 0n);
      return c.json(
        {
          address,
          displayName: p.user?.displayName ?? null,
          registered: p.acct?.registeredAt !== null && p.acct?.registeredAt !== undefined,
          siteLevel: p.acct?.siteLevel ?? 0,
          activeDp: (fuelled ? (p.acct?.dp ?? 0n) : 0n).toString(),
          fuelledUntilHour: (p.acct?.expiryHour ?? 0n).toString(),
          rigs: p.rigs.map((r) => ({
            typeId: r.typeId,
            owned: r.owned.toString(),
            active: r.active.toString(),
          })),
          contribution: { mm: mm.toString(), text: formatDepth(mm) },
          crew: p.crew === null ? null : { id: p.crew.id, name: p.crew.name, tag: p.crew.tag },
          badges: ACHIEVEMENTS.filter((a) => p.earned.includes(a.id)).map((a) => ({ ...a })),
          plaques: await seasonPlaques(
            c.var.deps.database,
            address,
            Math.floor(c.var.deps.now() / 1000),
          ),
          collection: { finds: p.finds.length, completedSets: p.sets },
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/cards/{address}',
      tags: ['profile'],
      summary: 'Contribution card PNG for sharing (no earnings or prices)',
      request: { params: z.object({ address: AddressSchema }) },
      responses: {
        200: { content: { 'image/png': { schema: z.any() } }, description: 'PNG, 1200 × 630' },
        302: { description: 'No drill site yet: the site share image (Location header)' },
      },
    }),
    async (c) => {
      const address = getAddress(c.req.valid('param').address);
      const p = await profileOf(c.var.deps, address);
      // No drill site yet (an invite from someone who signed in but never fuelled): the site's
      // own share image, so a shared link still shows a picture.
      if (p.acct === null) return c.redirect(DEFAULT_CARD, 302);
      const png = renderCardPng({
        contributionMm: millimetres(p.acct.accrued),
        worldDepthMm: millimetres(await worldEmitted(c.var.deps.database)),
        crew: p.crew?.name ?? null,
        name: p.user?.displayName ?? `${address.slice(0, 6)}…${address.slice(-4)}`,
        badges: p.earned,
      });
      return c.body(new Uint8Array(png), 200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=600',
      });
    },
  );
}
