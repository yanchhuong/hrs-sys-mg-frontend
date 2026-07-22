/**
 * Public-shop deep link (V145). Two surfaces:
 *  - Admin-side: get / rotate / enable the tenant's 5-char code.
 *  - Anonymous: resolve a code → tenant + active POS menu.
 *
 * The browse page calls {@link getPublicMenu} with no auth header — the
 * code is the entire secret, so anyone with /shop/{code} can read.
 */
import { apiJson } from './client';

export interface ShopLinkInfo {
  code: string;
  /** Composed public URL (uses PUBLIC_BASE_URL when the API has one, else
   *  a relative /shop/{code}). The dialog still wraps it with the
   *  browser origin when the API returned a relative path. */
  url: string;
  enabled: boolean;
  updatedAt: string | null;
}

export interface PublicShopItem {
  id: string;
  name: string;
  description: string;
  unit: string;
  unitPrice: number;
  imageUrl: string;
  /** V265 — full ordered image list. Null / omitted on legacy items;
   *  the FE falls back to [imageUrl] via {@link itemImages}. */
  imageUrls?: string[] | null;
  category: 'drink' | 'snack' | 'food' | 'craft' | 'souvenir' | 'jewelry' | 'other' | string;
  inStock: boolean;
  /** Modifier groups JSON string (Size / Sugar Level / etc.). Same
   *  shape as the cashier-side Items.modifiers — parsed via
   *  itemsApi.parseModifiers. Null when the item has no modifiers
   *  and the customer can add it directly. */
  modifiers?: string | null;
}

/** V265 — resolve the full ordered image list for a public-shop item,
 *  falling back to the single {@link PublicShopItem.imageUrl} for
 *  legacy rows that pre-date multi-image. */
export function itemImages(it: PublicShopItem): string[] {
  if (Array.isArray(it.imageUrls) && it.imageUrls.length > 0) {
    return it.imageUrls.filter((s): s is string => typeof s === 'string' && s.length > 0);
  }
  return it.imageUrl ? [it.imageUrl] : [];
}

export interface PublicShopPayload {
  code: string;
  shopName: string;
  country: string;
  /** V266 — company profile surfaced on the banner. Any of these may
   *  be null when the tenant hasn't filled Settings → Company. */
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  items: PublicShopItem[];
}

export async function getMyShopLink(): Promise<ShopLinkInfo> {
  return apiJson('/api/v1/pos/shop-link');
}

export async function rotateShopLink(): Promise<ShopLinkInfo> {
  return apiJson('/api/v1/pos/shop-link/rotate', { method: 'POST' });
}

export async function setShopLinkEnabled(enabled: boolean): Promise<ShopLinkInfo> {
  return apiJson(`/api/v1/pos/shop-link/enabled?value=${enabled}`, { method: 'POST' });
}

/** Anonymous. Sends no Authorization header so a guest browser
 *  resolves the menu. Uses the same apiJson client because it sits on
 *  the same base URL — it just doesn't get a JWT attached. */
export async function getPublicMenu(code: string): Promise<PublicShopPayload> {
  return apiJson(`/api/v1/public/shop/${encodeURIComponent(code)}`);
}

/** Anonymous order submit. Lands as an open PosOrder on the cashier's
 *  queue — they fulfill it from the regular POS dashboard. No
 *  payment, no stock deduction here; both happen later at the
 *  counter when the cashier checks out the ticket. */
export interface PublicOrderLine {
  stockItemId: string;
  quantity: number;
  notes?: string;
}

export interface PublicOrderRequest {
  customerName?: string;
  contactPhone?: string;
  notes?: string;
  items: PublicOrderLine[];
}

export interface PublicOrderResult {
  id: string;
  queueNo: string;
  total: number;
}

export async function submitPublicOrder(
  code: string,
  body: PublicOrderRequest,
): Promise<PublicOrderResult> {
  return apiJson(`/api/v1/public/shop/${encodeURIComponent(code)}/order`, {
    method: 'POST',
    json: body,
  });
}

/* ============================================================== */
/*                 Public KHRQR (PayWay) flow                     */
/* ============================================================== */

export type PublicPayWaySessionStatus = 'pending' | 'paid' | 'cancelled' | 'failed';

export interface PublicPayWaySession {
  tranId: string;
  checkoutEndpoint: string | null;
  /** Base64 PNG data URL — render directly in an <img> tag. */
  qrDataUrl: string | null;
  checkoutUrl: string | null;
  status: PublicPayWaySessionStatus;
}

/** Mint a PayWay session for an anonymous shop customer. Amount is
 *  the cart total in {@code currency} ('USD' or 'KHR'). The customer
 *  scans {@code qrDataUrl} in their bank app to pay. */
export async function mintShopPayWayPurchase(
  code: string,
  amount: number,
  currency: 'USD' | 'KHR' = 'USD',
): Promise<PublicPayWaySession> {
  return apiJson(`/api/v1/public/shop/${encodeURIComponent(code)}/payway-purchase`, {
    method: 'POST',
    json: { amount, currency },
  });
}

/** Status poll. Returns the latest session state — flips to 'paid'
 *  once PayWay's push handler reconciles the customer's bank push
 *  against the merchant's tranId. */
export async function getShopPayWayStatus(
  code: string,
  tranId: string,
): Promise<PublicPayWaySession> {
  return apiJson(
    `/api/v1/public/shop/${encodeURIComponent(code)}/payway-status/${encodeURIComponent(tranId)}`,
  );
}
