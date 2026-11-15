import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RandomSource } from '@mimi/shared/engine-types';
import type { Environment } from '../config/env.js';
export async function gameKey(env: Environment): Promise<Buffer> {
  if (env.GAME_ENCRYPTION_KEY) return Buffer.from(env.GAME_ENCRYPTION_KEY, 'hex');
  if (env.NODE_ENV === 'production') throw Error('GAME_KEY_REQUIRED');
  const folder = path.resolve('.local');
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, 'game.key');
  try {
    return Buffer.from((await fs.readFile(file, 'utf8')).trim(), 'hex');
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
      throw error;
    const key = randomBytes(32);
    try {
      await fs.writeFile(file, key.toString('hex'), { flag: 'wx', mode: 0o600 });
      return key;
    } catch {
      return Buffer.from((await fs.readFile(file, 'utf8')).trim(), 'hex');
    }
  }
}
export function encryptSeed(key: Buffer) {
  const seed = randomBytes(32),
    iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv),
    encrypted = Buffer.concat([cipher.update(seed), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export class GameRandom implements RandomSource {
  private seed: Buffer;
  constructor(
    key: Buffer,
    encrypted: string,
    public counter = 0,
  ) {
    const bytes = Buffer.from(encrypted, 'base64'),
      decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    this.seed = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
  }
  int(max: number) {
    if (!Number.isInteger(max) || max < 1 || max > 0x100000000) throw Error('RNG_RANGE');
    const limit = Math.floor(0x100000000 / max) * max;
    for (;;) {
      const value = createHmac('sha256', this.seed)
        .update(String(this.counter++))
        .digest()
        .readUInt32BE(0);
      if (value < limit) return value % max;
    }
  }
}
