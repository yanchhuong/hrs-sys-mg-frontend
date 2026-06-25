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

/** Lifecycle status (V123). DRAFT and SCHEDULED hide from non-admin
 *  viewers and skip Telegram fan-out; the @Scheduled job in
 *  AnnouncementService promotes SCHEDULED → PUBLISHED at publishAt
 *  and PUBLISHED → EXPIRED 1 day later. */
export type LifecycleStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'EXPIRED';

/** Publish mode on create (V123).
 *  - 'now':      publish immediately, status=PUBLISHED, fan-out fires inline.
 *  - 'schedule': status=SCHEDULED, publishAt required (future), scheduler
 *                promotes + fans-out on publishAt.
 *  - 'draft':    status=DRAFT, no publishAt, no fan-out. */
export type PublishMode = 'now' | 'schedule' | 'draft';

/** Category for the announcement (V126). Drives the badge on the
 *  list table + filter chips. Defaults to OTHERS server-side. */
export type AnnouncementType = 'HOLIDAY' | 'NEWS' | 'EVENTS' | 'OTHERS';

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
  /** Lifecycle status (V123). */
  status: LifecycleStatus;
  /** When the row goes / went live. Null for DRAFT. */
  publishAt: string | null;
  /** Auto-set to publishAt + 1 day. Drives the EXPIRED transition. */
  expiresAt: string | null;
  /** Optional Holiday link. */
  holidayId: string | null;
  /** Category (V126). */
  type: AnnouncementType;
  /** Count of distinct users who have opened (marked read) this
   *  announcement — drives the "Seen by N" badge. Null only if the
   *  caller went through a path that skipped the rollup. */
  readCount: number | null;
  /* ---- V147: rich-template plate fields. -------------------- */
  /** When true, the row renders with the bulletin plate UI and the
   *  Telegram path delivered the cached PNG instead of plain text. */
  richTemplate: boolean;
  titleKm: string | null;
  bodyKm: string | null;
  signature: string | null;
  stamp: string | null;
  /** Raw JSON string — the FE parses to an array of FactRow. */
  factsJson: string | null;
  bulletinNo: string | null;
  /** Opaque storage path of the cached PNG plate. Use {@link plateImageUrl}
   *  to compose the full served URL when rendering / debugging. */
  imagePath: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
}

/** One row of the plate's facts strip. Three optional fields; the
 *  renderer treats blanks as empty cells but the row count is fixed
 *  at 3 visually. */
export interface FactRow {
  label: string;
  valueEn: string;
  valueKm: string;
}

/** "Seen by" panel row (V127). Resolved server-side so the FE
 *  doesn't need to chase user / employee ids. */
export interface AnnouncementReader {
  userId: string;
  /** Display name — employee name when linked, otherwise email. */
  name: string;
  email: string | null;
  readAt: string;
}

export interface AnnouncementRequest {
  title: string;
  body: string;
  audienceType: AudienceType;
  /** Required for SPECIFIC_* audiences. */
  recipientIds?: string[];
  sendTelegram: boolean;
  /** Defaults to 'now' server-side when omitted. */
  publishMode?: PublishMode;
  /** ISO timestamp. Required for publishMode='schedule', ignored otherwise. */
  publishAt?: string;
  /** Optional explicit expiry. When set, overrides the default
   *  publishAt + 1 day window. Must be after publishAt. */
  expiresAt?: string;
  /** Optional Holiday link — UI uses the holiday's date to default publishAt. */
  holidayId?: string;
  /** Category — defaults to 'OTHERS' server-side when omitted. */
  type?: AnnouncementType;
  /* ---- V147: rich-template plate fields. -------------------- */
  /** Opt-in. When true, the bilingual + structured fields below are
   *  honoured and Telegram gets the cached PNG; false keeps the
   *  legacy simple format. */
  richTemplate?: boolean;
  titleKm?: string;
  bodyKm?: string;
  signature?: string;
  stamp?: string;
  /** Up to 3 entries. Empty arrays are ignored server-side. */
  facts?: FactRow[];
  /** {@code data:image/png;base64,...} URL of the plate PNG rendered
   *  in the admin's browser via html2canvas at submit time. */
  imageDataUrl?: string;
}

export type LogStatus = 'SENT' | 'FAILED' | 'NOT_LINKED';

export interface TelegramLog {
  id: string;
  announcementId: string;
  recipientType: 'EMPLOYEE' | 'CUSTOMER';
  recipientId: string;
  /** Resolved at fetch time. Null when the source row is gone. */
  recipientName: string | null;
  /** Phone for both employees + customers. Null when unset. */
  recipientContact: string | null;
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

/** "Seen by" reader list for the detail dialog (V127). */
export async function getReaders(id: string): Promise<AnnouncementReader[]> {
  return apiJson(`/api/v1/announcements/${id}/readers`);
}

export async function create(req: AnnouncementRequest): Promise<Announcement> {
  return apiJson('/api/v1/announcements', { method: 'POST', json: req });
}
