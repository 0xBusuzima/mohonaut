import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { and, asc, count, desc, eq, notInArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv, SessionUser } from '../context.js';
import {
  crewMembersWithAccrual,
  crewOfUser,
  displayNames,
  findsOf,
  seasonRanking,
} from '../data.js';
import {
  crewMembers,
  crewSignals,
  crews,
  notificationPrefs,
  seasons,
  surveyFinds,
  users,
} from '../db/schema.js';
import { CREW_SIGNALS, formatDepth, millimetres } from '@mohonaut/sdk';
import { SURVEY_ITEMS, SURVEY_SETS, completedSets, surveyFind } from '../game/survey.js';
import { signedIn } from '../rbac.js';
import { rateLimit, turnstile } from '../security.js';
import { AddressSchema, DepthSchema, OkSchema, errors, isUniqueViolation, json } from './common.js';

const CREW_MIN = 5;
const CREW_MAX = 25;
/** A crew keeps its latest signals only. */
const SIGNALS_KEPT = 12;
const SIGNAL_IDS = CREW_SIGNALS.map((s) => s.id) as [string, ...string[]];
const NOTIFY_EVENTS = ['fuel-low', 'refine-ready', 'stratum', 'season', 'announcements'] as const;

const me = (user: SessionUser | null): SessionUser => {
  if (user === null) throw new HTTPException(401, { message: 'sign in first' });
  return user;
};

const depth = (mm: bigint) => ({ mm: mm.toString(), text: formatDepth(mm) });

