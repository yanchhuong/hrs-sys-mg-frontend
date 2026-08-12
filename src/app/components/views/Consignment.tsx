// V309 — Consignment module (Sale > Consignment). Per-unit price
// model: retailPrice / supplierAmount / commissionAmount are all
// dollars per single unit; qty scales totals downstream.
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import {
  Handshake, Wallet, ReceiptText, Package, DollarSign,
  Plus, Loader2, RefreshCw, Trash2, Edit3, Eye, Copy, Printer, Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
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
import { useI18n } from '../../i18n/I18nContext';

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
  // Tab labels track the sidebar via the shared nav.* keys so
  // switching to Khmer flips both the left-menu leaf ("បញ្ញើលក់")
  // and the page's first tab in lock-step. Same for Settlement
  // ("ការទូរទាត់").
  const { t } = useI18n();
  return (
    <Tabs defaultValue="report" className="w-full">
      <TabsList>
        {/* km-title flips these two labels to Moul (the display
            Khmer script) when the app is in Khmer, matching the
            heavier titling style operators expect from headings /
            titles. No-op in en/zh — pure Latin/CJK text still
            renders in the default stack. */}
        <TabsTrigger value="report" className="km-title">{t('nav.consignment')}</TabsTrigger>
        <TabsTrigger value="settlement" className="km-title">{t('nav.settlement')}</TabsTrigger>
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
  // Read-only viewer target — the Eye button on every row (regardless
  // of status) sets this and re-uses the ConsignmentDialog in
  // readOnly mode so operators see the exact same layout as Edit
  // but with a Print + Close footer instead of save buttons.
  const [viewing, setViewing] = useState<consignmentsApi.Consignment | null>(null);
  // Copy source — the Copy button on every row sets this and re-uses
  // the ConsignmentDialog in "New consignment" mode with item lines
  // pre-filled from the source. Supplier is deliberately left empty
  // so the operator picks a (possibly different) partner.
  const [copyFrom, setCopyFrom] = useState<consignmentsApi.Consignment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<consignmentsApi.Consignment | null>(null);
  // Settlement refs per consignment — powers the "Ref No." column
  // (multiple settlements can attach to one consignment as it goes
  // through partial → paid rounds). Map keyed by consignmentId,
  // value is the list of settlementNos in creation order.
  const [refsByConsignment, setRefsByConsignment] = useState<Map<string, string[]>>(new Map());
  // Client-side filters — the tenant list fits comfortably in one
  // 200-row page fetch, so no need to round-trip to the BE for
  // typeahead / date-range filtering.
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, v, w, i, s] = await Promise.all([
        consignmentsApi.list({ size: 200 }),
        vendorsApi.list({ size: 500 }).catch(() => ({ content: [] as vendorsApi.Vendor[] } as any)),
        warehousesApi.list().catch(() => [] as warehousesApi.Warehouse[]),
        itemsApi.list({ size: 1000 }).catch(() => ({ content: [] as itemsApi.Item[] } as any)),
        settlementsApi.list({ size: 500 }).catch(() => ({ content: [] as settlementsApi.ConsignmentSettlement[] } as any)),
      ]);
      setRows(r.content ?? []);
      setVendors(v.content ?? []);
      setWarehouses(w ?? []);
      setItems(i.content ?? []);
      setItemsLoaded(true);
      // Group settlement numbers by their parent consignment so the
      // list row can show every settlement that's ever attached.
      // Sorted by settlementDate so the oldest reads first.
      const grouped = new Map<string, string[]>();
      const sortedSettlements = [...(s.content ?? [])]
        .sort((a: settlementsApi.ConsignmentSettlement, b: settlementsApi.ConsignmentSettlement) =>
          (a.settlementDate ?? '').localeCompare(b.settlementDate ?? ''));
      for (const st of sortedSettlements) {
        const arr = grouped.get(st.consignmentId) ?? [];
        arr.push(st.settlementNo);
        grouped.set(st.consignmentId, arr);
      }
      setRefsByConsignment(grouped);
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
              placeholder="Search by No, supplier, warehouse, or notes…"
              className="h-9 w-64 text-sm"
            />
            <Label className="text-xs text-gray-500">From</Label>
            <DateInput
              value={dateFrom || null}
              onChange={v => setDateFrom(v ?? '')}
              className="h-9 w-36 text-sm"
            />
            <Label className="text-xs text-gray-500">To</Label>
            <DateInput
              value={dateTo || null}
              onChange={v => setDateTo(v ?? '')}
              className="h-9 w-36 text-sm"
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
                  <TableHead>Ref No.</TableHead>
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
                  // Row actions gate: only draft consignments are
                  // mutable. Once a consignment goes active (which
                  // also means it's been through at least one save
                  // that posted the OUT stock movement), editing or
                  // deleting would leave the sold_qty accumulator
                  // and stock movement audit trail inconsistent.
                  const canMutate = c.status === 'draft';
                  const refs = refsByConsignment.get(c.id) ?? [];
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
                      <TableCell className="text-xs">
                        {refs.length === 0
                          ? <span className="text-gray-300">—</span>
                          : (
                            <div className="flex flex-wrap gap-1"
                              title={`${refs.length} settlement${refs.length === 1 ? '' : 's'}`}>
                              {refs.map(no => (
                                <span key={no}
                                  className="px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 font-mono text-[11px]">
                                  {no}
                                </span>
                              ))}
                            </div>
                          )}
                      </TableCell>
                      <TableCell>
                        <Badge className={CONSIGN_TONE[c.status]}>
                          {consignmentsApi.CONSIGNMENT_STATUS_LABELS[c.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {/* View is always visible — even locked
                              consignments stay inspectable + printable.
                              Opens the same ConsignmentDialog layout
                              wrapped in a disabled fieldset. */}
                          <Button variant="outline" size="sm"
                            onClick={() => setViewing(c)}
                            title="View">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {/* Copy is always visible — duplicating a
                              settled/active consignment onto a fresh
                              agreement is the whole reason the button
                              exists. Opens a new-consignment dialog
                              with items pre-filled but supplier blank
                              so the operator picks a new partner. */}
                          <Button variant="outline" size="sm"
                            onClick={() => setCopyFrom(c)}
                            title="Copy — new consignment, same items">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          {/* Edit + Delete only surface for draft rows.
                              Beyond draft, the row has posted a stock
                              movement + started accumulating settlement
                              breakdowns; late edits would rip that
                              audit trail apart. */}
                          {canMutate && (
                            <>
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
                            </>
                          )}
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

      {/* Copy variant — same ConsignmentDialog in NEW mode with the
          copyFrom prop set so items pre-populate from the source but
          supplier is blank + consignment number is auto-minted on
          save. Closing without saving discards the draft; saving
          calls load() so the fresh row appears in the list. */}
      {copyFrom && (
        <ConsignmentDialog
          open={!!copyFrom}
          onOpenChange={(o) => !o && setCopyFrom(null)}
          editing={null}
          copyFrom={copyFrom}
          vendors={vendors}
          warehouses={warehouses}
          items={items}
          itemsLoaded={itemsLoaded}
          onVendorAdded={v => setVendors(prev => [...prev, v])}
          onSaved={async () => { setCopyFrom(null); await load(); }}
        />
      )}

      {/* Read-only variant — same ConsignmentDialog component, wrapped
          in a disabled fieldset. Renders the exact Edit layout so
          operators recognize the shape immediately, but every field
          is inert and the footer shows Print + Close. */}
      {viewing && (
        <ConsignmentDialog
          open={!!viewing}
          onOpenChange={(o) => !o && setViewing(null)}
          editing={viewing}
          vendors={vendors}
          warehouses={warehouses}
          items={items}
          itemsLoaded={itemsLoaded}
          onVendorAdded={v => setVendors(prev => [...prev, v])}
          onSaved={async () => { setViewing(null); }}
          readOnly
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

/** Settlement Statement print helper — opens a fresh A4 window with
 *  the paper-format payout summary. Renders the parent consignment's
 *  line items (name, qty, sold, retail, commission-per-unit) plus the
 *  headline gross / commission / deductions / net totals so the
 *  supplier receives a full breakdown, not just aggregates. Shared
 *  by the read-only SettlementDialog. */
function printSettlementNote(
  s: settlementsApi.ConsignmentSettlement,
  consignments: consignmentsApi.Consignment[],
  itemsById: Map<string, itemsApi.Item>,
): void {
  const parent = consignments.find(c => c.id === s.consignmentId);
  // Sold quantities the operator entered on this settlement — pulled
  // from the persisted line breakdown (V313). Empty on legacy rows
  // written before the column existed; the render falls back to "—".
  const soldById = new Map<string, number>();
  for (const l of s.lineBreakdown ?? []) {
    soldById.set(l.consignmentItemId, Number(l.sold) || 0);
  }
  const rowsHtml = (parent?.items ?? []).map((it, i) => {
    const item = itemsById.get(it.stockItemId);
    const name = item?.name ?? '(unknown)';
    const sku  = item?.sku ?? '';
    const img  = item?.imageUrl || (item?.imageUrls && item.imageUrls[0]) || '';
    const imgCell = img
      ? `<img src="${escapeHtml(img)}" alt="" style="width:36px;height:36px;object-fit:cover;border:1px solid #ddd;border-radius:2px" />`
      : '<div style="width:36px;height:36px;background:#f3f4f6;border:1px solid #ddd;border-radius:2px"></div>';
    const qty   = it.receivedQty ?? 0;
    const price = it.sellingPrice ?? 0;
    let commPerUnit = 0;
    if (it.commissionType === 'amount')       commPerUnit = it.commissionValue ?? 0;
    else if (it.commissionType === 'percent') commPerUnit = price * (it.commissionValue ?? 0) / 100;
    const sold = soldById.get(it.id);
    const soldCell = sold != null ? String(sold) : '—';
    const rowTotal = (sold ?? 0) * price;
    return `<tr>
      <td style="text-align:center;font-family:'JetBrains Mono',monospace">${i + 1}</td>
      <td>${imgCell}</td>
      <td style="font-family:'JetBrains Mono',monospace">${escapeHtml(sku)}</td>
      <td>${escapeHtml(name)}</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace">${qty}</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace">${soldCell}</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace">${formatUSD(price)}</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace">${formatUSD(commPerUnit)}</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace">${formatUSD(rowTotal)}</td>
    </tr>`;
  }).join('');
  const html = `<!doctype html><html><head>
    <meta charset="utf-8" />
    <title>${escapeHtml(s.settlementNo)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Battambang:wght@300;400;700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
    <style>
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; }
      body {
        margin: 0; padding: 20mm;
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
        border-bottom: 1px solid #94a3b8;
        font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
        color: #45464d;
        white-space: nowrap;
      }
      thead th.right { text-align: right; }
      tbody td { padding: 10px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
      .totals {
        margin-top: 32px; padding: 16px;
        background: #eff4ff; border: 1px solid #c6c6cd; border-radius: 2px;
      }
      .totals-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 32px; }
      .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
      .total-row.net {
        border-top: 1px solid #94a3b8; margin-top: 8px; padding-top: 12px;
        font-size: 16px; font-weight: 700; color: #047857;
      }
      .notes { margin-top: 24px; font-size: 11px; color: #45464d; }
      .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; margin-top: 48px; }
      .sig-line { border-bottom: 1px solid #c6c6cd; height: 56px; margin-bottom: 8px; }
      .sig-date { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 11px; color: #45464d; }
      .sig-date-line { border-bottom: 1px solid #c6c6cd; width: 128px; height: 16px; }
    </style>
  </head><body>
    <h1>Settlement Statement</h1>

    <section class="agreement">
      <h3>Payout Details</h3>
      <div class="agreement-grid">
        <div>
          <div class="label">Settlement ID</div>
          <div class="value mono">${escapeHtml(s.settlementNo)}</div>
        </div>
        <div>
          <div class="label">Consignment</div>
          <div class="value mono">${escapeHtml(s.consignmentNo ?? '—')}</div>
        </div>
        <div>
          <div class="label">Status</div>
          <div style="margin-top:4px"><span class="badge">${escapeHtml(settlementsApi.SETTLEMENT_STATUS_LABELS[s.status])}</span></div>
        </div>
        <div>
          <div class="label">Supplier</div>
          <div class="value">${escapeHtml(s.supplierName ?? '—')}</div>
        </div>
        <div>
          <div class="label">Settlement date</div>
          <div class="value mono">${escapeHtml(s.settlementDate)}</div>
        </div>
        <div>
          <div class="label">Period</div>
          <div class="value mono">${escapeHtml(s.periodFrom)} → ${escapeHtml(s.periodTo)}</div>
        </div>
      </div>
    </section>

    ${parent && parent.items.length > 0 ? `
    <section>
      <h3>Line Breakdown</h3>
      <table>
        <thead><tr>
          <th style="width:32px">#</th>
          <th style="width:48px">Product</th>
          <th style="width:80px">Code</th>
          <th>Description</th>
          <th class="right" style="width:48px">Qty</th>
          <th class="right" style="width:56px">Sold</th>
          <th class="right" style="width:88px">Retail</th>
          <th class="right" style="width:96px">Comm/unit</th>
          <th class="right" style="width:96px">Line total</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </section>` : ''}

    <section class="totals">
      <h3>Amounts</h3>
      <div class="totals-grid">
        <div class="total-row"><span>Gross sales</span><span style="font-family:'JetBrains Mono',monospace">${formatUSD(s.grossSales ?? 0)}</span></div>
        <div class="total-row"><span>Commission (kept by us)</span><span style="font-family:'JetBrains Mono',monospace">${formatUSD(s.commissionAmount ?? 0)}</span></div>
        <div class="total-row"><span>Deductions</span><span style="font-family:'JetBrains Mono',monospace">${formatUSD(s.deductionAmount ?? 0)}</span></div>
        <div class="total-row net" style="grid-column:1 / -1"><span>Net owed to supplier</span><span style="font-family:'JetBrains Mono',monospace">${formatUSD(s.netAmount ?? 0)}</span></div>
      </div>
    </section>

    ${s.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(s.notes)}</div>` : ''}

    <section class="signatures">
      <div>
        <div class="sig-line"></div>
        <div class="label">Paid by</div>
        <div class="sig-date"><span>Date:</span><div class="sig-date-line"></div></div>
      </div>
      <div>
        <div class="sig-line"></div>
        <div class="label">Received by (Supplier)</div>
        <div class="sig-date"><span>Date:</span><div class="sig-date-line"></div></div>
      </div>
    </section>
  </body></html>`;
  const w = window.open('', '_blank', 'width=900,height=1100');
  if (!w) { toast.error('Popup blocked — allow popups to print'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
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
  open, onOpenChange, editing, copyFrom, vendors, warehouses, items, itemsLoaded, onVendorAdded, onSaved,
  readOnly = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: consignmentsApi.Consignment | null;
  /** Copy source. When set (and {@code editing} is null), the dialog
   *  opens in NEW-consignment mode with items pre-populated from this
   *  source's lines (their {@code id} stripped so the BE mints fresh
   *  rows), warehouse + notes pre-filled, but supplier LEFT BLANK so
   *  the operator must pick one. Consignment number is auto-minted on
   *  save like any other new consignment. */
  copyFrom?: consignmentsApi.Consignment | null;
  vendors: vendorsApi.Vendor[];
  warehouses: warehousesApi.Warehouse[];
  items: itemsApi.Item[];
  itemsLoaded: boolean;
  onVendorAdded: (v: vendorsApi.Vendor) => void;
  onSaved: () => Promise<void> | void;
  /** View mode — the whole form body is wrapped in a disabled
   *  {@code <fieldset>} so every input/select/button natively
   *  ignores clicks. The header swaps its action row to a Print +
   *  Close pair. Reuses the exact same layout as Edit so the two
   *  modes read as one dialog. */
  readOnly?: boolean;
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
    } else if (copyFrom) {
      // Copy source: mint a fresh consignment carrying every item
      // line from the source but WITHOUT its supplier (operator picks
      // fresh) and without any of the settlement accumulators. The
      // consignment number is server-auto-minted on save.
      setSupplierId('');
      setWarehouseId(copyFrom.warehouseId ?? '');
      // Same 'active' default as blank-create so the primary Create
      // button commits a live agreement (matches operator intent when
      // duplicating an in-flight consignment).
      setStatus('active');
      setStartDate(new Date().toISOString().slice(0, 10));
      setEndDate('');
      // Copy opens in % mode — same reasoning as Edit: the operator is
      // re-reading an existing agreement's commission structure.
      setCommissionMode('%');
      let totalRetailForRate = 0;
      let totalCommForRate = 0;
      for (const it of copyFrom.items) {
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
      setNotes(copyFrom.notes ?? '');
      setLines(copyFrom.items.length > 0 ? copyFrom.items.map(it => {
        const qty   = it.receivedQty ?? 0;
        const price = it.sellingPrice ?? 0;
        let commissionPerUnit = 0;
        if (it.commissionType === 'amount')       commissionPerUnit = it.commissionValue ?? 0;
        else if (it.commissionType === 'percent') commissionPerUnit = price * (it.commissionValue ?? 0) / 100;
        const supplierPerUnit = Math.max(0, price - commissionPerUnit);
        return {
          // id=null forces the BE to insert a NEW consignment_items
          // row instead of touching the source's line.
          id: null,
          stockItemId: it.stockItemId,
          orderQty: String(qty),
          retailPrice: price.toFixed(2),
          supplierAmount:   supplierPerUnit.toFixed(2),
          commissionAmount: commissionPerUnit.toFixed(2),
          commissionRatePct: null,
        };
      }) : [{ ...EMPTY_ITEM }]);
      void consignmentsApi.nextNumber().then(r => setNextNumber(r.consignmentNo)).catch(() => setNextNumber(''));
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
  }, [open, editing, copyFrom]);

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
        // v-consignment-partial-settlement — soldQty starts at 0 (was
        // = receivedQty in the earlier single-shot model). Settlements
        // bump it as units get sold, so "Available on this consignment"
        // = receivedQty - soldQty stays honest across multiple partial
        // settlements. The OUT stock movement at consignment save still
        // deducts receivedQty (goods physically transferred to the
        // supplier's shelf); soldQty tracks resale progress separately.
        items: cleanLines.map((l, idx) => {
          const qty = Number(l.orderQty) || 0;
          const commissionPerUnit = Number(l.commissionAmount) || 0;
          const supplierPerUnit   = Number(l.supplierAmount) || 0;
          return {
            id: l.id,
            stockItemId: l.stockItemId,
            receivedQty:  qty,
            soldQty:      0,
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
                <span>
                  {readOnly && editing
                    ? `View ${editing.consignmentNo}`
                    : editing
                      ? `Edit ${editing.consignmentNo}`
                      : copyFrom
                        ? `Copy of ${copyFrom.consignmentNo}`
                        : 'New Consignment'}
                </span>
                {/* Info icon on Create — hovering surfaces the
                    auto-mint format that used to live inline in the
                    description. Kept out of the visible header so
                    the top bar stays clean. */}
                {!editing && !readOnly && (
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
                {readOnly && editing
                  ? `Viewing ${editing.consignmentNo}`
                  : editing
                    ? `Editing ${editing.consignmentNo}`
                    : 'Server auto-mints the consignment number (C-YYMM-001) on save.'}
              </DialogDescription>
            </div>
            {/* Actions moved from the bottom Footer to the top-right.
                readOnly: [Print, Close] — same layout, no mutation.
                Edit:    [Print, Cancel, Save]
                Create:  [Cancel, Save Draft, Create]
                Print is edit / view only (nothing to print on a fresh
                blank line). mr-8 reserves space for Radix's × close. */}
            <div className="flex items-center gap-2 shrink-0 mr-8">
              {editing && (
                <Button variant="outline" size="sm"
                  onClick={() => printConsignmentNote(editing, itemById)}>
                  <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
                </Button>
              )}
              {readOnly ? (
                <Button variant="outline" size="sm"
                  onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-w-0">
        {/* Fieldset with native `disabled` inheritance — every input,
            select and button inside stops responding when readOnly.
            The `contents` display keeps layout identical to the
            unwrapped form (no extra box, no shifted spacing). */}
        <fieldset disabled={readOnly} className="contents">
        <div className="space-y-4">

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

        </div>{/* end space-y-4 inside fieldset */}
        </fieldset>
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
  // Client-side filters — same shape as the Consignment tab's
  // filter row. Search matches settlementNo / consignmentNo /
  // supplierName / notes. Date range checks settlementDate.
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

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

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(r => {
      if (term) {
        const hay = `${r.settlementNo} ${r.consignmentNo ?? ''} ${r.supplierName ?? ''} ${r.notes ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (dateFrom && r.settlementDate < dateFrom) return false;
      if (dateTo   && r.settlementDate > dateTo)   return false;
      return true;
    });
  }, [rows, search, dateFrom, dateTo]);

  const totals = useMemo(() => filteredRows.reduce((a, r) => ({
    count:       a.count + 1,
    gross:       a.gross + (r.grossSales ?? 0),
    commission:  a.commission + (r.commissionAmount ?? 0),
    outstanding: a.outstanding + (
      r.status === 'draft' || r.status === 'pending' ? (r.netAmount ?? 0) : 0
    ),
  }), { count: 0, gross: 0, commission: 0, outstanding: 0 }), [filteredRows]);

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
          {/* Filter strip — keyword search + From/To date range on
              settlementDate. Same shape the Consignment tab uses so
              the two lists read as one system. */}
          <div className="filter-strip">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by No, consignment, supplier, or notes…"
              className="h-9 w-64 text-sm"
            />
            <Label className="text-xs text-gray-500">From</Label>
            <DateInput
              value={dateFrom || null}
              onChange={v => setDateFrom(v ?? '')}
              className="h-9 w-36 text-sm"
            />
            <Label className="text-xs text-gray-500">To</Label>
            <DateInput
              value={dateTo || null}
              onChange={v => setDateTo(v ?? '')}
              className="h-9 w-36 text-sm"
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
            <Button size="sm"
              onClick={() => { setEditing(null); setDialogOpen(true); }}
              disabled={consignments.length === 0}
              title={consignments.length === 0 ? 'Create a consignment first' : undefined}>
              <Plus className="h-4 w-4 mr-1.5" /> New settlement
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRows.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              {rows.length === 0
                ? (
                  <>
                    No settlements yet.
                    {consignments.length === 0
                      ? <> Create a consignment on the previous tab before you can settle one.</>
                      : <> Click <b>New settlement</b> to record a period payout.</>}
                  </>
                )
                : <>No settlements match the current filter.</>}
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
                {filteredRows.map(r => {
                  // Once a settlement transitions from draft to any
                  // downstream status (pending/paid/cancelled), the
                  // sold_qty bumps + stock-return disposition have
                  // already been applied to the parent consignment.
                  // Editing or deleting past that point would leave
                  // the parent's accumulators in a nonsense state.
                  const canMutate = r.status === 'draft';
                  return (
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
                        {/* Only draft settlements are mutable — see
                            comment above. View stays visible in every
                            state so operators can still inspect a
                            paid settlement. */}
                        {canMutate && (
                          <>
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
                          </>
                        )}
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

      {/* Read-only variant of SettlementDialog — same layout as Edit
          wrapped in a disabled fieldset. Print button in the top bar
          renders the paper-format Settlement Statement. Always
          available (every row's Eye button opens this, regardless
          of settlement status). */}
      {viewing && (
        <SettlementDialog
          open={!!viewing}
          onOpenChange={(o) => !o && setViewing(null)}
          editing={viewing}
          consignments={consignments}
          vendors={vendors}
          items={items}
          onSaved={async () => { setViewing(null); }}
          readOnly
        />
      )}

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
  readOnly = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: settlementsApi.ConsignmentSettlement | null;
  consignments: consignmentsApi.Consignment[];
  vendors: vendorsApi.Vendor[];
  items: itemsApi.Item[];
  onSaved: () => Promise<void> | void;
  /** View mode — wraps the form body in a disabled fieldset so every
   *  input/select/button becomes inert. Header footer swaps to a
   *  Print + Close pair. Matches the ConsignmentDialog treatment so
   *  View and Edit read as one dialog across both entities. */
  readOnly?: boolean;
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
  // Period from/to fields retired from the UI — settlements are
  // one-shot for the whole consignment in the current model, so the
  // wire uses settlementDate for both. Schema keeps them for a
  // future partial-period flow without a migration.
  const [grossSales, setGrossSales] = useState('0');
  const [commissionAmount, setCommissionAmount] = useState('0');
  const [deductionAmount, setDeductionAmount] = useState('0');
  const [status, setStatus] = useState<settlementsApi.SettlementStatus>('draft');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  /** Per-line sold quantities the operator enters on this dialog.
   *  Keyed by consignment_items.id so re-picking the same consignment
   *  preserves whatever's already been typed. Defaults to 0 for each
   *  line — operator fills in what actually sold; Gross + Total Comm.
   *  on the table update live; the Fill button drops both into the
   *  Gross Sales / Commission inputs. */
  const [soldByLine, setSoldByLine] = useState<Record<string, string>>({});
  /** When status=paid AND at least one line has (Qty − Sold) > 0,
   *  the operator picks what to do with the remainder:
   *   • 'partial' — leave remainder on the consignment for the next
   *                 settlement round (default).
   *   • 'return'  — supplier takes the remainder back; consignment
   *                 gets closed after this settlement lands.
   *  Captured in the notes field on save (Phase 3 will promote this
   *  to a first-class column with real BE handling — stock IN for
   *  return, consignment.status = 'closed' etc.). UI-only for now. */
  const [disposition, setDisposition] = useState<'partial' | 'return'>('partial');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setConsignmentId(editing.consignmentId);
      setSettlementDate(editing.settlementDate);
      setGrossSales(String(editing.grossSales ?? 0));
      setCommissionAmount(String(editing.commissionAmount ?? 0));
      setDeductionAmount(String(editing.deductionAmount ?? 0));
      setStatus(editing.status);
      setNotes(editing.notes ?? '');
    } else {
      setConsignmentId('');
      setSettlementDate(today);
      setGrossSales('0');
      setCommissionAmount('0');
      setDeductionAmount('0');
      // Create-mode default is 'paid' — Draft is a separate footer
      // button, so the primary Create action commits a live payout.
      // Same pattern the Consignment dialog uses.
      setStatus('paid');
      setNotes('');
    }
    // On Edit open, pre-fill Sold from the persisted line breakdown
    // so the operator sees the actual sold quantities that built
    // this settlement (not zeros or defaults). Create starts empty
    // — the default-Available effect below fills it once a
    // consignment is picked.
    if (editing && editing.lineBreakdown && editing.lineBreakdown.length > 0) {
      const seed: Record<string, string> = {};
      for (const l of editing.lineBreakdown) {
        seed[l.consignmentItemId] = String(l.sold ?? 0);
      }
      setSoldByLine(seed);
    } else {
      setSoldByLine({});
    }
    setDisposition('partial'); // remainder defaults to "carry over"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  // Default the Sold column to Available (= Qty − Prev Sold) on
  // every consignment pick. Operator's most common intent is to
  // settle the whole remaining batch; anything less (partial) is
  // an easy edit-down. Skips lines that already have a value so
  // switching consignments and back doesn't wipe manual edits on
  // the same session.
  //
  // Also auto-populates Gross Sales + Commission from those Sold
  // defaults on Create (not Edit — the loaded settlement carries
  // its own amounts; overwriting would clobber the operator's
  // prior work). Fill Gross + Comm. from Sold button remains for
  // manual re-syncs after the operator edits Sold values.
  useEffect(() => {
    if (!open || !consignmentId) return;
    const picked = consignments.find(x => x.id === consignmentId);
    if (!picked) return;
    let sumGross = 0, sumComm = 0;
    setSoldByLine(prev => {
      const next: Record<string, string> = { ...prev };
      let changed = false;
      for (const it of picked.items) {
        const qty       = it.receivedQty ?? 0;
        const prevSold  = Math.min(qty, it.soldQty ?? 0);
        const available = Math.max(0, qty - prevSold);
        // Preserve manual edits; auto-fill on first pick only.
        if (next[it.id] === undefined) {
          next[it.id] = String(available);
          changed = true;
        }
        // Compute totals from whatever's in state now (either the
        // manual edit or the just-set Available default).
        const soldForTotals = Number(next[it.id] ?? '0') || 0;
        const price = it.sellingPrice ?? 0;
        let commPerUnit = 0;
        if (it.commissionType === 'amount')       commPerUnit = it.commissionValue ?? 0;
        else if (it.commissionType === 'percent') commPerUnit = price * (it.commissionValue ?? 0) / 100;
        sumGross += soldForTotals * price;
        sumComm  += soldForTotals * commPerUnit;
      }
      return changed ? next : prev;
    });
    // Only auto-populate Gross/Comm on Create — editing an existing
    // settlement should carry its persisted amounts as-is.
    if (!editing) {
      setGrossSales(sumGross.toFixed(2));
      setCommissionAmount(sumComm.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, consignmentId, consignments]);

  const netAmount =
    (Number(grossSales) || 0)
    - (Number(commissionAmount) || 0)
    - (Number(deductionAmount) || 0);

  const supplierName = useMemo(() => {
    const c = consignments.find(x => x.id === consignmentId);
    if (!c) return null;
    return c.supplierName ?? vendors.find(v => v.id === c.supplierId)?.name ?? null;
  }, [consignmentId, consignments, vendors]);

  const save = async (statusOverride?: settlementsApi.SettlementStatus) => {
    if (!consignmentId) { toast.error('Consignment is required'); return; }
    if (!settlementDate) { toast.error('Settlement date is required'); return; }
    setSaving(true);
    // statusOverride wins so the Draft button can commit as
    // 'draft' without racing setState with the visible Status
    // dropdown (edit mode).
    const effectiveStatus = statusOverride ?? status;
    try {
      // Per-line breakdown — BE bumps parent items' sold_qty when
      // status='paid'. Only sends rows the operator actually filled
      // (sold > 0) to keep the payload lean.
      const picked = consignments.find(x => x.id === consignmentId);
      const lines = picked
        ? picked.items
            .map(it => ({
              consignmentItemId: it.id,
              sold: Number(soldByLine[it.id] ?? '0') || 0,
            }))
            .filter(l => l.sold > 0)
        : [];
      // Disposition is a real request field now — BE handles the
      // Return Stock path (IN movement + stock_qty increment) and
      // the parent consignment status transition. Only sent when
      // status='paid' AND there's a remainder to dispose of;
      // omitted otherwise so draft/pending saves stay purely
      // recordational.
      const remaining = picked
        ? picked.items.reduce((sum, it) => {
            const qty      = it.receivedQty ?? 0;
            const prevSold = it.soldQty ?? 0;
            const thisSold = Number(soldByLine[it.id] ?? '0') || 0;
            return sum + Math.max(0, qty - prevSold - thisSold);
          }, 0)
        : 0;
      const dispositionToSend = (effectiveStatus === 'paid' && remaining > 0)
        ? disposition
        : undefined;
      const req: settlementsApi.ConsignmentSettlementRequest = {
        consignmentId,
        settlementDate,
        // Wire fields still required by the schema; UI retired the
        // period range in favour of a single settlement date. Both
        // pinned to settlementDate so period_to >= period_from
        // (CHECK constraint) always holds.
        periodFrom: settlementDate,
        periodTo:   settlementDate,
        grossSales: Number(grossSales) || 0,
        commissionAmount: Number(commissionAmount) || 0,
        deductionAmount: Number(deductionAmount) || 0,
        netAmount: netAmount < 0 ? 0 : netAmount,
        status: effectiveStatus,
        notes: notes.trim() || null,
        lines: lines.length > 0 ? lines : undefined,
        disposition: dispositionToSend,
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
      {/* Two-panel layout: fixed header (title + info tooltip +
          Cancel/Create) at top, scrolling body below. Overrides
          the DialogContent default padding via p-0 so we own the
          rhythm. Matches the Consignment dialog layout so the two
          modals read as one system. */}
      <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <div className="px-6 pt-6 pb-4 border-b bg-white shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold flex items-center gap-1.5">
                <span>
                  {readOnly && editing
                    ? `View ${editing.settlementNo}`
                    : editing
                      ? `Edit ${editing.settlementNo}`
                      : 'New Settlement'}
                </span>
                {/* Info icon — hovering surfaces the payout formula
                    that used to live inline in the description. */}
                {!readOnly && (
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600 transition"
                    title="One period's payout to the supplier — net = gross − commission − deductions."
                    aria-label="Settlement formula info"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                )}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {readOnly && editing
                  ? `Viewing ${editing.settlementNo}`
                  : editing
                    ? `Editing ${editing.settlementNo}`
                    : 'New settlement — net = gross minus commission minus deductions.'}
              </DialogDescription>
            </div>
            {/* Actions moved from the bottom Footer to the top-right.
                readOnly: [Print, Close]
                Edit:     [Cancel, Save changes]
                Create:   [Cancel, Save as Draft, Create]
                Print is view-only (Edit doesn't include it — matches
                the Consignment dialog's rule). mr-8 reserves space
                for Radix's built-in × close. */}
            <div className="flex items-center gap-2 shrink-0 mr-8">
              {readOnly && editing && (
                <Button variant="outline" size="sm"
                  onClick={() => printSettlementNote(editing, consignments, itemById)}>
                  <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
                </Button>
              )}
              {readOnly ? (
                <Button variant="outline" size="sm"
                  onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-w-0">
        {/* Fieldset with native `disabled` inheritance — same
            treatment as ConsignmentDialog so every input/select/
            button becomes inert in read-only mode. */}
        <fieldset disabled={readOnly} className="contents">
        <div className="space-y-4">

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
              {consignments
                // Hide fully-settled consignments — they've either
                // been closed via Return Stock or fully paid down,
                // so no further settlements should attach. The
                // 'cancelled' branch is filtered here too (dead
                // records). Edit mode keeps the current row
                // visible even if it's now settled — the operator
                // is looking at that exact settlement.
                .filter(c => c.status !== 'settled' && c.status !== 'cancelled'
                  || c.id === consignmentId)
                .map(c =>
                <option key={c.id} value={c.id}>
                  {c.consignmentNo} — {c.supplierName ?? 'Unknown supplier'}
                </option>)}
            </select>
            {supplierName && (
              <div className="text-[10px] text-gray-500">Supplier: <span className="font-medium text-gray-700">{supplierName}</span></div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Settlement date <span className="text-red-500">*</span></Label>
            <DateInput value={settlementDate} onChange={v => setSettlementDate(v ?? '')} className="h-9 w-full" />
          </div>
          {/* Status dropdown lives on Edit only. Create uses the
              primary Create button (→ paid) or the Save-as-Draft
              button in the top bar (→ draft) — no manual status
              pick needed at creation. */}
          {editing && (
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
          )}
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

        {/* Line items of the picked consignment. Editable Sold
            column starts at 0 per line, capped at Available (=
            receivedQty − soldQty). soldQty tracks cumulative sales
            from prior paid settlements — so a consignment that has
            been partially settled shows the correct remaining
            volume, not the initial consigned Qty. Row Total = sold
            × retail; Total Comm. = sold × commPerUnit; both live-
            update as the operator types. */}
        {(() => {
          const picked = consignments.find(x => x.id === consignmentId);
          if (!picked || picked.items.length === 0) return null;
          let sumGross = 0, sumComm = 0;
          const rows = picked.items.map((it, idx) => {
            const qty       = it.receivedQty ?? 0;
            // Defensive clamp: legacy rows may carry a soldQty above
            // receivedQty (old single-shot save + settlement bump).
            // V311 normalizes the DB; this keeps the display honest
            // for anyone opening the dialog before the migration
            // hits their instance.
            const prevSold  = Math.min(qty, it.soldQty ?? 0);
            const available = Math.max(0, qty - prevSold);
            const soldRaw = soldByLine[it.id] ?? '0';
            const sold = Number(soldRaw) || 0;
            const price = it.sellingPrice ?? 0;
            let commPerUnit = 0;
            if (it.commissionType === 'amount')       commPerUnit = it.commissionValue ?? 0;
            else if (it.commissionType === 'percent') commPerUnit = price * (it.commissionValue ?? 0) / 100;
            const rowTotal = sold * price;
            const rowComm  = sold * commPerUnit;
            sumGross += rowTotal;
            sumComm  += rowComm;
            return { it, idx, qty, prevSold, available, soldRaw, sold, price, commPerUnit, rowTotal, rowComm };
          });
          return (
            <div className="space-y-1 mt-4">
              <Label className="text-xs">Line items in this consignment</Label>
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right w-14">Qty</TableHead>
                      <TableHead className="text-right w-20">
                        <span title="Units already sold on prior settlements">Prev</span>
                      </TableHead>
                      <TableHead className="text-right w-16">
                        <span title="Available = Qty − Prev Sold. Cap for the Sold input on this settlement.">Avail</span>
                      </TableHead>
                      <TableHead className="text-right w-28">Sold</TableHead>
                      <TableHead className="text-right w-24">Retail</TableHead>
                      <TableHead className="text-right w-24">Comm./unit</TableHead>
                      <TableHead className="text-right w-24">Total</TableHead>
                      <TableHead className="text-right w-24">Total Comm.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(r => {
                      // Cap at Qty (not Avail) so the operator can
                      // always type — including on legacy consignments
                      // where Prev Sold happens to equal Qty from the
                      // old single-shot save default. Red border still
                      // fires when Sold > Avail so overselling past
                      // what prior settlements counted stays visible
                      // instead of silently blocked.
                      const over = r.sold > r.available;
                      return (
                        <TableRow key={r.idx}>
                          <TableCell className="tabular-nums text-xs">{r.idx + 1}</TableCell>
                          <TableCell className="text-xs">
                            {itemById.get(r.it.stockItemId)?.name ?? '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatNumber(r.qty)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs text-gray-500">{formatNumber(r.prevSold)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs font-medium">{formatNumber(r.available)}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              max={r.qty}
                              value={r.soldRaw}
                              // Sold is read-only on Edit — the
                              // settlement's soldQty bumps already
                              // flushed to the parent items on create;
                              // rewriting Sold here would drift from
                              // that accumulator. Value comes from
                              // editing.lineBreakdown via the init
                              // effect so operators still SEE what
                              // was settled.
                              disabled={!!editing}
                              onChange={e => {
                                const v = Number(e.target.value) || 0;
                                // Clamp at the initial Qty (hard cap
                                // — never oversell what was consigned).
                                // Between Avail and Qty is allowed but
                                // flagged: the operator has explicitly
                                // signalled a correction.
                                const clamped = Math.max(0, Math.min(v, r.qty));
                                setSoldByLine(prev => ({
                                  ...prev,
                                  [r.it.id]: String(clamped),
                                }));
                              }}
                              className={`h-7 text-xs text-right tabular-nums ${over ? 'border-amber-400' : ''} disabled:opacity-60 disabled:cursor-not-allowed`}
                              title={editing
                                ? 'Sold values are locked once the settlement is created — post-hoc changes would drift from the parent consignment_items.sold_qty accumulator.'
                                : (over
                                  ? `Sold > Available (${r.available}). Prior settlements had already counted ${r.prevSold} on this line — override only if you're correcting them.`
                                  : undefined)}
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatUSD(r.price)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatUSD(r.commPerUnit)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs font-medium">{formatUSD(r.rowTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs font-medium text-emerald-700">{formatUSD(r.rowComm)}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="border-t-2 border-slate-300 bg-gray-50">
                      <TableCell colSpan={8} className="text-right font-semibold text-xs">Totals:</TableCell>
                      <TableCell className="text-right tabular-nums text-xs font-bold">{formatUSD(sumGross)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs font-bold text-emerald-700">{formatUSD(sumComm)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
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
                  title="Copy the Sold-driven totals into Gross Sales + Commission above"
                >
                  Fill Gross + Comm. from Sold
                </Button>
              </div>
            </div>
          );
        })()}

        {/* Purpose of Settlement — surfaces when status='paid' AND
            any units are still unsold. "Unsold" = the residual
            volume after (a) what prior paid settlements already
            counted (soldQty on each line) and (b) what this
            settlement itself is settling (soldByLine input). Phase
            3 will wire the stock IN + consignment.status
            transition on Return; today the choice is captured in
            the notes field for the audit trail. */}
        {(() => {
          if (status !== 'paid') return null;
          const picked = consignments.find(x => x.id === consignmentId);
          if (!picked) return null;
          const remaining = picked.items.reduce((sum, it) => {
            const qty      = it.receivedQty ?? 0;
            const prevSold = it.soldQty ?? 0;
            const thisSold = Number(soldByLine[it.id] ?? '0') || 0;
            return sum + Math.max(0, qty - prevSold - thisSold);
          }, 0);
          if (remaining <= 0) return null;
          return (
            <div className="space-y-1 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
              <Label className="text-xs font-semibold text-amber-900">
                {remaining.toLocaleString('en-US')} unit{remaining === 1 ? '' : 's'} unsold — how do you settle the remainder?
              </Label>
              <div className="flex flex-col gap-1.5 mt-1">
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="settlement-disposition"
                    value="partial"
                    checked={disposition === 'partial'}
                    onChange={() => setDisposition('partial')}
                    className="mt-0.5"
                  />
                  <span>
                    <strong>Partial</strong> — leave the remainder on the consignment for the next settlement round. Consignment stays open.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="settlement-disposition"
                    value="return"
                    checked={disposition === 'return'}
                    onChange={() => setDisposition('return')}
                    className="mt-0.5"
                  />
                  <span>
                    <strong>Return Stock</strong> — supplier takes the {remaining.toLocaleString('en-US')} unsold unit{remaining === 1 ? '' : 's'} back. Consignment closes after this settlement.
                  </span>
                </label>
              </div>
            </div>
          );
        })()}

        <div className="space-y-1 mt-3">
          <Label className="text-xs">Notes</Label>
          <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Optional context for the payout" />
        </div>

        </div>{/* end space-y-4 inside fieldset */}
        </fieldset>
        </div>{/* end scrolling body */}
      </DialogContent>
    </Dialog>
  );
}
