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

// ---------------------------------------------------------------------------
// Heartbeat — local install reports its row counts to the cloud so the
// Super Admin Dashboard can flag drift. Returns the cloud's view (its own
// counts + the diff per table) so the local UI can also show "100% in sync"
// or "behind by N rows" without a second round-trip.
// ---------------------------------------------------------------------------
export interface HeartbeatRequest {
  tables: Record<string, number>;
  /** Optional. Per-table latest local updated_at ISO string. */
  lastUpdatedAt?: Record<string, string>;
}

export interface HeartbeatTableState {
  table: string;
  localCount: number;
  cloudCount: number;
  drift: number;
}

export interface HeartbeatResponse {
  tenantId: string;
  heartbeatAt: string;
  inSync: boolean;
  totalDrift: number;
  tables: HeartbeatTableState[];
}

// ---------------------------------------------------------------------------
// Data push — pump rows from the local DB up to the cloud.
// The cloud overwrites tenant_id and nullifies created_by_id/updated_by_id
// so audit attribution doesn't leak across deployments.
// ---------------------------------------------------------------------------
export interface PushTableResult {
  table: string;
  upserted: number;
  skipped: number;
}

export async function pushTable(
  serverUrl: string,
  apiKey: string,
  table: string,
  records: Array<Record<string, unknown>>,
  timeoutMs = 60000,
): Promise<PushTableResult> {
  const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
  // Same smart-join as testCloudConnection / client.ts: if the cloud URL
  // already ends with /api or /api-XX, drop the leading /api from the
  // call-site path so the full URL doesn't double up.
  const baseEndsInApi = /\/api(-[\w-]+)?$/.test(cleanUrl);
  const callPath = '/api/v1/local/sync/push';
  const target = `${cleanUrl}${baseEndsInApi ? callPath.slice('/api'.length) : callPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey.trim(),
      },
      body: JSON.stringify({ table, records }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Push ${table} HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return await res.json() as PushTableResult;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendHeartbeat(
  serverUrl: string,
  apiKey: string,
  body: HeartbeatRequest,
  timeoutMs = 10000,
): Promise<HeartbeatResponse> {
  const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
  const baseEndsInApi = /\/api(-[\w-]+)?$/.test(cleanUrl);
  const callPath = '/api/v1/local/sync/heartbeat';
  const target = `${cleanUrl}${baseEndsInApi ? callPath.slice('/api'.length) : callPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey.trim(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Heartbeat HTTP ${res.status}`);
    }
    return await res.json() as HeartbeatResponse;
  } finally {
    clearTimeout(timer);
  }
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
  // Two-step verification:
  //   1. /api/v1/health proves the URL is reachable and the cloud is up.
  //   2. /api/v1/local/sync/heartbeat (empty payload) proves the key is
  //      ALSO valid — /health is permitAll so a bad key still 200s there
  //      and admins were getting "Cloud is reachable" with a key the
  //      cloud silently rejected. The heartbeat probe with an empty
  //      tables map is a no-op write that auths via X-API-Key.
  //
  // Path stitching: when the server URL ends with /api or /api-XX (e.g.
  // a reverse-proxy prefix like /api-02), the deployment expects paths
  // already rooted under that segment. So the call-site `/api/v1/...`
  // is stripped of its leading `/api` to avoid duplicating it (mirrors
  // the smart-join in src/app/api/client.ts).
  const baseEndsInApi = /\/api(-[\w-]+)?$/.test(cleanUrl);
  const join = (callPath: string) =>
    `${cleanUrl}${baseEndsInApi && callPath.startsWith('/api/') ? callPath.slice('/api'.length) : callPath}`;
  const healthTarget = join('/api/v1/health');
  const probeTarget  = join('/api/v1/local/sync/heartbeat');
  const started = performance.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const healthRes = await fetch(healthTarget, {
      method: 'GET',
      headers: apiKey ? { 'X-API-Key': apiKey.trim() } : undefined,
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - started);

    if (!healthRes.ok) {
      let msg = `HTTP ${healthRes.status}`;
      if (healthRes.status === 404) msg = 'No health endpoint at this URL';
      return { ok: false, status: healthRes.status, error: msg, latencyMs };
    }

    const body: { ok?: boolean; mode?: string; ts?: string } = await healthRes.json().catch(() => ({}));
    if (!body.ok) {
      return { ok: false, status: healthRes.status, error: 'Health check responded without ok=true', latencyMs };
    }

    // Now probe an auth-required endpoint. A 403 here means the URL is
    // right but the key isn't recognized — friendlier hint than push
    // failing later.
    if (apiKey) {
      const probe = await fetch(probeTarget, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey.trim() },
        body: JSON.stringify({ tables: {} }),
        signal: controller.signal,
      });
      if (probe.status === 403 || probe.status === 401) {
        return {
          ok: false,
          status: probe.status,
          error: 'API key not recognized — generate a new one in Super Admin → Connect & Sync, or use the tenant master key.',
          latencyMs,
        };
      }
      if (!probe.ok) {
        return {
          ok: false,
          status: probe.status,
          error: `Heartbeat probe HTTP ${probe.status}`,
          latencyMs,
        };
      }
    }

    return {
      ok: true,
      status: healthRes.status,
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
