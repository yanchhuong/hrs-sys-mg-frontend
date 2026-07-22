import { useEffect, useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Package } from 'lucide-react';
import * as itemsApi from '../../api/items';
import * as warehousesApi from '../../api/warehouses';

/**
 * Warehouse lookup cached at module scope so every StockItemPicker
 * instance on a form (one per line) shares a single fetch — a busy
 * invoice with 10 lines doesn't fan out 10 GETs. The promise is
 * memoised, so concurrent callers on the very first render still
 * dedupe. Legitimately null when the feature is off or the fetch
 * fails — the picker just falls back to the plain name row. */
let warehousesCache: Promise<warehousesApi.Warehouse[]> | null = null;
function loadWarehouses(): Promise<warehousesApi.Warehouse[]> {
  if (!warehousesCache) {
    warehousesCache = warehousesApi.list().catch(() => [] as warehousesApi.Warehouse[]);
  }
  return warehousesCache;
}

interface Props {
  /** In-memory catalog the form is holding. Parent lazy-loads it via
   *  {@link onOpen} the first time the popover opens to keep the
   *  dialog mount path light. */
  catalog: itemsApi.Item[];
  /** True once the catalog fetch has completed at least once.
   *  Drives the "Loading…" placeholder vs the "No matches" state
   *  so a real empty list never reads as "still loading". */
  loaded: boolean;
  /** Called whenever the popover opens. Parent typically fires its
   *  one-shot fetch from here (guarded by `loaded`). */
  onOpen: () => void;
  /** The currently selected stock item ID for this line, if any.
   *  Drives the icon tint (blue = linked, grey = ad-hoc / typed). */
  selectedId: string;
  /** Invoked with the picked catalog row. Parent fills the line's
   *  name / unit / unit price + records the stockItemId for the
   *  server-side stock decrement on save. */
  onPick: (it: itemsApi.Item) => void;
}

/**
 * Per-line stock-catalog picker. Used by Invoices, Quotations, and
 * General Vouchers — same UX, same FK on save. The package-icon
 * button sits to the left of the free-form Item name input; clicking
 * it opens a fuzzy-search popover over the tenant's active items.
 *
 * <p>Free-text typing in the adjacent Item input still works for
 * ad-hoc lines — picking a catalog row just pre-fills name + unit +
 * unitPrice and records the FK so the server can decrement stock
 * (Invoices) or wire the link in reports (Quotations / Vouchers).</p>
 */
export function StockItemPicker({ catalog, loaded, onOpen, selectedId, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [warehouses, setWarehouses] = useState<warehousesApi.Warehouse[]>([]);

  // Fetch once when the popover first opens — no wasted request when
  // the operator never uses the picker. Uses the module-level cache so
  // multiple pickers on a form (one per invoice line) share the fetch.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadWarehouses().then(list => { if (!cancelled) setWarehouses(list); });
    return () => { cancelled = true; };
  }, [open]);

  // Map id → name for O(1) lookup on each row. Only surfaced when the
  // catalog actually has warehouse assignments (the feature-on signal)
  // so tenants without warehouses see no visual change.
  const warehouseName = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of warehouses) m.set(w.id, w.name);
    return m;
  }, [warehouses]);
  const showWarehouses = warehouseName.size > 0
    && catalog.some(c => c.warehouseId);

  // Filter to active + in-stock items. Disabled items are hidden
  // (operator hides them when they stop selling a SKU but want to
  // keep the history). Out-of-stock deduction items are also hidden
  // so an operator can't cut an invoice for a SKU the warehouse
  // can't ship — matches the POS grid's disabled-tile rule.
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const inStock = catalog.filter(c =>
      c.active
      && !(c.deductionEnabled === true && (c.stockQty ?? 0) <= 0),
    );
    if (!term) return inStock;
    return inStock.filter(c =>
      c.name.toLowerCase().includes(term)
      || (c.sku ?? '').toLowerCase().includes(term),
    );
  }, [catalog, q]);

  return (
    <Popover
      open={open}
      onOpenChange={v => { setOpen(v); if (v) onOpen(); }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`h-8 w-8 shrink-0 ${selectedId ? 'text-blue-600' : 'text-gray-400'}`}
          title="Pick from catalog"
          aria-label="Pick item from stock catalog"
        >
          <Package className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-2 border-b">
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search items…"
            className="h-8 text-sm"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {!loaded ? (
            <div className="p-3 text-xs text-gray-500 text-center">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-3 text-xs text-gray-500 text-center">
              {catalog.length === 0
                ? <>No items yet — add some on the <strong>Stock</strong> page.</>
                : 'No matches'}
            </div>
          ) : (
            filtered.map(c => {
              // Warehouse suffix highlighted with a coloured pill so the
              // operator can distinguish "Americano · Warehouse A" from
              // "Americano · Warehouse B" at a glance. Only rendered when
              // the tenant has the warehouse feature on (detected via
              // showWarehouses); otherwise the row stays as before.
              const wh = c.warehouseId ? warehouseName.get(c.warehouseId) : null;
              return (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 border-b last:border-b-0"
                  onClick={() => { onPick(c); setOpen(false); setQ(''); }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{c.name}</span>
                      {showWarehouses && wh && (
                        <span className="shrink-0 inline-flex items-center rounded bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          {wh}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-gray-500 tabular-nums shrink-0">
                      {Number(c.unitPrice ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                    <span className="tabular-nums truncate">{c.sku || '—'}</span>
                    <span>{Number(c.stockQty ?? 0).toLocaleString('en-US')} {c.unit || ''}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
