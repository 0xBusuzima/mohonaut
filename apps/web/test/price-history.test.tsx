import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PriceBars } from '../src/app/play/PriceHistory';

afterEach(cleanup);

const WAD = 10n ** 18n;
const day = (i: number, perDp: bigint | null) => ({
  day: 20_400 + i,
  date: `2026-11-${String(10 + i).padStart(2, '0')}`,
  perDp: perDp === null ? null : perDp.toString(),
  dpSold: perDp === null ? '0' : '50',
  sales: perDp === null ? 0 : 1,
});

describe('the DP price chart', () => {
  it('draws a bar per day, a stub on days without sales, and reads out every day', () => {
    const days = [
      day(0, null),
      day(1, 10n * WAD),
      day(2, null),
      day(3, null),
      day(4, (85n * WAD) / 10n),
      day(5, null),
      day(6, 12n * WAD),
    ];
    const { container } = render(<PriceBars days={days} />);
    const chart = screen.getByRole('img');
    const label = chart.getAttribute('aria-label') ?? '';
    expect(label).toContain('11-10: no sales');
    expect(label).toContain('11-14: 8.50 MOHN');
    expect(label).toContain('11-16: 12.00 MOHN');
    // The baseline and one shape per day; the highest day is the full height.
    const rects = [...container.querySelectorAll('rect')];
    expect(rects).toHaveLength(8);
    const tallest = Math.max(...rects.slice(1).map((r) => Number(r.getAttribute('height'))));
    expect(tallest).toBe(38);
  });
});
