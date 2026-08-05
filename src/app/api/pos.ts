import { apiJson } from './client';

/**
 * POS order (V130). Counter-style sale that converts to a real
 * Invoice on checkout. The order itself has its own lifecycle —
 * `open` while the cashier is building the cart, `checked_out` once
 * the Invoice + Payment land, `voided` for cancels.
 *
 * Queue numbers reset per tenant per day. The bare integer lives in
 * `queueSeq` so a daily report can sort by ticket order without
 * parsing the prefix off the string.
 */
export type PosOrderStatus = 'open' | 'checked_out' | 'voided';
export type PosPaymentMethod = 'cash' | 'card' | 'khqr' | 'khqr_mark' | 'bank' | 'cheque';

/** V165 — kitchen-side fulfillment lifecycle. Independent of the
 *  payment-side {@link PosOrderStatus}. Starts at 'requested' the
 *  moment payment is captured; staff advance from there. */
export type PosFulfillmentStatus =
  | 'requested'
  | 'accepted'
  | 'in_progress'
  | 'ready'
  | 'done';

/** Ordered chain — UIs use this to render the workflow and resolve
 *  forward / backward neighbours. */
export const POS_FULFILLMENT_CHAIN: PosFulfillmentStatus[] = [
  'requested', 'accepted', 'in_progress', 'ready', 'done',
];

/** Human label per status — keeps every list / pill / button in sync. */
export const POS_FULFILLMENT_LABELS: Record<PosFulfillmentStatus, string> = {
  requested:    'Requested',
  accepted:     'Accepted',
  in_progress:  'In Progress',
  ready:        'Ready for Pickup',
  done:         'Done',
};

export interface PosOrderItem {
  /** Server-issued; null on a freshly added line until the next save. */
  id: string | null;
  /** Optional link to a stock_items row. When set, checkout decrements
   *  the on-hand balance (V118 / V121) the same way Invoice does. */
  stockItemId: string | null;
  /** Optional link to the generic items catalog. */
  itemId: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  /** Computed server-side from quantity * unitPrice. */
  lineTotal: number;
  lineNo: number;
  /** Per-line modifier note (V134) — e.g. "Sugar 50%, Size M". Two
   *  lines for the same SKU can carry different notes and prices. */
  notes: string | null;
}

export interface PosOrder {
  id: string;
  queueNo: string;       // "POSQ-042"
  queueSeq: number;      // 42
  queueDate: string;     // ISO date (YYYY-MM-DD)
  customerId: string | null;
  customerName: string | null;
  /** V307 — raw creator user id. Null on anonymous / public-shop
   *  orders. Used by the kitchen share flow to filter the shared
   *  board to the code holder's own orders + anonymous ones. */
  createdById: string | null;
  /** Cashier display name — resolved server-side from the creator
   *  user's linked Employee row (V138). Falls back to email. */
  createdByName: string | null;
  /** Cashier phone — from the linked Employee. Null when no
   *  employee link or no contact number. */
  createdByPhone: string | null;
  status: PosOrderStatus;
  /** V165 — kitchen fulfillment state. Always present; pre-V165 rows
   *  were backfilled to 'done'. */
  fulfillmentStatus: PosFulfillmentStatus;
  currency: string;
  exchangeRate: number;
  subtotal: number;
  discountType: 'amount' | 'percent';
  discountValue: number;
  /** Tax pattern key from accounting_settings.tax_types_enabled.
   *  Null = exempt. */
  taxType: string | null;
  taxAmount: number;
  total: number;
  paymentMethod: PosPaymentMethod | null;
  paymentReceived: number | null;
  paymentChange: number | null;
  notes: string | null;
  /** Spawned invoice's id — null while the order is still open. */
  invoiceId: string | null;
  invoiceKind: 'commercial' | 'tax' | null;
  checkedOutAt: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
  items: PosOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PosOrderRequest {
  customerId?: string | null;
  customerName?: string | null;
  currency?: string;
  exchangeRate?: number;
  discountType?: 'amount' | 'percent';
  discountValue?: number;
  taxType?: string | null;
  notes?: string | null;
  items: Array<{
    id?: string | null;
    stockItemId?: string | null;
    itemId?: string | null;
    name: string;
    quantity: number;
    unit?: string | null;
    unitPrice: number;
    /** Echoed back but the server recomputes. Safe to omit. */
    lineTotal?: number;
    lineNo?: number;
    /** Per-line modifier note (V134). */
    notes?: string | null;
  }>;
}

export interface PosCheckoutRequest {
  /** 'commercial' = counter receipt (no VAT line), 'tax' = tax invoice. */
  invoiceKind: 'commercial' | 'tax';
  paymentMethod: PosPaymentMethod;
  /** Cash tendered. For non-cash methods the server defaults to total
   *  and computes paymentChange = 0. */
  paymentReceived?: number;
}

export interface PagedResponse<T> {
  content: T[];
  number: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

const BASE = '/api/v1/pos/orders';

export async function listOpen(): Promise<PosOrder[]> {
  return apiJson(`${BASE}/open`);
}

export async function list(opts: { status?: PosOrderStatus; page?: number; size?: number } = {}): Promise<PagedResponse<PosOrder>> {
  const q = new URLSearchParams();
  if (opts.status) q.set('status', opts.status);
  if (opts.page  != null) q.set('page', String(opts.page));
  if (opts.size  != null) q.set('size', String(opts.size));
  return apiJson(`${BASE}?${q.toString()}`);
}

export async function get(id: string): Promise<PosOrder> {
  return apiJson(`${BASE}/${id}`);
}

/** Reverse-lookup by invoice id (V135). The Invoice detail page calls
 *  this when the open invoice carries a {@code posOrderId} back-link,
 *  so the Print action can fetch the original POS order and render
 *  the receipt template instead of the bilingual invoice layout. */
export async function getByInvoice(invoiceId: string): Promise<PosOrder> {
  return apiJson(`${BASE}/by-invoice/${invoiceId}`);
}

export async function create(req: PosOrderRequest): Promise<PosOrder> {
  return apiJson(BASE, { method: 'POST', json: req });
}

export async function update(id: string, req: PosOrderRequest): Promise<PosOrder> {
  return apiJson(`${BASE}/${id}`, { method: 'PUT', json: req });
}

export async function checkout(id: string, req: PosCheckoutRequest): Promise<PosOrder> {
  return apiJson(`${BASE}/${id}/checkout`, { method: 'POST', json: req });
}

export async function voidOrder(id: string, reason?: string): Promise<PosOrder> {
  return apiJson(`${BASE}/${id}/void`, { method: 'POST', json: { reason } });
}

/** V165 — paid orders still moving through the kitchen pipeline. */
export async function listActiveFulfillment(): Promise<PosOrder[]> {
  return apiJson(`${BASE}/fulfillment/active`);
}

/** V165 — set the kitchen fulfillment state. Server allows both
 *  forward and backward moves so an operator can correct a fat-finger
 *  advance. */
export async function setFulfillmentStatus(id: string, status: PosFulfillmentStatus): Promise<PosOrder> {
  return apiJson(`${BASE}/${id}/fulfillment-status`, { method: 'PATCH', json: { status } });
}
