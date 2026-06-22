import { apiJson } from './client';

/**
 * Announcement (V122). Broadcast message published by an admin /
 * manager to employees, customers, or a subset of either, with
 * optional Telegram fan-out.
 */
export type AudienceType =
  | 'ALL_EMPLOYEES'
  | 'ALL_CUSTOMERS'
  | 'SPECIFIC_EMPLOYEES'
  | 'SPECIFIC_CUSTOMERS';

export type TelegramSentStatus =
  | 'PENDING'   // fan-out in progress
  | 'SENT'      // every recipient acknowledged
  | 'PARTIAL'   // some recipients sent, some not (NOT_LINKED or FAILED)
  | 'FAILED'    // all attempts failed
  | 'SKIPPED';  // sendTelegram was false

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audienceType: AudienceType;
  sendTelegram: boolean;
  telegramSentStatus: TelegramSentStatus;
  telegramSentAt: string | null;
  /** SPECIFIC_* recipient ids — empty for ALL_*. */
  recipientIds: string[];
  /** Quick delivery rollup. Populated on get(); list() leaves these null. */
  telegramSentCount: number | null;
  telegramFailedCount: number | null;
  telegramNotLinkedCount: number | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
}

export interface AnnouncementRequest {
  title: string;
  body: string;
  audienceType: AudienceType;
  /** Required for SPECIFIC_* audiences. */
  recipientIds?: string[];
  sendTelegram: boolean;
}

export type LogStatus = 'SENT' | 'FAILED' | 'NOT_LINKED';

export interface TelegramLog {
  id: string;
  announcementId: string;
  recipientType: 'EMPLOYEE' | 'CUSTOMER';
  recipientId: string;
  telegramChatId: number | null;
  status: LogStatus;
  sentAt: string;
  errorMessage: string | null;
}

export interface PagedResponse<T> {
  content: T[];
  number: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

export async function list(page = 0, size = 25): Promise<PagedResponse<Announcement>> {
  return apiJson(`/api/v1/announcements?page=${page}&size=${size}`);
}

export async function get(id: string): Promise<Announcement> {
  return apiJson(`/api/v1/announcements/${id}`);
}

export async function getLogs(id: string): Promise<TelegramLog[]> {
  return apiJson(`/api/v1/announcements/${id}/telegram-logs`);
}

export async function create(req: AnnouncementRequest): Promise<Announcement> {
  return apiJson('/api/v1/announcements', { method: 'POST', json: req });
}
