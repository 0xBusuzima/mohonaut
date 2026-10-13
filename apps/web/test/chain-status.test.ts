import { miningCoreAbi } from '@mohonaut/sdk';
import { toFunctionSelector } from 'viem';
import { describe, expect, it } from 'vitest';
import { SELECTORS, readChainStatus, statusRows } from '../src/game/chain-status';

const hex = (n: number | bigint) => `0x${BigInt(n).toString(16).padStart(64, '0')}`;

describe('the chain status reader', () => {
  it('uses the selectors of the functions MiningCore has', () => {
    const names = new Set<string>(
      miningCoreAbi.filter((f) => f.type === 'function').map((f) => f.name),
    );
    expect(SELECTORS.pausedUntil).toBe(toFunctionSelector('pausedUntil()'));
    expect(SELECTORS.lastUpdate).toBe(toFunctionSelector('lastUpdate()'));
    expect(SELECTORS.marketOpened).toBe(toFunctionSelector('marketOpened()'));
    expect(SELECTORS.marketOpenTime).toBe(toFunctionSelector('marketOpenTime()'));
    expect(SELECTORS.quoteLitres).toBe(toFunctionSelector('quoteLitres(uint256)'));
    for (const name of Object.keys(SELECTORS)) expect(names.has(name)).toBe(true);
  });

  it('reads the state in one batch, and a reverting quote as diesel sales paused', async () => {
    let sent: { id: number; method: string }[] = [];
    const fake = (_: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)) as typeof sent;
      return Promise.resolve(
        new Response(
          JSON.stringify([
            { id: 0, result: { timestamp: '0x6a000000' } },
            { id: 1, result: hex(0) },
            { id: 2, result: hex(0x69fff000) },
            { id: 3, result: hex(1) },
            { id: 4, result: hex(0x69000000) },
            { id: 5, error: { code: 3, message: 'execution reverted' } },
          ]),
        ),
      );
    };
    const s = await readChainStatus('https://rpc.example', '0xcore', fake);
    expect(sent.map((c) => c.method)).toEqual([
      'eth_getBlockByNumber',
      ...Array(5).fill('eth_call'),
    ]);
    expect(s).toEqual({
      blockTime: 0x6a000000,
      pausedUntil: 0,
      lastUpdate: 0x69fff000,
      marketOpened: true,
      marketOpenTime: 0x69000000,
      dieselOpen: false,
    });
  });

  it('puts the state in words, flagging a pause, a late keeper and a late price feed', () => {
    const now = 2_000_000_000;
    const utc = (t: number) => `t${t}`;
    const fine = statusRows(
      {
        blockTime: now - 5,
        pausedUntil: 0,
        lastUpdate: now - 600,
        marketOpened: false,
        marketOpenTime: now + 3600,
        dieselOpen: true,
      },
      now,
      utc,
    );
    expect(fine.every((r) => r.ok)).toBe(true);
    expect(fine.find((r) => r.label === 'Market')?.text).toBe(
      `Opens at Market Open, t${now + 3600}.`,
    );
    const trouble = statusRows(
      {
        blockTime: now - 5,
        pausedUntil: now + 7200,
        lastUpdate: now - 3 * 3600,
        marketOpened: true,
        marketOpenTime: 0,
        dieselOpen: false,
      },
      now,
      utc,
    );
    expect(trouble.filter((r) => !r.ok).map((r) => r.label)).toEqual([
      'Player actions',
      'Hourly checkpoint',
      'Diesel sales',
    ]);
    expect(trouble.find((r) => r.label === 'Player actions')?.text).toContain('ends by itself');
  });
});
