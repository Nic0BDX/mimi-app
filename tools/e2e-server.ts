import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { isolatedDatabase } from '../apps/server/tests/database.js';
import { buildApp } from '../apps/server/src/app.js';
import { envSchema } from '../apps/server/src/config/env.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const database = await isolatedDatabase();
await fs.mkdir(path.join(root, '.local'), { recursive: true });
const app = await buildApp(
  envSchema.parse({
    NODE_ENV: 'test',
    DATABASE_URL: database.url,
    WEB_ORIGIN: 'http://localhost:5173',
  }),
  {
    db: database.db,
    rateLimit: false,
    polling: process.env.VITE_HTTP_REALTIME === 'true',
    mailer: {
      async sendPasswordReset(email, url) {
        await fs.appendFile(
          path.join(root, '.local/e2e-mails.jsonl'),
          JSON.stringify({ email, url }) + '\n',
        );
      },
    },
  },
);
await app.listen({ host: '127.0.0.1', port: 3001 });
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
const web = spawn(
  process.execPath,
  [vite, 'preview', '--configLoader', 'runner', '--port', '5173', '--strictPort'],
  {
    cwd: path.join(root, 'apps/web'),
    stdio: 'inherit',
  },
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  web.kill();
  await app.close();
  await database.close();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void close().then(() => process.exit(0));
  });
web.once('exit', () => {
  if (!closing) void close().then(() => process.exit(1));
});
