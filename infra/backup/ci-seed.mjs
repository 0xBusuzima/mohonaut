/* global console, process, URL */
// CI only (job `infra`): a database shaped like production for the backup/restore test. Runs the
// real indexer and API migrations, then adds a few rows, including to the append-only audit
// log, whose triggers the restore must bring back too.
//   node infra/backup/ci-seed.mjs postgres://postgres:pw@127.0.0.1:5432/mohonaut
import { fileURLToPath } from 'node:url';

const url = process.argv[2];
if (url === undefined) throw new Error('usage: ci-seed.mjs <postgres-url>');
const root = new URL('../../', import.meta.url);
const { migrate, openDatabase } = await import(
  new URL('services/indexer/dist/index.js', root).href
);
const database = await openDatabase(url);
await migrate(database);
await migrate(database, fileURLToPath(new URL('services/api/migrations/', root)));
await database.exec(`
  INSERT INTO users (wallet, auth_provider, provider_user_id) VALUES
    ('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', 'siwe', '0x3c44'),
    ('0x90F79bf6EB2c4f870365E785982E1f101E93b906', 'siwe', '0x90f7');
  INSERT INTO audit_log (actor_user_id, action, target, before, after, reason)
    VALUES (1, 'user.flag', 'user:2', '{"flagged":false}', '{"flagged":true}', 'ci seed');
  INSERT INTO accounts (address, site_level) VALUES ('0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', 1);
  INSERT INTO cursors (stream, block) VALUES ('core', 123), ('pool', 120);
`);
await database.close();
console.log('seeded');
