#!/usr/bin/env node
/** API process: migrate the API tables, then serve on HOST:PORT (behind Cloudflare in production). */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { migrate, openDatabase } from '@mohonaut/indexer';
import { createPublicClient, http } from 'viem';
import { createApp } from './app.js';
import { externalAuthVerifier } from './auth/external.js';
import { signatureVerifier } from './auth/siwe.js';
import { loadConfig } from './config.js';
import { ApiMetrics } from './metrics.js';
import { turnstileVerifier } from './security.js';
import { MemoryStore, RedisStore } from './store.js';

const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url));

async function main(): Promise<void> {
  const cfg = loadConfig(process.env);
  const database = await openDatabase(cfg.databaseUrl);
  await migrate(database, MIGRATIONS);
  const store = cfg.redisUrl === null ? new MemoryStore() : new RedisStore(cfg.redisUrl);
  const metrics = new ApiMetrics();
  const metricsServer = createServer((req, res) => {
    if (req.url !== '/metrics') {
      res.writeHead(404);
      res.end();
      return;
    }
    metrics.registry
      .metrics()
      .then((body) => {
        res.writeHead(200, { 'content-type': metrics.registry.contentType });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
  });
  metricsServer.listen(cfg.metricsPort, cfg.metricsHost);
  const chain = cfg.rpcUrl === null ? null : createPublicClient({ transport: http(cfg.rpcUrl) });
  const app = createApp({
    cfg,
    database,
    store,
    signatures: signatureVerifier(chain),
    chain,
    externalAuth: cfg.externalAuth === null ? null : externalAuthVerifier(cfg.externalAuth),
    turnstile: cfg.turnstileSecret === null ? null : turnstileVerifier(cfg.turnstileSecret),
    now: Date.now,
    metrics,
  });
  const server = serve({ fetch: app.fetch, port: cfg.port, hostname: cfg.host });
  console.log(
    JSON.stringify({ level: 'info', msg: 'api listening', host: cfg.host, port: cfg.port }),
  );
  const stop = () => {
    server.close();
    metricsServer.close();
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
