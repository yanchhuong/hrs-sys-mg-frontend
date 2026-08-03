/**
 * Base HTTP client for the HRMS backend.
 *
 * Every domain module (employees, attendance, …) imports `apiFetch` from here.
 * JWT is stored under `hrms:apiToken`; it is set by `auth.login()` and cleared
 * by `auth.logout()`. A 401 response clears the token so the caller can re-auth.
 */

/**
 * Resolves the API base in this order (highest precedence first):
 *   1. `localStorage['hrms:apiBaseOverride']` — set by the shipped
 *      Tauri Windows app's Settings screen (or dev tools) so a
 *      single build can point at any tenant's droplet.
 *   2. `VITE_API_BASE` build-time env — used by `npm run build`.
 *   3. `http://localhost:4000` — dev fallback.
 */
const API_BASE_KEY = 'hrms:apiBaseOverride';
function readApiBaseOverride(): string | null {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(API_BASE_KEY) : null; }
  catch { return null; }
}
export const API_BASE: string =
  readApiBaseOverride()
  ?? (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE
  ?? 'http://localhost:4000';
/** Called by a Settings dialog to change the API base for the
 *  installed app. Reload is required — the exported `API_BASE`
 *  above is evaluated once at import time. */
export function setApiBaseOverride(url: string | null): void {
  try {
    if (!url) localStorage.removeItem(API_BASE_KEY);
    else localStorage.setItem(API_BASE_KEY, url);
  } catch { /* private mode / storage disabled — no-op */ }
}

export const USE_MOCKS: boolean =
  String((import.meta as { env?: { VITE_USE_MOCKS?: string } }).env?.VITE_USE_MOCKS ?? '')
    .toLowerCase() === 'true';

export const TOKEN_KEY = 'hrms:apiToken';
export const TENANT_KEY = 'hrms:tenantSlug';
export const USER_KEY = 'hrms:authUser';

/**
 * v-agency-mvp-1c-ii client header. Agency users pick which
 * client Company they're working with; that pick is stored here
 * (module-level so every subsequent apiFetch attaches
 * X-Client-Tenant automatically without threading a prop through
 * every API module). Tenant users leave this null — the BE
 * ignores the header for non-agency principals.
 */
const CLIENT_TENANT_KEY = 'hrms:agencyActiveClientTenantId';
let activeClientTenantId: string | null =
        typeof localStorage !== 'undefined' ? localStorage.getItem(CLIENT_TENANT_KEY) : null;

export function getActiveClientTenant(): string | null { return activeClientTenantId; }

export function setActiveClientTenant(tenantId: string | null): void {
  activeClientTenantId = tenantId;
  if (typeof localStorage === 'undefined') return;
  if (tenantId) localStorage.setItem(CLIENT_TENANT_KEY, tenantId);
  else localStorage.removeItem(CLIENT_TENANT_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}

export function setToken(token: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function safeJson<T = unknown>(res: Response): Promise<T | null> {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return null;
  try { return (await res.json()) as T; } catch { return null; }
}

export interface FetchOptions extends Omit<RequestInit, 'body'> {
  /** Parsed JSON request body — serialised for you. */
  json?: unknown;
  /** URL query params; `undefined`/`null` entries are dropped. */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Set false to suppress the Authorization header (e.g. for /auth/login). */
  auth?: boolean;
}

export function buildQuery(query?: FetchOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Build the full URL for a call-site path.
 *
 * Every call site in this app sends paths that start with `/api/v1/...`
 * (e.g. `/api/v1/auth/login`). In some deployments the reverse proxy in
 * front of Spring Boot exposes the backend under a different prefix —
 * e.g. nginx routes `/api-02/v1/...` to the upstream's `/api/v1/...`.
 * When that's the case the operator sets:
 *   VITE_API_BASE=http://host:port/api-02
 * To avoid every URL turning into `…/api-02/api/v1/…` (which the nginx
 * location wouldn't match), strip the leading `/api` from the call-site
 * path whenever the base already ends with an `/api` / `/api-XX` segment.
 *
 * Local dev (VITE_API_BASE unset → falls through to `http://localhost:4000`)
 * doesn't match the regex, so paths stay `/api/v1/...` and hit Spring
 * Boot directly without a proxy.
 */
function buildUrl(path: string, query: FetchOptions['query']): string {
  return `${apiOrigin()}${apiPath(path)}${buildQuery(query)}`;
}

/**
 * Base URL with any trailing slash stripped. Shared by apiJson +
 * hand-rolled callers (EventSource / native fetch of a stream).
 */
export function apiOrigin(): string {
  return API_BASE.replace(/\/$/, '');
}

/**
 * Apply the same "/api"-strip logic buildUrl uses so callers that
 * bypass apiJson (SSE / WebSocket / direct EventSource) still hit
 * the right proxied path. Without this, a subscribe URL like
 *   `${API_BASE}/api/v1/pos/display/CXTUK/stream`
 * lands at `/api-02/api/v1/…` on production and 404s against the
 * `/api-02/v1/` nginx location — same URL apiJson would have
 * shortened to `/api-02/v1/pos/display/CXTUK/stream`.
 */
export function apiPath(path: string): string {
  const baseEndsInApi = /\/api(-[\w-]+)?$/.test(apiOrigin());
  return baseEndsInApi && path.startsWith('/api/')
    ? path.slice('/api'.length)
    : path;
}

export async function apiFetch(path: string, opts: FetchOptions = {}): Promise<Response> {
  const { json, query, auth = true, headers, ...rest } = opts;
  const url = buildUrl(path, query);
  const merged: Record<string, string> = { ...(headers as Record<string, string> ?? {}) };
  if (json !== undefined) merged['Content-Type'] = 'application/json';
  if (auth) {
    const tok = getToken();
    if (tok) merged['Authorization'] = `Bearer ${tok}`;
  }
  // v-agency-mvp-1c-ii — attach X-Client-Tenant unconditionally
  // whenever it's set; the BE only reads it for agency principals
  // (AgencyClientContextFilter) so tenant users see no effect.
  // Skip on the /agency/** paths — agency-workspace calls resolve
  // scope from JWT + row-level checks, no header needed.
  if (activeClientTenantId && !path.startsWith('/api/v1/agency/')) {
    merged['X-Client-Tenant'] = activeClientTenantId;
  }
  return fetch(url, {
    ...rest,
    headers: merged,
    body: json !== undefined ? JSON.stringify(json) : (rest as { body?: BodyInit }).body,
  });
}

/**
 * Recognise the structured body the backend's TenantModuleGuard returns
 * for a tenant whose tenant-modules row says the requested module is
 * off. Old behaviour resolved {@link apiJson} to {@code undefined} so
 * list pages could render empty, but no caller actually wrote
 * {@code (await x).data ?? []} and every loader crashed on the
 * undefined unwrap. We now throw a typed sentinel ({@link
 * ModuleDisabledError}) so the existing try/catch in every loader
 * turns the failure into a clean toast instead of a React crash.
 */
function isModuleDisabledResponse(status: number, body: any): boolean {
  return status === 403 && body && body.code === 'ModuleDisabled';
}

/** Typed sentinel — thrown by {@link apiJson} / {@link apiVoid} when
 *  the tenant has the called module disabled. Loaders that want the
 *  silent-empty UX can check with {@link isModuleDisabledError} in
 *  their catch handler; default catch behaviour is fine (just toast). */
export class ModuleDisabledError extends Error {
  constructor(path: string) {
    super(`This module is not installed for your company (${path}).`);
    this.name = 'ModuleDisabledError';
  }
}

export function isModuleDisabledError(e: unknown): e is ModuleDisabledError {
  return e instanceof ModuleDisabledError;
}

/** v-tenant-freeze — the TenantFrozenGuard on the BE responds with
 *  423 Locked and a JSON body of shape { code: 'TenantFrozen', ... }.
 *  Detected here so the FE can wrap it in a friendlier ApiError
 *  message ("This company is in read-only mode. Contact your
 *  administrator.") without every call site having to catch on
 *  code === 'TenantFrozen'. */
function isTenantFrozenResponse(status: number, body: any): boolean {
  return status === 423 && body && body.code === 'TenantFrozen';
}

/** JSON request that throws ApiError on non-2xx. */
export async function apiJson<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const res = await apiFetch(path, opts);
  if (res.status === 401) {
    // v-session-timeout-redirect — clear the token AND fire a page-
    // scoped event so AuthContext can drop currentUser + route back
    // to the login screen. Without this, the user keeps sitting on
    // whatever protected page they had open while every subsequent
    // call quietly 401s.
    setToken(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
  }
  const body = await safeJson<any>(res);
  if (isModuleDisabledResponse(res.status, body)) {
    throw new ModuleDisabledError(path);
  }
  if (isTenantFrozenResponse(res.status, body)) {
    throw new ApiError(
      'This company is in read-only mode. Contact your administrator to unfreeze.',
      423, path, body);
  }
  if (!res.ok) {
    throw new ApiError(formatErrorMessage(body, res.status), res.status, path, body);
  }
  return body as T;
}

/** For DELETE / 204 endpoints that return no body. */
export async function apiVoid(path: string, opts: FetchOptions = {}): Promise<void> {
  const res = await apiFetch(path, opts);
  if (res.status === 401) {
    // v-session-timeout-redirect — clear the token AND fire a page-
    // scoped event so AuthContext can drop currentUser + route back
    // to the login screen. Without this, the user keeps sitting on
    // whatever protected page they had open while every subsequent
    // call quietly 401s.
    setToken(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
  }
  if (!res.ok) {
    const body = await safeJson<any>(res);
    if (isModuleDisabledResponse(res.status, body)) throw new ModuleDisabledError(path);
    if (isTenantFrozenResponse(res.status, body)) {
      throw new ApiError(
        'This company is in read-only mode. Contact your administrator to unfreeze.',
        423, path, body);
    }
    throw new ApiError(formatErrorMessage(body, res.status), res.status, path, body);
  }
}

/** Build the user-visible error string for ApiError.
 *  - {@code body.message} is the top-level reason ("Validation failed").
 *  - {@code body.fieldErrors[]} carries per-field reasons; we append the
 *    first 3 so a toast that previously read just "Validation failed"
 *    now reads "Validation failed: items must not be empty; …" and
 *    the operator can fix the form without opening DevTools. */
function formatErrorMessage(body: any, status: number): string {
  const base = body?.message ?? `Request failed (${status})`;
  const issues = Array.isArray(body?.fieldErrors) ? body.fieldErrors : [];
  if (issues.length === 0) return base;
  const parts: string[] = [];
  const take = issues.slice(0, 3);
  for (const i of take) {
    if (!i) continue;
    const field = i.field ?? 'field';
    const message = i.message ?? 'invalid';
    parts.push(`${field}: ${message}`);
  }
  const tail = issues.length > 3 ? `; +${issues.length - 3} more` : '';
  return parts.length ? `${base} — ${parts.join('; ')}${tail}` : base;
}

/** Spring Data Page<T> shape — all list endpoints return this. */
export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first?: boolean;
  last?: boolean;
  empty?: boolean;
}
