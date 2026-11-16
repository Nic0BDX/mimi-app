import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { isolatedDatabase } from '../apps/server/tests/database.ts';

const database = await isolatedDatabase();
const probe = createServer().listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const processServer = spawn(
  process.execPath,
  process.argv.includes('--accounts')
    ? [
        '--input-type=module',
        '-e',
        `import { createServer } from 'node:http'; import handler from ${JSON.stringify(new URL('../apps/server/dist/serverless.js', import.meta.url).href)}; createServer(handler).listen(Number(process.env.PORT), '127.0.0.1');`,
      ]
    : [fileURLToPath(new URL('../apps/server/dist/main.js', import.meta.url))],
  {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: database.url,
      WEB_ORIGIN: 'http://localhost:5173',
      COOKIE_SECURE: 'false',
      MAIL_TRANSPORT: 'console',
      TRUST_PROXY: 'false',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  },
);
let stderr = '';
processServer.stderr.on('data', (data) => {
  stderr = (stderr + data.toString()).slice(-4096);
});
try {
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (processServer.exitCode !== null) throw new Error(`Compiled server exited: ${stderr}`);
    try {
      ready = (await fetch(`${base}/api/health`)).ok;
    } catch {
      /* Await startup only. */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert(ready, `Compiled server did not start: ${stderr}`);
  const session = await fetch(`${base}/api/auth/session`);
  const data = await session.json();
  const cookies = session.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
  const registration = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:5173',
      Cookie: cookies,
      'Content-Type': 'application/json',
      'X-CSRF-Token': data.csrfToken,
    },
    body: JSON.stringify({
      email: `${randomUUID()}@example.test`,
      username: `Build_${randomUUID().slice(0, 8)}`,
      password: 'Runtime-Password-123',
    }),
  });
  assert.equal(registration.status, 201, JSON.stringify(await registration.clone().json()));
  const result = await registration.json();
  assert.equal(result.user.avatarId, 'comet');
  assert.equal(result.user.email, undefined);
  console.info('Compiled Node server: real PostgreSQL, session and registration verified.');
} finally {
  const exited = once(processServer, 'exit');
  if (processServer.exitCode === null) {
    processServer.kill('SIGTERM');
    await exited;
  }
  await database.close();
}
