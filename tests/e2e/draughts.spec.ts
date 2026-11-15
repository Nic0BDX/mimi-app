import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
test('draughts board and server-provided legal moves work on touch and desktop', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const id = randomUUID().slice(0, 7);
  await page.goto('/register');
  await page.getByLabel('Pseudo', { exact: true }).fill(`Dames_${id}`);
  await page.getByLabel('Adresse e-mail').fill(`${id}@example.test`);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Password-123');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.waitForURL('/');
  await page.goto('/games/new?type=dames');
  await page.getByLabel('Nombre de bots').fill('1');
  await page.getByRole('button', { name: 'Créer un salon', exact: true }).click();
  await page.getByRole('button', { name: 'Prêt', exact: true }).click();
  await page.getByRole('button', { name: 'Lancer la partie' }).click();
  await expect(page.locator('.draughts-piece')).toHaveCount(40);
  await expect(page.locator('.legal-moves button')).toHaveCount(9);
  await page.locator('.legal-moves button').first().click();
  await expect.poll(() => page.locator('.draughts-piece').count()).toBe(40);
  await expect(page.getByText('À toi de jouer !', { exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/dames-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
