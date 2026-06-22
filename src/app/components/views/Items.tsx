import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
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
import { Plus, Pencil, Trash2, Search, Package, RefreshCw, Info, PackagePlus, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { StockItemUsageSettingsDialog } from '../common/StockItemUsageSettingsDialog';

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
};

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

  const [editing, setEditing] = useState<itemsApi.Item | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Usage-settings dialog (V120) — controls which sale/purchase
  // document forms surface the StockItemPicker.
  const [usageSettingsOpen, setUsageSettingsOpen] = useState(false);
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
        size: 200,
      });
      setRows(res.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void load();
  };

  const filtered = useMemo(() => rows, [rows]);
  const pagination = usePagination(filtered, 25);

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
          {canAdd && (
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Item
            </Button>
          )}
        </div>
      </div>

      <StockItemUsageSettingsDialog
        open={usageSettingsOpen}
        onOpenChange={setUsageSettingsOpen}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-600" />
            Catalog
          </CardTitle>
          <form onSubmit={onSearchSubmit} className="flex items-center gap-2">
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
                    <TableHead className="w-[120px]">SKU</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[80px] text-center">Unit</TableHead>
                    <TableHead className="text-right w-[120px]">Unit Price</TableHead>
                    <TableHead className="text-right w-[120px]">Unit Cost</TableHead>
                    <TableHead className="text-right w-[110px]">Stock</TableHead>
                    <TableHead className="text-center w-[110px]">Deduction</TableHead>
                    <TableHead className="text-center w-[90px]">Status</TableHead>
                    <TableHead className="text-right w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(it => {
                    const lowStock = Number(it.stockQty) <= 0;
                    return (
                      <TableRow key={it.id}>
                        <TableCell className="font-mono text-xs text-gray-600">
                          {it.sku || <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className="font-medium">
                          {it.name}
                          {it.description && (
                            <div className="text-[11px] text-gray-500 truncate max-w-md">{it.description}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs text-gray-600">
                          {it.unit || <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(it.unitPrice ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-gray-600">
                          {Number(it.unitCost ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${lowStock ? 'text-red-600 font-medium' : ''}`}>
                          {Number(it.stockQty).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </TableCell>
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
                            {it.active ? 'Active' : 'Inactive'}
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

      {/* Add / Edit single-entry dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit item' : 'Add item'}</DialogTitle>
            <DialogDescription className="sr-only">
              Catalog item with unit price, cost, unit, and stock quantity.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_180px] gap-3">
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
                  className="font-mono"
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

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Unit</Label>
                <Input
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                  placeholder="pcs, kg, hour…"
                  maxLength={32}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Unit Price</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.unitPrice}
                  onChange={e => setForm({ ...form, unitPrice: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Unit Cost</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.unitCost}
                  onChange={e => setForm({ ...form, unitCost: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
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
              <div className="flex items-center justify-between border rounded-md px-3 py-2 h-10">
                <Label className="text-sm">Active</Label>
                <Switch
                  checked={form.active}
                  onCheckedChange={v => setForm({ ...form, active: v })}
                />
              </div>
            </div>

            {/* V121 — per-item stock deduction toggle. When on, the
                InvoiceService decrements on-hand on save AND refuses
                to save when the line quantity exceeds the available
                stock. Off = picker is autofill-only (back-compat). */}
            <div className="flex items-start justify-between border rounded-md px-3 py-2 gap-3">
              <div className="flex-1 min-w-0">
                <Label className="text-sm">Stock deduction</Label>
                <div className="text-[11px] text-gray-500 leading-snug mt-0.5">
                  When on: choosing this item on an Invoice decrements stock;
                  saving is blocked if the requested quantity exceeds on-hand.
                </div>
              </div>
              <Switch
                checked={form.deductionEnabled}
                onCheckedChange={v => setForm({ ...form, deductionEnabled: v })}
              />
            </div>
          </div>

          <DialogFooter>
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
              <span className="font-mono">{Number(stockIn?.item.stockQty ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
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
