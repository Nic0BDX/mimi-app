import { describe, expect, it } from 'vitest';
import { registerSchema, usernameSchema, resetSchema } from './auth.js';

describe('account contracts', () => {
  it('normalizes email and trims username without changing its case', () => {
    expect(
      registerSchema.parse({
        email: ' PLAYER@Example.com ',
        username: ' Nicolas ',
        password: 'long-enough',
      }),
    ).toMatchObject({ email: 'player@example.com', username: 'Nicolas', avatarId: 'comet' });
  });
  it.each(['ab', 'a'.repeat(21), 'Admin', '<script>', 'deux mots', 'éclair'])(
    'rejects invalid or reserved username %s',
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    },
  );
  it('rejects unknown fields and short passwords', () => {
    expect(
      registerSchema.safeParse({ email: 'a@b.fr', username: 'Alice', password: '1234567' }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        email: 'a@b.fr',
        username: 'Alice',
        password: '12345678',
        admin: true,
      }).success,
    ).toBe(false);
    expect(resetSchema.safeParse({ token: 'bad', password: '12345678' }).success).toBe(false);
  });
});
