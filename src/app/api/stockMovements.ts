import { apiJson } from './client';

/** Append-only audit row in {@code stock_movements} (V150). */
export interface StockMovement {
  id: string;
  itemId: string;
  itemName?: string | null;
  itemSku?: string | null;
  warehouseId?: string | null;
  /** IN / OUT / TRANSFER / ADJUSTMENT */
  type: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';
  /** Signed quantity. OUT lines are negative. */
  quantity: number;
  balanceAfter: number;
  /** 'invoice' / 'bill' / 'adjustment' / 'opening' or null. */
  referenceType?: string | null;
  referenceId?: string | null;
  referenceNo?: string | null;
  note?: string | null;
  createdAt: string;
  createdById?: string | null;
}

export interface ListParams {
  itemId?: string;
  type?: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';
  page?: number;
  size?: number;
}

export interface PagedResponse<T> {
  content: T[];
  number: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

export async function list(params: ListParams = {}): Promise<PagedResponse<StockMovement>> {
  const q: Record<string, string | number> = {};
  if (params.itemId) q.itemId = params.itemId;
  if (params.type) q.type = params.type;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  return apiJson('/api/v1/stock-movements', { query: q });
}
