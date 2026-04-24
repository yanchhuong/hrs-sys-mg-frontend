import { apiJson, apiVoid } from './client';

export type ContractStatus = 'active' | 'expired' | 'terminated';

export interface Contract {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  position?: string;
  baseSalary?: number;
  notes?: string;
  createdAt?: string;
}

export interface CreateContractRequest {
  employeeId: string;
  startDate: string;
  endDate: string;
  position?: string;
  baseSalary?: number;
  notes?: string;
}

export interface ListParams {
  employeeId?: string;
  status?: ContractStatus | '';
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

export async function list(params: ListParams = {}): Promise<PagedResponse<Contract>> {
  return apiJson('/api/v1/contracts', { query: { ...params } });
}

export async function byEmployee(employeeId: string): Promise<Contract[]> {
  return apiJson(`/api/v1/employees/${employeeId}/contracts`);
}

export async function create(req: CreateContractRequest): Promise<Contract> {
  return apiJson('/api/v1/contracts', { method: 'POST', json: req });
}

export async function renew(id: string, req: { endDate: string; baseSalary?: number }): Promise<Contract> {
  return apiJson(`/api/v1/contracts/${id}/renew`, { method: 'POST', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/contracts/${id}`, { method: 'DELETE' });
}
