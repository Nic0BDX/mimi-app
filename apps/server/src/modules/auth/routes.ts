import * as argon2 from 'argon2';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import {
  registerSchema,
  loginSchema,
  forgotSchema,
  resetSchema,
  profileSchema,
  deleteAccountSchema,
} from '@mimi/shared';
import type { Environment } from '../../config/env.js';
import type { Mailer } from '../../services/mailer.js';
import { ApiError } from '../../lib/errors.js';
import {
  csrfFor,
  createSession,
  clearSession,
  requireSession,
  hashToken,
  randomToken,
} from './session.js';
import { publicProfile } from '../users/projection.js';

const passwordOptions = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };
export async function registerAccountRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  env: Environment,
  mailer: Mailer,
) {
  const dummyHash = await argon2.hash(randomToken(), passwordOptions);
  app.get('/api/auth/session', async (req, reply) => ({
    user: req.authSession ? await publicProfile(db, req.authSession.userId) : null,
    csrfToken: await csrfFor(db, req, reply, env),
  }));

  app.post(
    '/api/auth/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const input = registerSchema.parse(req.body);
      const passwordHash = await argon2.hash(input.password, passwordOptions);
      let user;
      try {
        user = await db.user.create({
          data: {
            email: input.email,
            username: input.username,
            usernameKey: input.username.toLowerCase(),
            avatarId: input.avatarId,
            passwordHash,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ApiError(409, 'REGISTRATION_UNAVAILABLE');
        throw error;
      }
      const csrfToken = await createSession(db, req, reply, env, user.id);
      return reply.code(201).send({ user: await publicProfile(db, user.id), csrfToken });
    },
  );
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const input = loginSchema.parse(req.body);
      const user = await db.user.findUnique({ where: { email: input.email } });
      const valid = await argon2.verify(user?.passwordHash ?? dummyHash, input.password);
      if (!user || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS');
      const csrfToken = await createSession(db, req, reply, env, user.id);
      return { user: await publicProfile(db, user.id), csrfToken };
    },
  );
  app.post('/api/auth/logout', async (req, reply) => {
    if (req.authSession) await db.session.deleteMany({ where: { id: req.authSession.id } });
    clearSession(reply, env);
    return reply.code(204).send();
  });
  app.post(
    '/api/auth/forgot-password',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const input = forgotSchema.parse(req.body);
      if (env.MAIL_TRANSPORT === 'disabled') throw new ApiError(503, 'MAIL_UNAVAILABLE');
      const user = await db.user.findUnique({ where: { email: input.email } });
      if (user) {
        const token = randomToken();
        await db.$transaction([
          db.passwordResetToken.deleteMany({ where: { userId: user.id } }),
          db.passwordResetToken.create({
            data: {
              userId: user.id,
              tokenHash: hashToken(token),
              expiresAt: new Date(Date.now() + 30 * 60_000),
            },
          }),
        ]);
        const url = new URL('/reset-password', env.WEB_ORIGIN);
        // Fragment avoids token leakage through access logs and Referer headers.
        url.hash = `token=${token}`;
        setImmediate(() => {
          void mailer
            .sendPasswordReset(user.email, url.href)
            .catch(() =>
              app.log.error({ code: 'MAIL_DELIVERY_FAILED' }, 'Password reset delivery failed'),
            );
        });
      }
      return reply.code(202).send({ accepted: true });
    },
  );
  app.post(
    '/api/auth/reset-password',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const input = resetSchema.parse(req.body);
      const token = await db.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(input.token) },
      });
      if (!token || token.usedAt || token.expiresAt <= new Date())
        throw new ApiError(400, 'RESET_INVALID');
      const passwordHash = await argon2.hash(input.password, passwordOptions);
      await db.$transaction(async (tx) => {
        const claim = await tx.passwordResetToken.updateMany({
          where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (claim.count !== 1) throw new ApiError(400, 'RESET_INVALID');
        await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
        await tx.session.deleteMany({ where: { userId: token.userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId: token.userId } });
      });
      clearSession(reply, env);
      return reply.code(204).send();
    },
  );
  app.patch(
    '/api/me',
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (req) => {
      const session = requireSession(req),
        input = profileSchema.parse(req.body);
      try {
        await db.user.update({
          where: { id: session.userId },
          data: { ...input, usernameKey: input.username.toLowerCase() },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ApiError(409, 'USERNAME_UNAVAILABLE');
        throw error;
      }
      return { user: await publicProfile(db, session.userId) };
    },
  );
  app.delete(
    '/api/me',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const session = requireSession(req),
        input = deleteAccountSchema.parse(req.body);
      const user = await db.user.findUniqueOrThrow({ where: { id: session.userId } });
      if (!(await argon2.verify(user.passwordHash, input.password)))
        throw new ApiError(401, 'INVALID_CREDENTIALS');
      await db.$transaction(async (tx) => {
        await tx.chatMessage.deleteMany({ where: { userId: user.id } });
        await tx.notification.deleteMany({
          where: { payload: { path: ['actor', 'id'], equals: user.id } },
        });
        await tx.gameEvent.updateMany({
          where: { playerId: user.id },
          data: { action: { type: 'redacted' } },
        });
        await tx.user.delete({ where: { id: user.id } });
      });
      clearSession(reply, env);
      return reply.code(204).send();
    },
  );
}
