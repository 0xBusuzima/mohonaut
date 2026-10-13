import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { schema } from '@mohonaut/indexer';
import { and, desc, isNotNull, isNull } from 'drizzle-orm';
import type { AppEnv } from '../context.js';
import { AmountSchema, json } from './common.js';

const OpSchema = z
  .object({
    timelock: z.string(),
    opId: z.string(),
    target: z.string(),
    fn: z.string().nullable(),
    args: z.array(z.unknown()).nullable(),
    // Everything execute() needs, so anyone can run a ready operation.
    value: AmountSchema,
    data: z.string(),
    predecessor: z.string(),
    salt: z.string().nullable(),
    delay: z.number(),
    scheduledAt: z.number(),
    readyAt: z.number(),
    executedAt: z.number().nullable(),
    cancelledAt: z.number().nullable(),
  })
  .openapi('TimelockOperation');

type Row = typeof schema.timelockOps.$inferSelect;

const op = (r: Row) => ({
  timelock: r.timelock,
  opId: r.opId,
  target: r.target,
  fn: r.fn,
  args: Array.isArray(r.args) ? r.args : null,
  value: r.value.toString(),
  data: r.data,
  predecessor: r.predecessor,
  salt: r.salt,
  delay: Number(r.delay),
  scheduledAt: Number(r.scheduledAt),
  readyAt: Number(r.readyAt),
  executedAt: r.executedAt === null ? null : Number(r.executedAt),
  cancelledAt: r.cancelledAt === null ? null : Number(r.cancelledAt),
});

/** The public timelock queue (docs/05 §3.1 /timelock): every pending change and recent ones. */
export function registerGovernance(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/governance/timelock',
      tags: ['economy'],
      summary: 'Pending timelock operations (soonest first) and the last 20 executed or cancelled',
      responses: {
        200: json(z.object({ pending: z.array(OpSchema), recent: z.array(OpSchema) }), 'Queue'),
      },
    }),
    async (c) => {
      const db = c.var.deps.database.db;
      const t = schema.timelockOps;
      const pending = await db
        .select()
        .from(t)
        .where(and(isNull(t.executedAt), isNull(t.cancelledAt)))
        .orderBy(t.readyAt);
      const recent = await db
        .select()
        .from(t)
        .where(isNotNull(t.executedAt))
        .orderBy(desc(t.executedAt))
        .limit(20);
      const cancelled = await db
        .select()
        .from(t)
        .where(isNotNull(t.cancelledAt))
        .orderBy(desc(t.cancelledAt))
        .limit(20);
      const done = [...recent, ...cancelled]
        .map(op)
        .sort((a, b) => (b.executedAt ?? b.cancelledAt ?? 0) - (a.executedAt ?? a.cancelledAt ?? 0))
        .slice(0, 20);
      c.header('Cache-Control', 'public, max-age=60');
      return c.json({ pending: pending.map(op), recent: done }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/governance/params',
      tags: ['economy'],
      summary: 'Every MiningCore parameter changed so far: value, previous value and when',
      responses: {
        200: json(
          z.object({
            params: z.array(
              z.object({
                param: z.number(),
                name: z.string(),
                value: AmountSchema,
                previous: AmountSchema,
                changedAt: z.number(),
              }),
            ),
          }),
          'Parameters',
        ),
      },
    }),
    async (c) => {
      const rows = await c.var.deps.database.db
        .select()
        .from(schema.params)
        .orderBy(schema.params.param);
      c.header('Cache-Control', 'public, max-age=60');
      return c.json(
        {
          params: rows.map((r) => ({
            param: r.param,
            name: r.name,
            value: r.value.toString(),
            previous: r.previous.toString(),
            changedAt: Number(r.changedAt),
          })),
        },
        200,
      );
    },
  );
}
