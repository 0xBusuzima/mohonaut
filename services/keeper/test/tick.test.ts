import { describe, expect, it, vi } from 'vitest';
import { Keeper } from '../src/keeper.js';
import { Metrics } from '../src/metrics.js';

describe('a keeper tick', () => {
  it('reports a failed balance read and still runs its jobs', async () => {
    const getBlock = vi.fn(async () => ({ timestamp: 1_000n }));
    const keeper = new Keeper(
      { jobs: [] } as never,
      {} as never,
      {
        address: '0x0000000000000000000000000000000000000001',
        publicClient: {
          getBalance: async () => {
            throw new Error('HTTP request failed.\nfetch failed');
          },
          getBlock,
        },
        walletClient: null,
      } as never,
      {} as never,
      { acquire: async () => true, release: async () => undefined } as never,
      new Metrics(),
      '0x0000000000000000000000000000000000000002',
    );
    const report = await keeper.tick();
    expect(report.active).toBe(true);
    expect(report.outcomes['balance']).toBe('error: HTTP request failed.');
  });
});
