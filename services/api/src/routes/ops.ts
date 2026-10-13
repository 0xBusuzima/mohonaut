import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { schema as idx } from '@mohonaut/indexer';
import type { Db } from '@mohonaut/indexer';
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { getAddress } from 'viem';
import type { Address } from 'viem';
import type { AppEnv, SessionUser } from '../context.js';
import { account, crewOfUser, fleet } from '../data.js';
import {
  ANNOUNCEMENT_KINDS,
  SUPPORT_STATUSES,
  SUPPORT_TOPICS,
  adminRoles,
  announcements,
  auditLog,
  supportTickets,
  users,
} from '../db/schema.js';
import { requirePermission } from '../rbac.js';
import { rateLimit, turnstile } from '../security.js';
import { AddressSchema, AmountSchema, OkSchema, errors, json } from './common.js';

/**
 * Operator panel endpoints beyond admin.ts (docs/03 §5): announcements (module 7), the support
 * inbox (9), the player file (4) and service health (12). Every write is audited.
 */
const Reason = z.string().min(3).max(500);

const AnnouncementSchema = z
  .object({
    id: z.number(),
    kind: z.enum(ANNOUNCEMENT_KINDS),
    title: z.string(),
    body: z.string(),
    startsAt: z.number(),
    endsAt: z.number().nullable(),
  })
  .openapi('Announcement');

const TicketSchema = z
  .object({
    id: z.number(),
    userId: z.number().nullable(),
    wallet: z.string().nullable(),
    contact: z.string().nullable(),
    topic: z.enum(SUPPORT_TOPICS),
    body: z.string(),
    status: z.enum(SUPPORT_STATUSES),
    note: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('SupportTicket');

const actor = (user: SessionUser | null): SessionUser => {
  if (user === null) throw new HTTPException(401);
  return user;
};

async function audited<T>(
  db: Db,
  who: SessionUser,
  entry: { action: string; target: string; reason: string },
  change: (tx: Db) => Promise<{ before: unknown; after: unknown; result: T }>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const { before, after, result } = await change(tx as unknown as Db);
    await tx.insert(auditLog).values({ actorUserId: who.id, ...entry, before, after });
    return result;
  });
}

