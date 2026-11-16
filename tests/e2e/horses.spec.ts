import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { roomSchema } from '@mimi/shared';

async function register(page: Page, username: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo', { exact: true }).fill(username);
  await page.getByLabel('Adresse e-mail').fill(`${username}@example.test`);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Password-123');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL('/');
}

test('two players roll, move and reconnect to the persisted horse race', async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const id = randomUUID().slice(0, 6);
  await register(page, `HorseA_${id}`);
  const context = await browser.newContext({ baseURL: 'http://localhost:5173' });
  try {
    const other = await context.newPage();
    other.on('pageerror', (error) => errors.push(error.message));
    await register(other, `HorseB_${id}`);
    await page.goto('/games/new?type=course-ecuries');
    await page.getByRole('button', { name: 'Créer un salon', exact: true }).click();
    const code = await page.locator('.room-code strong').innerText();
    await other.goto('/games/online');
    await other.getByLabel('Code du salon').fill(code);
    await other.getByRole('button', { name: 'Rejoindre', exact: true }).click();
    await page.getByRole('button', { name: 'Prêt', exact: true }).click();
    await other.getByRole('button', { name: 'Prêt', exact: true }).click();
    await page.getByRole('button', { name: 'Lancer la partie' }).click();
    await expect(page.locator('.horses-board')).toBeVisible();
    const room = async (p: Page) =>
      roomSchema.parse(
        await p.evaluate(async () => {
          const response = await fetch(`/api/games/${location.pathname.split('/').at(-1)}`);
          return response.json();
        }),
      );
    const initial = await room(page);
    expect(initial.view?.positions).toEqual([
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
    ]);
    for (let step = 0; step < 24; step++) {
      const current = await room(page);
      if (current.view?.positions?.some((positions) => positions.some((value) => value >= 0)))
        break;
      const active =
        current.view?.turn ===
        current.players.find((player) => player.user?.username === `HorseA_${id}`)?.id
          ? page
          : other;
      const roll = active.getByRole('button', { name: 'Lancer le dé', exact: true });
      await expect(roll).toBeEnabled();
      await roll.click();
      await expect.poll(async () => (await room(active)).version).toBeGreaterThan(current.version);
      const rolled = await room(active);
      if (
        rolled.view?.legalActions.some(
          (action) =>
            typeof action === 'object' &&
            action !== null &&
            'type' in action &&
            action.type === 'moveHorse',
        )
      ) {
        await active.locator('.horse-choices button').first().click();
        await expect.poll(async () => (await room(active)).version).toBeGreaterThan(rolled.version);
      }
    }
    const saved = await room(page);
    expect(saved.version).toBeGreaterThan(initial.version);
    await other.reload();
    await expect(other.locator('.horses-board')).toBeVisible();
    expect((await room(other)).view?.positions).toEqual(saved.view?.positions);
    expect((await room(other)).view?.turn).toBe(saved.view?.turn);
    await page.screenshot({ path: `test-results/horses-${info.project.name}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await context.close();
  }
  expect(errors).toEqual([]);
});
