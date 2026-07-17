import { apiJson, apiOrigin, apiPath, apiVoid } from './client';

/**
 * Cross-device POS Display bridge — client helpers.
 *
 * <p>Two paths:</p>
 * <ul>
 *   <li><b>Cashier</b> (authenticated): {@link pair} to mint a code,
 *       {@link publish} to push the live cart state, {@link evict} to
 *       drop the pairing.</li>
 *   <li><b>Display</b> (anonymous): {@link subscribe} opens an
 *       EventSource against the SSE stream and invokes the callback
 *       on every cashier-pushed state update. Returns the
 *       EventSource so the caller can {@code close()} on unmount.</li>
 * </ul>
 */

export interface PairResult {
  code: string;
}

export async function pair(): Promise<PairResult> {
  return apiJson('/api/v1/pos/display/pair', { method: 'POST' });
}

/** Push the current cart state. {@code payload} is opaque JSON —
 *  the Display side parses it back via {@link subscribe}'s callback.
 *  The controller signature is @RequestBody String, and we send a
 *  JSON-typed body so Jackson's StringHttpMessageConverter binds it
 *  cleanly. Server stores + re-emits verbatim so a future cart-shape
 *  tweak doesn't need a backend redeploy. */
export async function publish(code: string, payload: unknown): Promise<void> {
  return apiVoid(`/api/v1/pos/display/${encodeURIComponent(code)}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
  } as Parameters<typeof apiVoid>[1]);
}

export async function evict(code: string): Promise<void> {
  return apiVoid(`/api/v1/pos/display/${encodeURIComponent(code)}`, { method: 'DELETE' });
}

/** Subscribe to a paired session's SSE stream. The callback receives
 *  the parsed JSON payload on every cashier update. EventSource auto-
 *  reconnects on transient network drops; the caller's only job is
 *  to {@code close()} it on unmount. Anonymous — no auth header. */
export function subscribe(
  code: string,
  onState: (payload: unknown) => void,
  onError?: (e: Event) => void,
): EventSource {
  // Route via apiOrigin + apiPath so the same "/api" prefix strip
  // that apiJson performs (see client.ts:apiPath) applies here too.
  // Without this, EventSource lands at `${base}/api/v1/…` which on
  // a deploy where nginx exposes the app under `/api-02/v1/`
  // (VITE_API_BASE=…/api-02) turns into a 404 — the SSE proxy
  // location only matches after the "/api" prefix is stripped.
  const path = apiPath(`/api/v1/pos/display/${encodeURIComponent(code)}/stream`);
  const es = new EventSource(`${apiOrigin()}${path}`);
  es.addEventListener('state', (e: MessageEvent<string>) => {
    try {
      onState(JSON.parse(e.data));
    } catch {
      // Server pushed a non-JSON payload — swallow so a flaky message
      // doesn't tear down the whole subscription. The next clean
      // 'state' event will repopulate the screen.
    }
  });
  if (onError) es.onerror = onError;
  return es;
}
