/**
 * Mobile App Keys — Super Admin surface for the keys embedded in
 * mobile builds, plus the email-domain map the public build resolves
 * logins through (V342).
 *
 * Two kinds of key:
 *   • PUBLIC  (tenantId null) — the global build. Any tenant's users
 *     sign in; their tenant is resolved from their email domain.
 *   • TENANT  (tenantId set)  — a private build pinned to one tenant.
 *     The app skips tenant selection entirely.
 *
 * SECURITY NOTE — an app key is NOT a secret. It's a client
 * identifier (nearer an OAuth client_id) and grants no API access on
 * its own; login still needs real credentials. That's why the full
 * value is returned and shown for copying, unlike the local-install
 * sync keys which only ever expose a last-four. Do NOT start treating
 * this value as a credential, and never reuse a tenant's `apiKey`
 * here — that one IS a bearer token.
 */
import { apiJson, apiVoid } from './client';

export type AppKeyScope = 'public' | 'tenant';
export type AppKeyStatus = 'active' | 'revoked';

export interface MobileAppKey {
  id: string;
  /** Null for the public/global build. */
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  /** Full value — embed as EXPO_PUBLIC_APP_KEY in the build profile. */
  appKey: string;
  label: string;
  scope: AppKeyScope;
  status: AppKeyStatus;
  notes: string | null;
  /** Stamped when a build calls /app/bootstrap. Null = never shipped. */
  lastSeenAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface TenantEmailDomain {
  id: string;
  tenantId: string;
  tenantName: string | null;
  tenantSlug: string | null;
  domain: string;
  createdAt: string;
}

const BASE = '/api/v1/platform/mobile-app-keys';

export async function listAppKeys(): Promise<MobileAppKey[]> {
  return apiJson<MobileAppKey[]>(BASE);
}

/** Omit `tenantId` (or pass null) to mint a PUBLIC key. */
export async function createAppKey(req: {
  tenantId?: string | null;
  label: string;
  notes?: string | null;
}): Promise<MobileAppKey> {
  return apiJson<MobileAppKey>(BASE, { method: 'POST', json: req });
}

/** Irreversible — there is no un-revoke. Builds carrying the key stop
 *  resolving at bootstrap, so mint a new key and ship a new build. */
export async function revokeAppKey(id: string): Promise<MobileAppKey> {
  return apiJson<MobileAppKey>(`${BASE}/${id}/revoke`, { method: 'POST' });
}

// ─── Email domains ───────────────────────────────────────────────

export async function listDomains(): Promise<TenantEmailDomain[]> {
  return apiJson<TenantEmailDomain[]>(`${BASE}/domains`);
}

/** Server rejects shared providers (gmail.com etc.) and any domain
 *  already claimed by another tenant — resolution must be unambiguous. */
export async function addDomain(tenantId: string, domain: string): Promise<TenantEmailDomain> {
  return apiJson<TenantEmailDomain>(`${BASE}/domains`, {
    method: 'POST',
    json: { tenantId, domain },
  });
}

export async function removeDomain(id: string): Promise<void> {
  return apiVoid(`${BASE}/domains/${id}`, { method: 'DELETE' });
}
