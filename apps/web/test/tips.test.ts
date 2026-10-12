import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/game/state';
import { nextTip } from '../src/game/tips';

const E18 = 10n ** 18n;
const AT = 1_791_900_000;

function site(
  over: Partial<NonNullable<GameState['player']>> = {},
  rigs: number[] = [1, 0],
): GameState {
  return {
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
    rigs: rigs.map((owned, id) => ({
      id,
      dp: 10n,
      burn: E18 / 4n,
      premiumBps: 0,
      minLevel: 0,
      generation: 1,
      price: 0n,
      owned,
      active: owned,
    })),
    player: {
      registered: true,
      level: 1,
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
}

describe("Foreman Mo's tips", () => {
  it('says nothing before the site is open', () => {
    expect(nextTip({ ...site(), player: null }, new Set(), true)).toBeNull();
    expect(nextTip(site({ registered: false }), new Set(), true)).toBeNull();
  });

  it('points a new site at the market first', () => {
    const tip = nextTip(site(), new Set(), true);
    expect(tip?.id).toBe('first-rig');
    expect(tip?.action?.target).toBe('market');
  });

  it('warns about the tank before anything else, once a day', () => {
    const empty = nextTip(site({ tank: 0n }), new Set(), true);
    expect(empty?.id).toBe(`empty-tank-${Math.floor(AT / 86_400)}`);
    expect(empty?.action?.target).toBe('fuel');
    // 2 litres at 0.25 l/h: 8 hours left.
    const low = nextTip(site({ tank: 2n * E18 }), new Set(), true);
    expect(low?.text).toContain('about 8 more hours');
    expect(nextTip(site({ tank: 2n * E18 }), new Set([low?.id ?? '']), true)?.id).toBe('first-rig');
  });

  it('moves on as tips are dismissed and stops at the end', () => {
    const seen = new Set<string>();
    const ids: string[] = [];
    const state = site({ padsUsed: 2 }, [1, 1]);
    for (let tip = nextTip(state, seen, true); tip !== null; tip = nextTip(state, seen, true)) {
      ids.push(tip.id);
      seen.add(tip.id);
    }
    // Level 1 has 4 pads: two free.
    expect(ids).toEqual(['free-pad-2', 'world-bore', 'crew']);
    expect(nextTip(state, new Set(['free-pad-2', 'world-bore']), false)).toBeNull();
  });

  it('suggests refining once the market is open and something is mined', () => {
    const state = site({ pending: 5n * E18 }, [1, 1]);
    state.network.marketOpened = true;
    expect(nextTip(state, new Set(), true)?.id).toBe('refine');
  });

  it('suggests a bigger site when every pad is taken', () => {
    expect(nextTip(site({ padsUsed: 4 }, [1, 3]), new Set(), true)?.id).toBe('site-full-1');
  });
});
