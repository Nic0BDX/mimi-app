import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { Server } from 'socket.io';
import type { Environment } from './config/env.js';
import { ApiError } from './lib/errors.js';
import { readSession, verifyCsrf } from './modules/auth/session.js';
import { registerAccountRoutes } from './modules/auth/routes.js';
import { createMailer, type Mailer } from './services/mailer.js';

export async function buildApp(
  env: Environment,
  dependencies: { db?: PrismaClient; mailer?: Mailer; rateLimit?: boolean; logger?: boolean } = {},
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
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: dependencies.rateLimit === false ? 100_000 : 100,
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

  // Step 1 registers no application events. Authentication and origin checks are
  // installed now; friendship/presence handlers will be implemented in step 2.
  const io = new Server(app.server, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
    maxHttpBufferSize: 16_384,
    allowRequest: (req, callback) => callback(null, req.headers.origin === env.WEB_ORIGIN),
  });
  io.use(async (socket, next) => {
    try {
      const cookies = app.parseCookie(socket.request.headers.cookie ?? '');
      const session = await readSession(db, { cookies }, env);
      if (!session) return next(new Error('AUTH_REQUIRED'));
      socket.data.userId = session.userId;
      next();
    } catch {
      next(new Error('AUTH_REQUIRED'));
    }
  });
  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    if (!dependencies.db) await db.$disconnect();
  });
  return app;
}
