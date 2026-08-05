import { useEffect, useRef, useState } from 'react';
import { ShoppingCart, CheckCircle2, Package, Maximize2, Minimize2, Utensils, Star } from 'lucide-react';
import {
  POS_DISPLAY_CHANNEL,
  POS_DISPLAY_PATH,
  emptyState,
  fmtDisplayMoney,
  resolveVideoEmbed,
  type DisplayItem,
  type DisplayState,
  type DisplayMessage,
} from '../../utils/posCustomerDisplay';
import * as posDisplayApi from '../../api/posDisplay';

/** Read the pairing code off the URL when the customer Display is
 *  running on a separate device — path looks like
 *  {@code /pos-display/K7T3M}. Empty string means we're in the
 *  same-browser popup mode and should subscribe to BroadcastChannel. */
function readDisplayCode(): string {
  if (typeof window === 'undefined') return '';
  const rest = window.location.pathname.replace(POS_DISPLAY_PATH, '');
  // Strip leading '/' and any trailing slash; tolerate query strings.
  const cleaned = rest.replace(/^\/+/, '').split(/[?#]/)[0].replace(/\/+$/, '');
  return cleaned;
}

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
  /** Code present → we're a paired tablet on a different device,
   *  subscribe via SSE. Empty → we're the same-browser popup,
   *  subscribe via BroadcastChannel (the original behaviour). The
   *  rendered tree below this hook is identical either way. */
  const pairedCode = readDisplayCode();

  /** v-display-fullscreen — mirror the browser's fullscreen state
   *  so the corner icon flips between Enter / Exit. Matches the POS
   *  header's toggle so the cashier can maximise the paired tablet
   *  with one tap. Esc-to-exit works because fullscreenchange fires
   *  either way. */
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    typeof document !== 'undefined' && !!document.fullscreenElement,
  );
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => { /* swallow */ });
    } else {
      document.exitFullscreen?.().catch(() => { /* swallow */ });
    }
  };

  useEffect(() => {
    if (pairedCode) {
      // Remote-pairing path. EventSource auto-reconnects on transient
      // network drops; we just close it on unmount. The server's
      // subscribe() replays the cached lastState immediately so a
      // late-joining tablet sees the current cart without waiting
      // for the next cashier action.
      const es = posDisplayApi.subscribe(pairedCode, (raw) => {
        if (raw && typeof raw === 'object' && (raw as DisplayMessage).kind === 'state') {
          setState((raw as DisplayMessage & { kind: 'state' }).state);
        }
      });
      return () => es.close();
    }
    // Same-browser popup path. Identical contract: a {kind:'state'}
    // message carries the snapshot; "request-state" prompts the
    // currently-mounted POS to publish its latest snapshot so we
    // don't render an empty "Welcome" splash on a fresh-popup race.
    const ch = new BroadcastChannel(POS_DISPLAY_CHANNEL);
    channelRef.current = ch;
    ch.onmessage = (ev: MessageEvent<DisplayMessage>) => {
      if (ev.data?.kind === 'state') setState(ev.data.state);
    };
    ch.postMessage({ kind: 'request-state' } satisfies DisplayMessage);
    return () => { ch.close(); channelRef.current = null; };
  }, [pairedCode]);

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
    <div className="min-h-screen flex flex-col bg-[#f4f7f9] text-slate-800">
      <Header
        shopName={state.shopName}
        logoUrl={state.logoUrl}
        queueNo={state.queueNo}
        customerName={state.customerName}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
      />

      <main className="flex-1 px-8 pb-6 flex gap-6">
        {/* ---- Order list ---- */}
        <section className="flex-1 bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-gray-100 bg-[#fafcff] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-5 w-5 text-teal-700" />
              <h2 className="text-xl font-bold text-slate-800">Your Order</h2>
            </div>
            <span className="text-sm text-slate-500">
              {state.items.length === 0
                ? 'Tap items at the counter'
                : `${state.items.length} item${state.items.length === 1 ? '' : 's'}`}
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {state.items.length === 0 ? (
              <WelcomeEmpty />
            ) : (
              <ul>
                {state.items.map((i, idx) => (
                  <LineTile key={idx} line={i} currency={state.currency} />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ---- Totals card ---- */}
        <aside className="w-[380px] shrink-0">
          <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-8 flex flex-col">
            <div className="flex justify-between items-center text-slate-600 mb-6">
              <span className="text-sm">Subtotal</span>
              <span className="font-bold text-slate-900 text-sm tabular-nums">
                {fmtDisplayMoney(state.subtotal, state.currency)}
              </span>
            </div>
            {state.discountAmount > 0 && (
              <div className="flex justify-between items-center text-slate-500 mb-3">
                <span className="text-sm">Discount</span>
                <span className="text-sm tabular-nums">
                  − {fmtDisplayMoney(state.discountAmount, state.currency)}
                </span>
              </div>
            )}
            {state.taxAmount > 0 && (
              <div className="flex justify-between items-center text-slate-500 mb-3">
                <span className="text-sm">{state.invoiceKind === 'tax' ? 'Tax (VAT 10%)' : 'Tax'}</span>
                <span className="text-sm tabular-nums">
                  {fmtDisplayMoney(state.taxAmount, state.currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center mb-8">
              <span className="text-sm text-slate-600">Total</span>
              <span className="text-5xl font-bold text-teal-700 tabular-nums tracking-tight">
                {fmtDisplayMoney(state.total, state.currency)}
              </span>
            </div>
            {/* V141 — KHR equivalent line at the bottom of the card,
                matches the printed receipt wording so the customer
                sees "Total KHR (@ 4,100)  ៛ 410,000" identical on
                screen and on paper. */}
            {state.currency === 'USD' && state.exchangeRate > 0 && (
              <div className="flex justify-between items-center text-slate-500 mt-auto">
                <span className="text-xs">
                  Total KHR (@ {state.exchangeRate.toLocaleString('en-US')})
                </span>
                <span className="font-bold text-slate-800 text-sm tabular-nums">
                  ៛ {(state.total * state.exchangeRate).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
            )}
            {state.invoiceKind === 'tax' && (
              <div className="mt-2 text-xs text-slate-500 text-right">Includes VAT 10%</div>
            )}
          </div>
        </aside>
      </main>

      {/* Featured slider — pinned at the bottom of the page. Uses the
          same {@link slideMedia} array the fullscreen ads carousel
          consumes (V143), so a tenant that already configured slides
          gets them here automatically. Not rendered when there's
          nothing to show — leaves the page clean instead of a blank
          card. */}
      <FeaturedSlider state={state} />
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* internals                                                            */
/* -------------------------------------------------------------------- */

function Header({
  shopName, logoUrl, queueNo, customerName, onToggleFullscreen, isFullscreen,
}: {
  shopName: string; logoUrl: string | null;
  queueNo: string | null; customerName: string | null;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
}) {
  return (
    <header className="w-full p-8 pb-6 flex items-start justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        {/* Rounded white square with the shop's logo (when set) or a
            neutral fork/knife glyph fallback. Matches the mockup's
            top-left mark. */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="w-16 h-16 rounded-2xl object-contain bg-white border border-gray-100 shadow-sm"
          />
        ) : (
          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-slate-800">
            <Utensils className="h-8 w-8" strokeWidth={2} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 truncate">
            {/* Greeting-first, shop name secondary. Matches the mockup
                where the display leads with "Welcome" and the shop
                identity sits in the logo mark. Falls back to the
                shop name if the tenant hasn't set one. */}
            {shopName === 'Welcome' ? 'Welcome' : shopName}
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            {customerName ?? 'Walk-in'} · {new Date().toLocaleDateString()}
            {queueNo && (
              <>
                {' · '}
                <span className="text-teal-700 font-semibold tabular-nums">Order {queueNo}</span>
              </>
            )}
          </p>
        </div>
      </div>
      {onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors shrink-0"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </button>
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

/** One item tile with its cover image. Rounded-16 thumbnail on the
 *  left (graceful Package fallback when no image), name + qty × price
 *  in the middle, line total bold on the right. Matches the mockup's
 *  order-row shape. */
function LineTile({ line, currency }: { line: DisplayItem; currency: string }) {
  const [broken, setBroken] = useState(false);
  const showImage = !!line.imageUrl && !broken;
  return (
    <li className="flex items-center gap-6 px-6 py-4 border-b border-gray-50 last:border-b-0">
      <div className="w-16 h-16 shrink-0 rounded-[16px] overflow-hidden shadow-sm bg-slate-50 border border-slate-100 flex items-center justify-center">
        {showImage ? (
          <img
            src={line.imageUrl!}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <Package className="h-8 w-8 text-slate-300" strokeWidth={1.25} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-medium text-slate-800 truncate">{line.name}</h3>
        <p className="text-slate-500 text-sm mt-1 tabular-nums">
          {line.qty} × {fmtDisplayMoney(line.unitPrice, currency)}
        </p>
        {line.notes && (
          <p className="text-sm italic text-teal-700 mt-1 break-words">
            · {line.notes}
          </p>
        )}
      </div>

      <div className="text-2xl font-bold text-slate-900 tabular-nums shrink-0">
        {fmtDisplayMoney(line.lineTotal, currency)}
      </div>
    </li>
  );
}

/**
 * Compact featured slider pinned at the bottom of the display page.
 * Reuses the {@link DisplayState.slideMedia} array the fullscreen
 * ads carousel already consumes — a tenant that added slides via
 * settings gets them here automatically.
 *
 * <p>Renders one media at a time with a "FEATURED" label + shop
 * name on the right. Auto-advances every 5s; navigation dots at the
 * bottom let the customer see how many slides remain. Not rendered
 * at all when there's nothing playable, so tenants without slides
 * see a clean page instead of a placeholder card.</p>
 */
function FeaturedSlider({ state }: { state: DisplayState }) {
  const playable = state.slideMedia.filter(m => m.src.trim().length > 0);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (playable.length <= 1) return;
    const id = window.setInterval(
      () => setIdx(i => (i + 1) % playable.length),
      5000,
    );
    return () => window.clearInterval(id);
  }, [playable.length]);
  // Clamp if the list shrank (a tenant removed the current slide
  // via settings — the state broadcast picked it up here).
  useEffect(() => {
    if (idx >= playable.length && playable.length > 0) setIdx(0);
  }, [idx, playable.length]);

  if (playable.length === 0) return null;
  const current = playable[idx];

  return (
    <section className="px-8 pb-8">
      <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex flex-col md:flex-row items-stretch">
          <div className="w-full md:w-1/2 h-64 md:h-72 p-4">
            {current.kind === 'image' ? (
              <img
                src={current.src}
                alt=""
                className="w-full h-full object-cover rounded-[16px]"
              />
            ) : (
              // Video slides render as a muted looping <video> — the
              // compact bottom bar isn't the place for an iframe
              // embed (YouTube/Vimeo controls chrome would fight the
              // layout). Iframe-hosted slides show a still frame
              // instead; for the full-quality video experience the
              // tenant should let the cart empty and the fullscreen
              // ads carousel takes over via the V143 toggle.
              <video
                src={current.src}
                className="w-full h-full object-cover rounded-[16px]"
                autoPlay muted loop playsInline
              />
            )}
          </div>
          <div className="w-full md:w-1/2 p-8 flex flex-col gap-4 justify-center">
            <div className="flex items-center gap-3">
              <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
              <span className="font-bold text-xs uppercase tracking-widest text-slate-500">Featured</span>
            </div>
            {/* Per-slide headline + subtitle (added on top of the
                V143 slideMedia shape). Fall back to the shop name +
                a generic tagline when the tenant hasn't filled the
                fields in — old slides + freshly-added ones both keep
                rendering something sensible. */}
            <h2 className="text-2xl font-bold text-slate-900 leading-tight">
              {(current.caption && current.caption.trim())
                ? current.caption
                : (state.shopName || 'Welcome')}
            </h2>
            <p className="text-slate-500 text-base">
              {(current.subtitle && current.subtitle.trim())
                ? current.subtitle
                : "See what's new at the counter — ask us about today's specials."}
            </p>
          </div>
        </div>
        {/* Slide dots — hidden when there's only one slide (no
            navigation is meaningful). */}
        {playable.length > 1 && (
          <div className="flex justify-center gap-3 pb-4">
            {playable.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Slide ${i + 1}`}
                onClick={() => setIdx(i)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === idx ? 'bg-slate-800' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
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
                  <div className="text-sm tabular-nums text-slate-700 mt-0.5">{b.accountNumber}</div>
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
