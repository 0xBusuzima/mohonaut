import { loadDeployment } from '@mohonaut/indexer';
import type { Deployment } from '@mohonaut/indexer';
import { getAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { z } from 'zod';

export const JOB_NAMES = [
  'feed',
  'poke',
  'openMarket',
  'finalize',
  'buyback',
  'addLiquidity',
] as const;
export type JobName = (typeof JOB_NAMES)[number];

const envSchema = z.object({
  RPC_URL: z.url(),
  /** The indexer's database: refine queue candidates, reference price, the job lock. */
  DATABASE_URL: z.string().min(1),
  DEPLOYMENT_FILE: z.string().min(1),
  /**
   * The keeper key (KEEPER_ROLE only), one of: an encrypted Foundry keystore (preferred:
   * `cast wallet import keeper --interactive`) with its password in KEEPER_PASSWORD_FILE or typed
   * at start, or a raw key injected by a secret manager. Never commit either.
   */
  KEEPER_KEYSTORE: z.string().min(1).optional(),
  KEEPER_PASSWORD_FILE: z.string().min(1).optional(),
  KEEPER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'a 0x-prefixed 32-byte hex key')
    .optional(),
  /** Simulate every transaction from KEEPER_ADDRESS (default: the deployment's keeper), send none. */
  DRY_RUN: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  KEEPER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .transform((a) => getAddress(a))
    .optional(),
  TICK_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
  JOBS: z
    .string()
    .default(JOB_NAMES.join(','))
    .transform((s) => s.split(',').map((j) => j.trim()))
    .pipe(z.array(z.enum(JOB_NAMES))),
  SLIPPAGE_BPS: z.coerce.bigint().min(0n).max(1000n).default(100n),
  /** Skip buybacks and additions when the pool price is this far from the reference price. */
  MAX_PRICE_DEVIATION_BPS: z.coerce.bigint().min(0n).max(5000n).default(1000n),
  /** Skip a buyback or liquidity chunk smaller than this (not worth the gas). */
  MIN_SPEND_WEI: z.coerce
    .bigint()
    .min(0n)
    .default(10n ** 12n),
  /** Testnet price feed: refresh when older than this (MiningCore staleness limit: 25-30 h). */
  FEED_REFRESH_AFTER_S: z.coerce.bigint().min(3600n).default(72_000n),
  /**
   * Run the indexer inside this process before every tick (one machine, embedded PGlite: two
   * processes cannot share a PGlite directory). With Postgres, run the indexer separately.
   */
  RUN_INDEXER: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  METRICS_HOST: z.string().default('127.0.0.1'),
  METRICS_PORT: z.coerce.number().int().min(0).max(65_535).default(9465),
});

export type KeySource =
  | { privateKey: Hex }
  | { keystore: string; passwordFile: string | null }
  /** Dry run: no key; transactions are simulated from this address. */
  | { address: Address };

export interface Config {
  rpcUrl: string;
  databaseUrl: string;
  deployment: Deployment;
  key: KeySource;
  tickIntervalMs: number;
  jobs: JobName[];
  slippageBps: bigint;
  maxPriceDeviationBps: bigint;
  minSpendWei: bigint;
  feedRefreshAfterS: bigint;
  runIndexer: boolean;
  metricsHost: string;
  metricsPort: number;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const e = envSchema.parse(env);
  const deployment = loadDeployment(e.DEPLOYMENT_FILE);
  let key: KeySource;
  if (e.DRY_RUN) {
    const address = e.KEEPER_ADDRESS ?? deployment.Keeper;
    if (address === undefined)
      throw new Error('DRY_RUN needs KEEPER_ADDRESS or a Keeper in the deployment');
    key = { address };
  } else if (e.KEEPER_KEYSTORE !== undefined && e.KEEPER_PRIVATE_KEY === undefined) {
    key = { keystore: e.KEEPER_KEYSTORE, passwordFile: e.KEEPER_PASSWORD_FILE ?? null };
  } else if (e.KEEPER_PRIVATE_KEY !== undefined && e.KEEPER_KEYSTORE === undefined) {
    key = { privateKey: e.KEEPER_PRIVATE_KEY as Hex };
  } else {
    throw new Error('set exactly one of KEEPER_KEYSTORE and KEEPER_PRIVATE_KEY');
  }
  return {
    rpcUrl: e.RPC_URL,
    databaseUrl: e.DATABASE_URL,
    deployment,
    key,
    tickIntervalMs: e.TICK_INTERVAL_MS,
    jobs: e.JOBS,
    slippageBps: e.SLIPPAGE_BPS,
    maxPriceDeviationBps: e.MAX_PRICE_DEVIATION_BPS,
    minSpendWei: e.MIN_SPEND_WEI,
    feedRefreshAfterS: e.FEED_REFRESH_AFTER_S,
    runIndexer: e.RUN_INDEXER,
    metricsHost: e.METRICS_HOST,
    metricsPort: e.METRICS_PORT,
  };
}
