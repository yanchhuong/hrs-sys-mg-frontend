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
  /** V313 — per-line sold breakdown persisted with this settlement.
   *  Empty on rows created before the column existed. The Edit dialog
   *  uses this to re-hydrate the Sold column and disable it (post-hoc
   *  editing of Sold on a paid settlement would drift from the
   *  cumulative sold_qty accumulator on the parent items). */
  lineBreakdown?: { consignmentItemId: string; sold: number }[];
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
  /** v-consignment-partial-settlement — per-line sold quantities.
   *  Sent when the operator has typed values in the Sold column.
   *  When present AND status='paid', BE bumps each parent
   *  {@code consignment_items.sold_qty} by the matching {@code sold}
   *  so subsequent settlements see the true remainder. Optional so
   *  legacy callers that only send aggregate amounts still work. */
  lines?: { consignmentItemId: string; sold: number }[];
  /** v-consignment-disposition — what to do with units still unsold
   *  after this settlement:
   *   • 'partial' — keep the consignment open (status →
   *                 partially_settled).
   *   • 'return'  — push remainder back into stock (IN movement +
   *                 stock_qty increment) and close the consignment
   *                 (status → settled).
   *  Only meaningful when status='paid' AND remainder > 0. */
  disposition?: 'partial' | 'return';
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
