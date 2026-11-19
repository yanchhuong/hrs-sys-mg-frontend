import { apiJson, apiVoid } from './client';

export type InvoiceKind = 'commercial' | 'tax' | 'credit_note' | 'debit_note' | 'medical' | 'tuition';

/** Per-line bucket the Encounter form sorts into (V185 /
 *  v-encounter-form-medical-sections). Non-encounter invoices leave
 *  the field at 'other' — the flat table on Sale > Invoice ignores
 *  it. */
export type InvoiceItemCategory = 'medicine' | 'service' | 'lab' | 'imaging' | 'other';

/** v-recurring-items — how often one invoice LINE bills again. Only
 *  repeating lines on commercial / tax invoices ever do; a server job
 *  bills each period as a new, independent invoice. */
export type InvoiceItemFrequency = 'ONE_TIME' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type RecurringFrequency = Exclude<InvoiceItemFrequency, 'ONE_TIME'>;

export const INVOICE_ITEM_FREQUENCIES: readonly InvoiceItemFrequency[] = ['ONE_TIME', 'WEEKLY', 'MONTHLY', 'YEARLY'];

/** English labels — one word each. Screens pass them through t() with
 *  the `invoice.recurring.freq.<KEY>` keys for km / zh. */
export const INVOICE_ITEM_FREQUENCY_LABELS: Record<InvoiceItemFrequency, string> = {
  ONE_TIME: 'One-time',
  WEEKLY:   'Weekly',
  MONTHLY:  'Monthly',
  YEARLY:   'Yearly',
};

/** The placeholders a repeating line's title may carry, exactly as the
 *  server accepts them (anything else between double braces is a 400). */
export const RECURRING_TITLE_PLACEHOLDERS = [
  'MONTH_NAME', 'MONTH', 'YEAR', 'PERIOD', 'DATE', 'WEEK_START', 'WEEK_END',
] as const;
export type RecurringTitlePlaceholder = typeof RECURRING_TITLE_PLACEHOLDERS[number];

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
  /** v-recurring-items — always sent by the server; optional here so a
   *  payload from an older build still reads as ONE_TIME. */
  frequencyType?: InvoiceItemFrequency;
  /** The title AS TYPED on a repeating line (placeholders and all);
   *  `name` is that title resolved for this invoice's period. The edit
   *  form shows `nameTemplate ?? name`. */
  nameTemplate?: string | null;
  /** Last day a repeating line may bill (inclusive), 'YYYY-MM-DD'. */
  recurringEndDate?: string | null;
  /** The schedule this line started once the invoice went live. */
  recurringItemId?: string | null;
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
  /** V-invoice-purpose — free-text reason the invoice was raised
   *  (e.g. "Q3 consulting retainer"). Rendered on the create form
   *  and the printed invoice when the sale-scope `showPurpose`
   *  setting is on. Null when unset or the tenant hasn't started
   *  using the field. */
  purpose?: string | null;
  /** Free-text diagnosis on the Encounter lens (kind='medical'). Null
   *  on non-encounter invoices. */
  diagnosis?: string | null;
  /** V186 — treating doctor (user id). Null on non-encounter invoices. */
  doctorId?: string | null;
  /** v-creator-column — display name of the user who created the
   *  invoice / encounter. Hydrated on the list endpoint and (with
   *  v-doc-audit-line) the single-row GET; null on legacy rows. */
  createdByName?: string | null;
  /** v-doc-audit-line — display name of the user who last saved it. */
  updatedByName?: string | null;
  items: InvoiceItem[];
  /** Child Credit / Debit Notes attached to this invoice. Populated
   *  on the single-invoice GET; empty on the list payload. */
  adjustments?: Adjustment[];
  /** Net amount the customer still owes:
   *  `total + ΣDN.total − ΣCN.total − paidAmount` ignoring void
   *  children. Populated on the single-invoice GET; list payloads
   *  fall back to `total − paidAmount`. */
  netBalance?: number;
  /** v-recurring-items — set only on an invoice a repeating line billed
   *  (on the slim list payload too); null on every other invoice. */
  recurringOrigin?: InvoiceRecurringOrigin | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceRecurringOrigin {
  sourceInvoiceId: string;
  /** 'YYYY-MM-DD', both inclusive. */
  billingPeriodStart: string;
  billingPeriodEnd: string;
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
  /** v-recurring-items — the invoice form ALWAYS sends it ('ONE_TIME'
   *  by default); absent means "a client that predates recurring
   *  items" to the server, which then keeps what the line had. */
  frequencyType?: InvoiceItemFrequency;
  /** Repeating lines only; null for ONE_TIME. */
  recurringEndDate?: string | null;
  /** Exactly what the loaded line had; null for new and copied lines. */
  recurringItemId?: string | null;
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
  /** V-invoice-purpose — free-text reason the invoice was raised.
   *  Backend trims blank → null; caller may pass null / undefined /
   *  "" interchangeably. */
  purpose?: string | null;
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
  /** v-recurring-items — editing a LIVE invoice (not draft) changes its
   *  schedules only when this is true: the operator's explicit "Apply to
   *  future invoices" decision. Drafts omit it. */
  applyRecurringChanges?: boolean | null;
}

