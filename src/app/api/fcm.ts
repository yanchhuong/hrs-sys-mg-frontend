/**
 * V-fcm-2b — client for /api/v1/fcm/tokens.
 *
 * Register is idempotent — safe to call on every fresh page load with
 * a valid token from Firebase. Unregister is called on explicit logout
 * so the backend prunes the row before the token becomes orphaned.
 */

import { apiJson, apiVoid } from './client';

export interface FcmRegisterRequest {
  token: string;
  /** Which client — 'web' from the browser bundle, 'android' from
   *  the Capacitor build, 'ios' when we ship the iOS variant. */
  platform: 'web' | 'android' | 'ios';
  /** Optional human label, e.g. "Chrome on MacBook Pro". Best-effort. */
  deviceLabel?: string;
  /** Optional User-Agent snapshot for debugging stale tokens. */
  userAgent?: string;
}

export async function registerFcmToken(req: FcmRegisterRequest): Promise<void> {
  await apiJson<void>('/api/v1/fcm/tokens', { method: 'POST', json: req });
}

export async function unregisterFcmToken(token: string): Promise<void> {
  await apiVoid(`/api/v1/fcm/tokens/${encodeURIComponent(token)}`, { method: 'DELETE' });
}
