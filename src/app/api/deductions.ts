import { apiJson, apiVoid } from './client';

export type DeductionStatus = 'active' | 'stopped' | 'completed';

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
  remarks?: string;
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
  remarks?: string;
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

export async function setStatus(id: string, status: DeductionStatus): Promise<SalaryDeduction> {
  return apiJson(`/api/v1/salary-deductions/${id}/status`, {
    method: 'PATCH',
    json: { status },
  });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/salary-deductions/${id}`, { method: 'DELETE' });
}
