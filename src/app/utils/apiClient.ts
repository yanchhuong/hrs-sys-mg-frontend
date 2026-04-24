/**
 * Thin wrapper around the HRMS Spring Boot API at localhost:4000.
 *
 * Until the mock AuthContext is replaced by the real login flow, this module
 * owns its own JWT — logs in once with the seeded demo admin and caches the
 * token under `hrms:apiToken`. Every call refreshes transparently on 401.
 */

const DEFAULT_BASE = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE
  ?? 'http://localhost:4000';

const TOKEN_KEY = 'hrms:apiToken';

// Demo credentials seeded by the backend's V2 migration — override via env.
const DEMO_EMAIL = (import.meta as { env?: { VITE_API_EMAIL?: string } }).env?.VITE_API_EMAIL
  ?? 'admin@example.com';
const DEMO_PASSWORD = (import.meta as { env?: { VITE_API_PASSWORD?: string } }).env?.VITE_API_PASSWORD
  ?? 'admin123';
const DEMO_TENANT = (import.meta as { env?: { VITE_API_TENANT?: string } }).env?.VITE_API_TENANT
  ?? 'local-site';

async function login(): Promise<string> {
  const res = await fetch(`${DEFAULT_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      tenantSlug: DEMO_TENANT,
    }),
  });
  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(body?.message ?? `Login failed (${res.status})`);
  }
  const body = (await res.json()) as { token: string };
  localStorage.setItem(TOKEN_KEY, body.token);
  return body.token;
}

async function getToken(): Promise<string> {
  const cached = localStorage.getItem(TOKEN_KEY);
  if (cached) return cached;
  return login();
}

async function safeJson(res: Response): Promise<any | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Authenticated fetch with one automatic re-login on 401 (handles expired JWT).
 */
async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const doCall = (tok: string) =>
    fetch(`${DEFAULT_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok}`,
      },
    });

  let res = await doCall(token);
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    const fresh = await login();
    res = await doCall(fresh);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Fingerprint import
// ---------------------------------------------------------------------------

export interface FingerprintImportResult {
  host: string;
  port: number;
  recordCount: number;
  fetchedAt: string;
  records: {
    userId: string;
    timestamp: string;
    punchState: number;
    verifyMode: number;
  }[];
}

export async function importFingerprint(args: {
  ip: string;
  port: number;
  commKey?: number;
  timeoutMs?: number;
}): Promise<FingerprintImportResult> {
  const res = await apiFetch('/api/v1/attendance/import/fingerprint', {
    method: 'POST',
    body: JSON.stringify({
      ip: args.ip,
      port: args.port,
      commKey: args.commKey ?? 0,
      timeoutMs: args.timeoutMs ?? 10000,
    }),
  });
  const body = await safeJson(res);
  if (!res.ok) {
    throw new Error(body?.message ?? `Import failed (${res.status})`);
  }
  return body as FingerprintImportResult;
}
