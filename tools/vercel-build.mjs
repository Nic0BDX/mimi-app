import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const serverRequire = createRequire(new URL('../apps/server/package.json', import.meta.url));
const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const prisma = serverRequire.resolve('prisma/build/index.js');
const schema = path.join(root, 'apps/server/prisma/schema.prisma');
const run = (args, cwd = root, env = process.env) =>
  execFileSync(process.execPath, args, { cwd, env, stdio: 'inherit' });
if (process.env.VERCEL_ENV === 'production' && !process.env.DATABASE_URL)
  throw new Error('Production accounts require DATABASE_URL.');
run([prisma, 'generate', '--schema', schema]);
if (process.env.DATABASE_URL) run([prisma, 'migrate', 'deploy', '--schema', schema]);
const tsupPackage = serverRequire.resolve('tsup/package.json');
const tsup = path.resolve(path.dirname(tsupPackage), serverRequire('tsup/package.json').bin.tsup);
run([tsup], path.join(root, 'apps/server'));
const environment = process.env.DATABASE_URL
  ? process.env
  : { ...process.env, VITE_PREVIEW_ONLY: 'true' };
run(
  [webRequire.resolve('typescript/bin/tsc'), '--noEmit'],
  path.join(root, 'apps/web'),
  environment,
);
const vite = path.join(path.dirname(webRequire.resolve('vite/package.json')), 'bin/vite.js');
run([vite, 'build'], path.join(root, 'apps/web'), environment);
