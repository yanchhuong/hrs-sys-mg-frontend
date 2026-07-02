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

/** Batch lookup — used by the Payroll page's readiness column. */
export async function getBatch(employeeIds: string[]): Promise<PayWayBeneficiary[]> {
  if (employeeIds.length === 0) return [];
  const q = new URLSearchParams();
  for (const id of employeeIds) q.append('ids', id);
  return apiJson(`${BASE}?${q.toString()}`);
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
