/**
 * Customer-facing POS display — shared types + channel name.
 *
 * Architecture: the POS page lives in the main window; the display
 * page lives in a second (popped-out) window on the same origin. The
 * two communicate via {@link BroadcastChannel}, so cart edits ripple
 * live to the customer without any server round-trip.
 *
 * Messages:
 *   • {@code state} — POS → display: a full snapshot of the current
 *     ticket (items + totals + welcome / paid state). Re-broadcast on
 *     every cart change, customer change, or settings change.
 *   • {@code request-state} — display → POS: sent on display mount so
 *     a window opened mid-sale catches the in-flight cart immediately.
 *
 * Two-window communication via BroadcastChannel is intentionally
 * client-only: no server WebSocket, no shared workers. Single-tenant
 * one-cashier setups (the POS reality) don't need more.
 */

export const POS_DISPLAY_CHANNEL = 'pos-customer-display';
export const POS_DISPLAY_PATH    = '/pos/display';

export interface DisplayItem {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  notes: string | null;
  /** Cover image (URL or base64 data URL) resolved from the linked
   *  stock item. Null when the line is ad-hoc or the item has no
   *  image — the display falls back to a placeholder glyph. */
  imageUrl: string | null;
}

/** Snapshot the POS page broadcasts on every relevant change. The
 *  display window treats this as the single source of truth — its
 *  own local state is just whatever the latest snapshot was. */
export interface DisplayState {
  shopName: string;
  logoUrl: string | null;
  /** Current queue / order number, e.g. "#001". Null when the cart
   *  is empty or the order hasn't been minted yet. */
  queueNo: string | null;
  customerName: string | null;
  items: DisplayItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  currency: string;
  /** USD → KHR exchange rate snapshot (V141). The display shows the
   *  KHR equivalent next to the USD total when this is positive. */
  exchangeRate: number;
  /** Receipt kind derived from the cart's Tax dropdown — 'tax' / 'commercial'. */
  invoiceKind: 'commercial' | 'tax';
  /** When true AND {@link slideMedia} is non-empty AND the cart is
   *  empty (no items, no paid splash), the display swaps to a
   *  fullscreen ads carousel instead of the Welcome state. (V143) */
  slideEnabled: boolean;
  /** Carousel media list — {kind, src} entries; image src can be a
   *  base64 data URL or a public URL, video src must be a URL. */
  slideMedia: { kind: 'image' | 'video'; src: string }[];
  /** Checkout-in-progress overlay. Non-null while the cashier has
   *  the Checkout dialog open. When method='khqr', the customer
   *  display shows the bank's QR fullscreen so the customer can
   *  scan to pay. Other methods keep the order view visible. */
  checkout: {
    method: 'cash' | 'card' | 'khqr' | 'bank';
    banks: { id: string; bankName: string; accountName: string; accountNumber: string; qrDataUrl: string }[];
  } | null;
  /** Set when checkout just completed — display switches to the
   *  "Thank you" splash. Cleared on the next "New Sale" event. */
  paid: null | {
    total: number;
    method: string;
    change: number;
    queueNo: string;
  };
}

/** Empty cart state — shown before the first item is added. */
export function emptyState(shopName: string, logoUrl: string | null, currency = 'USD'): DisplayState {
  return {
    shopName, logoUrl,
    queueNo: null,
    customerName: null,
    items: [],
    subtotal: 0,
    discountAmount: 0,
    taxAmount: 0,
    total: 0,
    currency,
    exchangeRate: 0,
    invoiceKind: 'commercial',
    slideEnabled: false,
    slideMedia: [],
    checkout: null,
    paid: null,
  };
}

export type DisplayMessage =
  | { kind: 'state'; state: DisplayState }
  | { kind: 'request-state' };

/** Format a money amount the display can render directly. Mirrors the
 *  fmtMoney logic on the receipt so the customer screen + the printed
 *  slip never disagree on punctuation. */
export function fmtDisplayMoney(amount: number, currency: string): string {
  if (currency === 'USD') return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currency === 'KHR') return `៛ ${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `${currency} ${amount.toLocaleString('en-US')}`;
}

/** Resolved playable form of a video source. The carousel needs an
 *  iframe for hosted players (YouTube, Vimeo) and a <video> tag for
 *  direct files — different elements, same UX intent. */
export interface VideoEmbed {
  /** 'video' = direct media URL (mp4/webm/ogg) for a <video> tag.
   *  'iframe' = an embeddable hosted-player URL for an <iframe>.
   *  'invalid' = the input doesn't look usable (we still show it,
   *  but the carousel skips it on error). */
  kind: 'video' | 'iframe' | 'invalid';
  src: string;
  /** Hosted players don't fire onEnded reliably, so the carousel
   *  uses a fixed dwell time when this is set (milliseconds). */
  dwellMs?: number;
  /** Human label — used by the settings dialog to surface what
   *  kind of player it resolved to so the operator can tell at a
   *  glance whether the URL is going to work. */
  label: string;
}

const YOUTUBE_DWELL_MS = 30_000;
const VIMEO_DWELL_MS   = 30_000;

/** Convert an arbitrary video URL into something the carousel can
 *  play. YouTube + Vimeo get an iframe embed; direct file URLs go
 *  to the <video> tag; anything else (page links, drive shares,
 *  blank) returns 'invalid' so the caller can warn the operator. */
export function resolveVideoEmbed(raw: string): VideoEmbed {
  const src = (raw ?? '').trim();
  if (!src) return { kind: 'invalid', src: '', label: 'empty' };

  // ---- YouTube ----------------------------------------------------
  // Accept watch URLs, youtu.be short URLs, and embed URLs. The
  // /embed/ form is what we ultimately render; the helper params
  // make it autoplay-muted-loop, controls-hidden, modest branding.
  const yt = extractYouTubeId(src);
  if (yt) {
    const params = new URLSearchParams({
      autoplay: '1', mute: '1', loop: '1', controls: '0',
      modestbranding: '1', rel: '0', playsinline: '1',
      // loop on a single video requires playlist=<id>
      playlist: yt,
    });
    return {
      kind: 'iframe',
      src: `https://www.youtube.com/embed/${yt}?${params.toString()}`,
      dwellMs: YOUTUBE_DWELL_MS,
      label: 'YouTube',
    };
  }

  // ---- Vimeo ------------------------------------------------------
  const vimeoMatch = src.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) {
    const id = vimeoMatch[1];
    const params = new URLSearchParams({
      autoplay: '1', muted: '1', loop: '1',
      background: '1',     // hides Vimeo chrome
      playsinline: '1',
    });
    return {
      kind: 'iframe',
      src: `https://player.vimeo.com/video/${id}?${params.toString()}`,
      dwellMs: VIMEO_DWELL_MS,
      label: 'Vimeo',
    };
  }

  // ---- Direct file -----------------------------------------------
  // mp4 / webm / ogg / mov / data URLs all play in <video>.
  if (/\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i.test(src)
      || src.startsWith('data:video/')) {
    return { kind: 'video', src, label: 'Direct file' };
  }

  // Unknown — treat as a direct URL but mark invalid so the
  // settings preview can warn the operator.
  return { kind: 'invalid', src, label: 'Unsupported URL' };
}

function extractYouTubeId(url: string): string | null {
  // Match: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID,
  // youtube.com/shorts/ID. Stops at the first ?, &, /, or end.
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}
