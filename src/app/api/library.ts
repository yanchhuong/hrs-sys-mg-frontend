/**
 * V-library-membership — client for the Library vertical.
 *
 * Three sub-resources — all share the CustomerService + StockItemService
 * primitives on the BE (kind='member' / type='book'), but expose their
 * own library-friendly wire shapes so the FE list pages don't have to
 * know about {@code customers} / {@code stock_items}.
 */

import { apiJson, apiVoid } from './client';

/* ─── Members ────────────────────────────────────────────────────── */

export interface Member {
  id: string;
  memberNo: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  sex: string | null;
  occupation: string | null;
  profileImage: string | null;   // base64 data URL, nullable
  membershipType: string | null;
  registrationDate: string | null;   // YYYY-MM-DD
  effectiveDate: string | null;      // current period start
  expiryDate: string | null;
  status: 'active' | 'expired' | 'suspended';
}

export interface MemberInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  sex?: string;
  occupation?: string;
  profileImage?: string | null;   // base64 data URL
  membershipType?: string;
  registrationDate?: string;
  effectiveDate?: string;
  expiryDate?: string;
  status?: 'active' | 'expired' | 'suspended';
}

/** V-library-membership-renewal — payload for the "Renew" popup on
 *  a member row. Spawns an invoice + payment and stamps the member's
 *  effective + expiry dates in one call. */
export interface RenewInput {
  membershipType?: string;
  amount: number;
  currency?: 'USD' | 'KHR';
  method?: 'cash' | 'bank' | 'card' | 'cheque' | 'khqr' | 'other';
  paymentDate?: string;
  effectiveDate?: string;
  expiryDate?: string;
  notes?: string;
}

export const members = {
  list:   () =>              apiJson<Member[]>('/api/v1/library/members'),
  get:    (id: string) =>    apiJson<Member>(`/api/v1/library/members/${id}`),
  create: (r: MemberInput) => apiJson<Member>('/api/v1/library/members', { method: 'POST', json: r }),
  update: (id: string, r: MemberInput) => apiJson<Member>(`/api/v1/library/members/${id}`, { method: 'PUT', json: r }),
  remove: (id: string) =>    apiVoid(`/api/v1/library/members/${id}`, { method: 'DELETE' }),
  renew:  (id: string, r: RenewInput) => apiJson<Member>(`/api/v1/library/members/${id}/renew`, { method: 'POST', json: r }),
  /** V-library-member-business-picker — distinct occupation
   *  values ("Business" in the UI) for the searchable picker. */
  businesses: () => apiJson<string[]>('/api/v1/library/members/businesses'),
};

/* ─── Books ──────────────────────────────────────────────────────── */

export interface Book {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  notes: string | null;
}

export interface BookInput {
  title: string;
  author?: string;
  isbn?: string;
  notes?: string;
}

export const books = {
  list:   () =>              apiJson<Book[]>('/api/v1/library/books'),
  get:    (id: string) =>    apiJson<Book>(`/api/v1/library/books/${id}`),
  create: (r: BookInput) =>  apiJson<Book>('/api/v1/library/books', { method: 'POST', json: r }),
  update: (id: string, r: BookInput) => apiJson<Book>(`/api/v1/library/books/${id}`, { method: 'PUT', json: r }),
  remove: (id: string) =>    apiVoid(`/api/v1/library/books/${id}`, { method: 'DELETE' }),
};

/* ─── Reading Records ────────────────────────────────────────────── */

export type ActivityType = 'reading' | 'meeting' | 'conference' | 'other';

export interface ReadingRecord {
  id: string;
  customerId: string;
  memberNo: string | null;
  memberName: string | null;
  activityType: ActivityType;
  stockItemId: string | null;
  bookTitle: string | null;
  subject: string;                    // resolved display title
  startDate: string;
  returnDate: string | null;
  status: 'progress' | 'delay' | 'done';
  durationDays: number;         // derived on the BE
  progress: number | null;      // legacy — hidden in FE
  term: string | null;          // V-library-activity-term
  notes: string | null;
}

