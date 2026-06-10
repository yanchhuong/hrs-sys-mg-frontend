import { apiJson, apiVoid } from './client';

export type CustomerType = 'individual' | 'business';

export interface Customer {
  id: string;
  type: CustomerType;
  /** Individual: person name. Business: company name. */
  name: string;
  phone?: string | null;
  address?: string | null;
  tin?: string | null;
  representative?: string | null;
  site?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerRequest {
  type: CustomerType;
  name: string;
  phone?: string;
  address?: string;
  /** Required when type='business'; ignored otherwise. */
  tin?: string;
  representative?: string;
  site?: string;
}

export interface ListParams {
  q?: string;
  type?: CustomerType | '';
  page?: number;
  size?: number;
}

export interface PagedResponse<T> {
  /** Spring-page response uses `content` for the rows. */
  content: T[];
  number: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

export async function list(params: ListParams = {}): Promise<PagedResponse<Customer>> {
  const q: Record<string, string | number> = {};
  if (params.q) q.q = params.q;
  if (params.type) q.type = params.type;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  return apiJson('/api/v1/customers', { query: q });
}

export async function get(id: string): Promise<Customer> {
  return apiJson(`/api/v1/customers/${id}`);
}

export async function create(req: CustomerRequest): Promise<Customer> {
  return apiJson('/api/v1/customers', { method: 'POST', json: req });
}

export async function update(id: string, req: CustomerRequest): Promise<Customer> {
  return apiJson(`/api/v1/customers/${id}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/customers/${id}`, { method: 'DELETE' });
}
