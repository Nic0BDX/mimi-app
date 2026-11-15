import { z } from 'zod';

const boolean = z.enum(['true', 'false']).transform((v) => v === 'true');
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
    DATABASE_URL: z.string().startsWith('postgresql://'),
    COOKIE_SECURE: boolean.default(false),
    TRUST_PROXY: boolean.default(false),
    MAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: boolean.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().optional(),
    GAME_ENCRYPTION_KEY: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/)
      .optional(),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      (!env.COOKIE_SECURE ||
        !env.WEB_ORIGIN.startsWith('https://') ||
        env.MAIL_TRANSPORT !== 'smtp')
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Production requires HTTPS, secure cookies and SMTP.',
      });
    }
    if (env.NODE_ENV === 'production' && !env.GAME_ENCRYPTION_KEY)
      ctx.addIssue({
        code: 'custom',
        message: 'Production requires a persistent GAME_ENCRYPTION_KEY.',
      });
    if (
      env.MAIL_TRANSPORT === 'smtp' &&
      (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.MAIL_FROM)
    ) {
      ctx.addIssue({ code: 'custom', message: 'SMTP configuration is incomplete.' });
    }
  });
export type Environment = z.infer<typeof envSchema>;