const ticketOut = (t: typeof supportTickets.$inferSelect) => ({
  ...t,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

const announcementOut = (a: typeof announcements.$inferSelect) => ({
  id: a.id,
  kind: a.kind,
  title: a.title,
  body: a.body,
  startsAt: a.startsAt,
  endsAt: a.endsAt,
});

export function registerOps(app: OpenAPIHono<AppEnv>): void {
  const limited = rateLimit('admin', 120, 60, true);

  // ------------------------------------------------------------ announcements (public read)
  app.openapi(
    createRoute({
      method: 'get',
      path: '/announcements',
      tags: ['world'],
      summary: 'Banners and maintenance notices showing now, and the latest changelog',
      responses: {
        200: json(
          z.object({ active: z.array(AnnouncementSchema), changelog: z.array(AnnouncementSchema) }),
          'Announcements',
        ),
      },
    }),
    async (c) => {
      const now = Math.floor(c.var.deps.now() / 1000);
      const db = c.var.deps.database.db;
      const showing = and(
        lte(announcements.startsAt, now),
        or(isNull(announcements.endsAt), gt(announcements.endsAt, now)),
      );
      const rows = await db
        .select()
        .from(announcements)
        .where(showing)
        .orderBy(desc(announcements.id));
      const changelog = await db
        .select()
        .from(announcements)
        .where(and(eq(announcements.kind, 'changelog'), lte(announcements.startsAt, now)))
        .orderBy(desc(announcements.startsAt))
        .limit(20);
      c.header('Cache-Control', 'public, max-age=60');
      return c.json(
        {
          active: rows.filter((a) => a.kind !== 'changelog').map(announcementOut),
          changelog: changelog.map(announcementOut),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/announcements',
      tags: ['admin'],
      summary: 'Every announcement, newest first',
      middleware: [requirePermission('announcements.write'), limited] as const,
      responses: {
        200: json(z.object({ announcements: z.array(AnnouncementSchema) }), 'Announcements'),
        401: errors[401],
        403: errors[403],
      },
    }),
    async (c) => {
      const rows = await c.var.deps.database.db
        .select()
        .from(announcements)
        .orderBy(desc(announcements.id))
        .limit(200);
      return c.json({ announcements: rows.map(announcementOut) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/announcements',
      tags: ['admin'],
      summary: 'Publish a banner, maintenance notice or changelog entry',
      middleware: [requirePermission('announcements.write'), limited] as const,
      request: {
        body: {
          content: {
            'application/json': {
              schema: z
                .object({
                  kind: z.enum(ANNOUNCEMENT_KINDS),
                  title: z.string().trim().min(3).max(120),
                  body: z.string().max(4000),
                  startsAt: z.number().int().positive(),
                  endsAt: z.number().int().positive().nullable(),
                  reason: Reason,
                })
                .refine((a) => a.endsAt === null || a.endsAt > a.startsAt, {
                  message: 'endsAt must be after startsAt',
                  path: ['endsAt'],
                }),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ id: z.number() }), 'Published'),
        400: errors[400],
        401: errors[401],
        403: errors[403],
      },
    }),
    async (c) => {
      const { reason, ...a } = c.req.valid('json');
      const who = actor(c.var.user);
      const id = await audited(
        c.var.deps.database.db,
        who,
        { action: 'announcement.create', target: `announcement:new`, reason },
        async (tx) => {
          const [row] = await tx
            .insert(announcements)
            .values({ ...a, createdBy: who.id })
            .returning({ id: announcements.id });
          if (row === undefined) throw new Error('announcement insert returned nothing');
          return { before: null, after: { id: row.id, ...a }, result: row.id };
        },
      );
      return c.json({ id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/announcements/{id}/end',
      tags: ['admin'],
      summary: 'Take an announcement down now (history is kept)',
      middleware: [requirePermission('announcements.write'), limited] as const,
      request: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: { content: { 'application/json': { schema: z.object({ reason: Reason }) } } },
      },
      responses: {
        200: json(OkSchema, 'Ended'),
        400: errors[400],
        401: errors[401],
        403: errors[403],
        404: errors[404],
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const { reason } = c.req.valid('json');
      const now = Math.floor(c.var.deps.now() / 1000);
      await audited(
        c.var.deps.database.db,
        actor(c.var.user),
        { action: 'announcement.end', target: `announcement:${id}`, reason },
        async (tx) => {
          const [before] = await tx.select().from(announcements).where(eq(announcements.id, id));
          if (before === undefined)
            throw new HTTPException(404, { message: 'no such announcement' });
          // Never before its start: an unstarted notice ends at its own start (shows nothing).
          const endsAt = Math.max(now, before.startsAt + 1);
          await tx.update(announcements).set({ endsAt }).where(eq(announcements.id, id));
          return { before: { endsAt: before.endsAt }, after: { endsAt }, result: undefined };
        },
      );
      return c.json({ ok: true as const }, 200);
    },
  );

  // ------------------------------------------------------------ support inbox
  app.openapi(
    createRoute({
      method: 'post',
      path: '/support',
      tags: ['support'],
      summary: 'Send a support request (linked to the player when signed in)',
      middleware: [rateLimit('support', 5, 3600, true), turnstile] as const,
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({
                topic: z.enum(SUPPORT_TOPICS),
                body: z.string().trim().min(10).max(4000),
                contact: z.string().trim().max(254).nullable(),
                wallet: AddressSchema.nullable(),
              }),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ id: z.number() }), 'Received'),
        400: errors[400],
        403: errors[403],
        429: errors[429],
      },
    }),
    async (c) => {
      const body = c.req.valid('json');
      const user = c.var.user;
      const [row] = await c.var.deps.database.db
        .insert(supportTickets)
        .values({
          userId: user?.id ?? null,
          wallet: user?.wallet ?? (body.wallet === null ? null : getAddress(body.wallet)),
          contact: body.contact === '' ? null : body.contact,
          topic: body.topic,
          body: body.body,
        })
        .returning({ id: supportTickets.id });
      if (row === undefined) throw new Error('ticket insert returned nothing');
      return c.json({ id: row.id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/support',
      tags: ['admin'],
      summary: 'Support requests by status, newest first',
      middleware: [requirePermission('support.read'), limited] as const,
      request: { query: z.object({ status: z.enum(SUPPORT_STATUSES).default('open') }) },
      responses: {
        200: json(z.object({ tickets: z.array(TicketSchema) }), 'Tickets'),
        401: errors[401],
        403: errors[403],
      },
    }),
    async (c) => {
      const { status } = c.req.valid('query');
      const rows = await c.var.deps.database.db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.status, status))
        .orderBy(desc(supportTickets.id))
        .limit(100);
      return c.json({ tickets: rows.map(ticketOut) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/support/{id}',
      tags: ['admin'],
      summary: 'Set a support request’s status and internal note',
      middleware: [requirePermission('support.write'), limited] as const,
      request: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: {
          content: {
            'application/json': {
              schema: z.object({
                status: z.enum(SUPPORT_STATUSES),
                note: z.string().max(4000).nullable(),
                reason: Reason,
              }),
            },
          },
        },
      },
      responses: {
        200: json(OkSchema, 'Saved'),
        400: errors[400],
        401: errors[401],
        403: errors[403],
        404: errors[404],
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const { status, note, reason } = c.req.valid('json');
      const now = new Date(c.var.deps.now());
      await audited(
        c.var.deps.database.db,
        actor(c.var.user),
        { action: 'support.update', target: `ticket:${id}`, reason },
        async (tx) => {
          const [before] = await tx
            .select({ status: supportTickets.status, note: supportTickets.note })
            .from(supportTickets)
            .where(eq(supportTickets.id, id));
          if (before === undefined) throw new HTTPException(404, { message: 'no such ticket' });
          await tx
            .update(supportTickets)
            .set({ status, note, updatedAt: now })
            .where(eq(supportTickets.id, id));
          return { before, after: { status, note }, result: undefined };
        },
      );
      return c.json({ ok: true as const }, 200);
    },
  );

  // ------------------------------------------------------------ player file
  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/users/{id}',
      tags: ['admin'],
      summary: 'One player: account, roles, crew, chain activity, support and audit history',
      middleware: [requirePermission('users.read'), limited] as const,
      request: { params: z.object({ id: z.coerce.number().int().positive() }) },
      responses: {
        200: json(
          z.object({
            user: z.object({
              id: z.number(),
              wallet: z.string().nullable(),
              displayName: z.string().nullable(),
              authProvider: z.string(),
              riskScore: z.number(),
              flagged: z.boolean(),
              roles: z.array(z.string()),
            }),
            crew: z.object({ id: z.number(), name: z.string(), tag: z.string() }).nullable(),
            chain: z
              .object({
                referrer: z.string().nullable(),
                referrals: z.number(),
                siteLevel: z.number(),
                dp: AmountSchema,
                fuelEth: AmountSchema,
                accrued: AmountSchema,
                refined: AmountSchema,
                mohnSpent: AmountSchema,
                rigs: z.array(
                  z.object({ typeId: z.number(), owned: z.string(), active: z.string() }),
                ),
                refines: z.array(
                  z.object({
                    id: z.string(),
                    amount: AmountSchema,
                    readyAt: z.string(),
                    finalizedAt: z.string().nullable(),
                  }),
                ),
              })
              .nullable(),
            tickets: z.array(TicketSchema),
            audit: z.array(
              z.object({
                at: z.string(),
                action: z.string(),
                reason: z.string(),
                actorUserId: z.number(),
              }),
            ),
          }),
          'Player',
        ),
        401: errors[401],
        403: errors[403],
        404: errors[404],
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const database = c.var.deps.database;
      const db = database.db;
      const [u] = await db.select().from(users).where(eq(users.id, id));
      if (u === undefined) throw new HTTPException(404, { message: 'no such user' });
      const roles = await db
        .select({ role: adminRoles.role })
        .from(adminRoles)
        .where(eq(adminRoles.userId, id));
      const crew = await crewOfUser(database, id);
      let chain = null;
      if (u.wallet !== null) {
        const wallet = getAddress(u.wallet) as Address;
        const acc = await account(database, wallet);
        if (acc !== null && acc !== undefined) {
          const rigs = await fleet(database, wallet);
          const refines = await db
            .select()
            .from(idx.refineRequests)
            .where(eq(idx.refineRequests.account, wallet))
            .orderBy(desc(idx.refineRequests.requestId))
            .limit(20);
          chain = {
            referrer: acc.referrer,
            referrals: acc.referrals,
            siteLevel: acc.siteLevel,
            dp: acc.dp.toString(),
            fuelEth: acc.fuelEth.toString(),
            accrued: acc.accrued.toString(),
            refined: acc.refined.toString(),
            mohnSpent: acc.mohnSpent.toString(),
            rigs: rigs.map((r) => ({
              typeId: r.typeId,
              owned: r.owned.toString(),
              active: r.active.toString(),
            })),
            refines: refines.map((r) => ({
              id: r.requestId.toString(),
              amount: r.amount.toString(),
              readyAt: r.readyAt.toString(),
              finalizedAt: r.finalizedAt === null ? null : r.finalizedAt.toString(),
            })),
          };
        }
      }
      const tickets = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.userId, id))
        .orderBy(desc(supportTickets.id))
        .limit(20);
      const audit = await db
        .select({
          at: auditLog.at,
          action: auditLog.action,
          reason: auditLog.reason,
          actorUserId: auditLog.actorUserId,
        })
        .from(auditLog)
        .where(eq(auditLog.target, `user:${id}`))
        .orderBy(desc(auditLog.id))
        .limit(50);
      return c.json(
        {
          user: {
            id: u.id,
            wallet: u.wallet,
            displayName: u.displayName,
            authProvider: u.authProvider,
            riskScore: u.riskScore,
            flagged: u.flagged,
            roles: roles.map((r) => r.role),
          },
          crew: crew === null ? null : { id: crew.id, name: crew.name, tag: crew.tag },
          chain,
          tickets: tickets.map(ticketOut),
          audit: audit.map((a) => ({ ...a, at: a.at.toISOString() })),
        },
        200,
      );
    },
  );

  // ------------------------------------------------------------ service health
  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/health',
      tags: ['admin'],
      summary: 'Indexer progress, the last hour close and the keeper (docs/03 §5 module 12)',
      middleware: [requirePermission('health.read'), limited] as const,
      responses: {
        200: json(
          z.object({
            now: z.number(),
            streams: z.array(z.object({ stream: z.string(), block: z.string() })),
            head: z.string().nullable(),
            lastHourClosedAt: z.number().nullable(),
            keeper: z.object({
              address: z.string().nullable(),
              balanceWei: AmountSchema.nullable(),
            }),
          }),
          'Health',
        ),
        401: errors[401],
        403: errors[403],
      },
    }),
    async (c) => {
      const deps = c.var.deps;
      const db = deps.database.db;
      const streams = await db.select().from(idx.cursors).orderBy(idx.cursors.stream);
      const [last] = await db
        .select({ blockTime: idx.events.blockTime })
        .from(idx.events)
        .where(and(eq(idx.events.contract, 'MiningCore'), eq(idx.events.event, 'HourClosed')))
        .orderBy(desc(idx.events.blockNumber), desc(idx.events.logIndex))
        .limit(1);
      const keeper = deps.cfg.deployment.Keeper ?? null;
      let head: string | null = null;
      let balance: string | null = null;
      if (deps.chain !== null && deps.chain !== undefined) {
        try {
          head = (await deps.chain.getBlockNumber()).toString();
          if (keeper !== null)
            balance = (await deps.chain.getBalance({ address: keeper })).toString();
        } catch {
          // RPC down: the panel shows unknown rather than failing the whole page
        }
      }
      return c.json(
        {
          now: Math.floor(deps.now() / 1000),
          streams: streams.map((s) => ({ stream: s.stream, block: s.block.toString() })),
          head,
          lastHourClosedAt: last === undefined ? null : Number(last.blockTime),
          keeper: { address: keeper, balanceWei: balance },
        },
        200,
      );
    },
  );
}
