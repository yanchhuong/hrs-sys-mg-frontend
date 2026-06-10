import { apiJson, apiVoid } from './client';

export type PaymentMethod = 'cash' | 'bank' | 'card' | 'cheque' | 'other';

export interface Payment {
  id: string;
  invoiceId: string;
  paymentDate: string;
  amount: number;
  method: PaymentMethod;
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
