import { apiJson, apiVoid } from './client';

export type AdjustmentReason =
  | 'damaged'
  | 'lost'
  | 'expired'
  | 'counting_error'
  | 'opening_balance';

export type AdjustmentStatus = 'pending' | 'approved';

/** Manual stock correction row (V150). */
export interface StockAdjustment {
  id: string;
  adjustmentNo: string;
  itemId: string;
  itemName?: string | null;
  itemSku?: string | null;
  warehouseId?: string | null;
  systemQty: number;
  actualQty: number;
  difference: number;
  reason: AdjustmentReason;
  status: AdjustmentStatus;
  note?: string | null;
  createdAt: string;
  createdById?: string | null;
}

export interface StockAdjustmentRequest {
  itemId: string;
  actualQty: number;
  reason: AdjustmentReason;
  note?: string;
}

export interface PagedResponse<T> {
  content: T[];
  number: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

export async function list(page = 0, size = 50): Promise<PagedResponse<StockAdjustment>> {
  return apiJson('/api/v1/stock-adjustments', { query: { page, size } });
}

export async function create(req: StockAdjustmentRequest): Promise<StockAdjustment> {
  return apiJson('/api/v1/stock-adjustments', { method: 'POST', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/stock-adjustments/${id}`, { method: 'DELETE' });
}

/** Display helper — reasons in the order the FE renders them. */
export const ADJUSTMENT_REASONS: { value: AdjustmentReason; label: string }[] = [
  { value: 'counting_error',  label: 'Counting Error' },
  { value: 'damaged',         label: 'Damaged' },
  { value: 'lost',            label: 'Lost' },
  { value: 'expired',         label: 'Expired' },
  { value: 'opening_balance', label: 'Opening Balance' },
];
