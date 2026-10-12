import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { setParamData } from '@mohonaut/sdk';
import { describeOp } from '../src/ops/governance';
import { GAME } from '../src/game/network';
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

describe('timelock queue', () => {
  it('describes a queued parameter change in operator units', () => {
    expect(describeOp({ target: GAME.MiningCore, data: setParamData(0, 11n * 10n ** 16n) })).toBe(
      'setParam(FuelPrice, $0.1100)',
    );
    expect(describeOp({ target: GAME.MiningCore, data: setParamData(3, 650n) })).toBe(
      'setParam(FastRefineFee, 6.50%)',
    );
    expect(describeOp({ target: GAME.MiningCore, data: '0xdeadbeef' })).toBe(
      'unknown MiningCore call',
    );
    expect(describeOp({ target: '0x0000000000000000000000000000000000000001', data: '0x' })).toBe(
      'call to 0x0000000000000000000000000000000000000001',
    );
  });
});
