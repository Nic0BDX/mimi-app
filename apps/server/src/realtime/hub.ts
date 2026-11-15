import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { commandSchema, type Presence } from '@mimi/shared';
import type { Environment } from '../config/env.js';
import { readSession, hashToken } from '../modules/auth/session.js';
import { ApiError } from '../lib/errors.js';

type Handler = (userId: string, payload: unknown, socket: Socket) => Promise<unknown>;
export function createHub(app: FastifyInstance, db: PrismaClient, env: Environment) {
  const io = new Server(app.server, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
    maxHttpBufferSize: 16_384,
    allowRequest: (req, done) =>
      done(
        null,
        req.headers.origin === env.WEB_ORIGIN ||
          (!req.headers.origin && req.headers['sec-fetch-site'] === 'same-origin'),
      ),
  });
  const connections = new Map<string, Set<string>>(),
    grace = new Map<string, ReturnType<typeof setTimeout>>(),
    handlers = new Map<string, { schema: z.ZodType; handle: Handler }>(),
    rates = new Map<string, { at: number; count: number }>(),
    cache = new Map<string, { at: number; result: unknown }>();
  const connectHooks: ((id: string) => Promise<void>)[] = [],
    disconnectHooks: ((id: string) => Promise<void>)[] = [];
  let closing = false;
  const emitUser = (id: string, event: string, payload: unknown) => {
    io.to(`user:${id}`).emit(event, payload);
  };
  const getPresence = (id: string): Presence =>
    connections.has(id) || grace.has(id) ? 'online' : 'offline';
  const publishedPresence = new Map<string, Presence>();
  async function broadcast(id: string) {
    const relations = await db.friendship.findMany({
      where: { OR: [{ userAId: id }, { userBId: id }] },
    });
    const playing = await db.gamePlayer.findFirst({
      where: { userId: id, leftAt: null, game: { status: 'IN_PROGRESS' } },
    });
    const current = getPresence(id) === 'offline' ? 'offline' : playing ? 'playing' : 'online';
    if (publishedPresence.get(id) === current) return;
    publishedPresence.set(id, current);
    for (const r of relations)
      emitUser(r.userAId === id ? r.userBId : r.userAId, 'presence:changed', {
        userId: id,
        status: current,
      });
  }
  const safe = (work: Promise<unknown>) => {
    void work.catch(() => {
      if (!closing) app.log.error({ code: 'REALTIME_FAILURE' }, 'Realtime operation failed');
    });
  };
  io.use(async (socket, next) => {
    try {
      const auth = z
        .object({ csrfToken: z.string().regex(/^[a-f0-9]{64}$/) })
        .strict()
        .parse(socket.handshake.auth);
      const cookies = app.parseCookie(socket.request.headers.cookie ?? '');
      const session = await readSession(db, { cookies }, env);
      if (!session || hashToken(auth.csrfToken) !== session.csrfTokenHash)
        return next(new Error('AUTH_REQUIRED'));
      socket.data.userId = session.userId;
      socket.data.sessionId = session.id;
      socket.data.cookies = cookies;
      next();
    } catch {
      next(new Error('AUTH_REQUIRED'));
    }
  });
  io.on('connection', (socket) => {
    const id = String(socket.data.userId);
    socket.join(`user:${id}`);
    if (grace.has(id)) {
      clearTimeout(grace.get(id));
      grace.delete(id);
    }
    const set = connections.get(id) ?? new Set<string>();
    set.add(socket.id);
    connections.set(id, set);
    socket.emit('session:ready', { userId: id, serverTime: Date.now(), protocolVersion: 1 });
    safe(broadcast(id));
    for (const hook of connectHooks) safe(hook(id));
    for (const [name, definition] of handlers) {
      socket.on(name, (input: unknown, ack: unknown) => {
        if (typeof ack !== 'function') return;
        const send = ack as (data: unknown) => void;
        safe(
          (async () => {
            let requestId: string | undefined;
            try {
              const session = await readSession(
                db,
                { cookies: socket.data.cookies as Record<string, string> },
                env,
              );
              if (!session || session.id !== socket.data.sessionId) {
                socket.emit('session:expired', {});
                socket.disconnect(true);
                throw new ApiError(401, 'AUTH_REQUIRED');
              }
              const command = commandSchema.parse(input);
              requestId = command.requestId;
              const key = `${id}:${name}:${command.requestId}`,
                prior = cache.get(key);
              if (prior && Date.now() - prior.at < 300_000) {
                send(prior.result);
                return;
              }
              const rate = rates.get(id);
              if (!rate || Date.now() - rate.at > 60_000)
                rates.set(id, { at: Date.now(), count: 1 });
              else if (++rate.count > 120) throw new ApiError(429, 'RATE_LIMITED');
              const value = definition.schema.parse(command.payload),
                data = await definition.handle(id, value, socket);
              const result = { ok: true, requestId, data };
              cache.set(key, { at: Date.now(), result });
              send(result);
            } catch (error) {
              send({
                ok: false,
                requestId,
                error: {
                  code:
                    error instanceof ApiError
                      ? error.code
                      : error instanceof z.ZodError
                        ? 'VALIDATION_ERROR'
                        : 'INTERNAL_ERROR',
                },
              });
            }
          })(),
        );
      });
    }
    socket.on('disconnect', () => {
      const current = connections.get(id);
      current?.delete(socket.id);
      if (current?.size) return;
      connections.delete(id);
      if (closing) return;
      grace.set(
        id,
        setTimeout(() => {
          grace.delete(id);
          safe(db.user.updateMany({ where: { id }, data: { lastSeenAt: new Date() } }));
          safe(broadcast(id));
          for (const hook of disconnectHooks) safe(hook(id));
        }, 3000),
      );
    });
  });
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of cache) if (now - value.at > 300_000) cache.delete(key);
    for (const [key, value] of rates) if (now - value.at > 60_000) rates.delete(key);
    for (const socket of io.sockets.sockets.values())
      safe(
        (async () => {
          if (
            !(await readSession(
              db,
              { cookies: socket.data.cookies as Record<string, string> },
              env,
            ))
          ) {
            socket.emit('session:expired', {});
            socket.disconnect(true);
          }
        })(),
      );
  }, 15_000);
  interval.unref();
  return {
    io,
    emitUser,
    getPresence,
    broadcast,
    register<T>(
      name: string,
      schema: z.ZodType<T>,
      handler: (id: string, payload: T, socket: Socket) => Promise<unknown>,
    ) {
      handlers.set(name, {
        schema,
        handle: (id, payload, socket) => handler(id, payload as T, socket),
      });
    },
    onConnect(hook: (id: string) => Promise<void>) {
      connectHooks.push(hook);
    },
    onOffline(hook: (id: string) => Promise<void>) {
      disconnectHooks.push(hook);
    },
    async close() {
      closing = true;
      clearInterval(interval);
      for (const timer of grace.values()) clearTimeout(timer);
      grace.clear();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
export type RealtimeHub = ReturnType<typeof createHub>;
