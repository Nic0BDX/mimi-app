import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../src/app.js';
import { envSchema } from '../src/config/env.js';
import { isolatedDatabase } from './database.js';

const origin = 'http://localhost:5173';
let database: Awaited<ReturnType<typeof isolatedDatabase>>;
let app: Awaited<ReturnType<typeof buildApp>>;
const mails: { email: string; url: string }[] = [];
const env = (url: string) =>
  envSchema.parse({ NODE_ENV: 'test', DATABASE_URL: url, WEB_ORIGIN: origin });
function client() {
  const agent = supertest.agent(app.server);
  let csrf = '';
  return {
    agent,
    async init() {
      const response = await agent.get('/api/auth/session').expect(200);
      csrf = response.body.csrfToken;
      return response;
    },
    async write(method: 'post' | 'patch' | 'delete', path: string, body?: object) {
      const result = await agent[method](path)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send(body ?? {});
      if (typeof result.body.csrfToken === 'string') csrf = result.body.csrfToken;
      return result;
    },
  };
}
async function registered(username: string, email = `${username.toLowerCase()}@example.test`) {
  const user = client();
  await user.init();
  const response = await user.write('post', '/api/auth/register', {
    email,
    username,
    password: 'Password-123',
    avatarId: 'fox',
  });
  expect(response.status).toBe(201);
  return { ...user, id: response.body.user.id as string, response };
}
beforeAll(async () => {
  database = await isolatedDatabase();
  app = await buildApp(env(database.url), {
    db: database.db,
    rateLimit: false,
    mailer: {
      async sendPasswordReset(email, url) {
        mails.push({ email, url });
      },
    },
  });
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await database?.close();
});

