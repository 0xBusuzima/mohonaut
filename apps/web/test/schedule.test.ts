import { KOLA_LINE_M } from '@mohonaut/sdk';
import { describe, expect, it } from 'vitest';
import { formatSpan, hoursToDepth } from '../src/lib/schedule';

describe('the World Bore timeline', () => {
  it('follows the emission schedule: about 50,000 $MOHN (50 m) on day 1', () => {
    expect(hoursToDepth(50)).toBeGreaterThan(23);
    expect(hoursToDepth(50)).toBeLessThan(25);
  });

  it('agrees with the economy paper: 16.69M mined in year 1, 83.9M by year 10', () => {
    expect(hoursToDepth(16_690) / (24 * 365.25)).toBeCloseTo(1, 1);
    expect(hoursToDepth(83_900) / (24 * 365.25)).toBeCloseTo(10, 0);
  });

  it('names spans in days, then years', () => {
    expect(formatSpan(hoursToDepth(2_000))).toBe('40 days');
    expect(formatSpan(hoursToDepth(KOLA_LINE_M))).toBe('262 days');
    expect(formatSpan(hoursToDepth(85_000))).toBe('10.4 years');
    expect(hoursToDepth(100_000)).toBe(Infinity);
  });
});
