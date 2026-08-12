/**
 * V315 — Per-table QR management (admin surface). Each row owns a
 * 5-char public code resolving to the tenant's menu; the sibling
 * {@link ./shop.ts#getPublicMenuByTable} then reads the label + seats
 * off the response.
 */
import { apiJson, apiVoid } from './client';

export interface PosTable {
  id: string;
  code: string;
  label: string;
  /** Optional seat count. Null when the operator didn't fill it. */
  seats: number | null;
  enabled: boolean;
  /** Per-table override for the tenant-wide Order Available toggle.
   *  Off → the table's public URL hides cart/checkout even when the
   *  shop-wide flag is on. */
  orderingEnabled: boolean;
  /** Composed public URL (relative /shop/table/{code} unless the API
   *  supplied PUBLIC_BASE_URL). */
  url: string;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PosTableRequest {
  label?: string;
  seats?: number | null;
  /** Set true when the caller explicitly wants to wipe the seats
   *  value (as opposed to "no change"). Server treats null + false
   *  as "leave as is". */
  clearSeats?: boolean;
  enabled?: boolean;
  orderingEnabled?: boolean;
}

export async function list(): Promise<PosTable[]> {
  return apiJson('/api/v1/pos/tables');
}

export async function create(req: PosTableRequest): Promise<PosTable> {
  return apiJson('/api/v1/pos/tables', { method: 'POST', json: req });
}

export async function update(id: string, req: PosTableRequest): Promise<PosTable> {
  return apiJson(`/api/v1/pos/tables/${id}`, { method: 'PUT', json: req });
}

export async function rotate(id: string): Promise<PosTable> {
  return apiJson(`/api/v1/pos/tables/${id}/rotate`, { method: 'POST' });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/pos/tables/${id}`, { method: 'DELETE' });
}
