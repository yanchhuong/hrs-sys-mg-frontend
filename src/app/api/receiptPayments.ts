import { apiJson, apiVoid } from './client';

export type PaymentMethod = 'cash' | 'cash_advance' | 'bank' | 'card' | 'cheque' | 'khqr' | 'other';
export type PaymentDirection = 'credit' | 'debit';
export type PaymentCurrency = 'USD' | 'KHR';

export interface ReceiptPayment {
  id: string;
  receiptId: string;
  paymentDate: string;
  amount: number;
  currency: PaymentCurrency;
  method: PaymentMethod;
  direction: PaymentDirection;
  referenceNo?: string | null;
  /** Set when {@link method} is {@code cash_advance} — backlink to
   *  the advance funding this payment (V160). */
  cashAdvanceId?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReceiptPaymentRequest {
  receiptId: string;
  paymentDate?: string;
  amount?: number;
  currency?: PaymentCurrency;
  method?: PaymentMethod;
  direction?: PaymentDirection;
  referenceNo?: string;
  /** Required by the backend when {@link method} is {@code cash_advance}. */
  cashAdvanceId?: string;
  notes?: string;
}

export async function listForReceipt(receiptId: string): Promise<ReceiptPayment[]> {
  return apiJson('/api/v1/receipt-payments', { query: { receiptId } });
}

export async function sumForReceipt(receiptId: string): Promise<number> {
  const res = await apiJson<{ paid: number }>('/api/v1/receipt-payments/sum', { query: { receiptId } });
  return res?.paid ?? 0;
}

export async function create(req: ReceiptPaymentRequest): Promise<ReceiptPayment> {
  return apiJson('/api/v1/receipt-payments', { method: 'POST', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/receipt-payments/${id}`, { method: 'DELETE' });
}

/** Per-currency Received totals for a batch of receipts. */
export async function totalsByCurrency(
  receiptIds: string[],
): Promise<Record<string, Partial<Record<PaymentCurrency, number>>>> {
  if (receiptIds.length === 0) return {};
  return apiJson('/api/v1/receipt-payments/totals-by-currency', { method: 'POST', json: receiptIds });
}
