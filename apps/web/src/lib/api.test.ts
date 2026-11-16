import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, request } from './api';
afterEach(() => vi.unstubAllGlobals());
it('reports a static HTML fallback as an unavailable API', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response('<html>Static page</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    ),
  );
  await expect(request('/auth/session')).rejects.toEqual(new ApiError('API_UNAVAILABLE'));
});
it('preserves the login error returned by the backend', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'INVALID_CREDENTIALS' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  await expect(request('/auth/login')).rejects.toEqual(new ApiError('INVALID_CREDENTIALS'));
});
it('reports a network outage and permits a later retry', async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(
      new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } }),
    );
  vi.stubGlobal('fetch', fetch);
  await expect(request('/auth/session')).rejects.toEqual(new ApiError('NETWORK_ERROR'));
  await expect(request('/auth/session')).resolves.toEqual({ ok: true });
});
