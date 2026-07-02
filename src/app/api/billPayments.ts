import { apiJson, apiVoid } from './client';

export type PaymentMethod = 'cash' | 'bank' | 'card' | 'cheque' | 'khqr' | 'other';
/** `credit` = money in (customer paying the invoice or a debit note).
 *  `debit`  = money out (refund — settling a credit note). The invoice's
 *  net Paid total = Σ credit amounts − Σ debit amounts. */
export type PaymentDirection = 'credit' | 'debit';
export type PaymentCurrency = 'USD' | 'KHR';

export interface Payment {
  id: string;
  billId: string;
  paymentDate: string;
  amount: number;
  currency: PaymentCurrency;
  method: PaymentMethod;
  direction: PaymentDirection;
  referenceNo?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentRequest {
  billId: string;
  paymentDate?: string;
  amount: number;
  currency?: PaymentCurrency;
  method?: PaymentMethod;
  direction?: PaymentDirection;
  referenceNo?: string;
  notes?: string;
}

/** Receipts against one invoice, oldest first. */
export async function listForBill(billId: string): Promise<Payment[]> {
  return apiJson('/api/v1/bill-payments', { query: { billId } });
}

export async function get(id: string): Promise<Payment> {
  return apiJson(`/api/v1/bill-payments/${id}`);
}

export async function create(req: PaymentRequest): Promise<Payment> {
  return apiJson('/api/v1/bill-payments', { method: 'POST', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/bill-payments/${id}`, { method: 'DELETE' });
}

/** Per-currency Paid totals for a batch of bills. Values are signed
 *  the same way as the server's existing sumForBill (credit positive,
 *  debit negative — the UI flips the sign for the "Paid" label). */
export async function totalsByCurrency(
  billIds: string[],
): Promise<Record<string, Partial<Record<PaymentCurrency, number>>>> {
  if (billIds.length === 0) return {};
  return apiJson('/api/v1/bill-payments/totals-by-currency', { method: 'POST', json: billIds });
}
