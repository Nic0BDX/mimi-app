import { describe, expect, it } from 'vitest';
import { isAllowedWebOrigin } from '../src/config/web-origin.js';
const dev = { NODE_ENV: 'development' as const, WEB_ORIGIN: 'http://localhost:5173' };
describe('local connection origins', () => {
  it('accepts loopback aliases on the configured protocol and port', () => {
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173'])
      expect(isAllowedWebOrigin(origin, dev)).toBe(true);
  });
  it('rejects missing, malformed, remote, different-port and lookalike origins', () => {
    for (const origin of [
      undefined,
      'invalid',
      'null',
      'https://localhost:5173',
      'http://localhost:5174',
      'http://localhost.evil.invalid:5173',
      'http://127.0.0.2:5173',
      'http://localhost:5173/',
    ])
      expect(isAllowedWebOrigin(origin, dev)).toBe(false);
  });
  it('keeps production restricted to the exact configured origin', () => {
    const production = { ...dev, NODE_ENV: 'production' as const };
    expect(isAllowedWebOrigin(dev.WEB_ORIGIN, production)).toBe(true);
    expect(isAllowedWebOrigin('http://127.0.0.1:5173', production)).toBe(false);
    expect(
      isAllowedWebOrigin('http://127.0.0.1:5173', { ...dev, WEB_ORIGIN: 'https://nimimi.example' }),
    ).toBe(false);
  });
});
