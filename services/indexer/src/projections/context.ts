import { getTableColumns, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { CAP } from '@mohonaut/sdk';
import type { ContractSet } from '../contracts.js';
import type { Db } from '../db/client.js';
import { accountDays, accounts, hours, state } from '../db/schema.js';

const HOUR = 3600n;
const DAY = 86_400n;

const hourOf = (time: bigint): bigint => time / HOUR;
export const dayOf = (time: bigint): number => Number(time / DAY);
export const dayOfHour = (hour: bigint): number => Number(hour / 24n);

/** Projection state carried between batches, persisted in the `state` table. */
export interface ProjectionState {
  /** MiningCore reserve at the last HourClosed boundary. */
  reserveAtClose: bigint;
  /** Returned to the reserve (SpendSettled.toReserve) since the last boundary. */
  recycledSince: bigint;
  /** Minted from the reserve for the Market Open LP since the last boundary. */
  lpMintedSince: bigint;
  /** Day of the last core event; days before it have a distribution snapshot. */
  lastDay: number | null;
}

const INITIAL: ProjectionState = {
  reserveAtClose: CAP,
  recycledSince: 0n,
  lpMintedSince: 0n,
  lastDay: null,
};

export async function loadState(tx: Db): Promise<ProjectionState> {
  const rows = await tx.select().from(state);
  const kv = new Map(rows.map((r) => [r.key, r.value]));
  const big = (key: keyof ProjectionState, fallback: bigint) => {
    const v = kv.get(key);
    return v === undefined ? fallback : BigInt(v);
  };
  const lastDay = kv.get('lastDay');
  return {
    reserveAtClose: big('reserveAtClose', INITIAL.reserveAtClose),
    recycledSince: big('recycledSince', INITIAL.recycledSince),
    lpMintedSince: big('lpMintedSince', INITIAL.lpMintedSince),
    lastDay: lastDay === undefined || lastDay === '' ? null : Number(lastDay),
  };
}

export async function saveState(tx: Db, s: ProjectionState): Promise<void> {
  const rows = Object.entries(s).map(([key, value]) => ({
    key,
    value: value === null ? '' : String(value),
  }));
  await tx
    .insert(state)
    .values(rows)
    .onConflictDoUpdate({ target: state.key, set: { value: sql`excluded.value` } });
}

/** Everything a projection needs while applying one batch inside a transaction. */
export class Ctx {
  /** Days whose economy_daily row must be recomputed at the end of the batch. */
  readonly dirtyDays = new Set<number>();

  constructor(
    readonly tx: Db,
    readonly state: ProjectionState,
    readonly contracts: ContractSet,
  ) {}

  /**
   * Upsert that adds `delta` to the existing numeric columns (inserting the row if needed).
   * Keys and deltas use the Drizzle property names of `table`.
   */
  async bump(
    table: PgTable,
    target: PgColumn | PgColumn[],
    key: Record<string, unknown>,
    delta: Record<string, bigint | number>,
  ): Promise<void> {
    const columns = getTableColumns(table) as Record<string, PgColumn>;
    const set = Object.fromEntries(
      Object.keys(delta).map((prop) => {
        const column = columns[prop];
        if (column === undefined) throw new Error(`unknown column ${prop}`);
        return [prop, sql`${column} + excluded.${sql.identifier(column.name)}`];
      }),
    );
    await this.tx
      .insert(table)
      .values({ ...key, ...delta } as never)
      .onConflictDoUpdate({ target, set });
  }

  async addHour(
    time: bigint,
    delta: Partial<Record<keyof typeof hours.$inferInsert, bigint | number>>,
  ): Promise<void> {
    const hour = hourOf(time);
    await this.bump(hours, hours.hour, { hour }, delta as Record<string, bigint | number>);
    this.dirtyDays.add(dayOfHour(hour));
  }

  async addAccount(
    address: string,
    delta: Partial<Record<keyof typeof accounts.$inferInsert, bigint | number>>,
  ): Promise<void> {
    await this.bump(
      accounts,
      accounts.address,
      { address },
      delta as Record<string, bigint | number>,
    );
  }

  /** Records that `account` acted at `time` (cohort retention and activity counts). */
  async touch(account: string, time: bigint): Promise<void> {
    const day = dayOf(time);
    await this.tx.insert(accountDays).values({ account, day }).onConflictDoNothing();
    await this.tx
      .insert(accounts)
      .values({ address: account, lastActiveAt: time })
      .onConflictDoUpdate({ target: accounts.address, set: { lastActiveAt: time } });
    this.dirtyDays.add(day);
  }
}
