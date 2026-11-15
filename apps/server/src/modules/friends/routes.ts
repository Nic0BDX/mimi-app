import type { FastifyInstance } from 'fastify';
import {
  searchSchema,
  targetSchema,
  respondSchema,
  requestIdSchema,
  notificationReadSchema,
} from '@mimi/shared';
import { requireSession } from '../auth/session.js';
import type { FriendsService } from './service.js';
export function registerFriendRoutes(app: FastifyInstance, service: FriendsService) {
  app.get('/api/friends', async (req) => service.snapshot(requireSession(req).userId));
  app.get(
    '/api/players',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => service.search(requireSession(req).userId, searchSchema.parse(req.query)),
  );
  app.post(
    '/api/friends/requests',
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (req) =>
      service.request(requireSession(req).userId, targetSchema.parse(req.body).targetUserId),
  );
  app.post('/api/friends/respond', async (req) => {
    const b = respondSchema.parse(req.body);
    return service.respond(requireSession(req).userId, b.requestId, b.accept);
  });
  app.post('/api/friends/cancel', async (req) =>
    service.cancel(requireSession(req).userId, requestIdSchema.parse(req.body).requestId),
  );
  app.post('/api/friends/remove', async (req) =>
    service.remove(requireSession(req).userId, targetSchema.parse(req.body).targetUserId),
  );
  app.post('/api/players/block', async (req) =>
    service.block(requireSession(req).userId, targetSchema.parse(req.body).targetUserId),
  );
  app.post('/api/players/unblock', async (req) =>
    service.unblock(requireSession(req).userId, targetSchema.parse(req.body).targetUserId),
  );
  app.get('/api/notifications', async (req) => ({
    notifications: await service.notifications(requireSession(req).userId),
  }));
  app.post('/api/notifications/read', async (req) =>
    service.read(requireSession(req).userId, notificationReadSchema.parse(req.body).ids),
  );
}
