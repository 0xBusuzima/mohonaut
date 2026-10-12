import { CAP, hourlyEmission, sitePads, splitEmission } from '@mohonaut/sdk';
import { describe, expect, it } from 'vitest';
import {
  applyCall,
  newTraining,
  tick,
  trainingDp,
  trainingGameState,
  trainingRigCost,
} from '../src/game/training';

const WAD = 10n ** 18n;

describe('the training site', () => {
  it('pays the player their DP share of the 90% slice, hour by hour', () => {
    const s = newTraining();
    const after = tick(s, 3600);
    const miners = splitEmission(hourlyEmission(CAP)).miners;
    // 10 DP of the Pilot Rig against 2,000 DP of others, within the others' small growth.
    const expected = (miners * 10n) / 2_010n;
    expect(after.pending - s.pending).toBeGreaterThan((expected * 99n) / 100n);
    expect(after.pending - s.pending).toBeLessThanOrEqual(expected);
    expect(after.emitted).toBeGreaterThan(0n);
    expect(after.reserve + after.emitted).toBe(CAP);
  });

  it('stops paying when the tank runs dry', () => {
    const dry = { ...newTraining(), tank: WAD / 100n }; // 0.01 l: gone within a few minutes
    const after = tick(dry, 2 * 3600);
    expect(after.tank).toBe(0n);
    const later = tick(after, 3600);
    expect(later.pending).toBe(after.pending);
  });

  it('buys rigs with unrefined practice $MOHN, within pads, level and fuel line', () => {
    const s = newTraining();
    const bought = applyCall(s, { fn: 'buyMachines', args: [1n, 1, 0n, false] });
    expect(bought.error).toBeNull();
    expect(bought.state.pending).toBe(s.pending - trainingRigCost(1, 1));
    expect(trainingDp(bought.state)).toBe(60n);
    expect(applyCall(s, { fn: 'buyMachines', args: [2n, 1, 0n, false] }).error).toMatch(/level 3/);
    expect(applyCall(s, { fn: 'buyMachines', args: [1n, 9, 0n, false] }).error).toMatch(/pad/);
    const rich = { ...s, pending: 1_000_000n * WAD };
    // Level 1: 6 l/h of fuel line; the Pilot burns 0.25, so five Rotary Rigs would not fit.
    expect(applyCall(rich, { fn: 'buyMachines', args: [1n, 3, 0n, false] }).error).toBeNull();
    expect(sitePads(1)).toBe(4);
  });

  it('upgrades the site, scraps rigs for credit and spends the credit first', () => {
    const rich = { ...newTraining(), pending: 10_000n * WAD };
    const up = applyCall(rich, { fn: 'upgradeSite', args: [0n, false] });
    expect(up.state.level).toBe(2);
    const withRig = applyCall(up.state, { fn: 'buyMachines', args: [1n, 1, 0n, false] }).state;
    const scrapped = applyCall(withRig, { fn: 'scrapMachines', args: [1n, 1] }).state;
    expect(scrapped.scrapCredit).toBe(trainingRigCost(1, 1) / 5n);
    const again = applyCall(scrapped, { fn: 'buyMachines', args: [1n, 1, 0n, false] }).state;
    expect(again.scrapCredit).toBe(0n);
    expect(again.pending).toBe(scrapped.pending - (trainingRigCost(1, 1) * 4n) / 5n);
  });

  it('refines fast for 8%, or through the 72-hour queue', () => {
    const s = newTraining();
    const fast = applyCall(s, { fn: 'refine', args: [100n * WAD, true] }).state;
    expect(fast.wallet).toBe(92n * WAD);
    const queued = applyCall(s, { fn: 'refine', args: [100n * WAD, false] }).state;
    expect(applyCall(queued, { fn: 'finalizeRefine', args: ['0x', 0n] }).error).toMatch(/queue/);
    const done = applyCall(tick(queued, 72 * 3600), { fn: 'finalizeRefine', args: ['0x', 0n] });
    expect(done.error).toBeNull();
    expect(done.state.wallet).toBe(100n * WAD);
  });

  it('buys diesel with practice ETH, up to the tank', () => {
    const s = newTraining();
    const fuel = applyCall(s, { fn: 'buyFuel', args: [], value: WAD / 100n });
    expect(fuel.state.tank - s.tank).toBe(250n * WAD);
    expect(applyCall(s, { fn: 'buyFuel', args: [], value: WAD }).error).toMatch(/practice ETH/);
  });

  it('shows itself to the game as a registered site in an open market', () => {
    const g = trainingGameState(newTraining(), 1_800_000_000);
    expect(g.player?.registered).toBe(true);
    expect(g.network.marketOpened).toBe(true);
    expect(g.rigs[1]?.price).toBe(trainingRigCost(1, 1));
    expect(g.network.activeDp).toBe(2_010n);
  });
});
