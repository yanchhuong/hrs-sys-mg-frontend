import { apiJson, apiVoid } from './client';

export type SalaryIncreaseUnit = 'amount' | 'percentage' | 'day';

export interface SalaryIncrease {
  id: string;
  employeeId: string;
  employeeName?: string;
  type: string;
  amount: number;
  isPercentage?: boolean;
  /** Explicit unit of {@link amount}. Falls back to `isPercentage` for legacy rows. */
  unit?: SalaryIncreaseUnit;
  effectiveDate: string;
  /** "once" = single payroll cycle, "monthly" = recurring through effectiveUntil. */
  recurrence?: 'once' | 'monthly';
  /** Inclusive end-date for monthly recurrence. Null = open-ended. Ignored when recurrence='once'. */
  effectiveUntil?: string | null;
  reason: string;
  approvedBy?: string | null;
  createdAt: string;
  /** Author + modifier audit. Display names resolved server-side. */
  createdById?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
}

export interface CreateIncreaseRequest {
  employeeId: string;
  type: string;
  amount: number;
  isPercentage?: boolean;
  unit?: SalaryIncreaseUnit;
  effectiveDate: string;
  /** Defaults to 'once' on the server when omitted. */
  recurrence?: 'once' | 'monthly';
  effectiveUntil?: string | null;
  /** Backend marks @NotBlank — must be a non-empty string. */
  reason: string;
}

export interface ListParams {
  employeeId?: string;
  type?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

export interface PagedResponse<T> {
  data: T[];
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

export async function list(params: ListParams = {}): Promise<PagedResponse<SalaryIncrease>> {
  return apiJson('/api/v1/salary-increases', { query: { ...params } });
}

export async function create(req: CreateIncreaseRequest): Promise<SalaryIncrease> {
  return apiJson('/api/v1/salary-increases', { method: 'POST', json: req });
}

export async function update(id: string, req: CreateIncreaseRequest): Promise<SalaryIncrease> {
  return apiJson(`/api/v1/salary-increases/${id}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/salary-increases/${id}`, { method: 'DELETE' });
}
