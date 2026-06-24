import { useEffect, useRef, useState } from 'react';
import { ShoppingCart, CheckCircle2, Package } from 'lucide-react';
import {
  POS_DISPLAY_CHANNEL,
  emptyState,
  fmtDisplayMoney,
  type DisplayItem,
  type DisplayState,
  type DisplayMessage,
} from '../../utils/posCustomerDisplay';

/**
 * Customer-facing POS display (the "mirror" screen).
 *
 * Renders in a popped-out window the customer can see while the
 * cashier rings up items in the main POS window. State is fed via
 * {@link BroadcastChannel} so every edit on the cart side appears
 * here within a frame. No login required — this is the public face
 * of the counter and the cashier opens it on their side.
 *
 * Layout (revised): logo + shop name on the left of the header,
 * a prominent **Order #001** chip on the right (the customer's
 * receipt-matching anchor), line tiles with cover images on the
 * main pane, and a sticky totals card. "Thank you" splash on
 * paid; "Welcome" splash on empty.
 */
export function PosCustomerDisplay() {
  const [state, setState] = useState<DisplayState>(() => emptyState('Welcome', null));
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const ch = new BroadcastChannel(POS_DISPLAY_CHANNEL);
    channelRef.current = ch;
    ch.onmessage = (ev: MessageEvent<DisplayMessage>) => {
      if (ev.data?.kind === 'state') setState(ev.data.state);
    };
    ch.postMessage({ kind: 'request-state' } satisfies DisplayMessage);
    return () => { ch.close(); channelRef.current = null; };
  }, []);

  if (state.paid) return <PaidSplash state={state} />;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-200 text-slate-900">
      <Header
        shopName={state.shopName}
        logoUrl={state.logoUrl}
        queueNo={state.queueNo}
        customerName={state.customerName}
      />

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_24rem] gap-6 px-8 pb-8">
        {/* ---- Order list ---- */}
        <section className="bg-white rounded-3xl shadow-md overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b bg-gradient-to-r from-emerald-50 to-white flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold tracking-tight">Your Order</h2>
            <span className="ml-auto text-sm text-slate-500">
              {state.items.length === 0
                ? 'Tap items at the counter'
                : `${state.items.length} item${state.items.length === 1 ? '' : 's'}`}
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {state.items.length === 0 ? (
              <WelcomeEmpty />
            ) : (
              <ul className="divide-y">
                {state.items.map((i, idx) => (
                  <LineTile key={idx} line={i} currency={state.currency} />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ---- Totals card ---- */}
        <aside className="bg-white rounded-3xl shadow-md p-6 flex flex-col gap-3 h-fit lg:sticky lg:top-6">
          <Row label="Subtotal" value={fmtDisplayMoney(state.subtotal, state.currency)} />
          {state.discountAmount > 0 && (
            <Row label="Discount" value={`- ${fmtDisplayMoney(state.discountAmount, state.currency)}`} muted />
          )}
          {state.taxAmount > 0 && (
            <Row
              label={state.invoiceKind === 'tax' ? 'Tax (VAT 10%)' : 'Tax'}
              value={fmtDisplayMoney(state.taxAmount, state.currency)}
              muted
            />
          )}
          <hr className="my-2 border-slate-200" />
          <div className="flex items-baseline justify-between">
            <span className="text-lg text-slate-600">Total</span>
            <span className="text-5xl font-bold text-emerald-700 tabular-nums tracking-tight">
              {fmtDisplayMoney(state.total, state.currency)}
            </span>
          </div>
          {/* V141 — KHR equivalent on a single line with the rate
              inside the label parens. Matches the printed receipt's
              "TOTAL KHR (@ 4,100)  ៛ 410,000" layout so the customer
              sees the same wording on screen + on paper. */}
          {state.currency === 'USD' && state.exchangeRate > 0 && (
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-sm text-slate-600">
                Total KHR (@ {state.exchangeRate.toLocaleString('en-US')})
              </span>
              <span className="text-lg font-semibold text-slate-700 tabular-nums">
                ៛ {(state.total * state.exchangeRate).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
          {state.invoiceKind === 'tax' && (
            <div className="mt-1 text-xs text-slate-500 text-right">
              Includes VAT 10%
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* internals                                                            */
/* -------------------------------------------------------------------- */

function Header({
  shopName, logoUrl, queueNo, customerName,
}: {
  shopName: string; logoUrl: string | null;
  queueNo: string | null; customerName: string | null;
}) {
  return (
    <header className="px-8 py-5 flex items-center gap-4">
      {logoUrl && (
        <img src={logoUrl} alt="" className="h-14 w-14 object-contain rounded-xl bg-white border border-slate-200 shadow-sm" />
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-3xl font-bold tracking-tight truncate">{shopName}</h1>
        <div className="text-sm text-slate-500 mt-0.5">
          {customerName ?? 'Walk-in'} · {new Date().toLocaleDateString()}
        </div>
      </div>
      {/* Prominent Order chip — the customer's anchor for matching
          their slip with the order pickup. Hidden until the cart is
          first saved (queueNo arrives with the persisted order). */}
      {queueNo && (
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-semibold">Order</div>
          <div className="text-4xl font-mono font-bold text-emerald-700 leading-none mt-1">{queueNo}</div>
        </div>
      )}
    </header>
  );
}

function WelcomeEmpty() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-24 text-slate-400">
      <div className="h-24 w-24 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
        <Package className="h-12 w-12 text-emerald-400" strokeWidth={1.25} />
      </div>
      <div className="text-3xl font-semibold text-slate-700">Welcome</div>
      <div className="text-sm mt-1">Your order will appear here as items are added.</div>
    </div>
  );
}

/** One item tile with its cover image. Square thumbnail on the left
 *  (graceful Package fallback when no image), name + qty × price in
 *  the middle, line total bold on the right. */
function LineTile({ line, currency }: { line: DisplayItem; currency: string }) {
  const [broken, setBroken] = useState(false);
  const showImage = !!line.imageUrl && !broken;
  return (
    <li className="px-6 py-3 flex items-center gap-4">
      <div className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
        {showImage ? (
          <img
            src={line.imageUrl!}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <Package className="h-8 w-8 text-slate-300" strokeWidth={1.25} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-xl font-semibold leading-snug truncate">{line.name}</div>
        <div className="text-sm text-slate-500 mt-0.5 tabular-nums">
          {line.qty} × {fmtDisplayMoney(line.unitPrice, currency)}
        </div>
        {line.notes && (
          <div className="text-sm italic text-emerald-700 mt-1 break-words">
            · {line.notes}
          </div>
        )}
      </div>

      <div className="text-2xl font-bold tabular-nums text-slate-800">
        {fmtDisplayMoney(line.lineTotal, currency)}
      </div>
    </li>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between text-base ${muted ? 'text-slate-500' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function PaidSplash({ state }: { state: DisplayState }) {
  const paid = state.paid!;
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50 to-white">
      <Header
        shopName={state.shopName}
        logoUrl={state.logoUrl}
        queueNo={paid.queueNo}
        customerName={state.customerName}
      />
      <main className="flex-1 flex items-center justify-center px-8 pb-8">
        <div className="text-center">
          <div className="h-32 w-32 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="h-20 w-20 text-emerald-600" strokeWidth={1.4} />
          </div>
          <div className="mt-6 text-6xl font-bold text-emerald-700 tracking-tight">Thank you!</div>
          <div className="mt-2 text-xl text-slate-600">Payment received</div>

          <div className="mt-10 inline-flex flex-col gap-2 bg-white rounded-3xl shadow-md px-10 py-7 min-w-[20rem]">
            <Row label="Order" value={paid.queueNo} />
            <Row label="Total" value={fmtDisplayMoney(paid.total, state.currency)} />
            <Row label={paid.method.toUpperCase()} value={fmtDisplayMoney(paid.total + paid.change, state.currency)} muted />
            {paid.change > 0 && (
              <Row label="Change" value={fmtDisplayMoney(paid.change, state.currency)} muted />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
