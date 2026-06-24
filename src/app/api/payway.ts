import { apiJson } from './client';

/**
 * Per-tenant PayWay (ABA) payment-gateway credentials (V144).
 *
 * The actual API key never leaves the server — the GET endpoint
 * returns only an "•••• 1234" preview so the operator can confirm
 * which key is saved without retyping the secret. The push URL is
 * fully composed server-side (joining the configured public base
 * URL with the tenant's rotating token), so the FE can render it
 * as a copy-paste-ready value for the PayWay dashboard.
 */
export type PayWayEnvironment = 'sandbox' | 'live';

export interface PayWayCredentials {
  /** True when a row exists for this tenant — drives the dialog's
   *  "first save" vs "edit" mode. */
  configured: boolean;
  enabled: boolean;
  environment: PayWayEnvironment;
  merchantId: string;
  /** Last-4 preview of the saved API key, masked. Null when no
   *  key is saved yet or when the server can't decrypt (missing
   *  PAYWAY_ENCRYPTION_KEY env var). */
  apiKeyPreview: string | null;
  /** Full webhook URL the tenant pastes into the PayWay dashboard. */
  pushUrl: string;
  updatedAt: string | null;
}

export interface PayWayCredentialsRequest {
  enabled: boolean;
  environment: PayWayEnvironment;
  merchantId: string;
  /** Plaintext API key. Empty / undefined = leave the existing
   *  stored key untouched (lets the operator edit other fields
   *  without retyping the secret). */
  apiKey?: string;
}

export async function getCredentials(): Promise<PayWayCredentials> {
  return apiJson('/api/v1/payway/credentials');
}

export async function saveCredentials(req: PayWayCredentialsRequest): Promise<PayWayCredentials> {
  return apiJson('/api/v1/payway/credentials', { method: 'PUT', json: req });
}

/** Rotate the public webhook token. The dialog calls this when the
 *  operator clicks "Rotate" — the returned pushUrl is the new value
 *  they need to paste into the PayWay dashboard. */
export async function rotatePushToken(): Promise<PayWayCredentials> {
  return apiJson('/api/v1/payway/credentials/rotate-push-token', { method: 'POST' });
}
