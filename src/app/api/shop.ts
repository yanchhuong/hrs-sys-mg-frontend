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
  category: 'drink' | 'snack' | 'food' | 'other' | string;
  inStock: boolean;
}

export interface PublicShopPayload {
  code: string;
  shopName: string;
  country: string;
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
