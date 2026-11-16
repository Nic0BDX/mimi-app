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
test('two browsers finish a real Morpion game, chat, reconnect and rematch', async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const id = randomUUID().slice(0, 6);
  await register(page, `Host_${id}`);
  const context = await browser.newContext({
    baseURL: 'http://localhost:5173',
    viewport: { width: 390, height: 844 },
  });
  try {
    const other = await context.newPage();
    other.on('pageerror', (e) => errors.push(e.message));
    await register(other, `Guest_${id}`);
    await page.goto('/games/new');
    await page.getByRole('button', { name: 'Créer un salon', exact: true }).click();
    await expect(page).toHaveURL(/\/games\/room\//);
    const code = await page.locator('.room-code strong').innerText();
    await other.goto('/games/online');
    await other.getByLabel('Code du salon').fill(code);
    await other.getByRole('button', { name: 'Rejoindre', exact: true }).click();
    await expect(other).toHaveURL(/\/games\/room\//);
    await expect(page.locator('.player-chip')).toHaveCount(2);
    await page.getByRole('button', { name: 'Prêt', exact: true }).click();
    await other.getByRole('button', { name: 'Prêt', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Lancer la partie' })).toBeEnabled();
    await page.getByRole('button', { name: 'Lancer la partie' }).click();
    await expect(page.getByText('À toi de jouer !', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Case 1', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Case 1 ×' })).toBeVisible();
    await other.reload();
    await expect(other.getByText('À toi de jouer !', { exact: true })).toBeVisible();
    await other.getByRole('button', { name: 'Case 4', exact: true }).click();
    await page.getByRole('button', { name: 'Case 2', exact: true }).click();
    await other.getByRole('button', { name: 'Case 5', exact: true }).click();
    await page.locator('#chat-message').fill('<script>visible text</script>');
    await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await expect(other.getByRole('log')).toContainText('<script>visible text</script>');
    await page.screenshot({
      path: `test-results/morpion-${info.project.name}.png`,
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Case 3', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Résultats' })).toBeVisible();
    await expect(other.getByRole('heading', { name: 'Résultats' })).toBeVisible();
    await expect(page.locator('.result-row').first()).toContainText(`Host_${id}`);
    await page.getByRole('button', { name: 'Revanche', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Prêt', exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
  expect(errors).toEqual([]);
});
test('solo bot game uses the server engine and remains unranked', async ({ page }) => {
  await register(page, `Solo_${randomUUID().slice(0, 6)}`);
  await page.goto('/games/new?type=puissance-quatre');
  await page.getByLabel('Nombre de bots').fill('1');
  await page.getByRole('button', { name: 'Créer un salon', exact: true }).click();
  await page.getByRole('button', { name: 'Prêt', exact: true }).click();
  await page.getByRole('button', { name: 'Lancer la partie' }).click();
  await page.getByRole('button', { name: 'Colonne 4', exact: true }).click();
  await expect.poll(async () => page.locator('.disc.piece-2').count()).toBe(1);
  await expect(page.getByText('À toi de jouer !', { exact: true })).toBeVisible();
});

test('two players finish Puissance 4 and retain the result after reconnecting', async ({
  page,
  browser,
}, info) => {
  const id = randomUUID().slice(0, 6);
  await register(page, `ConnectA_${id}`);
  const context = await browser.newContext({ baseURL: 'http://localhost:5173' });
  try {
    const other = await context.newPage();
    await register(other, `ConnectB_${id}`);
    await page.goto('/games/new?type=puissance-quatre');
    await page.getByRole('button', { name: 'Créer un salon', exact: true }).click();
    const code = await page.locator('.room-code strong').innerText();
    await other.goto('/games/online');
    await other.getByLabel('Code du salon').fill(code);
    await other.getByRole('button', { name: 'Rejoindre', exact: true }).click();
    await page.getByRole('button', { name: 'Prêt', exact: true }).click();
    await other.getByRole('button', { name: 'Prêt', exact: true }).click();
    await page.getByRole('button', { name: 'Lancer la partie' }).click();
    for (let turn = 0; turn < 7; turn++) {
      const active = turn % 2 === 0 ? page : other;
      await active.getByRole('button', { name: `Colonne ${(turn % 2) + 1}`, exact: true }).click();
      if (turn < 6)
        await expect(page.locator('.disc.piece-1, .disc.piece-2')).toHaveCount(turn + 1);
    }
    await expect(other.getByRole('heading', { name: 'Résultats' })).toBeVisible();
    await other.reload();
    await expect(other.locator('.result-row').first()).toContainText(`ConnectA_${id}`);
    await page.screenshot({
      path: `test-results/connect-${info.project.name}.png`,
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await context.close();
  }
});
