#!/usr/bin/env node
/**
 * Keeper process (docs/03 §4.5).
 *   node dist/main.js        run the jobs every TICK_INTERVAL_MS (metrics on METRICS_PORT)
 *   node dist/main.js once   one tick, print the outcomes, exit
 */
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { liquidityManagerAbi } from '@mohonaut/sdk';
import { Indexer, RpcSource, contractSet, migrate, openDatabase } from '@mohonaut/indexer';
import { makeClients } from './chain.js';
import { loadConfig } from './config.js';
import { Keeper } from './keeper.js';
import { resolveKey } from './keystore.js';
import { jobLock } from './lock.js';
import { Metrics } from './metrics.js';

function log(level: 'info' | 'error', msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

async function main(): Promise<void> {
  // Local runs read this service's .env (README); deployments pass the environment, which wins.
  if (existsSync('.env')) process.loadEnvFile('.env');
  const cfg = loadConfig(process.env);
  const { deployment } = cfg;
  const clients = makeClients(cfg.rpcUrl, deployment.chainId, await resolveKey(cfg.key));
  const chainId = await clients.publicClient.getChainId();
  if (chainId !== deployment.chainId) {
    throw new Error(`RPC chain ${chainId} does not match deployment chain ${deployment.chainId}`);
  }
  if (deployment.Keeper !== undefined && deployment.Keeper !== clients.address) {
    throw new Error(`KEEPER_PRIVATE_KEY is not the deployment's keeper ${deployment.Keeper}`);
  }
  // The keeper reads the indexer's tables; the indexer creates and migrates them.
  const database = await openDatabase(cfg.databaseUrl);
  const poolManager = await clients.publicClient.readContract({
    address: deployment.LiquidityManager,
    abi: liquidityManagerAbi,
    functionName: 'poolManager',
  });
  const metrics = new Metrics();
  const lock = jobLock(cfg.databaseUrl);
  let beforeJobs: (() => Promise<void>) | undefined;
  if (cfg.runIndexer) {
    await migrate(database);
    const indexer = new Indexer(database, new RpcSource(cfg.rpcUrl), {
      contracts: contractSet(deployment, poolManager, 6),
      confirmations: 20n,
      maxBlockRange: 50_000n,
    });
    beforeJobs = async () => {
      for (let i = 0; i < 100 && !(await indexer.step()); i++) {
        // catch up (bounded per tick)
      }
    };
  }
  const keeper = new Keeper(
    cfg,
    deployment,
    clients,
    database,
    lock,
    metrics,
    poolManager,
    beforeJobs,
  );

  if (process.argv[2] === 'once') {
    log('info', 'tick', { ...(await keeper.tick()) });
    await lock.release();
    await database.close();
    return;
  }

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
    res.writeHead(404);
    res.end();
  });
  server.listen(cfg.metricsPort, cfg.metricsHost);

  // Ctrl-C (or SIGTERM) stops at once: it says so, cuts the wait between ticks short, and lets
  // the current tick finish; a second Ctrl-C exits without waiting.
  let stopping = false;
  let wake: () => void = () => {};
  const stop = () => {
    if (stopping) process.exit(130);
    stopping = true;
    log('info', 'stopping', { hint: 'press Ctrl-C again to exit now' });
    wake();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  log('info', 'keeper started', {
    keeper: clients.address,
    jobs: cfg.jobs,
    dryRun: clients.walletClient === null,
  });
  while (!stopping) {
    // A tick that fails outright (the RPC or the database gone for a moment) is logged and the
    // next one tries again: the keeper must outlive an outage, not end on it.
    try {
      const report = await keeper.tick();
      log('info', 'tick', { ...report });
    } catch (err) {
      metrics.errors.inc({ task: 'tick' });
      log('error', 'tick failed', { error: err instanceof Error ? err.message : String(err) });
    }
    if (stopping) break;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, cfg.tickIntervalMs);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
  log('info', 'stopped');
  server.close();
  await lock.release();
  await database.close();
}

main().catch((err: unknown) => {
  log('error', 'fatal', { error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
  process.exit(1);
});
