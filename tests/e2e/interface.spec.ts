import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function capture(page: Page, route: string, name: string, project: string) {
  await page.goto(route);
  await expect(page.locator('main')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const cards = page.locator('.game-card');
  for (const card of await cards.all()) {
    if (await card.isVisible()) {
      const emptyBand = await card.evaluate(
        (element) =>
          element.clientWidth - element.querySelector('.game-cover')!.getBoundingClientRect().width,
      );
      expect(
        Math.abs(emptyBand),
        'Game artwork must fill its card without an empty side band',
      ).toBeLessThanOrEqual(1);
    }
  }
  await page.screenshot({ path: `test-results/interface-${project}-${name}.png`, fullPage: true });
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    mask: [
      page.locator(
        '.user-card strong, .profile-card > h2, input[name="username"], input[type="email"]',
      ),
    ],
    maskColor: '#263254',
  });
}

test('guest screens, keyboard navigation and translated login preserve the NIMIMI shell', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [route, name] of [
    ['/', 'home'],
    ['/login', 'login'],
    ['/register', 'register'],
    ['/forgot-password', 'recovery'],
    ['/games', 'games'],
    ['/legal', 'legal'],
    ['/privacy', 'privacy'],
  ]) {
    await capture(page, route!, name!, info.project.name);
  }
  await page.goto('/login');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.getByRole('button', { name: 'Changer de langue' }).click();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(errors).toEqual([]);
});

test('account and all six game creation screens fit mobile and desktop', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const username = `Visual_${randomUUID().slice(0, 6)}`;
  await page.goto('/register');
  await page.getByLabel('Pseudo', { exact: true }).fill(username);
  await page.getByLabel('Adresse e-mail').fill(`${username}@example.test`);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Password-123');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL('/');
  for (const route of [
    '/profile',
    '/settings',
    '/friends',
    '/games/online',
    '/my-games',
    '/rankings',
  ]) {
    await capture(page, route, route.slice(1).replaceAll('/', '-'), info.project.name);
  }
  for (const game of [
    'morpion',
    'puissance-quatre',
    'dames',
    'carte-frenesie',
    'course-ecuries',
    'bombe-mots',
  ]) {
    await capture(page, `/games/new?type=${game}`, `create-${game}`, info.project.name);
    await expect(page.getByRole('button', { name: 'Créer un salon', exact: true })).toBeEnabled();
  }
  await page.goto('/settings');
  const music = page.locator('.sound-music');
  await expect(music).toHaveAttribute('aria-pressed', 'false');
  await music.click();
  await expect(music).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.sound-effects').click();
  await expect(page.locator('.sound-effects')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('.sound-effects')).toHaveAttribute('aria-pressed', 'true');
  await music.click();
  await expect(music).toHaveAttribute('aria-pressed', 'true');
  await music.click();
  await expect(music).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});
