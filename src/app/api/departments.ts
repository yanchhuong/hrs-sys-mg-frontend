import { apiJson, apiVoid } from './client';

export interface Department {
  id: string;
  name: string;
  description?: string | null;
  /** Backend UUID of the assigned department manager (an employee). */
  managerId?: string | null;
  /** Backend UUID of the parent department/group. null = top-level. */
  parentId?: string | null;
  /** "department" | "group" | "team" — defaults to "department" on legacy rows. */
  type?: 'department' | 'group' | 'team' | string | null;
  createdAt?: string;
}

export interface CreateDepartmentRequest {
  name: string;
  description?: string;
  /** Pass the manager's backend UUID (employee.apiId), or null to clear. */
  managerId?: string | null;
  /** Pass another department's UUID to nest, or null for top-level. */
  parentId?: string | null;
  /** Optional — defaults to "department" server-side when omitted. */
  type?: 'department' | 'group' | 'team';
}

export async function list(): Promise<Department[]> {
  return apiJson<Department[]>('/api/v1/departments');
}

export async function create(req: CreateDepartmentRequest): Promise<Department> {
  return apiJson<Department>('/api/v1/departments', { method: 'POST', json: req });
}

export async function update(id: string, req: CreateDepartmentRequest): Promise<Department> {
  // Backend uses PATCH (partial update), not PUT.
  return apiJson<Department>(`/api/v1/departments/${id}`, { method: 'PATCH', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/departments/${id}`, { method: 'DELETE' });
}
