import { apiJson, apiVoid } from './client';

/**
 * Per-tenant Cash Advance Purpose presets (V159).
 *
 * <p>Feeds the dropdown in the New Advance dialog. The
 * {@code advance.purpose} column stays free-text — this list is a
 * picker speed-up, not a foreign key.</p>
 */
export interface CashAdvancePurpose {
  id: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
}

export interface UpsertRequest {
  label: string;
  sortOrder?: number | null;
  enabled?: boolean | null;
}

export async function list(): Promise<CashAdvancePurpose[]> {
  return apiJson('/api/v1/cash-advances/purposes');
}

export async function create(req: UpsertRequest): Promise<CashAdvancePurpose> {
  return apiJson('/api/v1/cash-advances/purposes', { method: 'POST', json: req });
}

export async function update(id: string, req: UpsertRequest): Promise<CashAdvancePurpose> {
  return apiJson(`/api/v1/cash-advances/purposes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    json: req,
  });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/cash-advances/purposes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
