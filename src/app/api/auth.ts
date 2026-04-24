import { apiJson, setToken, USER_KEY, TOKEN_KEY, TENANT_KEY } from './client';

export interface LoginRequest {
  email: string;
  password: string;
  tenantSlug?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'manager' | 'employee';
  employeeId?: string;
  tenantSlug: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export async function login(req: LoginRequest): Promise<AuthUser> {
  const res = await apiJson<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    json: req,
    auth: false,
  });
  setToken(res.token);
  localStorage.setItem(USER_KEY, JSON.stringify(res.user));
  if (res.user.tenantSlug) localStorage.setItem(TENANT_KEY, res.user.tenantSlug);
  return res.user;
}

export async function me(): Promise<AuthUser> {
  return apiJson<AuthUser>('/api/v1/auth/me');
}

export function logout(): void {
  setToken(null);
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TENANT_KEY);
  }
}

export function cachedUser(): AuthUser | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUser; } catch { return null; }
}

export function isAuthenticated(): boolean {
  return typeof localStorage !== 'undefined' && !!localStorage.getItem(TOKEN_KEY);
}

export async function changePassword(req: { currentPassword: string; newPassword: string }): Promise<void> {
  await apiJson('/api/v1/auth/change-password', { method: 'POST', json: req });
}
