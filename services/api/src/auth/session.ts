import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, inArray } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { getAddress } from 'viem';
import type { AppEnv, SessionUser } from '../context.js';
import { adminRoles, sessions, users } from '../db/schema.js';
import type { Role } from '../db/schema.js';

const SESSION_COOKIE = 'mohn_session';
const SESSION_DAYS = 30;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Creates a session and sets the cookie (HttpOnly, SameSite=Lax, Secure in production). */
export async function startSession(c: Context<AppEnv>, userId: number): Promise<void> {
  const { deps } = c.var;
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(deps.now() + SESSION_DAYS * 86_400_000);
  await deps.database.db.insert(sessions).values({ tokenHash: hash(token), userId, expiresAt });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: deps.cfg.production,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token !== undefined) {
    await c.var.deps.database.db.delete(sessions).where(eq(sessions.tokenHash, hash(token)));
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Resolves the session cookie to `c.var.user` (null when absent or expired). */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null);
  const token = getCookie(c, SESSION_COOKIE);
  if (token !== undefined) {
    const { deps } = c.var;
    const db = deps.database.db;
    const [row] = await db
      .select({ id: users.id, wallet: users.wallet })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(eq(sessions.tokenHash, hash(token)), gt(sessions.expiresAt, new Date(deps.now()))),
      );
    if (row !== undefined) c.set('user', await sessionUser(c, row.id, row.wallet));
  }
  await next();
};

async function sessionUser(
  c: Context<AppEnv>,
  id: number,
  walletText: string | null,
): Promise<SessionUser> {
  const { deps } = c.var;
  const wallet = walletText === null ? null : getAddress(walletText);
  const granted = await deps.database.db
    .select({ role: adminRoles.role })
    .from(adminRoles)
    .where(inArray(adminRoles.userId, [id]));
  const roles = new Set<Role>(granted.map((r) => r.role));
  if (wallet !== null && deps.cfg.adminWallets.includes(wallet)) roles.add('admin');
  return { id, wallet, roles: [...roles].sort() };
}
