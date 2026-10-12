#!/usr/bin/env node
/** API process: migrate the API tables, then serve on HOST:PORT (behind Cloudflare in production). */
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { migrate, openDatabase } from '@mohonaut/indexer';
import { createPublicClient, http } from 'viem';
import { createApp } from './app.js';
import { externalAuthVerifier } from './auth/external.js';
import { signatureVerifier } from './auth/siwe.js';
import { loadConfig } from './config.js';
import { turnstileVerifier } from './security.js';
import { MemoryStore, RedisStore } from './store.js';

const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url));

async function main(): Promise<void> {
  const cfg = loadConfig(process.env);
  const database = await openDatabase(cfg.databaseUrl);
  await migrate(database, MIGRATIONS);
  const store = cfg.redisUrl === null ? new MemoryStore() : new RedisStore(cfg.redisUrl);
  const app = createApp({
    cfg,
    database,
    store,
    signatures: signatureVerifier(
      cfg.rpcUrl === null ? null : createPublicClient({ transport: http(cfg.rpcUrl) }),
    ),
    externalAuth: cfg.externalAuth === null ? null : externalAuthVerifier(cfg.externalAuth),
    turnstile: cfg.turnstileSecret === null ? null : turnstileVerifier(cfg.turnstileSecret),
    now: Date.now,
  });
  const server = serve({ fetch: app.fetch, port: cfg.port, hostname: cfg.host });
  console.log(
    JSON.stringify({ level: 'info', msg: 'api listening', host: cfg.host, port: cfg.port }),
  );
  const stop = () => {
    server.close();
    void store.close().then(() => database.close());
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err: unknown) => {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'fatal',
      error: err instanceof Error ? err.stack : String(err),
    }),
  );
  process.exit(1);
});
