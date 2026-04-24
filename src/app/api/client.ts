/**
 * Base HTTP client for the HRMS backend.
 *
 * Every domain module (employees, attendance, …) imports `apiFetch` from here.
 * JWT is stored under `hrms:apiToken`; it is set by `auth.login()` and cleared
 * by `auth.logout()`. A 401 response clears the token so the caller can re-auth.
 */

export const API_BASE: string =
  (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE
  ?? 'http://localhost:4000';

export const USE_MOCKS: boolean =
  String((import.meta as { env?: { VITE_USE_MOCKS?: string } }).env?.VITE_USE_MOCKS ?? '')
    .toLowerCase() === 'true';

export const TOKEN_KEY = 'hrms:apiToken';
export const TENANT_KEY = 'hrms:tenantSlug';
export const USER_KEY = 'hrms:authUser';

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

export async function apiFetch(path: string, opts: FetchOptions = {}): Promise<Response> {
  const { json, query, auth = true, headers, ...rest } = opts;
  const url = `${API_BASE}${path}${buildQuery(query)}`;
  const merged: Record<string, string> = { ...(headers as Record<string, string> ?? {}) };
  if (json !== undefined) merged['Content-Type'] = 'application/json';
  if (auth) {
    const tok = getToken();
    if (tok) merged['Authorization'] = `Bearer ${tok}`;
  }
  return fetch(url, {
    ...rest,
    headers: merged,
    body: json !== undefined ? JSON.stringify(json) : (rest as { body?: BodyInit }).body,
  });
}

/** JSON request that throws ApiError on non-2xx. */
export async function apiJson<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const res = await apiFetch(path, opts);
  if (res.status === 401) setToken(null);
  const body = await safeJson<any>(res);
  if (!res.ok) {
    const msg = body?.message ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, path, body);
  }
  return body as T;
}

/** For DELETE / 204 endpoints that return no body. */
export async function apiVoid(path: string, opts: FetchOptions = {}): Promise<void> {
  const res = await apiFetch(path, opts);
  if (res.status === 401) setToken(null);
  if (!res.ok) {
    const body = await safeJson<any>(res);
    const msg = body?.message ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, path, body);
  }
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
