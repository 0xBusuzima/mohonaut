/**
 * End-to-end on a local anvil chain with time travel (docs/06 §3.3): the real deploy script,
 * the Uniswap v4 PoolManager bytecode of Robinhood Chain, players, the indexer and the keeper.
 *
 * Opt-in (needs Foundry): KEEPER_E2E=1 [FOUNDRY_BIN=<dir with anvil and forge>] npm test
 * With KEEPER_E2E_PG_URL=postgres://… it also checks that two keepers never both hold the lock.
 * KEEPER_E2E_EXTERNAL_ANVIL=1 uses an anvil already running on port 18545 (for debugging).
 */
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { miningCoreAbi } from '@mohonaut/sdk';
import {
  Indexer,
  RpcSource,
  contractSet,
  loadDeployment,
  migrate,
  openDatabase,
} from '@mohonaut/indexer';
import type { Database, Deployment } from '@mohonaut/indexer';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  parseEther,
  toHex,
  zeroAddress,
} from 'viem';
import type { Address, Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeClients } from '../../src/chain.js';
import type { Config } from '../../src/config.js';
import { JOB_NAMES } from '../../src/config.js';
import { Keeper } from '../../src/keeper.js';
import { jobLock } from '../../src/lock.js';
import { Metrics } from '../../src/metrics.js';

const RUN = process.env['KEEPER_E2E'] === '1';
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CONTRACTS = join(ROOT, 'contracts');
const PORT = 18_545;
const RPC = `http://127.0.0.1:${PORT}`;
const POOL_MANAGER: Address = getAddress('0x8366a39cc670b4001a1121b8f6a443a643e40951');
// Anvil's default, publicly known test mnemonic (local chain only).
const MNEMONIC = 'test test test test test test test test test test test junk';

const bin = (name: string) =>
  process.env['FOUNDRY_BIN'] ? join(process.env['FOUNDRY_BIN'], name) : name;
const account = (i: number) => mnemonicToAccount(MNEMONIC, { addressIndex: i });
const keyOf = (i: number): Hex => toHex(account(i).getHdKey().privateKey ?? new Uint8Array());

