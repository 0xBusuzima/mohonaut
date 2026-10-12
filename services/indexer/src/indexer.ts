import { asc, eq } from 'drizzle-orm';
import type { Hex } from 'viem';
import { decodeLog, toJson } from './contracts.js';
import type { ContractSet, IndexedEvent, Stream } from './contracts.js';
import type { Database } from './db/client.js';
import { cursors, events, projectionTables } from './db/schema.js';
import type { Metrics } from './metrics.js';
import { Ctx, loadState, saveState } from './projections/context.js';
import { project } from './projections/core.js';
import { recomputeDay } from './projections/daily.js';
import type { LogSource, RawLog } from './source.js';

export interface IndexerOptions {
  contracts: ContractSet;
  /** Blocks behind the head that are indexed. */
  confirmations: bigint;
  /** Largest getLogs block range; halved on provider errors, regrown after successes. */
  maxBlockRange: bigint;
}

const REGROW_AFTER = 10;

/**
 * Polls getLogs over block ranges (docs/03 §4.3, ADR-010). Each batch is one transaction:
 * raw events (idempotent upsert by block and log index), projections of the newly inserted
 * events, and the stream cursor.
 */
export class Indexer {
  private tick = 0;
  private range: bigint;
  private successes = 0;

  constructor(
    private readonly database: Database,
    private readonly source: LogSource,
    private readonly opts: IndexerOptions,
    private readonly metrics?: Metrics,
  ) {
    this.range = opts.maxBlockRange;
  }

  /** Streams that were not at the head after their last batch (polled on every tick). */
  private readonly behind = new Set<Stream['name']>(['core', 'pool']);

  /**
   * One poll: at most one batch per stream. A stream at the head is polled only on every
   * n-th tick (`every`); a stream that is behind is polled on every tick. Returns true when
   * every stream is at the head.
   */
  async step(): Promise<boolean> {
    const head = (await this.source.head()) - this.opts.confirmations;
    this.metrics?.headBlock.set(Number(head));
    for (const stream of this.opts.contracts.streams) {
      if (this.tick % stream.every !== 0 && !this.behind.has(stream.name)) continue;
      if (await this.syncStream(stream, head)) this.behind.delete(stream.name);
      else this.behind.add(stream.name);
    }
    const caughtUp = this.behind.size === 0;
    this.tick += 1;
    this.metrics?.lastSuccess.set(Date.now() / 1000);
    return caughtUp;
  }

  async cursor(stream: Stream['name']): Promise<bigint> {
    const rows = await this.database.db.select().from(cursors).where(eq(cursors.stream, stream));
    return rows[0]?.block ?? BigInt(this.opts.contracts.deployment.startBlock) - 1n;
  }

  private async syncStream(stream: Stream, head: bigint): Promise<boolean> {
    const from = (await this.cursor(stream.name)) + 1n;
    if (from > head) return true;
    const { logs, to } = await this.fetch(stream, from, head);
    const times = await this.blockTimes(logs);
    await this.database.db.transaction(async (tx) => {
      const ctx = new Ctx(tx, await loadState(tx), this.opts.contracts);
      for (const log of logs) {
        const ev = decodeLog(log, blockTimeOf(times, log), this.opts.contracts.byAddress);
        if (ev === null) continue;
        const inserted = await tx
          .insert(events)
          .values(eventRow(ev))
          .onConflictDoNothing()
          .returning({ block: events.blockNumber });
        if (inserted.length === 0) continue; // already indexed: projections applied then
        await project(ctx, ev);
        this.metrics?.events.inc({ contract: ev.contract, event: ev.event });
      }
      await finish(ctx);
      await tx
        .insert(cursors)
        .values({ stream: stream.name, block: to })
        .onConflictDoUpdate({ target: cursors.stream, set: { block: to } });
    });
    this.metrics?.indexedBlock.set({ stream: stream.name }, Number(to));
    return to === head;
  }

  private async fetch(
    stream: Stream,
    from: bigint,
    head: bigint,
  ): Promise<{ logs: RawLog[]; to: bigint }> {
    for (;;) {
      const to = from + this.range - 1n < head ? from + this.range - 1n : head;
      try {
        const logs = await this.source.logs(stream.filter, from, to);
        this.successes += 1;
        if (this.successes >= REGROW_AFTER && this.range < this.opts.maxBlockRange) {
          this.range =
            this.range * 2n < this.opts.maxBlockRange ? this.range * 2n : this.opts.maxBlockRange;
          this.successes = 0;
        }
        logs.sort((a, b) =>
          a.blockNumber === b.blockNumber
            ? a.logIndex - b.logIndex
            : a.blockNumber < b.blockNumber
              ? -1
              : 1,
        );
        return { logs, to };
      } catch (err) {
        // Providers reject large ranges or responses; retry with a smaller window.
        if (to === from) throw err;
        this.range = this.range / 2n > 0n ? this.range / 2n : 1n;
        this.successes = 0;
      }
    }
  }

  private async blockTimes(logs: RawLog[]): Promise<Map<bigint, bigint>> {
    const times = new Map<bigint, bigint>();
    for (const log of logs) {
      if (times.has(log.blockNumber)) continue;
      times.set(log.blockNumber, log.blockTime ?? (await this.source.blockTime(log.blockNumber)));
    }
    return times;
  }
}

function blockTimeOf(times: Map<bigint, bigint>, log: RawLog): bigint {
  const time = times.get(log.blockNumber);
  if (time === undefined || time === 0n)
    throw new Error(`no block time for block ${log.blockNumber}`);
  return time;
}

function eventRow(ev: IndexedEvent): typeof events.$inferInsert {
  return {
    blockNumber: ev.blockNumber,
    logIndex: ev.logIndex,
    txHash: ev.txHash,
    blockTime: ev.blockTime,
    address: ev.address,
    contract: ev.contract,
    event: ev.event,
    topics: ev.topics,
    data: ev.data,
    args: toJson(ev.args) as Record<string, unknown>,
  };
}

async function finish(ctx: Ctx): Promise<void> {
  for (const day of [...ctx.dirtyDays].sort((a, b) => a - b)) await recomputeDay(ctx, day);
  await saveState(ctx.tx, ctx.state);
}

const REBUILD_PAGE = 5000;

/**
 * Rebuilds every derived table from the stored raw events (no RPC): use after changing a
 * projection. Events are re-decoded from their topics and data with the current ABIs.
 */
export async function rebuildProjections(
  database: Database,
  contracts: ContractSet,
): Promise<number> {
  let count = 0;
  await database.db.transaction(async (tx) => {
    for (const table of projectionTables) await tx.delete(table);
    const ctx = new Ctx(tx, await loadState(tx), contracts);
    for (let offset = 0; ; offset += REBUILD_PAGE) {
      const page = await tx
        .select()
        .from(events)
        .orderBy(asc(events.blockNumber), asc(events.logIndex))
        .limit(REBUILD_PAGE)
        .offset(offset);
      for (const row of page) {
        const ev = decodeLog(
          {
            blockNumber: row.blockNumber,
            logIndex: row.logIndex,
            txHash: row.txHash as Hex,
            address: row.address as Hex,
            topics: row.topics as Hex[],
            data: row.data as Hex,
            blockTime: row.blockTime,
          },
          row.blockTime,
          contracts.byAddress,
        );
        if (ev === null) continue;
        await project(ctx, ev);
        count += 1;
      }
      if (page.length < REBUILD_PAGE) break;
    }
    await finish(ctx);
  });
  return count;
}
