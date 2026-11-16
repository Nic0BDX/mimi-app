import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export default async function preservePreviews() {
  const source = path.join(root, 'test-results');
  const target = path.join(root, 'docs/previews/screens');
  const entries = await fs.readdir(source, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const captures = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.png'));
  if (!captures.length) return;
  await fs.mkdir(target, { recursive: true });
  for (const entry of captures) {
    await fs.copyFile(path.join(source, entry.name), path.join(target, entry.name));
    const home = /^interface-(desktop|mobile)-home\.png$/.exec(entry.name);
    if (home)
      await fs.copyFile(
        path.join(source, entry.name),
        path.join(root, `docs/previews/nimimi-${home[1]}.png`),
      );
  }
  console.info(`${captures.length} captures preserved in docs/previews/screens`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await preservePreviews();
