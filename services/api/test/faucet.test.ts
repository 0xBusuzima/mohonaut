import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import type { FaucetSender } from '../src/faucet.js';
import { faucetSender } from '../src/faucet.js';
import { call, harness } from './helpers.js';

const E15 = 10n ** 15n;
const FAUCET: Address = '0x00000000000000000000000000000000000FA0CE';

function fakeFaucet(balances: Map<string, bigint>): FaucetSender & { sent: [Address, bigint][] } {
  const sent: [Address, bigint][] = [];
  return {
    address: FAUCET,
    sent,
    balanceOf: async (a) => balances.get(a.toLowerCase()) ?? 0n,
    send: async (to, value) => {
      sent.push([to, value]);
      balances.set(FAUCET.toLowerCase(), (balances.get(FAUCET.toLowerCase()) ?? 0n) - value);
      return `0x${'ab'.repeat(32)}` as Hex;
    },
  };
}

async function faucetHarness(opts: { budget?: bigint; faucetBalance?: bigint } = {}) {
  const balances = new Map<string, bigint>([
    [FAUCET.toLowerCase(), opts.faucetBalance ?? 100n * E15],
  ]);
  const h = await harness({
    faucet: {
      keyFile: '/unused',
      amountWei: E15,
      dailyBudgetWei: opts.budget ?? 50n * E15,
      maxRecipientBalanceWei: 3n * E15,
    },
  });
  const faucet = fakeFaucet(balances);
  h.deps.faucet = faucet;
  return { h, faucet, balances };
}

const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;

describe('testnet faucet', () => {
  it('says whether it is on, how much it gives and where to donate', async () => {
    const off = await harness();
    expect((await call(off, 'GET', '/faucet')).json).toEqual({
      enabled: false,
      amountWei: null,
      address: null,
      balanceWei: null,
    });
    const { h } = await faucetHarness();
    expect((await call(h, 'GET', '/faucet')).json).toEqual({
      enabled: true,
      amountWei: E15.toString(),
      address: FAUCET,
      balanceWei: (100n * E15).toString(),
    });
  });

  it('sends once per wallet per day, skips wallets that have enough, needs the bot check', async () => {
    const { h, faucet, balances } = await faucetHarness();
    const first = await call(h, 'POST', '/faucet', { body: { address: addr(1) } });
    expect(first.status).toBe(200);
    expect(faucet.sent).toEqual([[getAddress(addr(1)), E15]]);
    expect((await call(h, 'POST', '/faucet', { body: { address: addr(1) } })).status).toBe(429);

    balances.set(addr(2), 5n * E15);
    const rich = await call(h, 'POST', '/faucet', {
      body: { address: addr(2) },
      ip: '203.0.113.8',
    });
    expect(rich.status).toBe(409);

    h.turnstileOk.value = false;
    const bot = await call(h, 'POST', '/faucet', { body: { address: addr(3) }, ip: '203.0.113.9' });
    expect(bot.status).toBe(403);
    expect(faucet.sent).toHaveLength(1);
  });

  it('stops at the daily budget and when its own balance runs low', async () => {
    const { h } = await faucetHarness({ budget: 2n * E15 });
    const ips = ['198.51.100.1', '198.51.100.2', '198.51.100.3'];
    const results = [];
    for (const [i, ip] of ips.entries()) {
      results.push(
        (await call(h, 'POST', '/faucet', { body: { address: addr(10 + i) }, ip })).status,
      );
    }
    expect(results).toEqual([200, 200, 429]);

    const empty = await faucetHarness({ faucetBalance: E15 });
    const res = await call(empty.h, 'POST', '/faucet', { body: { address: addr(20) } });
    expect(res.status).toBe(503);
  });

  it('limits each IP to three requests a day', async () => {
    const { h } = await faucetHarness();
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await call(h, 'POST', '/faucet', { body: { address: addr(30 + i) } })).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('can never run on mainnet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'faucet-'));
    const deployment = join(dir, '4663.json');
    writeFileSync(
      deployment,
      JSON.stringify({
        chainId: 4663,
        genesisTime: 1,
        startBlock: 1,
        MohnToken: addr(1),
        MiningCore: addr(2),
        RevenueRouter: addr(3),
        BuybackBurner: addr(4),
        LiquidityManager: addr(5),
        ParamsTimelock: addr(6),
        UpgradeTimelock: addr(7),
      }),
    );
    const env = {
      DATABASE_URL: 'memory://',
      DEPLOYMENT_FILE: deployment,
      WEB_ORIGIN: 'https://mohonaut.com',
      SURVEY_SECRET: 'x'.repeat(40),
      RPC_URL: 'https://rpc.mainnet.chain.robinhood.com',
      FAUCET_KEY_FILE: join(dir, 'key'),
    };
    expect(() => loadConfig(env)).toThrow(/testnet only/);
    expect(() =>
      faucetSender(
        { keyFile: 'k', amountWei: 1n, dailyBudgetWei: 1n, maxRecipientBalanceWei: 1n },
        4663,
        'http://x',
      ),
    ).toThrow(/never runs on mainnet/);
  });
});
