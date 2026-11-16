import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { isolatedDatabase } from './database.js';
import { GamesService } from '../src/modules/games/service.js';
import { FriendsService } from '../src/modules/friends/service.js';
import { GameRandom, encryptSeed } from '../src/services/game-rng.js';
import type { GameType, Room } from '@mimi/shared';
import { wordsFor } from '../../../packages/shared/src/games/bombe-mots/dictionary.js';
let database: Awaited<ReturnType<typeof isolatedDatabase>>, games: GamesService;
const key = Buffer.alloc(32, 7),
  events: { id: string; event: string }[] = [];
const hub = {
  emitUser: (id: string, event: string) => events.push({ id, event }),
  getPresence: () => 'online' as const,
  broadcast: async () => {},
  onConnect: () => {},
  onOffline: () => {},
};
async function user() {
  const name = `User_${randomUUID().slice(0, 8)}`;
  return database.db.user.create({
    data: {
      username: name,
      usernameKey: name.toLowerCase(),
      email: `${name.toLowerCase()}@example.test`,
      passwordHash: 'fixture-only',
    },
  });
}
async function pair(type: GameType = 'morpion') {
  const a = await user(),
    b = await user();
  let room = await games.create(a.id, {
    gameType: type,
    maxPlayers: 2,
    isPrivate: true,
    bots: 0,
    options: {},
  });
  await games.join(b.id, { gameId: room.id, joinCode: room.joinCode! });
  await games.ready(a.id, room.id, true);
  room = await games.ready(b.id, room.id, true);
  room = await games.start(a.id, room.id, room.version);
  return { a, b, room };
}
async function move(room: Room, action: unknown, actionId = randomUUID()) {
  return games.action(room.view!.turn!, room.id, room.version, actionId, action);
}
beforeAll(async () => {
  database = await isolatedDatabase();
  games = new GamesService(database.db, hub, key);
});
afterAll(async () => {
  games?.stop();
  await database?.close();
});
describe('persisted multiplayer infrastructure', () => {
  it('persists dictionary validation and processes word deadlines once after service restart', async () => {
    const { a, b, room } = await pair('bombe-mots');
    expect(new Date(room.turnDeadlineAt!).getTime() - Date.now()).toBeGreaterThan(13_000);
    await expect(move(room, { type: 'word', word: 'zzzzzzzz' })).rejects.toMatchObject({
      code: 'WORD_UNKNOWN',
    });
    expect((await games.view(a.id, room.id)).version).toBe(room.version);
    const word = wordsFor(room.view!.sequence!)[0]!;
    const next = await move(room, { type: 'word', word });
    const restored = new GamesService(database.db, hub, key);
    expect((await restored.view(b.id, room.id)).view?.usedWords).toContain(word);
    const before = next.view!.lives!;
    await database.db.game.update({
      where: { id: room.id },
      data: { turnDeadlineAt: new Date(Date.now() - 1000) },
    });
    await restored.tick();
    const expired = await restored.view(a.id, room.id);
    expect(expired.view?.lives).toEqual([before[0], before[1]! - 1]);
    expect(expired.version).toBe(next.version + 1);
    await restored.tick();
    expect((await restored.view(b.id, room.id)).version).toBe(expired.version);
    restored.stop();
  });
  it('enforces private access, capacity, readiness, host rights and no impersonation', async () => {
    const a = await user(),
      b = await user(),
      c = await user();
    let room = await games.create(a.id, {
      gameType: 'morpion',
      maxPlayers: 2,
      isPrivate: true,
      bots: 0,
      options: {},
    });
    await expect(games.view(c.id, room.id)).rejects.toMatchObject({ code: 'NOT_A_PLAYER' });
    await expect(games.join(b.id, { gameId: room.id })).rejects.toMatchObject({
      code: 'PRIVATE_ROOM',
    });
    await expect(games.join(b.id, { gameId: room.id, joinCode: 'AAAAAA' })).rejects.toMatchObject({
      code: 'PRIVATE_ROOM',
    });
    await expect(games.start(a.id, room.id, room.version)).rejects.toMatchObject({
      code: 'NOT_READY',
    });
    await games.join(b.id, { gameId: room.id, joinCode: room.joinCode! });
    await expect(
      games.join(c.id, { gameId: room.id, joinCode: room.joinCode! }),
    ).rejects.toMatchObject({ code: 'ROOM_FULL' });
    await expect(games.start(b.id, room.id, 1)).rejects.toMatchObject({ code: 'HOST_REQUIRED' });
    await games.ready(a.id, room.id, true);
    room = await games.ready(b.id, room.id, true);
    await expect(games.start(a.id, room.id, 0)).rejects.toMatchObject({ code: 'STALE_STATE' });
    room = await games.start(a.id, room.id, room.version);
    await expect(
      games.action(b.id, room.id, room.version, randomUUID(), { type: 'place', cell: 0 }),
    ).rejects.toMatchObject({ code: 'NOT_YOUR_TURN' });
    await expect(
      games.action(a.id, room.id, room.version, randomUUID(), {
        type: 'place',
        cell: 0,
        playerId: b.id,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('applies each action exactly once, rejects stale state and updates stats once', async () => {
    const { a, b, room: initial } = await pair();
    let room = initial;
    const id = randomUUID();
    room = await move(room, { type: 'place', cell: 0 }, id);
    const duplicate = await games.action(a.id, room.id, initial.version, id, {
      type: 'place',
      cell: 0,
    });
    expect(duplicate.version).toBe(room.version);
    await expect(
      games.action(b.id, room.id, initial.version, randomUUID(), { type: 'place', cell: 1 }),
    ).rejects.toMatchObject({ code: 'STALE_STATE' });
    for (const cell of [3, 1, 4, 2]) room = await move(room, { type: 'place', cell });
    expect(room.status).toBe('FINISHED');
    expect(room.view?.ranking[0]).toBe(a.id);
    expect(
      (
        await database.db.stat.findUniqueOrThrow({
          where: { userId_gameType: { userId: a.id, gameType: 'morpion' } },
        })
      ).wins,
    ).toBe(1);
    expect(await database.db.gameEvent.count({ where: { gameId: room.id } })).toBe(6);
  });
  it('restores exact public state from PostgreSQL with a fresh service instance', async () => {
    const initial = await pair('puissance-quatre'),
      a = initial.a;
    let room = initial.room;
    room = await move(room, { type: 'drop', column: 3 });
    const restarted = new GamesService(database.db, hub, key);
    expect(await restarted.view(a.id, room.id)).toEqual(room);
    expect(JSON.stringify(room)).not.toMatch(/rngSecret|rngCounter|passwordHash|@example/);
  });
  it('transfers host and prevents a kicked player rejoining with the old code', async () => {
    const a = await user(),
      b = await user(),
      c = await user();
    let room = await games.create(a.id, {
      gameType: 'morpion',
      maxPlayers: 2,
      isPrivate: false,
      bots: 0,
      options: {},
    });
    await games.join(b.id, { gameId: room.id });
    await games.kick(a.id, room.id, b.id);
    await expect(
      games.join(b.id, { gameId: room.id, joinCode: room.joinCode! }),
    ).rejects.toMatchObject({ code: 'ROOM_UNAVAILABLE' });
    await games.join(c.id, { gameId: room.id });
    await games.leave(a.id, room.id);
    room = await games.view(c.id, room.id);
    expect(room.hostId).toBe(c.id);
  });
  it('persists targeted invitations and rejects nonfriends and other recipients', async () => {
    const a = await user(),
      b = await user(),
      c = await user(),
      friends = new FriendsService(database.db, hub.emitUser, () => 'online');
    const room = await games.create(a.id, {
      gameType: 'morpion',
      maxPlayers: 2,
      isPrivate: true,
      bots: 0,
      options: {},
    });
    await expect(games.invite(a.id, room.id, b.id)).rejects.toMatchObject({
      code: 'PLAYER_UNAVAILABLE',
    });
    await friends.request(a.id, b.id);
    await friends.request(b.id, a.id);
    await games.invite(a.id, room.id, b.id);
    const invite = await database.db.gameInvitation.findFirstOrThrow({
      where: { gameId: room.id },
    });
    await expect(games.respondInvitation(c.id, invite.id, true)).rejects.toMatchObject({
      code: 'REQUEST_UNAVAILABLE',
    });
    await games.respondInvitation(b.id, invite.id, true);
    expect((await games.view(b.id, room.id)).players).toHaveLength(2);
  });
  it('chat is bounded, deduplicated, filtered, permission checked and reportable', async () => {
    const { a, b, room } = await pair(),
      c = await user(),
      id = randomUUID();
    await games.chat(a.id, room.id, id, 'Salut merde <script>');
    await games.chat(a.id, room.id, id, 'different retry');
    const messages = await games.messages(b.id, room.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('Salut ••• <script>');
    await expect(games.messages(c.id, room.id)).rejects.toMatchObject({ code: 'NOT_A_PLAYER' });
    await games.report(b.id, messages[0]!.id, 'ABUSE');
    expect(await database.db.chatReport.count({ where: { messageId: messages[0]!.id } })).toBe(1);
    for (let i = 0; i < 5; i++) await games.chat(a.id, room.id, randomUUID(), 'Bonjour');
    await expect(games.chat(a.id, room.id, randomUUID(), 'Trop')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
  it('times out on the server, allows 60 seconds to return and replaces expired disconnects', async () => {
    const { a, room } = await pair();
    await database.db.game.update({
      where: { id: room.id },
      data: { turnDeadlineAt: new Date(Date.now() - 1000) },
    });
    await expect(
      games.action(a.id, room.id, room.version, randomUUID(), { type: 'place', cell: 0 }),
    ).rejects.toMatchObject({ code: 'TURN_EXPIRED' });
    await games.tick();
    expect((await games.view(a.id, room.id)).version).toBeGreaterThan(room.version);
    await games.offline(a.id);
    const disconnected = (await games.view(a.id, room.id)).players.find((p) => p.id === a.id)!;
    expect(new Date(disconnected.reconnectDeadlineAt!).getTime() - Date.now()).toBeGreaterThan(
      59_000,
    );
    await games.online(a.id);
    expect(
      (await games.view(a.id, room.id)).players.find((p) => p.id === a.id)?.disconnectedAt,
    ).toBeNull();
    await games.offline(a.id);
    await database.db.gamePlayer.updateMany({
      where: { gameId: room.id, userId: a.id },
      data: { reconnectDeadlineAt: new Date(Date.now() - 1000) },
    });
    await games.tick();
    expect((await games.view(a.id, room.id)).players.find((p) => p.id === a.id)?.control).toBe(
      'BOT',
    );
  });
  it('forfeits and creates a fresh rematch without mutating the finished game', async () => {
    const { a, b, room } = await pair();
    await games.forfeit(a.id, room.id);
    const finished = await games.view(b.id, room.id);
    expect(finished.view?.ranking[0]).toBe(b.id);
    const next = await games.rematch(b.id, room.id);
    expect(next.id).not.toBe(room.id);
    expect(next.status).toBe('LOBBY');
    expect((await games.view(b.id, room.id)).status).toBe('FINISHED');
  });
  it('resumes encrypted seeded RNG without repeating or leaking seed', () => {
    const seed = encryptSeed(key),
      rng = new GameRandom(key, seed);
    const first = Array.from({ length: 20 }, () => rng.int(6));
    const counter = rng.counter,
      next = Array.from({ length: 20 }, () => rng.int(6)),
      restored = new GameRandom(key, seed, counter);
    expect(Array.from({ length: 20 }, () => restored.int(6))).toEqual(next);
    expect(first.every((n) => n >= 0 && n < 6)).toBe(true);
    expect(() => rng.int(0)).toThrow('RNG_RANGE');
  });
});
