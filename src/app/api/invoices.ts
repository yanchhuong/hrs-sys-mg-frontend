import { apiJson, apiVoid } from './client';

export type InvoiceKind = 'commercial' | 'tax' | 'credit_note' | 'debit_note';
/** Stored statuses are draft/progress/partially/paid/void. `overdue`
 *  is derived server-side — a progress row whose due_date has elapsed
 *  and isn't fully paid is reported as overdue at read time. */
export type InvoiceStatus = 'draft' | 'progress' | 'partially' | 'paid' | 'overdue' | 'void';

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

export async function create(req: InvoiceRequest): Promise<Invoice> {
  return apiJson('/api/v1/invoices', { method: 'POST', json: req });
}

/** Edit a draft or progress invoice. Server rejects updates on paid /
 *  partially / overdue / void rows with a 409 — issue a credit / debit
 *  note to adjust those instead. */
export async function update(id: string, req: InvoiceRequest): Promise<Invoice> {
  return apiJson(`/api/v1/invoices/${id}`, { method: 'PUT', json: req });
}

/** Move a draft invoice to status=issued. */
export async function issue(id: string): Promise<Invoice> {
  return apiJson(`/api/v1/invoices/${id}/issue`, { method: 'POST' });
}

/** Mark an invoice as void (legal-document soft delete). */
export async function voidInvoice(id: string): Promise<Invoice> {
  return apiJson(`/api/v1/invoices/${id}/void`, { method: 'POST' });
}

/** Hard delete — only allowed for drafts. Issued/void must use voidInvoice. */
export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/invoices/${id}`, { method: 'DELETE' });
}
