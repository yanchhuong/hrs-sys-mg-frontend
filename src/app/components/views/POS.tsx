import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShoppingCart, Loader2, Search, Plus, Minus, X, FileText, CreditCard,
  Banknote, QrCode, Receipt, Printer, ArrowLeft, AlertCircle,
  Package, Settings as SettingsIcon, StickyNote, Check, MonitorPlay,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import * as posApi from '../../api/pos';
import * as itemsApi from '../../api/items';
import * as customersApi from '../../api/customers';
import * as settingsApi from '../../api/accountingSettings';
import { AccountingSettingsDialog } from '../common/AccountingSettingsDialog';
import { printPosReceipt } from '../../utils/posReceipt';
import { loadBankAccounts, type BankAccount } from '../../utils/bankAccount';
import {
  POS_DISPLAY_CHANNEL, POS_DISPLAY_PATH, emptyState,
  type DisplayItem, type DisplayMessage, type DisplayState,
} from '../../utils/posCustomerDisplay';
import type { PosOrder, PosOrderItem, PosPaymentMethod } from '../../api/pos';

/**
 * POS (Point of Sale) page (V130 + V131).
 *
 * <p>Layout — items grid left (~60%), cart right (~40%).</p>
 *
 * <p>Flow:
 * <ol>
 *   <li>Cashier taps a tile → line added (or qty incremented).</li>
 *   <li>Edits qty / discount / tax-type in the cart.</li>
 *   <li>"Save Draft" persists the open ticket — first save mints the
 *       queue number, subsequent saves PUT the same row.</li>
 *   <li>"Checkout" opens the payment dialog; submit settles the order
 *       (spawns Invoice + Payment + decrements stock) and shows the
 *       receipt.</li>
 *   <li>"New Sale" clears the cart for the next customer.</li>
 *   <li>"Open Orders" drawer lists parked tickets — click resumes.</li>
 * </ol></p>
 */
