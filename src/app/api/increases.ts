import { apiJson, apiVoid } from './client';

export interface SalaryIncrease {
  id: string;
  employeeId: string;
  employeeName?: string;
  type: string;
  amount: number;
  effectiveDate: string;
  reason?: string;
  createdAt: string;
}

export interface CreateIncreaseRequest {
  employeeId: string;
  type: string;
  amount: number;
  effectiveDate: string;
  reason?: string;
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
