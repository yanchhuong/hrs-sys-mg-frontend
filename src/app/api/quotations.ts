import { apiJson, apiVoid } from './client';
import type { Invoice } from './invoices';

/** Quotation statuses — server-side V102 CHECK constraint:
 *  - progress: editable, awaiting customer response
 *  - done:     converted to invoice (read-only)
 *  - close:    manually closed without conversion (read-only) */
export type QuotationStatus = 'progress' | 'done' | 'close';

export interface QuotationItem {
  id: string;
  stockItemId?: string | null;
  name: string;
  description?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
}

export interface Quotation {
  id: string;
  quotationNo: string;
  customerId: string;
  issueDate: string;
  expiryDate?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  currency: string;
  exchangeRate: number;
  taxType?: string | null;
  subtotal: number;
  taxAmount: number;
  discountType: string;
  discountValue: number;
  discountAmount: number;
  total: number;
  status: QuotationStatus;
  /** Set when the quote has been converted to an invoice — the UI
   *  uses this to swap the Convert button for a "Converted → INV-XXX"
   *  link and lock the row read-only. */
  convertedInvoiceId?: string | null;
  notes?: string | null;
  terms?: string | null;
  items: QuotationItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface QuotationItemRequest {
  stockItemId?: string | null;
  name: string;
  description?: string | null;
  unit?: string | null;
  quantity?: number;
  unitPrice?: number;
}

export interface QuotationRequest {
  quotationNo?: string;
  customerId: string;
  issueDate?: string;
  expiryDate?: string | null;
  recipientName?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  currency?: string;
  exchangeRate?: number;
  taxType?: string;
  taxAmount?: number;
  discountType?: string;
  discountValue?: number;
  notes?: string;
  terms?: string;
  items: QuotationItemRequest[];
}

export interface ListParams {
  status?: QuotationStatus;
  customerId?: string;
  page?: number;
  size?: number;
}

export interface PagedResponse<T> {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export async function list(params: ListParams = {}): Promise<PagedResponse<Quotation>> {
  const query: Record<string, string> = {};
  if (params.status)     query.status     = params.status;
  if (params.customerId) query.customerId = params.customerId;
  if (params.page  != null) query.page = String(params.page);
  if (params.size  != null) query.size = String(params.size);
  return apiJson('/api/v1/quotations', { query });
}

export async function get(id: string): Promise<Quotation> {
  return apiJson(`/api/v1/quotations/${id}`);
}

export async function nextNumber(): Promise<{ quotationNo: string }> {
  return apiJson('/api/v1/quotations/next-number');
}

export async function create(req: QuotationRequest): Promise<Quotation> {
  return apiJson('/api/v1/quotations', { method: 'POST', json: req });
}

export async function update(id: string, req: QuotationRequest): Promise<Quotation> {
  return apiJson(`/api/v1/quotations/${id}`, { method: 'PUT', json: req });
}

export async function close(id: string): Promise<Quotation> {
  return apiJson(`/api/v1/quotations/${id}/close`, { method: 'POST' });
}

/** Spawns a new commercial Invoice from the quotation. Returns the
 *  new invoice; the source quotation transitions to {@code done}. */
export async function convertToInvoice(id: string): Promise<Invoice> {
  return apiJson(`/api/v1/quotations/${id}/convert-to-invoice`, { method: 'POST' });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/quotations/${id}`, { method: 'DELETE' });
}
