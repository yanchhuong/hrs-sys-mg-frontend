import { apiJson, apiVoid } from './client';

/* ================================================================
 * v-commission-settlement-mvp — server-side settle CRUD.
 * ================================================================ */

export type SettlementStatus =
  | 'DRAFT' | 'CONFIRMED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';

export type PaymentMethod = 'CASH' | 'BANK' | 'PAYROLL' | 'MOBILE' | 'CHEQUE';

export interface SettlementHeader {
  id: string;
  settlementNo: string;
  sellerId: string;
  periodStart: string;
  periodEnd: string;
  invoiceCount: number;
  totalSales: number;
  totalCommission: number;
  paidAmount: number;
  balanceAmount: number;
  paymentDate: string | null;
  paymentMethod: PaymentMethod | null;
  referenceNo: string | null;
  remark: string | null;
  status: SettlementStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementDetail {
  id: string;
  invoiceId: string;
  invoiceNo: string | null;
  saleAmount: number;
  commissionAmount: number;
  planId: string | null;
  planSnapshot: string | null;
}

export interface SettlementFull {
  header: SettlementHeader;
  lines: SettlementDetail[];
}

export interface PreviewLine {
  invoiceId: string;
  invoiceNo: string | null;
  issueDate: string;
  saleAmount: number;
  commissionAmount: number;
  planId: string | null;
  planSnapshot: string | null;
}

export interface Preview {
  invoiceCount: number;
  totalSales: number;
  totalCommission: number;
  lines: PreviewLine[];
  /** How many candidate invoices in the range were already tied
   *  to another (non-cancelled) settlement and got excluded. */
  skippedAlreadySettled: number;
}

export interface PreviewRequest {
  sellerId: string;
  periodStart: string;
  periodEnd: string;
}

export interface CreateRequest extends PreviewRequest {
  paymentMethod?: PaymentMethod | null;
  referenceNo?:  string | null;
  remark?:       string | null;
}

export interface StatusUpdateRequest {
  status?: SettlementStatus | null;
  paidAmount?:    number | null;
  paymentDate?:   string | null;
  paymentMethod?: PaymentMethod | null;
  referenceNo?:   string | null;
  remark?:        string | null;
}

export const commissionSettlement = {
  list:    () => apiJson<SettlementHeader[]>('/api/v1/commission/settlements'),
  get:     (id: string) => apiJson<SettlementFull>(`/api/v1/commission/settlements/${id}`),
  preview: (req: PreviewRequest) =>
    apiJson<Preview>('/api/v1/commission/settlements/preview', { method: 'POST', json: req }),
  create:  (req: CreateRequest) =>
    apiJson<SettlementFull>('/api/v1/commission/settlements', { method: 'POST', json: req }),
  updateStatus: (id: string, req: StatusUpdateRequest) =>
    apiJson<SettlementFull>(`/api/v1/commission/settlements/${id}`, { method: 'PATCH', json: req }),
  remove:  (id: string) =>
    apiVoid(`/api/v1/commission/settlements/${id}`, { method: 'DELETE' }),
};
