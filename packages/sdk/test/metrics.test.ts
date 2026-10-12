import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ZERO_FLOWS,
  addFlows,
  burned,
  gini,
  nakamoto,
  netEmission,
  revenueCoverageRatio,
  sinkRatio,
  topShare,
  zeroInflationPriceEth,
} from '../src/index.js';
import type { Flows } from '../src/index.js';

interface DistributionVectors {
  rows: { name: string; values: number[]; gini: number; nakamoto: number }[];
}

const vectors = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../sim/vectors/distribution_metrics.json', import.meta.url)),
    'utf8',
  ),
) as DistributionVectors;

const E18 = 10n ** 18n;

describe('distribution metrics match the simulator', () => {
  it.each(vectors.rows.map((r) => [r.name, r] as const))('%s', (_, row) => {
    expect(gini(row.values)).toBeCloseTo(row.gini, 12);
    expect(nakamoto(row.values)).toBe(row.nakamoto);
    // bigint balances (wei) give the same result.
    expect(gini(row.values.map((v) => BigInt(v) * E18))).toBeCloseTo(row.gini, 12);
    expect(nakamoto(row.values.map((v) => BigInt(v) * E18))).toBe(row.nakamoto);
  });

  it('is undefined without holders', () => {
    expect(gini([])).toBeNaN();
    expect(gini([0n, 0n])).toBeNaN();
    expect(nakamoto([])).toBeNaN();
    expect(topShare([0, 0], 1)).toBeNaN();
  });

  it('computes the top-n share', () => {
    expect(topShare([1, 2, 3, 4], 1)).toBe(0.4);
    expect(topShare([1, 2, 3, 4], 10)).toBe(1);
  });
});

describe('flow metrics (docs/02 §10)', () => {
  const day: Flows = {
    emitted: 1000n * E18,
    spendBurn: 400n * E18,
    feeBurn: 20n * E18,
    buybackBurn: 150n * E18,
    lpFeeBurn: 5n * E18,
    recycled: 120n * E18,
    buybackFundedEth: E18 / 10n,
  };

  it('sums burns by source', () => {
    expect(burned(day)).toBe(575n * E18);
  });

  it('computes SR, NE, RCR and P*', () => {
    expect(sinkRatio(day)).toBeCloseTo(0.695, 12);
    expect(netEmission(day)).toBe(425n * E18);
    expect(revenueCoverageRatio(day)).toBeCloseTo(0.15, 12);
    // 0.1 ETH of buyback funding for 1,000 MOHN emitted: 0.0001 ETH per MOHN.
    expect(zeroInflationPriceEth(day)).toBeCloseTo(0.0001, 15);
  });

  it('lets net emission go negative', () => {
    expect(netEmission({ ...day, buybackBurn: 2000n * E18 })).toBe(-1425n * E18);
  });

  it('is undefined for a period without emission', () => {
    expect(sinkRatio(ZERO_FLOWS)).toBeNaN();
    expect(revenueCoverageRatio(ZERO_FLOWS)).toBeNaN();
    expect(zeroInflationPriceEth(ZERO_FLOWS)).toBeNaN();
  });

  it('adds flows field by field', () => {
    expect(addFlows(day, day)).toEqual({
      emitted: 2000n * E18,
      spendBurn: 800n * E18,
      feeBurn: 40n * E18,
      buybackBurn: 300n * E18,
      lpFeeBurn: 10n * E18,
      recycled: 240n * E18,
      buybackFundedEth: E18 / 5n,
    });
    expect(addFlows(ZERO_FLOWS, day)).toEqual(day);
  });
});
