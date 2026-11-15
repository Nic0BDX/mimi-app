import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
export async function isolatedDatabase() {
  const base =
    process.env.TEST_DATABASE_URL ?? 'postgresql://mimi:mimi_dev_only@127.0.0.1:5433/mimi_test';
  const url = new URL(base);
  if (!url.pathname.endsWith('_test'))
    throw new Error('TEST_DATABASE_URL must name a dedicated *_test database.');
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new PrismaClient({ datasourceUrl: base });
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('schema', schema);
  const require = createRequire(new URL('../package.json', import.meta.url));
  try {
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
        '--schema',
        fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
      ],
      { env: { ...process.env, DATABASE_URL: url.href }, stdio: 'pipe' },
    );
  } catch (error) {
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
    throw error;
  }
  const db = new PrismaClient({ datasourceUrl: url.href });
  return {
    db,
    url: url.href,
    async close() {
      await db.$disconnect();
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.$disconnect();
    },
  };
}
