import { z } from 'zod';

const reservedNames = new Set([
  'admin',
  'administrator',
  'moderateur',
  'moderator',
  'support',
  'mimi',
  'root',
  'system',
  'fuck',
  'merde',
  'connard',
  'nazi',
]);
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .refine((value) => !reservedNames.has(value.toLowerCase()), 'USERNAME_RESERVED');
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(8).max(128);
export const avatarIdSchema = z.enum([
  'comet',
  'fox',
  'owl',
  'frog',
  'cat',
  'bear',
  'rabbit',
  'panda',
  'robot',
  'whale',
  'dragon',
  'sun',
]);
export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    username: usernameSchema,
    avatarId: avatarIdSchema.default('comet'),
  })
  .strict();
export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
export const forgotSchema = z.object({ email: emailSchema }).strict();
export const resetSchema = z
  .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema })
  .strict();
export const profileSchema = z
  .object({ username: usernameSchema, avatarId: avatarIdSchema })
  .strict();
export const deleteAccountSchema = z.object({ password: z.string().min(1).max(128) }).strict();
export const languageSchema = z.enum(['fr', 'en']);
export type Language = z.infer<typeof languageSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;

export const publicUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  avatarId: avatarIdSchema,
  createdAt: z.string().datetime(),
  stats: z.array(
    z.object({
      gameType: z.string(),
      gamesPlayed: z.number().int().nonnegative(),
      wins: z.number().int().nonnegative(),
      draws: z.number().int().nonnegative(),
      bestScore: z.number().nullable(),
    }),
  ),
});
export type PublicUser = z.infer<typeof publicUserSchema>;
export const sessionResponseSchema = z.object({
  user: publicUserSchema.nullable(),
  csrfToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export const errorResponseSchema = z.object({ error: z.object({ code: z.string() }) });
