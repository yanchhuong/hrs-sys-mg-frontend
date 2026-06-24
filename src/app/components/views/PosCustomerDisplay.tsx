import { useEffect, useRef, useState } from 'react';
import { ShoppingCart, CheckCircle2, Package } from 'lucide-react';
import {
  POS_DISPLAY_CHANNEL,
  emptyState,
  fmtDisplayMoney,
  resolveVideoEmbed,
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

  // KHQR scan-to-pay overlay (V143 follow-up). Fires the instant the
  // cashier picks KHQR in the Checkout dialog — the customer screen
  // shows the bank's QR fullscreen so the customer can scan with
  // their phone without leaning over the counter to see the cashier's
  // tablet. Closing the dialog or switching methods snaps us back.
  if (state.checkout?.method === 'khqr') {
    return <KhqrPayOverlay state={state} />;
  }

  // V143 — ads carousel takes over when the toggle is on, there's at
  // least one media item with a usable src, and the cart is currently
  // empty. Empty-src placeholders (newly-added rows the operator
  // hasn't filled in yet) are skipped so the display doesn't flip to
  // a black screen mid-edit. Any cart activity (item added → items
  // length > 0) snaps us back to the live order view below.
  const playableMedia = state.slideMedia.filter(m => m.src.trim().length > 0);
  const slideIdle = state.slideEnabled && state.items.length === 0;
  if (slideIdle && playableMedia.length > 0) {
    return <AdsCarousel state={{ ...state, slideMedia: playableMedia }} />;
  }
  // Toggle on but no playable media — covers both "no slides at all"
  // and "slides with empty src". The notice surfaces the diagnostic
  // so the operator knows the toggle was registered but the carousel
  // can't play anything yet.
  if (slideIdle) {
    return <SlidesPendingNotice mediaCount={state.slideMedia.length} />;
  }

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

/** Scan-to-pay overlay (V143 follow-up). Renders fullscreen when the
 *  cashier picks KHQR mid-checkout — the customer scans the QR with
 *  their banking app to pay the displayed total. Multi-bank tenants
 *  see a 2-col grid; single-bank tenants see one big QR.
 *
 *  When the bank-account section has no QRs uploaded yet, falls
 *  back to a clear instruction to ask the cashier — better than a
 *  blank screen. */
function KhqrPayOverlay({ state }: { state: DisplayState }) {
  const qrCards = state.checkout?.banks ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-900 to-black text-white">
      <Header
        shopName={state.shopName}
        logoUrl={state.logoUrl}
        queueNo={state.queueNo}
        customerName={state.customerName}
      />

      <main className="flex-1 flex flex-col items-center justify-center px-8 pb-8">
        <div className="text-center mb-6">
          <div className="text-xl uppercase tracking-[0.3em] text-emerald-400 font-semibold">Scan to Pay</div>
          <div className="mt-3 text-6xl font-bold text-white tabular-nums tracking-tight">
            {fmtDisplayMoney(state.total, state.currency)}
          </div>
          {state.currency === 'USD' && state.exchangeRate > 0 && (
            <div className="mt-1 text-lg text-slate-300 tabular-nums">
              ៛ {(state.total * state.exchangeRate).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              <span className="text-sm text-slate-400 ml-2">@ {state.exchangeRate.toLocaleString('en-US')}</span>
            </div>
          )}
        </div>

        {qrCards.length === 0 ? (
          <div className="rounded-2xl bg-amber-900/40 border border-amber-700 text-amber-100 px-8 py-6 max-w-md text-center">
            <div className="text-lg font-semibold">No KHRQR configured</div>
            <p className="text-sm mt-1 text-amber-200">
              Please pay at the counter — your cashier will help.
            </p>
          </div>
        ) : (
          <div className={`grid gap-6 ${qrCards.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {qrCards.map(b => (
              <div key={b.id} className="bg-white rounded-2xl shadow-2xl p-6 text-center">
                <img
                  src={b.qrDataUrl}
                  alt={b.bankName || 'KHRQR'}
                  className="mx-auto h-72 w-72 object-contain"
                />
                <div className="mt-3 text-xl font-bold text-slate-900">{b.bankName || 'KHRQR'}</div>
                {b.accountName && (
                  <div className="text-sm text-slate-600 mt-0.5 truncate">{b.accountName}</div>
                )}
                {b.accountNumber && (
                  <div className="text-sm font-mono text-slate-700 mt-0.5">{b.accountNumber}</div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-sm text-slate-400">
          Use any KHQR-compatible app · the cashier confirms when payment lands
        </div>
      </main>
    </div>
  );
}

/** Operator-facing hint shown on the display when the slide toggle
 *  is on but no playable media is available — either no slides at
 *  all, or all slides have empty src. (V143) */
function SlidesPendingNotice({ mediaCount }: { mediaCount: number }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50 text-amber-900 p-8">
      <div className="max-w-md text-center space-y-3">
        <div className="text-3xl font-semibold">Slide display enabled</div>
        <p className="text-base leading-relaxed">
          {mediaCount === 0
            ? 'No slides yet. Open POS Settings → Display Ads, click + Image or + Video, drop a file or paste a URL, then Save.'
            : `${mediaCount} slide${mediaCount === 1 ? '' : 's'} added but every source is empty. Open POS Settings → Display Ads and finish filling each one in.`}
        </p>
        <p className="text-xs text-amber-700/80">
          Tip: video sources must be a direct .mp4/.webm URL — page-share links (YouTube,
          Google Drive) won't play in a {'<'}video{'>'} tag.
        </p>
      </div>
    </div>
  );
}

/* ====================================================================
 *  Ads carousel (V143). Fullscreen rotation through the tenant's
 *  configured media list. Images dwell for 8s; videos play to end
 *  before advancing (subject to a 60s hard cap so a broken stream
 *  can't stall the carousel). Logo + shop name overlay the bottom-
 *  left so the brand stays visible.
 * =================================================================== */

const IMAGE_DWELL_MS = 8000;
const VIDEO_MAX_MS   = 60000;

function AdsCarousel({ state }: { state: DisplayState }) {
  const media = state.slideMedia;
  const [idx, setIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Clamp the index if the media list shrinks while the carousel is
  // showing (e.g. operator removed the current slide in settings).
  useEffect(() => {
    if (idx >= media.length) setIdx(0);
  }, [media.length, idx]);

  const current = media[idx] ?? media[0];
  const advance = () => setIdx(i => (media.length === 0 ? 0 : (i + 1) % media.length));

  // Resolve video sources to either a direct <video> URL or a hosted
  // <iframe> embed (YouTube, Vimeo, …). Iframes can't fire onEnded
  // reliably, so the resolver returns a dwellMs the timer below uses
  // as the fixed slide duration.
  const videoEmbed = current?.kind === 'video' ? resolveVideoEmbed(current.src) : null;

  // Slide dwell timer. Image: fixed dwell. Direct file video: a long
  // cap so a busted source can't stall (the <video> onEnded fires
  // first under normal play). Iframe video: the resolver's dwellMs.
  useEffect(() => {
    if (!current) return;
    let dwell = IMAGE_DWELL_MS;
    if (current.kind === 'video') {
      dwell = videoEmbed?.kind === 'iframe'
        ? (videoEmbed.dwellMs ?? VIDEO_MAX_MS)
        : VIDEO_MAX_MS;
    }
    const t = setTimeout(advance, dwell);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, current?.src, videoEmbed?.kind]);

  if (!current) return null;

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Media takes the full viewport — `object-contain` so a
          portrait poster doesn't get cropped, the black background
          letterboxes whatever doesn't fill. Videos may be either a
          direct file (mp4/webm) rendered in <video>, or a hosted
          embed (YouTube / Vimeo) rendered in <iframe>. */}
      {current.kind === 'image' ? (
        <img
          src={current.src}
          alt=""
          className="absolute inset-0 w-full h-full object-contain"
        />
      ) : videoEmbed?.kind === 'iframe' ? (
        <iframe
          src={videoEmbed.src}
          className="absolute inset-0 w-full h-full"
          style={{ border: 0 }}
          allow="autoplay; encrypted-media; picture-in-picture"
          // referrerpolicy=no-referrer-when-downgrade gives YouTube
          // enough info to play but doesn't leak the full URL.
          referrerPolicy="no-referrer-when-downgrade"
          title="Ad video"
        />
      ) : (
        <video
          ref={videoRef}
          src={current.src}
          className="absolute inset-0 w-full h-full object-contain"
          autoPlay
          muted
          loop={media.length === 1}
          playsInline
          onEnded={advance}
          // Defensive: if the source 404s or fails to decode, advance
          // so the carousel doesn't stall.
          onError={advance}
        />
      )}

      {/* Bottom-left brand overlay — keeps the shop name + logo on
          screen even mid-ad so the customer always knows where they
          are. translucent dark gradient for legibility on bright
          imagery. */}
      <div className="absolute inset-x-0 bottom-0 px-8 py-4 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-3">
        {state.logoUrl && (
          <img src={state.logoUrl} alt="" className="h-12 w-12 object-contain rounded bg-white/10 p-1" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xl font-semibold truncate">{state.shopName}</div>
          <div className="text-xs text-white/70">{new Date().toLocaleDateString()}</div>
        </div>
        {media.length > 1 && (
          <div className="flex gap-1.5">
            {media.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