export function POS() {
  const [usageOk, setUsageOk] = useState<boolean | null>(null);
  const [items, setItems] = useState<itemsApi.Item[]>([]);
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  const [openOrders, setOpenOrders] = useState<PosOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // V142 — category filter tabs. 'all' is the default; selecting a
  // specific category narrows the items grid below the search bar.
  const [categoryFilter, setCategoryFilter] = useState<itemsApi.ItemCategory | 'all'>('all');
  // Modifier picker (V142). When the cashier taps an item with
  // modifiers, this holds the item being configured; the picker
  // dialog reads it and commits the selection back into the cart.
  const [modifierTarget, setModifierTarget] = useState<itemsApi.Item | null>(null);

  // Cart state — local until "Save Draft" or "Checkout" persists it.
  const [cart, setCart] = useState<PosOrderItem[]>([]);
  const [currentOrder, setCurrentOrder] = useState<PosOrder | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [taxType, setTaxType] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // POS receipt + print preferences (V133). Loaded alongside items
  // and refreshed when the settings dialog closes so changes the
  // cashier just saved take effect on the next checkout.
  const [posSettings, setPosSettings] = useState<settingsApi.AccountingSettings>(
    () => settingsApi.defaultsFor('pos'),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  // KHQR bank-account cards (V133 settings dialog → Bank Account
  // section). Loaded once on mount + re-read when the settings dialog
  // closes so a newly-uploaded QR shows up on the next checkout.
  const [banks, setBanks] = useState<BankAccount[]>(() => loadBankAccounts('pos'));

  // Dialog state.
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // Lifted from PosCheckoutDialog so we can broadcast the active
  // payment method to the customer display — when set to 'khqr',
  // the display swaps to a fullscreen scan-to-pay overlay.
  const [checkoutMethod, setCheckoutMethod] = useState<PosPaymentMethod>('cash');
  // Reset to cash whenever the dialog reopens so a previous KHQR
  // pick doesn't carry over (and surprise the next customer).
  useEffect(() => { if (checkoutOpen) setCheckoutMethod('cash'); }, [checkoutOpen]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [receipt, setReceipt] = useState<PosOrder | null>(null);

  // Customer-display "mirror screen" plumbing. We keep a single
  // BroadcastChannel open for the page's lifetime; every relevant
  // state change re-builds a snapshot and broadcasts it. The display
  // page also pings us for the current state when it mounts, so a
  // mid-sale pop-out catches the in-flight cart immediately.
  const displayChannelRef = useRef<BroadcastChannel | null>(null);
  // Stash the latest snapshot so the request-state handler can
  // re-broadcast it without needing every dependency in scope.
  const latestSnapshotRef = useRef<DisplayState | null>(null);
  // Latch the "paid" snapshot through the receipt dialog so the
  // customer screen keeps the thank-you splash visible until the
  // cashier starts a New Sale. Cleared on cart reset.
  const [paidSnapshot, setPaidSnapshot] = useState<DisplayState['paid']>(null);
  // Auto-dismiss timer for the customer-display Thank-You splash.
  // After PAID_SPLASH_MS elapses, the snapshot's paid field clears
  // and the display falls back to ads (when slides are configured
  // and the cart is still empty) or Welcome.
  const paidClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** How long the "Thank you!" splash stays before the customer
   *  display rolls back to ads / Welcome. 5 seconds keeps the slip
   *  visible long enough to read without the screen lingering empty
   *  between sales. */
  const PAID_SPLASH_MS = 5000;

  /* ----- initial load ----- */
  useEffect(() => {
    (async () => {
      try {
        const usage = await itemsApi.getUsageSettings();
        setUsageOk(usage.enabledForPos);
        if (!usage.enabledForPos) {
          setLoading(false);
          return;
        }
        const [itemList, custList, open, pos] = await Promise.all([
          itemsApi.list({ size: 200 }),
          customersApi.list({ size: 200 }),
          posApi.listOpen(),
          settingsApi.get('pos'),
        ]);
        // Only show active items in the grid; deductionEnabled is
        // respected by the backend at checkout time.
        setItems(itemList.content.filter(i => i.active));
        setCustomers(custList.content);
        setOpenOrders(open);
        setPosSettings(pos);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load POS');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ----- derived totals (echo server formula so the cart shows live
   *       numbers even before the first save). Toggles on the POS
   *       Settings dialog (showDiscount / showTax) zero out the
   *       contribution when off so a hidden field never silently
   *       applies a stale value. ----- */
  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
    [cart],
  );
  const effectiveDiscountValue = posSettings.showDiscount ? discountValue : 0;
  const effectiveTaxType       = posSettings.showTax     ? taxType        : null;
  const discountAmount = useMemo(() => {
    if (discountType === 'percent') return (subtotal * effectiveDiscountValue) / 100;
    return effectiveDiscountValue;
  }, [subtotal, discountType, effectiveDiscountValue]);
  // POS tax simplifies to two options — no VAT (commercial receipt) or
  // VAT 10% (tax invoice). The choice drives both the tax line and the
  // invoiceKind sent to checkout, so the operator only picks once.
  const taxRate = useMemo(() => (effectiveTaxType === '1' ? 10 : 0), [effectiveTaxType]);
  const invoiceKind: 'commercial' | 'tax' = effectiveTaxType === '1' ? 'tax' : 'commercial';
  const taxable = Math.max(0, subtotal - discountAmount);
  const taxAmount = (taxable * taxRate) / 100;
  const total = taxable + taxAmount;

  /* ----- customer-display mirror channel ----- */
  // Open the channel once on mount. Reply to request-state pings
  // by re-broadcasting whatever snapshot is in the ref — that's the
  // latest one the per-change effect below built.
  useEffect(() => {
    const ch = new BroadcastChannel(POS_DISPLAY_CHANNEL);
    displayChannelRef.current = ch;
    ch.onmessage = (ev: MessageEvent<DisplayMessage>) => {
      if (ev.data?.kind === 'request-state' && latestSnapshotRef.current) {
        ch.postMessage({ kind: 'state', state: latestSnapshotRef.current } satisfies DisplayMessage);
      }
    };
    return () => { ch.close(); displayChannelRef.current = null; };
  }, []);

  // Build + broadcast a snapshot on every cart / totals / settings
  // change. The display window treats this as the single source of
  // truth — it doesn't keep any derived state of its own.
  useEffect(() => {
    const customer = customers.find(c => c.id === customerId) ?? null;
    // Resolve each line's image from the catalog at snapshot time so
    // the customer screen + the cart thumbnail show the same picture
    // without each side maintaining its own lookup index.
    const itemById = new Map(items.map(i => [i.id, i]));
    const displayItems: DisplayItem[] = cart.map(l => ({
      name: l.name,
      qty: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      notes: l.notes,
      imageUrl: (l.stockItemId && itemById.get(l.stockItemId)?.imageUrl) || null,
    }));
    const snapshot: DisplayState = {
      shopName: posSettings.posShopName?.trim() || 'Welcome',
      logoUrl: (posSettings.posLogoUrl ?? '').trim() || null,
      queueNo: currentOrder
        ? `#${String(currentOrder.queueSeq).padStart(3, '0')}`
        : null,
      customerName: customer?.name ?? null,
      items: displayItems,
      subtotal,
      discountAmount,
      taxAmount,
      total,
      currency: 'USD',
      // V141 — exchange rate snapshot. While the cart is still open
      // we use the live settings value; a saved order would carry
      // its own snapshot, but here we want edits to the rate to
      // reflect immediately on the customer display.
      exchangeRate: posSettings.posExchangeRate > 0 ? posSettings.posExchangeRate : 0,
      invoiceKind,
      // V143 — ads carousel toggle + media list. The display only
      // swaps to the carousel when there are no cart items + no
      // paid splash; the snapshot just carries the configuration.
      slideEnabled: posSettings.posSlideEnabled,
      slideMedia: settingsApi.parsePosSlideMedia(posSettings.posSlideMedia),
      // Checkout-in-progress payload. Non-null while the cashier has
      // the Checkout dialog open — the customer display reads this
      // and overlays the scan-to-pay QR when method='khqr'. We send
      // a slim view of the bank cards (only the fields the display
      // needs) so the broadcast stays small.
      checkout: checkoutOpen ? {
        method: checkoutMethod,
        banks: banks
          .filter(b => b.qrDataUrl && b.qrDataUrl.length > 0)
          .map(b => ({
            id: b.id,
            bankName: b.bankName,
            accountName: b.accountName,
            accountNumber: b.accountNumber,
            qrDataUrl: b.qrDataUrl,
          })),
      } : null,
      paid: paidSnapshot,
    };
    latestSnapshotRef.current = snapshot;
    displayChannelRef.current?.postMessage({ kind: 'state', state: snapshot } satisfies DisplayMessage);
  }, [
    cart, customerId, customers, currentOrder, items,
    subtotal, discountAmount, taxAmount, total, invoiceKind,
    posSettings.posShopName, posSettings.posLogoUrl, posSettings.posExchangeRate,
    posSettings.posSlideEnabled, posSettings.posSlideMedia,
    checkoutOpen, checkoutMethod, banks,
    paidSnapshot,
  ]);

  // Clear the paid-splash timer on POS-page unmount so a navigation
  // away mid-splash doesn't fire setPaidSnapshot on a torn-down
  // component (no warning, just defensive hygiene).
  useEffect(() => {
    return () => {
      if (paidClearTimerRef.current) {
        clearTimeout(paidClearTimerRef.current);
        paidClearTimerRef.current = null;
      }
    };
  }, []);

  /** Open (or focus) the customer-display window. Same-origin pop-up
   *  with a stable {@code window.name} so a second click brings the
   *  existing window forward instead of spawning duplicates. */
  const openCustomerDisplay = () => {
    const w = window.open(POS_DISPLAY_PATH, 'pos-customer-display',
        'width=1024,height=720,menubar=no,toolbar=no,location=no,status=no');
    if (w) w.focus();
    else toast.error('Pop-up blocked — allow pop-ups to open the customer display.');
  };

  /* ----- cart actions ----- */
  // Merging rules (V134): a tap on an existing SKU only stacks into a
  // prior line if that line has NO note. Once a line carries a
  // modifier ("Sugar 50%, Size M"), subsequent taps on the same SKU
  // create a fresh note-less line — so two customisations of the
  // same drink stay on their own rows.
  const addItem = (it: itemsApi.Item) => {
    // First item of a fresh ticket — drop the customer-display
    // "Thank you" splash so the new cart starts rendering live.
    // Also cancel the auto-dismiss timer so a stale firing doesn't
    // overwrite the next checkout's paidSnapshot.
    if (paidSnapshot) setPaidSnapshot(null);
    if (paidClearTimerRef.current) {
      clearTimeout(paidClearTimerRef.current);
      paidClearTimerRef.current = null;
    }
    setCart(prev => {
      const at = prev.findIndex(l => l.stockItemId === it.id && !l.notes);
      if (at >= 0) {
        const next = [...prev];
        next[at] = { ...next[at], quantity: next[at].quantity + 1 };
        return recomputeLines(next);
      }
      return recomputeLines([
        ...prev,
        {
          id: null, stockItemId: it.id, itemId: null, name: it.name,
          quantity: 1, unit: it.unit ?? null, unitPrice: it.unitPrice,
          lineTotal: it.unitPrice, lineNo: prev.length + 1,
          notes: null,
        },
      ]);
    });
  };

  /** Tap router (V142): if the item has modifiers, open the picker
   *  popup so the cashier can pick Size / Sugar / … first; otherwise
   *  fall through to the direct add. */
  const onItemTap = (it: itemsApi.Item) => {
    const mods = itemsApi.parseModifiers(it.modifiers);
    if (mods && mods.groups.length > 0) setModifierTarget(it);
    else addItem(it);
  };

  /** Commit a modifier-configured selection as its own cart line.
   *  Always creates a new row (no merge) so two customisations of
   *  the same drink stay distinct — the price delta + note string
   *  travel with the line. */
  const addItemWithModifiers = (it: itemsApi.Item, priceDelta: number, noteText: string) => {
    if (paidSnapshot) setPaidSnapshot(null);
    if (paidClearTimerRef.current) {
      clearTimeout(paidClearTimerRef.current);
      paidClearTimerRef.current = null;
    }
    const unitPrice = +(it.unitPrice + priceDelta).toFixed(2);
    setCart(prev => recomputeLines([
      ...prev,
      {
        id: null, stockItemId: it.id, itemId: null, name: it.name,
        quantity: 1, unit: it.unit ?? null,
        unitPrice,
        lineTotal: unitPrice,
        lineNo: prev.length + 1,
        notes: noteText.length ? noteText : null,
      },
    ]));
    setModifierTarget(null);
  };

  /** Patch a single cart line — used for inline price edits, note
   *  changes, and any other per-line tweak that isn't qty. */
  const patchLine = (idx: number, patch: Partial<PosOrderItem>) => {
    setCart(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return recomputeLines(next);
    });
  };

  const setLineQty = (idx: number, qty: number) => {
    if (qty <= 0) { removeLine(idx); return; }
    setCart(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: qty };
      return recomputeLines(next);
    });
  };

  const removeLine = (idx: number) => setCart(prev => recomputeLines(prev.filter((_, i) => i !== idx)));

  const recomputeLines = (lines: PosOrderItem[]): PosOrderItem[] =>
    lines.map((l, i) => ({ ...l, lineTotal: l.quantity * l.unitPrice, lineNo: i + 1 }));

  const newSale = () => {
    setCart([]); setCurrentOrder(null); setCustomerId(null);
    setDiscountType('amount'); setDiscountValue(0); setTaxType(null); setNotes('');
    // Intentionally don't reset paidSnapshot here — checkout calls
    // newSale() right after setting the splash and we want the
    // customer screen to keep showing "Thank you" until the cashier
    // either starts a new ticket (addItem clears it) or hits the
    // top-right New Sale button (which clears explicitly).
  };

  /* ----- save draft / checkout ----- */
  const buildRequest = (): posApi.PosOrderRequest => ({
    customerId, currency: 'USD',
    // Snapshot the tenant's POS-scope rate (V141) onto the order so a
    // future rate change doesn't rewrite the receipt's KHR total.
    exchangeRate: posSettings.posExchangeRate > 0 ? posSettings.posExchangeRate : 4100,
    // Honour the Display toggles when persisting — a hidden Discount /
    // Tax / Notes field must not silently apply.
    discountType,
    discountValue: effectiveDiscountValue,
    taxType: effectiveTaxType,
    notes: posSettings.showNotes ? (notes || null) : null,
    items: cart.map(l => ({
      stockItemId: l.stockItemId, itemId: l.itemId, name: l.name,
      quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice,
      // V134 — per-line modifier note.
      notes: l.notes,
    })),
  });

  const saveDraft = async (): Promise<PosOrder | null> => {
    if (cart.length === 0) {
      toast.error('Add at least one item before saving.');
      return null;
    }
    setSaving(true);
    try {
      const saved = currentOrder
        ? await posApi.update(currentOrder.id, buildRequest())
        : await posApi.create(buildRequest());
      setCurrentOrder(saved);
      // Refresh the parked list so the resume drawer shows the latest.
      setOpenOrders(prev => {
        const others = prev.filter(o => o.id !== saved.id);
        return saved.status === 'open' ? [saved, ...others] : others;
      });
      toast.success(`Saved ${saved.queueNo}`);
      return saved;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const onCheckoutSubmit = async (method: PosPaymentMethod, received: number) => {
    // Persist the cart first if it isn't already saved — the checkout
    // endpoint needs a real ticket to flip.
    let order = currentOrder;
    if (!order) order = await saveDraft();
    else if (saving) return; // mid-save guard
    else order = await saveDraft(); // re-save in case the cart edited since last save
    if (!order) return;
    setSaving(true);
    try {
      const checked = await posApi.checkout(order.id, { invoiceKind, paymentMethod: method, paymentReceived: received });
      setOpenOrders(prev => prev.filter(o => o.id !== checked.id));
      setReceipt(checked);
      setCheckoutOpen(false);
      // Latch the paid splash on the customer display. The splash
      // auto-dismisses after PAID_SPLASH_MS so the screen rolls back
      // to ads / Welcome without the cashier having to click New
      // Sale on busy counters. Cashier-side addItem / New Sale still
      // clear early — the timer is just the floor.
      setPaidSnapshot({
        total: checked.total,
        method: checked.paymentMethod ?? method,
        change: checked.paymentChange ?? 0,
        queueNo: `#${String(checked.queueSeq).padStart(3, '0')}`,
      });
      if (paidClearTimerRef.current) clearTimeout(paidClearTimerRef.current);
      paidClearTimerRef.current = setTimeout(() => {
        setPaidSnapshot(null);
        paidClearTimerRef.current = null;
      }, PAID_SPLASH_MS);
      newSale();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Checkout failed');
    } finally {
      setSaving(false);
    }
  };

  const resumeOrder = async (o: PosOrder) => {
    setCurrentOrder(o);
    setCart(o.items.map(i => ({ ...i })));
    setCustomerId(o.customerId);
    setDiscountType(o.discountType);
    setDiscountValue(o.discountValue);
    setTaxType(o.taxType);
    setNotes(o.notes ?? '');
    setDrawerOpen(false);
  };

  /* ----- gate states ----- */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading POS…
      </div>
    );
  }
  if (usageOk === false) {
    return (
      <div className="p-6">
        <div className="max-w-md rounded-md border bg-amber-50 border-amber-200 p-4 text-sm text-amber-900 space-y-2">
          <div className="flex items-center gap-2 font-semibold"><AlertCircle className="h-4 w-4" /> POS items not enabled</div>
          <p>The POS items grid is off for this tenant. Open <b>Items → Settings</b> and turn on the <b>POS</b> toggle to make stock items available for counter checkout.</p>
        </div>
      </div>
    );
  }

  /* ----- main UI ----- */
  const filteredItems = items.filter(i => {
    if (categoryFilter !== 'all' && (i.category ?? 'other') !== categoryFilter) return false;
    return i.name.toLowerCase().includes(search.toLowerCase());
  });
  // Category counts drive the chip labels — "Drink (12)" etc. so the
  // cashier sees stock counts at a glance.
  const categoryCounts = {
    all:   items.length,
    drink: items.filter(i => i.category === 'drink').length,
    snack: items.filter(i => i.category === 'snack').length,
    food:  items.filter(i => i.category === 'food').length,
    other: items.filter(i => (i.category ?? 'other') === 'other').length,
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <header className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-emerald-600" />
          <h1 className="text-lg font-semibold">POS</h1>
          {/* Gear icon — opens the POS-scope AccountingSettingsDialog
              where the cashier can toggle PAID stamp, auto-print, SKU
              prefix, paper size, and the printed shop name. */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="text-gray-400 hover:text-gray-700 transition"
            aria-label="POS settings"
            title="POS settings"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
          {currentOrder && (
            <span className="ml-2 text-sm font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              {currentOrder.queueNo}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Customer-display "mirror screen". Pops out a second
              window the customer can see — cart + total update live
              via BroadcastChannel as the cashier rings up items. */}
          <Button variant="outline" size="sm" onClick={openCustomerDisplay} title="Open customer-facing display">
            <MonitorPlay className="h-4 w-4 mr-1.5" />
            Display
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
            <Receipt className="h-4 w-4 mr-1.5" />
            Open Orders ({openOrders.length})
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => {
              if (paidClearTimerRef.current) {
                clearTimeout(paidClearTimerRef.current);
                paidClearTimerRef.current = null;
              }
              setPaidSnapshot(null);
              newSale();
            }}
            disabled={cart.length === 0 && !currentOrder && !paidSnapshot}
          >
            New Sale
          </Button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* ---- Items grid ---- */}
        <section className="flex-1 flex flex-col border-r min-w-0">
          <div className="p-3 border-b bg-white space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search items…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            {/* V142 — category filter pills. "All" is the default;
                tapping a chip narrows the items grid to that bucket. */}
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'drink', 'snack', 'food', 'other'] as const).map(key => {
                const active = categoryFilter === key;
                const label = key === 'all' ? 'All' : key[0].toUpperCase() + key.slice(1);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategoryFilter(key)}
                    className={`px-3 h-7 rounded-full border text-xs font-medium transition ${
                      active
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                    <span className="ml-1 text-[10px] opacity-70">({categoryCounts[key]})</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex-1 overflow-auto p-3">
            {filteredItems.length === 0 ? (
              <div className="text-sm text-gray-500 text-center mt-8">
                {items.length === 0
                  ? 'No active items. Add items in Stock → Items.'
                  : 'No items match your search.'}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredItems.map(it => (
                  <PosItemCard key={it.id} item={it} onAdd={onItemTap} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ---- Cart panel ---- */}
        <aside className="w-[380px] flex flex-col bg-gray-50">
          <div className="p-3 border-b bg-white">
            <Label className="text-xs text-gray-500">Customer</Label>
            <Select value={customerId ?? '__walkin'} onValueChange={v => setCustomerId(v === '__walkin' ? null : v)}>
              <SelectTrigger className="h-8 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__walkin">Walk-in</SelectItem>
                {customers.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 overflow-auto">
            {cart.length === 0 ? (
              <div className="text-center text-sm text-gray-400 mt-10 px-4">
                Tap an item to add it to the cart.
              </div>
            ) : (
              <ul className="divide-y bg-white">
                {cart.map((l, idx) => (
                  <CartLineRow
                    key={idx}
                    line={l}
                    imageUrl={(l.stockItemId && items.find(i => i.id === l.stockItemId)?.imageUrl) || null}
                    onQty={n => setLineQty(idx, n)}
                    onRemove={() => removeLine(idx)}
                    onPatch={patch => patchLine(idx, patch)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="border-t bg-white p-3 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span>${subtotal.toFixed(2)}</span></div>

            {/* Discount + Tax rows respect the POS Settings "Display"
                toggles — flipping Show Discount / Show Tax off hides
                the row AND zeros out its contribution so a stale
                value never silently rides along. */}
            {posSettings.showDiscount && (
              <div className="flex items-center gap-2">
                <span className="text-gray-600 flex-1">Discount</span>
                <Select value={discountType} onValueChange={v => setDiscountType(v as 'amount' | 'percent')}>
                  <SelectTrigger className="h-7 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">$</SelectItem>
                    <SelectItem value="percent">%</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={discountValue}
                  onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                  className="h-7 w-20 text-right"
                />
              </div>
            )}

            {/* POS sales are either "no tax" (Commercial receipt) or
                "VAT 10%" (Tax invoice). The receipt kind is derived
                from this choice at checkout, so the cashier never has
                to pick it twice. */}
            {posSettings.showTax && (
              <div className="flex items-center gap-2">
                <span className="text-gray-600 flex-1">Tax</span>
                <Select value={taxType ?? '__none'} onValueChange={v => setTaxType(v === '__none' ? null : v)}>
                  <SelectTrigger className="h-7 w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No tax</SelectItem>
                    <SelectItem value="1">VAT 10%</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-gray-500 w-20 text-right">${taxAmount.toFixed(2)}</span>
              </div>
            )}

            {/* Inline Notes — gated on the Display toggle. Saved with
                the order, useful for "no straw" / "extra bag" cashier
                notes; doesn't print on the receipt by default. */}
            {posSettings.showNotes && (
              <div className="space-y-1">
                <span className="text-gray-600 text-xs">Notes</span>
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Order note (optional)"
                  className="h-7 text-sm"
                />
              </div>
            )}

            <div className="flex justify-between text-lg font-bold pt-1 border-t">
              <span>Total</span><span>${total.toFixed(2)}</span>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={saveDraft} disabled={saving || cart.length === 0}>
                {saving && !checkoutOpen ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <FileText className="h-4 w-4 mr-1.5" />}
                Save Draft
              </Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setCheckoutOpen(true)} disabled={cart.length === 0}>
                <CreditCard className="h-4 w-4 mr-1.5" />
                Checkout
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <PosCheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        total={total}
        saving={saving}
        invoiceKind={invoiceKind}
        banks={banks}
        method={checkoutMethod}
        onMethodChange={setCheckoutMethod}
        onSubmit={onCheckoutSubmit}
      />
      <PosOpenOrdersDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        orders={openOrders}
        onResume={resumeOrder}
      />
      <PosReceiptDialog
        order={receipt}
        settings={posSettings}
        items={items}
        onClose={() => setReceipt(null)}
      />

      <ModifierPickerDialog
        item={modifierTarget}
        onCancel={() => setModifierTarget(null)}
        onConfirm={addItemWithModifiers}
      />

      <AccountingSettingsDialog
        open={settingsOpen}
        onOpenChange={open => {
          setSettingsOpen(open);
          // Refresh the locally-cached bank cards when the settings
          // dialog closes — the dialog persists them to localStorage
          // alongside the server-side row, so we re-read here so a
          // newly-uploaded KHQR shows up on the next checkout.
          if (!open) setBanks(loadBankAccounts('pos'));
        }}
        scope="pos"
        onSaved={s => setPosSettings(s)}
      />
    </div>
  );
}

/* ====================================================================
 *  Item card — image cover + name + price. Falls back to a Package
 *  glyph when the URL is missing or fails to load (e-commerce style).
 * =================================================================== */

function PosItemCard({ item, onAdd }: { item: itemsApi.Item; onAdd: (it: itemsApi.Item) => void }) {
  // Track load failure so a broken URL doesn't keep retrying — once
  // the browser errors out we swap to the placeholder permanently.
  const [broken, setBroken] = useState(false);
  const showImage = !!item.imageUrl && !broken;
  return (
    <button
      type="button"
      onClick={() => onAdd(item)}
      className="group text-left rounded-lg border bg-white overflow-hidden hover:border-emerald-400 hover:shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <div className="aspect-square w-full bg-gray-50 flex items-center justify-center overflow-hidden">
        {showImage ? (
          <img
            src={item.imageUrl!}
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
        <div className="font-medium text-sm text-gray-900 line-clamp-2 leading-snug" title={item.name}>{item.name}</div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-sm font-semibold text-emerald-700">${item.unitPrice.toFixed(2)}</span>
          <span className="text-[11px] text-gray-500">{item.unit ?? ''}</span>
        </div>
        {item.deductionEnabled && (
          <div className={`text-[10px] mt-0.5 ${item.stockQty <= 0 ? 'text-red-600' : 'text-gray-500'}`}>
            Stock: {item.stockQty}
          </div>
        )}
      </div>
    </button>
  );
}

/* ====================================================================
 *  Cart line — qty stepper + inline editable unit price + per-line
 *  note (V134). Two lines for the same SKU with different notes stay
 *  on their own rows (see addItem in <POS>); the note + price are
 *  what drives the per-cup price differences the cashier needs for
 *  "Sugar 50% Size M" vs "Sugar 70% Size L" customisations.
 * =================================================================== */

function CartLineRow({
  line, imageUrl, onQty, onRemove, onPatch,
}: {
  line: PosOrderItem;
  /** Cover image resolved from the linked stock item, or null
   *  for ad-hoc lines / items without an image. */
  imageUrl: string | null;
  onQty: (n: number) => void;
  onRemove: () => void;
  onPatch: (patch: Partial<PosOrderItem>) => void;
}) {
  // Track broken-URL state so a bad data URL falls back to the
  // Package glyph instead of retrying every render.
  const [imgBroken, setImgBroken] = useState(false);
  useEffect(() => { setImgBroken(false); }, [imageUrl]);
  const showImage = !!imageUrl && !imgBroken;
  // Local "open" state for the note editor — kept here rather than in
  // <POS> so each row owns its own toggle without an idx-keyed map.
  const [noteOpen, setNoteOpen] = useState(false);
  // Buffer the textarea so typing doesn't fire a setCart on every
  // keystroke (which would recompute totals across the whole cart).
  // Commit on blur / Save click.
  const [noteDraft, setNoteDraft] = useState(line.notes ?? '');
  useEffect(() => { setNoteDraft(line.notes ?? ''); }, [line.notes]);

  // Inline unit-price input — buffered so an in-progress number entry
  // ("12.5" typed as "1" → "12" → "12." → "12.5") doesn't reset
  // everything on each intermediate parseFloat.
  const [priceDraft, setPriceDraft] = useState(String(line.unitPrice));
  useEffect(() => { setPriceDraft(String(line.unitPrice)); }, [line.unitPrice]);

  const commitPrice = () => {
    const n = parseFloat(priceDraft);
    if (Number.isFinite(n) && n >= 0 && n !== line.unitPrice) onPatch({ unitPrice: n });
    else setPriceDraft(String(line.unitPrice));
  };

  const commitNote = () => {
    const t = noteDraft.trim();
    onPatch({ notes: t.length ? t : null });
    setNoteOpen(false);
  };

  return (
    <li className="p-3">
      <div className="flex items-start gap-2">
        {/* Cover image thumbnail — matches the per-line image shown
            on the customer-display mirror so cashier + customer see
            the same product card. Graceful Package fallback when
            the URL is missing or fails to load. */}
        <div className="h-10 w-10 shrink-0 rounded border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center mt-0.5">
          {showImage ? (
            <img
              src={imageUrl!}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => setImgBroken(true)}
            />
          ) : (
            <Package className="h-5 w-5 text-gray-300" strokeWidth={1.25} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{line.name}</div>
          {/* Inline editable unit price — clicking the input updates
              the per-line price on blur. Different rows of the same
              SKU can carry different prices (Size M vs Size L). */}
          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            <span>$</span>
            <Input
              value={priceDraft}
              onChange={e => setPriceDraft(e.target.value)}
              onBlur={commitPrice}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="h-6 w-16 text-xs px-1 py-0"
              inputMode="decimal"
            />
            {line.unit && <span>/ {line.unit}</span>}
          </div>
          {/* Note line — shown when set so the cashier sees the
              modifier at a glance without opening the editor. */}
          {line.notes && !noteOpen && (
            <div className="text-xs italic text-emerald-700 mt-0.5 break-words">
              · {line.notes}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => onQty(line.quantity - 1)}>
              <Minus className="h-3 w-3" />
            </Button>
            <Input
              value={line.quantity}
              onChange={e => {
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n) && n >= 0) onQty(n);
              }}
              className="h-7 w-14 text-center text-sm"
            />
            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => onQty(line.quantity + 1)}>
              <Plus className="h-3 w-3" />
            </Button>
            <button
              type="button"
              onClick={() => setNoteOpen(v => !v)}
              className={`ml-1 h-7 px-2 inline-flex items-center gap-1 rounded border text-xs ${
                line.notes ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
              title={line.notes ? 'Edit note' : 'Add note'}
            >
              <StickyNote className="h-3 w-3" />
              {line.notes ? 'Edit' : 'Note'}
            </button>
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold text-sm">${line.lineTotal.toFixed(2)}</div>
          <button onClick={onRemove} className="text-gray-400 hover:text-red-600 mt-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {noteOpen && (
        <div className="mt-2 space-y-1.5 bg-gray-50 rounded-md p-2 border">
          <textarea
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            placeholder="e.g. Sugar 50%, Size M — Less ice"
            maxLength={500}
            rows={2}
            className="w-full rounded border border-input bg-white px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            autoFocus
          />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs"
              onClick={() => { setNoteDraft(line.notes ?? ''); setNoteOpen(false); }}>
              Cancel
            </Button>
            <Button size="sm" className="h-6 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
              onClick={commitNote}>
              <Check className="h-3 w-3 mr-1" /> Save
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/* ====================================================================
 *  Checkout dialog
 * =================================================================== */

interface CheckoutProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  total: number;
  saving: boolean;
  /** Derived from the cart's tax dropdown: 'tax' = VAT 10%,
   *  'commercial' = no VAT. Shown as a read-only label so the cashier
   *  knows which receipt the sale will produce. */
  invoiceKind: 'commercial' | 'tax';
  /** Bank account cards from POS Settings → Bank Account. Used to
   *  render the KHRQR for scan-to-pay when the cashier picks KHQR. */
  banks: BankAccount[];
  /** Controlled payment method — POS.tsx owns this so the value can
   *  be broadcast to the customer-display window for the scan-to-pay
   *  overlay (V143 follow-up). */
  method: PosPaymentMethod;
  onMethodChange: (m: PosPaymentMethod) => void;
  onSubmit: (method: PosPaymentMethod, received: number) => void;
}

function PosCheckoutDialog({ open, onOpenChange, total, saving, invoiceKind, banks, method, onMethodChange, onSubmit }: CheckoutProps) {
  const setMethod = onMethodChange;
  const [received, setReceived] = useState<number>(0);

  // Re-sync the "received" default to the order total whenever the
  // dialog re-opens — non-cash methods always equal the total, and a
  // fresh cash sale starts at total too so the cashier only types
  // when they're actually overpaying.
  useEffect(() => {
    if (open) setReceived(total);
  }, [open, total]);

  const change = Math.max(0, received - total);
  const short  = received < total;

  // POS supports two payment methods: cash + KHQR scan-to-pay.
  // Card / bank-transfer were dropped — counter sales here are
  // either physical cash or QR. Keep the type wider for back-compat
  // with parked orders persisted before the trim.
  const methodButton = (m: PosPaymentMethod, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setMethod(m)}
      className={`flex flex-col items-center gap-1 rounded-md border p-3 transition ${
        method === m ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {icon}<span className="text-xs font-medium">{label}</span>
    </button>
  );

  // KHQR cards that actually have a QR image — empty rows are
  // ignored so the cashier doesn't see a blank "QR" placeholder.
  const qrCards = banks.filter(b => b.qrDataUrl && b.qrDataUrl.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Checkout</DialogTitle>
          <DialogDescription className="sr-only">Pick payment method and confirm.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Receipt kind is derived from the cart's Tax dropdown
              (No tax → Commercial, VAT 10% → Tax Invoice). Surfaced
              here read-only so the cashier sees what the receipt will
              say without picking it twice. */}
          <div className="text-xs text-gray-500 flex items-center justify-between bg-gray-50 rounded px-2 py-1.5">
            <span>Receipt:</span>
            <span className="font-medium text-gray-700">
              {invoiceKind === 'tax' ? 'Tax Invoice (VAT 10%)' : 'Commercial (no VAT)'}
            </span>
          </div>

          <div>
            <Label className="text-xs text-gray-500">Payment method</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {methodButton('cash', <Banknote className="h-5 w-5" />, 'Cash')}
              {methodButton('khqr', <QrCode    className="h-5 w-5" />, 'KHQR')}
            </div>
          </div>

          {/* KHQR scan-to-pay panel. Renders every saved bank card
              that has a QR image; on a single-bank setup there's just
              one big card, on multi-bank tenants the customer picks
              their preferred rail and scans. Empty-state warns the
              cashier to upload a QR in POS Settings before this
              method can be used. */}
          {method === 'khqr' && (
            <div className="rounded-md border bg-white p-3 space-y-2">
              <div className="text-xs text-gray-600 text-center">
                Show the customer this code to scan and pay <b>${total.toFixed(2)}</b>.
              </div>
              {qrCards.length === 0 ? (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  No KHRQR uploaded yet. Open <b>POS Settings → Bank Account</b> and add a QR before using this method.
                </div>
              ) : (
                <div className={`grid gap-3 ${qrCards.length > 1 ? 'grid-cols-2' : 'grid-cols-1 justify-items-center'}`}>
                  {qrCards.map(b => (
                    <div key={b.id} className="rounded border bg-gray-50 p-2 text-center">
                      <img src={b.qrDataUrl} alt={b.bankName || 'KHRQR'} className="mx-auto h-44 w-44 object-contain bg-white" />
                      <div className="mt-1 text-xs font-medium text-gray-800 truncate">{b.bankName || 'KHRQR'}</div>
                      {b.accountName && <div className="text-[10px] text-gray-500 truncate">{b.accountName}</div>}
                      {b.accountNumber && <div className="text-[10px] font-mono text-gray-600 truncate">{b.accountNumber}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-md bg-gray-50 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Total</span><span className="font-semibold">${total.toFixed(2)}</span></div>
            {method === 'cash' && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 flex-1">Received</span>
                  <Input
                    type="number"
                    value={received}
                    onChange={e => setReceived(parseFloat(e.target.value) || 0)}
                    className="h-8 w-28 text-right"
                  />
                </div>
                <div className="flex justify-between border-t pt-1.5">
                  <span className="text-gray-600">Change</span>
                  <span className={`font-semibold ${short ? 'text-red-600' : 'text-emerald-700'}`}>
                    ${change.toFixed(2)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => onSubmit(method, method === 'cash' ? received : total)}
            disabled={saving || short || total <= 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CreditCard className="h-4 w-4 mr-1.5" />}
            Confirm Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ====================================================================
 *  Open-orders drawer (parked tickets)
 * =================================================================== */

interface DrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orders: PosOrder[];
  onResume: (o: PosOrder) => void;
}

function PosOpenOrdersDrawer({ open, onOpenChange, orders, onResume }: DrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Open tickets
          </DialogTitle>
          <DialogDescription>Click a row to resume the cart.</DialogDescription>
        </DialogHeader>
        {orders.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No parked tickets.</p>
        ) : (
          <ul className="divide-y border rounded-md max-h-80 overflow-auto">
            {orders.map(o => (
              <li key={o.id}>
                <button
                  onClick={() => onResume(o)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-3"
                >
                  <ArrowLeft className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm">{o.queueNo}</div>
                    <div className="text-xs text-gray-500 truncate">{o.customerName ?? 'Walk-in'} · {o.items.length} item(s)</div>
                  </div>
                  <div className="text-sm font-semibold">${o.total.toFixed(2)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ====================================================================
 *  Receipt dialog (post-checkout)
 * =================================================================== */

/** Look up the SKU for a line item from the loaded items catalog.
 *  Cart lines snapshot name + price but not the SKU, so we resolve
 *  it back from {@code stockItemId} on render. Returns null when no
 *  link or no match. */
function lineSku(line: PosOrderItem, items: itemsApi.Item[]): string | null {
  if (!line.stockItemId) return null;
  const it = items.find(i => i.id === line.stockItemId);
  return it?.sku ?? null;
}

interface ReceiptDialogProps {
  order: PosOrder | null;
  settings: settingsApi.AccountingSettings;
  /** Items catalog — needed so the receipt body can resolve SKUs back
   *  from {@code stockItemId} for the optional line prefix. */
  items: itemsApi.Item[];
  onClose: () => void;
}

function PosReceiptDialog({ order, settings, items, onClose }: ReceiptDialogProps) {
  // Auto-print once when the dialog first appears for a given order
  // and the tenant opted in. Tracking the last-printed id stops a
  // re-render from re-firing the print job.
  const printedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!order) return;
    if (!settings.posAutoPrint) return;
    if (printedRef.current === order.id) return;
    printedRef.current = order.id;
    // Slight delay so the dialog has painted before window.open —
    // some browsers refuse a pop-up triggered mid-render.
    const t = setTimeout(() => {
      const ok = printPosReceipt({ order, settings, items });
      if (!ok) toast.error('Pop-up blocked — allow pop-ups to print the receipt.');
    }, 200);
    return () => clearTimeout(t);
  }, [order, settings, items]);

  if (!order) return null;

  const when = new Date(order.checkedOutAt ?? order.createdAt);
  const datePart = when.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timePart = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
  const shopName = settings.posShopName?.trim() || 'SHOP NAME';

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">Payment received</DialogTitle>
          <DialogDescription className="sr-only">Receipt summary for the completed POS sale.</DialogDescription>
        </DialogHeader>

        <PosReceiptBody order={order} settings={settings} items={items}
                        shopName={shopName}
                        datePart={datePart} timePart={timePart} />

        <DialogFooter>
          <Button variant="outline" onClick={() => {
            const ok = printPosReceipt({ order, settings, items });
            if (!ok) toast.error('Pop-up blocked — allow pop-ups to print the receipt.');
          }}>
            <Printer className="h-4 w-4 mr-1.5" /> Print
          </Button>
          <Button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-700">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Receipt body styled to match the supplied sample — asterisk header,
 *  shop name, dotted dividers, item rows with optional SKU prefix,
 *  totals block, CASH + CHANGE, optional PAID stamp, "THANK YOU!"
 *  footer. Identical shape used for both the in-dialog preview and
 *  the print window (innerHTML copy). */
function PosReceiptBody({
  order, settings, items, shopName, datePart, timePart,
}: {
  order: PosOrder;
  settings: settingsApi.AccountingSettings;
  items: itemsApi.Item[];
  shopName: string;
  datePart: string;
  timePart: string;
}) {
  const star = '*'.repeat(36);
  const dot  = '- '.repeat(18).trim();
  const methodLabel = (order.paymentMethod ?? 'cash').toUpperCase();
  const received = order.paymentReceived ?? order.total;
  const change   = order.paymentChange ?? 0;

  // V138 — cashier line + optional logo. Mirrors the printable
  // version from utils/posReceipt.ts so preview and paper match.
  const cashierParts = [order.createdByName, order.createdByPhone].filter(Boolean).join(' · ');
  const logoUrl = (settings.posLogoUrl ?? '').trim() || null;

  return (
    <div id="pos-receipt" className="font-mono text-[11px] leading-snug bg-white px-3 py-2 border rounded-md">
      {logoUrl && (
        <div className="text-center mb-1">
          <img src={logoUrl} alt="" className="inline-block max-h-[60px] max-w-full object-contain" />
        </div>
      )}
      <div className="text-center break-all">{star}</div>
      <div className="text-center font-bold text-base tracking-widest my-1">RECEIPT</div>
      <div className="text-center break-all">{star}</div>

      <div className="font-bold mt-3">{shopName}</div>
      {cashierParts && (
        <div className="text-[10px] text-gray-600 mt-0.5">Cashier: {cashierParts}</div>
      )}

      <div className="break-all text-gray-500 my-1">{dot}</div>
      <div className="flex justify-between">
        <span>DATE :- {datePart}</span>
        <span>{timePart}</span>
      </div>
      <div className="break-all text-gray-500 my-1">{dot}</div>

      {order.items.map((i, idx) => {
        const sku = lineSku(i, items);
        const label = settings.posShowSku && sku
          ? `${sku}   ${i.name}`
          : i.name;
        return (
          <div key={i.id ?? idx} className="mt-0.5">
            <div className="flex justify-between gap-2">
              <span className="truncate pr-2 flex-1">
                {i.quantity > 1 ? `${i.quantity} × ` : ''}{label}
              </span>
              <span className="shrink-0">${i.lineTotal.toFixed(2)}</span>
            </div>
            {/* V134 — per-line modifier note. Indented italic so it
                reads as a sub-line under the item. */}
            {i.notes && (
              <div className="pl-3 italic text-[10px] text-gray-700 break-words">
                · {i.notes}
              </div>
            )}
          </div>
        );
      })}

      <div className="border-t border-black border-dashed my-2"></div>

      {(order.subtotal !== order.total) && (
        <div className="flex justify-between"><span>SUBTOTAL</span><span>${order.subtotal.toFixed(2)}</span></div>
      )}
      {order.discountValue > 0 && (
        <div className="flex justify-between"><span>DISCOUNT</span><span>-${order.discountValue.toFixed(2)}</span></div>
      )}
      {order.taxAmount > 0 && (
        <div className="flex justify-between"><span>TAX{order.invoiceKind === 'tax' ? ' (VAT 10%)' : ''}</span><span>${order.taxAmount.toFixed(2)}</span></div>
      )}
      <div className="flex justify-between font-bold">
        <span>TOTAL</span><span>${order.total.toFixed(2)}</span>
      </div>
      {/* V141 — KHR equivalent on a single line with the rate inside
          the label parens. Only shown for USD orders with a positive
          snapshot rate (the POS happy path). */}
      {order.currency === 'USD' && (order.exchangeRate ?? 0) > 0 && (
        <div className="flex justify-between font-bold">
          <span>TOTAL KHR (@ {(order.exchangeRate ?? 0).toLocaleString('en-US')})</span>
          <span>៛ {(order.total * (order.exchangeRate ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
        </div>
      )}
      <div className="flex justify-between"><span>{methodLabel}</span><span>${received.toFixed(2)}</span></div>
      {change > 0 && (
        <div className="flex justify-between"><span>CHANGE</span><span>${change.toFixed(2)}</span></div>
      )}

      {settings.posShowPaidStamp && (
        <div className="text-center mt-3">
          <span className="inline-block border-2 border-double border-black px-3 py-0.5 font-bold tracking-widest">
            PAID
          </span>
        </div>
      )}

      <div className="text-center font-semibold mt-3">THANK YOU!</div>
      <div className="text-center text-gray-500 text-[10px] mt-1">
        {/* Show only the zero-padded sequence — matches the printable
            receipt produced by utils/posReceipt.ts. Gated on the
            posShowQueueNo setting (V137); the kind label stays
            either way so the slip still labels the receipt type. */}
        {settings.posShowQueueNo && <>#{String(order.queueSeq).padStart(3, '0')}</>}
        {settings.posShowQueueNo && order.invoiceKind && ' · '}
        {order.invoiceKind ? (order.invoiceKind === 'tax' ? 'Tax' : 'Commercial') : ''}
      </div>
    </div>
  );
}

/* ====================================================================
 *  Modifier picker dialog (V142). Opens when the cashier taps an
 *  item with modifier groups configured (typically Drinks with Size +
 *  Sugar Level). Lets them pick one option per group; the dialog
 *  computes the price delta + a "Size M, Sugar 50%" note and commits
 *  it as a new cart line.
 * =================================================================== */

function ModifierPickerDialog({
  item, onCancel, onConfirm,
}: {
  item: itemsApi.Item | null;
  onCancel: () => void;
  onConfirm: (item: itemsApi.Item, priceDelta: number, noteText: string) => void;
}) {
  const groups = useMemo(
    () => (item ? itemsApi.parseModifiers(item.modifiers)?.groups ?? [] : []),
    [item],
  );
  // Default selection per group: required → first option; optional
  // → null until the user picks. Keyed by group index.
  const [picks, setPicks] = useState<Record<number, number | null>>({});
  useEffect(() => {
    if (!item) return;
    const init: Record<number, number | null> = {};
    groups.forEach((g, gi) => { init[gi] = g.required ? 0 : null; });
    setPicks(init);
  }, [item, groups]);

  if (!item) return null;

  const priceDelta = groups.reduce((acc, g, gi) => {
    const oi = picks[gi];
    if (oi == null) return acc;
    return acc + (g.options[oi]?.priceAdj ?? 0);
  }, 0);

  const noteText = groups
    .map((g, gi) => {
      const oi = picks[gi];
      if (oi == null) return null;
      return `${g.name} ${g.options[oi]?.label ?? ''}`.trim();
    })
    .filter(Boolean)
    .join(', ');

  // Refuse confirm if any required group is still unpicked. Optional
  // groups can be left as null.
  const blockedByRequired = groups.some((g, gi) => g.required && picks[gi] == null);
  const finalPrice = +(item.unitPrice + priceDelta).toFixed(2);

  return (
    <Dialog open onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription className="sr-only">Customise this item before adding it to the cart.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {groups.map((g, gi) => (
            <div key={gi}>
              <div className="text-xs font-semibold text-gray-700 mb-1.5 inline-flex items-center gap-2">
                {g.name}
                {g.required && <span className="text-[10px] text-red-600">Required</span>}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {g.options.map((o, oi) => {
                  const active = picks[gi] === oi;
                  return (
                    <button
                      key={oi}
                      type="button"
                      onClick={() => setPicks(p => ({ ...p, [gi]: oi }))}
                      className={`rounded-md border px-2 py-2 text-sm transition text-left ${
                        active
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium">{o.label}</div>
                      {o.priceAdj !== 0 && (
                        <div className={`text-[11px] ${active ? 'text-emerald-600' : 'text-gray-500'}`}>
                          {o.priceAdj > 0 ? '+' : ''}${o.priceAdj.toFixed(2)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Live preview of what the cart line will look like. */}
          <div className="rounded-md bg-gray-50 p-3 text-sm space-y-0.5">
            <div className="flex justify-between font-semibold">
              <span>{item.name}</span>
              <span>${finalPrice.toFixed(2)}</span>
            </div>
            {noteText && (
              <div className="text-xs italic text-emerald-700">· {noteText}</div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            disabled={blockedByRequired}
            onClick={() => onConfirm(item, priceDelta, noteText)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Add to cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

