import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PARAM_SPECS,
  ZERO_HASH,
  allowedRange,
  batchChecksum,
  checkParamChange,
  formatParam,
  operationId,
  parseParam,
  safeCallBatch,
  setParamData,
  timelockProposal,
} from '../src/index.js';
import type { ParamSpec } from '../src/index.js';

const E18 = 10n ** 18n;
const spec = (name: string): ParamSpec => {
  const s = PARAM_SPECS.find((p) => p.name === name);
  if (s === undefined) throw new Error(name);
  return s;
};

/** "0.03e18", "100_000e18", "24 hours", "7 days" as written in MiningCore.sol. */
function solidityNumber(text: string): bigint {
  const t = text.trim().replace(/_/g, '');
  const unit = /^(\d+)\s+(hours|days)$/.exec(t);
  if (unit !== null) return BigInt(unit[1] ?? '0') * (unit[2] === 'hours' ? 3600n : 86_400n);
  const sci = /^(\d+)(?:\.(\d+))?e(\d+)$/.exec(t);
  if (sci !== null) {
    const frac = sci[2] ?? '';
    return BigInt(`${sci[1] ?? '0'}${frac}`) * 10n ** BigInt(Number(sci[3]) - frac.length);
  }
  return BigInt(t);
}

describe('parameter specs', () => {
  it('copy MiningCore.paramBounds exactly, in enum order', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../contracts/src/MiningCore.sol', import.meta.url)),
      'utf8',
    );
    const body = /function paramBounds[\s\S]*?\{([\s\S]*?)\n {4}\}/.exec(source)?.[1] ?? '';
    const rows = [...body.matchAll(/return \(([^)]*)\);(?:\s*\/\/\s*(\w+))?/g)].map((m) => ({
      values: (m[1] ?? '').split(',').map(solidityNumber),
      line: m[0],
    }));
    expect(rows).toHaveLength(PARAM_SPECS.length);
    rows.forEach((row, i) => {
      const s = PARAM_SPECS[i];
      expect(s, row.line).toBeDefined();
      expect(row.values, `${s?.name}: ${row.line}`).toEqual([
        s?.min,
        s?.max,
        s?.stepBps,
        BigInt(s?.period ?? 0),
      ]);
    });
    const enumBody = /enum Param \{([\s\S]*?)\}/.exec(source)?.[1] ?? '';
    const names = [...enumBody.matchAll(/^\s*(\w+),?\s*\/\//gm)].map((m) => m[1]);
    expect(names).toEqual(PARAM_SPECS.map((s) => s.name));
  });

  it('narrow the range by the step limit like the contract (integer math)', () => {
    expect(allowedRange(spec('FuelPrice'), E18 / 10n)).toEqual({
      lo: 75n * 10n ** 15n,
      hi: 125n * 10n ** 15n,
    });
    // Near a bound, the bound wins.
    expect(allowedRange(spec('FuelPrice'), 35n * 10n ** 15n).lo).toBe(30n * 10n ** 15n);
    expect(allowedRange(spec('FastRefineFee'), 800n)).toEqual({ lo: 0n, hi: 1200n });
  });

  it('explain every reason setParam would revert at execution time', () => {
    const fuel = spec('FuelPrice');
    const ok = checkParamChange({
      spec: fuel,
      current: E18 / 10n,
      next: 12n * 10n ** 16n,
      lastChangedAt: null,
      executeAt: 1_000,
    });
    expect(ok).toEqual([]);
    const all = checkParamChange({
      spec: fuel,
      current: E18 / 10n,
      next: E18,
      lastChangedAt: 1_000,
      executeAt: 2_000,
    });
    expect(all).toHaveLength(3);
    expect(all.join(' ')).toMatch(
      /bounds.*step too large.*rate limit: the earliest execution is 605800/,
    );
    expect(
      checkParamChange({ spec: fuel, current: 5n, next: 5n, lastChangedAt: null, executeAt: 0 })[0],
    ).toMatch(/equals/);
  });

  it('read and write values in the units operators use', () => {
    expect(parseParam(spec('FuelPrice'), '$0.12')).toBe(12n * 10n ** 16n);
    expect(formatParam(spec('FuelPrice'), 12n * 10n ** 16n)).toBe('$0.1200');
    expect(parseParam(spec('FastRefineFee'), '8%')).toBe(800n);
    expect(formatParam(spec('FastRefineFee'), 800n)).toBe('8.00%');
    expect(parseParam(spec('RefineDelay'), '72')).toBe(259_200n);
    expect(formatParam(spec('RefineDelay'), 259_200n)).toBe('72 h');
    expect(parseParam(spec('MaxTankHours'), '720')).toBe(720n);
    expect(parseParam(spec('MaxTankHours'), '7.5')).toBeNull();
    expect(parseParam(spec('VrgdaR'), '12,000')).toBe(12_000n * E18);
    expect(parseParam(spec('VrgdaK'), 'abc')).toBeNull();
    expect(parseParam(spec('FastRefineFee'), '8.123')).toBeNull();
  });
});

