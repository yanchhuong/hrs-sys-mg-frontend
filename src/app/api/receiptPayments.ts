import { apiJson, apiVoid } from './client';

export type PaymentMethod = 'cash' | 'bank' | 'card' | 'cheque' | 'other';
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
