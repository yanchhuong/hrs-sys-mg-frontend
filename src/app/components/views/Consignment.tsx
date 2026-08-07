// V309 — Consignment module (Sale > Consignment). Per-unit price
// model: retailPrice / supplierAmount / commissionAmount are all
// dollars per single unit; qty scales totals downstream.
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import {
  Handshake, Wallet, ReceiptText, Package, DollarSign,
  Plus, Loader2, RefreshCw, Trash2, Edit3, Eye, Printer, Share2, Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { DateInput } from '../common/DateInput';
import { StatCard } from '../common/StatCard';
import { StockItemPicker } from '../common/StockItemPicker';
import { SearchablePicker, type PickerOption } from '../common/SearchablePicker';
import { formatNumber, formatUSD } from '../../utils/format';
import * as consignmentsApi from '../../api/consignments';
import * as settlementsApi from '../../api/consignmentSettlements';
import * as vendorsApi from '../../api/vendors';
import * as warehousesApi from '../../api/warehouses';
import * as itemsApi from '../../api/items';

/**
 * V309 Consignment page — same UI/UX shell as {@link ./Commission}:
 * bare {@code Tabs} at the root, StatCard strip per tab, and a
 * {@code CardHeader} filter-strip with Refresh + primary Add.
 *
 *   • Consignment — supplier agreements + line items.
 *   • Settlement  — period payouts to suppliers.
 *
 * Moved under Sale (nav.ts) next to Commission 2026-08-07 — same
 * mental model ("money owed to a party because of what we sold").
 */
export function Consignment() {
  return (
    <Tabs defaultValue="report" className="w-full">
      <TabsList>
        <TabsTrigger value="report">Consignment</TabsTrigger>
        <TabsTrigger value="settlement">Settlement</TabsTrigger>
      </TabsList>
      <TabsContent value="report" className="mt-4">
        <ConsignmentReport />
      </TabsContent>
      <TabsContent value="settlement" className="mt-4">
        <ConsignmentSettlementView />
      </TabsContent>
    </Tabs>
  );
}

const CONSIGN_TONE: Record<consignmentsApi.ConsignmentStatus, string> = {
  draft:              'bg-gray-100 text-gray-700',
  active:             'bg-emerald-100 text-emerald-800',
  partially_settled:  'bg-amber-100 text-amber-800',
  settled:            'bg-blue-100 text-blue-800',
  closed:             'bg-slate-200 text-slate-700',
  cancelled:          'bg-red-100 text-red-700',
};

const SETTLE_TONE: Record<settlementsApi.SettlementStatus, string> = {
  draft:     'bg-gray-100 text-gray-700',
  pending:   'bg-amber-100 text-amber-800',
  paid:      'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
};

/* ------------------------------------------------------------------ */
/* Consignment tab                                                    */
/* ------------------------------------------------------------------ */

function ConsignmentReport() {
  const [rows, setRows] = useState<consignmentsApi.Consignment[]>([]);
  const [vendors, setVendors] = useState<vendorsApi.Vendor[]>([]);
  const [warehouses, setWarehouses] = useState<warehousesApi.Warehouse[]>([]);
  const [items, setItems] = useState<itemsApi.Item[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<consignmentsApi.Consignment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<consignmentsApi.Consignment | null>(null);
  // Client-side filters — the tenant list fits comfortably in one
  // 200-row page fetch, so no need to round-trip to the BE for
  // typeahead / date-range filtering.
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, v, w, i] = await Promise.all([
        consignmentsApi.list({ size: 200 }),
        vendorsApi.list({ size: 500 }).catch(() => ({ content: [] as vendorsApi.Vendor[] } as any)),
        warehousesApi.list().catch(() => [] as warehousesApi.Warehouse[]),
        itemsApi.list({ size: 1000 }).catch(() => ({ content: [] as itemsApi.Item[] } as any)),
      ]);
      setRows(r.content ?? []);
      setVendors(v.content ?? []);
      setWarehouses(w ?? []);
      setItems(i.content ?? []);
      setItemsLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load consignments');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(c => {
      if (term) {
        const hay = `${c.consignmentNo} ${c.supplierName ?? ''} ${c.warehouseName ?? ''} ${c.notes ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      // startDate is 'YYYY-MM-DD' — lex-compare works.
      if (dateFrom && c.startDate < dateFrom) return false;
      if (dateTo   && c.startDate > dateTo)   return false;
      return true;
    });
  }, [rows, search, dateFrom, dateTo]);

  const totals = useMemo(() => filteredRows.reduce((a, c) => {
    let qty = 0, gross = 0, comm = 0;
    for (const it of c.items) {
      const q     = it.receivedQty ?? 0;
      const price = it.sellingPrice ?? 0;
      const g     = q * price;
      qty   += q;
      gross += g;
      // Commission is what we keep — line gross × pct% for percent
      // lines, flat × qty for amount lines. Matches the row math
      // shown in the dialog's Line total column.
      if (it.commissionType === 'percent') comm += g * (it.commissionValue ?? 0) / 100;
      else if (it.commissionType === 'amount') comm += q * (it.commissionValue ?? 0);
    }
    return {
      count:  a.count + 1,
      active: a.active + (c.status === 'active' || c.status === 'partially_settled' ? 1 : 0),
      qty:    a.qty + qty,
      gross:  a.gross + gross,
      comm:   a.comm + comm,
    };
  }, { count: 0, active: 0, qty: 0, gross: 0, comm: 0 }), [filteredRows]);

  const doDelete = async (c: consignmentsApi.Consignment) => {
    try {
      await consignmentsApi.remove(c.id);
      toast.success(`Deleted ${c.consignmentNo}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="stat-strip stat-cols-5">
        <StatCard label="Consignments"   value={formatNumber(totals.count)}    icon={Handshake}   tone="purple" />
        <StatCard label="Active"         value={formatNumber(totals.active)}   icon={ReceiptText} tone="blue" />
        <StatCard label="Order Qty"      value={formatNumber(totals.qty)}      icon={Package}     tone="green"
          hint="Total units consigned across all lines — each posts as an OUT (−) stock movement on save" />
        <StatCard label="Total Retail"   value={formatUSD(totals.gross)}       icon={DollarSign}  tone="amber"
          hint="Sum of Order QTY × Retail Price across all lines" />
        <StatCard label="Total Comm."    value={formatUSD(totals.comm)}        icon={Wallet}      tone="orange"
          hint="What we keep — the supplier is owed Total Retail minus this" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          {/* Filter strip — keyword search + From/To date range.
              Same style Commission / Transactions use so the row
              reads as a familiar shape across list pages. */}
          <div className="filter-strip">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search No / supplier / warehouse / notes…"
              className="h-9 w-64 text-sm"
            />
            <Label className="text-xs text-gray-500">From</Label>
            <DateInput
              value={dateFrom || null}
              onChange={v => setDateFrom(v ?? '')}
              className="h-9 w-36 text-sm"
              title="Start date filter — from"
            />
            <Label className="text-xs text-gray-500">To</Label>
            <DateInput
              value={dateTo || null}
              onChange={v => setDateTo(v ?? '')}
              className="h-9 w-36 text-sm"
              title="Start date filter — to"
              min={dateFrom || undefined}
            />
            {(search || dateFrom || dateTo) && (
              <Button
                variant="ghost" size="sm"
                onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); }}
                className="h-9 text-xs text-gray-500 hover:text-gray-700"
                title="Clear filters"
              >
                Clear
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1.5" /> New consignment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRows.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              {rows.length === 0
                ? <>No consignments yet. Click <b>New consignment</b> to record a supplier agreement.</>
                : <>No consignments match the current filter.</>}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consignment No</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Order Qty</TableHead>
                  <TableHead className="text-right">Total Retail</TableHead>
                  <TableHead className="text-right">Total Comm.</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map(c => {
                  let qty = 0, gross = 0, comm = 0;
                  for (const it of c.items) {
                    const q     = it.receivedQty ?? 0;
                    const price = it.sellingPrice ?? 0;
                    const g     = q * price;
                    qty   += q;
                    gross += g;
                    if (it.commissionType === 'percent') comm += g * (it.commissionValue ?? 0) / 100;
                    else if (it.commissionType === 'amount') comm += q * (it.commissionValue ?? 0);
                  }
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium tabular-nums">{c.consignmentNo}</TableCell>
                      <TableCell>{c.supplierName ?? '—'}</TableCell>
                      <TableCell>{c.warehouseName ?? '—'}</TableCell>
                      <TableCell className="text-xs text-gray-600">{c.startDate}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(qty)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatUSD(gross)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-emerald-700">
                        {comm > 0 ? formatUSD(comm) : <span className="text-gray-300 font-normal">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge className={CONSIGN_TONE[c.status]}>
                          {consignmentsApi.CONSIGNMENT_STATUS_LABELS[c.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm"
                            onClick={() => { setEditing(c); setDialogOpen(true); }}
                            title="Edit">
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="sm"
                            onClick={() => setDeleteTarget(c)}
                            title="Delete">
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <ConsignmentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
          vendors={vendors}
          warehouses={warehouses}
          items={items}
          itemsLoaded={itemsLoaded}
          // Quick-add vendors from inside the picker land here so the
          // picker sees the new row immediately + it survives beyond
          // this dialog's lifetime (next open uses the updated list).
          onVendorAdded={v => setVendors(prev => [...prev, v])}
          onSaved={async () => { setDialogOpen(false); await load(); }}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.consignmentNo}?</DialogTitle>
            <DialogDescription>
              Line items go with it. Settlement records referencing this consignment stay behind
              (they carry their own copy of the amounts) — remove those separately if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && doDelete(deleteTarget)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Consignment Detail dialog — read-only view with Send + Print       */
/* ------------------------------------------------------------------ */

function ConsignmentDetailDialog({
  consignment, itemsById, onOpenChange,
}: {
  consignment: consignmentsApi.Consignment | null;
  itemsById: Map<string, itemsApi.Item>;
  onOpenChange: (open: boolean) => void;
}) {
  if (!consignment) return null;
  const c = consignment;

  // Compute the same numbers the list row shows, so the detail
  // sheet reads consistently with the operator's outside view.
  let totalQty = 0, totalRetail = 0, totalComm = 0;
  const rowMath = c.items.map(it => {
    const qty      = it.receivedQty ?? 0;
    const price    = it.sellingPrice ?? 0;
    const supplier = it.supplierPrice ?? 0;
    let commPerUnit = 0;
    if (it.commissionType === 'amount')       commPerUnit = it.commissionValue ?? 0;
    else if (it.commissionType === 'percent') commPerUnit = price * (it.commissionValue ?? 0) / 100;
    const total     = qty * price;
    const rowComm   = qty * commPerUnit;
    totalQty    += qty;
    totalRetail += total;
    totalComm   += rowComm;
    return { it, qty, price, supplier, commPerUnit, total, rowComm };
  });

  const summaryText =
    `Consignment ${c.consignmentNo}\n` +
    `Supplier: ${c.supplierName ?? '—'}\n` +
    `Date: ${c.startDate}${c.endDate ? ` → ${c.endDate}` : ''}\n` +
    `Status: ${consignmentsApi.CONSIGNMENT_STATUS_LABELS[c.status]}\n\n` +
    rowMath.map(r => {
      const name = itemsById.get(r.it.stockItemId)?.name ?? '(unknown item)';
      return `• ${name}  qty ${r.qty}  retail ${formatUSD(r.price)}  supplier ${formatUSD(r.supplier)}  comm ${formatUSD(r.commPerUnit)}/unit`;
    }).join('\n') +
    `\n\nTotal Retail: ${formatUSD(totalRetail)}\nTotal Comm.: ${formatUSD(totalComm)}`;

  const handleSend = async () => {
    // navigator.share where available (mobile PWAs, some desktops),
    // clipboard fallback elsewhere. Either path gets the operator a
    // shareable summary without leaving the dialog.
    if (typeof navigator !== 'undefined' && (navigator as Navigator).share) {
      try {
        await (navigator as Navigator).share({ title: c.consignmentNo, text: summaryText });
      } catch { /* user cancelled the share sheet — no toast */ }
    } else {
      try {
        await navigator.clipboard.writeText(summaryText);
        toast.success('Consignment summary copied to clipboard');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Copy failed');
      }
    }
  };

  // Effective commission rate for the whole consignment — used on
  // both the on-screen detail and the print header. Derived from
  // totals so mixed-per-line rates still show a single meaningful
  // number (weighted average).
  const effectiveRatePct = totalRetail > 0
    ? Math.round((totalComm / totalRetail) * 100)
    : 0;

  const handlePrint = () => printConsignmentNote(c, itemsById);

  return (
    <Dialog open={!!consignment} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          {/* Title on the left, action buttons on the right — the
              paper-header equivalent lives in the print template only,
              so keeping these here saves a footer row on-screen and
              puts Print / Send within thumb-reach of the top-right
              close X the operator's mouse is already near. */}
          <div className="flex items-start justify-between gap-4">
            <DialogTitle className="text-2xl uppercase tracking-tight font-bold">
              Consignment Note
            </DialogTitle>
            <div className="flex items-center gap-2 shrink-0 mr-8">
              <Button variant="outline" size="sm" onClick={handleSend}>
                <Share2 className="h-3.5 w-3.5 mr-1.5" /> Send
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
              </Button>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Read-only detail view of consignment {c.consignmentNo}
          </DialogDescription>
        </DialogHeader>

        {/* Agreement & Document Details — matches the print block. */}
        <section className="p-4 bg-gray-50 border border-gray-300 rounded">
          <h3 className="text-base font-semibold text-slate-800 mb-4">
            Agreement &amp; Document Details
          </h3>
          <div className="grid grid-cols-3 gap-5 text-sm">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">Document ID</div>
              <div className="font-mono font-semibold mt-0.5">{c.consignmentNo}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">Date</div>
              <div className="font-mono font-semibold mt-0.5">{c.startDate}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">Status</div>
              <div className="mt-1">
                <Badge className={CONSIGN_TONE[c.status]}>
                  {consignmentsApi.CONSIGNMENT_STATUS_LABELS[c.status]}
                </Badge>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">Supplier to</div>
              <div className="font-semibold mt-0.5">{c.supplierName ?? '—'}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">Warehouse</div>
              <div className="font-semibold mt-0.5">{c.warehouseName ?? '—'}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">Commission Rate</div>
              <div className="font-semibold mt-0.5">{effectiveRatePct.toFixed(2)}%</div>
            </div>
          </div>
        </section>

        {/* Consigned Inventory — mirrors the print table's columns
            + row heights so the on-screen preview matches the paper
            output. */}
        <section>
          <h3 className="text-base font-semibold text-slate-800 mb-3">Consigned Inventory</h3>
          <div className="border-b-2 border-slate-800"></div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead className="w-14">Product</TableHead>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right w-16">Qty</TableHead>
                <TableHead className="text-right w-28">Retail Price</TableHead>
                <TableHead className="text-right w-28">$ Consignment</TableHead>
                <TableHead className="text-right w-28">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowMath.map((r, i) => {
                const item = itemsById.get(r.it.stockItemId);
                const img = item?.imageUrl || (item?.imageUrls && item.imageUrls[0]) || null;
                return (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{i + 1}</TableCell>
                    <TableCell>
                      <div className="h-10 w-10 rounded overflow-hidden bg-gray-100 border flex items-center justify-center">
                        {img ? (
                          <img src={img} alt=""
                            className="w-full h-full object-cover"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <Package className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{item?.sku ?? '—'}</TableCell>
                    <TableCell>{item?.name ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums font-mono">{formatNumber(r.qty)}</TableCell>
                    <TableCell className="text-right tabular-nums font-mono">{formatUSD(r.price)}</TableCell>
                    <TableCell className="text-right tabular-nums font-mono">{formatUSD(r.supplier)}</TableCell>
                    <TableCell className="text-right tabular-nums font-mono font-semibold">{formatUSD(r.total)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2 border-slate-800 bg-gray-50">
                <TableCell colSpan={4} className="text-right font-semibold">Totals:</TableCell>
                <TableCell className="text-right tabular-nums font-mono font-bold">{formatNumber(totalQty)}</TableCell>
                <TableCell colSpan={2}></TableCell>
                <TableCell className="text-right tabular-nums font-mono font-bold">{formatUSD(totalRetail)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>

        {c.notes && (
          <div className="text-xs text-gray-600 border-t pt-2 mt-2">
            <div className="text-gray-500 mb-1">Notes</div>
            {c.notes}
          </div>
        )}

        {/* Signature blocks live on the print template only — on
            screen they're dead space, so they're omitted here. */}
      </DialogContent>
    </Dialog>
  );
}

/** Minimal HTML escape for the print window template — the values we
 *  interpolate are already tenant-scoped data (no cross-user XSS
 *  vector), but a stray angle bracket in an item name shouldn't
 *  break the layout. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]!));
}

/** Consignment Note print helper — opens a fresh A4 window with the
 *  paper-format layout (matches the Detail dialog on-screen) and
 *  triggers print after a short delay so CDN images have time to
 *  load. Shared by both the Detail (View) dialog and the Edit
 *  dialog. */
function printConsignmentNote(
  c: consignmentsApi.Consignment,
  itemsById: Map<string, itemsApi.Item>,
): void {
  let totalQty = 0, totalRetail = 0, totalComm = 0;
  const rowMath = c.items.map(it => {
    const qty      = it.receivedQty ?? 0;
    const price    = it.sellingPrice ?? 0;
    const supplier = it.supplierPrice ?? 0;
    let commPerUnit = 0;
    if (it.commissionType === 'amount')       commPerUnit = it.commissionValue ?? 0;
    else if (it.commissionType === 'percent') commPerUnit = price * (it.commissionValue ?? 0) / 100;
    const total   = qty * price;
    const rowComm = qty * commPerUnit;
    totalQty    += qty;
    totalRetail += total;
    totalComm   += rowComm;
    return { it, qty, price, supplier, commPerUnit, total, rowComm };
  });
  const effectiveRatePct = totalRetail > 0
    ? Math.round((totalComm / totalRetail) * 100)
    : 0;
  const rowsHtml = rowMath.map((r, i) => {
    const item = itemsById.get(r.it.stockItemId);
    const name = item?.name ?? '(unknown)';
    const sku  = item?.sku ?? '';
    const img  = item?.imageUrl || (item?.imageUrls && item.imageUrls[0]) || '';
    const imgCell = img
      ? `<img src="${escapeHtml(img)}" alt="" style="width:36px;height:36px;object-fit:cover;border:1px solid #ddd;border-radius:2px" />`
      : '<div style="width:36px;height:36px;background:#f3f4f6;border:1px solid #ddd;border-radius:2px"></div>';
    return `<tr>
      <td style="text-align:center;font-family:'JetBrains Mono',monospace">${i + 1}</td>
      <td>${imgCell}</td>
      <td style="font-family:'JetBrains Mono',monospace">${escapeHtml(sku)}</td>
      <td>${escapeHtml(name)}</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace">${r.qty}</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace">${formatUSD(r.price)}</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace">${formatUSD(r.supplier)}</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace">${formatUSD(r.total)}</td>
    </tr>`;
  }).join('');
  const html = `<!doctype html><html><head>
    <meta charset="utf-8" />
    <title>${escapeHtml(c.consignmentNo)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Battambang:wght@300;400;700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
    <style>
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; }
      body {
        margin: 0; padding: 20mm;
        /* Battambang carries the Khmer glyphs; Hanken Grotesk covers
           Latin; system-ui as ultimate fallback. */
        font: 12px/1.45 'Hanken Grotesk', 'Battambang', system-ui, sans-serif;
        color: #0b1c30; background: #fff;
      }
      h1 { margin: 0 0 4px; font-size: 24px; letter-spacing: -0.02em; text-transform: uppercase; }
      h3 { font-size: 16px; margin: 0 0 12px; color: #131b2e; }
      .agreement {
        padding: 16px; margin: 24px 0;
        background: #eff4ff; border: 1px solid #c6c6cd; border-radius: 2px;
      }
      .agreement-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
      .label { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #45464d; }
      .value { font-size: 14px; font-weight: 600; margin-top: 2px; }
      .value.mono { font-family: 'JetBrains Mono', monospace; font-size: 13px; }
      .badge {
        display: inline-block; padding: 2px 8px; border-radius: 12px;
        background: #6cf8bb; color: #00714d;
        font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
      }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
      thead th {
        text-align: left; padding: 8px 6px;
        /* Thinner than the previous 2px so the rule reads as a
           divider not a heavyweight bar. */
        border-bottom: 1px solid #94a3b8;
        font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
        color: #45464d;
        white-space: nowrap;
      }
      thead th.right { text-align: right; }
      tbody td { padding: 10px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
      tfoot td {
        padding: 12px 6px; border-top: 1px solid #94a3b8; background: #eff4ff;
        font-weight: 700; font-family: 'Hanken Grotesk', system-ui, sans-serif;
      }
      tfoot td.mono { font-family: 'JetBrains Mono', monospace; }
      tfoot td.right { text-align: right; }
      .notes { margin-top: 24px; font-size: 11px; color: #45464d; }
      .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; margin-top: 48px; }
      .sig-line { border-bottom: 1px solid #c6c6cd; height: 56px; margin-bottom: 8px; }
      .sig-date { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 11px; color: #45464d; }
      .sig-date-line { border-bottom: 1px solid #c6c6cd; width: 128px; height: 16px; }
    </style>
  </head><body>
    <h1>Consignment Note</h1>

    <section class="agreement">
      <h3>Agreement &amp; Document Details</h3>
      <div class="agreement-grid">
        <div>
          <div class="label">Document ID</div>
          <div class="value mono">${escapeHtml(c.consignmentNo)}</div>
        </div>
        <div>
          <div class="label">Date</div>
          <div class="value mono">${escapeHtml(c.startDate)}</div>
        </div>
        <div>
          <div class="label">Status</div>
          <div style="margin-top:4px"><span class="badge">${escapeHtml(consignmentsApi.CONSIGNMENT_STATUS_LABELS[c.status])}</span></div>
        </div>
        <div>
          <div class="label">Supplier to</div>
          <div class="value">${escapeHtml(c.supplierName ?? '—')}</div>
        </div>
        <div>
          <div class="label">Warehouse</div>
          <div class="value">${escapeHtml(c.warehouseName ?? '—')}</div>
        </div>
        <div>
          <div class="label">Commission Rate</div>
          <div class="value">${effectiveRatePct.toFixed(2)}%</div>
        </div>
      </div>
    </section>

    <section>
      <h3>Consigned Inventory</h3>
      <table>
        <thead><tr>
          <th style="width:32px">#</th>
          <th style="width:48px">Product</th>
          <th style="width:80px">Code</th>
          <th>Description</th>
          <th class="right" style="width:56px">Qty</th>
          <th class="right" style="width:100px">Retail Price</th>
          <th class="right" style="width:112px">$ Consignment</th>
          <th class="right" style="width:90px">Total</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr>
          <td colspan="4" class="right">Totals:</td>
          <td class="right mono">${totalQty}</td>
          <td colspan="2"></td>
          <td class="right mono">${formatUSD(totalRetail)}</td>
        </tr></tfoot>
      </table>
    </section>

    ${c.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(c.notes)}</div>` : ''}

    <section class="signatures">
      <div>
        <div class="sig-line"></div>
        <div class="label">Seller's Signature</div>
        <div class="sig-date"><span>Date:</span><div class="sig-date-line"></div></div>
      </div>
      <div>
        <div class="sig-line"></div>
        <div class="label">Receiver's Signature</div>
        <div class="sig-date"><span>Date:</span><div class="sig-date-line"></div></div>
      </div>
    </section>
  </body></html>`;
  const w = window.open('', '_blank', 'width=900,height=1100');
  if (!w) { toast.error('Popup blocked — allow popups to print'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Wait for CDN fonts (Battambang for Khmer + Hanken Grotesk) AND
  // product images to land before the print snapshot fires.
  setTimeout(() => { w.focus(); w.print(); }, 700);
}

/* ------------------------------------------------------------------ */
/* Consignment Add / Edit dialog                                      */
/* ------------------------------------------------------------------ */

interface FormItem {
  id: string | null;
  stockItemId: string;
  /** Order QTY — how many units of this item are on this
   *  consignment line. Per the operator's single-shot model, saving
   *  the consignment posts an OUT (−) stock movement of Order QTY,
   *  so on save we mirror this into {@code soldQty} on the wire. */
  orderQty: string;
  /** Retail Price — what we sell each unit for. Wire field:
   *  {@code sellingPrice}. */
  retailPrice: string;
  /** $ Consignment (per unit) — dollar amount owed to the supplier
   *  for each unit sold on this line. Bidirectionally linked with
   *  {@code commissionAmount}: per-unit sum = Retail Price. Total
   *  supplier owed = qty × supplierAmount. */
  supplierAmount: string;
  /** Commission (per unit) — dollar amount we keep for each unit
   *  sold on this line. Bidirectionally linked with
   *  {@code supplierAmount}. Total Comm. shown in the row = qty ×
   *  commissionAmount. */
  commissionAmount: string;
  /** Pending commission rate (integer percent) — set when a new
   *  line inherits the % from line 0, or when the operator types
   *  a % in Comm mode. The rate is applied to the row's Retail
   *  Price the moment one lands (via item pick or manual entry),
   *  producing the per-unit $ split. Cleared when the operator
   *  types a raw dollar in Comm or $ Consignment (they've overridden
   *  the rate deliberately). UI-only, not persisted. */
  commissionRatePct: string | null;
}

const EMPTY_ITEM: FormItem = {
  id: null, stockItemId: '', orderQty: '0', retailPrice: '0.00',
  supplierAmount: '0.00', commissionAmount: '0.00', commissionRatePct: null,
};

function ConsignmentDialog({
  open, onOpenChange, editing, vendors, warehouses, items, itemsLoaded, onVendorAdded, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: consignmentsApi.Consignment | null;
  vendors: vendorsApi.Vendor[];
  warehouses: warehousesApi.Warehouse[];
  items: itemsApi.Item[];
  itemsLoaded: boolean;
  onVendorAdded: (v: vendorsApi.Vendor) => void;
  onSaved: () => Promise<void> | void;
}) {
  // Map for O(1) name lookup in the picker's "selected" display —
  // avoids items.find() per row-render on a long consignment.
  const itemById = useMemo(() => {
    const m = new Map<string, itemsApi.Item>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [status, setStatus] = useState<consignmentsApi.ConsignmentStatus>('draft');
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>('');
  /** Bulk-apply commission % — types a rate here, hits Apply, and
   *  every non-empty line (Retail > 0) gets its per-unit commission
   *  and $ Consignment rewritten to match. Blank rows are skipped so
   *  a stray unpicked line doesn't get filled in behind the operator. */
  const [bulkCommissionPct, setBulkCommissionPct] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<FormItem[]>([{ ...EMPTY_ITEM }]);
  const [saving, setSaving] = useState(false);
  const [nextNumber, setNextNumber] = useState<string>('');
  // Quick-add Supplier state — mirrors POS Customer quick-add
  // (v-pos-customer-searchable). Ref bridges the SearchablePicker's
  // onCreate promise to the sub-dialog: opening the dialog stashes
  // the promise handlers; Cancel rejects them so the picker stays
  // open without a phantom selection.
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierSaving, setNewSupplierSaving] = useState(false);
  const pendingSupplierCreateRef: MutableRefObject<{
    resolve: (v: PickerOption) => void;
    reject:  (e: Error) => void;
  } | null> = useRef(null);
  /** Column-level unit toggle for the Commission input:
   *   • '$' — operator enters our dollar cut directly (default).
   *   • '%' — operator enters our percent of gross; dollars derived.
   *  Storage on the wire is always dollars ({@code commission_type='amount'});
   *  the toggle is UI-only. */
  const [commissionMode, setCommissionMode] = useState<'$' | '%'>('$');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setSupplierId(editing.supplierId);
      setWarehouseId(editing.warehouseId ?? '');
      setStatus(editing.status);
      setStartDate(editing.startDate);
      setEndDate(editing.endDate ?? '');
      setNotes(editing.notes ?? '');
      // Open Edit in % mode by default so the operator reads the
      // agreement rate instead of raw per-unit dollars — matches
      // how consignment terms are negotiated ("30% commission",
      // not "$19.50 per unit").
      setCommissionMode('%');
      // Derive an effective rate from the loaded lines and seed the
      // bulk field with it. Sum(rowComm) ÷ Sum(rowRetail) — when all
      // lines share the same rate this equals that rate exactly;
      // mixed rates surface as the weighted average (still useful
      // as a starting point for Apply-all).
      let totalRetailForRate = 0;
      let totalCommForRate = 0;
      for (const it of editing.items) {
        const q = it.receivedQty ?? 0;
        const p = it.sellingPrice ?? 0;
        const g = q * p;
        totalRetailForRate += g;
        if (it.commissionType === 'amount')       totalCommForRate += q * (it.commissionValue ?? 0);
        else if (it.commissionType === 'percent') totalCommForRate += g * (it.commissionValue ?? 0) / 100;
      }
      const derivedRate = totalRetailForRate > 0
        ? Math.round((totalCommForRate / totalRetailForRate) * 100)
        : 0;
      setBulkCommissionPct(derivedRate > 0 ? String(derivedRate) : '');
      setLines(editing.items.length > 0 ? editing.items.map(it => {
        // Per-unit semantic: supplierPrice + commissionValue (when
        // type='amount') are dollars PER UNIT. 'percent' back-computes
        // per-unit commission from retail × pct / 100. Supplier per
        // unit = retail − commission per unit.
        const qty   = it.receivedQty ?? 0;
        const price = it.sellingPrice ?? 0;
        let commissionPerUnit = 0;
        if (it.commissionType === 'amount')       commissionPerUnit = it.commissionValue ?? 0;
        else if (it.commissionType === 'percent') commissionPerUnit = price * (it.commissionValue ?? 0) / 100;
        const supplierPerUnit = Math.max(0, price - commissionPerUnit);
        return {
          id: it.id,
          stockItemId: it.stockItemId,
          orderQty: String(qty),
          retailPrice: price.toFixed(2),
          supplierAmount:   supplierPerUnit.toFixed(2),
          commissionAmount: commissionPerUnit.toFixed(2),
          commissionRatePct: null,
        };
      }) : [{ ...EMPTY_ITEM }]);
    } else {
      setSupplierId('');
      setWarehouseId('');
      // Create-mode default is 'active' — Draft is now an explicit
      // footer button, so if the operator hits the primary Create
      // action they get a live agreement, not a draft.
      setStatus('active');
      setStartDate(new Date().toISOString().slice(0, 10));
      setEndDate('');
      // Create starts in $ mode with an empty bulk field — no data
      // to derive a rate from yet.
      setCommissionMode('$');
      setBulkCommissionPct('');
      setNotes('');
      setLines([{ ...EMPTY_ITEM }]);
      void consignmentsApi.nextNumber().then(r => setNextNumber(r.consignmentNo)).catch(() => setNextNumber(''));
    }
  }, [open, editing]);

  const setLine = (idx: number, patch: Partial<FormItem>) =>
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () =>
    setLines(prev => {
      // New lines inherit the commission RATE (%) from line 0 —
      // not the raw dollar amounts — so a line with a different
      // Retail Price doesn't end up with a nonsensical Comm % (e.g.
      // supplier's $45.50 fixed against an $18 retail item would
      // give 108%). Rate is applied when the row gets a Retail
      // Price (via item pick or manual entry); dollar fields start
      // at 0 so an unfilled new line reads as blank, not phantom.
      const first = prev[0];
      let ratePct: string | null = null;
      if (first) {
        if (first.commissionRatePct != null) {
          ratePct = first.commissionRatePct;
        } else {
          const p = Number(first.retailPrice) || 0;
          const c = Number(first.commissionAmount) || 0;
          if (p > 0) ratePct = String(Math.round((c / p) * 100));
        }
      }
      return [...prev, { ...EMPTY_ITEM, commissionRatePct: ratePct }];
    });
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  /** Bulk-apply the current {@link bulkCommissionPct} to every line
   *  whose Retail Price > 0. Blank rows (no Retail entered yet) are
   *  skipped so a stray unpicked line isn't rewritten behind the
   *  operator. Percent is clamped 0–100, dollars kept at 2 decimals. */
  const applyBulkCommission = () => {
    const pct = Math.min(100, Math.max(0, Math.round(Number(bulkCommissionPct) || 0)));
    if (!bulkCommissionPct.trim()) {
      toast.error('Enter a percentage first');
      return;
    }
    let touched = 0;
    setLines(prev => prev.map(l => {
      const retail = Number(l.retailPrice) || 0;
      if (retail <= 0) return l;
      const commission = +(retail * pct / 100).toFixed(2);
      touched += 1;
      return {
        ...l,
        commissionAmount: commission.toFixed(2),
        supplierAmount:   Math.max(0, retail - commission).toFixed(2),
      };
    }));
    if (touched === 0) toast.info('No lines with a Retail Price to apply to');
    else toast.success(`Applied ${pct}% to ${touched} line${touched === 1 ? '' : 's'}`);
  };

  const save = async (statusOverride?: consignmentsApi.ConsignmentStatus) => {
    if (!supplierId) { toast.error('Supplier is required'); return; }
    if (!startDate) { toast.error('Start date is required'); return; }
    const cleanLines = lines.filter(l => l.stockItemId);
    if (cleanLines.length === 0) { toast.error('At least one line item is required'); return; }
    // Enforce Order QTY > 0 on every line — a zero-qty consignment
    // row makes no sense (nothing to hand over → nothing to
    // decrement / settle). Blocks both Create and Save-changes.
    const zeroQtyLine = cleanLines.find(l => (Number(l.orderQty) || 0) <= 0);
    if (zeroQtyLine) {
      const it = items.find(i => i.id === zeroQtyLine.stockItemId);
      toast.error(`Order QTY must be greater than 0${it ? ` — "${it.name}"` : ''}`);
      return;
    }
    setSaving(true);
    try {
      const req: consignmentsApi.ConsignmentRequest = {
        supplierId,
        warehouseId: warehouseId || null,
        // statusOverride wins so the Draft button can commit as
        // 'draft' without racing setState.
        status: statusOverride ?? status,
        startDate,
        endDate: endDate || null,
        // settlement_period no longer surfaced in the form; keeping
        // the wire field null preserves BE compat.
        settlementPeriod: null,
        notes: notes.trim() || null,
        // Single-shot semantic: Order QTY hits both receivedQty and
        // soldQty on the wire so the consignment posts as an OUT (−)
        // movement on save (per the operator's model). Phase 3 will
        // decouple these when POS-driven accrual lands.
        //
        // Per-unit dollar model: supplierPrice and commissionValue
        // (with commissionType='amount') are both dollars PER UNIT
        // — matching the schema's original intent and the operator's
        // mental model ("Cola: $65 retail, $45.50 to supplier, $19.50
        // commission — all per bottle; times qty gives the totals").
        items: cleanLines.map((l, idx) => {
          const qty = Number(l.orderQty) || 0;
          const commissionPerUnit = Number(l.commissionAmount) || 0;
          const supplierPerUnit   = Number(l.supplierAmount) || 0;
          return {
            id: l.id,
            stockItemId: l.stockItemId,
            receivedQty:  qty,
            soldQty:      qty,
            returnedQty:  0,
            adjustedQty:  0,
            supplierPrice: supplierPerUnit,
            sellingPrice:  Number(l.retailPrice) || 0,
            commissionType: 'amount' as const,
            commissionValue: commissionPerUnit,
            sortOrder: idx,
          };
        }),
      };
      if (editing) {
        await consignmentsApi.update(editing.id, req);
        toast.success(`Updated ${editing.consignmentNo}`);
      } else {
        const created = await consignmentsApi.create(req);
        toast.success(`Created ${created.consignmentNo}`);
      }
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Two-panel layout: fixed header (title + action buttons)
          on top, scrolling body below. Overrides the DialogContent
          default padding via `p-0` so we own the vertical rhythm
          and can control which region scrolls. */}
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <div className="px-6 pt-6 pb-4 border-b bg-white shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold flex items-center gap-1.5">
                <span>{editing ? `Edit ${editing.consignmentNo}` : 'New Consignment'}</span>
                {/* Info icon on Create — hovering surfaces the
                    auto-mint format that used to live inline in the
                    description. Kept out of the visible header so
                    the top bar stays clean. */}
                {!editing && (
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600 transition"
                    title={
                      `Server auto-mints the consignment number (C-YYMM-001) on save.\n\n` +
                      `Format:\n` +
                      `  C     — Consignment prefix\n` +
                      `  YY    — 2-digit year (e.g. 26 for 2026)\n` +
                      `  MM    — 2-digit month (e.g. 08 for August)\n` +
                      `  001   — sequence within that month, zero-padded\n\n` +
                      (nextNumber ? `Next: ${nextNumber}` : '')
                    }
                    aria-label="Consignment number format info"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                )}
              </DialogTitle>
              {/* Description kept for Radix a11y but hidden visually
                  — the tooltip above carries the same content. */}
              <DialogDescription className="sr-only">
                {editing
                  ? `Editing ${editing.consignmentNo}`
                  : 'Server auto-mints the consignment number (C-YYMM-001) on save.'}
              </DialogDescription>
            </div>
            {/* Actions moved from the bottom Footer to the top-right.
                Print is edit-only — nothing to print on a fresh line.
                Save-as-Draft is create-only — Edit uses the visible
                Status dropdown to shift into draft. mr-8 reserves
                space for Radix's built-in × close button. */}
            <div className="flex items-center gap-2 shrink-0 mr-8">
              {editing && (
                <Button variant="outline" size="sm"
                  onClick={() => printConsignmentNote(editing, itemById)}>
                  <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
                </Button>
              )}
              <Button variant="outline" size="sm"
                onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              {!editing && (
                <Button variant="outline" size="sm"
                  onClick={() => save('draft')} disabled={saving}>
                  Save as Draft
                </Button>
              )}
              <Button size="sm" onClick={() => save()} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                {editing ? 'Save changes' : 'Create'}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Supplier <span className="text-red-500">*</span></Label>
            {/* Search-as-you-type picker with inline "+ Create" — same
                UX as the POS page's Customer picker so operators build
                the vendor list without leaving the consignment flow. */}
            <SearchablePicker
              className="h-9"
              placeholder="Select supplier…"
              searchPlaceholder="Search name / phone…"
              emptyResultsLabel="No supplier matches — type a name to create."
              allowClear={false}
              value={supplierId}
              onChange={setSupplierId}
              onCreate={async (name) => new Promise<PickerOption>((resolve, reject) => {
                // Bridge the picker's onCreate to the quick-add
                // sub-dialog: stash the promise handlers so Save can
                // resolve them and Cancel can reject them cleanly.
                pendingSupplierCreateRef.current = { resolve, reject };
                setNewSupplierName(name);
                setNewSupplierPhone('');
                setNewSupplierOpen(true);
              })}
              createLabel={q => `Add "${q}" as a new supplier`}
              options={vendors.map(v => {
                const phone = (v.phone ?? '').trim();
                // Last-4 phone tail as secondary — two same-name
                // suppliers still distinguishable. Full phone stays in
                // the search haystack so typing "01234" still matches.
                const phoneTail = phone.length >= 4 ? '••' + phone.slice(-4) : phone || undefined;
                return {
                  value: v.id,
                  label: v.name,
                  secondary: phoneTail,
                  searchKey: `${v.name} ${phone}`,
                };
              })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Warehouse</Label>
            <select
              value={warehouseId}
              onChange={e => setWarehouseId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">— None —</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Start date <span className="text-red-500">*</span></Label>
            <DateInput value={startDate} onChange={v => setStartDate(v ?? '')} className="h-9 w-full" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End date</Label>
            <DateInput value={endDate || null} onChange={v => setEndDate(v ?? '')} className="h-9 w-full" min={startDate || undefined} />
          </div>
          {/* Status dropdown lives on the Edit dialog only. Create
              uses the primary Create button (→ active) or the Draft
              button in the footer (→ draft) — no manual status pick. */}
          {editing && (
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as consignmentsApi.ConsignmentStatus)}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              >
                {(Object.keys(consignmentsApi.CONSIGNMENT_STATUS_LABELS) as consignmentsApi.ConsignmentStatus[]).map(k =>
                  <option key={k} value={k}>{consignmentsApi.CONSIGNMENT_STATUS_LABELS[k]}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Commission % — apply to all lines</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  type="number" min={0} max={100} step="1"
                  value={bulkCommissionPct}
                  onChange={e => setBulkCommissionPct(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyBulkCommission(); } }}
                  placeholder="e.g. 30"
                  className="h-9 pr-6 tabular-nums"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={applyBulkCommission}
                className="h-9"
                title="Rewrite $ Consignment + Comm. on every line where Retail Price is set. Blank rows are skipped."
              >
                Apply
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-semibold">Line items <span className="text-red-500">*</span></Label>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Each line posts an <span className="font-medium text-red-600">OUT (−) stock movement</span> of Order QTY on save.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addLine} className="h-7">
              <Plus className="h-3 w-3 mr-1" /> Add line
            </Button>
          </div>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item <span className="text-red-500">*</span></TableHead>
                  <TableHead className="text-right w-24">Order QTY</TableHead>
                  <TableHead className="text-right w-24">Retail Price</TableHead>
                  <TableHead className="text-right w-28">$ Consignment</TableHead>
                  <TableHead className="text-right w-32">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      <span>Comm.</span>
                      {/* Unit toggle — flips every Commission input in
                          the table between $ and % without changing
                          storage. Percent mode derives dollars from
                          gross on save. */}
                      <select
                        value={commissionMode}
                        onChange={e => setCommissionMode(e.target.value as '$' | '%')}
                        className="h-6 text-[11px] rounded border border-input bg-white px-1 font-normal"
                        title="Enter commission as a dollar amount or as a percent of gross"
                      >
                        <option value="$">$</option>
                        <option value="%">%</option>
                      </select>
                    </div>
                  </TableHead>
                  <TableHead className="text-right w-28">Total</TableHead>
                  <TableHead className="text-right w-28">Total Comm.</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Bulk-apply "Commission %" holding a value locks
                    every row's Comm. input — the operator has signaled
                    a global rate; per-row edits would fight the Apply
                    button. Clearing the bulk input re-enables edits. */}
                {lines.map((l, idx) => {
                  const bulkLocked = bulkCommissionPct.trim() !== '';
                  const qty   = Number(l.orderQty) || 0;
                  const price = Number(l.retailPrice) || 0;
                  // Per-unit semantic: the split rows are dollars per
                  // one unit; totals scale with qty.
                  const commissionPerUnit = Number(l.commissionAmount) || 0;
                  const supplierPerUnit   = Number(l.supplierAmount)   || 0;
                  const total     = qty * price;                 // Retail × qty
                  const totalComm = qty * commissionPerUnit;     // Commission × qty
                  // Drift: the per-unit split should sum to Retail
                  // Price. Changing retail with a rate lock keeps it
                  // in sync; a manual $ edit without adjusting the
                  // other side surfaces here.
                  const perUnitDrift = Math.abs(commissionPerUnit + supplierPerUnit - price);
                  const drift = perUnitDrift > 0.005;
                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        {/* Same package-icon-popover picker Invoices uses,
                            for consistency across all line-item forms.
                            requireStock=false — consignment items are
                            supplier-owned drop-ins, not pulled from our
                            on-hand inventory (matches Bills/Quotations). */}
                        <div className="flex items-center gap-1.5">
                          <StockItemPicker
                            catalog={items}
                            loaded={itemsLoaded}
                            onOpen={() => { /* eagerly loaded by parent */ }}
                            selectedId={l.stockItemId}
                            // Consignments hold on-hand stock we're
                            // handing over to the supplier's agreement
                            // and posting as an OUT movement — so the
                            // picker must show only items with actual
                            // inventory (Order Qty then caps at that).
                            requireStock={true}
                            // Strict layer: non-inventory items
                            // (services / digital) still get filtered
                            // even though they'd pass isItemSellable —
                            // physical goods only for consignment.
                            positiveStockOnly={true}
                            onPick={si => {
                              // Item pick unconditionally overwrites
                              // Retail Price with the catalog's sell
                              // price. Same cascade priority as the
                              // Retail input: bulk % → line rate lock
                              // → fallback 100% when $ Consignment=0.
                              const newRetail = Number(si.unitPrice ?? 0) || 0;
                              const patch: Partial<FormItem> = {
                                stockItemId: si.id,
                                retailPrice: newRetail.toFixed(2),
                              };
                              const bulkPct = Number(bulkCommissionPct) || 0;
                              if (bulkCommissionPct.trim() !== '' && bulkPct > 0) {
                                const comm = +(newRetail * bulkPct / 100).toFixed(2);
                                patch.commissionAmount = comm.toFixed(2);
                                patch.supplierAmount   = Math.max(0, newRetail - comm).toFixed(2);
                              } else if (l.commissionRatePct != null) {
                                const rate = Number(l.commissionRatePct) || 0;
                                const comm = +(newRetail * rate / 100).toFixed(2);
                                patch.commissionAmount = comm.toFixed(2);
                                patch.supplierAmount   = Math.max(0, newRetail - comm).toFixed(2);
                              } else if ((Number(l.supplierAmount) || 0) === 0) {
                                patch.commissionAmount = newRetail.toFixed(2);
                              }
                              setLine(idx, patch);
                            }}
                          />
                          <div className="text-sm truncate min-w-0 flex-1">
                            {l.stockItemId && itemById.get(l.stockItemId)
                              ? <span className="text-gray-900">{itemById.get(l.stockItemId)!.name}</span>
                              : <span className="text-gray-400">Select item…</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* Order QTY — pure scalar; per-unit split
                            doesn't move with qty. Capped at the
                            picked item's on-hand stock — consignment
                            posts an OUT movement, so we can't
                            transfer more units than we hold. */}
                        {(() => {
                          const stockCap = l.stockItemId
                            ? Number(itemById.get(l.stockItemId)?.stockQty ?? 0)
                            : 0;
                          const qtyN = Number(l.orderQty) || 0;
                          const qtyOver = qtyN > stockCap;
                          // Red border also fires on qty=0 for an
                          // already-picked item — Save will block
                          // that state, so surface it visually first.
                          const qtyZero = !!l.stockItemId && qtyN <= 0;
                          const badBorder = qtyOver || qtyZero;
                          return (
                            <>
                              <Input
                                type="number"
                                min={1}
                                max={l.stockItemId ? stockCap : undefined}
                                value={l.orderQty}
                                onChange={e => {
                                  const v = Number(e.target.value) || 0;
                                  const clamped = l.stockItemId ? Math.min(v, stockCap) : v;
                                  setLine(idx, { orderQty: String(clamped) });
                                }}
                                className={`h-8 text-xs text-right tabular-nums ${badBorder ? 'border-red-400' : ''}`}
                              />
                              {l.stockItemId && (
                                <div className="text-[10px] text-gray-500 mt-0.5 tabular-nums text-right">
                                  In stock: {stockCap.toLocaleString('en-US')}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {/* Retail Price (per unit). Cascade priority:
                             1. Bulk "Commission %" set → force split
                                to match bulk (Comm % stays locked,
                                $ Consignment adjusts). This is the
                                operator's "apply-all" intent — while
                                bulk holds a value, Retail edits keep
                                every line at that rate.
                             2. Otherwise if $ Consignment is still 0
                                (unset) → seed Comm = Retail so the
                                fresh line reads 100%.
                             3. Otherwise leave the split alone. */}
                        <Input type="number" min={0} step="0.01" value={l.retailPrice}
                          onChange={e => {
                            const newRetail = Number(e.target.value) || 0;
                            const patch: Partial<FormItem> = { retailPrice: e.target.value };
                            const bulkPct = Number(bulkCommissionPct) || 0;
                            if (bulkCommissionPct.trim() !== '' && bulkPct > 0) {
                              const comm = +(newRetail * bulkPct / 100).toFixed(2);
                              patch.commissionAmount = comm.toFixed(2);
                              patch.supplierAmount   = Math.max(0, newRetail - comm).toFixed(2);
                            } else if ((Number(l.supplierAmount) || 0) === 0) {
                              patch.commissionAmount = newRetail.toFixed(2);
                            }
                            setLine(idx, patch);
                          }}
                          className="h-8 text-xs text-right tabular-nums" />
                      </TableCell>
                      <TableCell>
                        {/* $ Consignment (per unit) — supplier's
                            price per unit. Bidirectional with Comm.
                            (relationship #1): editing this auto-fills
                            Commission so the per-unit split sums to
                            Retail Price. Also clears any pending rate
                            lock — a raw $ edit is a deliberate
                            override of any inherited %. */}
                        <Input type="number" min={0} step="0.01" value={l.supplierAmount}
                          onChange={e => {
                            const supplier = Number(e.target.value) || 0;
                            setLine(idx, {
                              supplierAmount: e.target.value,
                              commissionAmount: Math.max(0, price - supplier).toFixed(2),
                              commissionRatePct: null,
                            });
                          }}
                          className="h-8 text-xs text-right tabular-nums" />
                      </TableCell>
                      <TableCell>
                        {/* Commission — our cut. Input format is
                            driven by the column header's toggle:
                              $ mode → raw dollars (current behavior).
                              % mode → percent of gross; dollars
                                       derived so save stays canonical. */}
                        {commissionMode === '$' ? (
                          // Commission (per unit) in $ mode.
                          // Bidirectional with $ Consignment: editing
                          // this rebalances supplier so the per-unit
                          // split sums to Retail. Clears any rate
                          // lock — a raw $ is a deliberate override.
                          <Input type="number" min={0} step="0.01" value={l.commissionAmount}
                            disabled={bulkLocked}
                            onChange={e => {
                              const commission = Number(e.target.value) || 0;
                              setLine(idx, {
                                commissionAmount: e.target.value,
                                supplierAmount: Math.max(0, price - commission).toFixed(2),
                                commissionRatePct: null,
                              });
                            }}
                            className="h-8 text-xs text-right tabular-nums text-emerald-700 font-medium disabled:opacity-60 disabled:cursor-not-allowed" />
                        ) : (
                          <div className="relative">
                            <Input type="number" min={0} max={100} step="1"
                              // Integer-only percent (## format). When
                              // Retail > 0, derive % from the per-unit
                              // commission so the display stays in
                              // sync with any $ edits. When Retail = 0
                              // (blank row from Add-line inheritance),
                              // fall back to commissionRatePct so the
                              // inherited rate is visible before an
                              // item is picked.
                              disabled={bulkLocked}
                              value={price > 0
                                ? String(Math.round((Number(l.commissionAmount) || 0) / price * 100))
                                : (l.commissionRatePct ?? '0')}
                              onChange={e => {
                                const pct = Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0)));
                                // Per-unit commission = retail × pct%.
                                const commission = +(price * pct / 100).toFixed(2);
                                setLine(idx, {
                                  commissionAmount: commission.toFixed(2),
                                  supplierAmount: Math.max(0, price - commission).toFixed(2),
                                  // Typed % IS the rate lock — set so
                                  // subsequent item picks apply it to
                                  // the new Retail without retyping.
                                  commissionRatePct: String(pct),
                                });
                              }}
                              className="h-8 text-xs text-right tabular-nums text-emerald-700 font-medium pr-6 disabled:opacity-60 disabled:cursor-not-allowed" />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">%</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {/* Total = qty × Retail Price. Drift (per-unit
                            split ≠ Retail) tints amber; details are
                            in the tooltip rather than a subtext line. */}
                        <div className={`font-medium ${drift ? 'text-amber-700' : 'text-gray-900'}`}
                          title={drift
                            ? 'Per-unit $ Consignment + Commission ≠ Retail Price. Adjust one after changing Retail.'
                            : undefined}>
                          {formatUSD(total)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {/* Total Comm. = qty × Commission (per unit).
                            Scales linearly with Order QTY — the
                            operator's core mental model. */}
                        {totalComm > 0
                          ? <span className="font-medium text-emerald-700">{formatUSD(totalComm)}</span>
                          : <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => removeLine(idx)}
                          disabled={lines.length === 1}>
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-1 mt-3">
          <Label className="text-xs">Notes</Label>
          <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Optional agreement notes" />
        </div>

        </div>{/* end scrolling body */}

        {/* Quick-add Supplier sub-dialog. Mirrors POS Customer quick-add:
            resolves the picker's pending onCreate promise on save so
            the SearchablePicker closes with the new option selected,
            rejects it on cancel so no phantom selection lingers. */}
        <Dialog
          open={newSupplierOpen}
          onOpenChange={o => {
            if (!o && pendingSupplierCreateRef.current) {
              pendingSupplierCreateRef.current.reject(new Error('cancelled'));
              pendingSupplierCreateRef.current = null;
            }
            setNewSupplierOpen(o);
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Add supplier</DialogTitle>
              <DialogDescription className="sr-only">
                Create a new supplier so this consignment can reference it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={newSupplierName}
                  onChange={e => setNewSupplierName(e.target.value)}
                  className="h-9 mt-1"
                  placeholder="Supplier name"
                  maxLength={255}
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-xs">Phone (optional)</Label>
                <Input
                  value={newSupplierPhone}
                  onChange={e => setNewSupplierPhone(e.target.value)}
                  className="h-9 mt-1"
                  placeholder="012 345 678"
                  inputMode="tel"
                  maxLength={64}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  if (pendingSupplierCreateRef.current) {
                    pendingSupplierCreateRef.current.reject(new Error('cancelled'));
                    pendingSupplierCreateRef.current = null;
                  }
                  setNewSupplierOpen(false);
                }}
                disabled={newSupplierSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const name = newSupplierName.trim();
                  if (!name) { toast.error('Name is required'); return; }
                  setNewSupplierSaving(true);
                  try {
                    const created = await vendorsApi.create({
                      // Individual is the safer default — vendors marked
                      // 'business' require a TIN, which the quick-add
                      // flow doesn't collect. Operator can promote via
                      // the Vendors page later if needed.
                      type: 'individual',
                      name,
                      phone: newSupplierPhone.trim() || undefined,
                    });
                    onVendorAdded(created);
                    setSupplierId(created.id);
                    toast.success(`Added ${created.name}`);
                    pendingSupplierCreateRef.current?.resolve({
                      value: created.id,
                      label: created.name,
                      secondary: created.phone ?? undefined,
                    });
                    pendingSupplierCreateRef.current = null;
                    setNewSupplierOpen(false);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Failed to add supplier');
                  } finally {
                    setNewSupplierSaving(false);
                  }
                }}
                disabled={newSupplierSaving || !newSupplierName.trim()}
              >
                {newSupplierSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Add supplier
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Settlement tab                                                     */
/* ------------------------------------------------------------------ */

function ConsignmentSettlementView() {
  const [rows, setRows] = useState<settlementsApi.ConsignmentSettlement[]>([]);
  const [consignments, setConsignments] = useState<consignmentsApi.Consignment[]>([]);
  const [vendors, setVendors] = useState<vendorsApi.Vendor[]>([]);
  // Item catalog powers the "line items" display in the New /
  // Edit Settlement dialog once a consignment is picked — the
  // consignment DTO only carries stockItemId + prices; names come
  // from the items catalog. active=true mirrors POS behavior.
  const [items, setItems] = useState<itemsApi.Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<settlementsApi.ConsignmentSettlement | null>(null);
  const [viewing, setViewing] = useState<settlementsApi.ConsignmentSettlement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<settlementsApi.ConsignmentSettlement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c, v, i] = await Promise.all([
        settlementsApi.list({ size: 200 }),
        consignmentsApi.list({ size: 200 }),
        vendorsApi.list({ size: 500 }).catch(() => ({ content: [] as vendorsApi.Vendor[] } as any)),
        itemsApi.list({ size: 1000 }).catch(() => ({ content: [] as itemsApi.Item[] } as any)),
      ]);
      setRows(s.content ?? []);
      setConsignments(c.content ?? []);
      setVendors(v.content ?? []);
      setItems(i.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load settlements');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    count:       a.count + 1,
    gross:       a.gross + (r.grossSales ?? 0),
    commission:  a.commission + (r.commissionAmount ?? 0),
    outstanding: a.outstanding + (
      r.status === 'draft' || r.status === 'pending' ? (r.netAmount ?? 0) : 0
    ),
  }), { count: 0, gross: 0, commission: 0, outstanding: 0 }), [rows]);

  const doDelete = async (r: settlementsApi.ConsignmentSettlement) => {
    try {
      await settlementsApi.remove(r.id);
      toast.success(`Deleted ${r.settlementNo}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="stat-strip stat-cols-4">
        <StatCard label="Settlements"      value={formatNumber(totals.count)}       icon={ReceiptText} tone="blue" />
        <StatCard label="Gross Sales"      value={formatUSD(totals.gross)}          icon={DollarSign}  tone="green" />
        <StatCard label="Commission Kept"  value={formatUSD(totals.commission)}     icon={Wallet}      tone="amber"
          hint="Portion of gross that stays with us — the supplier gets net" />
        <StatCard label="Outstanding"      value={formatUSD(totals.outstanding)}    icon={Wallet}      tone="orange"
          hint="Net owed to suppliers on draft + pending settlements" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle>Supplier Settlements</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm"
              onClick={() => { setEditing(null); setDialogOpen(true); }}
              disabled={consignments.length === 0}
              title={consignments.length === 0 ? 'Create a consignment first' : undefined}>
              <Plus className="h-4 w-4 mr-1.5" /> New settlement
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              No settlements yet.
              {consignments.length === 0
                ? <> Create a consignment on the previous tab before you can settle one.</>
                : <> Click <b>New settlement</b> to record a period payout.</>}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Settlement No</TableHead>
                  <TableHead>Consignment</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium tabular-nums">{r.settlementNo}</TableCell>
                    <TableCell className="tabular-nums text-xs">{r.consignmentNo ?? '—'}</TableCell>
                    <TableCell>{r.supplierName ?? '—'}</TableCell>
                    <TableCell className="text-xs text-gray-600">
                      {r.periodFrom} → {r.periodTo}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatUSD(r.grossSales)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUSD(r.commissionAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUSD(r.deductionAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-emerald-700">
                      {formatUSD(r.netAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge className={SETTLE_TONE[r.status]}>
                        {settlementsApi.SETTLEMENT_STATUS_LABELS[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => setViewing(r)} title="View details">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm"
                          onClick={() => { setEditing(r); setDialogOpen(true); }}
                          title="Edit">
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm"
                          onClick={() => setDeleteTarget(r)}
                          title="Delete">
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <SettlementDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
          consignments={consignments}
          vendors={vendors}
          items={items}
          onSaved={async () => { setDialogOpen(false); await load(); }}
        />
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewing?.settlementNo}</DialogTitle>
            <DialogDescription>
              {viewing?.supplierName ?? 'Supplier'} · {viewing?.periodFrom} → {viewing?.periodTo}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2 flex items-center justify-between">
                <span className="text-gray-500">Status</span>
                <Badge className={SETTLE_TONE[viewing.status]}>
                  {settlementsApi.SETTLEMENT_STATUS_LABELS[viewing.status]}
                </Badge>
              </div>
              <div className="flex items-center justify-between"><span className="text-gray-500">Consignment</span><span className="tabular-nums">{viewing.consignmentNo ?? '—'}</span></div>
              <div className="flex items-center justify-between"><span className="text-gray-500">Settlement date</span><span>{viewing.settlementDate}</span></div>
              <div className="flex items-center justify-between"><span className="text-gray-500">Gross</span><span className="tabular-nums">{formatUSD(viewing.grossSales)}</span></div>
              <div className="flex items-center justify-between"><span className="text-gray-500">Commission</span><span className="tabular-nums">{formatUSD(viewing.commissionAmount)}</span></div>
              <div className="flex items-center justify-between"><span className="text-gray-500">Deductions</span><span className="tabular-nums">{formatUSD(viewing.deductionAmount)}</span></div>
              <div className="col-span-2 flex items-center justify-between border-t pt-2">
                <span className="text-gray-700 font-medium">Net owed to supplier</span>
                <span className="text-lg font-bold text-emerald-700 tabular-nums">{formatUSD(viewing.netAmount)}</span>
              </div>
              {viewing.notes && (
                <div className="col-span-2 text-xs text-gray-600 border-t pt-2">
                  <div className="text-gray-500 mb-1">Notes</div>
                  {viewing.notes}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.settlementNo}?</DialogTitle>
            <DialogDescription>
              This removes the settlement record. If the parent consignment was flipped to
              "settled" because of this row, its status won't roll back — adjust manually.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive"
              onClick={() => deleteTarget && doDelete(deleteTarget)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settlement Add / Edit dialog                                       */
/* ------------------------------------------------------------------ */

function SettlementDialog({
  open, onOpenChange, editing, consignments, vendors, items, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: settlementsApi.ConsignmentSettlement | null;
  consignments: consignmentsApi.Consignment[];
  vendors: vendorsApi.Vendor[];
  items: itemsApi.Item[];
  onSaved: () => Promise<void> | void;
}) {
  // Name lookup for the line-items list rendered under the
  // Consignment picker. O(1) instead of items.find() per row.
  const itemById = useMemo(() => {
    const m = new Map<string, itemsApi.Item>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);
  const today = new Date().toISOString().slice(0, 10);
  const [consignmentId, setConsignmentId] = useState('');
  const [settlementDate, setSettlementDate] = useState<string>(today);
  const [periodFrom, setPeriodFrom] = useState<string>(today);
  const [periodTo, setPeriodTo] = useState<string>(today);
  const [grossSales, setGrossSales] = useState('0');
  const [commissionAmount, setCommissionAmount] = useState('0');
  const [deductionAmount, setDeductionAmount] = useState('0');
  const [status, setStatus] = useState<settlementsApi.SettlementStatus>('draft');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setConsignmentId(editing.consignmentId);
      setSettlementDate(editing.settlementDate);
      setPeriodFrom(editing.periodFrom);
      setPeriodTo(editing.periodTo);
      setGrossSales(String(editing.grossSales ?? 0));
      setCommissionAmount(String(editing.commissionAmount ?? 0));
      setDeductionAmount(String(editing.deductionAmount ?? 0));
      setStatus(editing.status);
      setNotes(editing.notes ?? '');
    } else {
      setConsignmentId('');
      setSettlementDate(today);
      setPeriodFrom(today);
      setPeriodTo(today);
      setGrossSales('0');
      setCommissionAmount('0');
      setDeductionAmount('0');
      setStatus('draft');
      setNotes('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const netAmount =
    (Number(grossSales) || 0)
    - (Number(commissionAmount) || 0)
    - (Number(deductionAmount) || 0);

  const supplierName = useMemo(() => {
    const c = consignments.find(x => x.id === consignmentId);
    if (!c) return null;
    return c.supplierName ?? vendors.find(v => v.id === c.supplierId)?.name ?? null;
  }, [consignmentId, consignments, vendors]);

  const save = async () => {
    if (!consignmentId) { toast.error('Consignment is required'); return; }
    if (!settlementDate) { toast.error('Settlement date is required'); return; }
    if (!periodFrom || !periodTo) { toast.error('Period is required'); return; }
    if (new Date(periodFrom) > new Date(periodTo)) {
      toast.error('Period end must be on or after period start'); return;
    }
    setSaving(true);
    try {
      const req: settlementsApi.ConsignmentSettlementRequest = {
        consignmentId,
        settlementDate,
        periodFrom,
        periodTo,
        grossSales: Number(grossSales) || 0,
        commissionAmount: Number(commissionAmount) || 0,
        deductionAmount: Number(deductionAmount) || 0,
        netAmount: netAmount < 0 ? 0 : netAmount,
        status,
        notes: notes.trim() || null,
      };
      if (editing) {
        await settlementsApi.update(editing.id, req);
        toast.success(`Updated ${editing.settlementNo}`);
      } else {
        const created = await settlementsApi.create(req);
        toast.success(`Created ${created.settlementNo}`);
      }
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit ${editing.settlementNo}` : 'New Settlement'}
          </DialogTitle>
          <DialogDescription>
            One period's payout to the supplier — net = gross − commission − deductions.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Consignment <span className="text-red-500">*</span></Label>
            <select
              value={consignmentId}
              onChange={e => setConsignmentId(e.target.value)}
              disabled={!!editing}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm disabled:opacity-60 disabled:bg-gray-50"
            >
              <option value="">Select consignment…</option>
              {consignments.map(c =>
                <option key={c.id} value={c.id}>
                  {c.consignmentNo} — {c.supplierName ?? 'Unknown supplier'}
                </option>)}
            </select>
            {supplierName && (
              <div className="text-[10px] text-gray-500">Supplier: <span className="font-medium text-gray-700">{supplierName}</span></div>
            )}
          </div>

          {/* Line items of the picked consignment — read-only preview
              so the operator sees exactly what's being settled. Also
              stamps a per-line Total (qty × retail) and Comm./unit so
              the "Gross Sales" + "Commission (kept by us)" numbers
              they'll type below have a reference. */}
          {(() => {
            const picked = consignments.find(x => x.id === consignmentId);
            if (!picked || picked.items.length === 0) return null;
            let sumGross = 0, sumComm = 0;
            const rows = picked.items.map((it, idx) => {
              const qty   = it.receivedQty ?? 0;
              const price = it.sellingPrice ?? 0;
              let commPerUnit = 0;
              if (it.commissionType === 'amount')       commPerUnit = it.commissionValue ?? 0;
              else if (it.commissionType === 'percent') commPerUnit = price * (it.commissionValue ?? 0) / 100;
              const rowTotal = qty * price;
              const rowComm  = qty * commPerUnit;
              sumGross += rowTotal;
              sumComm  += rowComm;
              return { it, idx, qty, price, commPerUnit, rowTotal, rowComm };
            });
            return (
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Line items in this consignment</Label>
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right w-16">Qty</TableHead>
                        <TableHead className="text-right w-24">Retail</TableHead>
                        <TableHead className="text-right w-24">Comm./unit</TableHead>
                        <TableHead className="text-right w-24">Total</TableHead>
                        <TableHead className="text-right w-24">Total Comm.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(r => (
                        <TableRow key={r.idx}>
                          <TableCell className="tabular-nums text-xs">{r.idx + 1}</TableCell>
                          <TableCell className="text-xs">
                            {itemById.get(r.it.stockItemId)?.name ?? '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatNumber(r.qty)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatUSD(r.price)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatUSD(r.commPerUnit)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs font-medium">{formatUSD(r.rowTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs font-medium text-emerald-700">{formatUSD(r.rowComm)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 border-slate-300 bg-gray-50">
                        <TableCell colSpan={5} className="text-right font-semibold text-xs">Totals:</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-bold">{formatUSD(sumGross)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-bold text-emerald-700">{formatUSD(sumComm)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                {/* Quick-fill: dropping the consignment's own totals
                    into Gross Sales + Commission saves manual entry
                    when the operator settles the whole consignment
                    at once. Editable after, so partial settlements
                    still work. */}
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setGrossSales(sumGross.toFixed(2));
                      setCommissionAmount(sumComm.toFixed(2));
                    }}
                    title="Copy the consignment's own totals into the fields below"
                  >
                    Fill Gross + Comm. from consignment
                  </Button>
                </div>
              </div>
            );
          })()}

          <div className="space-y-1">
            <Label className="text-xs">Settlement date <span className="text-red-500">*</span></Label>
            <DateInput value={settlementDate} onChange={v => setSettlementDate(v ?? '')} className="h-9 w-full" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as settlementsApi.SettlementStatus)}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
            >
              {(Object.keys(settlementsApi.SETTLEMENT_STATUS_LABELS) as settlementsApi.SettlementStatus[]).map(k =>
                <option key={k} value={k}>{settlementsApi.SETTLEMENT_STATUS_LABELS[k]}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Period from <span className="text-red-500">*</span></Label>
            <DateInput value={periodFrom} onChange={v => setPeriodFrom(v ?? '')} className="h-9 w-full" max={periodTo || undefined} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Period to <span className="text-red-500">*</span></Label>
            <DateInput value={periodTo} onChange={v => setPeriodTo(v ?? '')} className="h-9 w-full" min={periodFrom || undefined} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Gross sales</Label>
            <Input type="number" min={0} step="0.01" value={grossSales}
              onChange={e => setGrossSales(e.target.value)}
              className="h-9 text-right tabular-nums" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Commission (kept by us)</Label>
            <Input type="number" min={0} step="0.01" value={commissionAmount}
              onChange={e => setCommissionAmount(e.target.value)}
              className="h-9 text-right tabular-nums" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Deductions</Label>
            <Input type="number" min={0} step="0.01" value={deductionAmount}
              onChange={e => setDeductionAmount(e.target.value)}
              className="h-9 text-right tabular-nums" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Net owed to supplier</Label>
            <div className="h-9 rounded-md border border-input bg-gray-50 px-2 flex items-center justify-end text-lg font-bold text-emerald-700 tabular-nums">
              {formatUSD(netAmount < 0 ? 0 : netAmount)}
            </div>
          </div>
        </div>

        <div className="space-y-1 mt-3">
          <Label className="text-xs">Notes</Label>
          <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Optional context for the payout" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            {editing ? 'Save changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
