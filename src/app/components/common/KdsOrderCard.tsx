/**
 * V306 — reusable KDS order card. Rendered on:
 *   • POS.tsx Active Orders dialog (authenticated tenant surface)
 *   • KitchenSharePage (/kitchen/{code}, anonymous kitchen board)
 * Same visual + interaction contract so a line cook sees the same
 * card whether they open the shared URL or someone at the counter
 * opens the dialog.
 *
 * The parent owns:
 *   • Order fetching (POS pulls from posApi, Kitchen page polls the
 *     public endpoint).
 *   • The "now" tick (parent runs a 1s setInterval so every mounted
 *     card re-renders with a fresh elapsed value without each card
 *     owning its own timer).
 *   • The advance handler — POS calls posApi.setFulfillmentStatus,
 *     Kitchen page calls kitchenApi.advancePublicKitchenOrder.
 *
 * This component is pure presentation + a click callback. No fetch,
 * no polling, no context — reusable in any layout.
 */
import { CheckCircle, Flame, Hourglass, Trash2 } from 'lucide-react';
import * as posApi from '../../api/pos';
import type { PosOrder } from '../../api/pos';

/** Visual theme keyed by fulfillment status. Mirrored between the
 *  header ribbon, the elapsed-time colour, the action button, and
 *  the item strikethrough on Ready. Mockup-verbatim copy. */
type KdsTheme = {
  ribbonLabel: string;
  ribbonClass: string;
  elapsedClass: string;
  actionLabel: string | null;
  actionClass: string;
  actionIcon: 'flame' | 'utensils' | 'check' | 'trash' | 'hourglass';
};
const KDS_THEME: Record<posApi.PosFulfillmentStatus, KdsTheme> = {
  requested: {
    ribbonLabel: 'Pending',       ribbonClass: 'bg-gray-100 text-gray-500',
    elapsedClass: 'text-gray-500',
    actionLabel: 'Waiting',
    actionClass: 'bg-white hover:bg-gray-50 text-gray-500 border border-gray-200',
    actionIcon: 'hourglass',
  },
  accepted: {
    ribbonLabel: 'Prep',          ribbonClass: 'bg-gray-100 text-gray-600',
    elapsedClass: 'text-gray-700',
    actionLabel: 'Start Cooking',
    actionClass: 'bg-orange-500 hover:bg-orange-600 text-white',
    actionIcon: 'flame',
  },
  in_progress: {
    ribbonLabel: 'Start Cooking', ribbonClass: 'bg-amber-100 text-amber-800',
    elapsedClass: 'text-amber-600',
    actionLabel: 'Mark Ready',
    actionClass: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300',
    actionIcon: 'check',
  },
  ready: {
    ribbonLabel: 'Food Ready',    ribbonClass: 'bg-emerald-100 text-emerald-700',
    elapsedClass: 'text-emerald-600',
    actionLabel: 'Clear from Board',
    actionClass: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300',
    actionIcon: 'trash',
  },
  done: {
    ribbonLabel: 'Done',          ribbonClass: 'bg-gray-100 text-gray-500',
    elapsedClass: 'text-gray-500',
    actionLabel: null,
    actionClass: '',
    actionIcon: 'check',
  },
};

/** MM:SS under 1 hr, HH:MM otherwise. Called with a parent-provided
 *  `nowMs` so all mounted cards tick together (one shared setInterval
 *  in the parent, no per-card timer). */
export function formatElapsed(fromIso: string, nowMs: number): string {
  const start = new Date(fromIso).getTime();
  const secs = Math.max(0, Math.floor((nowMs - start) / 1000));
  const hh = Math.floor(secs / 3600);
  const mm = Math.floor((secs % 3600) / 60);
  const ss = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${pad(hh)}:${pad(mm)}` : `${pad(mm)}:${pad(ss)}`;
}

export interface KdsOrderCardProps {
  order: PosOrder;
  /** Millisecond-precision "now". Parent runs a shared 1s tick so
   *  every card advances its elapsed counter without owning a timer. */
  nowMs: number;
  /** Called when the operator taps the action button. Parent decides
   *  whether the underlying call is authed (POS) or anonymous
   *  (shared kitchen board). */
  onAdvance: (id: string, next: posApi.PosFulfillmentStatus) => void;
}

export function KdsOrderCard({ order: o, nowMs, onAdvance }: KdsOrderCardProps): JSX.Element {
  const theme = KDS_THEME[o.fulfillmentStatus];
  const idx = posApi.POS_FULFILLMENT_CHAIN.indexOf(o.fulfillmentStatus);
  const nextStatus = posApi.POS_FULFILLMENT_CHAIN[idx + 1] ?? null;
  const isReady = o.fulfillmentStatus === 'ready';
  const clickable = theme.actionLabel != null && nextStatus != null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden flex flex-col">
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Kitchen cards use the short sequence (#001, #042) so the
              cook sees the number at a glance from across a counter.
              The full document number (POSQ-15072026-042) sits on the
              row detail / receipt where the accountant needs it. */}
          <div className="text-lg font-bold tracking-tight tabular-nums">
            #{String(o.queueSeq).padStart(3, '0')}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 truncate">
            {o.customerName ?? 'Walk-in'}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-2xl font-bold tabular-nums leading-none ${theme.elapsedClass}`}>
            {formatElapsed(o.createdAt, nowMs)}
          </div>
          <div className="text-[9px] uppercase tracking-widest text-gray-400 mt-1">Elapsed</div>
        </div>
      </div>

      <div className={`mx-4 rounded-md text-[11px] font-semibold uppercase tracking-wide text-center py-1.5 ${theme.ribbonClass}`}>
        {theme.ribbonLabel}
      </div>

      <ul className="px-4 py-3 space-y-2 flex-1">
        {o.items.map((it, i) => {
          const notes = (it.notes ?? '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
          return (
            <li key={it.id ?? i} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`font-medium text-gray-900 ${isReady ? 'line-through text-gray-400' : ''}`}>
                  {it.name}
                </span>
                <span className={`text-xs tabular-nums shrink-0 ${isReady ? 'text-gray-400' : 'text-gray-500'}`}>
                  x{it.quantity}
                </span>
              </div>
              {notes.length > 0 && !isReady && (
                <ul className="mt-0.5 space-y-0.5">
                  {notes.map((n, j) => (
                    <li key={j} className="text-[11px] text-rose-600">· {n}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <div className="px-4 pb-4">
        <button
          type="button"
          disabled={!clickable}
          onClick={() => nextStatus && onAdvance(o.id, nextStatus)}
          className={`w-full h-9 rounded-md text-xs font-semibold uppercase tracking-wide inline-flex items-center justify-center gap-2 transition disabled:cursor-not-allowed ${theme.actionClass}`}
        >
          {theme.actionIcon === 'flame'     && <Flame       className="h-3.5 w-3.5" />}
          {theme.actionIcon === 'check'     && <CheckCircle className="h-3.5 w-3.5" />}
          {theme.actionIcon === 'trash'     && <Trash2      className="h-3.5 w-3.5" />}
          {theme.actionIcon === 'hourglass' && <Hourglass   className="h-3.5 w-3.5" />}
          {theme.actionLabel}
        </button>
      </div>
    </div>
  );
}
