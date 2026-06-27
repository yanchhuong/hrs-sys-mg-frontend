import { apiJson } from './client';

/** Page key for the per-tenant payroll-category card hide-list (V154). */
export type CardPage = 'increase' | 'deduction';

/** Hidden category codes for one (tenant, page) pair. The FE filters
 *  the on-page card strip against this list. Absence = visible. */
export async function getHiddenCodes(page: CardPage): Promise<string[]> {
  return apiJson(`/api/v1/payroll-category-card-visibility?page=${encodeURIComponent(page)}`);
}

/** Replace the persisted hide-list for one (tenant, page). Backend
 *  diffs against the current set in a single transaction. */
export async function setHiddenCodes(page: CardPage, hiddenCodes: string[]): Promise<string[]> {
  return apiJson(`/api/v1/payroll-category-card-visibility?page=${encodeURIComponent(page)}`, {
    method: 'PUT',
    json: { hiddenCodes },
  });
}
