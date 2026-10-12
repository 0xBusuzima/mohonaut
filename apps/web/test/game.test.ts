import { BaseError, ContractFunctionRevertedError, encodeErrorResult, zeroAddress } from 'viem';
import { MAX_SITE_LEVEL, miningCoreAbi, sitePads } from '@mohonaut/sdk';
import { describe, expect, it } from 'vitest';
import {
  efficiency,
  minersShare,
  perHourEstimate,
  shareOfNetwork,
  tankRoom,
  weiForAtMostLitres,
  weiForLitres,
  withHeadroom,
} from '../src/game/derive';
import { explain } from '../src/game/errors';
import { parseAmount, referrerFromUrl, rigName, scenePads } from '../src/game/play';
import { siteRows } from '../src/game/pixel/world';
import { formatEthInput } from '../src/lib/format';
import { rigShape, rigSvg } from '../src/game/rigs';
import { GEN1_RIGS } from '../src/lib/catalog';

const E18 = 10n ** 18n;

describe('HUD arithmetic', () => {
  it('estimates the hourly share like the contract splits emission', () => {
    expect(minersShare(2083n * E18)).toBe((2083n * E18 * 9000n) / 10000n);
    // 10 DP of 110: 9/11 of nothing... 90% of 2,000 × 10 / 110
    expect(perHourEstimate(10n, 110n, 2000n * E18)).toBe((1800n * E18 * 10n) / 110n);
    expect(perHourEstimate(0n, 110n, 2000n * E18)).toBe(0n);
    expect(perHourEstimate(10n, 0n, 2000n * E18)).toBe(0n);
  });

  it('formats the network share and efficiency', () => {
    expect(shareOfNetwork(42n, 10_000n)).toBe('0.42%');
    expect(shareOfNetwork(0n, 10_000n)).toBe('0%');
    expect(efficiency(2700n, 30n * E18)).toBe(90);
    expect(efficiency(10n, 0n)).toBeNull();
  });

  it('adds price headroom and converts litres to ETH, rounding up', () => {
    expect(withHeadroom(10_000n)).toBe(10_200n);
    // 25,000 litres per ETH: 10 litres cost 0.0004 ETH
    expect(weiForLitres(10n * E18, 25_000n * E18)).toBe(4n * 10n ** 14n);
    expect(weiForLitres(1n, 3n)).toBe(E18 / 3n + 1n);
  });
});

function reverted(errorName: string, args: readonly unknown[] = []): BaseError {
  const data = encodeErrorResult({ abi: miningCoreAbi, errorName, args } as never);
  const inner = new ContractFunctionRevertedError({
    abi: miningCoreAbi,
    data,
    functionName: 'buyFuel',
  });
  return new BaseError('execution reverted', { cause: inner });
}

describe('error messages', () => {
  it('explains contract errors in game words', () => {
    expect(explain(reverted('OracleStale'))).toContain('diesel sales are paused');
    expect(explain(reverted('NoFreePad'))).toContain('All pads are taken');
    expect(explain(reverted('ProtocolPaused', [1_792_015_200n]))).toContain(
      'until 14 Oct 22:00 UTC',
    );
    expect(explain(reverted('MintWindowFull', [0n]))).toContain('nothing is lost');
    expect(explain(reverted('TankCapExceeded', [42n * E18]))).toContain('max 42.0 ℓ');
    expect(explain(reverted('AlreadyWired'))).toBe('The game refused this (AlreadyWired).');
  });

  it('explains wallet and network failures', () => {
    expect(explain(new Error('User rejected the request.'))).toContain('cancelled');
    expect(explain(new Error('insufficient funds for gas'))).toContain('Not enough ETH');
    expect(explain(new Error('fetch failed'))).toContain('network did not answer');
    expect(explain('weird')).toContain('Nothing was sent');
  });
});

