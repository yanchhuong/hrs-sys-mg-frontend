import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Package } from 'lucide-react';
import * as itemsApi from '../../api/items';

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
            filtered.map(c => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 border-b last:border-b-0"
                onClick={() => { onPick(c); setOpen(false); setQ(''); }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{c.name}</span>
                  <span className="text-[11px] text-gray-500 tabular-nums shrink-0">
                    {Number(c.unitPrice ?? 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                  <span className="tabular-nums truncate">{c.sku || '—'}</span>
                  <span>{Number(c.stockQty ?? 0).toLocaleString('en-US')} {c.unit || ''}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
