import EmbeddedPostgres from 'embedded-postgres';
import path from 'node:path';
import fs from 'node:fs/promises';

// Optional native PostgreSQL for contributors without Docker. Isolated, localhost
// only, persistent under .local; never deletes or resets an existing database.
const databaseDir = path.resolve(import.meta.dirname, '../.local/postgres-test');
const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'mimi',
  password: 'mimi_dev_only',
  port: 5433,
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: (message) => console.error(message),
});
try {
  await fs.access(path.join(databaseDir, 'PG_VERSION'));
} catch {
  await pg.initialise();
}
await pg.start();
const client = pg.getPgClient();
await client.connect();
for (const name of ['mimi_test', 'mimi']) {
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
  if (!exists.rows.length) await client.query(`CREATE DATABASE ${name}`);
}
await client.end();
console.info('PostgreSQL ready on 127.0.0.1:5433 (mimi_test and mimi). Ctrl+C to stop.');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void pg.stop().then(() => process.exit(0));
  });
setInterval(() => {}, 60_000);