export interface ListParams {
  kind?: InvoiceKind | '';
  customerId?: string | '';
  page?: number;
  size?: number;
  /** v-perf-list-slim — drop items[] / adjustments[] / notes /
   *  terms / diagnosis from the response and skip the per-row
   *  {@code getItems()} lazy fetch that fired 200 extra SQL queries
   *  on a full-page load. Row-detail dialogs re-fetch the fat DTO
   *  via {@link get}. */
  slim?: boolean;
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
  if (params.slim) q.slim = 'true';
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

/** V-invoice-purpose-picker — distinct non-blank purposes already used
 *  by this tenant, alphabetised. Feeds the Purpose SearchablePicker on
 *  the Invoice create/edit form: existing values are one-click, and the
 *  picker's inline-create affordance covers first-time / novel values.
 *  Returns [] when the tenant has never saved a Purpose (e.g. because
 *  the toggle was flipped off, or on a brand-new deploy). */
export async function listPurposes(): Promise<string[]> {
  return apiJson<string[]>(`/api/v1/invoices/purposes`);
}

/** Create an invoice. {@code notifyTelegram=false} suppresses the
 *  backend's auto-issue text-only Telegram so the caller can follow
 *  up with an image-based sendPhoto. Defaults to true (legacy). */
/** `teamPost=false` skips the Telegram team-group post for this step —
 *  Pay now uses it on create and issue so the payment is the sale's one
 *  post (v-pay-now-one-post). */
function invoiceQuery(notifyTelegram: boolean, teamPost: boolean): string {
  const p = [notifyTelegram ? '' : 'notify=false', teamPost ? '' : 'teamPost=false'].filter(Boolean);
  return p.length ? `?${p.join('&')}` : '';
}

export async function create(req: InvoiceRequest, notifyTelegram = true, teamPost = true): Promise<Invoice> {
  return apiJson(`/api/v1/invoices${invoiceQuery(notifyTelegram, teamPost)}`, { method: 'POST', json: req });
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
export async function issue(id: string, notifyTelegram = true, teamPost = true): Promise<Invoice> {
  return apiJson(`/api/v1/invoices/${id}/issue${invoiceQuery(notifyTelegram, teamPost)}`, { method: 'POST' });
}

/** Mark an invoice as void (legal-document soft delete). */
/** Due date + note only — the edit an OVERDUE invoice allows (its lines
 *  and amounts are locked server-side). Null dueDate clears it. */
export async function updateTerms(id: string, req: { dueDate: string | null; notes: string | null }): Promise<Invoice> {
  return apiJson(`/api/v1/invoices/${id}/terms`, { method: 'PATCH', json: req });
}

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

/* -------------------------------------------------------------------------- */
/* v-recurring-items — schedules, eligibility, delivery                        */
/* -------------------------------------------------------------------------- */

export type RecurringScheduleStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';

/** One repeating line's schedule, as the original invoice shows it. */
export interface RecurringSchedule {
  id: string;
  frequencyType: RecurringFrequency;
  /** The title as typed, placeholders and all. */
  itemNameTemplate: string;
  /** The NEXT invoice's title, resolved — what the customer will see.
   *  Null once the schedule has finished. */
  nextTitle: string | null;
  quantity: number;
  unitPrice: number;
  currency: string;
  startDate: string;
  endDate: string | null;
  /** Null once finished. */
  nextRunDate: string | null;
  status: RecurringScheduleStatus;
  /** A plain sentence when the last run could not bill. */
  lastError: string | null;
  billedCount: number;
}

export interface RecurringOrigin extends InvoiceRecurringOrigin {
  sourceInvoiceNo: string | null;
}

export type RecurringDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED';

/** Telegram delivery of an invoice a schedule generated. */
export interface RecurringDelivery {
  status: RecurringDeliveryStatus;
  attempts: number;
  lastResult: 'sent' | 'not_linked' | 'disabled' | 'failed' | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  sentAt: string | null;
}

/** Everything recurring about one invoice. An original carries its
 *  schedules; a generated invoice carries its origin and delivery. */
export interface RecurringOverview {
  schedules: RecurringSchedule[];
  origin: RecurringOrigin | null;
  delivery: RecurringDelivery | null;
}

export interface RecurringEligibility {
  customerId: string;
  telegramLinked: boolean;
}

/** Whether the form may offer repeating frequencies for this customer
 *  (Telegram linked). The server checks again on save. Needs invoice
 *  create OR update — not telegram:view. */
export async function recurringEligibility(customerId: string): Promise<RecurringEligibility> {
  return apiJson('/api/v1/invoices/recurring/eligibility', { query: { customerId } });
}

export async function recurringOverview(invoiceId: string): Promise<RecurringOverview> {
  return apiJson(`/api/v1/invoices/${invoiceId}/recurring`);
}

/** ACTIVE → PAUSED. */
export async function pauseRecurring(scheduleId: string): Promise<RecurringSchedule> {
  return apiJson(`/api/v1/invoices/recurring/${scheduleId}/pause`, { method: 'POST' });
}

/** PAUSED → ACTIVE, picking up at the next date from today (paused
 *  periods are not back-billed). Needs the customer still linked. */
export async function resumeRecurring(scheduleId: string): Promise<RecurringSchedule> {
  return apiJson(`/api/v1/invoices/recurring/${scheduleId}/resume`, { method: 'POST' });
}

/** ACTIVE / PAUSED → CANCELLED. Stops future invoices only. */
export async function cancelRecurring(scheduleId: string): Promise<RecurringSchedule> {
  return apiJson(`/api/v1/invoices/recurring/${scheduleId}/cancel`, { method: 'POST' });
}

/** Send a generated invoice to the customer's Telegram again, now. */
export async function retryRecurringDelivery(invoiceId: string): Promise<RecurringDelivery> {
  return apiJson(`/api/v1/invoices/${invoiceId}/recurring/delivery/retry`, { method: 'POST' });
}
