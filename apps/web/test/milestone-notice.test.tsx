import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MilestoneNotice, newMilestones } from '../src/app/play/MilestoneNotice';
import type { GameState } from '../src/game/state';
import { levelPost, rigTypePost } from '../src/social/share';

const A = '0x000000000000000000000000000000000000dEaD';
const E18 = 10n ** 18n;
const AT = 1_791_900_000;

/** A site at `level` with `owned[id]` rigs of each type; rig type 2 unlocks at level 3. */
function site(
  level: number,
  owned: number[],
  over: Partial<NonNullable<GameState['player']>> = {},
) {
  const state: GameState = {
    at: AT,
    network: {
      activeDp: 1_000n,
      hourEmission: 2_000n * E18,
      emitted: 0n,
      pausedUntil: 0,
      marketOpened: false,
      marketOpenTime: AT + 86_400,
      genesisTime: AT - 86_400,
      litresPerEth: 25_000n * E18,
      maxTankHours: 720,
    },
    rigs: owned.map((n, id) => ({
      id,
      dp: 10n,
      burn: E18 / 4n,
      premiumBps: 0,
      minLevel: id === 2 ? 3 : 0,
      generation: 1,
      price: 0n,
      owned: n,
      active: n,
    })),
    player: {
      registered: true,
      level,
      dp: 10n,
      burn: E18 / 4n,
      tank: 100n * E18,
      pending: 0n,
      scrapCredit: 0n,
      padsUsed: 1,
      walletMohn: 0n,
      siteUpgradePrice: null,
      refines: [],
      ...over,
    },
  };
  return state;
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('the milestone notice', () => {
  it('finds the highest new level, then each rig type run for the first time', () => {
    expect(newMilestones({ level: 1, types: [0] }, { level: 4, types: [0, 1, 2] })).toEqual([
      { kind: 'level', level: 4 },
      { kind: 'rig', typeId: 1 },
      { kind: 'rig', typeId: 2 },
    ]);
    // Opening the site (level 1, the free Pilot Rig) is no milestone; a scrapped type stays seen.
    expect(newMilestones({ level: 0, types: [] }, { level: 1, types: [0] })).toEqual([]);
    expect(newMilestones({ level: 3, types: [0, 1] }, { level: 3, types: [0] })).toEqual([]);
  });

  it('only notes the site on a first visit, then says each milestone once', () => {
    const first = render(
      <MilestoneNotice address={A} state={site(1, [1, 0, 0])}>
        <p>underneath</p>
      </MilestoneNotice>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('underneath')).toBeTruthy();
    first.unmount();

    const later = render(<MilestoneNotice address={A} state={site(3, [1, 0, 1])} />);
    expect(screen.getByRole('dialog', { name: 'Site level up' })).toBeTruthy();
    expect(screen.getByText('Level 3')).toBeTruthy();
    expect(screen.getByText(/New in the Market: Top Drive/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Share on X' }).getAttribute('href')).toContain(
      'utm_campaign%3Dlevel',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to work' }));
    expect(screen.getByRole('dialog', { name: 'New rig on the pads' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Top Drive on its pad at night' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to work' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    later.unmount();

    render(<MilestoneNotice address={A} state={site(3, [1, 0, 1])} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps no snapshot of a failed read, of the tank or of the rigs', () => {
    render(<MilestoneNotice address={A} state={site(3, [1, 0, 0], { readFailed: true })} />);
    render(<MilestoneNotice address={A} state={site(3, [1, 0, 0], { rigsReadFailed: true })} />);
    expect(window.localStorage.getItem(`mohonaut.milestones.${A.toLowerCase()}`)).toBeNull();
  });

  it('names every rig unlocked since the level last seen, not only at the newest one', () => {
    window.localStorage.setItem(
      `mohonaut.milestones.${A.toLowerCase()}`,
      JSON.stringify({ level: 2, types: [0, 1, 2] }),
    );
    // Level 2 to 4 between visits: the Top Drive came with level 3.
    render(<MilestoneNotice address={A} state={site(4, [1, 0, 1])} />);
    expect(screen.getByText('Level 4')).toBeTruthy();
    expect(screen.getByText(/New in the Market: Top Drive/)).toBeTruthy();
  });

  it('shows no portrait for a rig type outside the catalogue', () => {
    window.localStorage.setItem(
      `mohonaut.milestones.${A.toLowerCase()}`,
      JSON.stringify({ level: 1, types: [0] }),
    );
    render(<MilestoneNotice address={A} state={site(1, [1, 0, 0, 0, 0, 0, 0, 0, 0, 1])} />);
    expect(screen.getByRole('dialog', { name: 'New rig on the pads' })).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('treats a stored value of the wrong shape as a first visit', () => {
    window.localStorage.setItem(`mohonaut.milestones.${A.toLowerCase()}`, '[1,2]');
    render(<MilestoneNotice address={A} state={site(5, [1, 1, 1])} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('posts what was built, with the invite link and no amounts', () => {
    const level = levelPost({ level: 4, pads: 8, address: A });
    expect(level).toContain('level 4');
    expect(level).toContain('8 pads');
    expect(level).toContain('(my invite link)');
    const rig = rigTypePost({ rig: 'Top Drive', address: A });
    expect(rig).toContain('First Top Drive');
    for (const text of [level, rig]) expect(text).not.toMatch(/MOHN|\$|ETH|price/i);
  });
});
