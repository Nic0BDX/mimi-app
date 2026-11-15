import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { isolatedDatabase } from './database.js';
import { FriendsService } from '../src/modules/friends/service.js';
let database: Awaited<ReturnType<typeof isolatedDatabase>>, service: FriendsService;
const emitted: { id: string; event: string }[] = [];
async function user(name: string) {
  return database.db.user.create({
    data: {
      username: name,
      usernameKey: name.toLowerCase(),
      email: `${name.toLowerCase()}@example.test`,
      passwordHash: 'test-only',
    },
  });
}
beforeAll(async () => {
  database = await isolatedDatabase();
  service = new FriendsService(
    database.db,
    (id, event) => emitted.push({ id, event }),
    () => 'online',
  );
});
afterAll(async () => {
  await database?.close();
});
describe('real friendship lifecycle', () => {
  it('searches partial names, paginates and never exposes emails', async () => {
    const a = await user('SearchA');
    await user('SearchB');
    await user('SearchC');
    const page = await service.search(a.id, { q: 'SEARCH', limit: 1 });
    expect(page.users).toHaveLength(1);
    expect(page.users[0]).not.toHaveProperty('email');
    expect(page.nextCursor).toBeTruthy();
    expect(
      (await service.search(a.id, { q: 'search', limit: 1, cursor: page.nextCursor! })).users,
    ).toHaveLength(1);
  });
  it('rejects self requests, deduplicates concurrent requests and autoaccepts inverses', async () => {
    const a = await user('AutoA'),
      b = await user('AutoB');
    await expect(service.request(a.id, a.id)).rejects.toMatchObject({ code: 'SELF_REQUEST' });
    await Promise.all([service.request(a.id, b.id), service.request(a.id, b.id)]);
    expect((await service.snapshot(b.id)).incoming).toHaveLength(1);
    await service.request(b.id, a.id);
    expect((await service.snapshot(a.id)).friends[0]?.id).toBe(b.id);
    expect((await service.snapshot(a.id)).outgoing).toHaveLength(0);
    expect(await database.db.friendship.count()).toBe(1);
    expect(emitted.some((e) => e.id === b.id && e.event === 'notification:new')).toBe(true);
  });
  it('only recipient can respond and sender can cancel', async () => {
    const a = await user('PermA'),
      b = await user('PermB'),
      c = await user('PermC');
    await service.request(a.id, b.id);
    const id = (await service.snapshot(b.id)).incoming[0]!.id;
    await expect(service.respond(a.id, id, true)).rejects.toMatchObject({
      code: 'REQUEST_UNAVAILABLE',
    });
    await expect(service.respond(c.id, id, true)).rejects.toMatchObject({
      code: 'REQUEST_UNAVAILABLE',
    });
    await expect(service.cancel(b.id, id)).rejects.toMatchObject({ code: 'REQUEST_UNAVAILABLE' });
    await service.cancel(a.id, id);
    expect((await service.snapshot(b.id)).incoming).toHaveLength(0);
    await expect(service.respond(b.id, id, true)).rejects.toMatchObject({
      code: 'REQUEST_UNAVAILABLE',
    });
    await service.request(a.id, b.id);
    await service.respond(b.id, (await service.snapshot(b.id)).incoming[0]!.id, false);
    expect((await service.snapshot(a.id)).friends).toHaveLength(0);
  });
  it('accepts, removes, blocks both directions, hides search results and unblocks', async () => {
    const a = await user('BlockA'),
      b = await user('BlockB');
    await service.request(a.id, b.id);
    await service.respond(b.id, (await service.snapshot(b.id)).incoming[0]!.id, true);
    expect((await service.snapshot(a.id)).friends).toHaveLength(1);
    await service.remove(a.id, b.id);
    expect((await service.snapshot(b.id)).friends).toHaveLength(0);
    await service.request(a.id, b.id);
    await service.block(b.id, a.id);
    expect((await service.snapshot(a.id)).outgoing).toHaveLength(0);
    await expect(service.request(a.id, b.id)).rejects.toMatchObject({ code: 'PLAYER_UNAVAILABLE' });
    await expect(service.request(b.id, a.id)).rejects.toMatchObject({ code: 'PLAYER_UNAVAILABLE' });
    expect((await service.search(a.id, { q: 'BlockB', limit: 12 })).users).toEqual([]);
    await service.unblock(b.id, a.id);
    expect((await service.snapshot(a.id)).friends).toEqual([]);
    await service.request(a.id, b.id);
    expect((await service.snapshot(b.id)).incoming).toHaveLength(1);
  });
  it('marks only owned notifications and preserves them across service restart', async () => {
    const a = await user('NotifyA'),
      b = await user('NotifyB');
    await service.request(a.id, b.id);
    const notification = (await service.notifications(b.id))[0]!;
    await service.read(a.id, [notification.id]);
    expect((await service.notifications(b.id))[0]?.readAt).toBeNull();
    await service.read(b.id, [notification.id]);
    const restarted = new FriendsService(
      database.db,
      () => {},
      () => 'offline',
    );
    expect((await restarted.notifications(b.id))[0]?.readAt).not.toBeNull();
  });
  it('limits actual requests to 20 per hour, including canceled requests', async () => {
    const a = await user('LimitA');
    for (let i = 0; i < 20; i++) {
      const b = await user(`LimitB${i}`);
      await service.request(a.id, b.id);
    }
    const extra = await user('LimitExtra');
    await expect(service.request(a.id, extra.id)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
  it('database rejects reverse active duplicate pairs even outside the service', async () => {
    const a = await user('SQLA'),
      b = await user('SQLB');
    await service.request(a.id, b.id);
    await expect(
      database.db.friendRequest.create({
        data: { senderId: b.id, receiverId: a.id, pairKey: [a.id, b.id].sort().join(':') },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
