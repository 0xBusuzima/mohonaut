#!/usr/bin/env node
/**
 * Indexer process.
 *   node dist/main.js           migrate, then poll forever (metrics on METRICS_HOST:METRICS_PORT)
 *   node dist/main.js sync      migrate, index up to the current head, then exit (backfills)
 *   node dist/main.js rebuild   migrate, then rebuild the derived tables from the raw events
 */
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

async function main(): Promise<void> {
  const cfg = loadConfig(process.env);
  const metrics = new Metrics();
  const source = new RpcSource(cfg.rpcUrl, metrics);
  const chainId = await source.chainId();
  if (chainId !== cfg.deployment.chainId) {
    throw new Error(
      `RPC chain ${chainId} does not match deployment chain ${cfg.deployment.chainId}`,
    );
  }
  const database = await openDatabase(cfg.databaseUrl);
  const applied = await migrate(database);
  if (applied.length > 0) log('info', 'migrations applied', { applied });
  const poolManager = await source.poolManager(cfg.deployment.LiquidityManager);
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

  if (process.argv[2] === 'rebuild') {
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

  if (process.argv[2] === 'sync') {
    while (!(await indexer.step())) {
      // keep going until every stream reached the head
    }
    log('info', 'synced', { head: (await indexer.cursor('core')).toString() });
    await database.close();
    return;
  }
  let lastSuccess = Date.now();
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
      const healthy = Date.now() - lastSuccess < cfg.pollIntervalMs * 6;
      res.writeHead(healthy ? 200 : 503);
      res.end(healthy ? 'ok' : 'stale');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(cfg.metricsPort, cfg.metricsHost);

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
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
  server.close();
  await database.close();
  log('info', 'indexer stopped');
}

main().catch((err: unknown) => {
  log('error', 'fatal', { error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
  process.exit(1);
});
