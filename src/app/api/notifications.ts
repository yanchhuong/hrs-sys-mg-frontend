import { apiJson, apiVoid } from './client';

/**
 * Top-bar notification bell. Feed merges two sources:
 *   • {@code kind: 'announcement'} — broadcast announcements the user
 *     is in the audience for (V127).
 *   • {@code kind: 'notification'} — per-user targeted pings, e.g.
 *     "you were assigned a new encounter / appointment" (V198).
 * The FE reads {@code kind} to route mark-read + pick the right
 * click-through destination via {@code entityType} + {@code entityId}.
 */
export type NotificationKind = 'announcement' | 'notification';

/** Type strings. Announcement types are the V127 categories; the
 *  V198 per-user pings use lower_snake identifiers. */
export type NotificationType =
  | 'HOLIDAY' | 'NEWS' | 'EVENTS' | 'OTHERS'
  | 'encounter_assigned' | 'appointment_assigned';

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  type: NotificationType;
  status: string | null;
  publishAt: string | null;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
}

export async function list(): Promise<Notification[]> {
  return apiJson('/api/v1/notifications');
}

export async function unreadCount(): Promise<number> {
  const r = await apiJson<{ count: number }>('/api/v1/notifications/unread-count');
  return r.count;
}

/** V198 — mark-read polymorphic on kind. Pass the item's own
 *  {@code kind} so the backend routes to the correct read-state
 *  store (announcement_reads vs notifications.read_at). */
export async function markRead(kind: NotificationKind, id: string): Promise<void> {
  return apiVoid(`/api/v1/notifications/${kind}/${id}/read`, { method: 'POST' });
}

export async function markAllRead(): Promise<void> {
  return apiVoid('/api/v1/notifications/read-all', { method: 'POST' });
}
