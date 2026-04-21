/**
 * Cloud-connection settings for the local install.
 *
 * The admin configures the cloud server URL + the tenant API key issued by
 * the platform super-admin. The browser can perform a live reachability check
 * against `<serverUrl>/api/health`; the real outbox/sync worker lives in the
 * backend and reads the same config from this storage (or the env, when
 * running inside Docker).
 */

export interface CloudConfig {
  serverUrl: string;
  apiKey: string;
  tenantSlug?: string;
  autoSync: boolean;
  syncIntervalSeconds: number;
  connectedAt?: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'ok' | 'error';
  lastSyncError?: string;
}

export type ConnectionStatus =
  | 'not_configured'
  | 'disconnected'
  | 'testing'
  | 'connected'
  | 'error';

export interface TestResult {
  ok: boolean;
  status: number | null;
  mode?: string;         // deployment mode reported by /api/health
  serverTime?: string;   // ts from /api/health
  error?: string;
  latencyMs: number;
}

const STORAGE_KEY = 'hrms:cloudConfig';
const DEFAULT_SYNC_SECONDS = 300;

export const emptyConfig: CloudConfig = {
  serverUrl: '',
  apiKey: '',
  autoSync: false,
  syncIntervalSeconds: DEFAULT_SYNC_SECONDS,
};

export function loadCloudConfig(): CloudConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...emptyConfig };
    return { ...emptyConfig, ...(JSON.parse(raw) as Partial<CloudConfig>) };
  } catch {
    return { ...emptyConfig };
  }
}

export function saveCloudConfig(cfg: Partial<CloudConfig>): CloudConfig {
  const next = { ...loadCloudConfig(), ...cfg };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearCloudConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function deriveStatus(cfg: CloudConfig): ConnectionStatus {
  if (!cfg.serverUrl || !cfg.apiKey) return 'not_configured';
  if (cfg.lastSyncStatus === 'error') return 'error';
  if (cfg.connectedAt) return 'connected';
  return 'disconnected';
}

/**
 * Hit the cloud health endpoint with the tenant API key. The cloud
 * `/api/health` endpoint is unauthenticated, but we also send the key so a
 * misconfigured URL returns 401 instead of 200 from the wrong place.
 */
export async function testCloudConnection(
  serverUrl: string,
  apiKey: string,
  timeoutMs = 8000,
): Promise<TestResult> {
  const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
  const target = `${cleanUrl}/api/health`;
  const started = performance.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(target, {
      method: 'GET',
      headers: apiKey ? { 'X-API-Key': apiKey.trim() } : undefined,
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - started);

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      if (res.status === 401) msg = 'Invalid API key';
      if (res.status === 404) msg = 'No health endpoint at this URL';
      if (res.status === 403) msg = 'API key rejected for this tenant';
      return { ok: false, status: res.status, error: msg, latencyMs };
    }

    const body: { ok?: boolean; mode?: string; ts?: string } = await res.json().catch(() => ({}));
    if (!body.ok) {
      return { ok: false, status: res.status, error: 'Health check responded without ok=true', latencyMs };
    }
    return {
      ok: true,
      status: res.status,
      mode: body.mode,
      serverTime: body.ts,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    const error = controller.signal.aborted
      ? `Request timed out after ${timeoutMs}ms`
      : err instanceof Error ? err.message : 'Unknown network error';
    return { ok: false, status: null, error, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * "Sync now" stub. In the real deployment the local backend owns the sync
 * worker (outbox + cursor). From the SPA we can only trigger a round-trip to
 * signal intent — the /api/sync/pull call from the worker is what actually
 * moves data. Here we run the health check again to give the admin feedback.
 */
export async function runSyncNow(): Promise<TestResult> {
  const cfg = loadCloudConfig();
  if (!cfg.serverUrl || !cfg.apiKey) {
    return { ok: false, status: null, error: 'Cloud connection not configured', latencyMs: 0 };
  }
  const res = await testCloudConnection(cfg.serverUrl, cfg.apiKey);
  saveCloudConfig({
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: res.ok ? 'ok' : 'error',
    lastSyncError: res.ok ? undefined : res.error,
  });
  return res;
}
