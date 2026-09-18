/**
 * PayWay beneficiary registry (V168). One row per (tenant, employee)
 * — re-submitting after a bank change updates the same row in place.
 *
 * <p>Stage 1: backend uses a stubbed Add Beneficiary call (returns a
 * synthetic {@code BEN0xxxxxx} ID) so the end-to-end UX can be
 * reviewed before the real PayWay endpoint is wired.</p>
 */
import { apiFetch, apiJson } from './client';

export type PayWayBeneficiaryStatus = 'pending' | 'active' | 'failed' | 'archived';

export interface PayWayBeneficiary {
  id:             string;
  employeeId:     string;
  /** PayWay's returned ID (e.g. {@code BEN000123}). Null on
   *  {@code pending} / {@code failed} rows. */
  beneficiaryId:  string | null;
  fullName:       string;
  bank:           string;
  accountNumber:  string;
  phone:          string | null;
  status:         PayWayBeneficiaryStatus;
  /** Gateway's raw response — used to surface the error message
   *  inline when {@code status === 'failed'}. */
  rawResponse:    string | null;
  requestedAt:    string;
  completedAt:    string | null;
  updatedAt:      string;
}

export interface PayWayBeneficiaryRequest {
  employeeId:     string;
  fullName:       string;
  bank:           string;
  accountNumber:  string;
  phone?:         string;
}

const BASE = '/api/v1/payway/beneficiaries';

/** Look up a single employee's beneficiary. Returns {@code null} on
 *  204 (no registration yet) so callers don't have to differentiate
 *  "never submitted" from a transport error.
 *
 *  <p>Uses {@link apiFetch} (not bare {@code fetch}) so the request
 *  picks up {@link API_BASE} + the JWT — bare fetch would hit the
 *  Vite dev server and return its {@code index.html} catch-all,
 *  blowing up the JSON parser.</p> */
export async function getForEmployee(employeeId: string): Promise<PayWayBeneficiary | null> {
  const r = await apiFetch(`${BASE}/${encodeURIComponent(employeeId)}`);
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(`Beneficiary lookup failed: ${r.status}`);
  return r.json();
}

/**
 * Ids per request. The ids travel in the QUERY STRING — one
 * {@code ids=<uuid>} is ~41 bytes — and Tomcat's default
 * {@code maxHttpHeaderSize} (8 KB) has to cover the whole request
 * line PLUS every header, JWT included. 50 keeps each URL near 2 KB
 * with comfortable headroom.
 */
const BATCH_SIZE = 50;

/**
 * Batch lookup — used by the Employees roster and the Payroll page's
 * readiness column.
 *
 * <p>Chunked, and that is not premature: unbatched, a 246-person
 * roster produced a 10.6 KB URL and Tomcat rejected it with a 400.
 * That rejection happens at the connector, <em>before</em> the CORS
 * filter runs, so the response carries no CORS headers and the
 * browser surfaces it as a bare network failure rather than an HTTP
 * error. {@code apiFetch} reads a network failure as "the API is
 * unreachable", clears the token and routes to LandingPage — so
 * simply opening the Employees page logged the operator out, on any
 * tenant whose headcount pushed the URL past the limit.</p>
 *
 * <p>Note the caller's {@code .catch()} cannot save you from that:
 * the token is cleared inside {@code apiFetch} before it throws.
 * Keeping the URL bounded is the fix, not error handling.</p>
 */
export async function getBatch(employeeIds: string[]): Promise<PayWayBeneficiary[]> {
  if (employeeIds.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < employeeIds.length; i += BATCH_SIZE) {
    chunks.push(employeeIds.slice(i, i + BATCH_SIZE));
  }
  const pages = await Promise.all(chunks.map(chunk => {
    const q = new URLSearchParams();
    for (const id of chunk) q.append('ids', id);
    return apiJson<PayWayBeneficiary[]>(`${BASE}?${q.toString()}`);
  }));
  return pages.flat();
}

export async function submit(req: PayWayBeneficiaryRequest): Promise<PayWayBeneficiary> {
  return apiJson(BASE, { method: 'POST', json: req });
}

export async function archive(employeeId: string): Promise<void> {
  return apiJson(`${BASE}/${encodeURIComponent(employeeId)}/archive`, { method: 'POST' });
}

/** Curated picker for the Bank/Wallet dropdown. Free-text on the
 *  backend so a tenant can record providers PayWay later supports;
 *  the FE picker is just the common Cambodian rails. */
export const BANK_OPTIONS = [
  'ABA',
  'WING',
  'ACLEDA',
  'CANADIA',
  'TRUE_MONEY',
  'BAKONG',
  'OTHER',
] as const;
