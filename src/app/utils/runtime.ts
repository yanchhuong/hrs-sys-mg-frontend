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

/** Older values that {@link DESKTOP_ONLINE_API_BASE} has had.
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
];

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
    if (override && LEGACY_DESKTOP_ONLINE_API_BASES.includes(override)) return 'online';
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
    if (!LEGACY_DESKTOP_ONLINE_API_BASES.includes(current)) return current;
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