export interface ReadingInput {
  customerId: string;
  activityType?: ActivityType;
  stockItemId?: string | null;   // required only when activityType='reading'
  subject?: string;               // free-text title for non-book activities
  startDate?: string;
  returnDate?: string;
  status?: 'progress' | 'delay' | 'done';
  progress?: number;              // legacy
  term?: string;                  // free-text label; picker + inline add
  notes?: string;
}

/* ─── Library Settings (tenant-scoped reminder config) ──────────── */

export interface LibrarySettings {
  renewalReminderEnabled: boolean;
  renewalReminderDaysBefore: number;
  channelEmail: boolean;
  channelTelegram: boolean;
  telegramLinkTemplate: string | null;
}

export interface LibrarySettingsInput {
  renewalReminderEnabled?: boolean;
  renewalReminderDaysBefore?: number;
  channelEmail?: boolean;
  channelTelegram?: boolean;
  telegramLinkTemplate?: string | null;
}

export const settings = {
  get:    () =>                              apiJson<LibrarySettings>('/api/v1/library/settings'),
  update: (r: LibrarySettingsInput) =>       apiJson<LibrarySettings>('/api/v1/library/settings', { method: 'PUT', json: r }),
};

/* ─── Membership Types (priced tiers) ───────────────────────────── */

export interface MembershipType {
  id: string;
  name: string;
  price: number;
  currency: string;
  durationDays: number | null;
  notes: string | null;
  active: boolean;
}

export interface MembershipTypeInput {
  name: string;
  price: number;
  currency?: string;
  durationDays?: number | null;
  notes?: string;
  active?: boolean;
}

export const membershipTypes = {
  list:   () =>                              apiJson<MembershipType[]>('/api/v1/library/membership-types'),
  create: (r: MembershipTypeInput) =>        apiJson<MembershipType>('/api/v1/library/membership-types', { method: 'POST', json: r }),
  update: (id: string, r: MembershipTypeInput) => apiJson<MembershipType>(`/api/v1/library/membership-types/${id}`, { method: 'PUT', json: r }),
  remove: (id: string) =>                    apiVoid(`/api/v1/library/membership-types/${id}`, { method: 'DELETE' }),
};

/* ─── Payment History (read-only view over invoices+payments) ───── */

export interface MemberPayment {
  paymentId: string;
  memberId: string;
  memberNo: string | null;
  memberName: string | null;
  paymentDate: string | null;
  purpose: string | null;
  amount: number;
  currency: string | null;
  method: string | null;
  receiptNo: string | null;
  invoiceStatus: string | null;
  invoiceNo: string | null;
  invoiceId: string | null;
  remark: string | null;
}

export const payments = {
  list: () => apiJson<MemberPayment[]>('/api/v1/library/payments'),
};

export const readings = {
  list:   (opts?: { memberId?: string; bookId?: string }) => {
    const q = new URLSearchParams();
    if (opts?.memberId) q.set('memberId', opts.memberId);
    if (opts?.bookId)   q.set('bookId',   opts.bookId);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return apiJson<ReadingRecord[]>(`/api/v1/library/readings${suffix}`);
  },
  terms:  () => apiJson<string[]>('/api/v1/library/readings/terms'),
  get:    (id: string) =>     apiJson<ReadingRecord>(`/api/v1/library/readings/${id}`),
  create: (r: ReadingInput) => apiJson<ReadingRecord>('/api/v1/library/readings', { method: 'POST', json: r }),
  update: (id: string, r: ReadingInput) => apiJson<ReadingRecord>(`/api/v1/library/readings/${id}`, { method: 'PUT', json: r }),
  remove: (id: string) =>     apiVoid(`/api/v1/library/readings/${id}`, { method: 'DELETE' }),
};