const chain = defineChain({
  id: 31_337,
  name: 'anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const client = createPublicClient({ chain, transport: http(RPC) });

let anvil: ChildProcess | undefined;
let deployment: Deployment;
let database: Database;
let keeper: Keeper;
let indexer: Indexer;

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  return client.request({ method, params } as never);
}

async function warpTo(time: bigint): Promise<void> {
  await rpc('evm_setNextBlockTimestamp', [toHex(time)]);
  await rpc('evm_mine');
}

async function now(): Promise<bigint> {
  return (await client.getBlock()).timestamp;
}

function player(i: number) {
  const wallet = createWalletClient({ chain, transport: http(RPC), account: account(i) });
  const core = { address: deployment.MiningCore, abi: miningCoreAbi } as const;
  const run = async (functionName: string, args: readonly unknown[], value?: bigint) => {
    const { request } = await client.simulateContract({
      ...core,
      functionName,
      args,
      account: account(i),
      ...(value === undefined ? {} : { value }),
    } as never);
    const hash = await wallet.writeContract(request as never);
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe('success');
  };
  return {
    buyFuel: (eth: bigint) => run('buyFuel', [zeroAddress], eth),
    refine: (amount: bigint, fast: boolean) => run('refine', [amount, fast]),
  };
}

const read = <T>(functionName: string, args: readonly unknown[] = []): Promise<T> =>
  client.readContract({
    address: deployment.MiningCore,
    abi: miningCoreAbi,
    functionName,
    args,
  } as never) as Promise<T>;

async function syncIndexer(): Promise<void> {
  while (!(await indexer.step())) {
    // until both streams reach the head
  }
}

describe.runIf(RUN)('keeper on anvil (time travel)', { timeout: 900_000 }, () => {
  beforeAll(async () => {
    // KEEPER_E2E_EXTERNAL_ANVIL=1: use an anvil started by hand on PORT (kept for debugging).
    if (process.env['KEEPER_E2E_EXTERNAL_ANVIL'] !== '1') {
      anvil = spawn(bin('anvil'), [
        '--code-size-limit',
        '98304',
        '--port',
        String(PORT),
        '--silent',
      ]);
    }
    for (let i = 0; ; i++) {
      try {
        await client.getBlockNumber();
        break;
      } catch (err) {
        if (i > 100) throw err;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    const code = readFileSync(
      join(CONTRACTS, 'test', 'fixtures', 'PoolManager.runtime.hex'),
      'utf8',
    ).trim();
    await rpc('anvil_setCode', [POOL_MANAGER, code.startsWith('0x') ? code : `0x${code}`]);

    const genesis = ((await now()) / 3600n + 3n) * 3600n;
    execFileSync(
      bin('forge'),
      [
        'script',
        'script/Deploy.s.sol',
        '--rpc-url',
        RPC,
        '--broadcast',
        '--unlocked',
        '--sender',
        account(0).address,
      ],
      {
        cwd: CONTRACTS,
        stdio: 'pipe',
        env: {
          ...process.env,
          GENESIS_TIME: genesis.toString(),
          OPS_SAFE: account(5).address,
          GUARDIAN_SAFE: account(6).address,
          KEEPER: account(1).address,
          DEV_RECIPIENT: account(7).address,
          TREASURY_RECIPIENT: account(8).address,
          DEPLOYMENT_NAME: 'e2e',
        },
      },
    );
    deployment = loadDeployment(join(ROOT, 'deployments', '31337-e2e.json'));
    expect(deployment.Keeper).toBe(account(1).address);

    database = await openDatabase(process.env['KEEPER_E2E_PG_URL'] ?? 'memory://');
    await migrate(database);
    const contracts = contractSet(deployment, POOL_MANAGER, 1);
    indexer = new Indexer(database, new RpcSource(RPC), {
      contracts,
      confirmations: 0n,
      maxBlockRange: 10_000n,
    });
    const cfg: Config = {
      rpcUrl: RPC,
      databaseUrl: 'memory://',
      deployment,
      key: { privateKey: keyOf(1) },
      tickIntervalMs: 1000,
      jobs: [...JOB_NAMES],
      dailyJobsHourUtc: 0,
      slippageBps: 100n,
      maxPriceDeviationBps: 1000n,
      minDailySpendWei: 1n,
      feedRefreshAfterS: 72_000n,
      runIndexer: false,
      metricsHost: '127.0.0.1',
      metricsPort: 0,
    };
    keeper = new Keeper(
      cfg,
      deployment,
      makeClients(RPC, 31_337, { privateKey: keyOf(1) }),
      database,
      jobLock(cfg.databaseUrl),
      new Metrics(),
      POOL_MANAGER,
    );
  }, 600_000); // compiles and deploys the contracts

  afterAll(async () => {
    await database?.close();
    anvil?.kill();
  });

  it('runs the whole launch: pre-fill, hourly pokes, Market Open, buyback, liquidity, refine queue', async () => {
    const genesis = BigInt(deployment.genesisTime);
    // Pre-fill: three players fuel their Pilot Rigs (within the genesis tank cap).
    for (const i of [2, 3, 4]) await player(i).buyFuel(parseEther('0.0009'));
    let tick = await keeper.tick();
    expect(tick.outcomes['poke']).toBe('up to date'); // before genesis nothing accrues
    expect(tick.outcomes['openMarket']).toBe('not yet');

    // Two hours into the genesis: the keeper closes the hours.
    await warpTo(genesis + 2n * 3600n + 10n);
    tick = await keeper.tick();
    expect(tick.outcomes['poke']).toBe('poked 1');
    expect(await read<bigint>('lastUpdate')).toBeGreaterThanOrEqual(genesis + 2n * 3600n);

    // Market Open (72 h). The testnet price feed is stale by now: the keeper refreshes it first.
    const marketOpen = await read<bigint>('marketOpenTime');
    await warpTo(marketOpen + 10n);
    tick = await keeper.tick();
    expect(tick.outcomes['feed']).toBe('refreshed');
    expect(tick.outcomes['openMarket']).toBe('opened');
    expect(await read<boolean>('marketOpened')).toBe(true);
    expect(Object.values(tick.outcomes).filter((o) => o.startsWith('error'))).toEqual([]);

    // After the open: more fuel (revenue for the buckets) and a standard refine.
    for (const i of [2, 3, 4]) await player(i).buyFuel(parseEther('0.0005'));
    await player(2).refine(parseEther('10'), false);
    await syncIndexer(); // the keeper takes the market open price and the queue from the indexer
    tick = await keeper.tick();
    expect(tick.outcomes['buyback']).toMatch(/^bought back with \d+ wei$/);
    expect(tick.outcomes['addLiquidity']).toMatch(/^added \d+ wei$/);
    expect(tick.outcomes['finalize']).toBe('nothing due');

    // The same tick again does nothing (idempotent).
    tick = await keeper.tick();
    expect(tick.outcomes).toMatchObject({
      poke: 'up to date',
      openMarket: 'open',
      buyback: 'done today',
    });

    // The refine delay passes: the keeper finalizes the queued refine.
    const delay = await read<bigint>('paramValue', [4]); // Param.RefineDelay
    await warpTo((await now()) + delay + 60n);
    tick = await keeper.tick();
    expect(tick.outcomes['finalize']).toBe('finalized 1');
    const request = await read<{ amount: bigint }>('refineRequest', [account(2).address, 0n]);
    expect(request.amount).toBe(0n);
    expect(Object.values(tick.outcomes).filter((o) => o.startsWith('error'))).toEqual([]);
  });

  it.runIf(process.env['KEEPER_E2E_PG_URL'] !== undefined)(
    'lets only one keeper hold the job lock',
    async () => {
      const url = process.env['KEEPER_E2E_PG_URL'] ?? '';
      const a = jobLock(url);
      const b = jobLock(url);
      expect(await a.acquire()).toBe(true);
      expect(await b.acquire()).toBe(false);
      await a.release();
      expect(await b.acquire()).toBe(true);
      await b.release();
    },
  );
});
