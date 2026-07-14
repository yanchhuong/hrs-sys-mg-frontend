import { apiJson } from './client';

/* ================================================================
 * Agency-workspace maintenance hooks (MVP #2 + #4 + #5).
 * All under /api/v1/agency/hooks/ + /api/v1/agency/tax-calendar/
 * — no X-Client-Tenant header required.
 * ================================================================ */

export interface SweepResult {
  opened: number;
  skipped: number;
}

/** MVP #2 — orphan-docs (invoices/bills/receipts with no attachment). */
export function sweepMissingDocs(clientTenantId: string): Promise<SweepResult> {
  return apiJson<SweepResult>('/api/v1/agency/hooks/sweep-missing-docs', {
    method: 'POST',
    query: { clientTenantId },
  });
}

/** MVP #5 — bill-side anomaly heuristics (duplicate, round-thousand, high-value). */
export function sweepAnomalies(clientTenantId: string): Promise<SweepResult> {
  return apiJson<SweepResult>('/api/v1/agency/hooks/sweep-anomalies', {
    method: 'POST',
    query: { clientTenantId },
  });
}
