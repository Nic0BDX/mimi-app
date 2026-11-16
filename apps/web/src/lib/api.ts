import { errorResponseSchema, sessionResponseSchema } from '@mimi/shared';
import { previewOnly } from './config';

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
let csrfToken = '';
export const getCsrfToken = () => csrfToken;
export async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  if (previewOnly) throw new ApiError('PREVIEW_ONLY');
  try {
    const response = await fetch(`${import.meta.env.VITE_API_ORIGIN ?? ''}/api${path}`, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(10_000),
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...options.headers,
      },
    });
    if (response.status === 204) return undefined;
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw new ApiError('API_UNAVAILABLE');
    const body: unknown = await response.json();
    if (!response.ok) {
      const error = errorResponseSchema.safeParse(body);
      throw new ApiError(error.success ? error.data.error.code : 'INTERNAL_ERROR');
    }
    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('NETWORK_ERROR');
  }
}
export async function session() {
  const data = sessionResponseSchema.parse(await request('/auth/session'));
  csrfToken = data.csrfToken;
  return data.user;
}
export async function authenticate(path: string, body: unknown) {
  const data = sessionResponseSchema.parse(
    await request(path, { method: 'POST', body: JSON.stringify(body) }),
  );
  csrfToken = data.csrfToken;
  return data.user;
}
export function clearCsrf() {
  csrfToken = '';
}