describe('real PostgreSQL account lifecycle', () => {
  it('creates an account, hashes password, returns only public fields and httpOnly cookies', async () => {
    const user = await registered('Nicolas', 'NICOLAS@example.test');
    const stored = await database.db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.email).toBe('nicolas@example.test');
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.response.body.user).not.toHaveProperty('email');
    expect(user.response.body.user).not.toHaveProperty('passwordHash');
    expect(user.response.body.user.stats).toEqual([]);
    expect(String(user.response.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(user.response.headers['set-cookie'])).toContain('SameSite=Lax');
    const session = await user.agent.get('/api/auth/session').expect(200);
    expect(session.body.user.id).toBe(user.id);
    expect(session.headers['cache-control']).toBe('no-store');
    expect(session.headers['x-content-type-options']).toBe('nosniff');
    const rawCookie = /mimi_session=([a-f0-9]+)/.exec(
      String(user.response.headers['set-cookie']),
    )?.[1];
    expect(rawCookie).toHaveLength(64);
    const row = await database.db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.tokenHash).not.toBe(rawCookie);
  });
  it('rejects case-insensitive duplicate emails and usernames with the same generic error', async () => {
    const user = client();
    await user.init();
    const a = await user.write('post', '/api/auth/register', {
      email: 'nicolas@EXAMPLE.test',
      username: 'Different',
      password: 'Password-123',
    });
    const b = await user.write('post', '/api/auth/register', {
      email: 'different@example.test',
      username: 'nIcOlAs',
      password: 'Password-123',
    });
    expect(a.status).toBe(409);
    expect(b.status).toBe(409);
    expect(a.body).toEqual(b.body);
  });
  it.each([
    { username: 'admin', password: 'Password-123' },
    { username: 'ab', password: 'Password-123' },
    { username: '<script>alert(1)</script>', password: 'Password-123' },
    { username: 'ValidName', password: 'short' },
    { username: 'ValidName', password: 'Password-123', role: 'admin' },
  ])('validates register input %#', async (input) => {
    const user = client();
    await user.init();
    expect(
      (await user.write('post', '/api/auth/register', { email: 'invalid@example.test', ...input }))
        .status,
    ).toBe(400);
  });
  it('prevents CSRF, missing origin and untrusted origins', async () => {
    const user = client();
    await user.init();
    for (const headers of [
      { Origin: origin },
      { Origin: 'https://attacker.invalid', 'X-CSRF-Token': 'a'.repeat(64) },
      { 'X-CSRF-Token': 'a'.repeat(64) },
    ]) {
      const response = await user.agent
        .post('/api/auth/login')
        .set(headers)
        .send({ email: 'nicolas@example.test', password: 'Password-123' });
      expect(response.status).toBe(403);
    }
    const cors = await user.agent
      .get('/api/auth/session')
      .set('Origin', 'https://attacker.invalid');
    expect(cors.headers['access-control-allow-origin']).not.toBe('https://attacker.invalid');
  });
  it('uses the same login error for unknown email and incorrect password', async () => {
    const user = client();
    await user.init();
    const a = await user.write('post', '/api/auth/login', {
      email: 'unknown@example.test',
      password: 'incorrect',
    });
    const b = await user.write('post', '/api/auth/login', {
      email: 'nicolas@example.test',
      password: 'incorrect',
    });
    expect(a.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });
  it('updates username/avatar without losing identity or another session', async () => {
    const user = await registered('Alice');
    const second = client();
    await second.init();
    expect(
      (
        await second.write('post', '/api/auth/login', {
          email: 'alice@example.test',
          password: 'Password-123',
        })
      ).status,
    ).toBe(200);
    const update = await user.write('patch', '/api/me', { username: 'Alice_2', avatarId: 'owl' });
    expect(update.status).toBe(200);
    expect(update.body.user.id).toBe(user.id);
    expect((await second.init()).body.user).toMatchObject({
      id: user.id,
      username: 'Alice_2',
      avatarId: 'owl',
    });
    expect(
      (await user.write('patch', '/api/me', { username: 'Alice_2', avatarId: 'evil-path' })).status,
    ).toBe(400);
    expect(
      (await user.write('patch', '/api/me', { username: 'nicolas', avatarId: 'owl' })).status,
    ).toBe(409);
  });
  it('cannot edit without authentication or target another user', async () => {
    const user = client();
    await user.init();
    expect(
      (await user.write('patch', '/api/me', { username: 'Nobody', avatarId: 'fox' })).status,
    ).toBe(401);
    const own = await registered('Ownership');
    expect(
      (
        await own.write('patch', '/api/me', {
          username: 'Nobody',
          avatarId: 'fox',
          userId: 'other',
        })
      ).status,
    ).toBe(400);
  });
  it('logout invalidates the server-side session and expired sessions cannot authenticate', async () => {
    const user = await registered('Logout');
    expect((await user.write('post', '/api/auth/logout')).status).toBe(204);
    expect((await user.init()).body.user).toBeNull();
    expect(await database.db.session.count({ where: { userId: user.id } })).toBe(0);
    const expired = await registered('Expired');
    await database.db.session.updateMany({
      where: { userId: expired.id },
      data: { expiresAt: new Date(0) },
    });
    expect((await expired.init()).body.user).toBeNull();
  });
  it('recovers a persisted session after an application restart', async () => {
    const user = await registered('Restart');
    const cookies = user.response.headers['set-cookie'];
    const header = (Array.isArray(cookies) ? cookies : [String(cookies)])
      .map((c) => c.split(';')[0])
      .join('; ');
    const restarted = await buildApp(env(database.url), { db: database.db, rateLimit: false });
    await restarted.ready();
    try {
      const response = await supertest(restarted.server)
        .get('/api/auth/session')
        .set('Cookie', header)
        .expect(200);
      expect(response.body.user.id).toBe(user.id);
    } finally {
      await restarted.close();
    }
  });
  it('resets password once, hashes tokens and revokes all existing sessions', async () => {
    const user = await registered('Reset');
    const publicClient = client();
    await publicClient.init();
    const unknown = await publicClient.write('post', '/api/auth/forgot-password', {
      email: 'absent@example.test',
    });
    const known = await publicClient.write('post', '/api/auth/forgot-password', {
      email: 'reset@example.test',
    });
    expect(known.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    await new Promise((resolve) => setImmediate(resolve));
    const mail = mails.find((m) => m.email === 'reset@example.test');
    expect(mail).toBeDefined();
    const token = new URLSearchParams(new URL(mail!.url).hash.slice(1)).get('token')!;
    expect(
      (await database.db.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } }))
        .tokenHash,
    ).not.toBe(token);
    const result = await publicClient.write('post', '/api/auth/reset-password', {
      token,
      password: 'Changed-456',
    });
    expect(result.status).toBe(204);
    expect((await user.init()).body.user).toBeNull();
    await publicClient.init();
    expect(
      (
        await publicClient.write('post', '/api/auth/reset-password', {
          token,
          password: 'Other-456',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await publicClient.write('post', '/api/auth/login', {
          email: 'reset@example.test',
          password: 'Password-123',
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await publicClient.write('post', '/api/auth/login', {
          email: 'reset@example.test',
          password: 'Changed-456',
        })
      ).status,
    ).toBe(200);
  });
  it('rejects expired recovery links', async () => {
    const user = await registered('OldToken');
    await user.write('post', '/api/auth/forgot-password', { email: 'oldtoken@example.test' });
    await new Promise((resolve) => setImmediate(resolve));
    const token = new URLSearchParams(
      new URL(mails.find((m) => m.email === 'oldtoken@example.test')!.url).hash.slice(1),
    ).get('token')!;
    await database.db.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(0) },
    });
    expect(
      (await user.write('post', '/api/auth/reset-password', { token, password: 'Changed-456' }))
        .status,
    ).toBe(400);
  });
  it('deletes personal data, related records and every session without affecting other users', async () => {
    const user = await registered('DeleteMe'),
      other = await registered('KeepMe');
    await database.db.stat.create({ data: { userId: user.id, gameType: 'morpion' } });
    await database.db.friendRequest.create({
      data: {
        senderId: user.id,
        receiverId: other.id,
        pairKey: [user.id, other.id].sort().join(':'),
      },
    });
    expect((await user.write('delete', '/api/me', { password: 'incorrect' })).status).toBe(401);
    expect((await user.write('delete', '/api/me', { password: 'Password-123' })).status).toBe(204);
    expect(await database.db.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await database.db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await database.db.stat.count({ where: { userId: user.id } })).toBe(0);
    expect(await database.db.friendRequest.count({ where: { senderId: user.id } })).toBe(0);
    expect((await other.init()).body.user.id).toBe(other.id);
    expect((await user.init()).body.user).toBeNull();
  });
  it('applies rate limits on authentication', async () => {
    const limited = await buildApp(env(database.url), { db: database.db });
    await limited.ready();
    try {
      const agent = supertest.agent(limited.server);
      const initial = await agent.get('/api/auth/session');
      let status = 0;
      for (let i = 0; i < 11; i++)
        status = (
          await agent
            .post('/api/auth/login')
            .set('Origin', origin)
            .set('X-CSRF-Token', initial.body.csrfToken)
            .send({ email: 'unknown@example.test', password: 'incorrect' })
        ).status;
      expect(status).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