describe('timelock proposal', () => {
  const CORE = '0x1000000000000000000000000000000000000002' as const;
  const SALT = `0x${'5a'.repeat(32)}` as const;
  const DATA = setParamData(0, 12n * 10n ** 16n);

  it('encodes setParam and hashes the operation like OpenZeppelin (cast vector)', () => {
    expect(DATA).toBe(
      '0xc1cca2b3000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001aa535d3d0c0000',
    );
    expect(
      operationId({ target: CORE, value: 0n, data: DATA, predecessor: ZERO_HASH, salt: SALT }),
    ).toBe('0x58436d096897929479b0868d4fde3db11f27bfd31834d17d3f8903ae98e8a018');
  });

  it('writes schedule and execute Transaction Builder files with the same operation', () => {
    const p = timelockProposal({
      chainId: 46630,
      safe: '0xeC375d14d656216544443718bB160ce6Bc0207F4',
      timelock: '0x2000000000000000000000000000000000000006',
      target: CORE,
      data: DATA,
      salt: SALT,
      delay: 345_600,
      title: 'FuelPrice $0.10 -> $0.12',
      now: 1_800_000_000,
    });
    expect(p.opId).toBe('0x58436d096897929479b0868d4fde3db11f27bfd31834d17d3f8903ae98e8a018');
    expect(p.readyAt).toBe(1_800_345_600);
    const [s] = p.schedule.transactions;
    const [x] = p.execute.transactions;
    expect(p.schedule.chainId).toBe('46630');
    expect(s?.contractMethod.name).toBe('schedule');
    expect(s?.contractInputsValues).toMatchObject({
      target: CORE,
      data: DATA,
      salt: SALT,
      delay: '345600',
      predecessor: ZERO_HASH,
    });
    expect(x?.contractMethod.name).toBe('execute');
    expect(x?.contractInputsValues).toMatchObject({ payload: DATA, salt: SALT });
    expect(p.schedule.meta.checksum).toBe(batchChecksum(p.schedule));
    // The checksum ignores the batch name (the Transaction Builder lets people rename it).
    expect(batchChecksum({ ...p.schedule, meta: { ...p.schedule.meta, name: 'other' } })).toBe(
      p.schedule.meta.checksum,
    );
    expect(batchChecksum({ ...p.schedule, createdAt: 1 })).not.toBe(p.schedule.meta.checksum);
  });

  it('writes a single direct call, such as the Guardian pause', () => {
    const file = safeCallBatch({
      chainId: 46630,
      safe: '0x0952b428618A26F9024C679b7cB22Ce601f56C26',
      to: CORE,
      method: 'pause',
      title: 'Guardian pause',
      description: 'Pauses player actions for 24 hours.',
      now: 1_800_000_000,
    });
    expect(file.transactions).toEqual([
      {
        to: CORE,
        value: '0',
        data: null,
        contractMethod: { name: 'pause', payable: false, inputs: [] },
        contractInputsValues: {},
      },
    ]);
    expect(file.meta.checksum).toBe(batchChecksum(file));
  });
});
