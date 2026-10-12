/**
 * Which operator role sees which panel screen: a copy of services/api/src/rbac.ts PERMISSIONS
 * (test/ops.test.ts checks they match). The API enforces them; the panel only hides what a
 * role cannot use.
 */
export const PERMISSIONS = {
  'users.read': ['admin', 'support', 'moderator'],
  'users.flag': ['admin', 'moderator'],
  'crews.moderate': ['admin', 'moderator'],
  'seasons.write': ['admin', 'economist'],
  'audit.read': ['admin'],
  'roles.write': ['admin'],
  'announcements.write': ['admin', 'moderator'],
  'support.read': ['admin', 'support'],
  'support.write': ['admin', 'support'],
  'health.read': ['admin', 'economist', 'support', 'moderator'],
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ROLES = ['admin', 'economist', 'support', 'moderator'] as const;

export function can(roles: readonly string[], permission: Permission): boolean {
  const allowed: readonly string[] = PERMISSIONS[permission];
  return roles.some((r) => allowed.includes(r));
}
