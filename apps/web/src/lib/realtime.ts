import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { getCsrfToken, ApiError } from './api';
import { useAuth } from '../stores/auth';
export const useRealtime = create<{
  connected: boolean;
  revision: number;
  socialRevision: number;
}>()(() => ({
  connected: false,
  revision: 0,
  socialRevision: 0,
}));
let socket: Socket | null = null;
export function connectRealtime() {
  socket = io(import.meta.env.VITE_API_ORIGIN || location.origin, {
    withCredentials: true,
    auth: (done) => done({ csrfToken: getCsrfToken() }),
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  socket.on('connect', () =>
    useRealtime.setState((s) => ({
      connected: true,
      revision: s.revision + 1,
      socialRevision: s.socialRevision + 1,
    })),
  );
  socket.on('disconnect', () => useRealtime.setState({ connected: false }));
  socket.on('session:expired', () => {
    useAuth.getState().setUser(null);
  });
  socket.onAny((event: string) => {
    if (
      ['friend:changed', 'presence:changed', 'notification:new', 'notification:updated'].includes(
        event,
      )
    )
      useRealtime.setState((s) => ({ socialRevision: s.socialRevision + 1 }));
    if (
      [
        'friend:changed',
        'presence:changed',
        'notification:new',
        'notification:updated',
        'lobby:updated',
        'game:view',
        'game:finished',
        'game:player:connection',
        'chat:message',
        'word:preview:updated',
      ].includes(event)
    )
      useRealtime.setState((s) => ({ revision: s.revision + 1 }));
  });
  return () => {
    socket?.disconnect();
    socket = null;
    useRealtime.setState({ connected: false });
  };
}
export async function command<T = unknown>(
  event: string,
  payload: unknown,
  requestId = crypto.randomUUID(),
): Promise<T> {
  if (!socket?.connected) throw new ApiError('NETWORK_ERROR');
  const response: unknown = await socket.timeout(10_000).emitWithAck(event, { requestId, payload });
  if (!response || typeof response !== 'object' || !('ok' in response))
    throw new ApiError('INTERNAL_ERROR');
  if (response.ok !== true) {
    const error = 'error' in response ? response.error : null;
    throw new ApiError(
      error && typeof error === 'object' && 'code' in error ? String(error.code) : 'INTERNAL_ERROR',
    );
  }
  return ('data' in response ? response.data : undefined) as T;
}
