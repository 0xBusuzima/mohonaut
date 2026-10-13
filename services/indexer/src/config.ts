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
  /** Chainlink ETH/USD proxy (mainnet) or the keeper-owned ManualEthUsdFeed (testnet). */
  EthUsdFeed: address.optional(),
  Keeper: address.optional(),
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
  /** On-chain alerts (ADR-014): Telegram bot token, preferably from a secret file. */
  ALERT_TELEGRAM_TOKEN_FILE: z.string().min(1).optional(),
  ALERT_TELEGRAM_TOKEN: z.string().min(1).optional(),
  ALERT_TELEGRAM_CHAT_ID: z
    .string()
    .regex(/^-?\d+$/)
    .optional(),
  ALERT_WEBHOOK_URL: z.url().optional(),
  ALERT_MIN_SEVERITY: z.enum(['info', 'warning', 'critical']).default('warning'),
  ALERT_MAX_AGE_S: z.coerce.number().int().min(60).default(86_400),
  LARGE_TRANSFER_MOHN: z.coerce.bigint().min(1n).default(50_000n),
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
  alerts: {
    telegram: { token: string; chatId: string } | null;
    webhookUrl: string | null;
    minSeverity: 'info' | 'warning' | 'critical';
    maxAgeSeconds: number;
    largeTransferWei: bigint;
  };
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  // An empty value (a blank line left from .env.example) means the variable is not set.
  const e = envSchema.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  const token =
    e.ALERT_TELEGRAM_TOKEN_FILE === undefined
      ? e.ALERT_TELEGRAM_TOKEN
      : readFileSync(e.ALERT_TELEGRAM_TOKEN_FILE, 'utf8').trim();
  if ((token === undefined) !== (e.ALERT_TELEGRAM_CHAT_ID === undefined)) {
    throw new Error('set both the Telegram token (file) and ALERT_TELEGRAM_CHAT_ID, or neither');
  }
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
    alerts: {
      telegram:
        token === undefined || e.ALERT_TELEGRAM_CHAT_ID === undefined
          ? null
          : { token, chatId: e.ALERT_TELEGRAM_CHAT_ID },
      webhookUrl: e.ALERT_WEBHOOK_URL ?? null,
      minSeverity: e.ALERT_MIN_SEVERITY,
      maxAgeSeconds: e.ALERT_MAX_AGE_S,
      largeTransferWei: e.LARGE_TRANSFER_MOHN * 10n ** 18n,
    },
  };
}
