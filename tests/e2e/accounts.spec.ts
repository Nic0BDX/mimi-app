import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';

async function register(page: Page, email: string, username: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo', { exact: true }).fill(username);
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Password-123');
  await page.getByRole('radio', { name: 'Avatar 2', exact: true }).check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL('/');
}
test('two isolated browsers: registration, profile update, durable sessions and actual deletion', async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const id = randomUUID().slice(0, 8),
    email = `a-${id}@example.test`,
    username = `Alice_${id}`;
  await register(page, email, username);
  await expect(page.locator('.game-card')).toHaveCount(6);
  expect(
    await page
      .locator('.page-heading p')
      .evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain('Trebuchet');
  await expect(page.locator('.top-avatar img')).toHaveAttribute('src', '/avatars/fox.svg');
  await page.goto('/settings');
  await page.getByLabel('Pseudo', { exact: true }).fill(`Luna_${id}`);
  await page.getByRole('radio', { name: 'Avatar 3', exact: true }).check();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status')).toContainText('Modifications enregistrées');
  await page.reload();
  await expect(page.getByLabel('Pseudo', { exact: true })).toHaveValue(`Luna_${id}`);
  await expect(page.locator('.top-avatar img')).toHaveAttribute('src', '/avatars/owl.svg');
  await page.goto('/');
  await page.screenshot({ path: `test-results/home-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL: 'http://localhost:5173',
  });
  try {
    const other = await context.newPage();
    await register(other, `b-${id}@example.test`, `Bob_${id}`);
    await other.goto('/profile');
    await expect(other.getByRole('heading', { name: `Bob_${id}` })).toBeVisible();
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: `Luna_${id}` })).toBeVisible();
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Supprimer mon compte', exact: true }).click();
    await page.getByLabel('Saisis ton mot de passe pour confirmer.').fill('Password-123');
    await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect(page).toHaveURL('/login');
    await other.reload();
    await expect(other.getByRole('heading', { name: `Bob_${id}` })).toBeVisible();
  } finally {
    await context.close();
  }
  expect(errors).toEqual([]);
});
test('password recovery, logout/login, language persistence and offline shell', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const id = randomUUID().slice(0, 8),
    email = `reset-${id}@example.test`;
  await register(page, email, `Reset_${id}`);
  // Logout by API with the actual session CSRF token, also valid on mobile.
  await page.evaluate(async () => {
    const session = (await fetch('/api/auth/session').then((r) => r.json())) as {
      csrfToken: string;
    };
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'X-CSRF-Token': session.csrfToken },
    });
  });
  await page.goto('/forgot-password');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByRole('button', { name: 'Envoyer le lien' }).click();
  await expect(page.getByRole('status')).toContainText('Si un compte correspond');
  let resetUrl = '';
  await expect
    .poll(async () => {
      const lines = await fs.readFile('.local/e2e-mails.jsonl', 'utf8').catch(() => '');
      for (const line of lines.trim().split('\n').filter(Boolean)) {
        const mail = JSON.parse(line) as { email: string; url: string };
        if (mail.email === email) resetUrl = mail.url;
      }
      return resetUrl;
    })
    .not.toBe('');
  await page.goto(resetUrl);
  await page.getByLabel('Nouveau mot de passe').fill('NewPassword-456');
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(page.getByRole('status')).toContainText('Mot de passe modifié');
  await page
    .getByRole('link', { name: 'Se connecter', exact: true })
    .filter({ hasNot: page.locator('svg') })
    .last()
    .click();
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill('NewPassword-456');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('button', { name: 'Changer de langue' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'What shall we play tonight?' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('status')).toContainText('You are offline');
  await expect(page.getByRole('heading', { name: 'What shall we play tonight?' })).toBeVisible();
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
