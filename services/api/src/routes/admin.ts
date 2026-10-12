import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv, SessionUser } from '../context.js';
import type { Db } from '@mohonaut/indexer';
import { ROLES, adminRoles, auditLog, crews, seasons, users } from '../db/schema.js';
import { requirePermission } from '../rbac.js';
import { rateLimit } from '../security.js';
import { OkSchema, errors, isUniqueViolation, json } from './common.js';

const Reason = z.string().min(3).max(500);

/** Every operator write goes through here: the change and its audit row in one transaction. */
async function audited<T>(
  db: Db,
  actor: SessionUser,
  entry: { action: string; target: string; reason: string },
  change: (tx: Db) => Promise<{ before: unknown; after: unknown; result: T }>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const { before, after, result } = await change(tx as unknown as Db);
    await tx.insert(auditLog).values({ actorUserId: actor.id, ...entry, before, after });
    return result;
  });
}

const actor = (user: SessionUser | null): SessionUser => {
  if (user === null) throw new HTTPException(401);
  return user;
};

export function registerAdmin(app: OpenAPIHono<AppEnv>): void {
  const limited = rateLimit('admin', 120, 60, true);

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/users',
      tags: ['admin'],
      summary: 'Find players by wallet or display name',
      middleware: [requirePermission('users.read'), limited] as const,
      request: { query: z.object({ q: z.string().min(2).max(64) }) },
      responses: {
        200: json(
          z.object({
            users: z.array(
              z.object({
                id: z.number(),
                wallet: z.string().nullable(),
                displayName: z.string().nullable(),
                authProvider: z.string(),
                riskScore: z.number(),
                flagged: z.boolean(),
              }),
            ),
          }),
          'Users',
        ),
        401: errors[401],
        403: errors[403],
      },
    }),
    async (c) => {
      const q = c.req.valid('query').q.replace(/[%_\\]/g, '');
      const rows = await c.var.deps.database.db
        .select({
          id: users.id,
          wallet: users.wallet,
          displayName: users.displayName,
          authProvider: users.authProvider,
          riskScore: users.riskScore,
          flagged: users.flagged,
        })
        .from(users)
        .where(or(ilike(users.wallet, `${q}%`), ilike(users.displayName, `%${q}%`)))
        .limit(50);
      return c.json({ users: rows }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/users/{id}/flag',
      tags: ['admin'],
      summary: 'Set a player’s risk score / flag (off-chain rewards only; never on-chain state)',
      middleware: [requirePermission('users.flag'), limited] as const,
      request: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: {
          content: {
            'application/json': {
              schema: z.object({
                flagged: z.boolean(),
                riskScore: z.number().int().min(0).max(100),
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
      const { flagged, riskScore, reason } = c.req.valid('json');
      await audited(
        c.var.deps.database.db,
        actor(c.var.user),
        { action: 'user.flag', target: `user:${id}`, reason },
        async (tx) => {
          const [before] = await tx
            .select({ flagged: users.flagged, riskScore: users.riskScore })
            .from(users)
            .where(eq(users.id, id));
          if (before === undefined) throw new HTTPException(404, { message: 'no such user' });
          await tx.update(users).set({ flagged, riskScore }).where(eq(users.id, id));
          return { before, after: { flagged, riskScore }, result: undefined };
        },
      );
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/crews/{id}/rename',
      tags: ['admin'],
      summary: 'Rename an offensive crew',
      middleware: [requirePermission('crews.moderate'), limited] as const,
      request: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: {
          content: {
            'application/json': {
              schema: z.object({
                name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 _-]{2,23}$/),
                reason: Reason,
              }),
            },
          },
        },
      },
      responses: {
        200: json(OkSchema, 'Renamed'),
        400: errors[400],
        401: errors[401],
        403: errors[403],
        404: errors[404],
        409: errors[409],
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const { name, reason } = c.req.valid('json');
      try {
        await audited(
          c.var.deps.database.db,
          actor(c.var.user),
          { action: 'crew.rename', target: `crew:${id}`, reason },
          async (tx) => {
            const [before] = await tx
              .select({ name: crews.name })
              .from(crews)
              .where(eq(crews.id, id));
            if (before === undefined) throw new HTTPException(404, { message: 'no such crew' });
            await tx.update(crews).set({ name }).where(eq(crews.id, id));
            return { before, after: { name }, result: undefined };
          },
        );
      } catch (err) {
        if (isUniqueViolation(err)) throw new HTTPException(409, { message: 'name taken' });
        throw err;
      }
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/seasons',
      tags: ['admin'],
      summary: 'Announce a season (Unix seconds)',
      middleware: [requirePermission('seasons.write'), limited] as const,
      request: {
        body: {
          content: {
            'application/json': {
              schema: z
                .object({
                  name: z.string().min(3).max(64),
                  startsAt: z.number().int().positive(),
                  endsAt: z.number().int().positive(),
                  reason: Reason,
                })
                .refine((s) => s.endsAt > s.startsAt, 'endsAt must be after startsAt'),
            },
          },
        },
      },
      responses: {
        201: json(z.object({ id: z.number() }), 'Created'),
        400: errors[400],
        401: errors[401],
        403: errors[403],
      },
    }),
    async (c) => {
      const { name, startsAt, endsAt, reason } = c.req.valid('json');
      const id = await audited(
        c.var.deps.database.db,
        actor(c.var.user),
        { action: 'season.create', target: `season:${name}`, reason },
        async (tx) => {
          const [row] = await tx.insert(seasons).values({ name, startsAt, endsAt }).returning();
          if (row === undefined) throw new Error('season insert returned nothing');
          return { before: null, after: row, result: row.id };
        },
      );
      return c.json({ id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/roles',
      tags: ['admin'],
      summary: 'Grant or revoke an operator role',
      middleware: [requirePermission('roles.write'), limited] as const,
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({
                userId: z.number().int().positive(),
                role: z.enum(ROLES),
                grant: z.boolean(),
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
      const { userId, role, grant, reason } = c.req.valid('json');
      await audited(
        c.var.deps.database.db,
        actor(c.var.user),
        { action: grant ? 'role.grant' : 'role.revoke', target: `user:${userId}`, reason },
        async (tx) => {
          const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
          if (user === undefined) throw new HTTPException(404, { message: 'no such user' });
          const held = await tx
            .select()
            .from(adminRoles)
            .where(and(eq(adminRoles.userId, userId), eq(adminRoles.role, role)));
          if (grant) await tx.insert(adminRoles).values({ userId, role }).onConflictDoNothing();
          else
            await tx
              .delete(adminRoles)
              .where(and(eq(adminRoles.userId, userId), eq(adminRoles.role, role)));
          return {
            before: { [role]: held.length > 0 },
            after: { [role]: grant },
            result: undefined,
          };
        },
      );
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/audit',
      tags: ['admin'],
      summary: 'The audit log, newest first',
      middleware: [requirePermission('audit.read'), limited] as const,
      request: { query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }) },
      responses: {
        200: json(
          z.object({
            entries: z.array(
              z.object({
                id: z.number(),
                at: z.string(),
                actorUserId: z.number(),
                action: z.string(),
                target: z.string(),
                before: z.unknown(),
                after: z.unknown(),
                reason: z.string(),
              }),
            ),
          }),
          'Entries',
        ),
        401: errors[401],
        403: errors[403],
      },
    }),
    async (c) => {
      const rows = await c.var.deps.database.db
        .select()
        .from(auditLog)
        .orderBy(desc(auditLog.id))
        .limit(c.req.valid('query').limit);
      return c.json({ entries: rows.map((r) => ({ ...r, at: r.at.toISOString() })) }, 200);
    },
  );
}
