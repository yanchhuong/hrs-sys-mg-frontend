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
  /** Optional cover image URL (V132). Surfaced on the POS items
   *  grid as a product card; null / empty falls back to a placeholder.
   *  Kept in sync with {@link imageUrls}[0] server-side (V265) so
   *  legacy card readers keep working. */
  imageUrl?: string | null;
  /** Full ordered image list (V265) — up to 5 entries. First entry
   *  matches {@link imageUrl}. Null on legacy items that only have
   *  the single-image column populated; treat as `[imageUrl]` in that
   *  case (see {@link resolveImages}). */
  imageUrls?: string[] | null;
  /** V280 — small (~15 KB, ~200 px) base64 thumbnail. Rendered on
   *  every list surface (POS grid, Items table, Public Shop card)
   *  so the list response can ship a tiny cover per row instead
   *  of the full 200 KB image. Null on legacy items; readers fall
   *  back to {@link imageUrl}. */
  imageThumbUrl?: string | null;
  /** POS category — drives the filter tabs on the items grid. (V142) */
  category?: ItemCategory;
  /** Per-item modifier groups as a JSON string (V142). Parse with
   *  {@link parseModifiers}. Null when the item has no modifiers. */
  modifiers?: string | null;
  /** Optional warehouse FK (V149). Surfaces only when the tenant has
   *  the warehouse feature on; otherwise stays null. */
  warehouseId?: string | null;
  /** Free-text Stock category (V151), separate from the POS taxonomy. */
  itemCategory?: string | null;
  /** Reorder threshold (V151). Drives the derived Status badge. */
  minStock?: number;
  /** V182 — discriminator: product | service | medical_service.
   *  V213 dropped 'class' and 'course' from this table (see the
   *  Courses / Classrooms / Course Schedules tables in the school
   *  vertical). Defaults to 'product' on legacy rows. */
  type?: ItemType;
  createdAt?: string;
  updatedAt?: string;
}

/** V182 — item discriminator. */
export type ItemType = 'product' | 'service' | 'medical_service';

/** POS category. As of V269 this is free-text on the DB — the union
 *  members are the common categories that get first-class filter
 *  chips on POS + public shop; anything else is bucketed under
 *  "Other" for chip purposes but stored as-is. `& {}` on the string
 *  branch preserves the literal-completion behaviour on IDE
 *  autocomplete while still accepting arbitrary strings. */
export type ItemCategory =
  | 'drink' | 'snack' | 'food' | 'craft' | 'souvenir' | 'jewelry' | 'other'
  | (string & {});

/** The chip set POS + shop render as filter buttons. Any category
 *  value NOT in this set falls into the "other" chip's bucket. */
export const KNOWN_ITEM_CATEGORIES = [
  'drink', 'snack', 'food', 'craft', 'souvenir', 'jewelry', 'other',
] as const;

/** One option inside a modifier group — e.g. "Size: L (+$1.00)". */
export interface ModifierOption {
  label: string;
  /** Price delta added to the item's base unit price when the
   *  customer picks this option. Negative values are fine (e.g.
   *  "Half portion -$0.50"). */
  priceAdj: number;
}

/** A set of options the customer picks from. Single-select on the
 *  cart-side picker; {@code required} forces a pick before the line
 *  can be added. */
export interface ModifierGroup {
  name: string;
  required: boolean;
  options: ModifierOption[];
}

export interface ItemModifiers {
  groups: ModifierGroup[];
}

/** Parse the JSON-string modifiers column into the typed shape.
 *  Returns null on missing / malformed input so the cart-side picker
 *  can skip its dialog and fall back to a direct add. */
export function parseModifiers(raw: string | null | undefined): ItemModifiers | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.groups)) return null;
    return parsed as ItemModifiers;
  } catch {
    return null;
  }
}

/** Serialise the typed shape back to a JSON string for the API.
 *  Returns null when the modifier set is empty so the BE column
 *  stores NULL rather than `{"groups":[]}`. */
