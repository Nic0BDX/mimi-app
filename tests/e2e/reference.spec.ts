import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import { referenceFrames } from '../../apps/web/src/components/ReferenceArtwork';

test('game illustrations match the supplied reference pixels', async ({ page }, info) => {
  await page.goto('/games');
  await page.waitForLoadState('networkidle');
  const results = [];
  for (const game of [
    'morpion',
    'puissance-quatre',
    'dames',
    'carte-frenesie',
    'course-ecuries',
    'bombe-mots',
  ] as const) {
    const artwork = page.locator(`.game-card`).nth(results.length).locator('.game-cover > svg');
    await artwork.evaluate((element) =>
      element.scrollIntoView({ block: 'center', inline: 'nearest' }),
    );
    const actual = await artwork.screenshot({ animations: 'disabled' });
    const size = await sharp(actual).metadata();
    const width = size.width!,
      height = size.height!;
    const [left, top, frameWidth, frameHeight] = referenceFrames[game].split(' ').map(Number);
    const expected = await sharp('apps/web/public/art/nimimi-reference.png')
      .extract({ left: left!, top: top!, width: frameWidth!, height: frameHeight! })
      .resize(width, height, { fit: 'cover' })
      .png()
      .toBuffer();
    // Ignore the rounded corners and deliberate bottom fade added by the card UI.
    const region = {
      left: Math.floor(width * 0.1),
      top: 6,
      width: Math.floor(width * 0.8),
      height: Math.max(1, Math.floor((height - 40) * 0.8)),
    };
    const a = await sharp(actual).extract(region).removeAlpha().raw().toBuffer();
    const b = await sharp(expected).extract(region).removeAlpha().raw().toBuffer();
    let total = 0;
    for (let i = 0; i < a.length; i++) total += Math.abs(a[i]! - b[i]!);
    const meanError = total / a.length;
    results.push({ game, meanError, normalizedError: meanError / 255 });
    expect(meanError, `${game}: reference artwork differs`).toBeLessThan(8);
  }
  await fs.mkdir('docs/previews/comparison', { recursive: true });
  await fs.writeFile(
    `docs/previews/comparison/${info.project.name}.json`,
    JSON.stringify(
      {
        source: 'apps/web/public/art/nimimi-reference.png',
        scope:
          'Artwork only; excludes photograph perspective, surrounding devices, UI text and user data.',
        maxMeanError: 8,
        results,
      },
      null,
      2,
    ) + '\n',
  );
});
