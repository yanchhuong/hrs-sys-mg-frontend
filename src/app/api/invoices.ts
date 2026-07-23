import { apiJson, apiVoid } from './client';

export type InvoiceKind = 'commercial' | 'tax' | 'credit_note' | 'debit_note' | 'medical' | 'tuition';

/** Per-line bucket the Encounter form sorts into (V185 /
 *  v-encounter-form-medical-sections). Non-encounter invoices leave
 *  the field at 'other' — the flat table on Sale > Invoice ignores
 *  it. */
export type InvoiceItemCategory = 'medicine' | 'service' | 'lab' | 'imaging' | 'other';
/** Stored statuses are draft/progress/partially/paid/void. `overdue`
 *  is derived server-side — a progress row whose due_date has elapsed
 *  and isn't fully paid is reported as overdue at read time.
 *  `refunded` is also a read-time-only label — emitted in place of
 *  `paid` for a settled Credit Note so the UI distinguishes "refund
 *  out" from a regular sale collection. Stored status remains `paid`. */
export type InvoiceStatus = 'draft' | 'progress' | 'partially' | 'paid' | 'refunded' | 'overdue' | 'void';

export interface InvoiceItem {
  id: string;
  stockItemId?: string | null;
  name: string;
  /** Free-form specification — surfaces as "Specification" in the UI. */
  description?: string | null;
  /** UOM ('pcs', 'box', 'kg', 'hour', …). Snapshot at line-time. */
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
  /** Encounter form section (Prescription / Services / Lab / Imaging).
   *  Defaults to 'other' for non-encounter invoices. */
  category: InvoiceItemCategory;
}

/** Slim row used in the parent invoice's Ledger panel. */
export interface Adjustment {
  id: string;
  invoiceNo: string;
  kind: 'credit_note' | 'debit_note';
  total: number;
  issueDate: string;
  status: InvoiceStatus;
}

/** Taxation pattern datakey from the cross-system reference matrix.
 *  Server maps it to a rate and auto-computes tax_amount on save.
 *  Which keys are allowed depends on the invoice's kind — see
 *  TAX_TYPES_FOR_KIND on the frontend / validateTaxTypeForKind on
 *  the service.
 *
 *    '1'  → VAT 10%
 *    '2'  → VAT 0%
 *    '3'  → Exclusive VAT
 *    '11' → WHT 15%
 *    '12' → WHT 14%
 */
export type InvoiceTaxType = '1' | '2' | '3' | '11' | '12';

/** Discount shape — "amount" (flat money-off) or "percent" (of subtotal). */
export type DiscountType = 'amount' | 'percent';

