import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import type { Environment } from './config/env.js';
import { isAllowedWebOrigin } from './config/web-origin.js';
import { ApiError } from './lib/errors.js';
import { readSession, verifyCsrf, requireSession } from './modules/auth/session.js';
import { registerAccountRoutes } from './modules/auth/routes.js';
import { createMailer, type Mailer } from './services/mailer.js';
import { createHub } from './realtime/hub.js';
import { FriendsService } from './modules/friends/service.js';
import { registerFriendRoutes } from './modules/friends/routes.js';
import { GamesService } from './modules/games/service.js';
import { registerGameRoutes } from './modules/games/routes.js';
import { gameKey } from './services/game-rng.js';
import { targetSchema, respondSchema, requestIdSchema, notificationReadSchema } from '@mimi/shared';

export async function buildApp(
  env: Environment,
  dependencies: {
    db?: PrismaClient;
    mailer?: Mailer;
    rateLimit?: boolean;
    logger?: boolean;
    accountsOnly?: boolean;
    polling?: boolean;
  } = {},
) {
  const db = dependencies.db ?? new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  const app = Fastify({
    bodyLimit: 16_384,
    trustProxy: env.TRUST_PROXY,
    logger: dependencies.logger ?? env.NODE_ENV !== 'test',
    logController: new LogController({ disableRequestLogging: true }),
  });
  await app.register(helmet);
  await app.register(cors, {
    origin: (origin, done) => done(null, isAllowedWebOrigin(origin, env)),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: dependencies.rateLimit === false ? 100_000 : 300,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({ statusCode: 429, error: { code: 'RATE_LIMITED' } }),
    ...(dependencies.rateLimit === false ? { allowList: () => true } : {}),
  });
  app.decorateRequest('authSession', null);
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return;
    req.authSession = await readSession(db, req, env);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) verifyCsrf(req, env);
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR' } });
    if (error instanceof ApiError)
      return reply.code(error.status).send({ error: { code: error.code } });
    if (
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    )
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.statusCode === 429 ? 'RATE_LIMITED' : 'BAD_REQUEST' } });
    // Never serialize request bodies, cookies, reset tokens, SQL details or passwords.
    req.log.error({ requestId: req.id, code: 'INTERNAL_ERROR' }, 'Request failed');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR' } });
  });
  app.get('/api/health', async () => {
    await db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  });
  await registerAccountRoutes(app, db, env, dependencies.mailer ?? createMailer(env));

  if (dependencies.accountsOnly) {
    app.addHook('onClose', async () => {
      if (!dependencies.db) await db.$disconnect();
    });
    return app;
  }

  const hub = createHub(app, db, env);
  const friends = new FriendsService(db, hub.emitUser, hub.getPresence, dependencies.polling);
  registerFriendRoutes(app, friends);
  const games = new GamesService(db, hub, await gameKey(env));
  registerGameRoutes(app, hub, games);
  if (dependencies.polling) {
    app.get('/api/realtime/poll', async (req) => {
      const id = requireSession(req).userId;
      await db.user.update({ where: { id }, data: { lastSeenAt: new Date() } });
      await games.online(id);
      await games.tick(id);
      return { ok: true };
    });
  } else {
    await games.recover();
    games.run();
  }
  hub.register('friend:request', targetSchema, (id, b) => friends.request(id, b.targetUserId));
  hub.register('friend:respond', respondSchema, (id, b) =>
    friends.respond(id, b.requestId, b.accept),
  );
  hub.register('friend:cancel', requestIdSchema, (id, b) => friends.cancel(id, b.requestId));
  hub.register('friend:remove', targetSchema, (id, b) => friends.remove(id, b.targetUserId));
  hub.register('user:block', targetSchema, (id, b) => friends.block(id, b.targetUserId));
  hub.register('user:unblock', targetSchema, (id, b) => friends.unblock(id, b.targetUserId));
  hub.register('notification:read', notificationReadSchema, (id, b) => friends.read(id, b.ids));
  app.addHook('preClose', async () => {
    games.stop();
    await hub.close();
  });
  app.addHook('onClose', async () => {
    if (!dependencies.db) await db.$disconnect();
  });
  return app;
}
