import { apiJson, apiVoid } from './client';

export type VendorType = 'individual' | 'business';

export interface Vendor {
  id: string;
  type: VendorType;
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

export interface VendorRequest {
  type: VendorType;
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
  type?: VendorType | '';
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

export async function list(params: ListParams = {}): Promise<PagedResponse<Vendor>> {
  const q: Record<string, string | number> = {};
  if (params.q) q.q = params.q;
  if (params.type) q.type = params.type;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  return apiJson('/api/v1/vendors', { query: q });
}

export async function get(id: string): Promise<Vendor> {
  return apiJson(`/api/v1/vendors/${id}`);
}

export async function create(req: VendorRequest): Promise<Vendor> {
  return apiJson('/api/v1/vendors', { method: 'POST', json: req });
}

export async function update(id: string, req: VendorRequest): Promise<Vendor> {
  return apiJson(`/api/v1/vendors/${id}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/vendors/${id}`, { method: 'DELETE' });
}
