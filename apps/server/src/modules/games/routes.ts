import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createRoomSchema,
  joinRoomSchema,
  roomIdSchema,
  readySchema,
  startSchema,
  roomChangeSchema,
  roomTargetSchema,
  invitationSchema,
  gameActionSchema,
  roomListSchema,
  chatSendSchema,
  chatReportSchema,
  wordPreviewSchema,
  idSchema,
} from '@mimi/shared';
import type { RealtimeHub } from '../../realtime/hub.js';
import type { GamesService } from './service.js';
import { requireSession } from '../auth/session.js';
import { getEngine, engines } from '@mimi/shared/engines';
export function registerGameRoutes(app: FastifyInstance, hub: RealtimeHub, service: GamesService) {
  app.get('/api/catalog', async () => ({
    games: Object.values(engines).map((e) => ({
      id: e.id,
      minPlayers: e.minPlayers,
      maxPlayers: e.maxPlayers,
      defaultOptions: e.defaultOptions,
    })),
  }));
  function register<T>(
    event: string,
    path: string,
    schema: z.ZodType<T>,
    fn: (id: string, input: T) => Promise<unknown>,
  ) {
    app.post(`/api/games/${path}`, async (req) =>
      fn(requireSession(req).userId, schema.parse(req.body)),
    );
    hub.register(event, schema, fn);
  }
  register('lobby:create', 'create', createRoomSchema, (id, b) => service.create(id, b));
  register('lobby:join', 'join', joinRoomSchema, (id, b) => service.join(id, b));
  register('lobby:ready', 'ready', readySchema, (id, b) => service.ready(id, b.gameId, b.ready));
  register('lobby:options', 'options', roomChangeSchema, (id, b) =>
    service.options(id, b.gameId, b.expectedVersion, b.options),
  );
  register('lobby:start', 'start', startSchema, (id, b) =>
    service.start(id, b.gameId, b.expectedVersion),
  );
  register('lobby:leave', 'leave', roomIdSchema, (id, b) => service.leave(id, b.gameId));
  register('lobby:kick', 'kick', roomTargetSchema, (id, b) =>
    service.kick(id, b.gameId, b.targetUserId),
  );
  register('lobby:invite', 'invite', roomTargetSchema, (id, b) =>
    service.invite(id, b.gameId, b.targetUserId),
  );
  register('lobby:invitation:respond', 'invitation/respond', invitationSchema, (id, b) =>
    service.respondInvitation(id, b.invitationId, b.accept),
  );
  register('game:action', 'action', gameActionSchema, (id, b) =>
    service.action(id, b.gameId, b.expectedVersion, b.actionId, b.action),
  );
  register('game:forfeit', 'forfeit', roomIdSchema, (id, b) => service.forfeit(id, b.gameId));
  register('game:rematch', 'rematch', roomIdSchema, (id, b) => service.rematch(id, b.gameId));
  register('chat:send', 'chat', chatSendSchema, (id, b) =>
    service.chat(id, b.gameId, b.clientMessageId, b.content),
  );
  register('chat:report', 'report', chatReportSchema, (id, b) =>
    service.report(id, b.messageId, b.reason),
  );
  hub.register('game:subscribe', roomIdSchema, async (id, b, socket) => {
    const room = await service.view(id, b.gameId);
    if (!room.players.some((p) => p.id === id)) throw Error('NOT_A_PLAYER');
    await socket.join(`game:${b.gameId}`);
    return room;
  });
  hub.register('game:unsubscribe', roomIdSchema, async (_id, b, socket) => {
    await socket.leave(`game:${b.gameId}`);
    return { ok: true };
  });
  hub.register('word:preview', wordPreviewSchema, async (id, b) => {
    const game = await service.row(b.gameId),
      engine = getEngine(game.gameType);
    const view = engine.getPlayerView(game.state, id);
    if (game.gameType !== 'bombe-mots' || view.turn !== id) return { ok: false };
    for (const p of game.players)
      if (p.userId)
        hub.emitUser(p.userId, 'word:preview:updated', {
          gameId: game.id,
          playerId: id,
          text: b.text.normalize('NFKC').replace(/[^\p{L}]/gu, ''),
        });
    return { ok: true };
  });
  app.get('/api/games', async (req) => {
    requireSession(req);
    const input = roomListSchema.parse(req.query);
    return service.publicRooms(input.gameType, input.cursor);
  });
  app.get('/api/games/mine', async (req) => ({
    rooms: await service.mine(requireSession(req).userId),
  }));
  app.get('/api/games/:id', async (req) =>
    service.view(
      requireSession(req).userId,
      z.object({ id: idSchema }).strict().parse(req.params).id,
    ),
  );
  app.get('/api/games/:id/messages', async (req) => ({
    messages: await service.messages(
      requireSession(req).userId,
      z.object({ id: idSchema }).strict().parse(req.params).id,
    ),
  }));
  app.get('/api/leaderboard', async (req) => {
    const input = z
      .object({ gameType: z.string().max(30).default('morpion') })
      .strict()
      .parse(req.query);
    getEngine(input.gameType);
    return { rows: await service.leaderboard(requireSession(req).userId, input.gameType) };
  });
}
