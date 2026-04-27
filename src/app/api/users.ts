import { apiJson, apiVoid } from './client';

export type UserRole = 'admin' | 'manager' | 'employee';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  employeeId?: string | null;
  departmentId?: string | null;
  isActive: boolean;
  lastLogin?: string | null;
  createdAt?: string;
}

export interface CreateUserRequest {
  email: string;
  /** Backend field name is `initialPassword`. Optional — server may
   *  generate one if missing. */
  initialPassword?: string;
  role: UserRole;
  employeeId?: string;
  departmentId?: string;
}

export interface UpdateUserRequest {
  role?: UserRole;
  employeeId?: string | null;
  departmentId?: string | null;
  isActive?: boolean;
}

export interface ListParams {
  q?: string;
  role?: UserRole | '';
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

export async function list(params: ListParams = {}): Promise<PagedResponse<User>> {
  return apiJson('/api/v1/users', { query: { ...params } });
}

export async function get(id: string): Promise<User> {
  return apiJson(`/api/v1/users/${id}`);
}

export async function create(req: CreateUserRequest): Promise<User> {
  return apiJson('/api/v1/users', { method: 'POST', json: req });
}

export async function update(id: string, req: UpdateUserRequest): Promise<User> {
  // Backend uses PATCH (partial update), not PUT.
  return apiJson(`/api/v1/users/${id}`, { method: 'PATCH', json: req });
}

export async function suspend(id: string): Promise<User> {
  return apiJson(`/api/v1/users/${id}/suspend`, { method: 'POST' });
}

export async function reactivate(id: string): Promise<User> {
  return apiJson(`/api/v1/users/${id}/reactivate`, { method: 'POST' });
}

/** Backend returns 202 Accepted with no body — it sends the reset link
 *  out-of-band. Fire-and-forget. */
export async function resetPassword(id: string): Promise<void> {
  return apiVoid(`/api/v1/users/${id}/reset-password`, { method: 'POST' });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/users/${id}`, { method: 'DELETE' });
}
