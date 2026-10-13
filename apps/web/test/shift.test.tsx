import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShiftReportNotice } from '../src/app/play/ShiftReport';
import { shiftReport, snapshotOf } from '../src/game/shift';
import type { GameState } from '../src/game/state';

const E18 = 10n ** 18n;
const ADDRESS = '0x000000000000000000000000000000000000dEaD';

function site(at: number, pending: bigint, tank: bigint, emitted: bigint): GameState {
  return {
    at,
    network: {
      activeDp: 1_000n,
      hourEmission: 2_000n * E18,
      emitted,
      pausedUntil: 0,
      marketOpened: true,
      marketOpenTime: 0,
      genesisTime: 0,
      litresPerEth: 25_000n * E18,
      maxTankHours: 720,
    },
    rigs: [],
    player: {
      registered: true,
      level: 1,
      dp: 10n,
      burn: E18 / 4n,
      tank,
      pending,
      scrapCredit: 0n,
      padsUsed: 1,
      walletMohn: 0n,
      siteUpgradePrice: null,
      refines: [],
    },
  };
}

const before = site(1_800_000_000, 10n * E18, 20n * E18, 1_000_000n * E18);
const after8h = site(1_800_000_000 + 8 * 3600, 25n * E18, 18n * E18, 1_016_000n * E18);

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the shift report', () => {
  it('sums up what the site did while the player was away', () => {
    const prev = snapshotOf(before);
    expect(prev).not.toBeNull();
    const r = prev === null ? null : shiftReport(prev, after8h);
    expect(r).toEqual({
      away: 8 * 3600,
      cored: 15n * E18,
      diesel: 2n * E18,
      boreMm: 16_000n, // 16,000 $MOHN mined: 16 m
      tankEmpty: false,
    });
  });

  it('says nothing after a short break, or when nothing ran', () => {
    const prev = snapshotOf(before);
    if (prev === null) throw new Error('no snapshot');
    expect(shiftReport(prev, { ...after8h, at: before.at + 600 })).toBeNull();
    expect(shiftReport(prev, { ...before, at: before.at + 8 * 3600 })).toBeNull();
  });

  it('ignores a read where the tank or the unrefined balance failed', () => {
    const prev = snapshotOf(before);
    if (prev === null) throw new Error('no snapshot');
    const failed: GameState = {
      ...after8h,
      player: after8h.player === null ? null : { ...after8h.player, readFailed: true },
    };
    expect(shiftReport(prev, failed)).toBeNull();
    expect(snapshotOf(failed)).toBeNull();
  });

  it('keeps the report through a remount until it is closed', () => {
    window.localStorage.setItem(
      `mohonaut.shift.${ADDRESS.toLowerCase()}`,
      JSON.stringify(snapshotOf(before)),
    );
    const first = render(<ShiftReportNotice state={after8h} address={ADDRESS} open={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Shift report' })).toBeTruthy();
    first.unmount(); // e.g. a window opened over it
    render(<ShiftReportNotice state={after8h} address={ADDRESS} open={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Shift report' })).toBeTruthy();
  });

  it('shows once on return, offers diesel when the tank ran dry, then stays quiet', () => {
    const prev = snapshotOf(before);
    window.localStorage.setItem(`mohonaut.shift.${ADDRESS.toLowerCase()}`, JSON.stringify(prev));
    const dry = site(after8h.at, 25n * E18, 0n, after8h.network.emitted);
    const open = vi.fn();
    const { unmount } = render(
      <ShiftReportNotice state={dry} address={ADDRESS} open={open}>
        <p>underneath</p>
      </ShiftReportNotice>,
    );
    expect(screen.getByRole('dialog', { name: 'Shift report' })).toBeTruthy();
    expect(screen.getByText('15.00 MOHN')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('ran dry');
    fireEvent.click(screen.getByRole('button', { name: 'Fill the tank' }));
    expect(open).toHaveBeenCalledWith('fuel');
    expect(screen.getByText('underneath')).toBeTruthy();
    unmount();
    render(<ShiftReportNotice state={dry} address={ADDRESS} open={open} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
