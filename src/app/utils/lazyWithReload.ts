import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Wraps React.lazy so a chunk-load failure — the "Failed to fetch
 * dynamically imported module" TypeError that fires when a user has
 * the app open across a deploy and their cached `index.js` refers to
 * a chunk hash Vercel has since replaced — triggers a single reload
 * instead of a permanent broken screen.
 *
 * Rules:
 *   • Only reload on errors that LOOK like a stale-chunk fetch failure
 *     (message contains "Failed to fetch dynamically imported module",
 *     "Loading chunk", or "Importing a module script failed"). Any other
 *     error rethrows so it lands in the error boundary as a real bug.
 *   • sessionStorage timestamp guards against loops. If we already
 *     reloaded within the last 60 s and it's still failing, the source
 *     is a real problem (the deploy is broken; Vercel is down; the
 *     user's network is dead) — rethrow rather than spin forever.
 *   • On a triggered reload we return a never-resolving promise so React
 *     Suspense stays pending while the browser navigates away — avoids
 *     a flash of the fallback / error boundary before the reload lands.
 */
const RELOAD_KEY = 'hrms:chunk-reload-attempted-at';
const RELOAD_COOLDOWN_MS = 60_000;

function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as { message?: unknown } | null | undefined)?.message ?? err ?? '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Importing a module script failed')
  );
}

/** Same signature as React.lazy — swap it in wherever a lazy import
 *  is declared. See usage in `src/app/config/nav.ts` (via lazyView)
 *  and `src/app/App.tsx` (for Layout / SuperAdminApp / AgencyApp /
 *  anonymous deep-link pages). */
export function lazyWithReload<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await loader();
    } catch (err) {
      if (!isChunkLoadError(err)) throw err;

      // sessionStorage may be inaccessible (private mode, exotic
      // embed context) — treat that as "no prior reload" rather than
      // crashing the loader on top of the original error.
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      } catch { /* noop */ }

      const now = Date.now();
      if (now - last < RELOAD_COOLDOWN_MS) {
        // Already tried reloading recently — something else is broken.
        // Let the error propagate so it's visible in the error boundary
        // + telemetry instead of silently retrying forever.
        throw err;
      }

      try { sessionStorage.setItem(RELOAD_KEY, String(now)); } catch { /* noop */ }
      window.location.reload();
      // Never resolve — React holds Suspense pending while the browser
      // navigates. Without this, the error boundary flashes for a frame
      // before the reload actually swaps the document.
      return new Promise<{ default: T }>(() => {});
    }
  });
}

/** Global fallback for chunk-load failures that slip past `lazyWithReload`.
 *  Registers window-level `error` + `unhandledrejection` listeners; if
 *  either surfaces a stale-chunk fetch error, we reload the tab once
 *  under the same 60 s cooldown. Called from `main.tsx` at boot so it
 *  covers every raw dynamic `import()` in the app — including any not
 *  wrapped in lazyWithReload — plus the extremely rare case where the
 *  loader rejection bubbles as an unhandled promise instead of into
 *  React's error boundary. */
export function installChunkReloadSafetyNet(): void {
  const reloadIfStaleChunk = (err: unknown) => {
    if (!isChunkLoadError(err)) return;

    let last = 0;
    try { last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0); } catch { /* noop */ }

    const now = Date.now();
    if (now - last < RELOAD_COOLDOWN_MS) return;   // don't loop

    try { sessionStorage.setItem(RELOAD_KEY, String(now)); } catch { /* noop */ }
    window.location.reload();
  };

  window.addEventListener('error', ev => {
    // Prefer `ev.error` (real Error object) over `ev.message` — some
    // browsers stringify cross-origin script errors and lose the class.
    reloadIfStaleChunk(ev.error ?? ev.message);
  });
  window.addEventListener('unhandledrejection', ev => {
    reloadIfStaleChunk(ev.reason);
  });
}
