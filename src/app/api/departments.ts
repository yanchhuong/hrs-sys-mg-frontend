import { apiJson, apiVoid } from './client';

export interface Department {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string;
}

export interface CreateDepartmentRequest {
  name: string;
  description?: string;
}

export async function list(): Promise<Department[]> {
  return apiJson<Department[]>('/api/v1/departments');
}

export async function create(req: CreateDepartmentRequest): Promise<Department> {
  return apiJson<Department>('/api/v1/departments', { method: 'POST', json: req });
}

export async function update(id: string, req: CreateDepartmentRequest): Promise<Department> {
  return apiJson<Department>(`/api/v1/departments/${id}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/departments/${id}`, { method: 'DELETE' });
}
