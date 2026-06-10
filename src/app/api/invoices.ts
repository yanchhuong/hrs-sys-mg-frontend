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
  description?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
}

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
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  paidAmount: number;
  status: InvoiceStatus;
  notes?: string | null;
  items: InvoiceItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceItemRequest {
  stockItemId?: string | null;
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceRequest {
  kind: InvoiceKind;
  /** Required when kind is credit_note / debit_note. */
  parentInvoiceId?: string | null;
  customerId: string;
  issueDate?: string;
  dueDate?: string | null;
  currency?: string;
  exchangeRate?: number;
  taxAmount?: number;
  discountAmount?: number;
  notes?: string | null;
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

export async function create(req: InvoiceRequest): Promise<Invoice> {
  return apiJson('/api/v1/invoices', { method: 'POST', json: req });
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
