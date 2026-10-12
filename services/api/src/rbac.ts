import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './context.js';
import type { Role } from './db/schema.js';

/** Who may do what in the admin API (docs/03 §5). test/rbac.test.ts checks every cell. */
export const PERMISSIONS = {
  'users.read': ['admin', 'support', 'moderator'],
  'users.flag': ['admin', 'moderator'],
  'crews.moderate': ['admin', 'moderator'],
  'seasons.write': ['admin', 'economist'],
  'audit.read': ['admin'],
  'roles.write': ['admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

function allowed(roles: readonly Role[], permission: Permission): boolean {
  const permitted: readonly Role[] = PERMISSIONS[permission];
  return roles.some((r) => permitted.includes(r));
}

export const signedIn: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.var.user === null) throw new HTTPException(401, { message: 'sign in first' });
  await next();
};

export function requirePermission(permission: Permission): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.var.user;
    if (user === null) throw new HTTPException(401, { message: 'sign in first' });
    if (!allowed(user.roles, permission))
      throw new HTTPException(403, { message: 'not permitted' });
    await next();
  };
}
