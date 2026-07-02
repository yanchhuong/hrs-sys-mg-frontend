import { apiJson } from './client';

/** Append-only audit row in {@code stock_movements} (V150). */
export interface StockMovement {
  id: string;
  itemId: string;
  itemName?: string | null;
  itemSku?: string | null;
  warehouseId?: string | null;
  /** Hydrated by the server so the FE list renders the name without
   *  per-row lookups (V151). */
  warehouseName?: string | null;
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
  /** Hydrated user display label (name → email fallback). V151. */
  createdByName?: string | null;
}

export interface ListParams {
  itemId?: string;
  type?: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';
  /** ISO date (YYYY-MM-DD). Rows on or after this date are included.
   *  Interpreted as calendar boundary in UTC on the server. */
  from?: string;
  /** ISO date (YYYY-MM-DD). Inclusive — the server converts to an
   *  exclusive upper bound at end-of-day so any row stamped anywhere
   *  on this date is matched. */
  to?: string;
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
  if (params.from) q.from = params.from;
  if (params.to) q.to = params.to;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  return apiJson('/api/v1/stock-movements', { query: q });
}
