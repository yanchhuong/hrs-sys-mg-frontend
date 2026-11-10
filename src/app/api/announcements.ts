import { apiJson, apiVoid, resolveAssetUrl } from './client';

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
  /** v-event-rsvp — null unless this is an event (date, place, RSVP). */
  event?: AnnouncementEvent | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  /** Display names of the creator / last editor (server-resolved). */
  createdByName?: string | null;
  updatedByName?: string | null;
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
  /* v-event-rsvp — event invitation. All optional. */
  eventDate?: string;          // yyyy-MM-dd
  eventStartTime?: string;     // HH:mm
  eventEndTime?: string;       // HH:mm
  eventLocation?: string;
  eventOrganizer?: string;
  rsvpEnabled?: boolean;
  rsvpDeadline?: string;       // ISO instant
  coverImageDataUrl?: string;
  /** v-event-kind — the invitation's look. */
  eventKind?: EventKind;
}

/** v-event-kind — what the event is for; sets the invitation's look. */
export type EventKind = 'WEDDING' | 'BIRTHDAY' | 'OTHERS';

export const EVENT_KINDS: Record<EventKind, { label: string; invite: string; emoji: string; chip: string }> = {
  WEDDING:  { label: 'Wedding',  invite: 'Wedding Invitation',  emoji: '💍', chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  BIRTHDAY: { label: 'Birthday', invite: 'Birthday Invitation', emoji: '🎂', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  OTHERS:   { label: 'Others',   invite: 'Event Invitation',    emoji: '🎉', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};
export const kindMeta = (k: string | null | undefined) => EVENT_KINDS[(k as EventKind) in EVENT_KINDS ? (k as EventKind) : 'OTHERS'];

/* ── v-event-rsvp — event invitations ─────────────────────────── */

export type RsvpResponse = 'JOIN' | 'MAYBE' | 'DECLINE';

export interface AnnouncementEvent {
  kind?: EventKind | null;
  date: string | null;
  startTime: string | null;    // HH:mm:ss
  endTime: string | null;
  location: string | null;
  organizer: string | null;
  /** Relative API path; use {@link apiAsset}. */
  coverUrl: string | null;
  rsvpEnabled: boolean;
  rsvpDeadline: string | null;
  /** Answers still accepted. */
  open: boolean;
  invited: number;
  join: number;
  maybe: number;
  decline: number;
  /** Invited and not answered yet. Invitees only. */
  pending: number;
  /** v-event-guest-link — answered through the shared link. Counted in
   *  join/maybe/decline (they are coming) but never in invited (the
   *  organiser did not ask them), so the two stay separable. */
  guests: number;
  /** Invitees who have opened their personal link. */
  seen: number;
  /** Invitees who have not — who still needs chasing. */
  notSeen: number;
  /** The signed-in viewer's own answer, when they are invited. */
  myResponse: RsvpResponse | null;
  invitedMe: boolean;
}

export interface RsvpParticipant {
  id: string;
  recipientType: 'EMPLOYEE' | 'CUSTOMER' | 'GUEST';
  recipientId: string;
  /** What a guest typed; the employee or customer name otherwise. */
  name: string;
  /** Employee no., customer phone, or "Guest". */
  detail: string | null;
  response: RsvpResponse | null;
  respondedAt: string | null;
  /** Their personal RSVP page. Null for a guest — a guest's token is
   *  their own way back in, not the organiser's to pass on. */
  link: string | null;
  /** First time they opened their link; null = never. Always null for
   *  a guest, who was never sent one. */
  seenAt: string | null;
}

/** What a personal link (or "my invitation") shows. */
export interface PublicRsvp {
  title: string;
  body: string;
  kind?: EventKind | null;
  coverUrl: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  organizer: string | null;
  companyName: string | null;
  companyLogo: string | null;
  inviteeName: string | null;
  response: RsvpResponse | null;
  respondedAt: string | null;
  rsvpDeadline: string | null;
  open: boolean;
}

/** A relative API path (cover photo, logo) as a loadable URL — composed
 *  like request URLs, so production's /api-02 prefix comes out right. */
export const apiAsset = resolveAssetUrl;

export const listParticipants = (id: string): Promise<RsvpParticipant[]> =>
  apiJson(`/api/v1/announcements/${id}/rsvp/participants`);

export const addParticipants = (id: string, recipientType: 'EMPLOYEE' | 'CUSTOMER', recipientIds: string[]): Promise<{ added: number }> =>
  apiJson(`/api/v1/announcements/${id}/rsvp/participants`, { method: 'POST', json: { recipientType, recipientIds } });

export const removeParticipant = (id: string, rsvpId: string): Promise<void> =>
  apiVoid(`/api/v1/announcements/${id}/rsvp/participants/${rsvpId}`, { method: 'DELETE' });

export const myRsvp = (id: string): Promise<PublicRsvp> =>
  apiJson(`/api/v1/announcements/${id}/rsvp/me`);

export const answerMyRsvp = (id: string, response: RsvpResponse): Promise<PublicRsvp> =>
  apiJson(`/api/v1/announcements/${id}/rsvp/me`, { method: 'PUT', json: { response } });

export const publicRsvp = (token: string): Promise<PublicRsvp> =>
  apiJson(`/api/v1/public/rsvp/${encodeURIComponent(token)}`);

export const answerPublicRsvp = (token: string, response: RsvpResponse): Promise<PublicRsvp> =>
  apiJson(`/api/v1/public/rsvp/${encodeURIComponent(token)}`, { method: 'PUT', json: { response } });

/* ── v-event-guest-link — the SHARED link ───────────────────────────
 *
 * A personal link answers AS its invitee, so it cannot be forwarded.
 * This one names nobody: a guest opens it, types a name and answers as
 * themselves. Safe to post in a group chat, which is the point.
 */

/** Organiser: the link to share. POST because the first call mints the
 *  token; every call after returns the same URL. */
export const shareLink = (id: string): Promise<{ url: string }> =>
  apiJson(`/api/v1/announcements/${id}/rsvp/share-link`, { method: 'POST' });

/** The event behind a shared link. inviteeName and response are null:
 *  the link identifies no one. */
export const publicInvite = (token: string): Promise<PublicRsvp> =>
  apiJson(`/api/v1/public/invite/${encodeURIComponent(token)}`);

export interface GuestAnswer {
  /** Keep it: sending it back on a change edits the same row instead
   *  of adding a second guest to the head-count. */
  guestToken: string;
  response: RsvpResponse | null;
  event: PublicRsvp;
}

export const answerAsGuest = (
  token: string, name: string, response: RsvpResponse, guestToken?: string | null,
): Promise<GuestAnswer> =>
  apiJson(`/api/v1/public/invite/${encodeURIComponent(token)}`, {
    method: 'POST', json: { name, response, guestToken: guestToken ?? null },
  });

/** "Sat, 20 Dec 2026" — event dates are calendar dates, read as local. */
export function formatEventDate(date: string | null): string {
  if (!date) return '';
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

/** "6:00 PM – 10:00 PM" from HH:mm(:ss) wall-clock times. */
export function formatEventTime(start: string | null, end: string | null): string {
  const one = (t: string | null) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const d = new Date(2000, 0, 1, h, m);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  return [one(start), one(end)].filter(Boolean).join(' – ');
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
