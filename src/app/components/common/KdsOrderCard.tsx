/**
 * V306 — reusable KDS order card. Rendered on:
 *   • POS.tsx Active Orders dialog (authenticated tenant surface)
 *   • KitchenSharePage (/kitchen/{code}, anonymous kitchen board)
 * Same visual + interaction contract so a line cook sees the same
 * card whether they open the shared URL or someone at the counter
 * opens the dialog. The mobile POS draws the same card
 * (hrs-pro-appl KitchenQueueSheet) — change both together.
 *
 * v-kds-steps — the card shows the four kitchen steps as a strip,
 *   Order → Accepted → Cooking → Ready
 * (done steps ticked, the current one in its colour, the rest grey),
 * and one button that moves the order to the next step: Accept →
 * Start Cooking → Mark Ready → Clear from Board. The button wears the
 * colour of the step it leads to.
 *
 * The parent owns:
 *   • Order fetching (POS pulls from posApi, Kitchen page polls the
 *     public endpoint), and the list order (posApi.recentFirst).
 *   • The "now" tick (parent runs a 1s setInterval so every mounted
 *     card re-renders with a fresh elapsed value without each card
 *     owning its own timer).
 *   • The advance handler — POS calls posApi.setFulfillmentStatus,
 *     Kitchen page calls kitchenApi.advancePublicKitchenOrder.
 *
 * This component is pure presentation + a click callback. No fetch,
 * no polling, no context — reusable in any layout.
 */
import { Check, CheckCircle, Flame, Hand, Trash2 } from 'lucide-react';
import * as posApi from '../../api/pos';
import type { PosOrder } from '../../api/pos';

type Step = Exclude<posApi.PosFulfillmentStatus, 'done'>;

/** The four steps, in order, with the colour each one wears. */
export const KDS_STEPS: { key: Step; label: string; dot: string; current: string; clock: string }[] = [
  { key: 'requested',   label: posApi.POS_FULFILLMENT_LABELS.requested,   dot: 'bg-blue-500',    current: 'bg-blue-100 text-blue-700 ring-1 ring-blue-300',          clock: 'text-blue-600' },
  { key: 'accepted',    label: posApi.POS_FULFILLMENT_LABELS.accepted,    dot: 'bg-indigo-500',  current: 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300',    clock: 'text-indigo-600' },
  { key: 'in_progress', label: posApi.POS_FULFILLMENT_LABELS.in_progress, dot: 'bg-amber-500',   current: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',       clock: 'text-amber-600' },
  { key: 'ready',       label: posApi.POS_FULFILLMENT_LABELS.ready,       dot: 'bg-emerald-500', current: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300', clock: 'text-emerald-600' },
];

/** The button on a card at each step: what it says, its icon, and the
 *  colour of the step it moves the order into. */
const ACTION: Record<Step, { label: string; icon: 'hand' | 'flame' | 'check' | 'trash'; className: string }> = {
  requested:   { label: 'Accept',           icon: 'hand',  className: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
  accepted:    { label: 'Start Cooking',    icon: 'flame', className: 'bg-orange-500 hover:bg-orange-600 text-white' },
  in_progress: { label: 'Mark Ready',       icon: 'check', className: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  ready:       { label: 'Clear from Board', icon: 'trash', className: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300' },
};

/** Filter chips over the board: All, then one per step. */
export type KdsFilter = 'all' | Step;

/** The cards a filter shows, the most recently changed first. A cleared
 *  (done) order is never drawn, even in the moment before the server's
 *  list drops it. */
export function kdsVisible(orders: PosOrder[], filter: KdsFilter): PosOrder[] {
  const live = orders.filter(o => o.fulfillmentStatus !== 'done');
  return posApi.recentFirst(filter === 'all' ? live : live.filter(o => o.fulfillmentStatus === filter));
}

/** All · Order · Accepted · Cooking · Ready, each with its count. */
export function KdsStepChips({ orders, filter, onChange }: {
  orders: PosOrder[];
  filter: KdsFilter;
  onChange: (f: KdsFilter) => void;
}): JSX.Element {
  const chips = [
    { key: 'all' as const, label: 'All', dot: 'bg-gray-400', count: orders.filter(o => o.fulfillmentStatus !== 'done').length },
    ...KDS_STEPS.map(s => ({ key: s.key, label: s.label, dot: s.dot, count: orders.filter(o => o.fulfillmentStatus === s.key).length })),
  ];
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {chips.map(chip => {
        const active = filter === chip.key;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => onChange(chip.key)}
            aria-pressed={active}
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
  );
}

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
  /** False hides the action button. POS passes canUpdate('pos') (the
   *  fulfillment-status PATCH is pos:update); the anonymous kitchen
   *  board leaves it at the default. */
  canAdvance?: boolean;
}

export function KdsOrderCard({ order: o, nowMs, onAdvance, canAdvance = true }: KdsOrderCardProps): JSX.Element {
  const idx = Math.max(0, KDS_STEPS.findIndex(s => s.key === o.fulfillmentStatus));
  const step = KDS_STEPS[idx];
  const nextStatus = posApi.POS_FULFILLMENT_CHAIN[posApi.POS_FULFILLMENT_CHAIN.indexOf(step.key) + 1] ?? null;
  const action = ACTION[step.key];
  const isReady = o.fulfillmentStatus === 'ready';
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
          <div className={`text-2xl font-bold tabular-nums leading-none ${step.clock}`}>
            {formatElapsed(o.createdAt, nowMs)}
          </div>
          <div className="text-[9px] uppercase tracking-widest text-gray-400 mt-1">Elapsed</div>
        </div>
      </div>

      {/* The four steps — where this order is, and what is left. */}
      <ol className="mx-4 mt-1 grid grid-cols-4 gap-1.5" aria-label="Kitchen steps">
        {KDS_STEPS.map((s, i) => {
          const state = i < idx ? 'done' : i === idx ? 'current' : 'todo';
          return (
            <li
              key={s.key}
              aria-current={state === 'current' ? 'step' : undefined}
              className={`relative h-7 min-w-0 rounded-md px-0.5 inline-flex items-center justify-center text-[10px] font-semibold uppercase whitespace-nowrap ${
                state === 'current' ? s.current
                  : state === 'done' ? 'bg-gray-50 text-gray-400'
                  : 'bg-white text-gray-300 border border-dashed border-gray-200'
              }`}
            >
              {s.label}
              {/* Done: a tick on the corner, so it costs the label no width. */}
              {state === 'done' && (
                <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 text-white inline-flex items-center justify-center ring-2 ring-white">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
              )}
            </li>
          );
        })}
      </ol>

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

      {canAdvance && nextStatus && (
      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={() => onAdvance(o.id, nextStatus)}
          className={`w-full h-9 rounded-md text-xs font-semibold uppercase tracking-wide inline-flex items-center justify-center gap-2 transition ${action.className}`}
        >
          {action.icon === 'hand'  && <Hand        className="h-3.5 w-3.5" />}
          {action.icon === 'flame' && <Flame       className="h-3.5 w-3.5" />}
          {action.icon === 'check' && <CheckCircle className="h-3.5 w-3.5" />}
          {action.icon === 'trash' && <Trash2      className="h-3.5 w-3.5" />}
          {action.label}
        </button>
      </div>
      )}
    </div>
  );
}
