import { Counter, Gauge, Registry } from 'prom-client';

export class Metrics {
  readonly registry = new Registry();

  readonly balance = new Gauge({
    name: 'keeper_balance_wei',
    help: 'ETH balance of the keeper account (alert when low)',
    registers: [this.registry],
  });

  readonly jobs = new Counter({
    name: 'keeper_jobs_total',
    help: 'Job runs by outcome',
    labelNames: ['job', 'outcome'],
    registers: [this.registry],
  });

  readonly txs = new Counter({
    name: 'keeper_tx_total',
    help: 'Transactions sent by job and receipt status',
    labelNames: ['job', 'status'],
    registers: [this.registry],
  });

  readonly errors = new Counter({
    name: 'keeper_errors_total',
    help: 'Job failures',
    labelNames: ['job'],
    registers: [this.registry],
  });

  readonly guardTrips = new Counter({
    name: 'keeper_guard_trips_total',
    help: 'Buybacks or additions skipped because the pool price was far from the reference',
    labelNames: ['job'],
    registers: [this.registry],
  });

  readonly lastSuccess = new Gauge({
    name: 'keeper_last_success_timestamp_seconds',
    help: 'Unix time of the last successful run by job',
    labelNames: ['job'],
    registers: [this.registry],
  });

  readonly lockHeld = new Gauge({
    name: 'keeper_lock_held',
    help: '1 when this instance holds the job lock (others stand by)',
    registers: [this.registry],
  });
}
