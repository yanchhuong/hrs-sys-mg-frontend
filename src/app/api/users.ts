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
  /** V-user-email-editable — update the login email. Non-null values
   *  are trimmed + lowercased server-side and enforced unique per
   *  tenant. Empty string is rejected (400) — every user needs SOME
   *  identifier; switch to username-only by adding a username without
   *  clearing the email. */
  email?: string;
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

/** V-admin-reset-email — admin-triggered password reset email. Reuses
 *  the same self-service /reset-password token pipeline the FE
 *  Forgot-Password flow uses. Backend returns 202 Accepted. Throws
 *  400 if the user row has no email (rare — typically ex-employees
 *  or username-only logins); the caller should offer
 *  {@link resetToDefault} instead in that case. */
export async function resetPassword(id: string): Promise<void> {
  return apiVoid(`/api/v1/users/${id}/reset-password`, { method: 'POST' });
}

/** V-admin-default-password — sets the user's password to the well-
 *  known default "qwer1234!". Use when the user can't receive email
 *  (no address on file, mailbox down) and the admin can read the
 *  credential aloud on a support call. Users MUST change it via
 *  Profile → Change Password or the Forgot Password flow ASAP.
 *  Backend returns 202 Accepted. */
export async function resetToDefault(id: string): Promise<void> {
  return apiVoid(`/api/v1/users/${id}/reset-to-default`, { method: 'POST' });
}

/** Shared literal so the FE toast + confirm dialog show the exact
 *  password the backend assigns — keep in sync with
 *  UserService.ADMIN_DEFAULT_PASSWORD. */
export const ADMIN_DEFAULT_PASSWORD = 'qwer1234!';

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/users/${id}`, { method: 'DELETE' });
}
