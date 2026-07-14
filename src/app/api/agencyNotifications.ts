import { apiJson } from './client';

/* ================================================================
 * Agency workspace notification inbox — /api/v1/agency/notifications
 *
 * Distinct from V198 tenant notifications: separate table, separate
 * identity pool. Only agency users receive these.
 * ================================================================ */

export interface AgencyNotificationDto {
  id: string;
  agencyId: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  readAt: string | null;
  read: boolean;
}

export const notifications = {
  list:         () => apiJson<AgencyNotificationDto[]>('/api/v1/agency/notifications'),
  unreadCount:  () => apiJson<{ count: number }>('/api/v1/agency/notifications/unread-count'),
  markRead:     (id: string) =>
    apiJson<void>(`/api/v1/agency/notifications/${id}/mark-read`, { method: 'POST' }),
  markAllRead:  () =>
    apiJson<{ updated: number }>('/api/v1/agency/notifications/mark-all-read', { method: 'POST' }),
};
