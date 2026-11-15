import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
async function register(page: Page, name: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo', { exact: true }).fill(name);
  await page.getByLabel('Adresse e-mail').fill(`${name}@example.test`);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Password-123');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL('/');
}
test('real requests, notifications, acceptance, multi-tab presence and block', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const suffix = randomUUID().slice(0, 6),
    a = `Amy_${suffix}`,
    b = `Ben_${suffix}`;
  await register(page, a);
  const other = await browser.newContext({
    baseURL: 'http://localhost:5173',
    viewport: { width: 390, height: 844 },
  });
  try {
    const bob = await other.newPage();
    await register(bob, b);
    await page.goto('/friends');
    await page.getByLabel('Rechercher un pseudo').fill(b);
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await page.getByRole('button', { name: 'Ajouter en ami' }).click();
    await bob.goto('/friends');
    await bob.getByRole('tab', { name: /Reçues/ }).click();
    await expect(bob.getByRole('button', { name: 'Accepter' })).toBeVisible();
    await bob.getByRole('button', { name: 'Accepter' }).click();
    await bob.getByRole('tab', { name: /^Amis/ }).click();
    await expect(bob.locator('.person-row').filter({ hasText: a })).toContainText('En ligne');
    await page.getByRole('tab', { name: /^Amis/ }).click();
    await expect(
      page.getByRole('tabpanel').locator('.person-row').filter({ hasText: b }),
    ).toContainText('En ligne');
    const tab = await other.newPage();
    await tab.goto('/');
    await bob.close();
    await expect(
      page.getByRole('tabpanel').locator('.person-row').filter({ hasText: b }),
    ).toContainText('En ligne');
    await tab.close();
    await expect(
      page.getByRole('tabpanel').locator('.person-row').filter({ hasText: b }),
    ).toContainText('Hors ligne', {
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Bloquer', exact: true }).click();
    await page.getByRole('tab', { name: /Bloqués/ }).click();
    await expect(
      page.getByRole('tabpanel').locator('.person-row').filter({ hasText: b }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Débloquer' }).click();
    await expect(
      page.getByRole('tabpanel').locator('.person-row').filter({ hasText: b }),
    ).toHaveCount(0);
  } finally {
    await other.close();
  }
  expect(errors).toEqual([]);
});
