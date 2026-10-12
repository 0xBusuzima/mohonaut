import { readFileSync } from 'node:fs';
import { getAddress } from 'viem';
import { z } from 'zod';

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((a) => getAddress(a));

/** deployments/<chainId>[-name].json, written by contracts/script/Deploy.s.sol. */
export const deploymentSchema = z.object({
  chainId: z.number().int().positive(),
  genesisTime: z.number().int().nonnegative(),
  startBlock: z.number().int().nonnegative(),
  MohnToken: address,
  MiningCore: address,
  RevenueRouter: address,
  BuybackBurner: address,
  LiquidityManager: address,
  ParamsTimelock: address,
  UpgradeTimelock: address,
});

export type Deployment = z.infer<typeof deploymentSchema>;

export function loadDeployment(path: string): Deployment {
  return deploymentSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

const envSchema = z.object({
  RPC_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  DEPLOYMENT_FILE: z.string().min(1),
  POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(10_000),
  /** Blocks behind the head that are indexed (reorg margin; Robinhood Chain makes ~10 blocks/s). */
  CONFIRMATIONS: z.coerce.number().int().min(0).default(20),
  MAX_BLOCK_RANGE: z.coerce.number().int().min(1).default(50_000),
  /** The pool stream (swaps) is polled every n-th tick to save RPC compute units. */
  POOL_POLL_EVERY: z.coerce.number().int().min(1).default(6),
  METRICS_HOST: z.string().default('127.0.0.1'),
  METRICS_PORT: z.coerce.number().int().min(0).max(65_535).default(9464),
});

export interface Config {
  rpcUrl: string;
  databaseUrl: string;
  deployment: Deployment;
  pollIntervalMs: number;
  confirmations: bigint;
  maxBlockRange: bigint;
  poolPollEvery: number;
  metricsHost: string;
  metricsPort: number;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const e = envSchema.parse(env);
  return {
    rpcUrl: e.RPC_URL,
    databaseUrl: e.DATABASE_URL,
    deployment: loadDeployment(e.DEPLOYMENT_FILE),
    pollIntervalMs: e.POLL_INTERVAL_MS,
    confirmations: BigInt(e.CONFIRMATIONS),
    maxBlockRange: BigInt(e.MAX_BLOCK_RANGE),
    poolPollEvery: e.POOL_POLL_EVERY,
    metricsHost: e.METRICS_HOST,
    metricsPort: e.METRICS_PORT,
  };
}
