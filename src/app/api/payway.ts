import { apiFetch, apiJson } from './client';

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

/* ============================================================== */
/*                        POS purchase flow                       */
/* ============================================================== */

export type PayWaySessionStatus = 'pending' | 'paid' | 'cancelled' | 'failed';

export interface PurchaseSession {
  tranId: string;
  /** Echoed server-side endpoint URL (mostly diagnostic). */
  checkoutEndpoint: string | null;
  /** {@code data:image/png;base64,...} from PayWay — render directly
   *  in an {@code <img>} tag on the customer display. */
  qrDataUrl: string | null;
  /** Hosted-checkout URL for the web flow. Null on QR-only sessions. */
  checkoutUrl: string | null;
  status: PayWaySessionStatus;
}

export interface PosPurchaseRequest {
  amount: number;
  currency?: 'USD' | 'KHR';
  /** Defaults to {@code abapay_khqr_deeplink} server-side. */
  paymentOption?: string;
  customerName?: string;
  returnUrl?: string;
  posOrderId?: string;
}

export async function createPosPurchase(req: PosPurchaseRequest): Promise<PurchaseSession> {
  return apiJson('/api/v1/payway/pos/create-purchase', { method: 'POST', json: req });
}

export async function getStatus(tranId: string): Promise<PurchaseSession> {
  return apiJson(`/api/v1/payway/pos/status/${encodeURIComponent(tranId)}`);
}

export async function cancelSession(tranId: string): Promise<void> {
  return apiJson(`/api/v1/payway/pos/cancel/${encodeURIComponent(tranId)}`, { method: 'POST' });
}

/* ============================================================== */
/*                    Invoice Payment Link flow                   */
/* ============================================================== */

/** Mint a hosted-checkout URL for the given invoice. Idempotent on
 *  the server — if a pending session already exists for this invoice
 *  it's reused; otherwise a new one is minted. */
export async function createInvoicePaymentLink(invoiceId: string): Promise<PurchaseSession> {
  return apiJson(`/api/v1/payway/invoices/${encodeURIComponent(invoiceId)}/payment-link`, { method: 'POST' });
}

/* ============================================================== */
/*                     Exchange-rate proxy                        */
/* ============================================================== */

/** One side of a quoted FX pair — PayWay returns these as strings
 *  to avoid float quirks, the FE parses with {@code Number()}. */
export interface PayWayRateSide {
  sell: string;
  buy:  string;
}

/** Loose shape — PayWay's response carries one entry per supported
 *  currency (krw / jpy / eur / cny / …) plus a {@code status}
 *  block. We don't enumerate every key because the merchant guide
 *  notes the set can grow; the FE looks up just the ISO code it
 *  needs. */
export interface PayWayExchangeRateResponse {
  status?: { code: string; message: string };
  /** Sub-object PayWay tucked under {@code exchange_rates} for AUD
   *  and SGD per the public docs; everything else is at the top
   *  level. */
  exchange_rates?: Record<string, PayWayRateSide>;
  [currency: string]: unknown;
}

/** Fetch the gateway's current FX table. Requires PayWay
 *  credentials to be saved + enabled — server returns 400 with the
 *  gateway's message otherwise. */
export async function getExchangeRate(): Promise<PayWayExchangeRateResponse> {
  return apiJson('/api/v1/payway/exchange-rate');
}

/** Resolve a currency's sell rate (units against the merchant's
 *  home settlement currency) from a PayWay response. Returns null
 *  when the code isn't present in the response — e.g., USD which
 *  PayWay treats as the implicit base. */
export function pickRate(resp: PayWayExchangeRateResponse, code: string): number | null {
  const key = code.toLowerCase();
  const top = resp[key] as PayWayRateSide | undefined;
  if (top && typeof top === 'object' && top.sell) {
    const n = Number(top.sell);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const nested = resp.exchange_rates?.[key];
  if (nested && nested.sell) {
    const n = Number(nested.sell);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** Read-only lookup for an existing paylink. Returns {@code null}
 *  when no session has been minted for this invoice yet (server
 *  signals this with HTTP 204). The Invoice detail dialog calls this
 *  on open so an auto-minted link surfaces without a click.
 *
 *  <p>Uses {@link apiFetch} (not bare {@code fetch}) so the request
 *  picks up {@link API_BASE} + the JWT — bare fetch would hit the
 *  Vite dev server's {@code index.html} catch-all in dev mode. */
export async function findInvoicePaymentLink(invoiceId: string): Promise<PurchaseSession | null> {
  const r = await apiFetch(`/api/v1/payway/invoices/${encodeURIComponent(invoiceId)}/payment-link`);
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(`Lookup failed: ${r.status}`);
  return r.json();
}

/** Same status poll as the POS flow, lifted to the invoice namespace
 *  so the Invoice detail dialog doesn't have to call a POS-permissioned
 *  endpoint to learn whether the customer has paid. */
export async function getInvoicePaymentStatus(tranId: string): Promise<PurchaseSession> {
  return apiJson(`/api/v1/payway/invoices/status/${encodeURIComponent(tranId)}`);
}
