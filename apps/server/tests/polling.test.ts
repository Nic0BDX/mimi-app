import { afterAll, beforeAll, expect, it } from 'vitest';
import supertest from 'supertest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { envSchema } from '../src/config/env.js';
import { isolatedDatabase } from './database.js';
import { roomSchema, type GameType } from '@mimi/shared';
import { wordsFor } from '../../../packages/shared/src/games/bombe-mots/dictionary.js';

const origin = 'http://localhost:5173';
let database: Awaited<ReturnType<typeof isolatedDatabase>>;
let app: Awaited<ReturnType<typeof buildApp>>;
async function startApp() {
  app = await buildApp(
    envSchema.parse({ NODE_ENV: 'test', DATABASE_URL: database.url, WEB_ORIGIN: origin }),
    {
      db: database.db,
      polling: true,
      rateLimit: false,
    },
  );
  await app.ready();
}
beforeAll(async () => {
  database = await isolatedDatabase();
  await startApp();
});
afterAll(async () => {
  await app?.close();
  await database?.close();
});

it.each<GameType>([
  'morpion',
  'puissance-quatre',
  'dames',
  'carte-frenesie',
  'course-ecuries',
  'bombe-mots',
])(
  'plays %s over authenticated HTTP, advances bots and survives a cold restart',
  async (gameType) => {
    const agent = supertest.agent(app.server);
    const initial = await agent.get('/api/auth/session').expect(200);
    let csrf = initial.body.csrfToken as string;
    const name = `Poll_${randomUUID().slice(0, 8)}`;
    const registered = await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({ username: name, email: `${name}@example.test`, password: 'Password-123' })
      .expect(201);
    csrf = registered.body.csrfToken;
    const command = (event: string, payload: unknown) =>
      agent
        .post('/api/realtime/command')
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send({ event, payload });
    const created = await command('lobby:create', {
      gameType,
      maxPlayers: 2,
      isPrivate: true,
      bots: 1,
      options: {},
    });
    expect(created.status).toBe(200);
    let room = roomSchema.parse(created.body);
    const gameId = room.id;
    room = roomSchema.parse((await command('lobby:ready', { gameId, ready: true })).body);
    room = roomSchema.parse(
      (await command('lobby:start', { gameId, expectedVersion: room.version })).body,
    );
    expect(room.status).toBe('IN_PROGRESS');
    const id = registered.body.user.id as string;
    for (let i = 0; i < 8 && room.status === 'IN_PROGRESS'; i++) {
      const version = room.version;
      if (room.view?.turn === id) {
        const action =
          gameType === 'bombe-mots'
            ? {
                type: 'word',
                word: wordsFor(room.view.sequence!).find((w) => !room.view!.usedWords?.includes(w)),
              }
            : room.view!.legalActions[0];
        const result = await command('game:action', {
          gameId,
          expectedVersion: version,
          actionId: randomUUID(),
          action,
        });
        expect(result.status, JSON.stringify(result.body)).toBe(200);
        room = roomSchema.parse(result.body);
      } else {
        await database.db.game.update({
          where: { id: gameId },
          data: { turnDeadlineAt: new Date(Date.now() - 1000) },
        });
        await agent.get('/api/realtime/poll').expect(200);
        room = roomSchema.parse((await agent.get(`/api/games/${gameId}`).expect(200)).body);
      }
      expect(room.version).toBeGreaterThan(version);
    }
    const cookies = registered.headers['set-cookie'] as unknown as string[];
    await app.close();
    await startApp();
    const restored = supertest(app.server);
    const persisted = await restored
      .get(`/api/games/${gameId}`)
      .set('Cookie', cookies.map((c) => c.split(';')[0]!).join('; '))
      .expect(200);
    expect(roomSchema.parse(persisted.body).version).toBe(room.version);
  },
);

it('requires authentication and CSRF for HTTP commands', async () => {
  await supertest(app.server).get('/api/realtime/poll').expect(401);
  await supertest(app.server)
    .post('/api/realtime/command')
    .send({ event: 'lobby:create', payload: {} })
    .expect(403);
});
