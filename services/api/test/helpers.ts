import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { migrate, openDatabase, schema as idx } from '@mohonaut/indexer';
import type { Database, Deployment } from '@mohonaut/indexer';
import { getAddress } from 'viem';
import type { Address } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { PrivateKeyAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { createApp } from '../src/app.js';
import { signatureVerifier } from '../src/auth/siwe.js';
import type { Config } from '../src/config.js';
import type { AppDeps, TurnstileVerifier } from '../src/context.js';
import { ApiMetrics } from '../src/metrics.js';
import { MemoryStore } from '../src/store.js';

export const ORIGIN = 'https://play.mohonaut.test';
export const T0 = Date.UTC(2026, 10, 20, 12, 0, 0); // a fixed clock (ms)

const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url));

const deployment: Deployment = {
  chainId: 46630,
  genesisTime: 1_799_971_200,
  startBlock: 1,
  MohnToken: getAddress('0x1000000000000000000000000000000000000001'),
  MiningCore: getAddress('0x1000000000000000000000000000000000000002'),
  RevenueRouter: getAddress('0x1000000000000000000000000000000000000003'),
  BuybackBurner: getAddress('0x1000000000000000000000000000000000000004'),
  LiquidityManager: getAddress('0x1000000000000000000000000000000000002000'),
  ParamsTimelock: getAddress('0x1000000000000000000000000000000000000006'),
  UpgradeTimelock: getAddress('0x1000000000000000000000000000000000000007'),
};

export interface Harness {
  app: ReturnType<typeof createApp>;
  deps: AppDeps;
  database: Database;
  clock: { now: number };
  turnstileOk: { value: boolean };
}

export async function harness(overrides: Partial<Config> = {}): Promise<Harness> {
  const database = await openDatabase('memory://');
  await migrate(database);
  await migrate(database, MIGRATIONS);
  const clock = { now: T0 };
  const turnstileOk = { value: true };
  const turnstile: TurnstileVerifier = {
    verify: async (token) => turnstileOk.value && token === 'ok',
  };
  const cfg: Config = {
    production: false,
    databaseUrl: 'memory://',
    redisUrl: null,
    deployment,
    rpcUrl: null,
    webOrigin: ORIGIN,
    port: 0,
    host: '127.0.0.1',
    metricsHost: '127.0.0.1',
    metricsPort: 0,
    surveySecret: randomBytes(32).toString('hex'),
    turnstileSecret: 'x',
    trustCloudflare: false,
    adminWallets: [],
    externalAuth: null,
    faucet: null,
    ...overrides,
  };
  const deps: AppDeps = {
    cfg,
    database,
    store: new MemoryStore(() => clock.now),
    signatures: signatureVerifier(null),
    externalAuth: null,
    turnstile,
    now: () => clock.now,
    metrics: new ApiMetrics(),
  };
  return { app: createApp(deps), deps, database, clock, turnstileOk };
}

export interface Req {
  cookie?: string | undefined;
  body?: unknown;
  headers?: Record<string, string>;
  ip?: string;
}

export async function call(h: Harness, method: string, path: string, r: Req = {}) {
  const headers: Record<string, string> = {
    origin: ORIGIN,
    'x-test-ip': r.ip ?? '203.0.113.7',
    'cf-turnstile-response': 'ok',
    ...(r.body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(r.cookie === undefined ? {} : { cookie: r.cookie }),
    ...r.headers,
  };
  const res = await h.app.request(path, {
    method,
    headers,
    ...(r.body === undefined ? {} : { body: JSON.stringify(r.body) }),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, json: json as Record<string, unknown> & { error?: string }, res };
}

export function newWallet(): PrivateKeyAccount {
  return privateKeyToAccount(generatePrivateKey());
}

export function siweMessage(
  account: Address,
  nonce: string,
  over: Partial<Parameters<typeof createSiweMessage>[0]> = {},
): string {
  return createSiweMessage({
    address: account,
    chainId: deployment.chainId,
    domain: new URL(ORIGIN).host,
    nonce,
    uri: ORIGIN,
    version: '1',
    issuedAt: new Date(T0 - 1000),
    expirationTime: new Date(T0 + 600_000),
    ...over,
  });
}

/** Signs in with a real EIP-4361 signature; returns the session cookie. */
export async function signIn(h: Harness, wallet: PrivateKeyAccount, ip?: string): Promise<string> {
  const { json } = await call(h, 'GET', '/auth/nonce', ip === undefined ? {} : { ip });
  const message = siweMessage(wallet.address, String(json['nonce']));
  const signature = await wallet.signMessage({ message });
  const res = await call(h, 'POST', '/auth/siwe', {
    body: { message, signature },
    ...(ip === undefined ? {} : { ip }),
  });
  if (res.status !== 200)
    throw new Error(`sign-in failed: ${res.status} ${JSON.stringify(res.json)}`);
  const cookie = res.res.headers.get('set-cookie') ?? '';
  return cookie.split(';')[0] ?? '';
}

const E18 = 10n ** 18n;

/** Indexer rows for a registered player. */
export async function seedAccount(
  database: Database,
  address: Address,
  p: {
    accrued?: bigint;
    fuelEth?: bigint;
    rigsBought?: bigint;
    dp?: bigint;
    expiryHour?: bigint;
    siteLevel?: number;
  },
): Promise<void> {
  await database.db.insert(idx.accounts).values({
    address,
    registeredAt: BigInt(Math.floor(T0 / 1000) - 86_400),
    registeredBlock: 1n,
    siteLevel: p.siteLevel ?? 1,
    dp: p.dp ?? 10n,
    expiryHour: p.expiryHour ?? BigInt(Math.floor(T0 / 3_600_000) + 100),
    fuelEth: p.fuelEth ?? 0n,
    rigsBought: p.rigsBought ?? 0n,
    accrued: p.accrued ?? 0n,
  });
}

export const mohn = (n: number | bigint) => BigInt(n) * E18;
