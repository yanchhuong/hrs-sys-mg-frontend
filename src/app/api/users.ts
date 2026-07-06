import { apiJson, apiVoid } from './client';

export type UserRole = 'admin' | 'manager' | 'employee';

export interface User {
  id: string;
  email: string;
  /** V146 — optional secondary login identifier. Null when the user
   *  signs in by email only. */
  username?: string | null;
  /** V140 — display name shown across the app. Null falls back to
   *  the linked Employee's name → email. */
  name?: string | null;
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
  /** V146 — optional, 3..64 chars from [a-z0-9._-]. Lowercased on
   *  the server before save. */
  username?: string;
  /** V140 — display name. Auto-populated from the picked Employee's
   *  name in the create dialog; the operator can override. */
  name?: string;
}

export interface UpdateUserRequest {
  role?: UserRole;
  employeeId?: string | null;
  departmentId?: string | null;
  isActive?: boolean;
  /** Optional new password. Empty / undefined = keep current.
   *  Server re-hashes via BCrypt. For a random temporary password,
   *  use {@link resetPassword} instead. */
  password?: string;
  /** V146 — PATCH semantics:
   *   undefined → leave alone
   *   ""        → clear (back to email-only login)
   *   value     → set (per-tenant uniqueness enforced server-side) */
  username?: string;
  /** V140 — same PATCH semantics as {@link username}. */
  name?: string;
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
