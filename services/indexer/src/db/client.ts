import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: Db;
  /** Runs one or more SQL statements without parameters. */
  exec(sql: string): Promise<void>;
  query(sql: string): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

/**
 * postgres://… for production; pglite://<directory> (embedded Postgres, persisted) or memory://
 * for local development and tests.
 */
export async function openDatabase(url: string): Promise<Database> {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const pool = new pg.Pool({ connectionString: url });
    return {
      db: drizzlePg(pool, { schema }) as unknown as Db,
      exec: async (sql) => {
        await pool.query(sql);
      },
      query: async (sql) => (await pool.query<Record<string, unknown>>(sql)).rows,
      close: () => pool.end(),
    };
  }
  if (url === 'memory://' || url.startsWith('pglite://')) {
    const client = url === 'memory://' ? new PGlite() : new PGlite(url.slice('pglite://'.length));
    await client.waitReady;
    return {
      db: drizzlePglite(client, { schema }) as unknown as Db,
      exec: async (sql) => {
        await client.exec(sql);
      },
      query: async (sql) => (await client.query<Record<string, unknown>>(sql)).rows,
      close: () => client.close(),
    };
  }
  throw new Error('DATABASE_URL must be postgres://…, pglite://<directory> or memory://');
}

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));
const MIGRATION_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;

/** Applies migrations/*.sql in name order, each once and in its own transaction. */
export async function migrate(database: Database): Promise<string[]> {
  await database.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const applied = new Set(
    (await database.query('SELECT name FROM schema_migrations')).map((r) => String(r['name'])),
  );
  const pending = readdirSync(MIGRATIONS_DIR)
    .filter((name) => MIGRATION_NAME.test(name) && !applied.has(name))
    .sort();
  for (const name of pending) {
    const body = readFileSync(MIGRATIONS_DIR + name, 'utf8');
    await database.exec(
      `BEGIN;\n${body}\nINSERT INTO schema_migrations (name) VALUES ('${name}');\nCOMMIT;`,
    );
  }
  return pending;
}
