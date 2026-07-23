import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '../ui/tooltip';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import * as itemsApi from '../../api/items';
import * as warehousesApi from '../../api/warehouses';
import { Plus, Pencil, Trash2, Search, RefreshCw, Info, PackagePlus, Settings, Warehouse as WarehouseIcon, Upload, ImageIcon, FileSpreadsheet } from 'lucide-react';
import { exportListToExcel } from '../../utils/excelExport';
import { BulkUploadItemsDialog } from '../common/BulkUploadItemsDialog';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { StockItemUsageSettingsDialog } from '../common/StockItemUsageSettingsDialog';
import { MultiImageDropZone } from '../common/MultiImageDropZone';

interface FormState {
  sku: string;
  name: string;
  description: string;
  unit: string;
  unitPrice: string;
  unitCost: string;
  stockQty: string;
  active: boolean;
  /** V121 — when true, picking this item on an invoice decrements
   *  stock and refuses to save when qty > on-hand. */
  deductionEnabled: boolean;
  /** Full ordered image list (V265) — up to 5 entries. First entry
   *  is the cover surfaced on the POS / shop card. */
  imageUrls: string[];
  /** POS category (V142). */
  category: itemsApi.ItemCategory;
  /** Per-item modifier groups (V142). Empty array = no modifiers,
   *  serialised to NULL on save. */
  modifierGroups: itemsApi.ModifierGroup[];
  /** Optional warehouse FK (V149). Empty string = unassigned. */
  warehouseId: string;
  /** Free-text Stock category (V151). */
  itemCategory: string;
  /** Reorder threshold (V151). */
  minStock: string;
}

const EMPTY_FORM: FormState = {
  sku: '',
  name: '',
  description: '',
  unit: '',
  unitPrice: '0',
  unitCost: '0',
  stockQty: '0',
  active: true,
  deductionEnabled: false,
  imageUrls: [],
  category: 'other',
  modifierGroups: [],
  warehouseId: '',
  itemCategory: '',
  minStock: '0',
};

/** Two prefilled modifier groups the cashier sets up most often on
 *  a Drink — Size with S/M/L (price-adjustable) and Sugar Level. The
 *  "+ Add common Drink modifiers" button drops these in so the
 *  operator doesn't have to type them by hand every time. */
const DRINK_DEFAULT_MODIFIERS: itemsApi.ModifierGroup[] = [
  {
    name: 'Size', required: true,
    options: [
      { label: 'S', priceAdj: 0 },
      { label: 'M', priceAdj: 0.5 },
      { label: 'L', priceAdj: 1.0 },
    ],
  },
  {
    name: 'Sugar Level', required: false,
    options: [
      { label: '0%',   priceAdj: 0 },
      { label: '25%',  priceAdj: 0 },
      { label: '50%',  priceAdj: 0 },
      { label: '75%',  priceAdj: 0 },
      { label: '100%', priceAdj: 0 },
    ],
  },
];

interface StockInState {
  item: itemsApi.Item;
  qty: string;
  unitCost: string;
}

/**
 * Stock → Items page. Catalog of sellable / purchasable items with
 * per-item price, cost, unit, and on-hand quantity. Phase 2 adds the
 * "Receive Stock" per-row action that bumps the on-hand balance.
 * Permissions are gated on the {@code stock} module key (V80 +
 * promoted to top-level in V118).
 */
