import { errorResponseSchema, sessionResponseSchema } from '@mimi/shared';

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
let csrfToken = '';
export async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_ORIGIN ?? ''}/api${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...options.headers,
      },
    });
    if (!response.ok) {
      const error = errorResponseSchema.safeParse(await response.json());
      throw new ApiError(error.success ? error.data.error.code : 'INTERNAL_ERROR');
    }
    return response.status === 204 ? undefined : await response.json();
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
