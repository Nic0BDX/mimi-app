import { create } from 'zustand';
import { z } from 'zod';
import {
  friendSnapshotSchema,
  notificationSchema,
  type FriendSnapshot,
  type Notification,
} from '@mimi/shared';
import { request, ApiError } from '../lib/api';
const notificationList = z.object({ notifications: z.array(notificationSchema) });
const empty: FriendSnapshot = { friends: [], incoming: [], outgoing: [], blocked: [] };
export const useSocial = create<{
  snapshot: FriendSnapshot;
  notifications: Notification[];
  error: string | null;
  load: () => Promise<void>;
  clear: () => void;
}>()((set) => ({
  snapshot: empty,
  notifications: [],
  error: null,
  async load() {
    try {
      const [friends, notifications] = await Promise.all([
        request('/friends'),
        request('/notifications'),
      ]);
      set({
        snapshot: friendSnapshotSchema.parse(friends),
        notifications: notificationList.parse(notifications).notifications,
        error: null,
      });
    } catch (error) {
      set({ error: error instanceof ApiError ? error.code : 'INTERNAL_ERROR' });
    }
  },
  clear() {
    set({ snapshot: empty, notifications: [], error: null });
  },
}));
