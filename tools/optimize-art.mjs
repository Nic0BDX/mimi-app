import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root = path.resolve(import.meta.dirname, '..');
const sources = JSON.parse(await fs.readFile(path.join(root, '.local/art-sources.json'), 'utf8'));
const out = path.join(root, 'apps/web/public/art');
await fs.mkdir(out, { recursive: true });
const entries = [];
for (const { name, source } of sources) {
  const size =
    name === 'landscape-mobile'
      ? [900, 1600]
      : name === 'landscape-desktop'
        ? [1680, 960]
        : name === 'hero-objects'
          ? [720, 480]
          : [660, 440];
  const file = path.join(out, `${name}-v2.webp`);
  await sharp(source)
    .resize(size[0], size[1], { fit: 'cover', position: 'centre' })
    .webp({ quality: name === 'hero-objects' ? 88 : 84, alphaQuality: 95, effort: 6 })
    .toFile(file);
  const stat = await fs.stat(file);
  entries.push({ name, bytes: stat.size, path: `/art/${name}-v2.webp` });
}
await fs.writeFile(path.join(root, '.local/art-manifest.json'), JSON.stringify(entries, null, 2));
const tiles = await Promise.all(
  entries.map(async (entry) => ({
    input: await sharp(path.join(out, path.basename(entry.path)))
      .resize(280, 180, { fit: 'contain', background: '#202544' })
      .png()
      .toBuffer(),
  })),
);
await sharp({ create: { width: 840, height: 540, channels: 4, background: '#202544' } })
  .composite(
    tiles.map((tile, i) => ({ ...tile, left: (i % 3) * 280, top: Math.floor(i / 3) * 180 })),
  )
  .png()
  .toFile(path.join(root, '.local/art-contact-sheet.png'));
console.info(
  JSON.stringify({ assets: entries, totalBytes: entries.reduce((n, e) => n + e.bytes, 0) }),
);
