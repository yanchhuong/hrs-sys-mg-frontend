import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  ShoppingCart, Loader2, Search, Plus, Minus, X, FileText, CreditCard,
  Banknote, QrCode, Receipt, Printer, ArrowLeft, AlertCircle,
  Package, Settings as SettingsIcon, StickyNote, Check, MonitorPlay, Share2,
  ClipboardList, ArrowRight, RotateCcw, Gift, Star, Stamp as StampIcon,
  Maximize2, Minimize2, Warehouse as WarehouseIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '../ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import * as posApi from '../../api/pos';
import * as itemsApi from '../../api/items';
import * as warehousesApi from '../../api/warehouses';
import * as customersApi from '../../api/customers';
import { loyaltyPos, type CustomerLoyaltyState, type EarnSummary, type CustomerBalanceSummary, type LoyaltyType } from '../../api/loyalty';
import * as settingsApi from '../../api/accountingSettings';
// {@code settingsApi.getCompanyInfo} lives in the sibling `settings.ts`
// module, not this one — pull it in under a separate alias so the
// POS receipt can render the tenant's address + phone.
import * as companyApi from '../../api/settings';
import * as posDisplayApi from '../../api/posDisplay';
import * as paywayApi from '../../api/payway';
import { AccountingSettingsDialog } from '../common/AccountingSettingsDialog';
import { ShareShopDialog } from '../common/ShareShopDialog';
import { PairDisplayDialog } from '../common/PairDisplayDialog';
import { SearchablePicker, type PickerOption } from '../common/SearchablePicker';
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
  /** V165 — paid orders still moving through the kitchen pipeline
   *  (requested → accepted → in_progress → ready → done). Refreshed
   *  after each checkout and on a 15 s tick while the page is open. */
  const [activeOrders, setActiveOrders] = useState<PosOrder[]>([]);
  const [activeDrawerOpen, setActiveDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // V142 — category filter tabs. 'all' is the default; selecting a
  // specific category narrows the items grid below the search bar.
  // Kept as plain string so custom free-text categories (V269) that
  // aren't in the known-chip set can still be selected/deselected.
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  // Warehouse filter (V149 feature-on). Empty string = All warehouses.
  // Rendered on the right side of the category chip row and only
  // appears when the tenant has ≥2 warehouses configured — a single-
  // warehouse tenant gets zero clutter.
  const [warehouses, setWarehouses] = useState<warehousesApi.Warehouse[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState<string>('');
  // Modifier picker (V142). When the cashier taps an item with
  // modifiers, this holds the item being configured; the picker
  // dialog reads it and commits the selection back into the cart.
  const [modifierTarget, setModifierTarget] = useState<itemsApi.Item | null>(null);

  // Cart state — local until "Save Draft" or "Checkout" persists it.
  const [cart, setCart] = useState<PosOrderItem[]>([]);
  const [currentOrder, setCurrentOrder] = useState<PosOrder | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  // v-loyalty-mvp — loyalty state for the currently picked customer.
  // Loaded when the customer flips; used by the customer panel below
  // the cart to show balances + apply Point-cost redeems as a cart
  // discount before payment.
  const [loyaltyState, setLoyaltyState] = useState<CustomerLoyaltyState | null>(null);
  // v-loyalty-mvp — bulk snapshot: one row per customer with a
  // balance. Keyed by customerId so the customer <Select> can
  // render "· 230 pts" / "· 3 stamps" inline without a per-row
  // network round-trip.
  const [loyaltyBalances, setLoyaltyBalances] = useState<Record<string, CustomerBalanceSummary>>({});
  // v-pos-customer-searchable — inline "add customer" dialog state.
  // The Ref bridges the SearchablePicker's onCreate promise (which
  // stays pending while the dialog is open) to the dialog's Save /
  // Cancel handlers. Resolve when the customer is created;
  // reject on Cancel so the picker doesn't select a phantom value.
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerSaving, setNewCustomerSaving] = useState(false);
  const pendingCustomerCreateRef: MutableRefObject<{
    resolve: (o: PickerOption) => void;
    reject: (e: unknown) => void;
  } | null> = useRef(null);
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
  // Company profile (address + phone) — surfaced under the shop name
  // on the printed receipt so the tenant's contact info reaches the
  // customer without the operator hand-editing the POS Settings block.
  const [companyInfo, setCompanyInfo] = useState<companyApi.CompanyInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // KHQR bank-account cards (V133 settings dialog → Bank Account
  // section). Loaded once on mount + re-read when the settings dialog
  // closes so a newly-uploaded QR shows up on the next checkout.
  const [banks, setBanks] = useState<BankAccount[]>(() => loadBankAccounts('pos'));

  // Dialog state.
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // v-pos-mobile-drawer — on <lg widths the cart aside is hidden and
  // opens as a bottom sheet via the FAB. Boolean is unused on desktop.
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
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
  /** Pairing code for a Display running on a SEPARATE device.
   *  Null = no remote Display paired; snapshot updates only fire
   *  over BroadcastChannel (same-browser popup). When set, the
   *  same snapshot also POSTs to /api/v1/pos/display/{code}/state
   *  so the paired tablet sees the cart in real time over SSE. */
  const [pairedDisplayCode, setPairedDisplayCode] = useState<string | null>(null);
  const [pairDisplayOpen, setPairDisplayOpen] = useState(false);
  /** v-pos-fullscreen — mirror the browser's fullscreen state so the
   *  header icon flips between Enter / Exit. `fullscreenchange` also
   *  fires when the user hits Esc, so we stay in sync without
   *  polling. Fullscreen is per-window, so leaving POS mid-session
   *  is preserved by the natural DOM event on unmount. */
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    typeof document !== 'undefined' && !!document.fullscreenElement,
  );
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    // Best-effort — some browsers reject requestFullscreen when not
    // triggered by a user gesture, or the tenant is embedded in an
    // iframe. Silent-fail: the icon toggles based on the actual
    // fullscreenchange event, so nothing gets stuck.
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => { /* swallow */ });
    } else {
      document.exitFullscreen?.().catch(() => { /* swallow */ });
    }
  };
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
        const [itemList, custList, open, active, pos] = await Promise.all([
          // slim=true trims the description text field from every row;
          // POS tiles don't render description, so this is a pure
          // payload win with no visual impact.
          itemsApi.list({ size: 200, slim: true }),
          customersApi.list({ size: 200 }),
          posApi.listOpen(),
          posApi.listActiveFulfillment(),
          settingsApi.get('pos'),
        ]);
        // Only show active items in the grid; deductionEnabled is
        // respected by the backend at checkout time.
        setItems(itemList.content.filter(i => i.active));
        setCustomers(custList.content);
        setOpenOrders(open);
        setActiveOrders(active);
        setPosSettings(pos);
        // Fire-and-forget the company profile fetch — the receipt
        // renders without it if the request fails; no reason to
        // block POS load on a hiccup here.
        companyApi.getCompanyInfo()
          .then(setCompanyInfo)
          .catch(() => setCompanyInfo(null));
        // Same fire-and-forget shape for warehouses — the filter chip
        // row hides itself when fewer than 2 warehouses exist, so a
        // fetch failure is silently equivalent to "feature off".
        warehousesApi.list()
          .then(list => setWarehouses(list.filter(w => w.enabled)))
          .catch(() => setWarehouses([]));
        // v-loyalty-mvp — best-effort balance snapshot for the
        // customer picker chip. Never blocks POS load on a
        // loyalty-side hiccup (tenants without any programs get
        // an empty array anyway).
        loyaltyPos.balances()
          .then(rows => {
            const m: Record<string, CustomerBalanceSummary> = {};
            for (const r of rows) m[r.customerId] = r;
            setLoyaltyBalances(m);
          })
          .catch(() => setLoyaltyBalances({}));
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

  // v-loyalty-mvp — refresh loyalty state each time the customer
  // picker flips. Walk-in (customerId = null) clears the panel.
  // Best-effort — an error here never blocks the sale.
  useEffect(() => {
    if (!customerId) { setLoyaltyState(null); return; }
    let cancelled = false;
    loyaltyPos.state(customerId)
      .then(s => { if (!cancelled) setLoyaltyState(s); })
      .catch(() => { if (!cancelled) setLoyaltyState(null); });
    return () => { cancelled = true; };
  }, [customerId]);

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
    // Cross-device push: if a tablet is paired, mirror the same
    // snapshot to the server so its SSE stream fans it out. Wrapped
    // in {kind:'state', state} so the Display side's handler can be
    // shape-identical to the BroadcastChannel path. Fire-and-forget;
    // a transient network error here shouldn't break the cashier's UI.
    if (pairedDisplayCode) {
      void posDisplayApi.publish(pairedDisplayCode, { kind: 'state', state: snapshot } satisfies DisplayMessage)
        .catch(() => { /* swallow — Display reconnect handles gaps */ });
    }
  }, [
    cart, customerId, customers, currentOrder, items,
    subtotal, discountAmount, taxAmount, total, invoiceKind,
    posSettings.posShopName, posSettings.posLogoUrl, posSettings.posExchangeRate,
    posSettings.posSlideEnabled, posSettings.posSlideMedia,
    checkoutOpen, checkoutMethod, banks,
    paidSnapshot, pairedDisplayCode,
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
  /** v-pos-cart-stock-cap — max total quantity the cart is allowed
   *  to hold across ALL lines of a given stockItemId. Returns Infinity
   *  when the item isn't deduction-tracked (services / drinks that
   *  don't deplete inventory). Null when the item isn't in the loaded
   *  catalog (ad-hoc line typed into an invoice — no cap). */
  const stockCapFor = (stockItemId: string | null | undefined): number => {
    if (!stockItemId) return Infinity;
    const it = items.find(x => x.id === stockItemId);
    if (!it || !it.deductionEnabled) return Infinity;
    return Math.max(0, it.stockQty ?? 0);
  };

  /** Total quantity already committed for the given stockItemId across
   *  every line EXCEPT the one at excludeIdx. Used to figure out how
   *  much room is left on the target line before the merged sum hits
   *  the stock cap. */
  const cartQtyForItem = (
    lines: PosOrderItem[], stockItemId: string | null | undefined, excludeIdx?: number,
  ): number => {
    if (!stockItemId) return 0;
    let sum = 0;
    for (let i = 0; i < lines.length; i++) {
      if (i === excludeIdx) continue;
      if (lines[i].stockItemId === stockItemId) sum += lines[i].quantity;
    }
    return sum;
  };

  const addItem = (it: itemsApi.Item) => {
    // Cap check up-front — refuse to add a unit if the cart already
    // holds every unit the warehouse can ship for this SKU. Toasts
    // once and returns so the cashier sees why nothing happened.
    const cap = stockCapFor(it.id);
    if (Number.isFinite(cap)) {
      const already = cartQtyForItem(cart, it.id);
      if (already >= cap) {
        toast.error(`Only ${cap} ${it.unit ?? 'unit'}${cap === 1 ? '' : 's'} of "${it.name}" in stock — cart already has ${already}.`);
        return;
      }
    }
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
      const line = prev[idx];
      const cap = stockCapFor(line?.stockItemId);
      // Cap the target line's qty at the stock cap minus whatever
      // sibling lines of the same SKU already reserve. If the
      // requested value exceeds that, clamp it and toast so the
      // cashier sees why the number they typed didn't stick.
      let effective = qty;
      if (Number.isFinite(cap)) {
        const others = cartQtyForItem(prev, line?.stockItemId, idx);
        const remaining = Math.max(0, cap - others);
        if (qty > remaining) {
          effective = remaining;
          const it = items.find(x => x.id === line?.stockItemId);
          toast.error(`Only ${cap} ${it?.unit ?? 'unit'}${cap === 1 ? '' : 's'} of "${it?.name ?? 'this item'}" in stock — capped at ${remaining}.`);
        }
      }
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: effective };
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

  const onCheckoutSubmit = async (method: PosPaymentMethod, received: number): Promise<boolean> => {
    // Persist the cart first if it isn't already saved — the checkout
    // endpoint needs a real ticket to flip.
    let order = currentOrder;
    if (!order) order = await saveDraft();
    else if (saving) return false; // mid-save guard
    else order = await saveDraft(); // re-save in case the cart edited since last save
    if (!order) return false;
    setSaving(true);
    try {
      const checked = await posApi.checkout(order.id, { invoiceKind, paymentMethod: method, paymentReceived: received });
      // v-loyalty-mvp — fire the earn hook against the just-paid
      // invoice. AWAITED (not fire-and-forget) so the dialog can
      // chain a burn against the freshly-elevated balance (see
      // v-loyalty-projected-redeem). A loyalty hiccup still never
      // blocks the sale — errors are swallowed inline.
      if (checked.invoiceId && checked.customerId) {
        try {
          const summary: EarnSummary = await loyaltyPos.earn(checked.invoiceId);
          for (const l of summary.lines) {
            const parts: string[] = [];
            if (l.pointsEarned > 0) parts.push(`+${l.pointsEarned} pts`);
            if (l.stampsEarned > 0) parts.push(`+${l.stampsEarned} stamp${l.stampsEarned === 1 ? '' : 's'}`);
            if (l.note) parts.push(l.note);
            if (parts.length) toast.success(`${l.programName}: ${parts.join(' · ')}`);
          }
        } catch { /* silent — loyalty never blocks checkout */ }
      }
      setOpenOrders(prev => prev.filter(o => o.id !== checked.id));
      // V165 — the just-paid order enters the kitchen pipeline at
      // 'requested'. Prepend it so the Active Orders drawer reflects
      // the new ticket without waiting for the polling tick.
      //
      // V273 — when the tenant has disabled the cooking-progress
      // pipeline, skip enrolling into activeOrders entirely and
      // advance the fulfilment status straight to 'done' on the
      // backend. Failure is swallowed (best-effort) — the invoice is
      // already paid regardless of the pipeline flip.
      if (posSettings.posShowCookingProgress) {
        setActiveOrders(prev => [checked, ...prev.filter(o => o.id !== checked.id)]);
      } else {
        posApi.setFulfillmentStatus(checked.id, 'done').catch(() => {
          // Non-fatal — the order still shows as paid on receipts.
        });
      }
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
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Checkout failed');
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** V165 — bump a paid order to a new kitchen state. Optimistic
   *  update + reconcile from server response so the UI doesn't lag
   *  the click. A 'done' move drops the row from the active list. */
  const advanceFulfillment = async (id: string, next: posApi.PosFulfillmentStatus) => {
    setActiveOrders(prev => prev.map(o => o.id === id ? { ...o, fulfillmentStatus: next } : o));
    try {
      const updated = await posApi.setFulfillmentStatus(id, next);
      setActiveOrders(prev => {
        const without = prev.filter(o => o.id !== updated.id);
        return updated.fulfillmentStatus === 'done' ? without : [updated, ...without];
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Status update failed');
      // Reconcile by refetching — the optimistic write may be stale.
      posApi.listActiveFulfillment().then(setActiveOrders).catch(() => { /* ignore */ });
    }
  };

  // Light polling so a second cashier / kitchen tablet sees fresh
  // status without manual refresh. 15 s strikes a balance between
  // responsiveness and noise; tick pauses while the drawer is closed
  // to keep idle-page traffic to zero.
  useEffect(() => {
    if (!activeDrawerOpen) return;
    const t = setInterval(() => {
      posApi.listActiveFulfillment().then(setActiveOrders).catch(() => { /* swallow */ });
    }, 15_000);
    return () => clearInterval(t);
  }, [activeDrawerOpen]);

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
  // v-item-category-free-text (V269) — categories are free-text.
  // Chips now include the well-known set PLUS any custom label the
  // tenant has actually saved on an item (e.g. "Pin", "Ceramic").
  // Empty/missing categories bucket as "other" so nothing falls off
  // the grid.
  const KNOWN_POS_CATEGORIES: readonly string[] =
    ['drink', 'snack', 'food', 'craft', 'souvenir', 'jewelry', 'other'];
  const normalCat = (raw: string | undefined | null): string =>
    (raw ?? '').trim().toLowerCase() || 'other';
  const filteredItems = items.filter(i => {
    // v-pos-hide-oos-deduct — items with Stock IN/OUT ON and stock
    // at 0 are unsellable (the checkout endpoint refuses them
    // server-side). Hide them from the grid entirely so a cashier
    // can't tap a tile that will 400 on ring-up. Service items
    // (deductionEnabled=false) always show regardless of stockQty
    // because they never deplete inventory. Matches the invoice
    // StockItemPicker's own filter (StockItemPicker.tsx:87).
    if (i.deductionEnabled && (i.stockQty ?? 0) <= 0) return false;
    if (categoryFilter !== 'all' && normalCat(i.category) !== categoryFilter) return false;
    if (warehouseFilter && (i.warehouseId ?? '') !== warehouseFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    // Match either the display name OR the item code (SKU) so a
    // cashier scanning / typing a barcode-like code hits the item
    // without having to remember the name.
    return i.name.toLowerCase().includes(q)
        || (i.sku ?? '').toLowerCase().includes(q);
  });
  // V149 — warehouse counts drive the chip labels ("A (7)"). Only
  // computed / rendered when the tenant has 2+ warehouses; a single-
  // warehouse tenant sees no filter chips at all.
  //
  // Plain compute (not useMemo) — this block sits AFTER the early-
  // return guards at the top of the component, and adding a hook here
  // shifts the hook count between renders (loading branch: N; loaded
  // branch: N+1) → "Rendered more hooks than during the previous
  // render". Cost is trivial: capped at 200 items by the POS fetch.
  const showWarehouseFilter = warehouses.length >= 2;
  // Chip counts operate on the same sellable-set the grid renders,
  // so "Snack (3)" always matches what the cashier can actually tap.
  // OOS deduction items excluded here just like they are in the grid.
  const sellable = items.filter(i => !(i.deductionEnabled && (i.stockQty ?? 0) <= 0));
  const warehouseCounts = new Map<string, number>();
  warehouseCounts.set('', sellable.length);
  for (const it of sellable) {
    if (!it.warehouseId) continue;
    warehouseCounts.set(it.warehouseId, (warehouseCounts.get(it.warehouseId) ?? 0) + 1);
  }
  // Category counts drive the chip labels — "Drink (12)" etc. so the
  // cashier sees stock counts at a glance. Keyed by the normalized
  // category string so a custom "pin" label counts + filters correctly.
  const categoryCounts = new Map<string, number>();
  categoryCounts.set('all', sellable.length);
  for (const it of sellable) {
    const c = normalCat(it.category);
    categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
  }
  // Ordered chip key list — 'all' first, then known categories
  // (excluding 'other'), then any custom labels the tenant has
  // actually used (alphabetical), then 'other' pinned LAST so the
  // catch-all bucket never appears mid-list.
  const KNOWN_EXCL_OTHER = KNOWN_POS_CATEGORIES.filter(k => k !== 'other');
  const customCatKeys = Array.from(new Set(sellable.map(i => normalCat(i.category))))
    .filter(k => !KNOWN_POS_CATEGORIES.includes(k))
    .sort();
  const chipKeys: readonly string[] = ['all', ...KNOWN_EXCL_OTHER, ...customCatKeys, 'other'];

  // Cart panel JSX — rendered inside the desktop aside AND inside the
  // mobile bottom Sheet, so both surfaces stay in sync without a
  // duplicated JSX tree. Kept as a plain variable (not a memo) because
  // the closures already track every state slice it reads.
  const cartBody = (
    <>
      <div className="p-3 border-b bg-white shrink-0">
        <Label className="text-xs text-gray-500">Customer</Label>
        {/* v-pos-customer-searchable — search-as-you-type customer
            picker with an inline "+ Create '<name>'" item that
            opens a Name + Phone dialog. Replaces the plain Select
            so a busy cashier can add a walk-in-turned-repeat in
            one flow without navigating away. */}
        <SearchablePicker
          className="h-8 mt-1"
          placeholder="Walk-in"
          searchPlaceholder="Search name / phone…"
          emptyResultsLabel="No customer matches — type a name to create."
          allowClear={false}
          value={customerId ?? '__walkin'}
          onChange={v => setCustomerId(v === '__walkin' ? null : v)}
          onCreate={async (name) => {
            // Open the Name+Phone dialog and wait for the operator
            // to fill in phone. Resolves with the picker option
            // when the create succeeds; rejects on Cancel so the
            // picker stays open without a spurious selection.
            return new Promise<{ value: string; label: string; secondary?: string }>((resolve, reject) => {
              pendingCustomerCreateRef.current = { resolve, reject };
              setNewCustomerName(name);
              setNewCustomerPhone('');
              setNewCustomerOpen(true);
            });
          }}
          createLabel={q => `Add "${q}" as a new customer`}
          options={[
            { value: '__walkin', label: 'Walk-in' },
            ...customers
              .filter(c => (c.name ?? '').trim().toLowerCase() !== 'walk-in')
              .map(c => {
                const bal = loyaltyBalances[c.id];
                // v-pos-customer-searchable — last 4 digits of the
                // phone as a compact identifier suffix so two "John
                // Smith" rows are still distinguishable at a glance.
                // Full phone still searchable (see searchKey below).
                const phone = (c.phone ?? '').trim();
                const phoneTail = phone.length >= 4 ? '••' + phone.slice(-4) : phone || undefined;
                // Reward chips on the RIGHT edge — coloured so pts
                // (blue) and stamps (green) read like the loyalty
                // panel below the cart.
                const trailing = (bal && (bal.currentPoint > 0 || bal.currentStamp > 0)) ? (
                  <span className="inline-flex items-center gap-1">
                    {bal.currentPoint > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                        {bal.currentPoint} pts
                      </span>
                    )}
                    {bal.currentStamp > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                        {bal.currentStamp} stamp{bal.currentStamp === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                ) : undefined;
                // Include the FULL phone (not just the tail) so
                // "01234" also matches — the display trims for
                // brevity, search stays permissive.
                const searchKey = `${c.name} ${phone} ${bal?.currentPoint ?? ''} ${bal?.currentStamp ?? ''}`;
                return {
                  value: c.id,
                  label: c.name,
                  secondary: phoneTail,
                  trailing,
                  searchKey,
                };
              }),
          ]}
        />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {cart.length === 0 ? (
          <div className="text-center text-sm text-gray-400 mt-10 px-4">
            Tap an item to add it to the cart.
          </div>
        ) : (
          <ul className="divide-y bg-white">
            {cart.map((l, idx) => {
              // Per-line stock cap so the +/- controls can grey out
              // once the merged sum (this line + siblings for the
              // same SKU) hits the stock quantity. Infinity for
              // non-deduction items → no cap enforced.
              const cap = stockCapFor(l.stockItemId);
              const otherLinesTotal = cartQtyForItem(cart, l.stockItemId, idx);
              const maxQty = Number.isFinite(cap)
                ? Math.max(0, cap - otherLinesTotal)
                : Infinity;
              return (
                <CartLineRow
                  key={idx}
                  line={l}
                  imageUrl={(l.stockItemId && items.find(i => i.id === l.stockItemId)?.imageUrl) || null}
                  maxQty={maxQty}
                  onQty={n => setLineQty(idx, n)}
                  onRemove={() => removeLine(idx)}
                  onPatch={patch => patchLine(idx, patch)}
                />
              );
            })}
          </ul>
        )}
      </div>

      <LoyaltyPanel
        state={loyaltyState}
        onApplyReward={async (programId, discount) => {
          if (!customerId) return;
          try {
            await loyaltyPos.applyReward(customerId, programId);
            // Move the redeemed discount into the cart's own
            // discount slot so it's reflected in Total. Amount-mode
            // sums with any manual discount already keyed in.
            setDiscountType('amount');
            setDiscountValue(v => Number(v) + Number(discount));
            toast.success(`Applied $${discount.toFixed(2)} loyalty discount.`);
            const next = await loyaltyPos.state(customerId);
            setLoyaltyState(next);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to apply reward');
          }
        }}
      />

      <div className="border-t bg-white p-3 space-y-2 text-sm shrink-0">
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span><span>${total.toFixed(2)}</span>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={saveDraft} disabled={saving || cart.length === 0}>
            {saving && !checkoutOpen ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <FileText className="h-4 w-4 mr-1.5" />}
            Save Draft
          </Button>
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => { setMobileCartOpen(false); setCheckoutOpen(true); }}
            disabled={cart.length === 0}
          >
            <CreditCard className="h-4 w-4 mr-1.5" />
            Checkout
          </Button>
        </div>
      </div>
    </>
  );

  return (
    // h-full sizes POS to the Layout main's content area (which already
    // has a bounded height from the parent flex column). No 100vh math
    // and no negative margin — those triggered main's overflow-y-auto.
    // The inner flex-1 panels with min-h-0 carry the two scrollable
    // regions (items grid + cart rows).
    <div className="flex flex-col h-full bg-white">
      {/* overflow-x-auto + shrink-0 on both groups: when the viewport
          is narrower than the total button strip (mobile in portrait
          Safari, screenshot from a small-tablet cashier device),
          nothing wraps and nothing clips out of reach — the header
          scrolls horizontally so a finger-swipe brings the trailing
          buttons (Share, drawer, etc.) into view. */}
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-white shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
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
            <span className="ml-2 text-sm tabular-nums px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              {currentOrder.queueNo}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* v-pos-fullscreen — hides browser chrome so the cashier
              gets max screen real estate. Icon-only to keep the top
              strip compact on tablets; tooltip carries the label
              plus the Esc-to-exit hint most POS operators haven't
              met yet. */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          {/* Customer-display "mirror screen". Pops out a second
              window the customer can see — cart + total update live
              via BroadcastChannel as the cashier rings up items. */}
          <Button variant="outline" size="sm" onClick={openCustomerDisplay} title="Open customer-facing display">
            <MonitorPlay className="h-4 w-4 mr-1.5" />
            Display
          </Button>
          {/* Cross-device pairing — mints a 5-char code + QR the
              second tablet can scan to subscribe to this POS's live
              cart over SSE. Distinct from the popup-Display above
              because that one works only same-browser. */}
          <Button
            variant={pairedDisplayCode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPairDisplayOpen(true)}
            title={pairedDisplayCode ? `Paired ${pairedDisplayCode}` : 'Open the camera app on the second tablet and scan this QR. It opens the customer-facing Display tuned to this POS — the cart updates live as you ring up items.'}
          >
            <QrCode className="h-4 w-4 mr-1.5" />
            {pairedDisplayCode ? `Paired ${pairedDisplayCode}` : 'Pair'}
          </Button>
          {/* Share menu — public /shop/{code} link a customer can scan
              or visit to browse the menu read-only. Mints the code on
              first open; rotate is a click in the dialog. */}
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} title="Share public menu link">
            <Share2 className="h-4 w-4 mr-1.5" />
            Share
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDrawerOpen(true)}
            title="Click a row to resume the cart."
          >
            <Receipt className="h-4 w-4 mr-1.5" />
            Open Orders ({openOrders.length})
          </Button>
          {/* V165 — paid orders moving through the kitchen pipeline.
              Hidden when no active rows so the toolbar doesn't carry
              dead buttons on slow days. */}
          {posSettings.posShowCookingProgress && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveDrawerOpen(true)}
              title="Paid orders moving through the kitchen — tap an order to advance its status."
              className={activeOrders.length > 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : ''}
            >
              <ClipboardList className="h-4 w-4 mr-1.5" />
              Active Orders ({activeOrders.length})
            </Button>
          )}
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

      <div className="flex-1 flex min-h-0 flex-col lg:flex-row">
        {/* ---- Items grid ---- */}
        <section className="flex-1 flex flex-col lg:border-r min-w-0 min-h-0">
          <div className="p-3 border-b bg-white space-y-2 shrink-0">
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
                tapping a chip narrows the items grid to that bucket.
                V149 — when the tenant has 2+ warehouses, a matching
                warehouse-filter row sits on the RIGHT of the same
                physical row (category on left, warehouse on right).
                Each side is its own `.chip-row` — each scrolls
                independently on narrow screens so a long category
                list doesn't push the warehouse filter off-screen. */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="chip-row flex-1 min-w-0">
                {chipKeys
                  // Hide chips whose bucket is empty unless it's the active tab
                  // OR the "All" chip — the "All" tab must always be present.
                  .filter(key => key === 'all' || categoryFilter === key || (categoryCounts.get(key) ?? 0) > 0)
                  .map(key => {
                    const active = categoryFilter === key;
                    const label = key === 'all' ? 'All' : key[0].toUpperCase() + key.slice(1);
                    const count = categoryCounts.get(key) ?? 0;
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
                        <span className="ml-1 text-[10px] opacity-70">({count})</span>
                      </button>
                    );
                  })}
              </div>
              {showWarehouseFilter && (
                // Right side of the same row. `max-w-[45%]` caps its
                // share on wide screens so the category chips keep
                // their scroll headroom; both sides then compete for
                // the remaining width but their internal scroll keeps
                // them reachable.
                <div className="chip-row shrink-0 max-w-[45%] pl-3 border-l border-gray-200">
                  <WarehouseIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <button
                    type="button"
                    onClick={() => setWarehouseFilter('')}
                    className={`px-3 h-7 rounded-full border text-xs font-medium transition ${
                      warehouseFilter === ''
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    All
                    <span className="ml-1 text-[10px] opacity-70">({warehouseCounts.get('') ?? 0})</span>
                  </button>
                  {warehouses.map(w => {
                    const count = warehouseCounts.get(w.id) ?? 0;
                    const active = warehouseFilter === w.id;
                    // Hide zero-count warehouses unless active — matches
                    // the category-chip empty-bucket rule so the row
                    // stays uncluttered on a POS that filed products
                    // into only one of the warehouses.
                    if (!active && count === 0) return null;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setWarehouseFilter(w.id)}
                        className={`px-3 h-7 rounded-full border text-xs font-medium transition ${
                          active
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                        title={w.name}
                      >
                        {w.name}
                        <span className="ml-1 text-[10px] opacity-70">({count})</span>
                      </button>
                    );
                  })}
                </div>
              )}
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
              // v-pos-mobile-drawer — 3-per-row on <sm matches the
              // mobile launcher tile aesthetic; step up progressively.
              <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3 pb-24 lg:pb-3">
                {filteredItems.map(it => (
                  <PosItemCard key={it.id} item={it} onAdd={onItemTap} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ---- Cart panel ----
            v-pos-mobile-drawer — desktop (lg+) keeps the fixed 380px
            aside on the right. Mobile (<lg) hides the aside entirely;
            the cart opens as a bottom Sheet triggered by the FAB
            rendered outside the flex row. cartBody below is shared
            between the two so we don't fork the JSX. */}
        <aside className="hidden lg:flex w-[380px] flex-col bg-gray-50 min-h-0">
          {cartBody}
        </aside>
      </div>

      {/* Mobile-only FAB — hidden on lg+. Shows item count + running
          total; tapping opens the cart Sheet from the bottom. */}
      <Button
        type="button"
        onClick={() => setMobileCartOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-30 h-14 rounded-full pl-4 pr-5 shadow-lg bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        <ShoppingCart className="h-5 w-5 mr-2" />
        <span className="text-sm font-semibold">
          {cart.reduce((n, l) => n + l.quantity, 0)} · ${total.toFixed(2)}
        </span>
      </Button>

      {/* Mobile cart drawer — same content as the desktop aside. */}
      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col lg:hidden">
          <SheetHeader className="px-4 pt-4 pb-2 shrink-0">
            <SheetTitle className="text-base">Cart</SheetTitle>
            <SheetDescription className="sr-only">
              Review items, adjust quantities, and continue to checkout.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0 flex flex-col bg-gray-50">
            {cartBody}
          </div>
        </SheetContent>
      </Sheet>

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
        subtotal={subtotal}
        discountAmount={discountAmount}
        taxAmount={taxAmount}
        discountType={discountType}
        onDiscountTypeChange={setDiscountType}
        discountValue={discountValue}
        onDiscountValueChange={setDiscountValue}
        taxType={taxType}
        onTaxTypeChange={setTaxType}
        notes={notes}
        onNotesChange={setNotes}
        showDiscount={posSettings.showDiscount}
        showTax={posSettings.showTax}
        showNotes={posSettings.showNotes}
        customerId={customerId}
        loyaltyState={loyaltyState}
        cartLines={cart}
        catalogItems={items}
        onLoyaltyChanged={() => {
          // Re-fetch balance snapshot + this customer's state so the
          // picker chip + LoyaltyPanel reflect the burn.
          if (customerId) {
            loyaltyPos.state(customerId).then(setLoyaltyState).catch(() => {});
          }
          loyaltyPos.balances().then(rows => {
            const m: Record<string, CustomerBalanceSummary> = {};
            for (const r of rows) m[r.customerId] = r;
            setLoyaltyBalances(m);
          }).catch(() => {});
        }}
      />

      {/* v-pos-customer-searchable — inline "Add customer" dialog.
          Pre-fills Name from the picker's typed query; Phone is
          optional but recommended so future returning customers
          fuzzy-match on the digits. Auto-selects the newly-created
          customer once the POST succeeds. */}
      <Dialog
        open={newCustomerOpen}
        onOpenChange={o => {
          if (!o && pendingCustomerCreateRef.current) {
            // Cancel path — reject the pending picker promise so
            // it doesn't select a phantom value.
            pendingCustomerCreateRef.current.reject(new Error('cancelled'));
            pendingCustomerCreateRef.current = null;
          }
          setNewCustomerOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={newCustomerName}
                onChange={e => setNewCustomerName(e.target.value)}
                className="h-9 mt-1"
                placeholder="Full name"
                maxLength={255}
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Phone (optional)</Label>
              <Input
                value={newCustomerPhone}
                onChange={e => setNewCustomerPhone(e.target.value)}
                className="h-9 mt-1"
                placeholder="012 345 678"
                inputMode="tel"
                maxLength={64}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              if (pendingCustomerCreateRef.current) {
                pendingCustomerCreateRef.current.reject(new Error('cancelled'));
                pendingCustomerCreateRef.current = null;
              }
              setNewCustomerOpen(false);
            }} disabled={newCustomerSaving}>Cancel</Button>
            <Button
              onClick={async () => {
                const name = newCustomerName.trim();
                if (!name) { toast.error('Name is required'); return; }
                setNewCustomerSaving(true);
                try {
                  const created = await customersApi.create({
                    type: 'individual',
                    kind: 'customer',
                    name,
                    phone: newCustomerPhone.trim() || undefined,
                  });
                  // Refresh the local customers list so the picker
                  // sees the new row on the next open and the
                  // upstream loyalty balance chip works.
                  setCustomers(prev => [...prev, created]);
                  setCustomerId(created.id);
                  toast.success(`Added ${created.name}`);
                  // Resolve the picker's pending onCreate promise
                  // so the SearchablePicker closes with the new
                  // option selected.
                  pendingCustomerCreateRef.current?.resolve({
                    value: created.id,
                    label: created.name,
                    secondary: created.phone ?? undefined,
                  });
                  pendingCustomerCreateRef.current = null;
                  setNewCustomerOpen(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Failed to add customer');
                } finally {
                  setNewCustomerSaving(false);
                }
              }}
              disabled={newCustomerSaving || !newCustomerName.trim()}
            >
              {newCustomerSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Add customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PosOpenOrdersDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        orders={openOrders}
        onResume={resumeOrder}
      />
      <PosActiveOrdersDrawer
        open={activeDrawerOpen}
        onOpenChange={setActiveDrawerOpen}
        orders={activeOrders}
        onAdvance={advanceFulfillment}
      />
      <PosReceiptDialog
        order={receipt}
        settings={posSettings}
        items={items}
        companyInfo={companyInfo}
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

      <ShareShopDialog open={shareOpen} onOpenChange={setShareOpen} />

      <PairDisplayDialog
        open={pairDisplayOpen}
        onOpenChange={setPairDisplayOpen}
        currentCode={pairedDisplayCode}
        onPaired={setPairedDisplayCode}
        onUnpaired={() => setPairedDisplayCode(null)}
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
      className="group flex flex-col text-left rounded-lg border bg-white overflow-hidden hover:border-emerald-400 hover:shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 p-0"
    >
      <div className="aspect-square w-full bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
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
      <div className="p-2 flex-1">
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
  line, imageUrl, maxQty, onQty, onRemove, onPatch,
}: {
  line: PosOrderItem;
  /** Cover image resolved from the linked stock item, or null
   *  for ad-hoc lines / items without an image. */
  imageUrl: string | null;
  /** v-pos-cart-stock-cap — highest total this line may reach given
   *  the linked stock item's stock quantity + what siblings already
   *  reserve. Infinity for non-deduction items (services, etc.) — no
   *  cap enforced. */
  maxQty: number;
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
              // Native attr also blocks the browser's built-in
              // spinner from ticking past the cap on non-touch
              // clients — belt-and-suspenders with the JS clamp.
              max={Number.isFinite(maxQty) ? maxQty : undefined}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
              onClick={() => onQty(line.quantity + 1)}
              disabled={line.quantity >= maxQty}
              title={line.quantity >= maxQty ? `Reached stock limit (${maxQty})` : undefined}
            >
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
  /** Returns true on a successful checkout so the dialog can chain
   *  the loyalty burn after the earn hook has fired server-side. */
  onSubmit: (method: PosPaymentMethod, received: number) => Promise<boolean>;
  /** Cart breakdown moved into this dialog (v-pos-cart-slim) so the
   *  left cart panel keeps room for the item list. Subtotal + tax
   *  amount are computed by POS.tsx; the rest are controlled inputs
   *  the cashier can still edit here. Display gates come from POS
   *  Settings — hiding a section here removes both the input and its
   *  contribution to the total. */
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  discountType: 'amount' | 'percent';
  onDiscountTypeChange: (v: 'amount' | 'percent') => void;
  discountValue: number;
  onDiscountValueChange: (v: number) => void;
  taxType: string | null;
  onTaxTypeChange: (v: string | null) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  showDiscount: boolean;
  showTax: boolean;
  showNotes: boolean;
  /* -------------------- v-loyalty-redeem-at-checkout -------------------- */
  customerId: string | null;
  loyaltyState: CustomerLoyaltyState | null;
  cartLines: posApi.PosOrderItem[];
  catalogItems: itemsApi.Item[];
  /** Parent re-fetches balance snapshot + customer state after
   *  Confirm so the LoyaltyPanel + picker chip reflect the burn. */
  onLoyaltyChanged: () => void;
}

function PosCheckoutDialog({
  open, onOpenChange, total, saving, invoiceKind, banks, method, onMethodChange, onSubmit,
  subtotal, discountAmount, taxAmount,
  discountType, onDiscountTypeChange, discountValue, onDiscountValueChange,
  taxType, onTaxTypeChange, notes, onNotesChange,
  showDiscount, showTax, showNotes,
  customerId, loyaltyState, cartLines, catalogItems, onLoyaltyChanged,
}: CheckoutProps) {
  const setMethod = onMethodChange;
  const [received, setReceived] = useState<number>(0);

  /* v-loyalty-redeem-at-checkout — local map of rewards the cashier
   *  has ticked "Use this time". Each entry carries the loyalty
   *  discount delta so Reset can subtract exactly what was added
   *  (avoids drift when the cashier also edits the manual discount).
   *  Rewards are ONLY committed BE-side (balance burned) at Confirm
   *  Payment — clicking Cancel drops the map with no side effects. */
  const [applied, setApplied] = useState<Map<string, {
    delta: number;
    rewardItemId?: string;
    programName: string;
    programType: LoyaltyType;
    /** v-loyalty-multi-card-redeem — Buy-5-Get-1 with 10 stamps in
     *  hand redeems TWO free items in one shot. BE burns
     *  count × buyQuantity stamps. Defaults to 1 for POINT. */
    count: number;
  }>>(new Map());

  // Reset applied when the dialog re-opens (fresh checkout) so a
  // prior sale's toggles don't carry over.
  useEffect(() => {
    if (open) setApplied(new Map());
  }, [open]);

  /** v-loyalty-projected-redeem — walk each STAMP program and check
   *  if (current balance + stamps THIS cart is about to earn) crosses
   *  the target. When it does, synthesize a free_item reward so the
   *  cashier can burn it against this very sale. Points are already
   *  surfaced by the BE via {@code p.rewards}; we only project for
   *  STAMP here. */
  const renderableRewards = useMemo(() => {
    type Entry = {
      programId: string;
      programName: string;
      programType: LoyaltyType;
      reward: { kind: 'discount' | 'free_item'; discountAmount: number | null; rewardItemIds: string[]; label: string };
      /** v-loyalty-multi-card-redeem — how many completed cards
       *  are redeemable. STAMP-only; POINT rewards ignore this. */
      redeemableCount: number;
    };
    if (!loyaltyState) return [] as Entry[];
    const out: Entry[] = [];
    for (const p of loyaltyState.programs) {
      if (p.programType === 'STAMP') {
        // v-loyalty-multi-card-redeem — unify the "already at
        // target" and "will hit target with this cart" cases so
        // count always reflects the FULL post-earn balance. Prior
        // pass-through used currentStamp / target (missed cart
        // projection), so 4 prior + 10 in cart showed "1 free"
        // instead of "2 free". Fix: always add projected earn.
        if (p.stampTarget == null) continue;
        const set = new Set(p.rewardItemIds ?? []);
        let projected = 0;
        for (const l of cartLines) {
          if (l.stockItemId && set.has(l.stockItemId)) projected += l.quantity;
        }
        const totalAfterEarn = p.currentStamp + projected;
        // v-loyalty-free-item-earn-adjust — burn cost per redeem is
        // buyQuantity + rewardQuantity because the free item's earn
        // has to be netted out. Cap count by post-earn balance /
        // burn cost so we never offer a redeem the BE can't cover.
        const rewardQty = p.stampRewardQuantity && p.stampRewardQuantity > 0 ? p.stampRewardQuantity : 1;
        const stampsPerRedeem = p.stampTarget + rewardQty;
        const count = Math.floor(totalAfterEarn / stampsPerRedeem);
        if (count < 1) continue;
        out.push({
          programId: p.programId,
          programName: p.programName,
          programType: p.programType,
          reward: {
            kind: 'free_item',
            discountAmount: null,
            rewardItemIds: p.rewardItemIds ?? [],
            label: '', // label rendered inline (stamps → free items) — leave empty here
          },
          redeemableCount: count,
        });
      } else if (p.programType === 'POINT') {
        // v-loyalty-point-multi-redeem — project earn from cart
        // subtotal (pre-discount) and offer as many redemptions as
        // the post-earn balance covers. Ex: 90 pts prior, $10 sale
        // at 1 pt/$1 → 100 total → 1 × $5 off, 0 pts remain.
        if (!p.pointRedeemCost || !p.pointRedeemDiscount) continue;
        const perAmount = p.pointEarnPerAmount ?? 0;
        const projectedPts = perAmount > 0 ? Math.floor(subtotal / perAmount) : 0;
        const totalPtsAfterEarn = p.currentPoint + projectedPts;
        const count = Math.floor(totalPtsAfterEarn / p.pointRedeemCost);
        if (count < 1) continue;
        const totalDiscount = Number((p.pointRedeemDiscount * count).toFixed(2));
        const remainingPts = totalPtsAfterEarn - count * p.pointRedeemCost;
        out.push({
          programId: p.programId,
          programName: p.programName,
          programType: p.programType,
          reward: {
            kind: 'discount',
            discountAmount: totalDiscount,
            rewardItemIds: [],
            label: '', // rendered inline as "N pts → M × $X off (R pts remain)"
          },
          redeemableCount: count,
        });
      } else {
        // BIRTHDAY — pass through BE-surfaced rewards untouched.
        for (const r of p.rewards) {
          out.push({
            programId: p.programId,
            programName: p.programName,
            programType: p.programType,
            reward: r,
            redeemableCount: 1,
          });
        }
      }
    }
    return out;
  }, [loyaltyState, cartLines, subtotal]);

  /** For a STAMP reward, pick the cheapest qualifying item from the
   *  cart (line's stockItemId in the reward's item set). Falls back
   *  to the cheapest matching catalog item if the cart has none
   *  (rare — cashier would then be redeeming without a matching
   *  line, meaning the free item can't be added to this sale).
   *  Returns { rewardItemId, unitPrice } or null when nothing
   *  qualifies. */
  const pickStampFreeItem = (rewardItemIds: string[]): { rewardItemId: string; price: number } | null => {
    if (!rewardItemIds || rewardItemIds.length === 0) return null;
    const set = new Set(rewardItemIds);
    // 1) Prefer a line already in the cart.
    let bestCart: { id: string; price: number } | null = null;
    for (const l of cartLines) {
      if (l.stockItemId && set.has(l.stockItemId)) {
        if (!bestCart || l.unitPrice < bestCart.price) {
          bestCart = { id: l.stockItemId, price: l.unitPrice };
        }
      }
    }
    if (bestCart) return { rewardItemId: bestCart.id, price: bestCart.price };
    // 2) Fallback to the catalog.
    let bestCat: { id: string; price: number } | null = null;
    for (const it of catalogItems) {
      if (set.has(it.id)) {
        const p = Number(it.unitPrice ?? 0);
        if (p > 0 && (!bestCat || p < bestCat.price)) {
          bestCat = { id: it.id, price: p };
        }
      }
    }
    return bestCat ? { rewardItemId: bestCat.id, price: bestCat.price } : null;
  };

  /** Toggle a reward. On tick: bump the parent's discount by the
   *  reward amount + remember the delta. On untick: subtract the
   *  same delta. Forces amount-mode so percent + loyalty don't
   *  interact confusingly. */
  const toggleReward = (programId: string, programName: string, programType: LoyaltyType,
                        reward: { kind: 'discount' | 'free_item'; discountAmount: number | null; rewardItemIds: string[] },
                        redeemableCount: number) => {
    setApplied(prev => {
      const next = new Map(prev);
      if (next.has(programId)) {
        const entry = next.get(programId)!;
        next.delete(programId);
        onDiscountTypeChange('amount');
        onDiscountValueChange(Math.max(0, Number(discountValue) - entry.delta));
        return next;
      }
      let delta = 0;
      let rewardItemId: string | undefined;
      let count = 1;
      if (reward.kind === 'discount') {
        // v-loyalty-point-multi-redeem — discountAmount here is
        // already count × per-redeem discount (rendered synthetic
        // reward). Send the count to the BE so it burns the right
        // number of point-cost chunks.
        delta = Number(reward.discountAmount ?? 0);
        count = Math.max(1, redeemableCount);
      } else if (reward.kind === 'free_item') {
        const pick = pickStampFreeItem(reward.rewardItemIds);
        if (!pick) {
          toast.error('Add a qualifying item to the cart to redeem this reward.');
          return prev;
        }
        // v-loyalty-multi-card-redeem — apply ALL completed cards
        // in one shot. Buy-5-Get-1 with 10 qualifying items → 2
        // free items, discount = 2 × cheapest qualifying price.
        count = Math.max(1, redeemableCount);
        delta = pick.price * count;
        rewardItemId = pick.rewardItemId;
      }
      if (delta <= 0) return prev;
      next.set(programId, { delta, rewardItemId, programName, programType, count });
      onDiscountTypeChange('amount');
      onDiscountValueChange(Number(discountValue) + delta);
      return next;
    });
  };

  /** Fire the BE apply-reward calls for every ticked reward. Runs
   *  in sequence so a mid-chain failure surfaces cleanly (the
   *  earlier redeems have already burned balance; not rolling back
   *  by design — a rare case, cashier can manually ADJUST). */
  const commitLoyalty = async (): Promise<boolean> => {
    if (!customerId || applied.size === 0) return true;
    for (const [programId, entry] of applied.entries()) {
      try {
        await loyaltyPos.applyReward(customerId, programId, {
          discountAmount: entry.delta,
          rewardItemId: entry.rewardItemId,
          count: entry.count,
        });
      } catch (e) {
        toast.error(`Loyalty apply failed on "${entry.programName}": ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    }
    onLoyaltyChanged();
    return true;
  };
  /** Active PayWay session for the KHRQR flow (V164). Null while no
   *  session is open. Polled at 2s intervals; flipping to status='paid'
   *  auto-fires onSubmit. The polling effect is also responsible for
   *  cancelling the session if the cashier closes the dialog before
   *  the customer scans. */
  const [paywaySession, setPaywaySession] = useState<paywayApi.PurchaseSession | null>(null);
  const [paywayBusy, setPaywayBusy] = useState(false);
  const [paywayError, setPaywayError] = useState<string | null>(null);

  // Re-sync the "received" default to the order total whenever the
  // dialog re-opens — non-cash methods always equal the total, and a
  // fresh cash sale starts at total too so the cashier only types
  // when they're actually overpaying.
  useEffect(() => {
    if (open) setReceived(total);
  }, [open, total]);

  /** Tracks the last (open, method, total) tuple we attempted so a
   *  failed mint doesn't enter a retry storm. The previous version
   *  guarded with paywayBusy + paywaySession in the deps array, which
   *  re-fired the effect on every state flip the catch performed —
   *  burning through CPU + hammering the gateway with 400s. */
  const paywayAttemptKeyRef = useRef<string | null>(null);

  /** Mint a PayWay purchase session whenever the operator picks
   *  KHQR (or the dialog opens with KHQR pre-selected). One attempt
   *  per (open, method, total) tuple — a 4xx surfaces the error and
   *  stops; the operator must change a field (or reopen the dialog)
   *  to retry. */
  useEffect(() => {
    if (!open || method !== 'khqr') return;
    const key = `${open}:${method}:${total}`;
    if (paywayAttemptKeyRef.current === key) return;
    paywayAttemptKeyRef.current = key;
    setPaywayError(null);
    setPaywayBusy(true);
    (async () => {
      try {
        const s = await paywayApi.createPosPurchase({
          amount: total,
          currency: 'USD',
        });
        setPaywaySession(s);
      } catch (e) {
        setPaywayError(e instanceof Error ? e.message : 'PayWay session failed');
      } finally {
        setPaywayBusy(false);
      }
    })();
  }, [open, method, total]);

  /** Poll the gateway every 2s while a pending session is on screen.
   *  Auto-fires Confirm Payment when the push handler flips status
   *  to {@code paid} so the cashier doesn't have to click. */
  useEffect(() => {
    if (!paywaySession || paywaySession.status !== 'pending') return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const next = await paywayApi.getStatus(paywaySession.tranId);
        if (stopped) return;
        if (next.status !== paywaySession.status) setPaywaySession(next);
        if (next.status === 'paid') {
          clearInterval(timer);
          onSubmit('khqr', total);
        }
      } catch { /* swallow — try again next tick */ }
    }, 2000);
    return () => { stopped = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paywaySession?.tranId, paywaySession?.status]);

  /** Reset PayWay state whenever the dialog closes OR the method
   *  switches away from KHQR. Cancels the pending session so a
   *  partial scan doesn't dangle on the gateway side. Also wipes
   *  the attempt-key ref so reopening with KHQR retries cleanly
   *  instead of being blocked by the previous attempt. */
  useEffect(() => {
    if (open && method === 'khqr') return;
    if (paywaySession && paywaySession.status === 'pending') {
      void paywayApi.cancelSession(paywaySession.tranId).catch(() => { /* best-effort */ });
    }
    setPaywaySession(null);
    setPaywayError(null);
    paywayAttemptKeyRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, method]);

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

              {/* Layer 1 — PayWay session in flight or succeeded.
                  Mint + poll handled above; we just render whatever
                  state we got back. */}
              {paywayBusy && (
                <div className="flex items-center justify-center gap-2 text-xs text-gray-500 py-6">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating QR…
                </div>
              )}

              {paywaySession?.qrDataUrl && (
                <div className="flex flex-col items-center gap-2">
                  <img
                    src={paywaySession.qrDataUrl}
                    alt="PayWay KHRQR"
                    className="h-56 w-56 object-contain bg-white border rounded"
                  />
                  <div className="text-[11px] text-gray-500 font-mono">{paywaySession.tranId}</div>
                  {paywaySession.status === 'pending' && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-700">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Waiting for customer payment…
                    </div>
                  )}
                  {paywaySession.status === 'paid' && (
                    <div className="text-xs font-medium text-emerald-700">
                      ✓ Payment received — finalising…
                    </div>
                  )}
                </div>
              )}

              {/* Layer 2 — gateway error or no session: fall back to
                  the static bank-QR cards uploaded in POS Settings so
                  the cashier isn't blocked. */}
              {!paywayBusy && (!paywaySession?.qrDataUrl) && (
                <>
                  {paywayError && (
                    <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
                      PayWay error: {paywayError}. Showing saved KHRQR fallback.
                    </div>
                  )}
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
                          {b.accountNumber && <div className="text-[10px] tabular-nums text-gray-600 truncate">{b.accountNumber}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* v-loyalty-redeem-at-checkout — per-reward "Use / Reset"
              toggles for the picked customer's redeemable rewards.
              Includes v-loyalty-projected-redeem: a Stamp program
              whose card completes WITH this sale (4 stamps + 2
              qualifying in cart >= 5 target) surfaces here too.
              Hidden entirely for walk-in checkouts. */}
          {customerId && renderableRewards.length > 0 && (
            <div className="rounded-md border border-purple-200 bg-purple-50/50 p-3 space-y-2 text-sm">
              <div className="text-[11px] font-semibold text-purple-800 inline-flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5" />
                Loyalty rewards
                <span className="text-purple-600 font-normal">— apply this time or save for later</span>
              </div>
              <ul className="space-y-1.5">
                {renderableRewards.map((entry, idx) => {
                  const { programId, programName, programType, reward: r, redeemableCount } = entry;
                  const key = `${programId}:${idx}`;
                  const isApplied = applied.has(programId);
                  const appliedDelta = isApplied ? applied.get(programId)!.delta : null;
                  // For STAMP rewards, surface the running stamp
                  // total (current + projected earn from this
                  // cart) alongside the reward count so the
                  // cashier can eyeball "10 stamps → 2 free" at
                  // a glance instead of parsing the label.
                  const stampProg = programType === 'STAMP'
                    ? loyaltyState?.programs.find(p => p.programId === programId)
                    : null;
                  let stampTotalForDisplay: number | null = null;
                  if (stampProg && stampProg.rewardItemIds) {
                    const set = new Set(stampProg.rewardItemIds);
                    let projected = 0;
                    for (const l of cartLines) {
                      if (l.stockItemId && set.has(l.stockItemId)) projected += l.quantity;
                    }
                    stampTotalForDisplay = stampProg.currentStamp + projected;
                  }
                  // Same idea for POINT: "N pts → M × $X off (R pts remain)"
                  // reads faster than a raw label.
                  const pointProg = programType === 'POINT'
                    ? loyaltyState?.programs.find(p => p.programId === programId)
                    : null;
                  let pointBreakdown: {
                    total: number; remain: number;
                    redeemCost: number; redeemDiscount: number;
                  } | null = null;
                  if (pointProg && pointProg.pointRedeemCost && pointProg.pointRedeemDiscount) {
                    const perAmount = pointProg.pointEarnPerAmount ?? 0;
                    const projectedPts = perAmount > 0 ? Math.floor(subtotal / perAmount) : 0;
                    const totalPts = pointProg.currentPoint + projectedPts;
                    pointBreakdown = {
                      total: totalPts,
                      remain: totalPts - redeemableCount * pointProg.pointRedeemCost,
                      redeemCost: pointProg.pointRedeemCost,
                      redeemDiscount: pointProg.pointRedeemDiscount,
                    };
                  }
                  return (
                    <li key={key} className="flex items-center gap-2 text-[12px]">
                      {programType === 'STAMP'
                        ? <StampIcon className="h-3 w-3 text-emerald-700" />
                        : <Star className="h-3 w-3 text-blue-700" />}
                      <span className="flex-1 truncate">
                        <span className="font-medium">{programName}:</span>{' '}
                        {r.kind === 'free_item' && stampTotalForDisplay != null ? (
                          <>
                            <b className="text-emerald-800">{stampTotalForDisplay}</b> stamp{stampTotalForDisplay === 1 ? '' : 's'}
                            {' → '}
                            <b className="text-emerald-800">{redeemableCount}</b> free item{redeemableCount === 1 ? '' : 's'}
                          </>
                        ) : r.kind === 'discount' && pointBreakdown ? (
                          <>
                            <b className="text-blue-800">{pointBreakdown.total}</b> pt{pointBreakdown.total === 1 ? '' : 's'}
                            {' → '}
                            <b className="text-blue-800">{redeemableCount}</b>
                            {' × $' + pointBreakdown.redeemDiscount.toFixed(2)} off
                            <span className="text-gray-500"> ({pointBreakdown.remain} pt{pointBreakdown.remain === 1 ? '' : 's'} remain)</span>
                          </>
                        ) : (
                          r.label
                        )}
                        {/* $ deduction — POINT uses the BE-declared
                            amount; STAMP uses the per-toggle delta
                            (only visible once applied). */}
                        {(r.kind === 'discount' && r.discountAmount != null) && (
                          <span className="text-rose-700 font-medium"> · −${Number(r.discountAmount).toFixed(2)}</span>
                        )}
                        {(r.kind === 'free_item' && appliedDelta != null) && (
                          <span className="text-rose-700 font-medium"> · −${appliedDelta.toFixed(2)}</span>
                        )}
                      </span>
                      {isApplied ? (
                        <button
                          type="button"
                          onClick={() => toggleReward(programId, programName, programType, r, redeemableCount)}
                          className="text-[10px] px-2 py-0.5 rounded border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1"
                        >
                          Applied — Reset
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleReward(programId, programName, programType, r, redeemableCount)}
                          className="text-[10px] px-2 py-0.5 rounded border border-purple-300 bg-white text-purple-800 hover:bg-purple-100"
                        >
                          Use this time
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="rounded-md bg-gray-50 p-3 space-y-2 text-sm">
            {/* v-pos-cart-slim — the cart's Subtotal / Discount / Tax
                / Notes block now lives here. Discount, Tax, Notes are
                editable in the same layout the cart panel used to
                show, so cashiers trained on the old placement don't
                have to relearn anything. Display toggles from POS
                Settings still gate each row. */}
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="tabular-nums">${subtotal.toFixed(2)}</span>
            </div>

            {/* v-loyalty-redeem-at-checkout — the Discount row
                stays visible when a loyalty reward is applied so
                the cashier sees exactly what's coming off the
                cart. A small "Reward" chip beside the input
                signals that the amount was populated by the
                loyalty panel (as opposed to the cashier keying a
                manual discount). The duplicate "Discount amount"
                readout below is suppressed while a reward is on
                — the Loyalty panel + this row together already
                convey both source and total. */}
            {showDiscount && (
              <div className="flex items-center gap-2">
                <span className="text-gray-600 flex-1 inline-flex items-center gap-1.5">
                  Discount
                  {applied.size > 0 && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border border-purple-300 bg-purple-50 text-purple-800">
                      <Gift className="h-2.5 w-2.5" /> Reward
                    </span>
                  )}
                </span>
                <Select value={discountType} onValueChange={v => onDiscountTypeChange(v as 'amount' | 'percent')}>
                  <SelectTrigger className="h-7 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">$</SelectItem>
                    <SelectItem value="percent">%</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={discountValue}
                  onChange={e => onDiscountValueChange(parseFloat(e.target.value) || 0)}
                  className="h-7 w-20 text-right"
                />
              </div>
            )}

            {showTax && (
              <div className="flex items-center gap-2">
                <span className="text-gray-600 flex-1">Tax</span>
                <Select value={taxType ?? '__none'} onValueChange={v => onTaxTypeChange(v === '__none' ? null : v)}>
                  <SelectTrigger className="h-7 w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No tax</SelectItem>
                    <SelectItem value="1">VAT 10%</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-gray-500 w-20 text-right tabular-nums">${taxAmount.toFixed(2)}</span>
              </div>
            )}

            {showNotes && (
              <div className="space-y-1">
                <span className="text-gray-600 text-xs">Notes</span>
                <Input
                  value={notes}
                  onChange={e => onNotesChange(e.target.value)}
                  placeholder="Order note (optional)"
                  className="h-7 text-sm"
                />
              </div>
            )}

            <div className="flex justify-between border-t pt-1.5">
              <span className="text-gray-600">Total</span>
              <span className="font-semibold">${total.toFixed(2)}</span>
            </div>
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
            onClick={async () => {
              // v-loyalty-redeem-at-checkout — order matters:
              //  1) onSubmit runs the checkout, which fires the earn
              //     hook server-side. For "projected balance" cases
              //     (customer arrives with 4 stamps, buys 2 more →
              //     card completes with THIS sale), the balance is
              //     only ≥ target AFTER earn runs.
              //  2) Once checkout succeeded, burn the applied
              //     rewards from the freshly-elevated balance. Any
              //     failure here is a soft error — the customer
              //     already paid the discounted total, so we just
              //     toast and let admin reconcile via ADJUST.
              const ok = await onSubmit(method, method === 'cash' ? received : total);
              if (!ok) return;
              await commitLoyalty();
            }}
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
                    <div className="tabular-nums text-sm">{o.queueNo}</div>
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
 *  Active-orders drawer (paid → fulfillment pipeline)  V165
 *
 *  Lists every paid order still moving through the kitchen flow:
 *    requested → accepted → in_progress → ready → done
 *  Done rows drop off the list. Each card shows the queue no, customer,
 *  total and the current status as a coloured pill, plus an Advance
 *  button (forward) and a small Back link (corrects fat-finger jumps).
 * =================================================================== */

interface ActiveDrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orders: PosOrder[];
  onAdvance: (id: string, next: posApi.PosFulfillmentStatus) => void;
}

/** Pill colour per status. Greys for the early "waiting" states,
 *  greens once cooking is underway / done — readable at a glance from
 *  across a counter. */
const FULFILLMENT_PILL: Record<posApi.PosFulfillmentStatus, string> = {
  requested:   'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  accepted:    'bg-blue-100 text-blue-800 ring-1 ring-blue-200',
  in_progress: 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200',
  ready:       'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
  done:        'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
};

function PosActiveOrdersDrawer({ open, onOpenChange, orders, onAdvance }: ActiveDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Active Orders
          </DialogTitle>
          <DialogDescription>
            Paid orders moving through the kitchen — tap an order to advance its status.
          </DialogDescription>
        </DialogHeader>
        {orders.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No active orders.</p>
        ) : (
          <ul className="divide-y border rounded-md max-h-[480px] overflow-auto">
            {orders.map(o => {
              const idx = posApi.POS_FULFILLMENT_CHAIN.indexOf(o.fulfillmentStatus);
              const next = posApi.POS_FULFILLMENT_CHAIN[idx + 1] ?? null;
              const prev = idx > 0 ? posApi.POS_FULFILLMENT_CHAIN[idx - 1] : null;
              return (
                <li key={o.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums text-sm font-semibold">{o.queueNo}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${FULFILLMENT_PILL[o.fulfillmentStatus]}`}>
                          {posApi.POS_FULFILLMENT_LABELS[o.fulfillmentStatus]}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {o.customerName ?? 'Walk-in'} · {o.items.length} item(s)
                      </div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums shrink-0">${o.total.toFixed(2)}</div>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    {prev && (
                      <button
                        type="button"
                        onClick={() => onAdvance(o.id, prev)}
                        className="text-[11px] text-gray-500 hover:text-gray-800 inline-flex items-center gap-1"
                        title={`Back to ${posApi.POS_FULFILLMENT_LABELS[prev]}`}
                      >
                        <RotateCcw className="h-3 w-3" /> Back
                      </button>
                    )}
                    <div className="flex-1" />
                    {next ? (
                      <Button
                        size="sm"
                        onClick={() => onAdvance(o.id, next)}
                        className={next === 'done'
                          ? 'h-7 bg-gray-700 hover:bg-gray-800 text-xs'
                          : 'h-7 bg-emerald-600 hover:bg-emerald-700 text-xs'}
                      >
                        {posApi.POS_FULFILLMENT_LABELS[next]}
                        <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    ) : (
                      <span className="text-[11px] text-gray-400">Completed</span>
                    )}
                  </div>
                </li>
              );
            })}
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
  /** Tenant profile — used to render address + phone under the shop
   *  name on the receipt. Null when the fetch failed / isn't loaded
   *  yet; the receipt drops those lines silently. */
  companyInfo: companyApi.CompanyInfo | null;
  onClose: () => void;
}

function PosReceiptDialog({ order, settings, items, companyInfo, onClose }: ReceiptDialogProps) {
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
      if (!ok) toast.error('Could not open the print dialog.');
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-center">Payment received</DialogTitle>
          <DialogDescription className="sr-only">Receipt summary for the completed POS sale.</DialogDescription>
        </DialogHeader>

        <PosReceiptBody order={order} settings={settings} items={items}
                        shopName={shopName}
                        companyInfo={companyInfo}
                        datePart={datePart} timePart={timePart} />

        <DialogFooter>
          <Button variant="outline" onClick={() => {
            const ok = printPosReceipt({ order, settings, items });
            if (!ok) toast.error('Could not open the print dialog.');
          }}>
            <Printer className="h-4 w-4 mr-1.5" /> Print
          </Button>
          <Button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-700">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Receipt body styled to match the sample design — centered "Receipt"
 *  header + logo + shop name, big red total, customer block, item
 *  table with "Item / Amount" header, totals with bold Total Due,
 *  date + tilted PAID stamp, friendly "Thank you!" footer. Identical
 *  shape used for both the in-dialog preview and the print window
 *  (innerHTML copy). */
function PosReceiptBody({
  order, settings, items, shopName, companyInfo, datePart, timePart,
}: {
  order: PosOrder;
  settings: settingsApi.AccountingSettings;
  items: itemsApi.Item[];
  shopName: string;
  /** Tenant profile — address + phone go under the shop name so the
   *  printed receipt carries the same contact block that appears on
   *  the invoice PDF. Optional; the rows drop when unset. */
  companyInfo: companyApi.CompanyInfo | null;
  datePart: string;
  timePart: string;
}) {
  const methodLabel = (order.paymentMethod ?? 'cash').toUpperCase();
  const received = order.paymentReceived ?? order.total;
  const change   = order.paymentChange ?? 0;
  const logoUrl  = (settings.posLogoUrl ?? '').trim() || null;
  const customerName = order.customerName || 'Walk-in';
  const receiptNo = `PO-${String(order.queueSeq).padStart(3, '0')}`;
  const cashierParts = [order.createdByName, order.createdByPhone].filter(Boolean).join(' · ');

  return (
    <div id="pos-receipt" className="tabular-nums text-sm leading-relaxed bg-white px-6 py-5 border rounded-md w-full">
      {/* Header — small "Receipt" label + logo + shop name */}
      <div className="text-center text-base font-semibold text-gray-800">Receipt</div>
      {logoUrl && (
        <div className="text-center mt-2 mb-1">
          <img src={logoUrl} alt="" className="inline-block max-h-[72px] max-w-full object-contain" />
        </div>
      )}
      <div className="text-center text-lg font-bold mt-1">{shopName}</div>
      {/* Tenant contact block — hidden per row when the field is
          blank so a lean profile still gets a clean receipt. */}
      {(companyInfo?.address ?? '').trim() && (
        <div className="text-center text-xs text-gray-600 mt-1 whitespace-pre-line leading-snug max-w-xs mx-auto">
          {companyInfo!.address}
        </div>
      )}
      {(companyInfo?.phone ?? '').trim() && (
        <div className="text-center text-xs text-gray-600 mt-0.5 tabular-nums">
          {companyInfo!.phone}
        </div>
      )}
      {cashierParts && (
        <div className="text-center text-xs text-gray-500 mt-1">Cashier: {cashierParts}</div>
      )}

      <div className="border-t my-4" />

      {/* Big red total — anchors the slip; matches the sample's
          "amount due" headline. */}
      <div className="text-red-600 text-4xl font-bold tabular-nums">${order.total.toFixed(2)}</div>
      <div className="text-xs text-gray-600 mt-1">Date {datePart} · {timePart}</div>

      {/* Customer block — labels left, values right. */}
      <div className="space-y-1.5 text-sm mt-4">
        <div className="flex justify-between gap-2">
          <span className="text-gray-500">Customer</span>
          <span className="font-medium truncate">{customerName}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-500">Receipt No.</span>
          <span className="font-medium">{receiptNo}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-500">Date</span>
          <span className="font-medium">{datePart}</span>
        </div>
      </div>

      <div className="border-t my-4" />

      {/* Item table — bold "Item / Amount" header with its own
          divider, then rows with the description sub-line in
          smaller grey text below. */}
      <div className="flex justify-between font-semibold text-sm">
        <span>Item</span>
        <span>Amount</span>
      </div>
      <div className="border-t border-gray-800 mt-1 mb-2" />

      {order.items.map((i, idx) => {
        const sku = lineSku(i, items);
        const label = settings.posShowSku && sku ? `${sku}  ${i.name}` : i.name;
        return (
          <div key={i.id ?? idx} className="mb-2.5">
            <div className="flex justify-between gap-2 text-sm">
              <span className="truncate pr-2 flex-1">{label}</span>
              <span className="shrink-0 tabular-nums">${i.lineTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-2 text-xs text-gray-500">
              <span className="truncate pr-2 flex-1 italic">{i.notes || ''}</span>
              <span className="shrink-0">
                {i.quantity}{i.quantity > 1 ? ` × items` : ` × item`}
              </span>
            </div>
          </div>
        );
      })}

      <div className="border-t my-4" />

      {/* Totals block. Subtotal only when it differs from total (no
          tax / no discount), then a bold "Total Due" line and the
          Paid Amount underneath. */}
      {(order.subtotal !== order.total) && (
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Subtotal</span>
          <span className="tabular-nums">${order.subtotal.toFixed(2)}</span>
        </div>
      )}
      {order.discountValue > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Discount</span>
          <span className="tabular-nums">−${order.discountValue.toFixed(2)}</span>
        </div>
      )}
      {order.taxAmount > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Tax{order.invoiceKind === 'tax' ? ' (VAT 10%)' : ''}</span>
          <span className="tabular-nums">${order.taxAmount.toFixed(2)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-lg mt-1.5">
        <span>Total Due</span>
        <span className="tabular-nums">${order.total.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-sm mt-1">
        <span className="text-gray-600">Paid Amount</span>
        <span className="tabular-nums">${received.toFixed(2)}</span>
      </div>
      {change > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Change</span>
          <span className="tabular-nums">${change.toFixed(2)}</span>
        </div>
      )}
      {order.currency === 'USD' && (order.exchangeRate ?? 0) > 0 && (
        <div className="flex justify-between text-sm mt-1">
          <span className="text-gray-600">Total KHR (@ {(order.exchangeRate ?? 0).toLocaleString('en-US')})</span>
          <span className="tabular-nums">៛ {(order.total * (order.exchangeRate ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
        </div>
      )}
      <div className="flex justify-between text-xs text-gray-500 mt-1.5">
        <span>Method</span>
        <span>{methodLabel}</span>
      </div>

      {/* Date on left, tilted PAID stamp on right — matches the
          sample's red stamp in the bottom-right corner. */}
      <div className="flex items-center justify-between mt-6 min-h-[48px]">
        <span className="text-red-600 text-sm font-medium">{datePart}</span>
        {settings.posShowPaidStamp && (
          <span className="inline-block border-2 border-red-500 px-4 py-1 font-bold tracking-widest text-red-600 -rotate-6 text-base">
            PAID
          </span>
        )}
      </div>

      <div className="text-center text-gray-700 text-sm mt-4">Thank you!</div>
      {settings.posShowQueueNo && (
        <div className="text-center text-gray-400 text-xs mt-1">
          #{String(order.queueSeq).padStart(3, '0')}
        </div>
      )}
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

/**
 * v-loyalty-mvp — customer panel below the cart. Shows each active
 * program's balance (points / stamps) and any redeemable rewards.
 * Cashier clicks "Apply" on a reward to redeem — the discount
 * amount is patched into the cart's discount slot so Total updates
 * before payment. Silent when there's no picked customer OR no
 * balance yet (walk-in customers never see this block).
 */
function LoyaltyPanel({
  state, onApplyReward,
}: {
  state: CustomerLoyaltyState | null;
  onApplyReward: (programId: string, discountAmount: number) => void;
}) {
  if (!state) return null;
  const anyBalance = state.programs.some(p =>
    p.currentPoint > 0 || p.currentStamp > 0 || p.rewards.length > 0
  );
  if (!anyBalance) return null;
  return (
    <div className="border-t bg-purple-50/50 px-3 py-2 space-y-1.5 shrink-0">
      <div className="text-[11px] font-semibold text-purple-800 inline-flex items-center gap-1">
        <Gift className="h-3 w-3" /> Loyalty
      </div>
      {state.programs.map(p => {
        const isStamp = p.programType === 'STAMP';
        return (
          <div key={p.programId} className="flex items-center gap-2 text-[11px]">
            {isStamp
              ? <StampIcon className="h-3 w-3 text-emerald-600" />
              : <Star className="h-3 w-3 text-blue-600" />}
            <span className="flex-1 truncate">
              <span className="font-medium">{p.programName}:</span>{' '}
              {isStamp
                ? <>{p.currentStamp}{p.stampTarget ? ` / ${p.stampTarget}` : ''} stamps</>
                : <>{p.currentPoint} pts</>}
            </span>
            {p.rewards.map((r, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() =>
                  r.kind === 'discount' && r.discountAmount != null
                    ? onApplyReward(p.programId, Number(r.discountAmount))
                    : undefined
                }
                disabled={r.kind !== 'discount'}
                className="text-[10px] px-1.5 py-0.5 rounded border border-purple-300 bg-white text-purple-800 hover:bg-purple-100 disabled:opacity-60 disabled:cursor-not-allowed"
                title={r.label}
              >
                {r.kind === 'discount' ? `Apply ${r.label}` : r.label}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

