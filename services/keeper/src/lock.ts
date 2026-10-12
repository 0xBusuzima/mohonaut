import pg from 'pg';

/** Arbitrary constant: the Postgres advisory lock that only one keeper may hold. */
const LOCK_ID = 46_634_663;

export interface JobLock {
  /** True when this process holds the lock (tries to take it if not). */
  acquire(): Promise<boolean>;
  release(): Promise<void>;
}

/**
 * Two keepers must never act at once (double buybacks, nonce races). With Postgres, a
 * session-level advisory lock on a dedicated connection decides; the standby takes over when
 * the holder's connection ends. Embedded PGlite (pglite://, memory://) serves one process, so
 * the lock is trivially held.
 */
export function jobLock(databaseUrl: string): JobLock {
  if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
    return { acquire: async () => true, release: async () => undefined };
  }
  let client: pg.Client | null = null;
  let held = false;
  return {
    async acquire() {
      if (held && client !== null) return true;
      if (client === null) {
        const c = new pg.Client({ connectionString: databaseUrl });
        c.on('error', () => {
          // The session (and the lock with it) is gone; reconnect on the next tick.
          held = false;
          client = null;
        });
        await c.connect();
        client = c;
      }
      const res = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [LOCK_ID],
      );
      held = res.rows[0]?.locked === true;
      return held;
    },
    async release() {
      if (client !== null) await client.end();
      client = null;
      held = false;
    },
  };
}
