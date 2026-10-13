import { Counter, Gauge, Registry } from 'prom-client';

/**
 * Compute units per JSON-RPC method in Alchemy's pricing table (free tier: 30M CU per month).
 * The estimate is what the indexer would cost on that provider; check the table before
 * relying on it. Unknown methods count 26 (eth_call).
 */
const COMPUTE_UNITS: Readonly<Record<string, number>> = {
  eth_chainId: 0,
  eth_blockNumber: 10,
  eth_getLogs: 75,
  eth_getBlockByNumber: 16,
  eth_call: 26,
};

export class Metrics {
  readonly registry = new Registry();

  readonly rpcRequests = new Counter({
    name: 'indexer_rpc_requests_total',
    help: 'JSON-RPC requests by method',
    labelNames: ['method'],
    registers: [this.registry],
  });

  readonly rpcComputeUnits = new Counter({
    name: 'indexer_rpc_compute_units_total',
    help: 'Estimated RPC compute units (Alchemy table; free tier 30M per month)',
    registers: [this.registry],
  });

  readonly indexedBlock = new Gauge({
    name: 'indexer_block',
    help: 'Last indexed block by stream',
    labelNames: ['stream'],
    registers: [this.registry],
  });

  readonly headBlock = new Gauge({
    name: 'indexer_head_block',
    help: 'Chain head minus confirmations at the last poll',
    registers: [this.registry],
  });

  readonly events = new Counter({
    name: 'indexer_events_total',
    help: 'Indexed events by contract and name',
    labelNames: ['contract', 'event'],
    registers: [this.registry],
  });

  readonly errors = new Counter({
    name: 'indexer_errors_total',
    help: 'Failed polls',
    registers: [this.registry],
  });

  readonly alertsPending = new Gauge({
    name: 'indexer_alerts_pending',
    help: 'On-chain alerts not yet delivered',
    registers: [this.registry],
  });

  readonly alertsSent = new Counter({
    name: 'indexer_alerts_sent_total',
    help: 'On-chain alerts delivered',
    registers: [this.registry],
  });

  readonly alertFailures = new Counter({
    name: 'indexer_alert_failures_total',
    help: 'Failed alert deliveries (retried)',
    registers: [this.registry],
  });

  readonly lastSuccess = new Gauge({
    name: 'indexer_last_success_timestamp_seconds',
    help: 'Unix time of the last successful poll',
    registers: [this.registry],
  });

  rpcRequest(method: string): void {
    this.rpcRequests.inc({ method });
    this.rpcComputeUnits.inc(COMPUTE_UNITS[method] ?? 26);
  }
}
