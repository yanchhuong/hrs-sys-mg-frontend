import { apiJson, apiVoid } from './client';

export type PaymentMethod = 'cash' | 'bank' | 'card' | 'cheque' | 'other';
/** `credit` = money in (customer paying the invoice or a debit note).
 *  `debit`  = money out (refund — settling a credit note). The invoice's
 *  net Paid total = Σ credit amounts − Σ debit amounts. */
export type PaymentDirection = 'credit' | 'debit';
/** Cambodia transacts in both rails; the dialog asks per payment. */
export type PaymentCurrency = 'USD' | 'KHR';

export interface Payment {
  id: string;
  invoiceId: string;
  paymentDate: string;
  amount: number;
  /** "USD" or "KHR". Server defaults to USD when missing. */
  currency: PaymentCurrency;
  method: PaymentMethod;
  direction: PaymentDirection;
  referenceNo?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentRequest {
  invoiceId: string;
  paymentDate?: string;
  amount: number;
  currency?: PaymentCurrency;
  method?: PaymentMethod;
  direction?: PaymentDirection;
  referenceNo?: string;
  notes?: string;
}

/** Receipts against one invoice, oldest first. */
export async function listForInvoice(invoiceId: string): Promise<Payment[]> {
  return apiJson('/api/v1/payments', { query: { invoiceId } });
}

export async function get(id: string): Promise<Payment> {
  return apiJson(`/api/v1/payments/${id}`);
}

export async function create(req: PaymentRequest): Promise<Payment> {
  return apiJson('/api/v1/payments', { method: 'POST', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/payments/${id}`, { method: 'DELETE' });
}

/** Per-currency Received totals for a batch of invoices. Response:
 *   { "<invoiceId>": { USD: 250.00, KHR: 5500 } }
 *  Missing currencies default to 0 client-side. */
export async function totalsByCurrency(
  invoiceIds: string[],
): Promise<Record<string, Partial<Record<PaymentCurrency, number>>>> {
  if (invoiceIds.length === 0) return {};
  return apiJson('/api/v1/payments/totals-by-currency', { method: 'POST', json: invoiceIds });
}
