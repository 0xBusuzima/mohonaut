import type { Database, Deployment } from '@mohonaut/indexer';
import type { Address } from 'viem';
import type { Clients } from './chain.js';
import type { Config } from './config.js';
import { JOBS, revertName } from './jobs.js';
import type { JobLock } from './lock.js';
import type { Metrics } from './metrics.js';

/** First line of an error, for the tick report. */
function errorText(err: unknown): string {
  const reverted = revertName(err);
  if (reverted !== null) return `error: reverted with ${reverted}`;
  return `error: ${err instanceof Error ? (err.message.split('\n')[0] ?? '') : String(err)}`;
}

export interface TickReport {
  /** False when another keeper holds the lock (this one stands by). */
  active: boolean;
  outcomes: Record<string, string>;
}

/**
 * Runs the enabled jobs in order once per tick. Jobs are idempotent: each reads the chain
 * first and only acts when needed, so a tick can be repeated or retried safely.
 */
export class Keeper {
  constructor(
    private readonly cfg: Config,
    private readonly deployment: Deployment,
    private readonly clients: Clients,
    private readonly database: Database,
    private readonly lock: JobLock,
    private readonly metrics: Metrics,
    private readonly poolManager: Address,
    /** Runs before the jobs while holding the lock (e.g. an in-process indexer sync). */
    private readonly beforeJobs?: () => Promise<void>,
  ) {}

  async tick(): Promise<TickReport> {
    const active = await this.lock.acquire();
    this.metrics.lockHeld.set(active ? 1 : 0);
    if (!active) return { active, outcomes: {} };
    const read = this.clients.publicClient;
    this.metrics.balance.set(Number(await read.getBalance({ address: this.clients.address })));
    const outcomes: Record<string, string> = {};
    if (this.beforeJobs !== undefined) {
      try {
        await this.beforeJobs();
      } catch (err) {
        this.metrics.errors.inc({ task: 'indexer' });
        outcomes['indexer'] = errorText(err);
      }
    }
    for (const name of this.cfg.jobs) {
      try {
        const now = (await read.getBlock({ blockTag: 'latest' })).timestamp;
        const outcome = await JOBS[name]({
          cfg: this.cfg,
          deployment: this.deployment,
          clients: this.clients,
          database: this.database,
          metrics: this.metrics,
          poolManager: this.poolManager,
          now,
        });
        // In a dry run the transactions were only simulated.
        outcomes[name] = this.clients.walletClient === null ? `dry run: ${outcome}` : outcome;
        this.metrics.jobs.inc({
          task: name,
          outcome: outcome.split(':')[0]?.replace(/\d+/g, 'n') ?? '',
        });
        this.metrics.lastSuccess.set({ task: name }, Date.now() / 1000);
      } catch (err) {
        this.metrics.errors.inc({ task: name });
        outcomes[name] = errorText(err);
      }
    }
    return { active, outcomes };
  }
}
