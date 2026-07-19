import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';
import { Search, Package, Minus, Plus, X, ShoppingCart, Loader2 } from 'lucide-react';
import * as itemsApi from '../../api/items';
import * as posApi from '../../api/pos';
import { formatMoney } from '../../utils/format';

type CartLine = {
  itemId: string;
  stockItemId: string;
  name: string;
  unit?: string | null;
  unitPrice: number;
  quantity: number;
};

/**
 * Sale tab — tablet-optimized lite POS. Two panes stacked on a phone,
 * side-by-side above sm: items grid on top, live cart below. Tap a
 * card to add / bump quantity; the cart row surfaces −/+ steppers and
 * a remove (×) button. One-tap Checkout creates the order and closes
 * it as a commercial receipt paid in cash — matches the desktop POS
 * checkout defaults so the two flows stay in sync.
 */
export function MobileSale() {
  const [items, setItems] = useState<itemsApi.Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    setLoading(true);
    itemsApi.list({ size: 500 })
      .then(res => setItems(Array.isArray(res?.data) ? res.data.filter(i => i.active !== false) : []))
      .catch(err => toast.error(err instanceof Error ? err.message : 'Failed to load items'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.name.toLowerCase().includes(q)
      || (i.sku ?? '').toLowerCase().includes(q)
    );
  }, [items, search]);

  const totals = useMemo(() => {
    let count = 0, subtotal = 0;
    for (const l of cart) { count += l.quantity; subtotal += l.quantity * l.unitPrice; }
    return { count, subtotal };
  }, [cart]);

  const addToCart = (item: itemsApi.Item) => {
    setCart(prev => {
      const existing = prev.find(l => l.itemId === item.id);
      if (existing) {
        return prev.map(l => l.itemId === item.id ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...prev, {
        itemId: item.id, stockItemId: item.id,
        name: item.name, unit: item.unit,
        unitPrice: Number(item.unitPrice) || 0, quantity: 1,
      }];
    });
  };

  const bump = (itemId: string, delta: number) => {
    setCart(prev => prev
      .map(l => l.itemId === itemId ? { ...l, quantity: l.quantity + delta } : l)
      .filter(l => l.quantity > 0));
  };

  const removeLine = (itemId: string) =>
    setCart(prev => prev.filter(l => l.itemId !== itemId));

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setCheckingOut(true);
    try {
      // Create the order first so the server can allocate a POS
      // order number, then close it as a commercial receipt paid in
      // cash — mirrors the desktop POS one-tap checkout default.
      const order = await posApi.create({
        items: cart.map(l => ({
          stockItemId: l.stockItemId,
          name: l.name,
          quantity: l.quantity,
          unit: l.unit ?? null,
          unitPrice: l.unitPrice,
        })),
      });
      await posApi.checkout(order.id, {
        invoiceKind: 'commercial',
        paymentMethod: 'cash',
        paymentReceived: totals.subtotal,
      });
      toast.success(`Order #${order.orderNo ?? order.id.slice(0, 6)} checked out`);
      setCart([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 sticky top-0 z-10 bg-white border-b">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search items or SKU"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-11 text-base"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
        {/* Items grid */}
        <div className="order-2 sm:order-1">
          <h2 className="text-sm font-semibold text-gray-600 mb-2">Items</h2>
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              {items.length === 0 ? 'No items yet.' : 'No matches.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map(it => {
                const showImage = !!it.imageUrl;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => addToCart(it)}
                    className="group flex flex-col text-left rounded-lg border bg-white overflow-hidden hover:border-emerald-400 active:scale-[0.98] transition"
                  >
                    <div className="aspect-square w-full bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                      {showImage ? (
                        <img src={it.imageUrl!} alt={it.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <Package className="h-10 w-10 text-gray-300" strokeWidth={1.25} />
                      )}
                    </div>
                    <div className="p-2 flex-1">
                      <div className="text-sm font-medium line-clamp-2 leading-snug">{it.name}</div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-sm font-semibold text-emerald-700">${Number(it.unitPrice).toFixed(2)}</span>
                        <span className="text-[11px] text-gray-500">{it.unit ?? ''}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="order-1 sm:order-2 sm:sticky sm:top-20">
          <div className="rounded-lg border bg-white overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="inline-flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-sm">Cart</span>
                <Badge variant="secondary">{totals.count}</Badge>
              </div>
              {cart.length > 0 && (
                <button type="button" onClick={() => setCart([])} className="text-xs text-gray-500 hover:text-red-600">Clear</button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">Tap an item to add.</div>
              ) : (
                <ul className="divide-y">
                  {cart.map(l => (
                    <li key={l.itemId} className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{l.name}</div>
                        <div className="text-xs text-gray-500 tabular-nums">${l.unitPrice.toFixed(2)} × {l.quantity}</div>
                      </div>
                      <div className="inline-flex items-center gap-1 border rounded-md">
                        <button type="button" onClick={() => bump(l.itemId, -1)} className="h-8 w-8 flex items-center justify-center text-gray-600 hover:bg-gray-50" aria-label="Decrease">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm font-medium tabular-nums">{l.quantity}</span>
                        <button type="button" onClick={() => bump(l.itemId, +1)} className="h-8 w-8 flex items-center justify-center text-gray-600 hover:bg-gray-50" aria-label="Increase">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button type="button" onClick={() => removeLine(l.itemId)} className="text-gray-400 hover:text-red-600" aria-label="Remove">
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-4 py-3 border-t bg-gray-50 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-semibold tabular-nums">${formatMoney(totals.subtotal)}</span>
              </div>
              <Button
                onClick={handleCheckout}
                disabled={cart.length === 0 || checkingOut}
                className="w-full h-11 text-base"
              >
                {checkingOut ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing…
                  </>
                ) : `Checkout · $${formatMoney(totals.subtotal)}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
