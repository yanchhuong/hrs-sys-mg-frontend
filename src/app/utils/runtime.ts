/**
 * Runtime environment probes + desktop-shell constants.
 *
 * The Web build and the Tauri desktop shell load the exact same
 * bundle. Anything that should ONLY render in one or the other is
 * gated by isTauri() rather than a build-time flag — this keeps the
 * FE portable and lets QA test the desktop-only UI in a browser by
 * flipping the flag in DevTools if they need to.
 */

/** True when we're running inside the Tauri desktop shell. Tauri v2
 *  injects `__TAURI_INTERNALS__` on the window before any user code
 *  runs, and additionally serves the SPA from the custom protocol
 *  origin `http://tauri.localhost`. Either signal is sufficient. */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
    __TAURI_METADATA__?: unknown;
  };
  if (w.__TAURI_INTERNALS__ || w.__TAURI__ || w.__TAURI_METADATA__) return true;
  return window.location.hostname === 'tauri.localhost';
}

/** Remote (cloud / on-prem droplet) API base. Chosen by the desktop
 *  shell's Online/Offline toggle. Kept as a fixed constant for now;
 *  a Settings dialog can extend it later without changing the toggle
 *  contract.
 *
 *  HTTPS hostname rather than the raw IP it replaced: same host
 *  (api.hr-share.com -> 198.211.108.211), but the desktop shell posts
 *  credentials and a JWT on every request, and DNS can be repointed
 *  without reissuing installers. */
export const DESKTOP_ONLINE_API_BASE = 'https://api.hr-share.com';

/** Retired online URLs an install may still have persisted —
 *  {@link DESKTOP_ONLINE_API_BASE} as it used to be, and the 8081
 *  form that .env.example shipped before the HTTPS move.
 *
 *  This matters because `hrms:apiBaseOverride` in localStorage takes
 *  PRECEDENCE over the build-time `VITE_API_BASE` (see client.ts). An
 *  already-installed shell that had toggled Online has the old raw-IP
 *  URL persisted, so without this list it would keep talking cleartext
 *  HTTP after an upgrade and the new constant would never take effect.
 *  Treated as "online" for mode detection, and rewritten on read by
 *  {@link migrateLegacyApiBaseOverride}. */
export const LEGACY_DESKTOP_ONLINE_API_BASES: readonly string[] = [
  'http://198.211.108.211:4000',
  'http://198.211.108.211:8081',
];

/** The droplet's raw IPv4. {@link DESKTOP_ONLINE_API_BASE} resolves to
 *  it, so an override that addresses the address itself is a retired
 *  value whatever scheme or port it carries. */
const LEGACY_ONLINE_HOST = '198.211.108.211';

/**
 * Is this persisted override one of the retired online URLs?
 *
 * <p>Matched on host, not on the exact strings above. Those are the
 * two this repo is known to have shipped, but an install can hold a
 * third: a trailing slash, the 8081 form from an older .env, or the
 * https:// variant a browser's HTTP-to-HTTPS upgrade leaves behind —
 * and that last one is worse than the plain one, because it opens a
 * TLS handshake against a port that only speaks cleartext HTTP and
 * the request simply fails. Any of them should land on the hostname.</p>
 */
export function isLegacyOnlineApiBase(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return false;
  if (LEGACY_DESKTOP_ONLINE_API_BASES.includes(trimmed)) return true;
  try {
    return new URL(trimmed).hostname === LEGACY_ONLINE_HOST;
  } catch {
    return false;   // not a URL at all — leave it alone
  }
}

/** Local API base used by the desktop shell's Offline mode. Matches
 *  the default baked into `.env.desktop` so a fresh install "just
 *  works" against a locally-running API. */
export const DESKTOP_OFFLINE_API_BASE = 'http://localhost:4000';

export type DesktopApiMode = 'online' | 'offline';

/** Read the current desktop API mode. The default when nothing is
 *  persisted is 'online' — a fresh install should reach the customer's
 *  cloud droplet without any first-time configuration. Offline is
 *  only entered by an explicit user toggle. */
export function getDesktopApiMode(): DesktopApiMode {
  try {
    const override = typeof localStorage !== 'undefined'
      ? localStorage.getItem('hrms:apiBaseOverride')?.trim() ?? null
      : null;
    if (override === DESKTOP_OFFLINE_API_BASE) return 'offline';
    if (override === DESKTOP_ONLINE_API_BASE) return 'online';
    // An install that toggled Online before the constant moved to
    // HTTPS still has the old URL persisted — that's still "online".
    if (isLegacyOnlineApiBase(override)) return 'online';
  } catch { /* private mode / storage disabled — fall through */ }
  // No (recognised) override — fall back to the baked-in VITE_API_BASE.
  const buildTime = (import.meta as { env?: { VITE_API_BASE?: string } })
    .env?.VITE_API_BASE;
  if (buildTime === DESKTOP_OFFLINE_API_BASE) return 'offline';
  return 'online';
}

/** Upgrade a persisted override that points at a retired online URL.
 *
 *  Must run BEFORE `client.ts` evaluates `API_BASE` (it reads
 *  localStorage at module-import time), so client.ts calls this at
 *  the top of its own module body rather than leaving it to a
 *  component effect.
 *
 *  Returns the URL callers should treat as current, so the caller
 *  doesn't need a second read. No-op when nothing is persisted, when
 *  the value is already current, or when it's the offline URL — an
 *  explicit Offline choice must survive an upgrade. */
export function migrateLegacyApiBaseOverride(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const current = localStorage.getItem('hrms:apiBaseOverride')?.trim() ?? null;
    if (!current) return null;
    if (!isLegacyOnlineApiBase(current)) return current;
    localStorage.setItem('hrms:apiBaseOverride', DESKTOP_ONLINE_API_BASE);
    return DESKTOP_ONLINE_API_BASE;
  } catch {
    return null;   // private mode / storage disabled
  }
}

/** Persist the chosen mode and hard-reload so `API_BASE` (evaluated
 *  once at module import time in client.ts) picks up the new value.
 *  Reload also drops any in-memory auth state so a mode-flip lands on
 *  the login screen against the new host — you can't share a JWT
 *  across two environments anyway. */
export function setDesktopApiMode(mode: DesktopApiMode): void {
  try {
    const url = mode === 'online' ? DESKTOP_ONLINE_API_BASE : DESKTOP_OFFLINE_API_BASE;
    localStorage.setItem('hrms:apiBaseOverride', url);
    // Clear the JWT — a token from droplet-A won't validate on droplet-B.
    localStorage.removeItem('hrms:apiToken');
  } catch {
    /* private mode / storage disabled — no-op */
  }
  if (typeof window !== 'undefined') window.location.reload();
}
