import { apiJson, apiVoid } from './client';

/**
 * Tenant-scoped storage location (V149). Used as the optional FK on
 * each stock item when the tenant has the warehouse feature on.
 */
export interface Warehouse {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WarehouseRequest {
  name: string;
  code?: string;
  address?: string;
  enabled?: boolean;
}

export async function list(): Promise<Warehouse[]> {
  return apiJson('/api/v1/warehouses');
}

export async function create(req: WarehouseRequest): Promise<Warehouse> {
  return apiJson('/api/v1/warehouses', { method: 'POST', json: req });
}

export async function update(id: string, req: WarehouseRequest): Promise<Warehouse> {
  return apiJson(`/api/v1/warehouses/${id}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/warehouses/${id}`, { method: 'DELETE' });
}
