import { apiJson, apiVoid } from './client';

/**
 * System-wide holiday catalog (V124). Super Admin maintains a single
 * shared list; every tenant sees the rows automatically and can
 * one-click "Copy" any of them into their own holidays table.
 */
export interface SystemHoliday {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** 'public' | 'company' */
  type: string;
  isPaid: boolean;
  description: string | null;
}

export interface SystemHolidayRequest {
  name: string;
  date: string;
  type?: string;
  isPaid?: boolean;
  description?: string;
}

/* ----- Tenant read-only (any signed-in user) ----- */

/** Tenant pages call this to show the system catalog alongside their
 *  own holidays. No tenant context required — the list is global. */
export async function tenantList(year?: number): Promise<SystemHoliday[]> {
  const q: Record<string, number> = {};
  if (year != null) q.year = year;
  return apiJson('/api/v1/system-holidays', { query: q });
}

/* ----- Super Admin CRUD ----- */

export async function adminList(year?: number): Promise<SystemHoliday[]> {
  const q: Record<string, number> = {};
  if (year != null) q.year = year;
  return apiJson('/api/v1/platform/system-holidays', { query: q });
}

export async function adminCreate(req: SystemHolidayRequest): Promise<SystemHoliday> {
  return apiJson('/api/v1/platform/system-holidays', { method: 'POST', json: req });
}

export async function adminUpdate(id: string, req: SystemHolidayRequest): Promise<SystemHoliday> {
  return apiJson(`/api/v1/platform/system-holidays/${id}`, { method: 'PATCH', json: req });
}

export async function adminDelete(id: string): Promise<void> {
  return apiVoid(`/api/v1/platform/system-holidays/${id}`, { method: 'DELETE' });
}

/* ----- Tenant copy actions (live on the tenant Holiday API) ----- */

/** Copy one system row into the current tenant's holidays. When
 *  {@code targetYear} is supplied the copy's date is shifted to that
 *  year keeping the source's month + day — useful for the "public
 *  holidays repeat yearly" workflow. Server refuses if the tenant
 *  already has a holiday with the same (date, name) so a double-click
 *  doesn't duplicate. */
export async function copyOne(systemHolidayId: string, targetYear?: number): Promise<unknown> {
  const q: Record<string, number> = {};
  if (targetYear != null) q.targetYear = targetYear;
  return apiJson(`/api/v1/settings/holidays/copy-from-system/${systemHolidayId}`,
    { method: 'POST', query: q });
}

/** Bulk-copy every system holiday from source {@code year} into the
 *  tenant's table. When {@code targetYear} differs from {@code year}
 *  the dates are shifted. Idempotent: skips rows the tenant already
 *  has at the resulting (date, name). Returns the freshly-inserted
 *  rows (NOT the full list). */
export async function copyAll(year: number, targetYear?: number): Promise<unknown[]> {
  const q: Record<string, number> = { year };
  if (targetYear != null) q.targetYear = targetYear;
  return apiJson('/api/v1/settings/holidays/copy-all-from-system',
    { method: 'POST', query: q });
}
