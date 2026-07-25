import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { TableBodySkeletonRows } from '../common/LoadingSkeletons';
import * as adjustmentsApi from '../../api/stockAdjustments';
import * as itemsApi from '../../api/items';
import { ClipboardEdit, Plus, Trash2, RefreshCw, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

interface FormState {
  itemId: string;
  actualQty: string;
  reason: adjustmentsApi.AdjustmentReason;
  note: string;
}

const EMPTY_FORM: FormState = {
  itemId: '',
  actualQty: '',
  reason: 'counting_error',
  note: '',
};

/**
 * Stock → Adjustment. Manual correction surface. Saving a row:
 *   - snapshots the item's system_qty (server-side, can't be forged)
 *   - overwrites stock_qty with the user-supplied actual_qty
 *   - lands an ADJUSTMENT row in stock_movements
 *
 * Delete removes the adjustment doc but does NOT reverse the
 * stock change — the matching movement stays as audit. To revert,
 * raise a new adjustment with the prior actual.
 */
export function StockAdjustments() {
  const { t } = useI18n();
  const { canCreate, canDelete } = useAuth();
  const canAdd    = canCreate('stock_adjustment');
  const canRemove = canDelete('stock_adjustment');

  const [rows, setRows] = useState<adjustmentsApi.StockAdjustment[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<itemsApi.Item[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<adjustmentsApi.StockAdjustment | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adjustmentsApi.list(0, 200);
      setRows(res.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load adjustments');
    } finally {
      setLoading(false);
    }
  };

  /** Cache the catalog once so the Add dialog can show item names +
   *  the current system_qty (rendered live so the operator sees the
   *  delta before submitting). */
  const loadItems = async () => {
    try {
      const res = await itemsApi.list({ size: 200 });
      setItems(res.content ?? []);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    void load();
    void loadItems();
  }, []);

  const pagination = usePagination(useMemo(() => rows, [rows]), 25);

  /** Current system_qty for the selected item — drives the inline
   *  "System: X, Actual: Y → diff Z" hint below the actual_qty input. */
  const selectedItem = useMemo(
    () => items.find(i => i.id === form.itemId),
    [items, form.itemId],
  );
  const systemQty = selectedItem ? Number(selectedItem.stockQty ?? 0) : null;
  const actualParsed = Number(form.actualQty);
  const diff = systemQty != null && Number.isFinite(actualParsed)
    ? actualParsed - systemQty
    : null;

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.itemId)                     { toast.error('Pick an item');                     return; }
    if (!Number.isFinite(actualParsed))   { toast.error('Actual quantity must be a number'); return; }
    if (actualParsed < 0)                 { toast.error('Actual quantity must be 0 or more');return; }

    setSaving(true);
    try {
      await adjustmentsApi.create({
        itemId: form.itemId,
        actualQty: actualParsed,
        reason: form.reason,
        note: form.note.trim() || undefined,
      });
      toast.success('Adjustment recorded');
      setDialogOpen(false);
      await Promise.all([load(), loadItems()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await adjustmentsApi.remove(deleteTarget.id);
      toast.success(`Removed ${deleteTarget.adjustmentNo}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const reasonLabel = (r: adjustmentsApi.AdjustmentReason) =>
    adjustmentsApi.ADJUSTMENT_REASONS.find(x => x.value === r)?.label ?? r;

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            {t('nav.stock.adjustment') || 'Stock Adjustment'}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                    aria-label="What is Stock Adjustment?"
                  >
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Manual correction. Pick an item, enter the actual counted
                  quantity and a reason. The system snapshots the prior on-hand,
                  overwrites it with your count, and records the diff as an
                  ADJUSTMENT in Movement.
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
          {canAdd && (
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Adjustment
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardEdit className="h-4 w-4 text-amber-600" />
            Adjustments
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Date</TableHead>
                <TableHead className="w-[120px]">Reference</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right w-[110px]">System</TableHead>
                <TableHead className="text-right w-[110px]">Actual</TableHead>
                <TableHead className="text-right w-[110px]">Difference</TableHead>
                <TableHead className="w-[140px]">Reason</TableHead>
                <TableHead className="text-center w-[90px]">Status</TableHead>
                <TableHead className="w-[140px]">Created By</TableHead>
                {canRemove && <TableHead className="text-right w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Header always mounted (Announcement pattern). Empty
                  + loading collapse into a single colSpan'd row. */}
              {loading && rows.length === 0 && (
                <TableBodySkeletonRows rows={6} columns={canRemove ? 10 : 9} />
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canRemove ? 10 : 9} className="text-center text-sm text-gray-400 py-8">
                    No adjustments yet.{canAdd && <> Click <strong>Add Adjustment</strong> to record one.</>}
                  </TableCell>
                </TableRow>
              )}
              {pagination.paginatedItems.map(a => {
                    const d = Number(a.difference ?? 0);
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs text-gray-600 tabular-nums">
                          {new Date(a.createdAt).toLocaleString('en-US', {
                            year: '2-digit', month: 'short', day: '2-digit',
                          })}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">{a.adjustmentNo}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{a.itemName || '—'}</div>
                          {a.itemSku && (
                            <div className="text-[11px] text-gray-500 tabular-nums">{a.itemSku}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-gray-600">
                          {Number(a.systemQty ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(a.actualQty ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums font-medium ${d < 0 ? 'text-rose-700' : d > 0 ? 'text-emerald-700' : 'text-gray-500'}`}>
                          {d > 0 ? '+' : ''}{d.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-xs">{reasonLabel(a.reason)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={a.status === 'approved' ? 'default' : 'outline'}>
                            {a.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-700 truncate max-w-[140px]">
                          {a.createdByName || <span className="text-gray-300">—</span>}
                        </TableCell>
                        {canRemove && (
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost"
                              className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteTarget(a)} title="Remove" aria-label="Remove adjustment">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
          {rows.length > 0 && (
            <div className="px-4 py-3 border-t">
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                onPageChange={pagination.goToPage}
                startIndex={pagination.startIndex}
                endIndex={pagination.endIndex}
                totalItems={pagination.totalItems}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add adjustment dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record adjustment</DialogTitle>
            <DialogDescription className="sr-only">
              Pick an item, enter the actual quantity counted, and a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Item <span className="text-red-500">*</span></Label>
              <select
                value={form.itemId}
                onChange={e => setForm({ ...form, itemId: e.target.value })}
                disabled={saving}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Pick an item…</option>
                {items.filter(i => i.active).map(i => (
                  <option key={i.id} value={i.id}>
                    {i.sku ? `${i.sku} — ${i.name}` : i.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Actual quantity <span className="text-red-500">*</span></Label>
              <Input
                type="number" step="0.01" min="0"
                value={form.actualQty}
                onChange={e => setForm({ ...form, actualQty: e.target.value })}
                placeholder="e.g. 95"
              />
              {systemQty != null && Number.isFinite(actualParsed) && (
                <p className="text-[11px] text-gray-500">
                  System: <span className="tabular-nums">{systemQty.toLocaleString('en-US')}</span>
                  {' → '}
                  Actual: <span className="tabular-nums">{actualParsed.toLocaleString('en-US')}</span>
                  {diff != null && (
                    <span className={`ml-1 font-medium ${diff < 0 ? 'text-rose-700' : diff > 0 ? 'text-emerald-700' : 'text-gray-500'}`}>
                      ({diff > 0 ? '+' : ''}{diff.toLocaleString('en-US')})
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Reason <span className="text-red-500">*</span></Label>
              <select
                value={form.reason}
                onChange={e => setForm({ ...form, reason: e.target.value as adjustmentsApi.AdjustmentReason })}
                disabled={saving}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {adjustmentsApi.ADJUSTMENT_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Note (optional)</Label>
              <Textarea
                value={form.note}
                onChange={e => setForm({ ...form, note: e.target.value })}
                rows={2}
                placeholder="What happened?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving…' : 'Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.adjustmentNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              The adjustment doc is deleted; the stock_qty change it applied stays
              put and the matching Movement row stays as audit. To revert the value,
              record a new adjustment instead.
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
