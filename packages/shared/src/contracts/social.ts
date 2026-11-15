import { z } from 'zod';
export const idSchema = z.string().uuid();
export const buddySchema = z.object({
  id: idSchema,
  username: z.string(),
  avatarId: z.string(),
  createdAt: z.string(),
});
export type Buddy = z.infer<typeof buddySchema>;
export const presenceSchema = z.enum(['offline', 'online', 'playing']);
export type Presence = z.infer<typeof presenceSchema>;
export const searchSchema = z
  .object({
    q: z.string().trim().min(2).max(20),
    cursor: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(20).default(12),
  })
  .strict();
export const targetSchema = z.object({ targetUserId: idSchema }).strict();
export const respondSchema = z.object({ requestId: idSchema, accept: z.boolean() }).strict();
export const requestIdSchema = z.object({ requestId: idSchema }).strict();
export const notificationReadSchema = z.object({ ids: z.array(idSchema).min(1).max(50) }).strict();
export const friendSnapshotSchema = z.object({
  friends: z.array(buddySchema.extend({ presence: presenceSchema })),
  incoming: z.array(z.object({ id: idSchema, user: buddySchema })),
  outgoing: z.array(z.object({ id: idSchema, user: buddySchema })),
  blocked: z.array(buddySchema),
});
export type FriendSnapshot = z.infer<typeof friendSnapshotSchema>;
export const notificationSchema = z.object({
  id: idSchema,
  type: z.enum(['FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'GAME_INVITATION']),
  payload: z
    .object({
      actor: buddySchema.optional(),
      gameId: idSchema.optional(),
      invitationId: idSchema.optional(),
      gameType: z.string().optional(),
    })
    .strict(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;
export const commandSchema = z.object({ requestId: idSchema, payload: z.unknown() }).strict();
