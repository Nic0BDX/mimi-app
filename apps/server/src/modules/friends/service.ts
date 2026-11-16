import { Prisma, type PrismaClient } from '@prisma/client';
import { ApiError } from '../../lib/errors.js';
import type { Buddy, Presence } from '@mimi/shared';

export const buddySelect = { id: true, username: true, avatarId: true, createdAt: true } as const;
export function buddy(user: {
  id: string;
  username: string;
  avatarId: string;
  createdAt: Date;
}): Buddy {
  return { ...user, createdAt: user.createdAt.toISOString() };
}
export const pairKey = (a: string, b: string) => [a, b].sort().join(':');
export async function lockUsers(tx: Prisma.TransactionClient, ids: string[]) {
  for (const id of [...new Set(ids)].sort())
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))::text`;
}
export async function blocked(tx: Prisma.TransactionClient | PrismaClient, a: string, b: string) {
  return !!(await tx.block.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  }));
}
export async function areFriends(
  tx: Prisma.TransactionClient | PrismaClient,
  a: string,
  b: string,
) {
  const [userAId, userBId] = [a, b].sort();
  return !!(await tx.friendship.findUnique({
    where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
  }));
}
export type EmitUser = (userId: string, event: string, data: unknown) => void;
export class FriendsService {
  constructor(
    private db: PrismaClient,
    private emit: EmitUser,
    private presence: (id: string) => Presence,
    private polling = false,
  ) {}
  async snapshot(id: string) {
    const [relations, incoming, outgoing, blocks] = await Promise.all([
      this.db.friendship.findMany({
        where: { OR: [{ userAId: id }, { userBId: id }] },
        include: {
          userA: { select: { ...buddySelect, lastSeenAt: true } },
          userB: { select: { ...buddySelect, lastSeenAt: true } },
        },
      }),
      this.db.friendRequest.findMany({
        where: { receiverId: id, status: 'PENDING' },
        include: { sender: { select: buddySelect } },
        orderBy: { createdAt: 'desc' },
      }),
      this.db.friendRequest.findMany({
        where: { senderId: id, status: 'PENDING' },
        include: { receiver: { select: buddySelect } },
        orderBy: { createdAt: 'desc' },
      }),
      this.db.block.findMany({
        where: { blockerId: id },
        include: { blocked: { select: buddySelect } },
      }),
    ]);
    const active = await this.db.gamePlayer.findMany({
      where: {
        userId: { in: relations.map((r) => (r.userAId === id ? r.userBId : r.userAId)) },
        leftAt: null,
        game: { status: 'IN_PROGRESS' },
      },
      select: { userId: true },
    });
    const playing = new Set(active.map((p) => p.userId));
    return {
      friends: relations.map((r) => {
        const user = r.userAId === id ? r.userB : r.userA;
        return {
          ...buddy(user),
          presence: (
            this.polling
              ? !user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > 30_000
              : this.presence(user.id) === 'offline'
          )
            ? 'offline'
            : playing.has(user.id)
              ? 'playing'
              : 'online',
        };
      }),
      incoming: incoming.map((r) => ({ id: r.id, user: buddy(r.sender) })),
      outgoing: outgoing.map((r) => ({ id: r.id, user: buddy(r.receiver) })),
      blocked: blocks.map((b) => buddy(b.blocked)),
    };
  }
  async search(id: string, input: { q: string; cursor?: string | undefined; limit: number }) {
    const users = await this.db.user.findMany({
      where: {
        id: { not: id, ...(input.cursor ? { gt: input.cursor } : {}) },
        usernameKey: { contains: input.q.toLowerCase() },
        blocksMade: { none: { blockedId: id } },
        blocksReceived: { none: { blockerId: id } },
      },
      select: buddySelect,
      orderBy: { id: 'asc' },
      take: input.limit + 1,
    });
    const more = users.length > input.limit,
      items = users.slice(0, input.limit);
    return { users: items.map(buddy), nextCursor: more ? items.at(-1)?.id : null };
  }
  private changed(a: string, b: string) {
    this.emit(a, 'friend:changed', {});
    this.emit(b, 'friend:changed', {});
  }
  private async notify(
    tx: Prisma.TransactionClient,
    userId: string,
    type: 'FRIEND_REQUEST' | 'FRIEND_ACCEPTED',
    actorId: string,
  ) {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId }, select: buddySelect });
    return tx.notification.create({ data: { userId, type, payload: { actor: buddy(actor) } } });
  }
  async request(id: string, target: string) {
    if (id === target) throw new ApiError(400, 'SELF_REQUEST');
    const result = await this.db.$transaction(async (tx) => {
      await lockUsers(tx, [id, target]);
      if (
        !(await tx.user.findUnique({ where: { id: target }, select: { id: true } })) ||
        (await blocked(tx, id, target))
      )
        throw new ApiError(404, 'PLAYER_UNAVAILABLE');
      if (await areFriends(tx, id, target)) return { accepted: true, notification: null };
      const pending = await tx.friendRequest.findFirst({
        where: { pairKey: pairKey(id, target), status: 'PENDING' },
      });
      if (pending?.senderId === id) return { accepted: false, notification: null };
      if (pending) {
        await tx.friendRequest.update({
          where: { id: pending.id },
          data: { status: 'ACCEPTED', respondedAt: new Date() },
        });
        const [userAId, userBId] = [id, target].sort();
        await tx.friendship.create({ data: { userAId: userAId!, userBId: userBId! } });
        return {
          accepted: true,
          notification: await this.notify(tx, target, 'FRIEND_ACCEPTED', id),
        };
      }
      const recent = await tx.friendRequest.count({
        where: { senderId: id, createdAt: { gte: new Date(Date.now() - 3600_000) } },
      });
      if (recent >= 20) throw new ApiError(429, 'RATE_LIMITED');
      await tx.friendRequest.create({
        data: { senderId: id, receiverId: target, pairKey: pairKey(id, target) },
      });
      return { accepted: false, notification: await this.notify(tx, target, 'FRIEND_REQUEST', id) };
    });
    this.changed(id, target);
    if (result.notification) this.emit(target, 'notification:new', {});
    return { accepted: result.accepted };
  }
  async respond(id: string, requestId: string, accept: boolean) {
    const initial = await this.db.friendRequest.findUnique({ where: { id: requestId } });
    if (!initial || initial.receiverId !== id) throw new ApiError(404, 'REQUEST_UNAVAILABLE');
    await this.db.$transaction(async (tx) => {
      await lockUsers(tx, [id, initial.senderId]);
      const request = await tx.friendRequest.findUniqueOrThrow({ where: { id: requestId } });
      if (request.status !== 'PENDING') throw new ApiError(409, 'REQUEST_UNAVAILABLE');
      if (await blocked(tx, id, request.senderId)) throw new ApiError(403, 'PLAYER_UNAVAILABLE');
      await tx.friendRequest.update({
        where: { id: requestId },
        data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() },
      });
      if (accept) {
        const [userAId, userBId] = [id, request.senderId].sort();
        await tx.friendship.upsert({
          where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
          create: { userAId: userAId!, userBId: userBId! },
          update: {},
        });
        await this.notify(tx, request.senderId, 'FRIEND_ACCEPTED', id);
      }
    });
    this.changed(id, initial.senderId);
    if (accept) this.emit(initial.senderId, 'notification:new', {});
    return { ok: true };
  }
  async cancel(id: string, requestId: string) {
    const request = await this.db.friendRequest.findUnique({ where: { id: requestId } });
    if (!request || request.senderId !== id) throw new ApiError(404, 'REQUEST_UNAVAILABLE');
    await this.db.$transaction(async (tx) => {
      await lockUsers(tx, [id, request.receiverId]);
      const result = await tx.friendRequest.updateMany({
        where: { id: requestId, senderId: id, status: 'PENDING' },
        data: { status: 'CANCELED', respondedAt: new Date() },
      });
      if (!result.count) throw new ApiError(409, 'REQUEST_UNAVAILABLE');
    });
    this.changed(id, request.receiverId);
    return { ok: true };
  }
  async remove(id: string, target: string) {
    await this.db.$transaction(async (tx) => {
      await lockUsers(tx, [id, target]);
      await tx.friendship.deleteMany({
        where: {
          OR: [
            { userAId: id, userBId: target },
            { userAId: target, userBId: id },
          ],
        },
      });
    });
    this.changed(id, target);
    return { ok: true };
  }
  async block(id: string, target: string) {
    if (id === target) throw new ApiError(400, 'SELF_REQUEST');
    await this.db.$transaction(async (tx) => {
      await lockUsers(tx, [id, target]);
      if (!(await tx.user.findUnique({ where: { id: target } })))
        throw new ApiError(404, 'PLAYER_UNAVAILABLE');
      await tx.block.upsert({
        where: { blockerId_blockedId: { blockerId: id, blockedId: target } },
        create: { blockerId: id, blockedId: target },
        update: {},
      });
      await tx.friendship.deleteMany({
        where: {
          OR: [
            { userAId: id, userBId: target },
            { userAId: target, userBId: id },
          ],
        },
      });
      await tx.friendRequest.updateMany({
        where: { pairKey: pairKey(id, target), status: 'PENDING' },
        data: { status: 'CANCELED', respondedAt: new Date() },
      });
      await tx.gameInvitation.updateMany({
        where: {
          status: 'PENDING',
          OR: [
            { senderId: id, receiverId: target },
            { senderId: target, receiverId: id },
          ],
        },
        data: { status: 'CANCELED', respondedAt: new Date() },
      });
      await tx.notification.deleteMany({
        where: {
          OR: [
            { userId: id, payload: { path: ['actor', 'id'], equals: target } },
            { userId: target, payload: { path: ['actor', 'id'], equals: id } },
          ],
        },
      });
    });
    this.changed(id, target);
    this.emit(id, 'notification:new', {});
    this.emit(target, 'notification:new', {});
    return { ok: true };
  }
  async unblock(id: string, target: string) {
    await this.db.block.deleteMany({ where: { blockerId: id, blockedId: target } });
    this.changed(id, target);
    return { ok: true };
  }
  async notifications(id: string) {
    const rows = await this.db.notification.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      readAt: r.readAt?.toISOString() ?? null,
      userId: undefined,
    }));
  }
  async read(id: string, ids: string[]) {
    await this.db.notification.updateMany({
      where: { userId: id, id: { in: ids } },
      data: { readAt: new Date() },
    });
    this.emit(id, 'notification:updated', {});
    return { ok: true };
  }
}
