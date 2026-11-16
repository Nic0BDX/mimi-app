import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) throw Error('Usage: node tools/preview-smoke.mjs <url>');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_BROWSER
    ? { executablePath: process.env.PLAYWRIGHT_BROWSER }
    : process.platform === 'win32'
      ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }
      : {}),
});
const errors = [],
  api = [];
await fs.mkdir('.local/preview-check', { recursive: true });
try {
  for (const [name, width, height] of [
    ['mobile', 390, 844],
    ['desktop', 1920, 1080],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('request', (request) => {
      if (/\/(api|socket\.io)(\/|\?)/.test(new URL(request.url()).pathname))
        api.push(request.url());
    });
    const response = await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.getByRole('heading', { name: 'À quoi joue-t-on ce soir ?' }).waitFor();
    assert.equal(await page.locator('.game-card').count(), 6);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `.local/preview-check/${name}.png`, fullPage: true });
    await page.locator('.game-card a').first().click();
    await page.getByRole('heading', { name: 'Morpion', exact: true }).waitFor();
    await page.goto(new URL('/register', base).href, { waitUntil: 'networkidle' });
    await page.getByLabel('Pseudo', { exact: true }).fill('Visiteur');
    assert.equal(
      await page.getByRole('button', { name: 'Créer mon compte', exact: true }).isDisabled(),
      true,
    );
    await page.getByRole('button', { name: 'Changer de langue' }).click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.getByLabel('Username', { exact: true }).inputValue(), 'Visiteur');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    const manifest = await context.request.get(new URL('/manifest.webmanifest', base).href);
    assert.equal(manifest.status(), 200);
    assert.match(manifest.headers()['content-type'], /json|manifest/);
    console.info(
      `${name}: home, six cards, navigation, disabled account submission, FR/EN persistence, manifest OK`,
    );
    await context.close();
  }
  assert.deepEqual(api, [], 'Static preview must not call a backend');
  assert.deepEqual(errors, [], 'No console/page errors');
  console.info('Static preview passed: no backend calls or console errors.');
} finally {
  await browser.close();
}
