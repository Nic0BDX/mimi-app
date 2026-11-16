import { describe, expect, it } from 'vitest';
import { envSchema } from '../src/config/env.js';
import { cookieNames, cookieOptions } from '../src/modules/auth/session.js';

const base = { DATABASE_URL: 'postgresql://test:test@localhost/mimi_test' };
describe('production security configuration', () => {
  it('uses real boolean defaults and local httpOnly cookies', () => {
    const env = envSchema.parse(base);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.TRUST_PROXY).toBe(false);
    expect(cookieOptions(env)).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
  });
  it('refuses unsafe production settings', () => {
    expect(envSchema.safeParse({ ...base, NODE_ENV: 'production' }).success).toBe(false);
    expect(
      envSchema.safeParse({
        ...base,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'true',
        WEB_ORIGIN: 'https://app.example.org',
      }).success,
    ).toBe(false);
  });
  it('requires complete SMTP and secure host-prefixed cookies in production', () => {
    const env = envSchema.parse({
      ...base,
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://app.example.org',
      COOKIE_SECURE: 'true',
      MAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'smtp.example.org',
      SMTP_USER: 'test',
      SMTP_PASSWORD: 'test-only',
      MAIL_FROM: 'hello@example.org',
      GAME_ENCRYPTION_KEY: 'a'.repeat(64),
    });
    expect(cookieNames(env)).toEqual({ session: '__Host-mimi_session', csrf: '__Host-mimi_csrf' });
    expect(cookieOptions(env)).toMatchObject({ httpOnly: true, secure: true, path: '/' });
  });
  it('supports explicit disabled email without allowing console mail in production', () => {
    const secure = {
      ...base,
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://app.example.org',
      COOKIE_SECURE: 'true',
      GAME_ENCRYPTION_KEY: 'a'.repeat(64),
    };
    expect(envSchema.safeParse({ ...secure, MAIL_TRANSPORT: 'disabled' }).success).toBe(true);
    expect(envSchema.safeParse({ ...secure, MAIL_TRANSPORT: 'console' }).success).toBe(false);
    expect(
      envSchema.safeParse({ ...secure, MAIL_TRANSPORT: 'disabled', COOKIE_SECURE: 'false' })
        .success,
    ).toBe(false);
  });
});
