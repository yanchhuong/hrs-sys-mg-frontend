/**
 * V306 — kitchen KDS share link.
 *
 * Two surfaces:
 *  • Tenant-admin (auth): get / rotate / enable the tenant's 8-char code.
 *  • Anonymous: resolve `/kitchen/{code}` → live active-fulfillment
 *    orders + advance the fulfillment status of any order.
 *
 * The public GET is polled every ~5s by the KDS board — deliberately
 * chosen over SSE for MVP simplicity. The public POST /advance
 * grants the code holder the same power the counter's Active Orders
 * dialog has (Start Cooking → Mark Ready → Clear from Board).
 */
import { apiJson } from './client';
import type { PosOrder, PosFulfillmentStatus } from './pos';

export interface KitchenLinkInfo {
  code: string;
  /** Composed public URL. When PUBLIC_BASE_URL is set on the server we
   *  get an absolute URL back; otherwise a relative /kitchen/{code}
   *  the Share dialog wraps with the browser origin. */
  url: string;
  enabled: boolean;
  updatedAt: string | null;
}

/* ---------------------- tenant-admin surface ---------------------- */

export async function getMyKitchenLink(): Promise<KitchenLinkInfo> {
  return apiJson('/api/v1/pos/kitchen-link');
}

export async function rotateKitchenLink(): Promise<KitchenLinkInfo> {
  return apiJson('/api/v1/pos/kitchen-link/rotate', { method: 'POST' });
}

export async function setKitchenLinkEnabled(enabled: boolean): Promise<KitchenLinkInfo> {
  return apiJson(`/api/v1/pos/kitchen-link/enabled?value=${enabled}`, { method: 'POST' });
}

/* ------------------------- public surface ------------------------- */

/** Anonymous list — sends no Authorization header. The 8-char code
 *  path variable IS the auth. */
export async function getPublicKitchenOrders(code: string): Promise<PosOrder[]> {
  return apiJson(`/api/v1/public/kitchen/${encodeURIComponent(code)}/orders`);
}

/** Anonymous status advance — same shape as
 *  {@link posApi.setFulfillmentStatus} but code-gated instead of
 *  JWT-gated. Passes through to PosOrderService.setFulfillmentStatus
 *  on the server. */
export async function advancePublicKitchenOrder(
  code: string,
  orderId: string,
  fulfillmentStatus: PosFulfillmentStatus,
): Promise<PosOrder> {
  return apiJson(
    `/api/v1/public/kitchen/${encodeURIComponent(code)}/orders/${encodeURIComponent(orderId)}/advance`,
    { method: 'POST', json: { fulfillmentStatus } },
  );
}
