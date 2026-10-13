import { loadDeployment } from '@mohonaut/indexer';
import type { Deployment } from '@mohonaut/indexer';
import { getAddress } from 'viem';
import type { Address } from 'viem';
import { z } from 'zod';
import { MAINNET_CHAIN_ID } from './faucet.js';
import type { FaucetConfig } from './faucet.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** The indexer's database (the API owns its own tables in it, see migrations/). */
  DATABASE_URL: z.string().min(1),
  /** redis://… in production (rate limits, nonces); unset: in-memory (one process only). */
  REDIS_URL: z.string().optional(),
  DEPLOYMENT_FILE: z.string().min(1),
  /** Used to verify smart-contract wallet signatures (EIP-1271); EOAs are checked locally. */
  RPC_URL: z.url().optional(),
  /** The game's origin: SIWE domain, CORS and the CSRF origin check. */
  WEB_ORIGIN: z.url(),
  PORT: z.coerce.number().int().min(0).max(65_535).default(8787),
  /** Prometheus metrics on a private port (never exposed through Cloudflare). */
  METRICS_HOST: z.string().default('127.0.0.1'),
  METRICS_PORT: z.coerce.number().int().min(0).max(65_535).default(9466),
  HOST: z.string().default('127.0.0.1'),
  /** HMAC key for the daily Survey find; keep it secret so finds cannot be predicted. */
  SURVEY_SECRET: z.string().min(32),
  TURNSTILE_SECRET: z.string().optional(),
  /** Read the client IP from Cloudflare's CF-Connecting-IP (only behind Cloudflare). */
  TRUST_CLOUDFLARE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Wallets that always hold the admin role (bootstrap; further roles via /admin/roles). */
  ADMIN_WALLETS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.length > 0),
    )
    .pipe(
      z.array(
        z
          .string()
          .regex(/^0x[0-9a-fA-F]{40}$/)
          .transform((a) => getAddress(a)),
      ),
    ),
  /** Optional e-mail login provider (Dynamic or Privy): its JWT issuer, audience and JWKS. */
  EXTERNAL_AUTH_NAME: z.string().optional(),
  EXTERNAL_AUTH_ISSUER: z.string().optional(),
  EXTERNAL_AUTH_AUDIENCE: z.string().optional(),
  EXTERNAL_AUTH_JWKS_URL: z.url().optional(),
  /** Testnet faucet (docs/06 7.2): a file with the faucet wallet's hex key; unset = off. */
  FAUCET_KEY_FILE: z.string().min(1).optional(),
  FAUCET_AMOUNT_WEI: z.coerce.bigint().positive().default(1_000_000_000_000_000n),
  FAUCET_DAILY_BUDGET_WEI: z.coerce.bigint().positive().default(50_000_000_000_000_000n),
  FAUCET_MAX_RECIPIENT_WEI: z.coerce.bigint().positive().default(3_000_000_000_000_000n),
});

export interface ExternalAuthConfig {
  name: string;
  issuer: string;
  audience: string;
  jwksUrl: string;
}

export interface Config {
  production: boolean;
  databaseUrl: string;
  redisUrl: string | null;
  deployment: Deployment;
  rpcUrl: string | null;
  webOrigin: string;
  port: number;
  host: string;
  metricsHost: string;
  metricsPort: number;
  surveySecret: string;
  turnstileSecret: string | null;
  trustCloudflare: boolean;
  adminWallets: Address[];
  externalAuth: ExternalAuthConfig | null;
  faucet: FaucetConfig | null;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  // An empty value (a blank line left from .env.example) means the variable is not set.
  const e = envSchema.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  const production = e.NODE_ENV === 'production';
  if (production && e.TURNSTILE_SECRET === undefined) {
    throw new Error('TURNSTILE_SECRET is required in production');
  }
  if (production && e.REDIS_URL === undefined) {
    throw new Error('REDIS_URL is required in production (rate limits shared across processes)');
  }
  const ext = [
    e.EXTERNAL_AUTH_NAME,
    e.EXTERNAL_AUTH_ISSUER,
    e.EXTERNAL_AUTH_AUDIENCE,
    e.EXTERNAL_AUTH_JWKS_URL,
  ];
  const deployment = loadDeployment(e.DEPLOYMENT_FILE);
  if (e.FAUCET_KEY_FILE !== undefined && deployment.chainId === MAINNET_CHAIN_ID) {
    throw new Error(
      'FAUCET_KEY_FILE is set but the deployment is mainnet: the faucet is testnet only',
    );
  }
  if (e.FAUCET_KEY_FILE !== undefined && e.RPC_URL === undefined) {
    throw new Error('the faucet needs RPC_URL');
  }
  if (ext.some((v) => v !== undefined) && ext.some((v) => v === undefined)) {
    throw new Error('set all EXTERNAL_AUTH_* variables or none');
  }
  return {
    production,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL ?? null,
    deployment,
    rpcUrl: e.RPC_URL ?? null,
    webOrigin: new URL(e.WEB_ORIGIN).origin,
    port: e.PORT,
    host: e.HOST,
    metricsHost: e.METRICS_HOST,
    metricsPort: e.METRICS_PORT,
    surveySecret: e.SURVEY_SECRET,
    turnstileSecret: e.TURNSTILE_SECRET ?? null,
    trustCloudflare: e.TRUST_CLOUDFLARE,
    adminWallets: e.ADMIN_WALLETS,
    externalAuth:
      e.EXTERNAL_AUTH_NAME === undefined
        ? null
        : {
            name: e.EXTERNAL_AUTH_NAME,
            issuer: e.EXTERNAL_AUTH_ISSUER ?? '',
            audience: e.EXTERNAL_AUTH_AUDIENCE ?? '',
            jwksUrl: e.EXTERNAL_AUTH_JWKS_URL ?? '',
          },
    faucet:
      e.FAUCET_KEY_FILE === undefined
        ? null
        : {
            keyFile: e.FAUCET_KEY_FILE,
            amountWei: e.FAUCET_AMOUNT_WEI,
            dailyBudgetWei: e.FAUCET_DAILY_BUDGET_WEI,
            maxRecipientBalanceWei: e.FAUCET_MAX_RECIPIENT_WEI,
          },
  };
}
