import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate, openDatabase } from '../src/db/client.js';
import type { Database } from '../src/db/client.js';
import { allTables } from '../src/db/schema.js';

let database: Database;

beforeAll(async () => {
  database = await openDatabase('memory://');
  await migrate(database);
});

afterAll(async () => {
  await database.close();
});

describe('schema', () => {
  it('applies each migration once', async () => {
    expect(await migrate(database)).toEqual([]);
  });

  it.each(allTables.map((t) => [getTableConfig(t).name, t] as const))(
    'Drizzle table %s matches the SQL migration',
    async (name, table) => {
      const rows = await database.query(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${name}' ORDER BY column_name`,
      );
      const actual = rows.map((r) => [
        r['column_name'],
        r['data_type'],
        r['is_nullable'] === 'YES',
      ]);
      const expected = getTableConfig(table)
        .columns.map((c) => [
          c.name,
          // bigserial is a bigint column with a sequence default in information_schema
          c
            .getSQLType()
            .replace(/\(.*\)$/, '')
            .replace('bigserial', 'bigint'),
          !c.notNull,
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      expect(actual).toEqual(expected);
    },
  );
});
