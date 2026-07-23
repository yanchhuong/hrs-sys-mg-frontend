import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Search, MapPin, AlertCircle, Store, Package,
  ShoppingCart, Plus, Minus, X, CheckCircle2, StickyNote,
  Navigation, ExternalLink, Info, Truck, Hand, QrCode, Banknote,
  Phone, Mail, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { toast } from 'sonner';
import * as shopApi from '../../api/shop';
import { parseModifiers, type ItemModifiers } from '../../api/items';
import { MapPicker } from '../common/MapPicker';

/** Customer's pick inside one modifier group. The cashier sees these
 *  baked into the line's notes field so they can fulfil the order
 *  without a side channel. */
interface SelectedModifier {
  group: string;
  label: string;
  priceAdj: number;
}

/** Render a stable key for a set of modifier picks so two cart rows
 *  for the same item with different picks don't collapse into one.
 *  Sorted to make the key order-independent. */
function modifierKey(mods: SelectedModifier[]): string {
  if (mods.length === 0) return '';
  return mods
    .map(m => `${m.group}=${m.label}`)
    .sort()
    .join('|');
}

/** Serialise the modifier picks + customer note into the single
 *  `notes` field the BE accepts. The cashier sees this on the cart
 *  row when they open the ticket: "Size: Large, Sugar: 50% | extra ice". */
function composeLineNotes(mods: SelectedModifier[], note: string): string | undefined {
  const modText = mods.map(m => `${m.group}: ${m.label}`).join(', ');
  const noteText = note.trim();
  if (!modText && !noteText) return undefined;
  if (modText && noteText) return `${modText} | ${noteText}`;
  return modText || noteText;
}

/**
 * Anonymous /shop/{code} landing page (V145).
 *
 * <p>Two slices:</p>
 * <ul>
 *   <li>Browse — fetches the tenant's menu, renders POS-style cards.
 *       Out-of-stock items (deduction-aware, mirrors POS) are filtered
 *       out before the grid.</li>
 *   <li>Order — tap a card to add 1, tap again to add another. A
 *       sticky cart bar at the bottom shows the count + running total
 *       and opens a checkout sheet where the customer types an
 *       optional name / phone / note and submits. The order lands on
 *       the cashier's Open Orders queue as an open PosOrder.</li>
 * </ul>
 */

// v-shop-dynamic-categories — chip list now mirrors the POS page:
// known categories in their brand-defined order, then any custom
// free-text labels the tenant has used alphabetically, then "Other"
// pinned to the tail. Category is a plain string (was a strict enum)
// so a tenant-typed "Pin" or "Hairpin" flows straight through.
const KNOWN_POS_CATEGORIES: readonly string[] =
  ['drink', 'snack', 'food', 'craft', 'souvenir', 'jewelry', 'other'];
const KNOWN_LABELS: Record<string, string> = {
  drink:    'Drinks',
  snack:    'Snacks',
  food:     'Food',
  craft:    'Craft',
  souvenir: 'Souvenir',
  jewelry:  'Jewelry',
  other:    'Other',
};
const normalCat = (raw: string | undefined | null): string =>
  (raw ?? '').trim().toLowerCase() || 'other';
const catLabel = (key: string): string =>
  key === 'all' ? 'All' : (KNOWN_LABELS[key] ?? key[0].toUpperCase() + key.slice(1));

/** Per-item line in the local cart state. The map key is a composite
 *  of {@code item.id} + modifier signature so the same item with two
 *  different modifier sets keeps two separate rows. */
interface CartLine {
  /** Composite key the cart Map is indexed by — also the React key
   *  on each rendered row. Stable for a given (item, modifier set). */
  key: string;
  item: shopApi.PublicShopItem;
  qty: number;
  /** Customer picks inside each modifier group on the item. Empty
   *  array for items without modifiers. */
  modifiers: SelectedModifier[];
  /** Per-line note ("ice cubes please") — separate from the
   *  whole-order note at the bottom of the checkout sheet. */
  notes: string;
}

/** Set / update a document <meta> tag by name (or property when isProperty=true).
 *  Creates the element if missing; overwrites the content if present. Used
 *  for SEO + social preview crawlers on the public shop page. */
