import { apiJson, apiVoid } from './client';

/**
 * Top-bar notification bell (V127). Backed by published
 * announcements the current user is in the audience for, with
 * per-user read state.
 */
export type NotificationType = 'HOLIDAY' | 'NEWS' | 'EVENTS' | 'OTHERS';

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  status: 'PUBLISHED';
  publishAt: string | null;
  read: boolean;
}

export async function list(): Promise<Notification[]> {
  return apiJson('/api/v1/notifications');
}

export async function unreadCount(): Promise<number> {
  const r = await apiJson<{ count: number }>('/api/v1/notifications/unread-count');
  return r.count;
}

export async function markRead(announcementId: string): Promise<void> {
  return apiVoid(`/api/v1/notifications/${announcementId}/read`, { method: 'POST' });
}

export async function markAllRead(): Promise<void> {
  return apiVoid('/api/v1/notifications/read-all', { method: 'POST' });
}
