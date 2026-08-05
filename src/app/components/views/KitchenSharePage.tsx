import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, WifiOff, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import * as kitchenApi from '../../api/kitchen';
import type { PosOrder, PosFulfillmentStatus } from '../../api/pos';
import { KdsOrderCard } from '../common/KdsOrderCard';

/**
 * V306 — public kitchen KDS board. Anonymous surface reached via
 * {@code /kitchen/{code}}; the 8-char code in the URL is the only
 * auth, and the code holder gets both READ (live order list) and
 * limited WRITE (advance an order's fulfillmentStatus).
 *
 * <p>Polls {@code GET /api/v1/public/kitchen/{code}/orders} every
 * 5s. That interval is a deliberate MVP trade — SSE would be lower
 * latency but adds a persistent-connection subsystem that isn't
 * worth it for a kitchen tablet that already tolerates a few seconds
 * of lag. Optimistic-update on advance so a tap flips the card
 * before the next poll.</p>
 *
 * <p>Fully anonymous — this page renders regardless of whether the
 * viewer is signed in as any tenant. The API's public/** matcher
 * strips auth on the request path, and this component avoids
 * anything (useAuth, layout chrome, /me) that would fight the
 * anonymous posture.</p>
 */
export function KitchenSharePage(): JSX.Element {
  // Extract the code from /kitchen/{code}. Strip a trailing slash
  // and any query-string. Empty code → the load call throws 404;
  // the render below handles that as "invalid link".
  const code = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const m = window.location.pathname.match(/^\/kitchen\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]).toUpperCase() : '';
  }, []);

  const [orders, setOrders] = useState<PosOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'cooking' | 'prep'>('all');
  const [nowMs, setNowMs] = useState<number>(Date.now());

  // 1s ticker so the elapsed-time counter on every card increments
  // live. Independent of the polling interval — this is a pure
  // client-side clock update, no network work.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Fetch loop: initial load + 5s poll. Uses AbortController so a
  // reload doesn't leave a dangling in-flight fetch mutating state
  // for the previous component instance.
  useEffect(() => {
    if (!code) {
      setError('Missing kitchen code');
      setLoading(false);
      return;
    }
    let stopped = false;
    const load = async () => {
      try {
        const res = await kitchenApi.getPublicKitchenOrders(code);
        if (stopped) return;
        setOrders(res);
        setError(null);
      } catch (e) {
        if (stopped) return;
        // 404 = code invalid or link disabled. Any TypeError = the
        // API is unreachable — the shared api-client already handles
        // "auth users" via redirect but we're a public path, so it
        // re-throws and we render the error inline.
        setError(e instanceof Error ? e.message : 'Kitchen board unavailable');
      } finally {
        if (!stopped) setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(load, 5000);
    return () => { stopped = true; window.clearInterval(id); };
  }, [code]);

  const onAdvance = async (orderId: string, next: PosFulfillmentStatus) => {
    // Optimistic-update: flip the card locally so the tap feels
    // instant. On error, next poll (~5s) restores the true state
    // and the toast tells the operator what went wrong.
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, fulfillmentStatus: next } : o));
    try {
      const updated = await kitchenApi.advancePublicKitchenOrder(code, orderId, next);
      // Merge the fresh row: if it advanced to 'done' the next poll
      // will drop it; we don't need to filter here (the BE list
      // endpoint already excludes done).
      setOrders(prev => prev.map(o => o.id === orderId ? updated : o));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the order');
      // Force a refresh so we're not stuck on the optimistic value.
      try {
        const fresh = await kitchenApi.getPublicKitchenOrders(code);
        setOrders(fresh);
      } catch { /* leave state, next poll will heal */ }
    }
  };

  const inProgressCount = orders.filter(o => o.fulfillmentStatus === 'in_progress' || o.fulfillmentStatus === 'ready').length;
  const pendingCount    = orders.filter(o => o.fulfillmentStatus === 'requested' || o.fulfillmentStatus === 'accepted').length;
  const filtered = orders.filter(o => {
    if (filter === 'cooking') return o.fulfillmentStatus === 'in_progress' || o.fulfillmentStatus === 'ready';
    if (filter === 'prep')    return o.fulfillmentStatus === 'requested' || o.fulfillmentStatus === 'accepted';
    return true;
  });

  if (loading && orders.length === 0) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-gray-500 inline-flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading kitchen board…
        </div>
      </div>
    );
  }
  if (error && orders.length === 0) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-3">
          <WifiOff className="h-10 w-10 mx-auto text-gray-400" />
          <p className="text-base font-medium text-gray-800">Kitchen board unavailable</p>
          <p className="text-sm text-gray-500">{error}</p>
          <p className="text-xs text-gray-400 tabular-nums">/kitchen/{code}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-6">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <ClipboardList className="h-5 w-5 text-gray-500" />
              Active Queue
            </h1>
            <p className="mt-1 text-xs text-gray-500">
              {inProgressCount} Order{inProgressCount === 1 ? '' : 's'} in Progress
              {' · '}
              {pendingCount} Pending
              {error && (
                <span className="inline-flex items-center gap-1 ml-3 text-amber-600">
                  <RefreshCw className="h-3 w-3" /> reconnecting…
                </span>
              )}
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 shrink-0">
            {([
              { key: 'all',     label: 'All',     dot: 'bg-gray-400',  count: orders.length },
              { key: 'cooking', label: 'Cooking', dot: 'bg-amber-500', count: inProgressCount },
              { key: 'prep',    label: 'Prep',    dot: 'bg-gray-400',  count: pendingCount },
            ] as const).map(chip => {
              const active = filter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setFilter(chip.key)}
                  className={`inline-flex items-center gap-1.5 px-3 h-7 rounded-full border text-xs font-medium transition ${
                    active
                      ? 'border-gray-800 bg-gray-900 text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} />
                  {chip.label}
                  <span className={`text-[10px] tabular-nums ${active ? 'text-gray-200' : 'text-gray-400'}`}>
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-24 text-sm text-gray-500">
            {orders.length === 0 ? 'No active orders.' : 'No orders match this filter.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(o => (
              <KdsOrderCard key={o.id} order={o} nowMs={nowMs} onAdvance={onAdvance} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
