import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  RPC_URL: 'https://rpc.testnet.chain.robinhood.com',
  DATABASE_URL: 'memory://',
  DEPLOYMENT_FILE: fileURLToPath(new URL('../../../deployments/46630.json', import.meta.url)),
};
const KEY = `0x${'11'.repeat(32)}`;

describe('keeper config', () => {
  it('takes a keystore or a raw key, not both or neither', () => {
    expect(loadConfig({ ...base, KEEPER_KEYSTORE: 'ks.json' }).key).toEqual({
      keystore: 'ks.json',
      passwordFile: null,
    });
    expect(loadConfig({ ...base, KEEPER_PRIVATE_KEY: KEY }).key).toEqual({ privateKey: KEY });
    expect(() => loadConfig(base)).toThrow('exactly one');
    expect(() => loadConfig({ ...base, KEEPER_PRIVATE_KEY: KEY, KEEPER_KEYSTORE: 'k' })).toThrow(
      'exactly one',
    );
    expect(() => loadConfig({ ...base, KEEPER_PRIVATE_KEY: '0x1234' })).toThrow();
  });

  it('needs no key in a dry run (simulates from the deployment keeper)', () => {
    expect(loadConfig({ ...base, DRY_RUN: 'true' }).key).toEqual({
      address: '0xbA27372EaE81EE53d7D434deD7D3299A383C2a6c',
    });
    const other = '0x1111111111111111111111111111111111111111';
    expect(loadConfig({ ...base, DRY_RUN: 'true', KEEPER_ADDRESS: other }).key).toEqual({
      address: other,
    });
  });

  it('reads an empty value (a blank line copied from .env.example) as not set', () => {
    expect(loadConfig({ ...base, DRY_RUN: 'true', KEEPER_KEYSTORE: '' }).key).toEqual({
      address: '0xbA27372EaE81EE53d7D434deD7D3299A383C2a6c',
    });
    expect(loadConfig({ ...base, KEEPER_KEYSTORE: 'ks.json', KEEPER_PRIVATE_KEY: '' }).key).toEqual(
      {
        keystore: 'ks.json',
        passwordFile: null,
      },
    );
  });

  it('refuses a blank JOBS line instead of running every job', () => {
    expect(() => loadConfig({ ...base, KEEPER_PRIVATE_KEY: KEY, JOBS: '' })).toThrow(
      'JOBS is empty',
    );
  });

  it('parses the job list and defaults', () => {
    const cfg = loadConfig({ ...base, KEEPER_PRIVATE_KEY: KEY, JOBS: 'poke, finalize' });
    expect(cfg.jobs).toEqual(['poke', 'finalize']);
    expect(cfg.slippageBps).toBe(100n);
    expect(cfg.deployment.chainId).toBe(46630);
    expect(() => loadConfig({ ...base, KEEPER_PRIVATE_KEY: KEY, JOBS: 'poke,steal' })).toThrow();
  });
});
