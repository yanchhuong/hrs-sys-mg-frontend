import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Search, MapPin, AlertCircle, Store, Package,
  ShoppingCart, Plus, Minus, X, CheckCircle2,
} from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { toast } from 'sonner';
import * as shopApi from '../../api/shop';

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

const CATEGORIES = ['all', 'drink', 'snack', 'food', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABEL: Record<Category, string> = {
  all:   'All',
  drink: 'Drinks',
  snack: 'Snacks',
  food:  'Food',
  other: 'Other',
};

/** Per-item line in the local cart state. Keyed by stockItemId in the
 *  parent's Map so re-tapping an item just increments the count. */
interface CartLine {
  item: shopApi.PublicShopItem;
  qty: number;
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
  const [category, setCategory] = useState<Category>('all');

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
          document.title = `${r.shopName || 'Shop'} — Menu`;
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
      if (category !== 'all' && it.category !== category) return false;
      if (!q) return true;
      return it.name.toLowerCase().includes(q)
          || (it.description ?? '').toLowerCase().includes(q);
    });
  }, [inStockItems, search, category]);

  const counts = useMemo(() => {
    const c: Record<Category, number> = { all: 0, drink: 0, snack: 0, food: 0, other: 0 };
    c.all = inStockItems.length;
    for (const it of inStockItems) {
      const k = (CATEGORIES as readonly string[]).includes(it.category as Category)
        ? (it.category as Category) : 'other';
      c[k] += 1;
    }
    return c;
  }, [inStockItems]);

  const cartLines = useMemo(() => Array.from(cart.values()), [cart]);
  const cartCount = useMemo(() => cartLines.reduce((s, l) => s + l.qty, 0), [cartLines]);
  const cartTotal = useMemo(
    () => cartLines.reduce((s, l) => s + l.qty * Number(l.item.unitPrice), 0),
    [cartLines],
  );

  // Cart mutators — keep them out of the JSX so the buttons stay
  // terse. `addOne` is the tap-to-add path on the card itself; the
  // sheet's +/- buttons reuse `setQty`.
  const addOne = (item: shopApi.PublicShopItem) => {
    setCart(prev => {
      const next = new Map(prev);
      const cur = next.get(item.id);
      next.set(item.id, { item, qty: (cur?.qty ?? 0) + 1 });
      return next;
    });
  };
  const setQty = (id: string, qty: number) => {
    setCart(prev => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (!cur) return prev;
      if (qty <= 0) next.delete(id);
      else next.set(id, { ...cur, qty: Math.min(99, qty) });
      return next;
    });
  };
  const removeLine = (id: string) => setQty(id, 0);
  const clearCart = () => setCart(new Map());

  const submit = async () => {
    if (cart.size === 0) return;
    setSubmitting(true);
    try {
      const result = await shopApi.submitPublicOrder(code, {
        customerName: custName.trim() || undefined,
        contactPhone: custPhone.trim() || undefined,
        notes: custNote.trim() || undefined,
        items: cartLines.map(l => ({
          stockItemId: l.item.id,
          quantity: l.qty,
        })),
      });
      setConfirmed(result);
      setCheckoutOpen(false);
      clearCart();
      setCustName('');
      setCustPhone('');
      setCustNote('');
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
        <p className="text-xs text-gray-400 mt-3 font-mono">/shop/{code}</p>
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
        <p className="mt-4 text-4xl font-mono font-bold tracking-widest text-slate-900">
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Store className="h-7 w-7" />
          </div>
          <div className="min-w-0">
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
              <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-white/15 px-1.5 py-0.5 rounded">
                {data.code}
              </span>
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
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(key => {
            const active = category === key;
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
                {CATEGORY_LABEL[key]}
                <span className="ml-1 text-[11px] opacity-70">({counts[key]})</span>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map(it => (
              <PublicShopCard
                key={it.id}
                item={it}
                qtyInCart={cart.get(it.id)?.qty ?? 0}
                onAdd={() => addOne(it)}
              />
            ))}
          </div>
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
            <DialogTitle>Your order</DialogTitle>
            <DialogDescription className="text-xs">
              Submit to the counter — the cashier will prepare and
              confirm. Payment happens in person.
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
                {cartLines.map(line => (
                  <li key={line.item.id} className="flex items-center gap-3 p-2.5">
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
                        ${Number(line.item.unitPrice).toFixed(2)} {line.item.unit && `/ ${line.item.unit}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQty(line.item.id, line.qty - 1)}
                        className="h-7 w-7 rounded border flex items-center justify-center hover:bg-gray-50"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-medium">{line.qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(line.item.id, line.qty + 1)}
                        className="h-7 w-7 rounded border flex items-center justify-center hover:bg-gray-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLine(line.item.id)}
                        className="h-7 w-7 rounded text-gray-400 hover:text-red-600 flex items-center justify-center"
                        title="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Optional contact info */}
            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Contact (optional)
              </p>
              <Input
                value={custName}
                onChange={e => setCustName(e.target.value)}
                placeholder="Your name"
                maxLength={120}
              />
              <Input
                value={custPhone}
                onChange={e => setCustPhone(e.target.value)}
                placeholder="Phone"
                inputMode="tel"
                maxLength={32}
              />
              <Input
                value={custNote}
                onChange={e => setCustNote(e.target.value)}
                placeholder="Note for the kitchen (e.g. less sugar)"
                maxLength={240}
              />
            </div>
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

/** POS-style card with a small qty-in-cart badge in the top-right
 *  corner once the customer has added one. Click anywhere on the card
 *  to add another — the explicit "+" pill in the corner is just a
 *  visual cue, the whole card is the touch target. */
function PublicShopCard({
  item, qtyInCart, onAdd,
}: {
  item: shopApi.PublicShopItem;
  qtyInCart: number;
  onAdd: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = !!item.imageUrl && !broken;
  return (
    <button
      type="button"
      onClick={onAdd}
      className="group relative text-left rounded-lg border bg-white overflow-hidden hover:border-blue-400 hover:shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <div className="aspect-square w-full bg-gray-50 flex items-center justify-center overflow-hidden">
        {showImage ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <Package className="h-12 w-12 text-gray-300" strokeWidth={1.25} />
        )}
      </div>
      <div className="p-2">
        <div className="font-medium text-sm text-gray-900 line-clamp-2 leading-snug" title={item.name}>
          {item.name}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-sm font-semibold text-emerald-700">
            ${Number(item.unitPrice).toFixed(2)}
          </span>
          <span className="text-[11px] text-gray-500">{item.unit ?? ''}</span>
        </div>
      </div>
      {qtyInCart > 0 ? (
        <div className="absolute top-1.5 right-1.5 bg-blue-600 text-white text-[11px] font-bold rounded-full h-6 min-w-[1.5rem] px-1.5 flex items-center justify-center shadow-md">
          {qtyInCart}
        </div>
      ) : (
        <div className="absolute top-1.5 right-1.5 bg-white/90 text-blue-600 border border-blue-200 rounded-full h-6 w-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
          <Plus className="h-3.5 w-3.5" />
        </div>
      )}
    </button>
  );
}