function setMeta(name: string, content: string, isProperty = false) {
  if (typeof document === 'undefined') return;
  const attr = isProperty ? 'property' : 'name';
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Set / update a document <link rel="..."> tag. Used for canonical URL. */
function setLink(rel: string, href: string) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/** Page size for the shop's infinite-scroll grid. Tiles are cheap to
 *  render but 200+ at once punishes low-end phones — 24 fills 4-5 rows
 *  on desktop, ~8-12 rows on mobile. */
const SHOP_PAGE_SIZE = 24;

/** Per-line unit price = base + sum of selected modifier price deltas. */
function lineUnitPrice(line: CartLine): number {
  return Number(line.item.unitPrice) + line.modifiers.reduce((s, m) => s + Number(m.priceAdj || 0), 0);
}

export function PublicShopPage() {
  const code = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const parts = window.location.pathname.split('/').filter(Boolean);
    const i = parts.indexOf('shop');
    return i >= 0 && i + 1 < parts.length ? parts[i + 1] : '';
  }, []);

  const [data, setData] = useState<shopApi.PublicShopPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  // Infinite-scroll pagination — current cap on how many filtered
  // items are actually rendered. Bumped by SHOP_PAGE_SIZE when the
  // sentinel div at the bottom of the grid intersects the viewport.
  // Resets to SHOP_PAGE_SIZE whenever search or category changes so
  // a fresh filter always starts from the top.
  const [visibleCount, setVisibleCount] = useState<number>(SHOP_PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  /** Cart keyed by stockItemId so a re-tap on the same item increments
   *  the qty without duplicating the row. Reset on a successful
   *  submit so the customer can place another order if they want. */
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map());
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Set after a successful submit — drives the receipt screen. */
  const [confirmed, setConfirmed] = useState<shopApi.PublicOrderResult | null>(null);

  // Customer-typed fields. All optional; the server falls back to
  // "Walk-in (Online)" if name is blank.
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custNote, setCustNote] = useState('');
  /** Google Maps-style URL for pickup / delivery — either captured
   *  via the browser's geolocation API ("Use my location") or pasted
   *  by the customer (any maps.google.com / maps.app.goo.gl share
   *  link works). Appended to the order's notes on submit so the
   *  cashier can click straight through to Google Maps from the
   *  ticket. */
  const [pickupLocation, setPickupLocation] = useState('');
  /** v-shop-pin-map — modal for picking a delivery location on a
   *  Leaflet map. Confirmed pin becomes a google.com/maps?q=lat,lng
   *  URL which lands in {@link pickupLocation}. */
  const [pinOpen, setPinOpen] = useState(false);
  const [pinLatLng, setPinLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  /** Fulfilment mode. {@code pickup} keeps the contact fields
   *  optional; {@code delivery} marks Name + Phone + Location as
   *  required AND surfaces the payment-method picker. */
  const [orderMode, setOrderMode] = useState<'pickup' | 'delivery'>('pickup');
  /** Customer's payment preference for delivery orders. Cash means
   *  "Cash on hand" — they pay the delivery person on arrival.
   *  KHRQR means they'll scan a QR sent by the merchant. Recorded
   *  in the order's notes so the cashier knows which channel to
   *  arrange. Pickup orders keep "Payment happens in person" and
   *  skip this picker. */
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'khrqr'>('cash');
  /** Active PayWay session for the KHRQR flow. Null while no
   *  session is open. Polled at 2s intervals; flipping to
   *  status='paid' marks the order as pre-paid before submit. */
  const [paywaySession, setPaywaySession] = useState<shopApi.PublicPayWaySession | null>(null);
  const [paywayBusy, setPaywayBusy] = useState(false);
  const [paywayError, setPaywayError] = useState<string | null>(null);
  /** One-attempt guard so a failed mint doesn't retry-storm the
   *  gateway on every state flip. Reset when (cart total, method,
   *  mode) changes. Pattern mirrors the POS checkout dialog. */
  const paywayAttemptKeyRef = useRef<string | null>(null);

  /** One-tap geolocation → composed Google Maps URL. Soft-fails on
   *  permission denied / unsupported / timeout so the customer can
   *  fall back to pasting a link manually. */
  const useMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Geolocation is not available on this device.');
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        // Maps URLs API — opens a pin at the supplied coordinates on
        // both desktop google.com/maps AND the Maps mobile app.
        setPickupLocation(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
        setGeoBusy(false);
        toast.success('Location captured');
      },
      err => {
        setGeoBusy(false);
        const msg = err.code === err.PERMISSION_DENIED
          ? 'Location permission denied — paste a Google Maps link instead.'
          : 'Could not get your location — paste a Google Maps link instead.';
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };

  useEffect(() => {
    if (!code) {
      setError('Missing shop code');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await shopApi.getPublicMenu(code);
        if (!cancelled) {
          setData(r);
          // ── SEO metadata ────────────────────────────────────────
          // Populate <title>, meta description, Open Graph + Twitter
          // Card tags so Google (and social preview crawlers) can
          // index the shop by its display name + address, and any
          // shared link surfaces a rich card. Googlebot executes JS
          // and reads these post-hydration values.
          const shopName = r.shopName || 'Shop';
          const desc = [
            `${shopName} — online menu.`,
            r.address ? `📍 ${r.address}` : null,
            `${r.items.length} products available.`,
          ].filter(Boolean).join(' ');
          document.title = `${shopName} — Menu`;
          setMeta('description', desc);
          setMeta('og:title', `${shopName} — Menu`, true);
          setMeta('og:description', desc, true);
          setMeta('og:type', 'website', true);
          setMeta('og:url', window.location.href, true);
          if (r.logoUrl) setMeta('og:image', r.logoUrl, true);
          setMeta('twitter:card', 'summary');
          setMeta('twitter:title', `${shopName} — Menu`);
          setMeta('twitter:description', desc);
          // Canonical link so Google doesn't treat query-string
          // variants (?utm=…) as duplicate pages.
          setLink('canonical', window.location.origin + window.location.pathname);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Shop not found');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  // Browse page is shopper-facing: hide anything we couldn't actually
  // sell right now. Out-of-stock items add noise without a use case —
  // the customer can't order them and the cashier can't fulfil them.
  const inStockItems = useMemo(() => {
    return data ? data.items.filter(it => it.inStock) : [];
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inStockItems.filter(it => {
      if (category !== 'all' && normalCat(it.category) !== category) return false;
      if (!q) return true;
      return it.name.toLowerCase().includes(q)
          || (it.description ?? '').toLowerCase().includes(q);
    });
  }, [inStockItems, search, category]);

  // Reset the visible window whenever the filter shrinks / changes so
  // "load more" starts fresh from the top on every search or category
  // change (no orphan "no items" gap because the pagination was still
  // pointing past the new result set).
  useEffect(() => { setVisibleCount(SHOP_PAGE_SIZE); }, [search, category]);

  // IntersectionObserver on the sentinel div at the bottom of the
  // grid. When it enters the viewport (rootMargin=200px so it fires
  // a bit before the user hits the bottom), bump the visible window
  // by SHOP_PAGE_SIZE. Rebound every time `filtered` changes so the
  // observer is always pointing at the CURRENT bottom.
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    if (visibleCount >= filtered.length) return;  // already rendered all
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setVisibleCount(c => Math.min(c + SHOP_PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length, visibleCount]);

  // Rendered slice — used by the grid below. Kept as its own memo so
  // the paginated child list is memoized properly.
  const visibleItems = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  // Counts by normalized category string — every custom label the
  // tenant has used gets its own entry. "All" is a synthetic bucket
  // that just holds the total.
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    c.set('all', inStockItems.length);
    for (const it of inStockItems) {
      const k = normalCat(it.category);
      c.set(k, (c.get(k) ?? 0) + 1);
    }
    return c;
  }, [inStockItems]);

  // Chip keys — 'all' first, then known categories (minus 'other'),
  // then any custom labels alphabetically, then 'other' pinned last.
  const chipKeys: readonly string[] = useMemo(() => {
    const knownExclOther = KNOWN_POS_CATEGORIES.filter(k => k !== 'other');
    const customs = Array.from(new Set(inStockItems.map(i => normalCat(i.category))))
      .filter(k => !KNOWN_POS_CATEGORIES.includes(k))
      .sort();
    return ['all', ...knownExclOther, ...customs, 'other'];
  }, [inStockItems]);

  const cartLines = useMemo(() => Array.from(cart.values()), [cart]);
  const cartCount = useMemo(() => cartLines.reduce((s, l) => s + l.qty, 0), [cartLines]);
  const cartTotal = useMemo(
    () => cartLines.reduce((s, l) => s + l.qty * lineUnitPrice(l), 0),
    [cartLines],
  );

  /** Mint a PayWay KHRQR session whenever the customer has Delivery
   *  + KHRQR active AND there's a positive cart total. One attempt
   *  per (cart-total, mode, method) tuple — a 4xx surfaces an error
   *  and stops; toggling the picker resets the guard so a retry is
   *  one tap away. Declared after {@code cartTotal} so the deps array
   *  doesn't trip JS's temporal-dead-zone check. */
  useEffect(() => {
    if (!checkoutOpen) return;
    if (orderMode !== 'delivery' || paymentMethod !== 'khrqr') return;
    if (cartTotal <= 0) return;
    const key = `${cartTotal.toFixed(2)}|${orderMode}|${paymentMethod}`;
    if (paywayAttemptKeyRef.current === key) return;
    paywayAttemptKeyRef.current = key;
    setPaywayError(null);
    setPaywayBusy(true);
    (async () => {
      try {
        const s = await shopApi.mintShopPayWayPurchase(code, cartTotal, 'USD');
        setPaywaySession(s);
      } catch (e) {
        setPaywayError(e instanceof Error ? e.message : 'PayWay session failed');
      } finally {
        setPaywayBusy(false);
      }
    })();
  }, [checkoutOpen, orderMode, paymentMethod, cartTotal, code]);

  /** Poll the gateway every 2s while a pending session is on screen.
   *  When the customer's bank push lands, the session flips to 'paid'
   *  and the Submit button picks up the {@code tranId} to bake into
   *  the order's notes. */
  useEffect(() => {
    if (!paywaySession || paywaySession.status !== 'pending') return;
    let stopped = false;
    const t = setInterval(async () => {
      try {
        const next = await shopApi.getShopPayWayStatus(code, paywaySession.tranId);
        if (stopped) return;
        if (next.status !== paywaySession.status) setPaywaySession(next);
        if (next.status === 'paid') clearInterval(t);
      } catch { /* swallow — try again next tick */ }
    }, 2000);
    return () => { stopped = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paywaySession?.tranId, paywaySession?.status, code]);

  /** Reset PayWay state whenever the dialog closes or the customer
   *  switches away from Delivery+KHRQR. Clears the attempt-key ref
   *  so reopening with the same picks retries cleanly. */
  useEffect(() => {
    if (checkoutOpen && orderMode === 'delivery' && paymentMethod === 'khrqr') return;
    setPaywaySession(null);
    setPaywayError(null);
    paywayAttemptKeyRef.current = null;
  }, [checkoutOpen, orderMode, paymentMethod]);

  /** Modifier picker target — set when the customer taps an item that
   *  carries a modifierGroups JSON. Null while no picker is open. */
  const [modifierTarget, setModifierTarget] = useState<shopApi.PublicShopItem | null>(null);
  /** v-shop-item-detail — item card tap opens this dialog so the
   *  customer can flip through multi-image carousels + read the full
   *  description before adding. Add-to-cart from inside the dialog
   *  routes back through {@link addOne} so modifiers still open the
   *  existing picker. */
  const [detailTarget, setDetailTarget] = useState<shopApi.PublicShopItem | null>(null);

  // Cart mutators — keep them out of the JSX so the buttons stay
  // terse. `addOne` is the tap-to-add path on the card itself;
  // items with modifiers go through the picker first.
  const addOne = (item: shopApi.PublicShopItem) => {
    const mods = parseModifiers(item.modifiers);
    if (mods && mods.groups.length > 0) {
      setModifierTarget(item);
      return;
    }
    addLine(item, [], '');
  };

  /** Land a finalised line on the cart with the picked modifiers +
   *  empty note. If a matching (item, modifier-set) row already
   *  exists we increment its qty; otherwise we open a new row. */
  const addLine = (item: shopApi.PublicShopItem, modifiers: SelectedModifier[], notes: string) => {
    const key = `${item.id}|${modifierKey(modifiers)}`;
    setCart(prev => {
      const next = new Map(prev);
      const cur = next.get(key);
      if (cur) {
        next.set(key, { ...cur, qty: Math.min(99, cur.qty + 1) });
      } else {
        next.set(key, { key, item, qty: 1, modifiers, notes });
      }
      return next;
    });
  };

  const setQty = (key: string, qty: number) => {
    setCart(prev => {
      const next = new Map(prev);
      const cur = next.get(key);
      if (!cur) return prev;
      if (qty <= 0) next.delete(key);
      else next.set(key, { ...cur, qty: Math.min(99, qty) });
      return next;
    });
  };
  const setLineNote = (key: string, notes: string) => {
    setCart(prev => {
      const next = new Map(prev);
      const cur = next.get(key);
      if (!cur) return prev;
      next.set(key, { ...cur, notes });
      return next;
    });
  };
  const removeLine = (key: string) => setQty(key, 0);
  const clearCart = () => setCart(new Map());

  const submit = async () => {
    if (cart.size === 0) return;
    // Delivery requires Name / Phone / Location. Bounce the submit
    // with a toast pointing at the first missing field instead of
    // letting an under-populated order land on the cashier's queue.
    if (orderMode === 'delivery') {
      if (!custName.trim()) { toast.error('Please enter your name for delivery.'); return; }
      if (!custPhone.trim()) { toast.error('Please enter a phone number — the driver needs to reach you.'); return; }
      if (!pickupLocation.trim().startsWith('http')) {
        toast.error('Please share or paste your delivery location.'); return;
      }
    }
    setSubmitting(true);
    try {
      // Compose the order-level notes from fulfilment mode + (when
      // delivery) payment method + kitchen note + pickup-location URL.
      // The cashier sees all of this on the ticket — payment tells
      // them whether to send a KHRQR or expect cash; the URL opens
      // the customer's pinned spot in Google Maps.
      const noteParts: string[] = [];
      noteParts.push(`Mode: ${orderMode === 'delivery' ? 'Delivery' : 'Pickup'}`);
      if (orderMode === 'delivery') {
        // Bake the PayWay tranId + status into the payment line so
        // the cashier can verify the scan from their PayWay sessions
        // list. "(paid · ...)" means the push already landed; "(pending · ...)"
        // means the QR was minted but the customer's bank push hasn't
        // arrived yet — the cashier should confirm before fulfilling.
        if (paymentMethod === 'khrqr' && paywaySession) {
          const tag = paywaySession.status === 'paid' ? 'paid' : 'pending';
          noteParts.push(`Payment: KHRQR (${tag} · ${paywaySession.tranId})`);
        } else {
          noteParts.push(`Payment: ${paymentMethod === 'khrqr' ? 'KHRQR' : 'Cash on hand'}`);
        }
      }
      if (custNote.trim()) noteParts.push(custNote.trim());
      if (pickupLocation.trim().startsWith('http')) {
        noteParts.push(`Location: ${pickupLocation.trim()}`);
      }
      const composedOrderNote = noteParts.length ? noteParts.join('\n') : undefined;

      const result = await shopApi.submitPublicOrder(code, {
        customerName: custName.trim() || undefined,
        contactPhone: custPhone.trim() || undefined,
        notes: composedOrderNote,
        items: cartLines.map(l => ({
          stockItemId: l.item.id,
          quantity: l.qty,
          // Modifier picks + per-line note both land in `notes` so
          // the cashier sees "Size: Large, Sugar: 50% | extra ice"
          // when fulfilling the ticket — same convention POS uses
          // internally for per-line modifier notes.
          notes: composeLineNotes(l.modifiers, l.notes),
        })),
      });
      setConfirmed(result);
      setCheckoutOpen(false);
      clearCart();
      setCustName('');
      setCustPhone('');
      setCustNote('');
      setPickupLocation('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Order failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <FullPageState>
        <Loader2 className="h-6 w-6 animate-spin text-blue-600 mb-2" />
        <p className="text-sm text-gray-600">Loading menu…</p>
      </FullPageState>
    );
  }
  if (error || !data) {
    return (
      <FullPageState>
        <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
        <p className="text-base font-medium">Shop unavailable</p>
        <p className="text-sm text-gray-500 mt-1">
          {error ?? 'This shop link is no longer active.'}
        </p>
        <p className="text-xs text-gray-400 mt-3 tabular-nums">/shop/{code}</p>
      </FullPageState>
    );
  }

  // Post-submit success screen — supplants the menu so the customer
  // sees their queue number prominently. "Place another order" resets
  // back to the menu.
  if (confirmed) {
    return (
      <FullPageState>
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
        <p className="text-xl font-semibold">Order received</p>
        <p className="text-sm text-gray-500 mt-1">Show this to the counter:</p>
        <p className="mt-4 text-4xl tabular-nums font-bold tracking-widest text-slate-900">
          {confirmed.queueNo}
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Total: <span className="font-semibold text-emerald-700">${Number(confirmed.total).toFixed(2)}</span>
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => setConfirmed(null)}
        >
          Place another order
        </Button>
      </FullPageState>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header banner */}
      <div className="bg-gradient-to-r from-blue-600 to-violet-600 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-white/15 flex items-center justify-center shrink-0 overflow-hidden">
            {data.logoUrl
              ? <img src={data.logoUrl} alt="" className="h-full w-full object-cover" />
              : <Store className="h-7 w-7" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-semibold truncate">
              {data.shopName || 'Shop'}
            </h1>
            <div className="mt-1 flex items-center gap-3 text-xs sm:text-sm text-white/85 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Store className="h-3.5 w-3.5" />
                {counts.all} {counts.all === 1 ? 'Product' : 'Products'}
              </span>
              {data.country && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {data.country}
                </span>
              )}
              <span className="inline-flex items-center gap-1 tabular-nums text-[11px] bg-white/15 px-1.5 py-0.5 rounded">
                {data.code}
              </span>
            </div>
            {/* V266 — company profile row (address / phone / email)
                + trailing "Powered by SMRT HRMS" brand link on the
                right. Always renders (even when no contact info is
                set) so the powered-by attribution is visible on
                every shop. Each contact chip is a link when the
                value is actionable (tel: / mailto:) so a phone tap
                opens the dialer on mobile. */}
            <div className="mt-2 flex items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-white/85 flex-wrap">
              {data.address && (
                <span className="inline-flex items-center gap-1 max-w-full">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate" title={data.address}>{data.address}</span>
                </span>
              )}
              {data.phone && (
                <a
                  href={`tel:${data.phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-1 hover:text-white"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {data.phone}
                </a>
              )}
              {data.email && (
                <a
                  href={`mailto:${data.email}`}
                  className="inline-flex items-center gap-1 hover:text-white"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {data.email}
                </a>
              )}
            </div>
            {/* Powered-by attribution on its own line, left-aligned
                under the contact row so it never elbows the shop's
                own metadata. */}
            <div className="mt-2 text-xs sm:text-sm text-white/85">
              <a
                href="https://hr-share.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-white"
              >
                Powered by <b className="text-white">SMRT HRMS</b>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Search + category chips */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search the menu…"
            className="pl-8 bg-white"
          />
        </div>
        <div className="chip-row">
          {chipKeys
            // Hide chips whose bucket has zero items — keeps the shop
            // menu clean for tenants that only sell drinks (no Snacks(0)
            // / Food(0) / Other(0) clutter next to Drinks). "All" is
            // always visible; the active chip stays visible even if a
            // filter change leaves its count at 0 mid-search.
            .filter(key => key === 'all' || category === key || (counts.get(key) ?? 0) > 0)
            .map(key => {
              const active = category === key;
              const count = counts.get(key) ?? 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`px-3 h-8 rounded-full border text-sm font-medium transition ${
                    active
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {catLabel(key)}
                  <span className="ml-1 text-[11px] opacity-70">({count})</span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {filtered.length === 0 ? (
          <div className="text-center text-sm text-gray-500 py-16">
            {inStockItems.length === 0
              ? 'This shop has no items available right now.'
              : 'No items match your search.'}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {visibleItems.map(it => (
                <PublicShopCard
                  key={it.id}
                  item={it}
                  qtyInCart={cartLines
                    .filter(l => l.item.id === it.id)
                    .reduce((s, l) => s + l.qty, 0)}
                  onOpen={() => setDetailTarget(it)}
                  onAdd={() => addOne(it)}
                />
              ))}
            </div>
            {/* Sentinel + "loading more…" spinner. The IntersectionObserver
                above watches this element — when it enters the viewport
                the visible window grows by SHOP_PAGE_SIZE. Hides once
                every filtered item is rendered. */}
            {visibleCount < filtered.length && (
              <div ref={loadMoreRef} className="mt-6 flex justify-center text-xs text-gray-500 py-4">
                Loading more items…
              </div>
            )}
            {visibleCount >= filtered.length && filtered.length > SHOP_PAGE_SIZE && (
              <div className="mt-6 text-center text-xs text-gray-400 py-3">
                All {filtered.length} items shown.
              </div>
            )}
          </>
        )}
      </div>

      {/* Sticky cart bar — visible whenever the customer has any
          items selected. Tapping it opens the checkout sheet where
          they can review / adjust quantities before submitting. */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative">
                <ShoppingCart className="h-6 w-6 text-blue-600" />
                <span className="absolute -top-1.5 -right-2 bg-blue-600 text-white text-[10px] font-bold rounded-full h-4 min-w-[1rem] px-1 flex items-center justify-center">
                  {cartCount}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {cartCount} {cartCount === 1 ? 'item' : 'items'} · ${cartTotal.toFixed(2)}
                </p>
                <p className="text-[11px] text-gray-500">Review &amp; submit your order</p>
              </div>
            </div>
            <Button
              onClick={() => setCheckoutOpen(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              View order
            </Button>
          </div>
        </div>
      )}

      {/* Checkout sheet. The Radix Dialog primitive is already used
          elsewhere in the app, so I'm reusing it for visual
          consistency — sm:max-w-md keeps the sheet narrow on
          desktop, the dialog goes full-width on mobile by default. */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0 max-h-[90vh] flex flex-col">
          <DialogHeader className="px-5 py-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-1.5">
              Your order
              {/* Tooltip-only blurb — keeps the dialog header compact
                  while still surfacing the "what happens next" copy
                  on hover / long-press. */}
              <span
                className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                title="Submit to the counter — the cashier will prepare and confirm. Payment happens in person."
              >
                <Info className="h-4 w-4" />
              </span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Submit to the counter — the cashier will prepare and confirm. Payment happens in person.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
            {/* Cart lines */}
            {cartLines.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-6">
                Your cart is empty.
              </p>
            ) : (
              <ul className="divide-y border rounded-md bg-white">
                {cartLines.map(line => {
                  const unit = lineUnitPrice(line);
                  return (
                  <li key={line.key} className="p-2.5 space-y-1.5">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                        {line.item.imageUrl ? (
                          <img src={line.item.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Package className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{line.item.name}</p>
                        <p className="text-xs text-gray-500">
                          ${unit.toFixed(2)} {line.item.unit && `/ ${line.item.unit}`}
                        </p>
                        {/* Modifier summary, shown as small grey chips
                            so the customer can sanity-check their
                            picks before submitting. */}
                        {line.modifiers.length > 0 && (
                          <p className="text-[11px] text-gray-500 italic mt-0.5">
                            {line.modifiers.map(m => `${m.group}: ${m.label}`).join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setQty(line.key, line.qty - 1)}
                          className="h-7 w-7 rounded border flex items-center justify-center hover:bg-gray-50"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm font-medium">{line.qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty(line.key, line.qty + 1)}
                          className="h-7 w-7 rounded border flex items-center justify-center hover:bg-gray-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="h-7 w-7 rounded text-gray-400 hover:text-red-600 flex items-center justify-center"
                          title="Remove"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {/* Per-line note — distinct from the whole-order
                        note at the bottom. Keeps "no straw" tied to
                        the Ice Latte instead of bleeding onto every
                        line. Optional, capped at 200 chars. */}
                    <div className="flex items-start gap-1.5 pl-15">
                      <StickyNote className="h-3 w-3 text-gray-400 mt-1.5 shrink-0" />
                      <Input
                        value={line.notes}
                        onChange={e => setLineNote(line.key, e.target.value)}
                        placeholder="Note for this item (optional)"
                        maxLength={200}
                        className="h-7 text-xs"
                      />
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}

            {/* Fulfilment-mode toggle. Pickup keeps the contact block
                optional (legacy); Delivery requires Name + Phone +
                Location and surfaces a payment-method picker. */}
            <div className="pt-2 space-y-2">
              <div className="grid grid-cols-2 gap-1.5 rounded-md border bg-gray-50 p-1">
                <button
                  type="button"
                  onClick={() => setOrderMode('pickup')}
                  className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium transition ${
                    orderMode === 'pickup'
                      ? 'bg-white shadow-sm text-blue-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Hand className="h-4 w-4" />
                  Pickup
                </button>
                <button
                  type="button"
                  onClick={() => setOrderMode('delivery')}
                  className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium transition ${
                    orderMode === 'delivery'
                      ? 'bg-white shadow-sm text-blue-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Truck className="h-4 w-4" />
                  Delivery
                </button>
              </div>
            </div>

            {/* Contact block. Labels + required asterisks toggle with
                the fulfilment mode — Pickup keeps everything optional;
                Delivery marks Name / Phone / Location required so the
                operator has what they need to fulfil the order. */}
            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {orderMode === 'pickup'
                  ? 'Contact (optional)'
                  : 'Delivery details (required)'}
              </p>
              <Input
                value={custName}
                onChange={e => setCustName(e.target.value)}
                placeholder={orderMode === 'delivery' ? 'Your name *' : 'Your name'}
                maxLength={120}
                aria-required={orderMode === 'delivery'}
                className={orderMode === 'delivery' && !custName.trim() ? 'border-red-300' : ''}
              />
              <Input
                value={custPhone}
                onChange={e => setCustPhone(e.target.value)}
                placeholder={orderMode === 'delivery' ? 'Phone *' : 'Phone'}
                inputMode="tel"
                maxLength={32}
                aria-required={orderMode === 'delivery'}
                className={orderMode === 'delivery' && !custPhone.trim() ? 'border-red-300' : ''}
              />

              {/* Pickup / delivery location. One tap "Use my location"
                  fills via GPS; the input below is also live so the
                  customer can paste any maps.google.com / maps.app.goo.gl
                  share link. The link is appended to the order's notes
                  on submit so the cashier can click it from the ticket.
                  Required when orderMode === 'delivery'. */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={useMyLocation}
                    disabled={geoBusy}
                    className="h-9 shrink-0"
                  >
                    {geoBusy
                      ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      : <Navigation className="h-3.5 w-3.5 mr-1.5" />}
                    Use my location
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Seed the map with the existing pin (if any) or the last
                      // "Use my location" hit parsed out of pickupLocation.
                      const m = pickupLocation.match(/q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
                      if (m) setPinLatLng({ lat: Number(m[1]), lng: Number(m[2]) });
                      setPinOpen(true);
                    }}
                    className="h-9 shrink-0"
                  >
                    <MapPin className="h-3.5 w-3.5 mr-1.5" />
                    Pin on map
                  </Button>
                  <Input
                    value={pickupLocation}
                    onChange={e => setPickupLocation(e.target.value)}
                    placeholder={orderMode === 'delivery'
                      ? 'Or paste a map link *'
                      : 'Or paste a map link'}
                    inputMode="url"
                    maxLength={400}
                    aria-required={orderMode === 'delivery'}
                    className={`flex-1 min-w-[180px] ${
                      orderMode === 'delivery' && !pickupLocation.trim().startsWith('http')
                        ? 'border-red-300' : ''
                    }`}
                  />
                </div>
                {pickupLocation.trim().startsWith('http') && (
                  <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="flex-1 truncate" title={pickupLocation}>{pickupLocation}</span>
                    <a
                      href={pickupLocation}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 underline hover:text-emerald-900"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setPickupLocation('')}
                      className="text-gray-400 hover:text-red-600"
                      title="Remove location"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              <Input
                value={custNote}
                onChange={e => setCustNote(e.target.value)}
                placeholder="Note"
                maxLength={240}
              />
            </div>

            {/* Payment method — surfaces only for Delivery. Pickup
                orders are paid at the counter, so the picker would
                just add noise. The choice is recorded on the order's
                notes so the cashier knows whether to send a KHRQR or
                expect cash on delivery. */}
            {orderMode === 'delivery' && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Payment method
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('khrqr')}
                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition ${
                      paymentMethod === 'khrqr'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <QrCode className="h-4 w-4" />
                    KHRQR
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition ${
                      paymentMethod === 'cash'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Banknote className="h-4 w-4" />
                    Cash on hand
                  </button>
                </div>

                {/* KHRQR — render the dynamic PayWay QR. Mirrors the
                    POS scan-to-pay flow: busy spinner while minting,
                    error banner on credential / gateway failure,
                    QR image when the session is live, green "Paid"
                    pill once PayWay's push confirms the customer's
                    payment. */}
                {paymentMethod === 'khrqr' && (
                  <div className="rounded-md border bg-white p-3">
                    {paywayBusy && !paywaySession && (
                      <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-6">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Minting your KHRQR…
                      </div>
                    )}

                    {paywayError && !paywaySession && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 leading-relaxed">
                        {paywayError}
                        <div className="mt-1 text-red-700/80">
                          Switch to <strong>Cash on hand</strong> or try again — the merchant may not have PayWay configured.
                        </div>
                      </div>
                    )}

                    {paywaySession?.qrDataUrl && (
                      <div className="flex flex-col items-center">
                        <div className="text-xs text-gray-500 mb-2">
                          Scan with your bank app to pay <span className="font-semibold tabular-nums">${cartTotal.toFixed(2)}</span>
                        </div>
                        <div className="relative">
                          <img
                            src={paywaySession.qrDataUrl}
                            alt="PayWay KHRQR"
                            className="w-44 h-44 object-contain bg-gray-50 rounded-md border"
                          />
                          {paywaySession.status === 'paid' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-emerald-50/95 rounded-md border-2 border-emerald-500">
                              <div className="flex flex-col items-center text-emerald-700">
                                <CheckCircle2 className="h-10 w-10" />
                                <span className="text-sm font-semibold mt-1">Paid</span>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="mt-2 text-[10px] text-gray-400 tabular-nums">
                          Ref: {paywaySession.tranId}
                        </div>
                        {paywaySession.status === 'pending' && (
                          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-800 ring-1 ring-amber-200">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Waiting for payment…
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="px-5 py-3 border-t shrink-0 gap-2 sm:gap-2">
            <div className="flex-1 text-left">
              <p className="text-[11px] text-gray-500 uppercase tracking-wide">Total</p>
              <p className="text-lg font-bold text-emerald-700">${cartTotal.toFixed(2)}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setCheckoutOpen(false)}
              disabled={submitting}
            >
              Keep shopping
            </Button>
            <Button
              onClick={submit}
              disabled={submitting || cart.size === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Submit order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modifier picker — opens when the customer taps an item that
          carries a modifierGroups JSON. Required groups force a pick
          before "Add to order" is enabled. Cancel returns to browse
          without mutating the cart. */}
      <ModifierPickerDialog
        item={modifierTarget}
        onCancel={() => setModifierTarget(null)}
        onConfirm={(mods) => {
          if (modifierTarget) addLine(modifierTarget, mods, '');
          setModifierTarget(null);
        }}
      />

      {/* v-shop-item-detail — image carousel + description + Add. */}
      <ItemDetailDialog
        item={detailTarget}
        qtyInCart={detailTarget
          ? cartLines.filter(l => l.item.id === detailTarget.id).reduce((s, l) => s + l.qty, 0)
          : 0}
        onClose={() => setDetailTarget(null)}
        onAdd={() => { if (detailTarget) addOne(detailTarget); }}
      />

      {/* v-shop-pin-map — Leaflet-based location picker. Customer drops
          a pin (or searches by place name); we save it as a google.com/maps
          URL so the cashier ticket has a click-through the driver can use. */}
      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent className="sm:max-w-lg p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              Pin your location
            </DialogTitle>
            <DialogDescription className="text-xs">
              Click the map or search a place to drop a pin. The cashier will
              use this to route the delivery.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <MapPicker
              lat={pinLatLng?.lat ?? null}
              lng={pinLatLng?.lng ?? null}
              onChange={(lat, lng) => setPinLatLng({ lat, lng })}
            />
          </div>
          <DialogFooter className="px-5 py-3 border-t">
            <Button variant="outline" onClick={() => setPinOpen(false)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!pinLatLng}
              onClick={() => {
                if (!pinLatLng) return;
                const { lat, lng } = pinLatLng;
                setPickupLocation(`https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`);
                setPinOpen(false);
              }}
            >
              Use this location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FullPageState({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="text-center flex flex-col items-center">{children}</div>
    </div>
  );
}

/** Product card with two tap targets:
 *   • whole card → opens the detail dialog (image carousel + full copy)
 *   • floating "+" pill on the bottom-right of the image → adds one
 *     directly, so a customer who's already decided doesn't have to
 *     open the dialog just to add.
 *  The image-count badge (+N extra images) sits top-left so it's the
 *  first thing the eye lands on above the product name. */
function PublicShopCard({
  item, qtyInCart, onOpen, onAdd,
}: {
  item: shopApi.PublicShopItem;
  qtyInCart: number;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const cover = shopApi.itemImages(item)[0] ?? '';
  const showImage = !!cover && !broken;
  const totalImages = shopApi.itemImages(item).length;
  return (
    // Card is a div (not a button) so the nested Add button is valid
    // HTML — button-in-button breaks Firefox click routing. Keyboard
    // affordance kept via role/tabIndex/onKeyDown for accessibility.
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex flex-col text-left rounded-lg border bg-white overflow-hidden hover:border-blue-400 hover:shadow-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
    >
      <div className="aspect-square w-full bg-gray-50 flex items-center justify-center overflow-hidden shrink-0 relative">
        {showImage ? (
          <img
            src={cover}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <Package className="h-12 w-12 text-gray-300" strokeWidth={1.25} />
        )}
        {totalImages > 1 && (
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-white bg-black/60 rounded px-1.5 py-0.5">
            +{totalImages - 1}
          </span>
        )}
      </div>
      <div className="p-2 flex-1">
        {/* Name row — unit sits inline to the right so the price row
            below can be dedicated to price + the quick-add button. */}
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-sm text-gray-900 line-clamp-2 leading-snug min-w-0" title={item.name}>
            {item.name}
          </div>
          {item.unit && (
            <span className="text-[11px] text-gray-500 shrink-0 mt-0.5">{item.unit}</span>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-emerald-700">
            ${Number(item.unitPrice).toFixed(2)}
          </span>
          {/* Quick-add button — stopPropagation so tapping the "+" only
              adds one and doesn't also open the detail dialog. Items with
              modifiers still open the picker via addOne()'s existing
              fork, so the customer picks Size/Sugar before committing. */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            disabled={!item.inStock}
            aria-label={`Add ${item.name} to cart`}
            title="Add to cart"
            className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {qtyInCart > 0 && (
        <div className="absolute top-1.5 right-1.5 bg-blue-600 text-white text-[11px] font-bold rounded-full h-6 min-w-[1.5rem] px-1.5 flex items-center justify-center shadow-md">
          {qtyInCart}
        </div>
      )}
    </div>
  );
}

/* ====================================================================
 *  v-shop-item-detail — item detail dialog with image carousel.
 *
 *  Opens on card tap. Shows every image the tenant uploaded (V265),
 *  the full description, and an Add-to-cart button that routes back
 *  through the parent's addOne() so items with modifiers keep going
 *  through the existing picker.
 * =================================================================== */
function ItemDetailDialog({
  item, qtyInCart, onClose, onAdd,
}: {
  item: shopApi.PublicShopItem | null;
  qtyInCart: number;
  onClose: () => void;
  onAdd: () => void;
}) {
  const images = item ? shopApi.itemImages(item) : [];
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [item?.id]);

  if (!item) return null;
  const hasMulti = images.length > 1;
  const prev = () => setIdx(i => (i - 1 + images.length) % images.length);
  const next = () => setIdx(i => (i + 1) % images.length);

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b">
          <DialogTitle className="pr-6">{item.name}</DialogTitle>
          <DialogDescription className="sr-only">Item details and images</DialogDescription>
        </DialogHeader>

        {/* Carousel */}
        <div className="relative bg-gray-100 aspect-square w-full flex items-center justify-center overflow-hidden">
          {images.length === 0 ? (
            <Package className="h-14 w-14 text-gray-300" strokeWidth={1.25} />
          ) : (
            <img
              key={idx}
              src={images[idx]}
              alt=""
              className="w-full h-full object-contain"
              draggable={false}
            />
          )}
          {hasMulti && (
            <>
              <button
                type="button"
                onClick={prev}
                aria-label="Previous image"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/85 hover:bg-white text-gray-700 flex items-center justify-center shadow"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={next}
                aria-label="Next image"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/85 hover:bg-white text-gray-700 flex items-center justify-center shadow"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-full">
                {images.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIdx(i)}
                    aria-label={`Image ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${
                      i === idx ? 'bg-white w-4' : 'bg-white/50 w-1.5 hover:bg-white/80'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xl font-semibold text-emerald-700">
              ${Number(item.unitPrice).toFixed(2)}
            </span>
            {item.unit && (
              <span className="text-xs text-gray-500">per {item.unit}</span>
            )}
          </div>
          {item.description && (
            <p className="text-sm text-gray-700 whitespace-pre-line">{item.description}</p>
          )}
          {qtyInCart > 0 && (
            <div className="text-xs text-blue-700 bg-blue-50 rounded px-2.5 py-1.5 inline-flex items-center gap-1.5">
              <ShoppingCart className="h-3.5 w-3.5" />
              Already {qtyInCart} in cart
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            disabled={!item.inStock}
            onClick={() => { onAdd(); onClose(); }}
          >
            <Plus className="h-4 w-4 mr-1" />
            {item.inStock ? 'Add to cart' : 'Out of stock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ====================================================================
 *  Modifier picker dialog (customer-facing mirror of the POS picker)
 *
 *  Opens when the customer taps an item with a non-empty modifierGroups
 *  JSON. Each group is single-select; groups marked {@code required:true}
 *  block the Add button until a pick lands. The live total updates as
 *  picks change so the customer sees the impact of "Size: Large +$1.00"
 *  before committing.
 * =================================================================== */
function ModifierPickerDialog({
  item, onCancel, onConfirm,
}: {
  item: shopApi.PublicShopItem | null;
  onCancel: () => void;
  onConfirm: (modifiers: SelectedModifier[]) => void;
}) {
  // Track picks as group-name → option-label. Resets every time the
  // dialog reopens for a fresh item (keyed by item?.id below).
  const [picks, setPicks] = useState<Record<string, string>>({});
  useEffect(() => { setPicks({}); }, [item?.id]);

  const parsed: ItemModifiers | null = useMemo(
    () => (item ? parseModifiers(item.modifiers) : null),
    [item],
  );

  if (!item || !parsed || parsed.groups.length === 0) return null;

  // Resolve current picks into the SelectedModifier[] shape we hand
  // back to the parent. Skips groups with no pick so undecided
  // optional groups don't pollute the line label.
  const resolved: SelectedModifier[] = parsed.groups
    .map(g => {
      const label = picks[g.name];
      if (!label) return null;
      const opt = g.options.find(o => o.label === label);
      return opt ? { group: g.name, label: opt.label, priceAdj: opt.priceAdj } : null;
    })
    .filter((m): m is SelectedModifier => m !== null);

  const missingRequired = parsed.groups.some(g => g.required && !picks[g.name]);
  const previewPrice =
    Number(item.unitPrice) + resolved.reduce((s, m) => s + Number(m.priceAdj || 0), 0);

  return (
    <Dialog open onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription className="text-xs">
            Pick your options. Items marked <span className="text-red-600">*</span> are required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {parsed.groups.map(g => (
            <div key={g.name} className="space-y-1.5">
              <div className="text-sm font-medium">
                {g.name}
                {g.required && <span className="text-red-600 ml-1">*</span>}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {g.options.map(o => {
                  const active = picks[g.name] === o.label;
                  return (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => setPicks(prev => ({ ...prev, [g.name]: o.label }))}
                      className={`text-left px-3 py-2 rounded-md border text-sm transition ${
                        active
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium">{o.label}</div>
                      {Number(o.priceAdj) !== 0 && (
                        <div className="text-[11px] text-gray-500 tabular-nums">
                          {o.priceAdj > 0 ? '+' : '−'}${Math.abs(Number(o.priceAdj)).toFixed(2)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="border-t pt-3 gap-2">
          <div className="flex-1 text-left">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">Line total</p>
            <p className="text-base font-bold text-emerald-700">${previewPrice.toFixed(2)}</p>
          </div>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            onClick={() => onConfirm(resolved)}
            disabled={missingRequired}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Add to order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
