/**
 * Customer-facing POS display — shared types + channel name.
 *
 * Architecture: the POS page lives in the main window; the display
 * page lives in a second (popped-out) window on the same origin. The
 * two communicate via {@link BroadcastChannel}, so cart edits ripple
 * live to the customer without any server round-trip.
 *
 * Messages:
 *   • {@code state} — POS → display: a full snapshot of the current
 *     ticket (items + totals + welcome / paid state). Re-broadcast on
 *     every cart change, customer change, or settings change.
 *   • {@code request-state} — display → POS: sent on display mount so
 *     a window opened mid-sale catches the in-flight cart immediately.
 *
 * Two-window communication via BroadcastChannel is intentionally
 * client-only: no server WebSocket, no shared workers. Single-tenant
 * one-cashier setups (the POS reality) don't need more.
 */

export const POS_DISPLAY_CHANNEL = 'pos-customer-display';
export const POS_DISPLAY_PATH    = '/pos/display';

export interface DisplayItem {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  notes: string | null;
  /** Cover image (URL or base64 data URL) resolved from the linked
   *  stock item. Null when the line is ad-hoc or the item has no
   *  image — the display falls back to a placeholder glyph. */
  imageUrl: string | null;
}

/** Snapshot the POS page broadcasts on every relevant change. The
 *  display window treats this as the single source of truth — its
 *  own local state is just whatever the latest snapshot was. */
export interface DisplayState {
  shopName: string;
  logoUrl: string | null;
  /** Current queue / order number, e.g. "#001". Null when the cart
   *  is empty or the order hasn't been minted yet. */
  queueNo: string | null;
  customerName: string | null;
  items: DisplayItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  currency: string;
  /** USD → KHR exchange rate snapshot (V141). The display shows the
   *  KHR equivalent next to the USD total when this is positive. */
  exchangeRate: number;
  /** Receipt kind derived from the cart's Tax dropdown — 'tax' / 'commercial'. */
  invoiceKind: 'commercial' | 'tax';
  /** Set when checkout just completed — display switches to the
   *  "Thank you" splash. Cleared on the next "New Sale" event. */
  paid: null | {
    total: number;
    method: string;
    change: number;
    queueNo: string;
  };
}

/** Empty cart state — shown before the first item is added. */
export function emptyState(shopName: string, logoUrl: string | null, currency = 'USD'): DisplayState {
  return {
    shopName, logoUrl,
    queueNo: null,
    customerName: null,
    items: [],
    subtotal: 0,
    discountAmount: 0,
    taxAmount: 0,
    total: 0,
    currency,
    exchangeRate: 0,
    invoiceKind: 'commercial',
    paid: null,
  };
}

export type DisplayMessage =
  | { kind: 'state'; state: DisplayState }
  | { kind: 'request-state' };

/** Format a money amount the display can render directly. Mirrors the
 *  fmtMoney logic on the receipt so the customer screen + the printed
 *  slip never disagree on punctuation. */
export function fmtDisplayMoney(amount: number, currency: string): string {
  if (currency === 'USD') return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currency === 'KHR') return `៛ ${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `${currency} ${amount.toLocaleString('en-US')}`;
}
