/**
 * Base HTTP client for the HRMS backend.
 *
 * Every domain module (employees, attendance, …) imports `apiFetch` from here.
 * JWT is stored under `hrms:apiToken`; it is set by `auth.login()` and cleared
 * by `auth.logout()`. A 401 response clears the token so the caller can re-auth.
 */

import { migrateLegacyApiBaseOverride } from '../utils/runtime';
import { currentLang, translate } from '../i18n/translations';

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
// Rewrite a persisted override left over from a retired online URL
// BEFORE API_BASE is read below. Order matters: API_BASE is evaluated
// once at module import, and the stored override outranks
// VITE_API_BASE — so an old desktop install would otherwise keep
// using the previous host forever and never pick up a new build's
// value. Safe on web (nothing persisted → no-op).
migrateLegacyApiBaseOverride();
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

/** apiFetch's own options. FetchOptions omits `body` because apiJson
 *  callers always serialise through `json` instead — but apiFetch is
 *  also the raw escape hatch multipart/FormData uploads use, which
 *  must send a real body without JSON-encoding it, so `body` is
 *  added back here. */
export interface RawFetchOptions extends FetchOptions {
  body?: RequestInit['body'];
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

/**
 * Make an asset URL the server handed out loadable in an &lt;img&gt;.
 *
 * The API returns image paths relative to itself (e.g.
 * `/api/v1/public/stock-item-images/…`). They must be composed exactly
 * like request URLs — apiOrigin() + apiPath() — because production's API
 * base ends in `/api-02` and apiPath strips the leading `/api`; a plain
 * `API_BASE + path` would produce `/api-02/api/v1/…` and 404. Absolute
 * URLs and data URIs pass through unchanged.
 */
export function resolveAssetUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  if (u.startsWith('/')) return `${apiOrigin()}${apiPath(u)}`;
  return u;
}

export async function apiFetch(path: string, opts: RawFetchOptions = {}): Promise<Response> {
  const { json, query, auth = true, headers, ...rest } = opts;
  const url = buildUrl(path, query);
  const merged: Record<string, string> = { ...(headers as Record<string, string> ?? {}) };
  if (json !== undefined) merged['Content-Type'] = 'application/json';
  // V385 — Super Admin → Users shows which app a user is on.
  merged['X-Client-App'] = 'web';
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
  try {
    return await fetch(url, {
      ...rest,
      headers: merged,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (err) {
    // v-api-unreachable-redirect — network-layer failure ("Failed to
    // fetch") — DNS, CORS, offline, or the server is down. fetch()
    // throws a TypeError; the request never reached the API.
    //
    // If the user is authenticated (auth flag on + token present),
    // clear their token and dispatch a page-scoped event so
    // AuthContext can drop currentUser and route back to
    // LandingPage. Without this, the operator sat on a protected
    // page while every subsequent request quietly threw and every
    // list rendered its error state — no obvious cue that the
    // problem was "the API is down."
    //
    // Anonymous / public callers are left to handle the error at
    // their own call site so they don't get bounced off a page they
    // were legitimately allowed to see:
    //   • auth === false (LoginPage before sign-in, /auth/login itself)
    //   • no stored token (never logged in — customer on /shop/{code})
    //   • the path is a /public/** endpoint (a tenant admin previewing
    //     their own shop still hits public endpoints; redirecting
    //     them to login when a customer-facing page fails is jarring)
    const isNetworkError = err instanceof TypeError;
    const isPublicPath = path.startsWith('/api/v1/public/');
    const wasAuthed = auth !== false && !!getToken() && !isPublicPath;
    if (isNetworkError && wasAuthed && typeof window !== 'undefined') {
      setToken(null);
      window.dispatchEvent(new CustomEvent('auth:api-unreachable'));
    }
    // The browser's own wording for this is "Failed to fetch", and every
    // call site puts `err.message` in a toast — so that is what the
    // operator was reading when their wifi dropped. Re-word it, but keep
    // the TypeError: PublicShopPage tells a network failure from an API
    // one by `instanceof`, and wrapping it would break that.
    if (isNetworkError && err instanceof Error) {
      (err as Error & { networkMessage?: string }).networkMessage = err.message;
      err.message = friendlyError(0);
    }
    throw err;
  }
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

/**
 * What a person reads when a call fails — never a stack trace.
 *
 * Ported from the mobile build's `src/api/client.ts`, keys, regex and
 * sentences alike, so the same failure reads the same on a phone and in
 * a browser. Before this, the web handed `body.message` straight to a
 * toast: a Hibernate constraint, a Java exception or a bare "Internal
 * Server Error" went to the operator as-is, and a response with no
 * message at all became "Request failed (500)".
 *
 *  - the server's own sentence ("You can't delete X because it's still
 *    on INV-…") is kept — those are written for people;
 *  - technical text and a missing message are replaced by a plain one
 *    for the status, in the user's language.
 *
 * Status 0 is "no answer at all" — offline, or the server down.
 * Keep this in step with the mobile copy; its friendlyError.test.ts
 * covers the same table.
 */
const TECHNICAL = /exception|java\.|org\.(springframework|hibernate|postgresql)|hibernate|could not execute|nested|constraint \[|duplicate key|violates|sql|jdbc|json parse|unexpected token|cannot invoke|is null|no message available|^(bad request|unauthorized|forbidden|not found|internal server error|service unavailable|bad gateway|gateway timeout)$|^\d{3}\b/i;

const STATUS_TEXT: { test: (s: number) => boolean; key: string; en: string }[] = [
  { test: s => s === 0,   key: 'err.offline',   en: "Failed to reach the server. Check your internet connection and try again." },
  { test: s => s === 400 || s === 422, key: 'err.invalid', en: "Some details aren't valid. Please check them and try again." },
  { test: s => s === 401, key: 'err.session',   en: 'Your session has ended. Please sign in again.' },
  { test: s => s === 403, key: 'err.forbidden', en: "You don't have permission to do this." },
  { test: s => s === 404, key: 'err.not_found', en: "We couldn't find it — it may have been deleted. Please refresh." },
  { test: s => s === 409, key: 'err.conflict',  en: 'It was changed by someone else. Please refresh and try again.' },
  { test: s => s === 413, key: 'err.too_large', en: 'That file is too large.' },
  { test: s => s === 429, key: 'err.too_many',  en: 'Too many tries. Please wait a moment and try again.' },
  { test: s => s === 408 || s === 504, key: 'err.timeout', en: 'The server took too long to answer. Please try again.' },
  { test: s => s >= 500,  key: 'err.server',    en: 'The server had a problem. Please try again in a moment.' },
];

export function friendlyError(status: number, serverMessage?: string | null): string {
  const msg = (serverMessage ?? '').trim();
  if (msg && !TECHNICAL.test(msg) && status !== 0) return msg;
  const hit = STATUS_TEXT.find(x => x.test(status));
  return hit ? translate(hit.key, currentLang(), hit.en) : translate('err.generic', currentLang(), 'Something went wrong. Please try again.');
}

/** Build the user-visible error string for ApiError.
 *  - {@code body.message} is the top-level reason ("Validation failed"),
 *    passed through {@link friendlyError} so technical text never lands
 *    in a toast.
 *  - {@code body.fieldErrors[]} carries per-field reasons; we append the
 *    first 3 so a toast that previously read just "Validation failed"
 *    now reads "Validation failed: items must not be empty; …" and
 *    the operator can fix the form without opening DevTools. */
function formatErrorMessage(body: any, status: number): string {
  const base = friendlyError(status, body?.message);
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
