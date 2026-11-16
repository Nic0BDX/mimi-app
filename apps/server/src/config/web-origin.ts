import type { Environment } from './env.js';

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
export function isAllowedWebOrigin(
  origin: string | undefined,
  env: Pick<Environment, 'WEB_ORIGIN' | 'NODE_ENV'>,
) {
  if (origin === env.WEB_ORIGIN) return true;
  if (!origin || env.NODE_ENV === 'production') return false;
  try {
    const configured = new URL(env.WEB_ORIGIN),
      candidate = new URL(origin);
    return (
      candidate.origin === origin &&
      loopbackHosts.has(configured.hostname) &&
      loopbackHosts.has(candidate.hostname) &&
      candidate.port === configured.port &&
      candidate.protocol === configured.protocol
    );
  } catch {
    return false;
  }
}
