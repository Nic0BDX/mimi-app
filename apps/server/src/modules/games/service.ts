import { randomInt, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { getEngine } from '@mimi/shared/engines';
import { roomOptionsSchema, type CoreState, type Room, type GameType } from '@mimi/shared';
import type { RealtimeHub } from '../../realtime/hub.js';
import { ApiError } from '../../lib/errors.js';
import { buddy, buddySelect, blocked, areFriends, lockUsers } from '../friends/service.js';
import { GameRandom, encryptSeed } from '../../services/game-rng.js';

const include = {
  players: { include: { user: { select: buddySelect } }, orderBy: { seat: 'asc' as const } },
};
type GameRow = Prisma.GameGetPayload<{ include: typeof include }>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const playerId = (gameId: string, p: { userId: string | null; seat: number }) =>
  p.userId ?? `bot:${gameId}:${p.seat}`;
async function lockGame(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Game" WHERE "id"=${id}::uuid FOR UPDATE`;
}
export class GamesService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  constructor(
    private db: PrismaClient,
    private hub: Pick<
      RealtimeHub,
      'emitUser' | 'getPresence' | 'broadcast' | 'onConnect' | 'onOffline'
    >,
    private key: Buffer,
    private onError: () => void = () => console.error('GAME_TICK_FAILED'),
  ) {}
  async row(id: string, tx: Prisma.TransactionClient | PrismaClient = this.db) {
    const game = await tx.game.findUnique({ where: { id }, include });
    if (!game) throw new ApiError(404, 'ROOM_UNAVAILABLE');
    return game;
  }
  private member(game: GameRow, id: string) {
    const member = game.players.find((p) => p.userId === id && p.leftAt === null);
    if (!member) throw new ApiError(403, 'NOT_A_PLAYER');
    return member;
  }
  async view(id: string, gameId: string): Promise<Room> {
    const game = await this.row(gameId),
      member = game.players.some((p) => p.userId === id && p.leftAt === null);
    if (!member && (game.isPrivate || game.status !== 'LOBBY'))
      throw new ApiError(403, 'NOT_A_PLAYER');
    const options = roomOptionsSchema.parse(game.options),
      engine = getEngine(game.gameType);
    return {
      id: game.id,
      gameType: game.gameType as GameType,
      status: game.status,
      hostId: game.hostId,
      isPrivate: game.isPrivate,
      joinCode: member ? game.joinCode : null,
      maxPlayers: game.maxPlayers,
      options,
      version: game.version,
      players: game.players
        .filter((p) => p.leftAt === null)
        .map((p) => ({
          id: playerId(game.id, p),
          user: p.user ? buddy(p.user) : null,
          seat: p.seat,
          ready: p.isReady,
          control: p.control,
          rank: p.rank,
          score: p.score,
          disconnectedAt: p.disconnectedAt?.toISOString() ?? null,
          reconnectDeadlineAt: p.reconnectDeadlineAt?.toISOString() ?? null,
        })),
      createdAt: game.createdAt.toISOString(),
      startedAt: game.startedAt?.toISOString() ?? null,
      finishedAt: game.finishedAt?.toISOString() ?? null,
      turnDeadlineAt: game.turnDeadlineAt?.toISOString() ?? null,
      view: member && game.state ? engine.getPlayerView(game.state, id) : null,
    };
  }
  async publish(gameId: string, event = 'lobby:updated') {
    const game = await this.row(gameId);
    for (const p of game.players)
      if (p.userId) {
        this.hub.emitUser(p.userId, event, { gameId, version: game.version });
        await this.hub.broadcast(p.userId);
      }
  }
  async create(
    id: string,
    input: {
      gameType: GameType;
      maxPlayers: number;
      isPrivate: boolean;
      bots: number;
      options: Prisma.InputJsonValue | unknown;
    },
  ) {
    const engine = getEngine(input.gameType),
      options = roomOptionsSchema.parse(input.options);
    options.gameOptions = json(engine.parseOptions(options.gameOptions)) as Record<string, unknown>;
    if (
      input.maxPlayers < engine.minPlayers ||
      input.maxPlayers > engine.maxPlayers ||
      input.bots >= input.maxPlayers
    )
      throw new ApiError(400, 'PLAYER_COUNT');
    const result = await this.db.$transaction(async (tx) => {
      await lockUsers(tx, [id]);
      if (
        await tx.gamePlayer.findFirst({
          where: { userId: id, leftAt: null, control: 'HUMAN', game: { status: 'IN_PROGRESS' } },
        })
      )
        throw new ApiError(409, 'ALREADY_PLAYING');
      if (
        (await tx.game.count({
          where: { hostId: id, createdAt: { gte: new Date(Date.now() - 3600_000) } },
        })) >= 20
      )
        throw new ApiError(429, 'RATE_LIMITED');
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
        joinCode = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
      return tx.game.create({
        data: {
          gameType: input.gameType,
          hostId: id,
          isPrivate: input.isPrivate,
          maxPlayers: input.maxPlayers,
          joinCode,
          options: json(options),
          rngSecretEncrypted: encryptSeed(this.key),
          players: {
            create: [
              { userId: id, seat: 0 },
              ...Array.from({ length: input.bots }, (_, i) => ({
                seat: i + 1,
                isReady: true,
                control: 'BOT' as const,
              })),
            ],
          },
        },
      });
    });
    return this.view(id, result.id);
  }
  async join(
    id: string,
    input: {
      gameId?: string | undefined;
      joinCode?: string | undefined;
      invitationId?: string | undefined;
    },
  ) {
    const initial = input.gameId
      ? await this.row(input.gameId)
      : await this.db.game.findUnique({ where: { joinCode: input.joinCode! }, include });
    if (!initial) throw new ApiError(404, 'ROOM_UNAVAILABLE');
    await this.db.$transaction(async (tx) => {
      await lockUsers(tx, [id]);
      await lockGame(tx, initial.id);
      const game = await this.row(initial.id, tx);
      if (game.players.some((p) => p.userId === id && p.leftAt === null)) return;
      if (game.status !== 'LOBBY' || game.kickedUserIds.includes(id))
        throw new ApiError(409, 'ROOM_UNAVAILABLE');
      if (game.hostId && (await blocked(tx, id, game.hostId)))
        throw new ApiError(403, 'PLAYER_UNAVAILABLE');
      for (const p of game.players)
        if (p.userId && (await blocked(tx, id, p.userId)))
          throw new ApiError(403, 'PLAYER_UNAVAILABLE');
      if (game.isPrivate && input.joinCode !== game.joinCode) {
        const invite = input.invitationId
          ? await tx.gameInvitation.findFirst({
              where: {
                id: input.invitationId,
                receiverId: id,
                gameId: game.id,
                status: 'PENDING',
                expiresAt: { gt: new Date() },
              },
            })
          : null;
        if (!invite || (await blocked(tx, id, invite.senderId)))
          throw new ApiError(403, 'PRIVATE_ROOM');
        await tx.gameInvitation.update({
          where: { id: invite.id },
          data: { status: 'ACCEPTED', respondedAt: new Date() },
        });
      }
      if (game.players.length >= game.maxPlayers) throw new ApiError(409, 'ROOM_FULL');
      if (
        await tx.gamePlayer.findFirst({
          where: { userId: id, leftAt: null, control: 'HUMAN', game: { status: 'IN_PROGRESS' } },
        })
      )
        throw new ApiError(409, 'ALREADY_PLAYING');
      let seat = 0;
      while (game.players.some((p) => p.seat === seat)) seat++;
      await tx.gamePlayer.create({ data: { gameId: game.id, userId: id, seat } });
      await tx.game.update({ where: { id: game.id }, data: { version: { increment: 1 } } });
    });
    await this.publish(initial.id);
    return this.view(id, initial.id);
  }
  async ready(id: string, gameId: string, ready: boolean) {
    await this.db.$transaction(async (tx) => {
      await lockGame(tx, gameId);
      const game = await this.row(gameId, tx);
      this.member(game, id);
      if (game.status !== 'LOBBY') throw new ApiError(409, 'ROOM_UNAVAILABLE');
      await tx.gamePlayer.update({
        where: { gameId_seat: { gameId, seat: this.member(game, id).seat } },
        data: { isReady: ready },
      });
      await tx.game.update({ where: { id: gameId }, data: { version: { increment: 1 } } });
    });
    await this.publish(gameId);
    return this.view(id, gameId);
  }
  async options(id: string, gameId: string, version: number, raw: unknown) {
    const options = roomOptionsSchema.parse(raw);
    await this.db.$transaction(async (tx) => {
      await lockGame(tx, gameId);
      const game = await this.row(gameId, tx);
      if (game.hostId !== id || game.status !== 'LOBBY') throw new ApiError(403, 'HOST_REQUIRED');
      if (game.version !== version) throw new ApiError(409, 'STALE_STATE');
      options.gameOptions = json(
        getEngine(game.gameType).parseOptions(options.gameOptions),
      ) as Record<string, unknown>;
      await tx.game.update({
        where: { id: gameId },
        data: { options: json(options), version: { increment: 1 } },
      });
      await tx.gamePlayer.updateMany({
        where: { gameId, control: 'HUMAN' },
        data: { isReady: false },
      });
    });
    await this.publish(gameId);
    return this.view(id, gameId);
  }
  async start(id: string, gameId: string, version: number) {
    await this.db.$transaction(async (tx) => {
      await lockGame(tx, gameId);
      const game = await this.row(gameId, tx),
        engine = getEngine(game.gameType);
      if (game.hostId !== id || game.status !== 'LOBBY') throw new ApiError(403, 'HOST_REQUIRED');
      if (game.version !== version) throw new ApiError(409, 'STALE_STATE');
      if (game.players.length < engine.minPlayers || game.players.some((p) => !p.isReady))
        throw new ApiError(409, 'NOT_READY');
      const options = roomOptionsSchema.parse(game.options),
        rng = new GameRandom(this.key, game.rngSecretEncrypted, game.rngCounter),
        state = engine.createInitialState(
          game.players.map((p) => playerId(gameId, p)),
          options.gameOptions,
          rng,
        ),
        seconds = engine.getTurnSeconds(state) ?? options.turnSeconds;
      await tx.game.update({
        where: { id: gameId },
        data: {
          status: 'IN_PROGRESS',
          state: json(state),
          startedAt: new Date(),
          turnDeadlineAt: new Date(Date.now() + seconds * 1000),
          rngCounter: rng.counter,
          version: { increment: 1 },
        },
      });
      await tx.gameEvent.create({
        data: {
          gameId,
          sequence: game.version + 1,
          playerId: id,
          actionId: randomUUID(),
          action: { type: 'start' },
          versionBefore: game.version,
          versionAfter: game.version + 1,
          rngCounterBefore: game.rngCounter,
          rngCounterAfter: rng.counter,
        },
      });
    });
    await this.publish(gameId, 'game:view');
    return this.view(id, gameId);
  }
  private async finish(tx: Prisma.TransactionClient, game: GameRow, state: CoreState) {
    const result = getEngine(game.gameType).getStatus(state);
    if (result.status !== 'finished') return;
    const view = getEngine(game.gameType).getPlayerView(state, state.players[0]!);
    const ranked = !game.players.some((p) => p.control === 'BOT');
    for (const p of game.players) {
      const pid = playerId(game.id, p),
        rank = result.ranking.includes(pid) ? result.ranking.indexOf(pid) + 1 : null,
        score = view.scores?.[state.players.indexOf(pid)] ?? null;
      await tx.gamePlayer.update({
        where: { gameId_seat: { gameId: game.id, seat: p.seat } },
        data: { rank, score, reconnectDeadlineAt: null },
      });
      if (p.userId) {
        const win = ranked && rank === 1 ? 1 : 0;
        const old = await tx.stat.findUnique({
          where: { userId_gameType: { userId: p.userId, gameType: game.gameType } },
        });
        await tx.stat.upsert({
          where: { userId_gameType: { userId: p.userId, gameType: game.gameType } },
          create: {
            userId: p.userId,
            gameType: game.gameType,
            gamesPlayed: 1,
            wins: win,
            draws: result.draw ? 1 : 0,
            bestScore: score,
          },
          update: {
            gamesPlayed: { increment: 1 },
            wins: { increment: win },
            draws: { increment: result.draw ? 1 : 0 },
            ...(score === null ? {} : { bestScore: Math.max(old?.bestScore ?? score, score) }),
          },
        });
      }
    }
  }
  async action(
    id: string,
    gameId: string,
    version: number,
    actionId: string,
    action: unknown,
    automatic = false,
  ) {
    await this.db.$transaction(async (tx) => {
      await lockGame(tx, gameId);
      const game = await this.row(gameId, tx),
        member = this.member(game, id),
        engine = getEngine(game.gameType);
      const prior = await tx.gameEvent.findUnique({
        where: { gameId_actionId: { gameId, actionId } },
      });
      if (prior) {
        if (prior.playerId !== id) throw new ApiError(409, 'ACTION_CONFLICT');
        return;
      }
      if (game.status !== 'IN_PROGRESS') throw new ApiError(409, 'ROOM_UNAVAILABLE');
      if (game.version !== version) throw new ApiError(409, 'STALE_STATE');
      if (!automatic && (member.control !== 'HUMAN' || member.disconnectedAt))
        throw new ApiError(403, 'NOT_A_PLAYER');
      if (!automatic && game.turnDeadlineAt && game.turnDeadlineAt <= new Date())
        throw new ApiError(409, 'TURN_EXPIRED');
      const rng = new GameRandom(this.key, game.rngSecretEncrypted, game.rngCounter),
        result = engine.applyAction(game.state, id, action, rng);
      if (!result.ok) throw new ApiError(400, result.code);
      const finished = engine.getStatus(result.state).status === 'finished',
        options = roomOptionsSchema.parse(game.options);
      if (finished) await this.finish(tx, game, result.state);
      await tx.game.update({
        where: { id: gameId },
        data: {
          state: json(result.state),
          version: { increment: 1 },
          rngCounter: rng.counter,
          status: finished ? 'FINISHED' : 'IN_PROGRESS',
          finishedAt: finished ? new Date() : null,
          turnDeadlineAt: finished
            ? null
            : new Date(
                Date.now() + (engine.getTurnSeconds(result.state) ?? options.turnSeconds) * 1000,
              ),
        },
      });
      await tx.gameEvent.create({
        data: {
          gameId,
          sequence: game.version + 1,
          playerId: id,
          actionId,
          action: json(action),
          versionBefore: game.version,
          versionAfter: game.version + 1,
          rngCounterBefore: game.rngCounter,
          rngCounterAfter: rng.counter,
        },
      });
    });
    await this.publish(gameId, 'game:view');
    const current = await this.row(gameId);
    if (current.status === 'FINISHED') await this.publish(gameId, 'game:finished');
    return this.view(id, gameId);
  }
  private async automatic(game: GameRow, id: string, action: unknown) {
    const bot = game.players.find((p) => playerId(game.id, p) === id);
    if (!bot) return;
    await this.db.$transaction(async (tx) => {
      await lockGame(tx, game.id);
      const current = await this.row(game.id, tx);
      if (current.version !== game.version || current.status !== 'IN_PROGRESS') return;
      const engine = getEngine(current.gameType),
        rng = new GameRandom(this.key, current.rngSecretEncrypted, current.rngCounter),
        selected = action ?? engine.bot(current.state, id, rng);
      if (selected === null) return;
      const result = engine.applyAction(current.state, id, selected, rng);
      if (!result.ok) throw new ApiError(400, result.code);
      const finished = engine.getStatus(result.state).status === 'finished';
      if (finished) await this.finish(tx, current, result.state);
      await tx.game.update({
        where: { id: current.id },
        data: {
          state: json(result.state),
          version: { increment: 1 },
          rngCounter: rng.counter,
          status: finished ? 'FINISHED' : 'IN_PROGRESS',
          finishedAt: finished ? new Date() : null,
          turnDeadlineAt: finished
            ? null
            : new Date(
                Date.now() +
                  (engine.getTurnSeconds(result.state) ??
                    roomOptionsSchema.parse(current.options).turnSeconds) *
                    1000,
              ),
        },
      });
      await tx.gameEvent.create({
        data: {
          gameId: current.id,
          sequence: current.version + 1,
          playerId: bot.userId,
          actionId: randomUUID(),
          action: json({ ...Object(selected), automatic: true }),
          versionBefore: current.version,
          versionAfter: current.version + 1,
          rngCounterBefore: current.rngCounter,
          rngCounterAfter: rng.counter,
        },
      });
    });
    await this.publish(game.id, 'game:view');
  }
  async leave(id: string, gameId: string) {
    const initial = await this.row(gameId);
    if (initial.status === 'IN_PROGRESS') return this.forfeit(id, gameId);
    await this.db.$transaction(async (tx) => {
      await lockGame(tx, gameId);
      const game = await this.row(gameId, tx);
      const member = this.member(game, id);
      if (game.status !== 'LOBBY') throw new ApiError(409, 'ROOM_UNAVAILABLE');
      await tx.gamePlayer.delete({ where: { gameId_seat: { gameId, seat: member.seat } } });
      const next = game.players.find((p) => p.userId !== id && p.userId);
      await tx.game.update({
        where: { id: gameId },
        data: {
          hostId: game.hostId === id ? (next?.userId ?? null) : game.hostId,
          status: next || game.hostId !== id ? 'LOBBY' : 'ABANDONED',
          version: { increment: 1 },
        },
      });
    });
    this.hub.emitUser(id, 'lobby:removed', { gameId });
    await this.publish(gameId);
    return { ok: true };
  }
  async kick(id: string, gameId: string, target: string) {
    if (id === target) throw new ApiError(400, 'ILLEGAL_ACTION');
    await this.db.$transaction(async (tx) => {
      await lockGame(tx, gameId);
      const game = await this.row(gameId, tx);
      if (game.hostId !== id || game.status !== 'LOBBY') throw new ApiError(403, 'HOST_REQUIRED');
      const member = this.member(game, target);
      await tx.gamePlayer.delete({ where: { gameId_seat: { gameId, seat: member.seat } } });
      await tx.game.update({
        where: { id: gameId },
        data: { kickedUserIds: { push: target }, version: { increment: 1 } },
      });
    });
    this.hub.emitUser(target, 'lobby:removed', { gameId });
    await this.publish(gameId);
    return { ok: true };
  }
  async invite(id: string, gameId: string, target: string) {
    await this.db.$transaction(async (tx) => {
      await lockUsers(tx, [id, target]);
      const game = await this.row(gameId, tx);
      this.member(game, id);
      if (
        game.status !== 'LOBBY' ||
        !(await areFriends(tx, id, target)) ||
        (await blocked(tx, id, target)) ||
        game.kickedUserIds.includes(target)
      )
        throw new ApiError(403, 'PLAYER_UNAVAILABLE');
      const duplicate = await tx.gameInvitation.findFirst({
        where: {
          gameId,
          senderId: id,
          receiverId: target,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
      });
      if (duplicate) return;
      const recent = await tx.gameInvitation.count({
        where: { senderId: id, createdAt: { gte: new Date(Date.now() - 3600_000) } },
      });
      if (recent >= 30) throw new ApiError(429, 'RATE_LIMITED');
      const invitation = await tx.gameInvitation.create({
        data: {
          gameId,
          senderId: id,
          receiverId: target,
          expiresAt: new Date(Date.now() + 900_000),
        },
      });
      const actor = await tx.user.findUniqueOrThrow({ where: { id }, select: buddySelect });
      await tx.notification.create({
        data: {
          userId: target,
          type: 'GAME_INVITATION',
          payload: {
            actor: buddy(actor),
            gameId,
            invitationId: invitation.id,
            gameType: game.gameType,
          },
        },
      });
    });
    this.hub.emitUser(target, 'notification:new', {});
    return { ok: true };
  }
  async respondInvitation(id: string, invitationId: string, accept: boolean) {
    const invitation = await this.db.gameInvitation.findFirst({
      where: { id: invitationId, receiverId: id, status: 'PENDING', expiresAt: { gt: new Date() } },
    });
    if (!invitation) throw new ApiError(404, 'REQUEST_UNAVAILABLE');
    if (accept) return this.join(id, { gameId: invitation.gameId, invitationId });
    await this.db.gameInvitation.updateMany({
      where: { id: invitationId, receiverId: id, status: 'PENDING' },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    return { ok: true };
  }
  async forfeit(id: string, gameId: string) {
    await this.db.$transaction(async (tx) => {
      await lockGame(tx, gameId);
      const game = await this.row(gameId, tx);
      this.member(game, id);
      if (game.status !== 'IN_PROGRESS') throw new ApiError(409, 'ROOM_UNAVAILABLE');
      if (this.member(game, id).control === 'FORFEITED') return;
      const rng = new GameRandom(this.key, game.rngSecretEncrypted, game.rngCounter),
        engine = getEngine(game.gameType),
        next = engine.forfeit(game.state, id, rng);
      if (next.finished) await this.finish(tx, game, next);
      await tx.gamePlayer.updateMany({
        where: { gameId, userId: id },
        data: { control: 'FORFEITED' },
      });
      await tx.game.update({
        where: { id: gameId },
        data: {
          status: next.finished ? 'FINISHED' : 'IN_PROGRESS',
          state: json(next),
          finishedAt: next.finished ? new Date() : null,
          turnDeadlineAt: next.finished
            ? null
            : new Date(
                Date.now() +
                  (engine.getTurnSeconds(next) ??
                    roomOptionsSchema.parse(game.options).turnSeconds) *
                    1000,
              ),
          rngCounter: rng.counter,
          version: { increment: 1 },
        },
      });
      await tx.gameEvent.create({
        data: {
          gameId,
          sequence: game.version + 1,
          playerId: id,
          actionId: randomUUID(),
          action: { type: 'forfeit' },
          versionBefore: game.version,
          versionAfter: game.version + 1,
          rngCounterBefore: game.rngCounter,
          rngCounterAfter: rng.counter,
        },
      });
    });
    await this.publish(
      gameId,
      (await this.row(gameId)).status === 'FINISHED' ? 'game:finished' : 'game:view',
    );
    return { ok: true };
  }
  async rematch(id: string, gameId: string) {
    const game = await this.row(gameId);
    this.member(game, id);
    if (game.status !== 'FINISHED') throw new ApiError(409, 'ROOM_UNAVAILABLE');
    const room = await this.create(id, {
      gameType: game.gameType as GameType,
      maxPlayers: game.maxPlayers,
      isPrivate: game.isPrivate,
      bots: game.players.filter((p) => !p.userId).length,
      options: game.options,
    });
    for (const p of game.players)
      if (
        p.userId &&
        p.userId !== id &&
        (await areFriends(this.db, id, p.userId)) &&
        !(await blocked(this.db, id, p.userId))
      )
        await this.invite(id, room.id, p.userId);
    return room;
  }
  async publicRooms(gameType?: string, cursor?: string) {
    const games = await this.db.game.findMany({
      where: {
        status: 'LOBBY',
        isPrivate: false,
        ...(gameType ? { gameType } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      include,
      orderBy: { id: 'asc' },
      take: 13,
    });
    return {
      rooms: games.slice(0, 12).map((g) => ({
        id: g.id,
        gameType: g.gameType,
        maxPlayers: g.maxPlayers,
        count: g.players.length,
        host: g.players.find((p) => p.userId === g.hostId)?.user
          ? buddy(g.players.find((p) => p.userId === g.hostId)!.user!)
          : null,
      })),
      nextCursor: games.length > 12 ? games[11]!.id : null,
    };
  }
  async mine(id: string) {
    const games = await this.db.game.findMany({
      where: { players: { some: { userId: id, leftAt: null } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true },
    });
    return Promise.all(games.map((g) => this.view(id, g.id)));
  }
  async leaderboard(id: string, type: string) {
    const friends = await this.db.friendship.findMany({
        where: { OR: [{ userAId: id }, { userBId: id }] },
      }),
      ids = [id, ...friends.map((f) => (f.userAId === id ? f.userBId : f.userAId))];
    const rows = await this.db.stat.findMany({
      where: { userId: { in: ids }, gameType: type },
      include: { user: { select: buddySelect } },
      orderBy: [{ wins: 'desc' }, { gamesPlayed: 'asc' }],
      take: 100,
    });
    return rows.map((s) => ({
      user: buddy(s.user),
      gamesPlayed: s.gamesPlayed,
      wins: s.wins,
      draws: s.draws,
      bestScore: s.bestScore,
    }));
  }
  async messages(id: string, gameId: string) {
    const game = await this.row(gameId);
    this.member(game, id);
    const blocks = await this.db.block.findMany({
        where: { OR: [{ blockerId: id }, { blockedId: id }] },
      }),
      hidden = blocks.map((b) => (b.blockerId === id ? b.blockedId : b.blockerId));
    const rows = await this.db.chatMessage.findMany({
      where: { gameId, OR: [{ userId: null }, { userId: { notIn: hidden } }] },
      include: { user: { select: buddySelect } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.reverse().map((m) => ({
      id: m.id,
      user: m.user ? buddy(m.user) : null,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));
  }
  async chat(id: string, gameId: string, messageId: string, content: string) {
    await this.db.$transaction(async (tx) => {
      await lockUsers(tx, [id]);
      this.member(await this.row(gameId, tx), id);
      const previous = await tx.chatMessage.findUnique({
        where: { gameId_clientMessageId: { gameId, clientMessageId: messageId } },
      });
      if (previous) {
        if (previous.userId !== id) throw new ApiError(409, 'ACTION_CONFLICT');
        return;
      }
      if (
        (await tx.chatMessage.count({
          where: { userId: id, createdAt: { gte: new Date(Date.now() - 10_000) } },
        })) >= 6
      )
        throw new ApiError(429, 'RATE_LIMITED');
      const cleaned = content
        .normalize('NFKC')
        .replace(/[\p{Cc}\p{Cf}]/gu, '')
        .trim()
        .replace(/\b(merde|connard|connasse|putain|salope|fuck|shit)\b/gi, '•••');
      if (!cleaned || cleaned.length > 500) throw new ApiError(400, 'VALIDATION_ERROR');
      await tx.chatMessage.create({
        data: { gameId, userId: id, clientMessageId: messageId, content: cleaned },
      });
    });
    for (const p of (await this.row(gameId)).players)
      if (p.userId) this.hub.emitUser(p.userId, 'chat:message', { gameId });
    return { ok: true };
  }
  async report(id: string, messageId: string, reason: 'ABUSE' | 'SPAM' | 'OTHER') {
    const message = await this.db.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new ApiError(404, 'ROOM_UNAVAILABLE');
    this.member(await this.row(message.gameId), id);
    await this.db.chatReport.upsert({
      where: { messageId_reporterId: { messageId, reporterId: id } },
      create: { messageId, reporterId: id, reason },
      update: { reason },
    });
    return { ok: true };
  }
  async online(id: string) {
    const players = await this.db.gamePlayer.findMany({
      where: { userId: id, control: 'HUMAN', leftAt: null, game: { status: 'IN_PROGRESS' } },
    });
    await this.db.gamePlayer.updateMany({
      where: { userId: id, control: 'HUMAN' },
      data: { disconnectedAt: null, reconnectDeadlineAt: null },
    });
    for (const p of players) await this.publish(p.gameId, 'game:player:connection');
  }
  async offline(id: string) {
    const players = await this.db.gamePlayer.findMany({
      where: { userId: id, control: 'HUMAN', leftAt: null, game: { status: 'IN_PROGRESS' } },
    });
    for (const p of players) {
      await this.db.gamePlayer.update({
        where: { gameId_seat: { gameId: p.gameId, seat: p.seat } },
        data: { disconnectedAt: new Date(), reconnectDeadlineAt: new Date(Date.now() + 60_000) },
      });
      await this.publish(p.gameId, 'game:player:connection');
    }
  }
  async recover() {
    const rows = await this.db.gamePlayer.findMany({
      where: { control: 'HUMAN', leftAt: null, game: { status: 'IN_PROGRESS' } },
    });
    for (const p of rows)
      if (p.userId && this.hub.getPresence(p.userId) === 'offline')
        await this.db.gamePlayer.update({
          where: { gameId_seat: { gameId: p.gameId, seat: p.seat } },
          data: {
            disconnectedAt: p.disconnectedAt ?? new Date(),
            reconnectDeadlineAt: p.reconnectDeadlineAt ?? new Date(Date.now() + 60_000),
          },
        });
  }
  async tick(userId?: string) {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const rows = await this.db.game.findMany({
        where: {
          status: 'IN_PROGRESS',
          ...(userId ? { players: { some: { userId, leftAt: null } } } : {}),
        },
        include,
        take: 100,
      });
      for (const game of rows) {
        for (const p of game.players)
          if (
            p.userId &&
            p.control === 'HUMAN' &&
            p.reconnectDeadlineAt &&
            p.reconnectDeadlineAt <= new Date()
          ) {
            if (roomOptionsSchema.parse(game.options).disconnect === 'forfeit') {
              await this.forfeit(p.userId, game.id);
              continue;
            }
            await this.db.gamePlayer.updateMany({
              where: {
                gameId: game.id,
                seat: p.seat,
                control: 'HUMAN',
                reconnectDeadlineAt: { lte: new Date() },
              },
              data: { control: 'BOT', reconnectDeadlineAt: null },
            });
          }
        const current = await this.row(game.id);
        if (current.status !== 'IN_PROGRESS') continue;
        const state = getEngine(current.gameType).parseState(current.state),
          id = state.players[state.turn]!,
          player = current.players.find((p) => playerId(current.id, p) === id);
        if (!player) continue;
        const expired = !!current.turnDeadlineAt && current.turnDeadlineAt <= new Date();
        if (
          player.control === 'BOT' &&
          Date.now() -
            (current.turnDeadlineAt?.getTime() ?? Date.now()) +
            (getEngine(current.gameType).getTurnSeconds(state) ??
              roomOptionsSchema.parse(current.options).turnSeconds) *
              1000 >
            650
        )
          await this.automatic(current, id, null);
        else if (expired && !player.disconnectedAt) {
          const action = getEngine(current.gameType).onTimeout(state, id);
          if (action !== null) await this.automatic(current, id, action);
        }
      }
    } finally {
      this.ticking = false;
    }
  }
  run() {
    this.interval = setInterval(() => {
      void this.tick().catch(this.onError);
    }, 500);
    this.interval.unref();
    this.hub.onConnect((id) => this.online(id));
    this.hub.onOffline((id) => this.offline(id));
  }
  stop() {
    if (this.interval) clearInterval(this.interval);
  }
}
