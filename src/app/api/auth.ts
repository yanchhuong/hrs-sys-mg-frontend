import { apiJson, apiFetch, ApiError, setToken, setActiveClientTenant, USER_KEY, TOKEN_KEY, TENANT_KEY } from './client';

export interface LoginRequest {
  email: string;
  password: string;
  tenantSlug?: string;
}

/** V222/V223 — agency users have their own JWT space. When
 *  {@code agencyId} is set, {@code tenantId} + {@code tenantSlug}
 *  are null and the client must route to the /agency workspace
 *  instead of the tenant home. Regular tenant users have
 *  {@code agencyId} null. Mutually exclusive today. */
export type AuthRole =
  | 'super_admin' | 'admin' | 'manager' | 'employee'
  | 'agency_partner' | 'agency_manager' | 'agency_senior' | 'agency_staff';

export interface AuthUser {
  id: string;
  email: string;
  role: AuthRole;
  employeeId?: string;
  /** UUID of the tenant this user belongs to (V190 — needed as the
   *  {@code doc_id} on tenant-scoped attachments like the clinic
   *  logo). Null for agency users. Backend returns it from
   *  {@code /api/v1/auth/me}. */
  tenantId: string | null;
  tenantSlug: string | null;
  /** V222 — populated only for agency users. */
  agencyId?: string | null;
  agencySlug?: string | null;
  /** V196 — clinical role tag on the linked employee (if any).
   *  Populated so Doctor-only affordances (e.g. the Diagnosis
   *  field on an appointment) render server-consistent without a
   *  follow-up lookup. Null when the user has no employee link,
   *  or the employee is untagged. */
  clinicalRole?: 'doctor' | 'cashier' | 'staff' | null;
  /** Display name resolved server-side (V140). Falls through
   *  user.name → linked employee.name → email. */
  name?: string;
  /** V199 — personal profile fields. Resolved server-side from
   *  the linked Employee when present, otherwise from the User row
   *  itself. The Profile dialog seeds its form from these so
   *  admin-without-employee can view + persist them. */
  khmerName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  placeOfBirth?: string | null;
  contactNumber?: string | null;
  currentAddress?: string | null;
  /** v-tenant-freeze — current tenant lifecycle status. FE renders
   *  a top-bar banner + toast when this is 'frozen'. Values match
   *  the backend tenants.status column. */
  tenantStatus?: 'active' | 'suspended' | 'cancelled' | 'frozen' | null;
  tenantFrozenReason?: string | null;
  /** v-tenant-freeze-schedule — auto-thaw deadline (ISO). Null =
   *  indefinite freeze OR tenant not frozen at all. */
  tenantFrozenUntil?: string | null;
  /** V-fcm-3-user-pref — server-side per-user push toggle. Profile
   *  dialog renders a Switch that reads this and calls
   *  {@link updateNotifications} to persist. */
  notificationsEnabled?: boolean;
  /** GET /auth/me: the linked employee's number (Employee No); null
   *  when the account has no employee. */
  employeeNo?: string | null;
  /** GET /auth/me: when the account was created (ISO). */
  createdAt?: string | null;
  /** GET /auth/me: most recent successful sign-in (ISO). */
  lastLogin?: string | null;
  /** V388 — storage path of the profile photo, null when none: the
   *  linked employee's photo when linked, else the user's own. Not
   *  loadable — it is the "has a photo" flag; the bytes come from
   *  GET /auth/me/profile-image (see useMyProfileImage). */
  profileImage?: string | null;
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
  // apiJson returns null when the response body isn't JSON (empty
  // body, HTML error page, or a same-origin path that resolved to
  // the SPA's own index.html — the Tauri Windows shell used to hit
  // this when VITE_API_BASE was a relative path).
  if (!res || !res.token || !res.user) {
    throw new Error(
      'Login response was empty or malformed. Check that VITE_API_BASE points at an absolute API URL (Tauri desktop can\'t use relative paths) and that the API\'s CORS allow-list includes this app\'s origin.'
    );
  }
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
  setActiveClientTenant(null);
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

/** V271 — self-service password reset (kick-off). Always resolves —
 *  the server returns 204 whether or not the email is registered so
 *  we can't leak account existence. */
export async function forgotPassword(email: string): Promise<void> {
  await apiJson('/api/v1/auth/forgot-password', {
    method: 'POST',
    json: { email },
    auth: false,
  });
}

/** V271 — consume the emailed reset token and set a new password.
 *  Throws when the token is expired/invalid or the new password is
 *  too short. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiJson('/api/v1/auth/reset-password', {
    method: 'POST',
    json: { token, newPassword },
    auth: false,
  });
}

/** V199 — the Profile dialog now sends the display name plus the
 *  six personal fields. Backend routes them: name always lands on
 *  the User row (V140); the six personal fields land on the User
 *  row only when there's no linked Employee (otherwise Employee is
 *  the source of truth and the FE writes them via
 *  {@link import('./employees').updateMe}). */
export interface UpdateProfileRequest {
  name?: string;
  khmerName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  placeOfBirth?: string | null;
  contactNumber?: string | null;
  currentAddress?: string | null;
}

export async function updateProfile(req: UpdateProfileRequest): Promise<AuthUser> {
  const user = await apiJson<AuthUser>('/api/v1/auth/me', { method: 'PATCH', json: req });
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  return user;
}

/** V388 — upload / replace the current user's profile photo. Linked to
 *  an employee, this IS the employee's photo (same picture on the
 *  Employee screens). Returns the refreshed AuthUser. */
export async function uploadMyProfileImage(file: File): Promise<AuthUser> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiFetch('/api/v1/auth/me/profile-image', { method: 'POST', body: fd });
  if (!res.ok) {
    const ct = res.headers.get('content-type') ?? '';
    const body = ct.includes('application/json') ? await res.json().catch(() => null) : null;
    throw new ApiError(body?.message ?? `Upload failed (${res.status})`, res.status,
      '/api/v1/auth/me/profile-image', body);
  }
  const user = await res.json() as AuthUser;
  if (typeof localStorage !== 'undefined') localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

/** V388 — remove the current user's profile photo. */
export async function removeMyProfileImage(): Promise<AuthUser> {
  const user = await apiJson<AuthUser>('/api/v1/auth/me/profile-image', { method: 'DELETE' });
  if (typeof localStorage !== 'undefined') localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

/** Blob URL of the current user's photo, null on 404 (none). */
export async function fetchMyProfileImageBlobUrl(): Promise<string | null> {
  // no-cache — see fetchProfileImageBlobUrl (documents.ts).
  const res = await apiFetch('/api/v1/auth/me/profile-image', { cache: 'no-cache' });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(`Profile image fetch failed (${res.status})`, res.status, '/api/v1/auth/me/profile-image');
  return URL.createObjectURL(await res.blob());
}

/** V-fcm-3-user-pref — flip the server-side per-user push toggle and
 *  return the refreshed AuthUser so the caller can re-bind context. */
export async function updateNotifications(enabled: boolean): Promise<AuthUser> {
  const user = await apiJson<AuthUser>('/api/v1/auth/me/notifications', {
    method: 'PUT',
    json: { enabled },
  });
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  return user;
}
