/**
 * V309 — Consignment Settlement payouts. Sibling of
 * {@link ./consignments}. Records the period-end reconciliation
 * with the supplier: gross sales, our commission, deductions, net
 * owed. Optional {@code paymentId} links into the Cashflow module
 * once the actual payout lands.
 */
import { apiJson, apiVoid, type Page } from './client';

export type SettlementStatus = 'draft' | 'pending' | 'paid' | 'cancelled';

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  draft:     'Draft',
  pending:   'Pending',
  paid:      'Paid',
  cancelled: 'Cancelled',
};

export interface ConsignmentSettlement {
  id: string;
  settlementNo: string;
  consignmentId: string;
  consignmentNo: string | null;
  supplierId: string;
  supplierName: string | null;
  settlementDate: string;
  periodFrom: string;
  periodTo: string;
  grossSales: number;
  commissionAmount: number;
  deductionAmount: number;
  netAmount: number;
  status: SettlementStatus;
  paymentId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsignmentSettlementRequest {
  /** Optional on create — server auto-mints when omitted. */
  settlementNo?: string;
  consignmentId: string;
  settlementDate: string;
  periodFrom: string;
  periodTo: string;
  grossSales?: number;
  commissionAmount?: number;
  deductionAmount?: number;
  netAmount?: number;
  status?: SettlementStatus;
  paymentId?: string | null;
  notes?: string | null;
}

export interface ListParams {
  status?: SettlementStatus;
  consignmentId?: string;
  page?: number;
  size?: number;
}

export async function list(params: ListParams = {}): Promise<Page<ConsignmentSettlement>> {
  const query: Record<string, string> = {};
  if (params.status) query.status = params.status;
  if (params.consignmentId) query.consignmentId = params.consignmentId;
  if (params.page != null) query.page = String(params.page);
  if (params.size != null) query.size = String(params.size);
  return apiJson('/api/v1/consignment-settlements', { query });
}

export async function get(id: string): Promise<ConsignmentSettlement> {
  return apiJson(`/api/v1/consignment-settlements/${id}`);
}

export async function nextNumber(): Promise<{ settlementNo: string }> {
  return apiJson('/api/v1/consignment-settlements/next-number');
}

export async function create(req: ConsignmentSettlementRequest): Promise<ConsignmentSettlement> {
  return apiJson('/api/v1/consignment-settlements', { method: 'POST', json: req });
}

export async function update(id: string, req: ConsignmentSettlementRequest): Promise<ConsignmentSettlement> {
  return apiJson(`/api/v1/consignment-settlements/${id}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/consignment-settlements/${id}`, { method: 'DELETE' });
}