export function registerSocial(app: OpenAPIHono<AppEnv>): void {
  // ------------------------------------------------------------------ crews
  app.openapi(
    createRoute({
      method: 'post',
      path: '/crews',
      tags: ['crews'],
      summary: 'Found a crew (you become its captain; one crew per player)',
      middleware: [signedIn, rateLimit('crew-write', 10, 3600, true), turnstile] as const,
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({
                name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 _-]{2,23}$/),
                tag: z.string().regex(/^[A-Za-z0-9]{3,5}$/),
              }),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ id: z.number() }), 'Crew created'),
        400: errors[400],
        401: errors[401],
        403: errors[403],
        409: errors[409],
        429: errors[429],
      },
    }),
    async (c) => {
      const user = me(c.var.user);
      const { name, tag } = c.req.valid('json');
      const db = c.var.deps.database.db;
      if ((await crewOfUser(c.var.deps.database, user.id)) !== null) {
        throw new HTTPException(409, { message: 'already in a crew' });
      }
      try {
        const id = await db.transaction(async (tx) => {
          const [crew] = await tx
            .insert(crews)
            .values({ name: name.trim(), tag: tag.toUpperCase(), captainUserId: user.id })
            .returning({ id: crews.id });
          if (crew === undefined) throw new Error('crew insert returned nothing');
          await tx.insert(crewMembers).values({ userId: user.id, crewId: crew.id });
          return crew.id;
        });
        return c.json({ id }, 201);
      } catch (err) {
        if (isUniqueViolation(err)) throw new HTTPException(409, { message: 'name or tag taken' });
        throw err;
      }
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/crews/{id}',
      tags: ['crews'],
      summary: 'A crew, its members and their World Bore contribution',
      request: { params: z.object({ id: z.coerce.number().int().positive() }) },
      responses: {
        200: json(
          z.object({
            id: z.number(),
            name: z.string(),
            tag: z.string(),
            ranked: z.boolean(),
            contribution: DepthSchema,
            members: z.array(
              z.object({
                wallet: AddressSchema.nullable(),
                displayName: z.string().nullable(),
                captain: z.boolean(),
                contribution: DepthSchema,
              }),
            ),
            /** The latest set phrases sent to the crew, newest first. */
            signals: z.array(
              z.object({
                signal: z.enum(SIGNAL_IDS),
                text: z.string(),
                wallet: AddressSchema.nullable(),
                displayName: z.string().nullable(),
                at: z.string(),
              }),
            ),
          }),
          'Crew',
        ),
        404: errors[404],
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const db = c.var.deps.database;
      const [crew] = await db.db.select().from(crews).where(eq(crews.id, id));
      if (crew === undefined) throw new HTTPException(404, { message: 'no such crew' });
      const members = await crewMembersWithAccrual(db, id);
      const total = members.reduce((sum, m) => sum + (m.accrued ?? 0n), 0n);
      const signals = await db.db
        .select({
          signal: crewSignals.signal,
          at: crewSignals.at,
          wallet: users.wallet,
          displayName: users.displayName,
        })
        .from(crewSignals)
        .innerJoin(users, eq(users.id, crewSignals.userId))
        .where(eq(crewSignals.crewId, id))
        .orderBy(desc(crewSignals.id))
        .limit(SIGNALS_KEPT);
      return c.json(
        {
          id: crew.id,
          name: crew.name,
          tag: crew.tag,
          ranked: members.length >= CREW_MIN,
          contribution: depth(millimetres(total)),
          members: members.map((m) => ({
            wallet: m.wallet as `0x${string}` | null,
            displayName: m.displayName,
            captain: m.userId === crew.captainUserId,
            contribution: depth(millimetres(m.accrued ?? 0n)),
          })),
          signals: signals.flatMap((s) => {
            const known = CREW_SIGNALS.find((k) => k.id === s.signal);
            return known === undefined
              ? []
              : [
                  {
                    signal: known.id,
                    text: known.text,
                    wallet: s.wallet as `0x${string}` | null,
                    displayName: s.displayName,
                    at: s.at.toISOString(),
                  },
                ];
          }),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/crews/signal',
      tags: ['crews'],
      summary: 'Send a set phrase to your crew (no free text)',
      middleware: [signedIn, rateLimit('crew-signal', 12, 3600, true)] as const,
      request: {
        body: {
          content: { 'application/json': { schema: z.object({ signal: z.enum(SIGNAL_IDS) }) } },
        },
      },
      responses: {
        200: json(OkSchema, 'Sent'),
        401: errors[401],
        404: errors[404],
        429: errors[429],
      },
    }),
    async (c) => {
      const user = me(c.var.user);
      const { signal } = c.req.valid('json');
      const db = c.var.deps.database;
      const crew = await crewOfUser(db, user.id);
      if (crew === null) throw new HTTPException(404, { message: 'not in a crew' });
      await db.db.transaction(async (tx) => {
        await tx.insert(crewSignals).values({ crewId: crew.id, userId: user.id, signal });
        // Only the latest few are kept.
        const keep = tx
          .select({ id: crewSignals.id })
          .from(crewSignals)
          .where(eq(crewSignals.crewId, crew.id))
          .orderBy(desc(crewSignals.id))
          .limit(SIGNALS_KEPT);
        await tx
          .delete(crewSignals)
          .where(and(eq(crewSignals.crewId, crew.id), notInArray(crewSignals.id, keep)));
      });
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/crews/{id}/join',
      tags: ['crews'],
      summary: `Join a crew (at most ${CREW_MAX} members)`,
      middleware: [signedIn, rateLimit('crew-write', 10, 3600, true)] as const,
      request: { params: z.object({ id: z.coerce.number().int().positive() }) },
      responses: {
        200: json(OkSchema, 'Joined'),
        401: errors[401],
        404: errors[404],
        409: errors[409],
        429: errors[429],
      },
    }),
    async (c) => {
      const user = me(c.var.user);
      const { id } = c.req.valid('param');
      const db = c.var.deps.database;
      const [crew] = await db.db.select({ id: crews.id }).from(crews).where(eq(crews.id, id));
      if (crew === undefined) throw new HTTPException(404, { message: 'no such crew' });
      await db.db.transaction(async (tx) => {
        // Lock the crew row so two joins cannot both take the last seat.
        await tx.select({ id: crews.id }).from(crews).where(eq(crews.id, id)).for('update');
        const [members] = await tx
          .select({ n: count() })
          .from(crewMembers)
          .where(eq(crewMembers.crewId, id));
        if ((members?.n ?? 0) >= CREW_MAX)
          throw new HTTPException(409, { message: 'crew is full' });
        try {
          await tx.insert(crewMembers).values({ userId: user.id, crewId: id });
        } catch (err) {
          if (isUniqueViolation(err))
            throw new HTTPException(409, { message: 'already in a crew' });
          throw err;
        }
      });
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/crews/leave',
      tags: ['crews'],
      summary: 'Leave your crew (the captaincy passes to the longest-standing member)',
      middleware: [signedIn] as const,
      responses: { 200: json(OkSchema, 'Left'), 401: errors[401], 404: errors[404] },
    }),
    async (c) => {
      const user = me(c.var.user);
      const db = c.var.deps.database;
      const crew = await crewOfUser(db, user.id);
      if (crew === null) throw new HTTPException(404, { message: 'not in a crew' });
      await db.db.transaction(async (tx) => {
        await tx.delete(crewMembers).where(eq(crewMembers.userId, user.id));
        const [heir] = await tx
          .select({ userId: crewMembers.userId })
          .from(crewMembers)
          .where(eq(crewMembers.crewId, crew.id))
          .orderBy(asc(crewMembers.joinedAt), asc(crewMembers.userId))
          .limit(1);
        if (heir === undefined) await tx.delete(crews).where(eq(crews.id, crew.id));
        else if (crew.captainUserId === user.id) {
          await tx.update(crews).set({ captainUserId: heir.userId }).where(eq(crews.id, crew.id));
        }
      });
      return c.json({ ok: true as const }, 200);
    },
  );

  // ------------------------------------------------------------------ Survey and collection
  const FindSchema = z.object({ id: z.string(), name: z.string(), setId: z.string() });

  app.openapi(
    createRoute({
      method: 'post',
      path: '/survey',
      tags: ['survey'],
      summary: "Today's free Survey: one cosmetic find per UTC day (no economic value)",
      middleware: [signedIn, rateLimit('survey', 10, 3600, true), turnstile] as const,
      responses: {
        200: json(z.object({ day: z.number(), find: FindSchema, isNew: z.boolean() }), 'Find'),
        401: errors[401],
        403: errors[403],
        429: errors[429],
      },
    }),
    async (c) => {
      const user = me(c.var.user);
      const { deps } = c.var;
      const day = Math.floor(deps.now() / 86_400_000);
      const find = surveyFind(deps.cfg.surveySecret, user.id, day);
      const inserted = await deps.database.db
        .insert(surveyFinds)
        .values({ userId: user.id, day, itemId: find.id })
        .onConflictDoNothing()
        .returning({ day: surveyFinds.day });
      return c.json({ day, find, isNew: inserted.length > 0 }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/me/collection',
      tags: ['survey'],
      summary: 'Your Survey finds and set progress',
      middleware: [signedIn] as const,
      responses: {
        200: json(
          z.object({
            finds: z.array(z.object({ day: z.number(), itemId: z.string() })),
            sets: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                title: z.string(),
                found: z.number(),
                total: z.number(),
                complete: z.boolean(),
              }),
            ),
          }),
          'Collection',
        ),
        401: errors[401],
      },
    }),
    async (c) => {
      const user = me(c.var.user);
      const finds = await findsOf(c.var.deps.database, user.id);
      const owned = new Set(finds.map((f) => f.itemId));
      const complete = new Set(completedSets(owned));
      return c.json(
        {
          finds: finds.map((f) => ({ day: f.day, itemId: f.itemId })),
          sets: SURVEY_SETS.map((s) => ({
            id: s.id,
            name: s.name,
            title: s.title,
            found: SURVEY_ITEMS.filter((i) => i.setId === s.id && owned.has(i.id)).length,
            total: s.items.length,
            complete: complete.has(s.id),
          })),
        },
        200,
      );
    },
  );

  // ------------------------------------------------------------------ seasons
  const SeasonSchema = z.object({
    id: z.number(),
    name: z.string(),
    startsAt: z.number(),
    endsAt: z.number(),
  });

  app.openapi(
    createRoute({
      method: 'get',
      path: '/seasons',
      tags: ['seasons'],
      summary: 'All seasons, newest first',
      responses: { 200: json(z.object({ seasons: z.array(SeasonSchema) }), 'Seasons') },
    }),
    async (c) => {
      const rows = await c.var.deps.database.db
        .select()
        .from(seasons)
        .orderBy(desc(seasons.startsAt));
      return c.json({ seasons: rows }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/seasons/{id}/leaderboard',
      tags: ['seasons'],
      summary: 'World Bore contribution during a season (top 100)',
      request: { params: z.object({ id: z.coerce.number().int().positive() }) },
      responses: {
        200: json(
          z.object({
            season: SeasonSchema,
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
        404: errors[404],
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const db = c.var.deps.database;
      const [season] = await db.db.select().from(seasons).where(eq(seasons.id, id));
      if (season === undefined) throw new HTTPException(404, { message: 'no such season' });
      const rows = await seasonRanking(db, season.startsAt, season.endsAt, 100);
      const names = await displayNames(
        db,
        rows.map((r) => r.address),
      );
      c.header('Cache-Control', 'public, max-age=120');
      return c.json(
        {
          season,
          rows: rows.map((r, i) => ({
            rank: i + 1,
            address: r.address,
            displayName: names.get(r.address) ?? null,
            contribution: depth(millimetres(r.accrued)),
          })),
        },
        200,
      );
    },
  );

  // ------------------------------------------------------------------ notification preferences
  const PrefsSchema = z.object({
    email: z.email().max(254).nullable(),
    telegramChatId: z
      .string()
      .regex(/^-?\d{1,20}$/)
      .nullable(),
    events: z.array(z.enum(NOTIFY_EVENTS)).max(NOTIFY_EVENTS.length),
  });

  app.openapi(
    createRoute({
      method: 'get',
      path: '/me/notifications',
      tags: ['notifications'],
      summary: 'Your notification preferences',
      middleware: [signedIn] as const,
      responses: { 200: json(PrefsSchema, 'Preferences'), 401: errors[401] },
    }),
    async (c) => {
      const user = me(c.var.user);
      const [row] = await c.var.deps.database.db
        .select()
        .from(notificationPrefs)
        .where(eq(notificationPrefs.userId, user.id));
      return c.json(
        {
          email: row?.email ?? null,
          telegramChatId: row?.telegramChatId ?? null,
          events: (row?.events ?? []) as (typeof NOTIFY_EVENTS)[number][],
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'put',
      path: '/me/notifications',
      tags: ['notifications'],
      summary: 'Replace your notification preferences',
      middleware: [signedIn, rateLimit('prefs', 20, 3600, true)] as const,
      request: { body: { content: { 'application/json': { schema: PrefsSchema } } } },
      responses: {
        200: json(OkSchema, 'Saved'),
        400: errors[400],
        401: errors[401],
        429: errors[429],
      },
    }),
    async (c) => {
      const user = me(c.var.user);
      const prefs = c.req.valid('json');
      const values = {
        email: prefs.email,
        telegramChatId: prefs.telegramChatId,
        events: [...new Set(prefs.events)],
        updatedAt: new Date(c.var.deps.now()),
      };
      await c.var.deps.database.db
        .insert(notificationPrefs)
        .values({ userId: user.id, ...values })
        .onConflictDoUpdate({ target: notificationPrefs.userId, set: values });
      return c.json({ ok: true as const }, 200);
    },
  );
}
