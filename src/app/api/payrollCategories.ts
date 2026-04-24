import { apiJson, apiVoid } from './client';

export type PayrollCategoryKind = 'earning' | 'deduction';
export type PayrollCategoryValueType = 'flat' | 'percentage';

export interface PayrollCategory {
  id: string;
  code: string;
  label: string;
  kind: PayrollCategoryKind;
  valueType: PayrollCategoryValueType;
  defaultAmount: number;
  order: number;
  enabled: boolean;
  system: boolean;
}

export interface CreatePayrollCategoryRequest {
  code: string;
  label: string;
  kind: PayrollCategoryKind;
  valueType: PayrollCategoryValueType;
  defaultAmount?: number;
  order?: number;
  enabled?: boolean;
}

export async function list(params: { kind?: PayrollCategoryKind; enabled?: boolean } = {}): Promise<PayrollCategory[]> {
  return apiJson('/api/v1/payroll-categories', { query: { ...params } });
}

export async function create(req: CreatePayrollCategoryRequest): Promise<PayrollCategory> {
  return apiJson('/api/v1/payroll-categories', { method: 'POST', json: req });
}

export async function update(id: string, req: Partial<CreatePayrollCategoryRequest>): Promise<PayrollCategory> {
  return apiJson(`/api/v1/payroll-categories/${id}`, { method: 'PATCH', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/payroll-categories/${id}`, { method: 'DELETE' });
}

export async function reorder(ids: string[]): Promise<PayrollCategory[]> {
  return apiJson('/api/v1/payroll-categories/reorder', {
    method: 'POST',
    json: { ids },
  });
}
