import type { PrismaClient } from '@prisma/client';
import { publicUserSchema } from '@mimi/shared';
import { ApiError } from '../../lib/errors.js';

export async function publicProfile(db: PrismaClient, id: string) {
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      avatarId: true,
      createdAt: true,
      stats: {
        select: { gameType: true, gamesPlayed: true, wins: true, draws: true, bestScore: true },
      },
    },
  });
  if (!user) throw new ApiError(401, 'AUTH_REQUIRED');
  return publicUserSchema.parse({ ...user, createdAt: user.createdAt.toISOString() });
}
