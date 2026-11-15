import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PrismaClient, Session } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Environment } from '../../config/env.js';
import { ApiError } from '../../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    authSession: Session | null;
  }
}
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const randomToken = () => randomBytes(32).toString('hex');
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function cookieNames(env: Environment) {
  return {
    session: env.COOKIE_SECURE ? '__Host-mimi_session' : 'mimi_session',
    csrf: env.COOKIE_SECURE ? '__Host-mimi_csrf' : 'mimi_csrf',
  };
}
export function cookieOptions(env: Environment) {
  return {
    path: '/',
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7,
  };
}
export async function readSession(
  db: PrismaClient,
  req: Pick<FastifyRequest, 'cookies'>,
  env: Environment,
) {
  const token = req.cookies[cookieNames(env).session];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
  return session && !session.revokedAt && session.expiresAt > new Date() ? session : null;
}
export function requireSession(req: FastifyRequest): Session {
  if (!req.authSession) throw new ApiError(401, 'AUTH_REQUIRED');
  return req.authSession;
}
export function verifyCsrf(req: FastifyRequest, env: Environment) {
  const origin = req.headers.origin;
  const cookie = req.cookies[cookieNames(env).csrf];
  const header = req.headers['x-csrf-token'];
  if (
    origin !== env.WEB_ORIGIN ||
    !cookie ||
    !/^[a-f0-9]{64}$/.test(cookie) ||
    typeof header !== 'string' ||
    !equal(cookie, header)
  )
    throw new ApiError(403, 'CSRF_INVALID');
  if (req.authSession && !equal(hashToken(header), req.authSession.csrfTokenHash))
    throw new ApiError(403, 'CSRF_INVALID');
}
export async function csrfFor(
  db: PrismaClient,
  req: FastifyRequest,
  reply: FastifyReply,
  env: Environment,
) {
  const cookie = req.cookies[cookieNames(env).csrf];
  if (
    cookie &&
    /^[a-f0-9]{64}$/.test(cookie) &&
    (!req.authSession || hashToken(cookie) === req.authSession.csrfTokenHash)
  )
    return cookie;
  const token = randomToken();
  if (req.authSession)
    await db.session.update({
      where: { id: req.authSession.id },
      data: { csrfTokenHash: hashToken(token) },
    });
  reply.setCookie(cookieNames(env).csrf, token, cookieOptions(env));
  return token;
}
export async function createSession(
  db: PrismaClient,
  req: FastifyRequest,
  reply: FastifyReply,
  env: Environment,
  userId: string,
) {
  const token = randomToken(),
    csrfToken = randomToken();
  await db.$transaction(async (tx) => {
    if (req.authSession) await tx.session.deleteMany({ where: { id: req.authSession.id } });
    await tx.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        csrfTokenHash: hashToken(csrfToken),
        expiresAt: new Date(Date.now() + 7 * 86400_000),
      },
    });
    await tx.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
  });
  reply.setCookie(cookieNames(env).session, token, cookieOptions(env));
  reply.setCookie(cookieNames(env).csrf, csrfToken, cookieOptions(env));
  return csrfToken;
}
export function clearSession(reply: FastifyReply, env: Environment) {
  reply.clearCookie(cookieNames(env).session, cookieOptions(env));
  reply.clearCookie(cookieNames(env).csrf, cookieOptions(env));
}
