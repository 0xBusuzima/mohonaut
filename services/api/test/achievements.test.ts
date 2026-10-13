import { describe, expect, it } from 'vitest';
import { earnedAchievements } from '../src/game/achievements.js';
import type { AchievementInput } from '../src/game/achievements.js';

const pioneerRun: AchievementInput = {
  fuelEth: 10n ** 15n,
  rigsBought: 1n,
  efficiency: null,
  witnessedKola: false,
  completedSets: 0,
  inCrew: true,
  siteLevel: 3,
  refined: true,
  testnet: true,
  flagged: false,
};

describe('Pioneer badge (docs/09 §2)', () => {
  it('needs all five Season 0 milestones on testnet', () => {
    expect(earnedAchievements(pioneerRun)).toContain('pioneer');
    for (const miss of [
      { fuelEth: 0n },
      { rigsBought: 0n },
      { siteLevel: 2 },
      { refined: false },
      { inCrew: false },
    ]) {
      expect(earnedAchievements({ ...pioneerRun, ...miss })).not.toContain('pioneer');
    }
  });

  it('is never earned on mainnet or by a flagged account', () => {
    expect(earnedAchievements({ ...pioneerRun, testnet: false })).not.toContain('pioneer');
    expect(earnedAchievements({ ...pioneerRun, flagged: true })).not.toContain('pioneer');
    // Factual badges stay: they describe what happened, they are not rewards.
    expect(earnedAchievements({ ...pioneerRun, flagged: true })).toContain('spud-in');
  });
});
