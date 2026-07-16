import { apiJson } from './client';

/* ================================================================
 * v-commission-mvp — settings CRUD for sales-commission plans.
 * Mirrors the loyalty settings shape so the FE can share the same
 * list + upsert-dialog pattern.
 * ================================================================ */

export type CommissionType   = 'PER_INVOICE' | 'PER_ITEM' | 'TIERED';
export type CommissionStatus = 'ACTIVE' | 'INACTIVE';

export interface CommissionProgram {
  id: string;
  name: string;
  type: CommissionType;
  status: CommissionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCommissionProgram {
  name: string;
  type: CommissionType;
  status?: CommissionStatus;
}

export const commission = {
  list:   () => apiJson<CommissionProgram[]>('/api/v1/commission/programs'),
  get:    (id: string) => apiJson<CommissionProgram>(`/api/v1/commission/programs/${id}`),
  create: (req: UpsertCommissionProgram) =>
    apiJson<CommissionProgram>('/api/v1/commission/programs', { method: 'POST', json: req }),
  update: (id: string, req: UpsertCommissionProgram) =>
    apiJson<CommissionProgram>(`/api/v1/commission/programs/${id}`, { method: 'PATCH', json: req }),
  remove: (id: string) =>
    apiJson<void>(`/api/v1/commission/programs/${id}`, { method: 'DELETE' }),
};