describe('play screen helpers', () => {
  it('parses amounts with either decimal mark and rejects junk', () => {
    expect(parseAmount('0.5')).toBe(E18 / 2n);
    expect(parseAmount(' 0,25 ')).toBe(E18 / 4n);
    expect(parseAmount('')).toBe(0n);
    expect(parseAmount('abc')).toBe(0n);
  });

  it('lays out owned rigs, then empty pads, and stops everything on an empty tank', () => {
    const rigs = [
      { id: 0, owned: 1, active: 1 },
      { id: 1, owned: 2, active: 1 },
    ];
    const pads = scenePads(1, rigs, E18);
    expect(pads).toHaveLength(sitePads(1));
    expect(pads.slice(0, 3)).toEqual([
      { typeId: 0, running: true },
      { typeId: 1, running: true },
      { typeId: 1, running: false },
    ]);
    expect(pads.slice(3).every((p) => p.typeId === null)).toBe(true);
    expect(scenePads(1, rigs, 0n).some((p) => p.running)).toBe(false);
    expect(scenePads(0, rigs, E18)).toEqual([]);
  });

  it('names catalog rigs and falls back for later generations', () => {
    expect(rigName(0)).toBe('Pilot Rig');
    expect(rigName(9)).toBe('Rig type 9');
  });

  it('offers only the diesel the tank takes, like MiningCore._maxTank', () => {
    const L = E18;
    const base = {
      genesisTime: 1_000_000,
      marketOpenTime: 1_000_000 + 72 * 3600,
      maxTankHours: 720,
      capacityPerHour: 6n * L, // level 1 fuel line
      burn: L / 4n, // Pilot Rig
      tank: 0n,
    };
    // After Market Open: fuel line capacity x 720 h.
    expect(tankRoom({ ...base, now: base.marketOpenTime })).toBe(4320n * L);
    // Before it: what the rigs burn until Market Open + 24 h (here 49 h + 24 h = 73 h x 0.25).
    const now = base.marketOpenTime - 49 * 3600;
    expect(tankRoom({ ...base, now })).toBe((73n * L) / 4n);
    expect(tankRoom({ ...base, now, tank: 10n * L })).toBe((73n * L) / 4n - 10n * L);
    expect(tankRoom({ ...base, now, tank: 99n * L })).toBe(0n);
    // At most that many litres, 1 % under the quote; input text with 6 decimals.
    const wei = weiForAtMostLitres(18n * L, 25_000n * L);
    expect((wei * 25_000n * L) / E18 <= 18n * L).toBe(true);
    expect(formatEthInput(wei)).toBe('0.000712');
    expect(formatEthInput(2n * E18)).toBe('2');
  });

  it('grows the site a row of four pads at a time, with a locked slot ahead', () => {
    expect(siteRows(sitePads(1))).toBe(3);
    expect(siteRows(11)).toBe(3); // 11 pads + 1 locked fill three rows
    expect(siteRows(12)).toBe(4);
    // Every level's pads fit, the top level included.
    for (let level = 1; level <= MAX_SITE_LEVEL; level++) {
      expect(siteRows(sitePads(level)) * 4).toBeGreaterThanOrEqual(sitePads(level));
    }
  });

  it('draws every Gen-1 rig differently, and running differently from switched off', () => {
    const drawings = GEN1_RIGS.map((_, i) => rigSvg(rigShape(i, true)));
    expect(new Set(drawings).size).toBe(GEN1_RIGS.length);
    for (let i = 0; i < GEN1_RIGS.length; i++) {
      const on = rigShape(i, true);
      expect(rigSvg(rigShape(i, false))).not.toBe(rigSvg(on));
      expect(rigSvg(on)).toContain('#ff6b1a'); // safety orange while drilling
      // Steam rises from above the highest part of the drawing.
      const top = Math.min(
        ...on.parts.map((p) =>
          p.kind === 'rect'
            ? p.y
            : p.kind === 'circle'
              ? p.y - p.r
              : Math.min(...p.points.filter((_, k) => k % 2 === 1)),
        ),
      );
      expect(on.steamY).toBeLessThanOrEqual(top);
    }
    expect(rigSvg(rigShape(99, true))).toBe(rigSvg(rigShape(1, true))); // unknown: Rotary Rig
  });

  it('reads the referrer only from a valid ?ref= address', () => {
    const ref = '0x1111111111111111111111111111111111111111';
    window.history.replaceState(null, '', `/play/?ref=${ref}`);
    expect(referrerFromUrl()).toBe(ref);
    window.history.replaceState(null, '', '/play/?ref=nope');
    expect(referrerFromUrl()).toBe(zeroAddress);
  });
});