export interface Invoice {
  id: string;
  invoiceNo: string;
  kind: InvoiceKind;
  parentInvoiceId?: string | null;
  /** Back-link to the POS order that spawned this invoice (V135).
   *  When set, the row is a counter sale — UI tags it "POS" instead
   *  of "Commercial" / "Tax" and the Print action routes to the
   *  receipt template. */
  posOrderId?: string | null;
  customerId: string;
  issueDate: string;
  dueDate?: string | null;
  currency: string;
  /** USD → KHR rate captured at issue time. */
  exchangeRate: number;
  taxType?: InvoiceTaxType | null;
  subtotal: number;
  taxAmount: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  total: number;
  paidAmount: number;
  status: InvoiceStatus;
  notes?: string | null;
  /** Customer-facing terms & conditions text printed on the invoice. */
  terms?: string | null;
  /** Free-text diagnosis on the Encounter lens (kind='medical'). Null
   *  on non-encounter invoices. */
  diagnosis?: string | null;
  /** V186 — treating doctor (user id). Null on non-encounter invoices. */
  doctorId?: string | null;
  /** v-creator-column — display name of the user who created the
   *  invoice / encounter. Hydrated on the list endpoint only; null
   *  on single-row reads. */
  createdByName?: string | null;
  items: InvoiceItem[];
  /** Child Credit / Debit Notes attached to this invoice. Populated
   *  on the single-invoice GET; empty on the list payload. */
  adjustments?: Adjustment[];
  /** Net amount the customer still owes:
   *  `total + ΣDN.total − ΣCN.total − paidAmount` ignoring void
   *  children. Populated on the single-invoice GET; list payloads
   *  fall back to `total − paidAmount`. */
  netBalance?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceItemRequest {
  stockItemId?: string | null;
  name: string;
  /** Free-form specification. */
  description?: string | null;
  /** UOM; service falls back to the stock item's unit when omitted. */
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  /** Encounter form section (V185). Server defaults to 'other' when
   *  omitted, so Sale > Invoice callers don't need to send anything. */
  category?: InvoiceItemCategory;
}

export interface InvoiceRequest {
  kind: InvoiceKind;
  /** Required when kind is credit_note / debit_note. */
  parentInvoiceId?: string | null;
  /** Optional caller-supplied document number. Blank/null → server
   *  auto-generates; supplied → taken verbatim. Must be unique per
   *  tenant (DB enforces). */
  invoiceNo?: string;
  customerId: string;
  issueDate?: string;
  dueDate?: string | null;
  currency?: string;
  exchangeRate?: number;
  /** Taxation pattern datakey. Service computes tax_amount from rate. */
  taxType?: InvoiceTaxType | null;
  taxAmount?: number;
  /** "amount" (default) or "percent". Service derives discount_amount. */
  discountType?: DiscountType;
  /** Raw discount magnitude — currency units or % points by type. */
  discountValue?: number;
  discountAmount?: number;
  notes?: string | null;
  terms?: string | null;
  /** Free-text diagnosis field on the Encounter lens (V185). Null /
   *  omitted on Sale > Invoice callers. */
  diagnosis?: string | null;
  /** V186 — treating doctor (user id). Encounter lens only; Sale >
   *  Invoice callers omit. Server validates that the id belongs to
   *  the same tenant. */
  doctorId?: string | null;
  /** v-encounter-link-existing-appointment — when set, the new
   *  encounter attaches to the given (unlinked) Appointment
   *  instead of spawning a fresh one. Cashier picks this via the
   *  "Existing Appointment" toggle on the New Encounter form. */
  linkAppointmentId?: string | null;
  items: InvoiceItemRequest[];
}

export interface ListParams {
  kind?: InvoiceKind | '';
  customerId?: string | '';
  page?: number;
  size?: number;
}

export interface PagedResponse<T> {
  content: T[];
  number: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

export async function list(params: ListParams = {}): Promise<PagedResponse<Invoice>> {
  const q: Record<string, string | number> = {};
  if (params.kind) q.kind = params.kind;
  if (params.customerId) q.customerId = params.customerId;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  return apiJson('/api/v1/invoices', { query: q });
}

export async function get(id: string): Promise<Invoice> {
  return apiJson(`/api/v1/invoices/${id}`);
}

/** Preview the next auto-generated document number for `kind`. The
 *  New Invoice dialog calls this on open to pre-fill its editable
 *  number input so HR sees the default but can override before save. */
export async function nextNumber(kind: InvoiceKind): Promise<{ kind: InvoiceKind; invoiceNo: string }> {
  return apiJson(`/api/v1/invoices/next-number`, { query: { kind } });
}

/** Create an invoice. {@code notifyTelegram=false} suppresses the
 *  backend's auto-issue text-only Telegram so the caller can follow
 *  up with an image-based sendPhoto. Defaults to true (legacy). */
export async function create(req: InvoiceRequest, notifyTelegram = true): Promise<Invoice> {
  const q = notifyTelegram ? '' : '?notify=false';
  return apiJson(`/api/v1/invoices${q}`, { method: 'POST', json: req });
}

/** Edit a draft or progress invoice. Server rejects updates on paid /
 *  partially / overdue / void rows with a 409 — issue a credit / debit
 *  note to adjust those instead. */
export async function update(id: string, req: InvoiceRequest): Promise<Invoice> {
  return apiJson(`/api/v1/invoices/${id}`, { method: 'PUT', json: req });
}

/** Move a draft invoice to status=issued. {@code notifyTelegram=false}
 *  suppresses the backend's text-only Telegram fallback so the caller
 *  can follow up with an image-based sendPhoto via {@link sendTelegram}.
 *  Defaults to true (legacy behaviour). */
export async function issue(id: string, notifyTelegram = true): Promise<Invoice> {
  const q = notifyTelegram ? '' : '?notify=false';
  return apiJson(`/api/v1/invoices/${id}/issue${q}`, { method: 'POST' });
}

/** Mark an invoice as void (legal-document soft delete). */
export async function voidInvoice(id: string): Promise<Invoice> {
  return apiJson(`/api/v1/invoices/${id}/void`, { method: 'POST' });
}

/** Outcome of {@link sendTelegram}. {@code status === 'sent'} means
 *  the AI-Agent accepted + Telegram delivered; anything else surfaces
 *  the reason for the operator-facing toast. */
export interface TelegramSendResult {
  status: 'sent' | 'disabled' | 'not_linked' | 'failed';
  message: string | null;
}

/** Manual "Send via Telegram" trigger from the Invoice detail dialog.
 *  Distinct from the automatic on-issue notification — this one
 *  returns synchronously so the UI can render a real toast.
 *
 *  When {@code imagePngBase64} is provided, the AI-Agent sends the
 *  invoice via Telegram sendPhoto with the customer-facing summary
 *  as caption; otherwise it falls back to a text-only sendMessage. */
export async function sendTelegram(
  id: string,
  imagePngBase64?: string,
): Promise<TelegramSendResult> {
  return apiJson(`/api/v1/invoices/${id}/send-telegram`, {
    method: 'POST',
    json: imagePngBase64 ? { imagePngBase64 } : {},
  });
}

/** Hard delete — only allowed for drafts. Issued/void must use voidInvoice. */
export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/invoices/${id}`, { method: 'DELETE' });
}

/** V271 — send the invoice to the customer by email. Server picks the
 *  customer's on-file email if {@code to} is blank; falls back to 400
 *  if neither is available. Returns whether SMTP delivery succeeded.
 *
 *  <p>{@code attachment} carries an optional pre-rendered PDF (or PNG)
 *  matching the on-screen print template. Server attaches it as a file
 *  to the outgoing MimeMessage. Falls back to a link-only body when
 *  omitted.</p> */
export interface EmailSendResult { delivered: boolean; to: string; }
export interface EmailAttachment {
  filename: string;
  /** MIME type, e.g. 'application/pdf'. */
  contentType: string;
  /** Base64 payload — data-URL prefix ('data:...,') is tolerated. */
  base64: string;
}
export async function sendEmail(
  id: string,
  body: { to?: string; message?: string; attachment?: EmailAttachment },
): Promise<EmailSendResult> {
  return apiJson(`/api/v1/invoices/${id}/email`, {
    method: 'POST',
    json: body,
  });
}
