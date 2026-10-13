import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { generateSiweNonce } from 'viem/siwe';
import { checkSiwe } from '../auth/siwe.js';
import { endSession, startSession } from '../auth/session.js';
import type { AppEnv } from '../context.js';
import { crewOfUser } from '../data.js';
import { users } from '../db/schema.js';
import { rateLimit, turnstile } from '../security.js';
import { signedIn } from '../rbac.js';
import { AddressSchema, OkSchema, errors, isUniqueViolation, json } from './common.js';

const NONCE_TTL_S = 600;

const MeSchema = z
  .object({
    id: z.number(),
    wallet: AddressSchema.nullable(),
    displayName: z.string().nullable(),
    roles: z.array(z.string()),
    crewId: z.number().nullable(),
  })
  .openapi('Me');

const DISPLAY_NAME = /^[A-Za-z0-9_]{3,20}$/;

async function upsertUser(
  deps: AppEnv['Variables']['deps'],
  provider: string,
  providerUserId: string,
  wallet: string | null,
): Promise<number> {
  const db = deps.database.db;
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.authProvider, provider), eq(users.providerUserId, providerUserId)));
  if (existing !== undefined) return existing.id;
  const [created] = await db
    .insert(users)
    .values({ authProvider: provider, providerUserId, wallet })
    .returning({ id: users.id });
  if (created === undefined) throw new Error('user insert returned nothing');
  return created.id;
}

export function registerAuth(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/auth/nonce',
      tags: ['auth'],
      summary: 'A one-time nonce for a Sign-In with Ethereum message (valid 10 minutes)',
      middleware: [rateLimit('auth', 20, 60)] as const,
      responses: { 200: json(z.object({ nonce: z.string() }), 'Nonce'), 429: errors[429] },
    }),
    async (c) => {
      const nonce = generateSiweNonce();
      await c.var.deps.store.set(`siwe:${nonce}`, '1', NONCE_TTL_S);
      return c.json({ nonce }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/siwe',
      tags: ['auth'],
      summary: 'Sign in with an EIP-4361 message signed by the wallet',
      middleware: [rateLimit('auth', 20, 60), turnstile] as const,
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({
                message: z.string().max(4096),
                signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
              }),
            },
          },
        },
      },
      responses: {
        200: json(MeSchema, 'Signed in'),
        400: errors[400],
        401: errors[401],
        403: errors[403],
        429: errors[429],
      },
    }),
    async (c) => {
      const { deps } = c.var;
      const { message, signature } = c.req.valid('json');
      const result = await checkSiwe({
        message,
        signature: signature as `0x${string}`,
        domain: new URL(deps.cfg.webOrigin).host,
        origin: deps.cfg.webOrigin,
        chainId: deps.cfg.deployment.chainId,
        now: new Date(deps.now()),
        verifier: deps.signatures,
      });
      if (!result.ok) throw new HTTPException(401, { message: result.reason });
      if ((await deps.store.take(`siwe:${result.nonce}`)) === null) {
        throw new HTTPException(401, { message: 'unknown or used nonce' });
      }
      const id = await upsertUser(deps, 'siwe', result.address, result.address);
      await startSession(c, id);
      return c.json(
        { id, wallet: result.address, displayName: null, roles: [], crewId: null },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/external',
      tags: ['auth'],
      summary: 'Sign in with the optional e-mail provider (Dynamic or Privy JWT)',
      middleware: [rateLimit('auth', 20, 60), turnstile] as const,
      request: {
        body: {
          content: { 'application/json': { schema: z.object({ token: z.string().max(8192) }) } },
        },
      },
      responses: {
        200: json(OkSchema, 'Signed in'),
        401: errors[401],
        404: errors[404],
        429: errors[429],
      },
    }),
    async (c) => {
      const { deps } = c.var;
      if (deps.externalAuth === null) throw new HTTPException(404, { message: 'not enabled' });
      const sub = await deps.externalAuth.verify(c.req.valid('json').token);
      if (sub === null) throw new HTTPException(401, { message: 'invalid token' });
      await startSession(c, await upsertUser(deps, deps.externalAuth.name, sub, null));
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/logout',
      tags: ['auth'],
      summary: 'End the session',
      responses: { 200: json(OkSchema, 'Signed out') },
    }),
    async (c) => {
      await endSession(c);
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/me',
      tags: ['profile'],
      summary: 'The signed-in player',
      middleware: [signedIn] as const,
      responses: { 200: json(MeSchema, 'Player'), 401: errors[401] },
    }),
    async (c) => {
      const user = c.var.user;
      if (user === null) throw new HTTPException(401);
      const db = c.var.deps.database.db;
      const [row] = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, user.id));
      const crew = await crewOfUser(c.var.deps.database, user.id);
      return c.json(
        {
          id: user.id,
          wallet: user.wallet,
          displayName: row?.displayName ?? null,
          roles: user.roles,
          crewId: crew?.id ?? null,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/me',
      tags: ['profile'],
      summary: 'Set the display name (3-20 letters, digits or _; unique)',
      middleware: [signedIn, rateLimit('profile', 10, 60, true)] as const,
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({ displayName: z.string().regex(DISPLAY_NAME) }),
            },
          },
        },
      },
      responses: {
        200: json(OkSchema, 'Saved'),
        400: errors[400],
        401: errors[401],
        409: errors[409],
        429: errors[429],
      },
    }),
    async (c) => {
      const user = c.var.user;
      if (user === null) throw new HTTPException(401);
      const { displayName } = c.req.valid('json');
      try {
        await c.var.deps.database.db
          .update(users)
          .set({ displayName })
          .where(eq(users.id, user.id));
      } catch (err) {
        if (isUniqueViolation(err)) throw new HTTPException(409, { message: 'name taken' });
        throw err;
      }
      return c.json({ ok: true as const }, 200);
    },
  );
}
