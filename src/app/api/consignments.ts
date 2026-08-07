/**
 * V309 — Consignment header + line items. Sibling of quotations /
 * bills for the supplier-owned-goods flow described in the operator's
 * architecture doc. Settlement records live in
 * {@link ./consignmentSettlements}.
 */
import { apiJson, apiVoid, type Page } from './client';

export type ConsignmentStatus =
  | 'draft' | 'active' | 'partially_settled' | 'settled' | 'closed' | 'cancelled';

export const CONSIGNMENT_STATUS_LABELS: Record<ConsignmentStatus, string> = {
  draft:              'Draft',
  active:             'Active',
  partially_settled:  'Partially Settled',
  settled:            'Settled',
  closed:             'Closed',
  cancelled:          'Cancelled',
};

/** Commission model per line — 'percent' of selling_price × sold_qty,
 *  or 'amount' flat per unit sold. Null = no commission. */
export type CommissionType = 'percent' | 'amount';

export interface ConsignmentItem {
  id: string;
  stockItemId: string;
  receivedQty: number;
  soldQty: number;
  returnedQty: number;
  adjustedQty: number;
  supplierPrice: number;
  sellingPrice: number;
  commissionType: CommissionType | null;
  commissionValue: number;
  sortOrder: number;
  /** Derived server-side: received − sold − returned + adjusted. */
  remainingQty: number;
}

export interface Consignment {
  id: string;
  consignmentNo: string;
  supplierId: string;
  supplierName: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  status: ConsignmentStatus;
  startDate: string;
  endDate: string | null;
  settlementMethod: string | null;
  settlementPeriod: string | null;
  notes: string | null;
  items: ConsignmentItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ConsignmentItemRequest {
  /** Null on insert; server-issued UUID on update. */
  id?: string | null;
  stockItemId: string;
  receivedQty?: number;
  soldQty?: number;
  returnedQty?: number;
  adjustedQty?: number;
  supplierPrice?: number;
  sellingPrice?: number;
  commissionType?: CommissionType | null;
  commissionValue?: number;
  sortOrder?: number;
}

export interface ConsignmentRequest {
  /** Optional on create — server auto-mints when omitted. */
  consignmentNo?: string;
  supplierId: string;
  warehouseId?: string | null;
  status?: ConsignmentStatus;
  startDate: string;
  endDate?: string | null;
  settlementMethod?: string | null;
  settlementPeriod?: string | null;
  notes?: string | null;
  items: ConsignmentItemRequest[];
}

export interface ListParams {
  status?: ConsignmentStatus;
  supplierId?: string;
  page?: number;
  size?: number;
}

export async function list(params: ListParams = {}): Promise<Page<Consignment>> {
  const query: Record<string, string> = {};
  if (params.status) query.status = params.status;
  if (params.supplierId) query.supplierId = params.supplierId;
  if (params.page != null) query.page = String(params.page);
  if (params.size != null) query.size = String(params.size);
  return apiJson('/api/v1/consignments', { query });
}

export async function get(id: string): Promise<Consignment> {
  return apiJson(`/api/v1/consignments/${id}`);
}

export async function nextNumber(): Promise<{ consignmentNo: string }> {
  return apiJson('/api/v1/consignments/next-number');
}

export async function create(req: ConsignmentRequest): Promise<Consignment> {
  return apiJson('/api/v1/consignments', { method: 'POST', json: req });
}

export async function update(id: string, req: ConsignmentRequest): Promise<Consignment> {
  return apiJson(`/api/v1/consignments/${id}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/consignments/${id}`, { method: 'DELETE' });
}
