import { create } from 'zustand';
import type { PublicUser } from '@mimi/shared';
import { session, ApiError } from '../lib/api';

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  setUser: (user: PublicUser | null) => void;
}
export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,
  async load() {
    try {
      set({ user: await session(), loading: false, error: null });
    } catch (error) {
      set({
        user: null,
        loading: false,
        error: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
      });
    }
  },
  setUser(user) {
    set({ user, error: null });
  },
}));
