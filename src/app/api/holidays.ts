import { apiJson } from './client';

/**
 * Tenant-scoped holiday calendar. Used by the Announcements module
 * (V123) to pull the list of public holidays for the "link to
 * holiday" picker on the create dialog.
 */
export interface Holiday {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** 'public' | 'company' — the picker filters to 'public'. */
  type: string;
  isPaid: boolean;
  description: string | null;
  clonedFromId: string | null;
}

export interface ListParams {
  year?: number;
  type?: string;
}

export async function list(params: ListParams = {}): Promise<Holiday[]> {
  const q: Record<string, string | number> = {};
  if (params.year != null) q.year = params.year;
  if (params.type)         q.type = params.type;
  return apiJson('/api/v1/settings/holidays', { query: q });
}
