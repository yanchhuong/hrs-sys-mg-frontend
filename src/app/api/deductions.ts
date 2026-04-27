import { apiJson, apiVoid } from './client';

export type DeductionStatus = 'active' | 'completed' | 'cancelled';

export interface SalaryDeduction {
  id: string;
  employeeId: string;
  employeeName?: string;
  name: string;
  type: string;
  amount: number;
  isPercentage?: boolean;
  isRecurring?: boolean;
  startDate: string;
  endDate?: string | null;
  status: DeductionStatus;
  createdAt: string;
}

export interface CreateDeductionRequest {
  employeeId: string;
  name: string;
  type: string;
  amount: number;
  isPercentage?: boolean;
  isRecurring?: boolean;
  startDate: string;
  endDate?: string | null;
  status?: DeductionStatus;
}

export interface ListParams {
  employeeId?: string;
  type?: string;
  status?: DeductionStatus | '';
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

export async function list(params: ListParams = {}): Promise<PagedResponse<SalaryDeduction>> {
  return apiJson('/api/v1/salary-deductions', { query: { ...params } });
}

export async function create(req: CreateDeductionRequest): Promise<SalaryDeduction> {
  return apiJson('/api/v1/salary-deductions', { method: 'POST', json: req });
}

export async function update(id: string, req: CreateDeductionRequest): Promise<SalaryDeduction> {
  return apiJson(`/api/v1/salary-deductions/${id}`, { method: 'PUT', json: req });
}

/**
 * Backend exposes status changes via the bulk endpoint. Pass a single id to
 * change one row, or a list to change many in a single round-trip.
 */
export async function setStatus(
  ids: string | string[],
  status: DeductionStatus,
): Promise<{ updated: number }> {
  const idList = Array.isArray(ids) ? ids : [ids];
  return apiJson('/api/v1/salary-deductions/bulk-status', {
    method: 'POST',
    json: { ids: idList, status },
  });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/salary-deductions/${id}`, { method: 'DELETE' });
}
