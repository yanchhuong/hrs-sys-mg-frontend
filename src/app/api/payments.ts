import { apiJson, apiVoid } from './client';

export type PaymentMethod = 'cash' | 'bank' | 'card' | 'cheque' | 'other';
/** `credit` = money in (customer paying the invoice or a debit note).
 *  `debit`  = money out (refund — settling a credit note). The invoice's
 *  net Paid total = Σ credit amounts − Σ debit amounts. */
export type PaymentDirection = 'credit' | 'debit';

export interface Payment {
  id: string;
  invoiceId: string;
  paymentDate: string;
  amount: number;
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
