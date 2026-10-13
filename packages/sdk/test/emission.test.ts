import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAP, DELTA_H_WAD, hourlyEmission, splitEmission } from '../src/index.js';

interface EmissionVectors {
  DELTA_H_WAD: string;
  R0_wei: string;
  columns: string[];
  rows: (string | number)[][];
}

const vectorsPath = fileURLToPath(
  new URL('../../../sim/vectors/emission_hourly.json', import.meta.url),
);
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as EmissionVectors;

describe('emission parity with sim/vectors', () => {
  it('uses the same constants', () => {
    expect(DELTA_H_WAD).toBe(BigInt(vectors.DELTA_H_WAD));
    expect(CAP).toBe(BigInt(vectors.R0_wei));
  });

  it('matches every hourly row to the wei', () => {
    expect(vectors.columns).toEqual([
      'hour',
      'R_h_wei',
      'E_h_wei',
      'miners_wei',
      'dev_wei',
      'treasury_wei',
    ]);
    let reserve = CAP;
    for (const row of vectors.rows) {
      const [, rWei, eWei, minersWei, devWei, treasuryWei] = row.map((v) => BigInt(v));
      expect(reserve).toBe(rWei);
      const emission = hourlyEmission(reserve);
      expect(emission).toBe(eWei);
      expect(splitEmission(emission)).toEqual({
        miners: minersWei,
        dev: devWei,
        treasury: treasuryWei,
      });
      reserve -= emission;
    }
    expect(vectors.rows.length).toBeGreaterThanOrEqual(2000);
  });

  it('never loses a wei in the split', () => {
    for (const e of [0n, 1n, 9n, 10n, 12_345_678_901_234_567n, CAP]) {
      const { miners, dev, treasury } = splitEmission(e);
      expect(miners + dev + treasury).toBe(e);
    }
  });

  it('rejects negative inputs', () => {
    expect(() => hourlyEmission(-1n)).toThrow(RangeError);
    expect(() => splitEmission(-1n)).toThrow(RangeError);
  });
});
