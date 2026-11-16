import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { roomSchema } from '@mimi/shared';
async function register(page: Page) {
  const name = `Mega_${randomUUID().slice(0, 8)}`;
  await page.goto('/register');
  await page.getByLabel('Pseudo', { exact: true }).fill(name);
  await page.getByLabel('Adresse e-mail').fill(`${name}@example.test`);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Password-123');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL('/');
}
async function room(page: Page) {
  const id = page.url().split('/').at(-1)!;
  return roomSchema.parse(
    await page.evaluate(async (id) => (await fetch(`/api/games/${id}`)).json(), id),
  );
}
async function command(page: Page, action: unknown) {
  const r = await room(page);
  const response = await page.evaluate(
    async ({ r, action, actionId }) => {
      const session = await (await fetch('/api/auth/session')).json();
      const result = await fetch('/api/realtime/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
        body: JSON.stringify({
          event: 'game:action',
          payload: { gameId: r.id, expectedVersion: r.version, actionId, action },
        }),
      });
      return { status: result.status, body: await result.json() };
    },
    { r, action, actionId: randomUUID() },
  );
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return roomSchema.parse(response.body);
}
test('MÉGANOPOLY: two players roll, inspect French cards, exchange with consent and reload', async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await register(page);
  const context = await browser.newContext({
    baseURL: 'http://localhost:5173',
    viewport: { width: 390, height: 844 },
  });
  try {
    const other = await context.newPage();
    other.on('pageerror', (e) => errors.push(e.message));
    await register(other);
    await page.goto('/games/new?type=meganopoly');
    await expect(page.getByRole('combobox', { name: 'Jeux', exact: true })).toHaveValue(
      'meganopoly',
    );
    await page.getByRole('button', { name: 'Créer un salon', exact: true }).click();
    const code = await page.locator('.room-code strong').innerText();
    await other.goto('/games/online');
    await other.getByLabel('Code du salon').fill(code);
    await other.getByRole('button', { name: 'Rejoindre', exact: true }).click();
    await page.getByRole('button', { name: 'Prêt', exact: true }).click();
    await other.getByRole('button', { name: 'Prêt', exact: true }).click();
    await page.getByRole('button', { name: 'Lancer la partie' }).click();
    await expect(page.locator('.estate-tile')).toHaveCount(40);
    await expect(other.locator('.estate-board')).toBeVisible();
    expect((await page.request.get('/art/meganopoly-reference.png')).status()).toBe(200);
    await page.getByRole('button', { name: 'Consulter les cartes Dalmatien' }).click();
    await expect(page.locator('.estate-card-list article')).toHaveCount(12);
    await expect(page.locator('.estate-card-list p').first()).toHaveCSS('color', 'rgb(36, 59, 43)');
    await expect(page.locator('.estate-card-list')).toContainText('Cadeau de mariage');
    await page.getByRole('button', { name: 'Fermer les cartes' }).click();
    await page.getByRole('button', { name: 'Agrandir le plateau' }).click();
    await expect(page.locator('.estate-tile-name').first()).toHaveCSS('font-size', '9px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Voir le plateau entier' }).click();
    const before = await room(page);
    await page.getByRole('button', { name: 'Lancer les dés', exact: true }).click();
    await expect.poll(async () => (await room(page)).version).toBeGreaterThan(before.version);
    let r = await room(page);
    expect(r.view?.estate?.positions[0]).toBeGreaterThanOrEqual(0);
    expect(r.view?.estate?.positions[0]).toBeLessThan(40);
    expect(r.view?.estate?.dice.every((d) => d >= 1 && d <= 6)).toBe(true);
    if (r.view?.estate?.phase === 'offer') r = await command(page, { type: 'buy' });
    const original = r.view!.estate!.money.slice();
    r = await command(page, { type: 'propose-trade', target: 1, give: -1, take: -1, cash: 25 });
    expect(r.view!.estate!.money).toEqual(original);
    await other.getByRole('button', { name: 'Accepter l’échange', exact: true }).click();
    await expect
      .poll(async () => (await room(page)).view?.estate?.money[0])
      .toBe(original[0]! - 25);
    const persisted = await room(page);
    await page.reload();
    await expect(page.locator('.estate-board')).toBeVisible();
    expect((await room(page)).version).toBe(persisted.version);
    await page.getByRole('button', { name: /^1\. Le premier regard/ }).click();
    await expect(page.getByRole('region', { name: 'Fiche de la case sélectionnée' })).toContainText(
      'Le premier regard',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/meganopoly-${info.project.name}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('MÉGANOPOLY: a solo player can play against the server bot', async ({ page }) => {
  await register(page);
  await page.goto('/games/new?type=meganopoly');
  await page.getByLabel('Nombre de bots').fill('1');
  await page.getByRole('button', { name: 'Créer un salon', exact: true }).click();
  await page.getByRole('button', { name: 'Prêt', exact: true }).click();
  await page.getByRole('button', { name: 'Lancer la partie' }).click();
  await expect(page.locator('.estate-board')).toBeVisible();
  let r = await room(page);
  const host = r.hostId;
  for (let i = 0; i < 12 && r.view?.turn === host; i++) {
    const legal = r.view!.legalActions as { type: string }[];
    const action =
      ['roll', 'buy', 'end', 'pay-debt']
        .map((t) => legal.find((a) => a.type === t))
        .find(Boolean) ?? legal.find((a) => a.type !== 'propose-trade');
    r = await command(page, action);
  }
  expect(r.view?.turn).not.toBe(host);
  const version = r.version;
  await expect
    .poll(async () => (await room(page)).version, { timeout: 15000 })
    .toBeGreaterThan(version);
  expect((await room(page)).players.some((p) => p.control === 'BOT')).toBe(true);
});
