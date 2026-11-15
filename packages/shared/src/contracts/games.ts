import { z } from 'zod';
import { idSchema, buddySchema } from './social.js';
import { gameTypeSchema } from '../engine/types.js';
export const roomOptionsSchema = z
  .object({
    turnSeconds: z.number().int().min(15).max(180).default(60),
    disconnect: z.enum(['bot', 'forfeit']).default('bot'),
    gameOptions: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export const createRoomSchema = z
  .object({
    gameType: gameTypeSchema,
    maxPlayers: z.number().int().min(2).max(12),
    isPrivate: z.boolean().default(true),
    bots: z.number().int().min(0).max(11).default(0),
    options: roomOptionsSchema.default({ turnSeconds: 60, disconnect: 'bot', gameOptions: {} }),
  })
  .strict();
export const joinRoomSchema = z
  .object({
    gameId: idSchema.optional(),
    joinCode: z
      .string()
      .regex(/^[A-Z2-9]{6}$/)
      .optional(),
    invitationId: idSchema.optional(),
  })
  .strict()
  .refine((v) => v.gameId || v.joinCode, 'ROOM_REQUIRED');
export const roomIdSchema = z.object({ gameId: idSchema }).strict();
export const readySchema = roomIdSchema.extend({ ready: z.boolean() }).strict();
export const startSchema = roomIdSchema
  .extend({ expectedVersion: z.number().int().nonnegative() })
  .strict();
export const roomChangeSchema = startSchema.extend({ options: roomOptionsSchema }).strict();
export const roomTargetSchema = roomIdSchema.extend({ targetUserId: idSchema }).strict();
export const invitationSchema = z.object({ invitationId: idSchema, accept: z.boolean() }).strict();
export const gameActionSchema = startSchema
  .extend({ actionId: idSchema, action: z.unknown() })
  .strict();
export const roomListSchema = z
  .object({ gameType: gameTypeSchema.optional(), cursor: idSchema.optional() })
  .strict();
export const chatSendSchema = roomIdSchema
  .extend({ clientMessageId: idSchema, content: z.string().trim().min(1).max(500) })
  .strict();
export const chatReportSchema = z
  .object({ messageId: idSchema, reason: z.enum(['ABUSE', 'SPAM', 'OTHER']) })
  .strict();
export const wordPreviewSchema = roomIdSchema.extend({ text: z.string().max(35) }).strict();
export const roomPlayerSchema = z.object({
  id: z.string(),
  user: buddySchema.nullable(),
  seat: z.number(),
  ready: z.boolean(),
  control: z.enum(['HUMAN', 'BOT', 'FORFEITED']),
  rank: z.number().nullable(),
  score: z.number().nullable(),
  disconnectedAt: z.string().nullable(),
  reconnectDeadlineAt: z.string().nullable(),
});
export const gameViewSchema = z.object({
  kind: gameTypeSchema,
  players: z.array(z.string()),
  turn: z.string().nullable(),
  finished: z.boolean(),
  ranking: z.array(z.string()),
  legalActions: z.array(z.unknown()),
  board: z.array(z.number()).optional(),
  columns: z.number().optional(),
  hand: z.array(z.object({ id: z.string(), color: z.string(), value: z.string() })).optional(),
  counts: z.array(z.number()).optional(),
  top: z.object({ color: z.string(), value: z.string() }).optional(),
  color: z.string().optional(),
  direction: z.number().optional(),
  pendingDraw: z.number().optional(),
  lastCardPlayer: z.string().nullable().optional(),
  positions: z.array(z.array(z.number())).optional(),
  die: z.number().nullable().optional(),
  lives: z.array(z.number()).optional(),
  letters: z.array(z.string()).optional(),
  sequence: z.string().optional(),
  usedWords: z.array(z.string()).optional(),
  round: z.number().optional(),
  scores: z.array(z.number()).optional(),
  notice: z.string().optional(),
  lastMove: z
    .object({ id: z.number(), player: z.number(), horse: z.number(), path: z.array(z.number()) })
    .optional(),
});
export const roomSchema = z.object({
  id: idSchema,
  gameType: gameTypeSchema,
  status: z.enum(['LOBBY', 'IN_PROGRESS', 'FINISHED', 'ABANDONED']),
  hostId: idSchema.nullable(),
  isPrivate: z.boolean(),
  joinCode: z.string().nullable(),
  maxPlayers: z.number(),
  options: roomOptionsSchema,
  version: z.number(),
  players: z.array(roomPlayerSchema),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  turnDeadlineAt: z.string().nullable(),
  view: gameViewSchema.nullable(),
});
export type Room = z.infer<typeof roomSchema>;
export const chatMessageSchema = z.object({
  id: idSchema,
  user: buddySchema.nullable(),
  content: z.string(),
  createdAt: z.string(),
});
