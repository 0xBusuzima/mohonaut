#!/usr/bin/env node
/**
 * Indexer process.
 *   node dist/main.js           migrate, then poll forever (metrics on METRICS_HOST:METRICS_PORT)
 *   node dist/main.js sync      migrate, index up to the current head, then exit (backfills)
 *   node dist/main.js rebuild   migrate, then rebuild the derived tables from the raw events
 */
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadConfig } from './config.js';
import { contractSet } from './contracts.js';
import { migrate, openDatabase } from './db/client.js';
import { Indexer, rebuildProjections } from './indexer.js';
import { Notifier, telegramTransport, webhookTransport } from './alerts/notify.js';
import type { AlertTransport } from './alerts/notify.js';
import { Metrics } from './metrics.js';
import { RpcSource } from './source.js';

function log(level: 'info' | 'error', msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

class ChainMismatch extends Error {}

/**
 * The chain id check and the pool manager address, retried while the RPC is unreachable (an
 * outage at boot must not stop the database migrations or the API that waits for them). A
 * wrong chain is a configuration error and stays fatal. One-shot commands do not retry.
 */
async function connect(
  source: RpcSource,
  expectedChainId: number,
  liquidityManager: Parameters<RpcSource['poolManager']>[0],
  keepTrying: (() => boolean) | null,
): Promise<{ chainId: number; poolManager: Awaited<ReturnType<RpcSource['poolManager']>> }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const chainId = await source.chainId();
      if (chainId !== expectedChainId) {
        throw new ChainMismatch(
          `RPC chain ${chainId} does not match deployment chain ${expectedChainId}`,
        );
      }
      return { chainId, poolManager: await source.poolManager(liquidityManager) };
    } catch (err) {
      if (err instanceof ChainMismatch || keepTrying === null || !keepTrying()) throw err;
      log('error', 'RPC unavailable, retrying', {
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      await sleep(Math.min(60_000, 2_000 * attempt));
    }
  }
}

async function main(): Promise<void> {
  // Local runs read this service's .env (README); deployments pass the environment, which wins.
  if (existsSync('.env')) process.loadEnvFile('.env');
  const cfg = loadConfig(process.env);
  const metrics = new Metrics();
  const source = new RpcSource(cfg.rpcUrl, metrics);
  const mode = process.argv[2];
  const database = await openDatabase(cfg.databaseUrl);
  const applied = await migrate(database);
  if (applied.length > 0) log('info', 'migrations applied', { applied });

  // The long-running indexer serves metrics from here on, before the chain is reachable:
  // /healthz stays 503 until the first successful poll.
  let lastSuccess = 0;
  let stopping = false;
  const server = mode === undefined ? serve(cfg, metrics, () => lastSuccess) : null;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  const { chainId, poolManager } = await connect(
    source,
    cfg.deployment.chainId,
    cfg.deployment.LiquidityManager,
    mode === undefined ? () => !stopping : null,
  );
  const contracts = contractSet(
    cfg.deployment,
    poolManager,
    cfg.poolPollEvery,
    cfg.alerts.largeTransferWei,
  );
  const transports: AlertTransport[] = [];
  if (cfg.alerts.telegram !== null) {
    transports.push(telegramTransport(cfg.alerts.telegram.token, cfg.alerts.telegram.chatId));
  }
  if (cfg.alerts.webhookUrl !== null) transports.push(webhookTransport(cfg.alerts.webhookUrl));
  const notifier =
    transports.length === 0
      ? null
      : new Notifier(database, transports, {
          chainId: cfg.deployment.chainId,
          minSeverity: cfg.alerts.minSeverity,
          maxAgeSeconds: cfg.alerts.maxAgeSeconds,
          now: Date.now,
        });

  if (mode === 'rebuild') {
    const count = await rebuildProjections(database, contracts);
    log('info', 'projections rebuilt', { events: count });
    await database.close();
    return;
  }

  const indexer = new Indexer(
    database,
    source,
    { contracts, confirmations: cfg.confirmations, maxBlockRange: cfg.maxBlockRange },
    metrics,
  );

  if (mode === 'sync') {
    while (!(await indexer.step())) {
      // keep going until every stream reached the head
    }
    log('info', 'synced', { head: (await indexer.cursor('core')).toString() });
    await database.close();
    return;
  }
  log('info', 'indexer started', { chainId, poolManager, startBlock: cfg.deployment.startBlock });

  while (!stopping) {
    let caughtUp = false;
    try {
      caughtUp = await indexer.step();
      lastSuccess = Date.now();
      if (notifier !== null) {
        const report = await notifier.deliver();
        metrics.alertsSent.inc(report.sent);
        metrics.alertFailures.inc(report.failed);
        metrics.alertsPending.set(report.pending);
      }
    } catch (err) {
      metrics.errors.inc();
      log('error', 'poll failed', { error: err instanceof Error ? err.message : String(err) });
    }
    if (caughtUp) await sleep(cfg.pollIntervalMs);
  }
  server?.close();
  await database.close();
  log('info', 'indexer stopped');
}

function serve(cfg: ReturnType<typeof loadConfig>, metrics: Metrics, lastSuccess: () => number) {
  const server = createServer((req, res) => {
    if (req.url === '/metrics') {
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
      return;
    }
    if (req.url === '/healthz') {
      const healthy = Date.now() - lastSuccess() < cfg.pollIntervalMs * 6;
      res.writeHead(healthy ? 200 : 503);
      res.end(healthy ? 'ok' : 'stale');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(cfg.metricsPort, cfg.metricsHost);
  return server;
}

main().catch((err: unknown) => {
  log('error', 'fatal', { error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
  process.exit(1);
});