export function serializeModifiers(m: ItemModifiers | null): string | null {
  if (!m || m.groups.length === 0) return null;
  return JSON.stringify(m);
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
  /** Cover image URL (V132). Empty string clears; undefined leaves
   *  the existing value untouched on update. Legacy field — the FE
   *  now sends {@link imageUrls} instead, and the BE derives this
   *  from imageUrls[0]. */
  imageUrl?: string;
  /** Full ordered image list (V265) — up to 5 entries. Undefined on
   *  update leaves existing images untouched (patch); an empty array
   *  clears every image. */
  imageUrls?: string[];
  /** V280 — small base64 thumbnail. FE generates from imageUrls[0]
   *  at save time and sends it here so list responses can ship a
   *  tiny cover. Undefined leaves existing; empty string clears. */
  imageThumbUrl?: string;
  /** POS category (V142). Undefined on update = leave as-is. */
  category?: ItemCategory;
  /** Modifiers JSON (V142). Empty string clears; undefined on update
   *  leaves the existing value untouched. */
  modifiers?: string;
  /** Warehouse FK (V149). Null clears the assignment; undefined on
   *  update is treated as null (the form always re-sends the picked
   *  value so a no-op patch keeps it intact). */
  warehouseId?: string | null;
  /** Free-text Stock category (V151). Null on update keeps existing. */
  itemCategory?: string;
  /** Reorder threshold (V151). */
  minStock?: number;
  /** V182 — discriminator. Undefined on update leaves the existing
   *  value; on create the backend defaults to 'product'. School
   *  vertical no longer piggybacks on this table (V213). */
  type?: ItemType;
}

/** V265 — normalise the two image fields into a single ordered list.
 *  Legacy rows only have {@link Item.imageUrl}; new rows carry the
 *  full {@link Item.imageUrls}. Callers that only need the cover can
 *  read the first entry (or fall back to {@code null}). */
export function resolveImages(it: Pick<Item, 'imageUrl' | 'imageUrls'>): string[] {
  if (Array.isArray(it.imageUrls) && it.imageUrls.length > 0) {
    return it.imageUrls.filter((s): s is string => typeof s === 'string' && s.length > 0);
  }
  return it.imageUrl ? [it.imageUrl] : [];
}

export interface StockInRequest {
  /** Positive quantity to add to {@code stockQty}. Backend rejects ≤ 0. */
  qty: number;
  /** Optional new cost basis — when set, overwrites {@code unitCost}. */
  unitCost?: number;
}

export interface ListParams {
  q?: string;
  /** Optional warehouse filter (V149). Passed only when the tenant
   *  has the warehouse feature on AND the user picked a value from
   *  the dropdown. */
  warehouseId?: string;
  /** V206 / v-school-classes — filter to a single item type.
   *  The Classes page passes 'class' so school rows don't mix into
   *  the POS/Stock catalog. */
  type?: ItemType;
  page?: number;
  size?: number;
  /** Opt-in slim projection — server drops the description text
   *  field for a 30-70% smaller payload. POS uses it; the Items
   *  page keeps false so the row's description line still renders. */
  slim?: boolean;
}

export interface PagedResponse<T> {
  content: T[];
  number: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

export async function list(params: ListParams = {}): Promise<PagedResponse<Item>> {
  const q: Record<string, string | number | boolean> = {};
  if (params.q) q.q = params.q;
  if (params.warehouseId) q.warehouseId = params.warehouseId;
  if (params.type) q.type = params.type;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  if (params.slim) q.slim = true;
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
  /** POS items grid gate (V131). When on, the POS page surfaces
   *  stock items for ringing-up. */
  enabledForPos: boolean;
  /** Warehouse feature gate (V149). When on, items can be assigned
   *  to a warehouse and the Items page surfaces a Warehouse column +
   *  filter. */
  enabledForWarehouse: boolean;
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
