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
 *  contract. */
export const DESKTOP_ONLINE_API_BASE = 'http://198.211.108.211:4000';

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
  } catch { /* private mode / storage disabled — fall through */ }
  // No (recognised) override — fall back to the baked-in VITE_API_BASE.
  const buildTime = (import.meta as { env?: { VITE_API_BASE?: string } })
    .env?.VITE_API_BASE;
  if (buildTime === DESKTOP_OFFLINE_API_BASE) return 'offline';
  return 'online';
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
