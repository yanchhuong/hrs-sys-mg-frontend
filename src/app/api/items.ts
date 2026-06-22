import { apiJson, apiVoid } from './client';

/**
 * Tenant-scoped catalog item (V80 + V118). Backs the Stock page and
 * the invoice / bill / quotation line pickers. Same row that
 * {@code invoice_items.stock_item_id} references — Phase 2 wires the
 * decrement into {@link InvoiceService}.
 */
export interface Item {
  id: string;
  sku?: string | null;
  name: string;
  description?: string | null;
  /** Free-form unit string — 'pcs', 'kg', 'hour', … */
  unit?: string | null;
  unitPrice: number;
  /** Cost basis per unit (V118). */
  unitCost: number;
  /** On-hand quantity. Negatives allowed so back-orders show red. */
  stockQty: number;
  active: boolean;
  /** When true, issuing a Commercial / Tax invoice with a line
   *  referencing this item decrements stockQty AND refuses to save
   *  when the requested quantity exceeds the on-hand balance. When
   *  false (default), the picker is used purely for autofill — the
   *  line records the FK but the on-hand balance never changes. V121. */
  deductionEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ItemRequest {
  sku?: string;
  name: string;
  description?: string;
  unit?: string;
  unitPrice?: number;
  unitCost?: number;
  stockQty?: number;
  active?: boolean;
  /** Null on update = keep existing value. V121. */
  deductionEnabled?: boolean;
}

export interface StockInRequest {
  /** Positive quantity to add to {@code stockQty}. Backend rejects ≤ 0. */
  qty: number;
  /** Optional new cost basis — when set, overwrites {@code unitCost}. */
  unitCost?: number;
}

export interface ListParams {
  q?: string;
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

export async function list(params: ListParams = {}): Promise<PagedResponse<Item>> {
  const q: Record<string, string | number> = {};
  if (params.q) q.q = params.q;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  return apiJson('/api/v1/stock-items', { query: q });
}

export async function get(id: string): Promise<Item> {
  return apiJson(`/api/v1/stock-items/${id}`);
}

export async function create(req: ItemRequest): Promise<Item> {
  return apiJson('/api/v1/stock-items', { method: 'POST', json: req });
}

export async function update(id: string, req: ItemRequest): Promise<Item> {
  return apiJson(`/api/v1/stock-items/${id}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/stock-items/${id}`, { method: 'DELETE' });
}

/**
 * Receive stock — adds {@code qty} to the on-hand balance. When
 * {@code unitCost} is supplied it overwrites the cost basis (matches
 * the "we got 50 more at the new price" paper-receipt workflow).
 */
export async function stockIn(id: string, req: StockInRequest): Promise<Item> {
  return apiJson(`/api/v1/stock-items/${id}/stock-in`, { method: 'POST', json: req });
}

/** Per-tenant feature gate for the StockItemPicker on sale/purchase
 *  document forms (V120). All four flags default to false — items
 *  module ships hidden behind explicit opt-in per doc type. */
export interface UsageSettings {
  enabledForInvoice: boolean;
  enabledForQuotation: boolean;
  enabledForVoucher: boolean;
  enabledForBill: boolean;
  /** null when no row exists yet (returning baked-in defaults). */
  updatedAt: string | null;
}

/** Read the tenant's usage settings. Returns all-off defaults when
 *  no row exists, so the FE never has to branch on 204. */
export async function getUsageSettings(): Promise<UsageSettings> {
  return apiJson('/api/v1/stock-items/usage-settings');
}

export async function putUsageSettings(req: UsageSettings): Promise<UsageSettings> {
  return apiJson('/api/v1/stock-items/usage-settings', { method: 'PUT', json: req });
}