export function Items() {
  const { t } = useI18n();
  const { canCreate, canUpdate, canDelete } = useAuth();
  const canAdd = canCreate('stock');
  const canEdit = canUpdate('stock');
  const canRemove = canDelete('stock');
  // Stock-in shares the update gate — receiving stock is a state
  // change on an existing row, not a fresh row.
  const canReceive = canEdit;

  const [rows, setRows] = useState<itemsApi.Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  // V149 — warehouse feature. The gate comes from the same per-tenant
  // usage settings row the picker toggles live on, so flipping it in
  // the settings dialog updates the gate here on the parent's onSaved
  // callback (no second fetch).
  const [warehouseFeatureOn, setWarehouseFeatureOn] = useState(false);
  const [warehouses, setWarehouses] = useState<warehousesApi.Warehouse[]>([]);
  // Filter applied to the list query when the feature is on. Empty
  // string = "All" (no warehouse filter).
  const [warehouseFilter, setWarehouseFilter] = useState<string>('');
  // v-items-filter-strip — client-side filters. Category is free-text
  // (V269) so we derive the option list from the actual items on the
  // page. Stock IN/OUT toggles the deductionEnabled flag. Price + stock
  // are dual-handle range sliders — null = "user hasn't touched it yet"
  // and we fall through to the full min/max derived from the rows.
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [stockIoFilter, setStockIoFilter] = useState<'' | 'on' | 'off'>('');
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [stockRange, setStockRange] = useState<[number, number] | null>(null);

  const [editing, setEditing] = useState<itemsApi.Item | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Usage-settings dialog (V120) — controls which sale/purchase
  // document forms surface the StockItemPicker.
  const [usageSettingsOpen, setUsageSettingsOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<itemsApi.Item | null>(null);

  const [stockIn, setStockIn] = useState<StockInState | null>(null);
  const [receiving, setReceiving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await itemsApi.list({
        q: search.trim() || undefined,
        warehouseId: warehouseFilter || undefined,
        size: 200,
      });
      setRows(res.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  /** Fetch the warehouse gate + warehouses list on mount and after a
   *  settings save. Soft-fails on 403 (e.g. an Items-only user without
   *  stock.view on warehouses) so the table itself stays usable. */
  const loadWarehouseContext = async () => {
    try {
      const usage = await itemsApi.getUsageSettings();
      setWarehouseFeatureOn(usage.enabledForWarehouse);
      if (usage.enabledForWarehouse) {
        try {
          setWarehouses(await warehousesApi.list());
        } catch {
          setWarehouses([]);
        }
      } else {
        // Clear the filter so a stale state from a previously-on
        // tenant doesn't poison the next list call.
        setWarehouseFilter('');
      }
    } catch {
      // Defaults already cover the no-row case; ignore.
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [warehouseFilter]);
  useEffect(() => { void loadWarehouseContext(); }, []);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void load();
  };

  // Range bounds — derived from the loaded rows so a tenant with $2
  // items and one $2000 outlier sees a sensible full-width slider.
  // Ceil / floor by 1 so bounds always land on whole units.
  const priceBounds = useMemo<[number, number]>(() => {
    const prices = rows.map(r => r.unitPrice ?? 0);
    const hi = prices.length ? Math.ceil(Math.max(...prices)) : 100;
    return [0, Math.max(hi, 1)];
  }, [rows]);
  const stockBounds = useMemo<[number, number]>(() => {
    const qtys = rows.map(r => r.stockQty ?? 0);
    const lo = qtys.length ? Math.floor(Math.min(0, ...qtys)) : 0;
    const hi = qtys.length ? Math.ceil(Math.max(0, ...qtys)) : 100;
    return [lo, Math.max(hi, lo + 1)];
  }, [rows]);

  // Effective values — the slider ALWAYS renders with a value, but
  // "not yet touched" means we don't filter on it. When touched the
  // stored range is the source of truth (clamped to current bounds if
  // the row set shifts).
  const effPrice: [number, number] = priceRange ?? priceBounds;
  const effStock: [number, number] = stockRange ?? stockBounds;

  const filtered = useMemo(() => {
    const cat = categoryFilter.trim().toLowerCase();
    return rows.filter(r => {
      if (cat && ((r.category ?? '') as string).toLowerCase() !== cat) return false;
      if (stockIoFilter === 'on'  && !r.deductionEnabled) return false;
      if (stockIoFilter === 'off' &&  r.deductionEnabled) return false;
      if (priceRange) {
        const price = r.unitPrice ?? 0;
        if (price < priceRange[0] || price > priceRange[1]) return false;
      }
      if (stockRange) {
        const stk = r.stockQty ?? 0;
        if (stk < stockRange[0] || stk > stockRange[1]) return false;
      }
      return true;
    });
  }, [rows, categoryFilter, stockIoFilter, priceRange, stockRange]);

  // Distinct category options for the dropdown — derived from the
  // items currently on the page so a tenant's custom labels (e.g.
  // "Pin", "Ceramic") show up automatically. "Other" always pinned
  // to the tail so the catch-all bucket sits after every named
  // category, matching the POS chip ordering.
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const c = (r.category ?? '').toString().trim().toLowerCase();
      if (c) set.add(c);
    }
    const all = Array.from(set).sort();
    const hasOther = all.includes('other');
    const named = all.filter(c => c !== 'other');
    return hasOther ? [...named, 'other'] : named;
  }, [rows]);

  const filtersActive =
    !!categoryFilter || !!stockIoFilter || priceRange != null || stockRange != null;
  const clearFilters = () => {
    setCategoryFilter('');
    setStockIoFilter('');
    setPriceRange(null);
    setStockRange(null);
  };
  const pagination = usePagination(filtered, 25);

  /** id → display label, so the table cell renders the warehouse name
   *  (and short code, if set) without a per-row lookup pass. */
  const warehouseLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of warehouses) {
      m.set(w.id, w.code ? `${w.code} — ${w.name}` : w.name);
    }
    return m;
  }, [warehouses]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (it: itemsApi.Item) => {
    setEditing(it);
    setForm({
      sku: it.sku ?? '',
      name: it.name,
      description: it.description ?? '',
      unit: it.unit ?? '',
      unitPrice: String(it.unitPrice ?? 0),
      unitCost: String(it.unitCost ?? 0),
      stockQty: String(it.stockQty ?? 0),
      active: it.active,
      deductionEnabled: it.deductionEnabled,
      imageUrls: itemsApi.resolveImages(it),
      category: it.category ?? 'other',
      modifierGroups: itemsApi.parseModifiers(it.modifiers)?.groups ?? [],
      warehouseId: it.warehouseId ?? '',
      itemCategory: it.itemCategory ?? '',
      minStock: String(it.minStock ?? 0),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const name = form.name.trim();
    if (!name) { toast.error('Name is required'); return; }
    const unitPrice = Number(form.unitPrice);
    const unitCost = Number(form.unitCost);
    const stockQty = Number(form.stockQty);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) { toast.error('Unit price must be 0 or more'); return; }
    if (!Number.isFinite(unitCost)  || unitCost  < 0) { toast.error('Unit cost must be 0 or more'); return; }
    if (!Number.isFinite(stockQty)) { toast.error('Stock quantity must be a number'); return; }

    setSaving(true);
    try {
      const payload: itemsApi.ItemRequest = {
        sku: form.sku.trim() || undefined,
        name,
        description: form.description.trim() || undefined,
        unit: form.unit.trim() || undefined,
        unitPrice,
        unitCost,
        stockQty,
        active: form.active,
        deductionEnabled: form.deductionEnabled,
        // V265 — send the full ordered list; the BE derives imageUrl
        // from imageUrls[0] so legacy readers keep working. An empty
        // array clears every image.
        imageUrls: form.imageUrls,
        category: form.category,
        // Serialise the typed groups back to a JSON string. Empty
        // groups → '' so the server NULLs the column.
        modifiers: itemsApi.serializeModifiers({ groups: form.modifierGroups }) ?? '',
        // null = unassigned (server clears the FK); a UUID sets it.
        // Always include the field so a "Choose…" → "(none)" edit
        // round-trips correctly.
        warehouseId: form.warehouseId || null,
        itemCategory: form.itemCategory.trim(),
        minStock: Number(form.minStock) || 0,
      };
      if (editing) await itemsApi.update(editing.id, payload);
      else         await itemsApi.create(payload);
      toast.success(editing ? 'Item updated' : 'Item created');
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await itemsApi.remove(deleteTarget.id);
      toast.success(`Removed ${deleteTarget.name}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const openStockIn = (it: itemsApi.Item) => {
    setStockIn({ item: it, qty: '', unitCost: String(it.unitCost ?? 0) });
  };

  const confirmStockIn = async () => {
    if (!stockIn) return;
    const qty = Number(stockIn.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Quantity must be positive');
      return;
    }
    const cost = stockIn.unitCost.trim() === '' ? undefined : Number(stockIn.unitCost);
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) {
      toast.error('Unit cost must be 0 or more');
      return;
    }
    setReceiving(true);
    try {
      await itemsApi.stockIn(stockIn.item.id, { qty, unitCost: cost });
      toast.success(`Received ${qty} × ${stockIn.item.name}`);
      setStockIn(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Stock-in failed');
    } finally {
      setReceiving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            {t('nav.items') || 'Items'}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                    aria-label="What are items?"
                  >
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Catalog of sellable / purchasable items. Each row carries
                  a unit price, unit cost, and on-hand stock quantity. Invoices
                  decrement the balance on save; the Receive Stock button bumps
                  it back up.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {/* Settings gear — only admins/managers who can mutate the
              catalog should be able to flip the per-doc-type picker
              gate. Position matches Customers / Employees: between
              Refresh and the primary Add action. */}
          {canEdit && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setUsageSettingsOpen(true)}
              title="Item usage settings"
              aria-label="Item usage settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => exportListToExcel({
              filename: 'Items',
              sheetName: 'Items',
              columns: [
                { header: 'SKU',            value: it => it.sku ?? '',                                     width: 14 },
                { header: 'Name',           value: it => it.name,                                          width: 32 },
                { header: 'Description',    value: it => it.description ?? '',                            width: 40 },
                { header: 'Category',       value: it => it.itemCategory ?? it.category ?? '',            width: 16 },
                { header: 'Unit',           value: it => it.unit ?? '',                                   width: 10 },
                { header: 'Cost Price',     value: it => Number(it.unitCost ?? 0),                        width: 12 },
                { header: 'Selling Price',  value: it => Number(it.unitPrice ?? 0),                       width: 12 },
                { header: 'Current Stock',  value: it => Number(it.stockQty ?? 0),                        width: 12 },
                { header: 'Min Stock',      value: it => Number(it.minStock ?? 0),                        width: 10 },
                { header: 'Warehouse',      value: it => it.warehouseId
                                                        ? (warehouseLabelById.get(it.warehouseId) ?? '')
                                                        : '',                                             width: 18 },
                { header: 'Stock IN/OUT',   value: it => it.deductionEnabled ? 'Yes' : 'No',              width: 12 },
                { header: 'Active',         value: it => it.active ? 'Yes' : 'No',                        width: 10 },
                { header: 'Image URL',      value: it => it.imageUrl ?? '',                              width: 40 },
              ],
              rows: filtered,
            })}
            disabled={filtered.length === 0}
            size="icon"
            title="Download the current item list as an Excel workbook"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          </Button>
          {canAdd && (
            <Button
              variant="outline"
              onClick={() => setBulkUploadOpen(true)}
              title="Bulk upload items from an Excel workbook"
            >
              <Upload className="h-4 w-4 mr-1.5" /> Bulk Upload
            </Button>
          )}
          {canAdd && (
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Item
            </Button>
          )}
        </div>
      </div>

      {/* Bulk upload from Excel — same pattern as Invoice/Bill. Feeds
          the parser the current catalog for client-side SKU-collision
          detection, then reloads on any successful import. */}
      <BulkUploadItemsDialog
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        existingItems={rows}
        onImported={() => { void load(); }}
      />

      <StockItemUsageSettingsDialog
        open={usageSettingsOpen}
        onOpenChange={setUsageSettingsOpen}
        onSaved={next => {
          // Mirror the saved warehouse flag immediately so flipping
          // it in the dialog updates the filter + column + picker
          // on the parent page without a refresh. Refetch the
          // warehouses list too because the operator may have just
          // created some.
          setWarehouseFeatureOn(next.enabledForWarehouse);
          if (next.enabledForWarehouse) {
            warehousesApi.list().then(setWarehouses).catch(() => {/* soft */});
          } else {
            setWarehouseFilter('');
          }
        }}
      />

      <Card>
        {/* One-row header: client-side filters on the LEFT, server-side
            search form on the RIGHT. Both wrap gracefully on narrow
            displays so nothing gets cut off. */}
        <CardHeader className="flex flex-row flex-wrap items-end gap-x-6 gap-y-3 justify-between space-y-0">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            {rows.length > 0 && (
              <>
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Filter by category"
                >
                  <option value="">All categories</option>
                  {categoryOptions.map(c => (
                    <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
                <select
                  value={stockIoFilter}
                  onChange={e => setStockIoFilter(e.target.value as '' | 'on' | 'off')}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Filter by Stock IN/OUT"
                >
                  <option value="">Stock : All</option>
                  <option value="off">Stock : Off</option>
                  <option value="on">Stock : On</option>
                </select>
                <div className="w-44">
                  <div className="flex justify-between items-baseline text-xs text-gray-600 mb-1.5">
                    <Label className="text-xs">Price</Label>
                    <span className="tabular-nums text-gray-500">
                      ${effPrice[0].toLocaleString()} – ${effPrice[1].toLocaleString()}
                    </span>
                  </div>
                  <Slider
                    min={priceBounds[0]}
                    max={priceBounds[1]}
                    step={1}
                    value={effPrice}
                    onValueChange={(v) => {
                      const a = Math.min(v[0] ?? priceBounds[0], v[1] ?? priceBounds[1]);
                      const b = Math.max(v[0] ?? priceBounds[0], v[1] ?? priceBounds[1]);
                      setPriceRange([a, b]);
                    }}
                  />
                </div>
                <div className="w-44">
                  <div className="flex justify-between items-baseline text-xs text-gray-600 mb-1.5">
                    <Label className="text-xs">Stock</Label>
                    <span className="tabular-nums text-gray-500">
                      {effStock[0].toLocaleString()} – {effStock[1].toLocaleString()}
                    </span>
                  </div>
                  <Slider
                    min={stockBounds[0]}
                    max={stockBounds[1]}
                    step={1}
                    value={effStock}
                    onValueChange={(v) => {
                      const a = Math.min(v[0] ?? stockBounds[0], v[1] ?? stockBounds[1]);
                      const b = Math.max(v[0] ?? stockBounds[0], v[1] ?? stockBounds[1]);
                      setStockRange([a, b]);
                    }}
                  />
                </div>
                {filtersActive && (
                  <Button size="sm" variant="ghost" className="h-9" onClick={clearFilters}>
                    Clear
                  </Button>
                )}
              </>
            )}
          </div>
          <form onSubmit={onSearchSubmit} className="flex items-center gap-2">
            {/* Warehouse filter — shown only when the feature gate is
                on. "All" = empty value, picks one warehouse otherwise.
                Re-runs the list call via the warehouseFilter useEffect. */}
            {warehouseFeatureOn && (
              <div className="flex items-center gap-1.5">
                <WarehouseIcon className="h-3.5 w-3.5 text-gray-500" />
                <select
                  value={warehouseFilter}
                  onChange={e => setWarehouseFilter(e.target.value)}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Filter by warehouse"
                >
                  <option value="">All warehouses</option>
                  {warehouses.filter(w => w.enabled).map(w => (
                    <option key={w.id} value={w.id}>
                      {w.code ? `${w.code} — ${w.name}` : w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name or SKU…"
                className="pl-8 h-9 w-64"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">Search</Button>
          </form>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400">Loading items…</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">
              No items yet.{canAdd && <> Click <strong>Add Item</strong> to create the first one.</>}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Code</TableHead>
                    <TableHead className="w-[64px]">Photo</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="w-[140px]">Category</TableHead>
                    <TableHead className="w-[80px] text-center">Unit</TableHead>
                    <TableHead className="text-right w-[110px]">Cost Price</TableHead>
                    <TableHead className="text-right w-[110px]">Selling Price</TableHead>
                    <TableHead className="text-right w-[110px]">Current Stock</TableHead>
                    <TableHead className="text-right w-[90px]">Min Stock</TableHead>
                    <TableHead className="text-center w-[90px]">Status</TableHead>
                    {warehouseFeatureOn && (
                      <TableHead className="w-[160px]">Warehouse</TableHead>
                    )}
                    <TableHead className="text-center w-[110px]">Stock IN/OUT</TableHead>
                    <TableHead className="text-center w-[80px]">Active</TableHead>
                    <TableHead className="text-right w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(it => {
                    const onHand = Number(it.stockQty ?? 0);
                    const minStock = Number(it.minStock ?? 0);
                    // Derived Status — Out / Low / Normal. "Low" only
                    // triggers when min_stock is set (> 0); without a
                    // threshold every row reads as Normal.
                    const status = onHand <= 0
                      ? { label: 'Out',    cls: 'bg-rose-100 text-rose-700 border-rose-200' }
                      : (minStock > 0 && onHand < minStock)
                        ? { label: 'Low',    cls: 'bg-amber-100 text-amber-700 border-amber-200' }
                        : { label: 'Normal', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
                    return (
                      <TableRow key={it.id}>
                        <TableCell className="tabular-nums text-xs text-gray-600">
                          {it.sku || <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell>
                          {it.imageUrl ? (
                            <img
                              src={it.imageUrl}
                              alt={it.name}
                              className="h-10 w-10 rounded-md object-cover border border-gray-200"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400">
                              <ImageIcon className="h-4 w-4" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {it.name}
                          {it.description && (
                            <div className="text-[11px] text-gray-500 truncate max-w-md">{it.description}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-gray-700">
                          {/* Prefer the free-text Stock category (V151)
                              when set; fall back to the POS taxonomy
                              (drink/snack/food/other) so items that only
                              carry the POS classification aren't shown
                              blank. POS-fallback is rendered as a subtle
                              badge to signal it's the auto-derived
                              label, not something the operator typed. */}
                          {it.itemCategory ? (
                            it.itemCategory
                          ) : it.category ? (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200 capitalize">
                              {it.category}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs text-gray-600">
                          {it.unit || <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-gray-600">
                          {Number(it.unitCost ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(it.unitPrice ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${onHand <= 0 ? 'text-rose-700 font-medium' : ''}`}>
                          {onHand.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-gray-500">
                          {minStock > 0 ? minStock.toLocaleString('en-US', { maximumFractionDigits: 2 }) : <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={status.cls}>{status.label}</Badge>
                        </TableCell>
                        {warehouseFeatureOn && (
                          <TableCell className="text-sm text-gray-700">
                            {it.warehouseId
                              ? warehouseLabelById.get(it.warehouseId) ?? <span className="text-gray-300">—</span>
                              : <span className="text-gray-300">—</span>}
                          </TableCell>
                        )}
                        <TableCell className="text-center">
                          {/* V121 — when on, the invoice save flow
                              decrements stock and refuses to save
                              when qty > on-hand. Off = autofill only. */}
                          {it.deductionEnabled ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">On</Badge>
                          ) : (
                            <Badge variant="outline" className="text-gray-500">Off</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={it.active ? 'default' : 'outline'}>
                            {it.active ? 'Yes' : 'No'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            {canReceive && (
                              <Button size="sm" variant="ghost" className="h-7 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => openStockIn(it)} title="Receive stock" aria-label="Receive stock">
                                <PackagePlus className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canEdit && (
                              <Button size="sm" variant="ghost" className="h-7"
                                onClick={() => openEdit(it)} title="Edit" aria-label="Edit item">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canRemove && (
                              <Button size="sm" variant="ghost"
                                className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => setDeleteTarget(it)} title="Remove" aria-label="Remove item">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                onPageChange={pagination.goToPage}
                startIndex={pagination.startIndex}
                endIndex={pagination.endIndex}
                totalItems={pagination.totalItems}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit single-entry dialog. Responsive layout:
       *  • DialogContent caps at 90vh and lays itself out as a column
       *    so the footer stays pinned while the body scrolls.
       *  • Grids collapse to single-column under the sm breakpoint
       *    so on a phone every input gets full width.
       *  • Body is a scrollable region; on desktops the contents
       *    rarely fill it, so nothing visible changes there. */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle>{editing ? 'Edit item' : 'Add item'}</DialogTitle>
            <DialogDescription className="sr-only">
              Catalog item with unit price, cost, unit, and stock quantity.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
              <div className="space-y-1.5">
                <Label>Name <span className="text-red-500">*</span></Label>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Product or service name"
                  maxLength={255}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">SKU / Code</Label>
                <Input
                  value={form.sku}
                  onChange={e => setForm({ ...form, sku: e.target.value })}
                  placeholder="Optional"
                  maxLength={64}
                  className="tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Optional"
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Unit</Label>
              <Input
                value={form.unit}
                onChange={e => setForm({ ...form, unit: e.target.value })}
                placeholder="pcs, kg, hour…"
                maxLength={32}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Cost Price</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.unitCost}
                  onChange={e => setForm({ ...form, unitCost: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Selling Price</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.unitPrice}
                  onChange={e => setForm({ ...form, unitPrice: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:items-end">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
                  Stock On Hand
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                          aria-label="About Stock On Hand"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                        Use Receive Stock later to add to the balance; this is the starting amount.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input
                  type="number" step="0.01"
                  value={form.stockQty}
                  onChange={e => setForm({ ...form, stockQty: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
                  Min Stock
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                          aria-label="About Min Stock"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                        Reorder threshold. When current stock falls below this, the row badges as <strong>Low</strong>.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.minStock}
                  onChange={e => setForm({ ...form, minStock: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between border rounded-md px-3 py-2 h-10">
                <Label className="text-sm">Active</Label>
                <Switch
                  checked={form.active}
                  onCheckedChange={v => setForm({ ...form, active: v })}
                />
              </div>
            </div>

            {/* V149 — warehouse picker. Surfaces only when the
                feature gate is on, so tenants that don't use
                warehouses never see the extra row. "(none)" = empty
                string, server clears the FK. */}
            {warehouseFeatureOn && (
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
                  <WarehouseIcon className="h-3.5 w-3.5 text-gray-500" />
                  Warehouse
                </Label>
                <select
                  value={form.warehouseId}
                  onChange={e => setForm({ ...form, warehouseId: e.target.value })}
                  disabled={saving}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">(none)</option>
                  {warehouses.filter(w => w.enabled || w.id === form.warehouseId).map(w => (
                    <option key={w.id} value={w.id}>
                      {w.code ? `${w.code} — ${w.name}` : w.name}
                      {!w.enabled ? ' (disabled)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* V121 + v-bill-stock-in-two-way — per-item stock tracking
                toggle. When on, sale-side documents (Invoice + POS)
                decrement on-hand (OUT) and refuse to save if a line
                quantity exceeds the available balance; purchase-side
                documents (Bill) increment on-hand (IN). Off = picker
                is autofill-only, no movements recorded either way. */}
            <div className="flex items-start justify-between border rounded-md px-3 py-2 gap-3">
              <div className="flex-1 min-w-0">
                <Label className="text-sm">Stock (IN / OUT)</Label>
                <div className="text-[11px] text-gray-500 leading-snug mt-0.5">
                  When on: Invoices &amp; POS decrement on-hand (OUT), Bills
                  increment on-hand (IN). Sale is blocked if the line
                  quantity exceeds available stock.
                </div>
              </div>
              <Switch
                checked={form.deductionEnabled}
                onCheckedChange={v => setForm({ ...form, deductionEnabled: v })}
              />
            </div>

            {/* V132 + V138 + V265 — up to 5 images. First slot is the
                cover shown as the POS / shop card; the rest surface
                in the product detail carousel. Big source files are
                auto-compressed client-side. */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Images (optional, up to 5)</Label>
              <MultiImageDropZone
                value={form.imageUrls}
                onChange={next => setForm({ ...form, imageUrls: next })}
                max={5}
                disabled={saving}
                hint="PNG / JPG · first image is the product card cover. Big files are auto-compressed."
              />
            </div>

            {/* V142 — category dropdown. Drives the POS items-grid
                filter tabs. Drink unlocks the Modifiers editor below
                so the cashier can configure Size / Sugar Level. */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Category</Label>
              {/* v-item-category-free-text (V269) — one-tap chip picker
                  for the common categories PLUS a text input for a
                  custom label. Empty string is a valid state ("none");
                  the BE defaults it to 'other' on save so the row still
                  filters cleanly. Selecting a chip fills the input +
                  visually marks the chip; typing clears the chip. */}
              <div className="chip-row">
                {[
                  { value: '',         label: '(none)' },
                  { value: 'drink',    label: 'Drink' },
                  { value: 'snack',    label: 'Snack' },
                  { value: 'food',     label: 'Food' },
                  { value: 'craft',    label: 'Craft' },
                  { value: 'souvenir', label: 'Souvenir' },
                  { value: 'jewelry',  label: 'Jewelry' },
                  { value: 'other',    label: 'Other' },
                ].map(opt => {
                  const active = form.category.trim().toLowerCase() === opt.value;
                  return (
                    <button
                      key={opt.value || 'none'}
                      type="button"
                      disabled={saving}
                      onClick={() => setForm({ ...form, category: opt.value })}
                      className={`px-3 h-7 rounded-full border text-xs font-medium transition ${
                        active
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <input
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                disabled={saving}
                maxLength={64}
                placeholder="Or type your own label — leave blank for none"
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* V142 — modifier editor. Available for every category
                now (was Drink-only). Craft/Souvenir stores use it to
                offer Size / Color / Wrap variants the same way a
                coffee shop offers Size / Sugar Level. */}
            <ModifiersEditor
              groups={form.modifierGroups}
              onChange={g => setForm({ ...form, modifierGroups: g })}
              disabled={saving}
            />
          </div>

          {/* Pinned footer — sits outside the scrolling body so Save +
              Cancel stay reachable no matter how long the form
              content gets (e.g. many modifier groups on a Drink). */}
          <DialogFooter className="px-6 py-3 border-t bg-white shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive stock dialog */}
      <Dialog open={!!stockIn} onOpenChange={o => !o && setStockIn(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-4 w-4 text-emerald-600" />
              Receive Stock
            </DialogTitle>
            <DialogDescription>
              Add to <strong>{stockIn?.item.name}</strong>. Current on-hand:{' '}
              <span className="tabular-nums">{Number(stockIn?.item.stockQty ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
              {stockIn?.item.unit ? ` ${stockIn.item.unit}` : ''}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Quantity received <span className="text-red-500">*</span></Label>
              <Input
                type="number" step="0.01" min="0.01"
                autoFocus
                value={stockIn?.qty ?? ''}
                onChange={e => stockIn && setStockIn({ ...stockIn, qty: e.target.value })}
                placeholder="e.g. 50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">
                New unit cost <span className="text-gray-400">(leave blank to keep current)</span>
              </Label>
              <Input
                type="number" step="0.01" min="0"
                value={stockIn?.unitCost ?? ''}
                onChange={e => stockIn && setStockIn({ ...stockIn, unitCost: e.target.value })}
                placeholder={`Current: ${Number(stockIn?.item.unitCost ?? 0).toFixed(2)}`}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStockIn(null)} disabled={receiving}>
              Cancel
            </Button>
            <Button onClick={confirmStockIn} disabled={receiving}>
              {receiving ? 'Receiving…' : 'Receive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this item?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} will be deleted. Existing invoice / bill
              lines that reference this item by snapshot stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ====================================================================
 *  Modifiers editor — per-item groups (V142). A group has a name +
 *  required toggle + a list of options ({label, priceAdj}). The POS
 *  modifier picker on the cart side reads this same shape.
 * =================================================================== */

function ModifiersEditor({
  groups, onChange, disabled,
}: {
  groups: itemsApi.ModifierGroup[];
  onChange: (next: itemsApi.ModifierGroup[]) => void;
  disabled?: boolean;
}) {
  const setGroup = (idx: number, patch: Partial<itemsApi.ModifierGroup>) =>
    onChange(groups.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  const setOption = (gi: number, oi: number, patch: Partial<itemsApi.ModifierOption>) =>
    onChange(groups.map((g, i) => {
      if (i !== gi) return g;
      return { ...g, options: g.options.map((o, j) => j === oi ? { ...o, ...patch } : o) };
    }));
  const addGroup = () =>
    onChange([...groups, { name: '', required: false, options: [{ label: '', priceAdj: 0 }] }]);
  const removeGroup = (idx: number) => onChange(groups.filter((_, i) => i !== idx));
  const addOption = (gi: number) =>
    onChange(groups.map((g, i) => i === gi ? { ...g, options: [...g.options, { label: '', priceAdj: 0 }] } : g));
  const removeOption = (gi: number, oi: number) =>
    onChange(groups.map((g, i) => {
      if (i !== gi) return g;
      // Don't let the operator drop the last option — an empty group
      // can't be picked from at the counter.
      if (g.options.length <= 1) return g;
      return { ...g, options: g.options.filter((_, j) => j !== oi) };
    }));

  return (
    <div className="space-y-2 border rounded-md p-3 bg-gray-50">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
          Modifier groups
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={-1} className="text-gray-400"><Info className="h-3.5 w-3.5" /></span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                Customisations the cashier picks at ring-up. Each group surfaces a
                radio list of options — picking one can adjust the line's unit price.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
        <div className="flex gap-1.5">
          {groups.length === 0 && (
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => onChange(DRINK_DEFAULT_MODIFIERS)} disabled={disabled}>
              Use Size + Sugar defaults
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
            onClick={addGroup} disabled={disabled}>
            <Plus className="h-3 w-3 mr-1" /> Add group
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-xs text-gray-500">
          No modifiers yet — tapping this item on POS adds it directly with the base price.
        </p>
      ) : (
        groups.map((g, gi) => (
          <div key={gi} className="rounded border bg-white p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <Input
                value={g.name}
                onChange={e => setGroup(gi, { name: e.target.value })}
                placeholder="Group name (e.g. Size)"
                className="h-7 text-sm flex-1"
                disabled={disabled}
                maxLength={32}
              />
              <label className="inline-flex items-center gap-1 text-xs text-gray-600">
                <input type="checkbox" checked={g.required}
                  onChange={e => setGroup(gi, { required: e.target.checked })}
                  disabled={disabled} />
                Required
              </label>
              <button type="button" onClick={() => removeGroup(gi)}
                className="text-gray-400 hover:text-red-600" disabled={disabled}
                title="Remove group">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1">
              {g.options.map((o, oi) => (
                <div key={oi} className="flex items-center gap-1.5">
                  <Input
                    value={o.label}
                    onChange={e => setOption(gi, oi, { label: e.target.value })}
                    placeholder="Option (e.g. M)"
                    className="h-7 text-sm flex-1"
                    disabled={disabled}
                    maxLength={32}
                  />
                  <span className="text-xs text-gray-500">±$</span>
                  <Input
                    type="number" step="0.01"
                    value={o.priceAdj}
                    onChange={e => setOption(gi, oi, { priceAdj: parseFloat(e.target.value) || 0 })}
                    className="h-7 text-sm w-20 text-right"
                    disabled={disabled}
                  />
                  <button type="button" onClick={() => removeOption(gi, oi)}
                    className="text-gray-300 hover:text-red-600 disabled:opacity-30"
                    disabled={disabled || g.options.length <= 1}
                    title={g.options.length <= 1 ? 'Group must have at least one option' : 'Remove option'}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm"
                className="h-6 text-[11px] mt-1"
                onClick={() => addOption(gi)} disabled={disabled}>
                <Plus className="h-3 w-3 mr-1" /> Option
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
