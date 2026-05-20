import { apiJson, apiVoid } from './client';

export type ContractStatus = 'active' | 'expired' | 'terminated';

export type TerminationReason = 'natural' | 'misconduct' | 'mutual' | 'resignation' | 'other';

export interface Contract {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  status: ContractStatus | string;
  /** One of UDC | FDC | Probation | Internship (V64). */
  contractType: string;
  salary?: number;
  notes?: string;
  /** ID of the contract this one renewed (set by the backend renew endpoint). */
  renewedFromId?: string | null;
  /** Why the contract ended. null = active / treat as natural expiry.
   *  'misconduct' forfeits the 5% FDC severance per Cambodian Labour Law (V66). */
  terminationReason?: TerminationReason | string | null;
  createdAt?: string;
}

/** Body shape for create / update / renew — backend accepts the same record. */
export interface ContractRequest {
  startDate: string;
  endDate: string;
  contractType: string;
  salary?: number | null;
  notes?: string;
  terminationReason?: TerminationReason | string | null;
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

/**
 * Create a new contract for the given employee. Backend route is
 * `POST /api/v1/employees/{id}/contracts`.
 */
export async function create(employeeId: string, req: ContractRequest): Promise<Contract> {
  return apiJson(`/api/v1/employees/${employeeId}/contracts`, { method: 'POST', json: req });
}

/** Update an existing contract in place (PATCH). */
export async function update(id: string, req: ContractRequest): Promise<Contract> {
  return apiJson(`/api/v1/contracts/${id}`, { method: 'PATCH', json: req });
}

/**
 * Renew creates a new contract row and marks the previous one expired. The
 * backend reuses the same request shape; pass full new-contract data.
 */
export async function renew(id: string, req: ContractRequest): Promise<Contract> {
  return apiJson(`/api/v1/contracts/${id}/renew`, { method: 'POST', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/contracts/${id}`, { method: 'DELETE' });
}
