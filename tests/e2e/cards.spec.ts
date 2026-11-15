import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { roomSchema } from '@mimi/shared';
async function register(page: Page, name: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo', { exact: true }).fill(name);
  await page.getByLabel('Adresse e-mail').fill(`${name}@example.test`);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Password-123');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL('/');
}
test('private hands are filtered for two real players and cards can be played', async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const id = randomUUID().slice(0, 6);
  await register(page, `CardsA_${id}`);
  const context = await browser.newContext({
    baseURL: 'http://localhost:5173',
    viewport: { width: 390, height: 844 },
  });
  try {
    const other = await context.newPage();
    other.on('pageerror', (e) => errors.push(e.message));
    await register(other, `CardsB_${id}`);
    await page.goto('/games/new?type=carte-frenesie');
    await page.getByRole('button', { name: 'Créer un salon', exact: true }).click();
    const code = await page.locator('.room-code strong').innerText();
    await other.goto('/games/online');
    await other.getByLabel('Code du salon').fill(code);
    await other.getByRole('button', { name: 'Rejoindre', exact: true }).click();
    await page.getByRole('button', { name: 'Prêt', exact: true }).click();
    await other.getByRole('button', { name: 'Prêt', exact: true }).click();
    await page.getByRole('button', { name: 'Lancer la partie' }).click();
    await expect
      .poll(() => page.locator('.card-hand .playing-card').count())
      .toBeGreaterThanOrEqual(7);
    await expect(other.locator('.card-hand')).toBeVisible();
    const fetchRoom = async (p: Page) =>
      roomSchema.parse(
        await p.evaluate(async () =>
          fetch(`/api/games/${location.pathname.split('/').at(-1)}`).then((r) => r.json()),
        ),
      );
    const a = await fetchRoom(page),
      b = await fetchRoom(other);
    expect(a.view?.hand?.length).toBeGreaterThanOrEqual(7);
    expect(b.view?.hand?.length).toBeGreaterThanOrEqual(7);
    const ownIds = new Set(a.view?.hand?.map((c) => c.id));
    expect(b.view?.hand?.every((c) => !ownIds.has(c.id))).toBe(true);
    expect(a).not.toHaveProperty('state');
    expect(a.view).not.toHaveProperty('deck');
    expect(a.view).not.toHaveProperty('hands');
    const active =
      a.view?.turn === a.players.find((p) => p.user?.username === `CardsA_${id}`)?.id
        ? page
        : other;
    if (await active.locator('.color-picker button').count())
      await active.locator('.color-picker button').first().click();
    const before = (await fetchRoom(active)).version;
    if (await active.locator('.card-hand .playable:enabled').count()) {
      await active.locator('.card-hand .playable:enabled').first().click();
      if (await active.locator('.color-picker button').count())
        await active.locator('.color-picker button').first().click();
    } else await active.getByRole('button', { name: 'Piocher', exact: true }).click();
    await expect.poll(async () => (await fetchRoom(active)).version).toBeGreaterThan(before);
    await page.screenshot({ path: `test-results/cards-${info.project.name}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await context.close();
  }
  expect(errors).toEqual([]);
});
