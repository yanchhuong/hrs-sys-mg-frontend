import { apiJson, apiVoid } from './client';

export type PayrollCategoryKind = 'earning' | 'deduction';
export type PayrollCategoryValueType = 'flat' | 'percentage' | 'day';
/** Salary-type tokens recognised by the backend (V113). Match the
 *  Payroll batch dropdown labels — 1st Salary / 2nd Salary / One
 *  Time Salary. Stale tokens are dropped server-side. */
export type SalaryTypeToken = '1st' | '2nd' | 'onetime';

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
  /** Salary types this category participates in (V113). Empty array
   *  means the category exists but no batch type generates it. */
  enabledSalaryTypes: SalaryTypeToken[];
  /** Salary types this category is allowed to appear on at all
   *  (V114). The settings dialog hides rows whose active tab isn't
   *  in this list. Most categories carry all three tokens; the
   *  domain-locked "1st Salary" earning/deduction pair narrows to
   *  '1st' / '2nd' respectively. */
  applicableSalaryTypes: SalaryTypeToken[];
}

export interface CreatePayrollCategoryRequest {
  code: string;
  label: string;
  kind: PayrollCategoryKind;
  valueType: PayrollCategoryValueType;
  defaultAmount?: number;
  order?: number;
  enabled?: boolean;
  enabledSalaryTypes?: SalaryTypeToken[];
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

/** Wipe user-added categories and reset the system defaults on the
 *  backend. Returns the full post-restore list so the page can swap
 *  state in one round trip. */
export async function restoreDefaults(): Promise<PayrollCategory[]> {
  return apiJson('/api/v1/payroll-categories/restore-defaults', { method: 'POST' });
}
