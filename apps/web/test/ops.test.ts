import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, can } from '../src/ops/permissions';
import { utcInputToUnix } from '../src/ops/screens';

describe('operator permissions', () => {
  it('mirror the API (services/api/src/rbac.ts) exactly', () => {
    const source = readFileSync(join(process.cwd(), '../../services/api/src/rbac.ts'), 'utf8');
    const block = /export const PERMISSIONS = \{([\s\S]*?)\} as const/.exec(source)?.[1] ?? '';
    const api: Record<string, string[]> = {};
    for (const m of block.matchAll(/'([a-z.]+)': \[([^\]]*)\]/g)) {
      api[m[1] ?? ''] = [...(m[2] ?? '').matchAll(/'([a-z]+)'/g)].map((r) => r[1] ?? '');
    }
    expect(Object.keys(api).length).toBeGreaterThan(5);
    expect(PERMISSIONS).toEqual(api);
  });

  it('let a role see a screen only when one of its roles is listed', () => {
    expect(can(['support'], 'support.write')).toBe(true);
    expect(can(['support'], 'users.flag')).toBe(false);
    expect(can(['economist', 'moderator'], 'users.flag')).toBe(true);
    expect(can([], 'health.read')).toBe(false);
  });
});

describe('UTC date inputs', () => {
  it('reads datetime-local values as UTC, empty as unset', () => {
    expect(utcInputToUnix('2026-11-20T12:00')).toBe(Date.UTC(2026, 10, 20, 12) / 1000);
    expect(utcInputToUnix('')).toBeNull();
    expect(utcInputToUnix('nonsense')).toBeNull();
  });
});
