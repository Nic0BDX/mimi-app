import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { roomSchema } from '@mimi/shared';
import { wordsFor } from '../../packages/shared/src/games/bombe-mots/dictionary';

async function register(page: Page, username: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo', { exact: true }).fill(username);
  await page.getByLabel('Adresse e-mail').fill(`${username}@example.test`);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Password-123');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL('/');
}

test('two players submit dictionary words, reject invalid words and reconnect', async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const id = randomUUID().slice(0, 6);
  await register(page, `WordsA_${id}`);
  const context = await browser.newContext({ baseURL: 'http://localhost:5173' });
  try {
    const other = await context.newPage();
    other.on('pageerror', (error) => errors.push(error.message));
    await register(other, `WordsB_${id}`);
    await page.goto('/games/new?type=bombe-mots');
    await page.getByRole('button', { name: 'Créer un salon', exact: true }).click();
    const code = await page.locator('.room-code strong').innerText();
    await other.goto('/games/online');
    await other.getByLabel('Code du salon').fill(code);
    await other.getByRole('button', { name: 'Rejoindre', exact: true }).click();
    await page.getByRole('button', { name: 'Prêt', exact: true }).click();
    await other.getByRole('button', { name: 'Prêt', exact: true }).click();
    await page.getByRole('button', { name: 'Lancer la partie' }).click();
    await expect(page.locator('.words-game')).toBeVisible();
    const room = async (p: Page) =>
      roomSchema.parse(
        await p.evaluate(async () =>
          fetch(`/api/games/${location.pathname.split('/').at(-1)}`).then((response) =>
            response.json(),
          ),
        ),
      );
    const initial = await room(page);
    const active =
      initial.view?.turn ===
      initial.players.find((player) => player.user?.username === `WordsA_${id}`)?.id
        ? page
        : other;
    const waiting = active === page ? other : page;
    await expect(waiting.getByLabel('Ton mot', { exact: true })).toBeDisabled();
    await active.getByLabel('Ton mot', { exact: true }).fill('zzzzzzzz');
    await active.getByRole('button', { name: 'Valider', exact: true }).click();
    await expect(active.getByRole('alert')).toContainText(
      'Ce mot ne figure pas dans le dictionnaire.',
    );
    expect((await room(active)).version).toBe(initial.version);
    const word = wordsFor(initial.view!.sequence!)[0]!;
    await active.getByLabel('Ton mot', { exact: true }).fill(word);
    await active.getByRole('button', { name: 'Valider', exact: true }).click();
    await expect.poll(async () => (await room(waiting)).view?.usedWords).toContain(word);
    await expect(waiting.getByLabel('Ton mot', { exact: true })).toBeEnabled();
    await waiting.reload();
    await expect(waiting.locator('.words-game')).toBeVisible();
    expect((await room(waiting)).view?.usedWords).toContain(word);
    await page.screenshot({ path: `test-results/words-${info.project.name}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await context.close();
  }
  expect(errors).toEqual([]);
});
