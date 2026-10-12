import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_SITE_LEVEL, fuelLineWad, sitePads } from '../src/index.js';

describe('site levels', () => {
  it('copies the fuel-line table of SiteMath.sol exactly', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../contracts/src/lib/SiteMath.sol', import.meta.url)),
      'utf8',
    );
    const table = /uint256\[30\] memory table = \[([^\]]*)\]/.exec(source)?.[1] ?? '';
    const values = table
      .split(',')
      .map((v) => v.replace('uint256(', '').replace(/[^0-9]/g, ''))
      .filter((v) => v.length > 0)
      .map((v) => BigInt(v));
    expect(values).toHaveLength(MAX_SITE_LEVEL);
    values.forEach((v, i) => expect(fuelLineWad(i + 1)).toBe(v));
  });

  it('has 3 + L pads and rejects levels outside 1-30', () => {
    expect(sitePads(1)).toBe(4);
    expect(sitePads(30)).toBe(33);
    expect(fuelLineWad(1)).toBe(6n * 10n ** 18n);
    expect(() => sitePads(0)).toThrow(RangeError);
    expect(() => fuelLineWad(31)).toThrow(RangeError);
  });
});
