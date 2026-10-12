import type { Database } from '@mohonaut/indexer';
import type { Address, PublicClient } from 'viem';
import type { ExternalAuthVerifier } from './auth/external.js';
import type { SignatureVerifier } from './auth/siwe.js';
import type { Config } from './config.js';
import type { FaucetSender } from './faucet.js';
import type { Role } from './db/schema.js';
import type { ApiMetrics } from './metrics.js';
import type { KeyValueStore } from './store.js';

export interface TurnstileVerifier {
  /** True when the token is valid for this client IP. */
  verify(token: string, ip: string): Promise<boolean>;
}

/** Everything the routes need; tests pass in-memory or fake implementations. */
export interface AppDeps {
  cfg: Config;
  database: Database;
  store: KeyValueStore;
  signatures: SignatureVerifier;
  externalAuth: ExternalAuthVerifier | null;
  /** Null disables the check (development and tests only; required in production). */
  turnstile: TurnstileVerifier | null;
  /** Unix milliseconds (injectable for tests). */
  now(): number;
  metrics?: ApiMetrics;
  /** Chain reads for the operator health view (RPC_URL); null without one. */
  chain?: Pick<PublicClient, 'getBlockNumber' | 'getBalance'> | null;
  /** Testnet faucet wallet (null: off). */
  faucet?: FaucetSender | null;
}

export interface SessionUser {
  id: number;
  wallet: Address | null;
  roles: Role[];
}

export interface AppEnv {
  Variables: {
    deps: AppDeps;
    user: SessionUser | null;
    ip: string;
  };
}
