import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { SearchablePicker } from '../common/SearchablePicker';
import * as billsApi from '../../api/bills';
import * as billPaymentsApi from '../../api/billPayments';
import * as customersApi from '../../api/customers';
import {
  Plus, Trash2, RefreshCw, FileText, Receipt, CornerDownRight, CornerUpRight,
  Send, Ban, Eye, ChevronDown, Printer, Pencil, Search, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

/* -------------------------------------------------------------------------- */
/* Kind / status helpers — labels, badge colours, icons                       */
/* -------------------------------------------------------------------------- */
/** Bills come in one root flavour ("Bill") plus the two adjustment
 *  shapes — there's no Commercial vs Tax split like the sale side
 *  has. The schema still uses `commercial` as the root kind so the
 *  ledger logic and the parent_bill_id CHECK constraint stay
 *  aligned; it just reads as "Bill" everywhere in the UI, and we
 *  refuse `tax` on the create dropdown / filter so no one creates a
 *  Bill of the other shape by accident. */
const KIND_LABEL: Record<billsApi.BillKind, string> = {
  commercial:  'Bill',
  tax:         'Bill',
  credit_note: 'Credit Note',
  debit_note:  'Debit Note',
};
const KIND_BADGE_CLASS: Record<billsApi.BillKind, string> = {
  commercial:  'border-blue-300 text-blue-700 bg-blue-50',
  tax:         'border-blue-300 text-blue-700 bg-blue-50',
  credit_note: 'border-emerald-300 text-emerald-700 bg-emerald-50',
  debit_note:  'border-amber-300 text-amber-700 bg-amber-50',
};
const STATUS_BADGE_CLASS: Record<billsApi.BillStatus, string> = {
  draft:     'border-slate-300 text-slate-700 bg-slate-50',
  progress:  'border-blue-300 text-blue-700 bg-blue-50',
  partially: 'border-amber-300 text-amber-700 bg-amber-50',
  paid:      'border-emerald-300 text-emerald-700 bg-emerald-50',
  overdue:   'border-orange-400 text-orange-800 bg-orange-50',
  void:      'border-red-300 text-red-700 bg-red-50',
};

const KIND_FILTERS: ReadonlyArray<{ value: billsApi.BillKind | 'all'; label: string }> = [
  { value: 'all',         label: 'All' },
  { value: 'commercial',  label: 'Bills' },
  { value: 'credit_note', label: 'Credit Notes' },
  { value: 'debit_note',  label: 'Debit Notes' },
];

/** Render an amount with the currency in front. USD collapses to "$"
 *  (no space — matches how customers read it on a printed invoice);
 *  other currencies keep the ISO code prefix with a space so the
 *  symbol stays unambiguous. */
const fmtMoney = (n: number, currency: string): string => {
  const num = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'USD' ? `$${num}` : `${currency} ${num}`;
};

/** Taxation matrix — datakey → display label + percentage. Mirrors
 *  the cross-system reference; backend service uses the same rates. */
const TAX_TYPES: ReadonlyArray<{ key: billsApi.BillTaxType; label: string; rate: number }> = [
  { key: '1',  label: 'VAT 10%',                rate: 10 },
  { key: '2',  label: 'VAT 0%',                 rate: 0 },
  { key: '3',  label: 'Exclusive VAT',          rate: 0 },
  { key: '11', label: 'WHT Tax on Service 15%', rate: 15 },
  { key: '12', label: 'WHT Tax on Service 14%', rate: 14 },
];
const TAX_TYPE_BY_KEY: Record<string, typeof TAX_TYPES[number]> =
  TAX_TYPES.reduce((acc, t) => ({ ...acc, [t.key]: t }), {});
/** Which datakeys each kind can pick. CN/DN inherit the parent's set
 *  in service-layer guard; the UI receives the parent's kind via
 *  prop so the dropdown filters to the right subset. */
/** Bills only have one root kind — treated as a full "Tax Bill" so
 *  every taxation pattern is available. CN/DN against a Bill inherit
 *  the same full set. parentKind is kept in the signature for API
 *  parity with the Invoices surface but has no effect here. */
const TAX_TYPES_FOR_KIND = (_kind: billsApi.BillKind, _parentKind?: billsApi.BillKind): typeof TAX_TYPES => {
  return TAX_TYPES;
};

/**
 * Inline confirmation card shown below the customer picker in the
 * invoice form. Business vendors expose the columns the printed
 * invoice will pick up (TIN / representative / site / address);
 * individuals show phone + address. Renders nothing when no
 * customer is selected.
 */
function CustomerInfoCard({ customer }: { customer: customersApi.Customer | undefined }) {
  if (!customer) return null;
  const rows: Array<{ label: string; value: string | null | undefined }> =
    customer.type === 'business'
      ? [
          { label: 'Company',        value: customer.name },
          { label: 'TIN',            value: customer.tin },
          { label: 'Representative', value: customer.representative },
          { label: 'Phone',          value: customer.phone },
          { label: 'Site',           value: customer.site },
          { label: 'Address',        value: customer.address },
        ]
      : [
          { label: 'Name',    value: customer.name },
          { label: 'Phone',   value: customer.phone },
          { label: 'Address', value: customer.address },
        ];
  return (
    <div className={`mt-2 rounded-md border px-3 py-2 text-xs ${
      customer.type === 'business' ? 'bg-violet-50 border-violet-200' : 'bg-emerald-50 border-emerald-200'
    }`}>
      <div className="flex items-center gap-1.5 mb-1 font-medium text-[11px] uppercase tracking-wide text-gray-500">
        {customer.type === 'business' ? 'Business vendor' : 'Individual vendor'}
      </div>
      <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-0.5">
        {rows.filter(r => r.value && String(r.value).trim()).map(r => (
          <div key={r.label} className="contents">
            <div className="text-gray-500">{r.label}</div>
            <div className="text-gray-800">{r.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main page component                                                        */
/* -------------------------------------------------------------------------- */
export function Bills() {
  const { canCreate, canUpdate, canDelete } = useAuth();
  const canAdd = canCreate('bill');
  const canEdit = canUpdate('bill');
  const canRemove = canDelete('bill');

  const [rows, setRows] = useState<billsApi.Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [kindFilter, setKindFilter] = useState<billsApi.BillKind | 'all'>('all');
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  // Date-range + keyword filters — applied client-side over the rows
  // we already loaded so HR sees instant feedback when scrubbing dates
  // or typing without round-tripping for each keystroke.
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [formKind, setFormKind] = useState<billsApi.BillKind>('commercial');
  /** When set, the form dialog runs in edit-mode against this invoice
   *  instead of opening blank for a fresh create. */
  const [formEditing, setFormEditing] = useState<billsApi.Bill | null>(null);
  /** When set, the form dialog opens for a CN/DN pre-pointing at this
   *  invoice id (skips the parent picker — saves a click from the
   *  inline "adjust" dropdown on each commercial/tax row). */
  const [formParentPrefill, setFormParentPrefill] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<billsApi.Bill | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [invRes, custRes] = await Promise.all([
        billsApi.list({ kind: kindFilter === 'all' ? undefined : kindFilter, size: 200 }),
        customersApi.list({ size: 500 }),
      ]);
      setRows(invRes.content ?? []);
      setCustomers(custRes.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load bills');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kindFilter]);

  const customerById = useMemo(() => {
    const m = new Map<string, customersApi.Customer>();
    customers.forEach(c => m.set(c.id, c));
    return m;
  }, [customers]);

  /**
   * Filter by date range + free-text keyword, then group adjustments
   * under their parents. Filters are client-side over the loaded
   * page so HR gets instant feedback. Keyword matches invoice
   * number, customer name, or notes (case-insensitive); date range
   * is inclusive and either end may be open.
   */
  const groupedRows = useMemo(() => {
    if (rows.length === 0) return rows;
    const q = search.trim().toLowerCase();
    const passesFilters = (r: billsApi.Bill): boolean => {
      if (dateFrom && r.issueDate < dateFrom) return false;
      if (dateTo   && r.issueDate > dateTo)   return false;
      if (!q) return true;
      const customerName = customerById.get(r.customerId)?.name?.toLowerCase() ?? '';
      return r.billNo.toLowerCase().includes(q)
          || customerName.includes(q)
          || (r.notes ?? '').toLowerCase().includes(q);
    };

    // For grouping: keep an adjustment visible if it OR its parent passes.
    // The parent stays visible too in that case so the chain isn't broken.
    const parentOf = new Map<string, billsApi.Bill>();
    rows.forEach(r => parentOf.set(r.id, r));
    const keepIds = new Set<string>();
    for (const r of rows) {
      if (passesFilters(r)) {
        keepIds.add(r.id);
        if (r.parentBillId && parentOf.has(r.parentBillId)) keepIds.add(r.parentBillId);
      }
    }
    const visible = rows.filter(r => keepIds.has(r.id));

    const adjustmentsByParent = new Map<string, billsApi.Bill[]>();
    const orphans: billsApi.Bill[] = [];
    const rowIds = new Set(visible.map(r => r.id));
    for (const r of visible) {
      if (!r.parentBillId) continue;
      if (rowIds.has(r.parentBillId)) {
        if (!adjustmentsByParent.has(r.parentBillId)) adjustmentsByParent.set(r.parentBillId, []);
        adjustmentsByParent.get(r.parentBillId)!.push(r);
      } else {
        orphans.push(r);
      }
    }
    const out: billsApi.Bill[] = [];
    for (const r of visible) {
      if (r.parentBillId) continue;
      out.push(r);
      const kids = adjustmentsByParent.get(r.id);
      if (kids) out.push(...kids);
    }
    return [...out, ...orphans];
  }, [rows, search, dateFrom, dateTo, customerById]);

  const pagination = usePagination(groupedRows, 25);

  /** Per-currency sum of total / paid / remaining across the
   *  *filtered* set (not just the current page) so HR can see the
   *  receivable book at a glance. Mixed currencies stay grouped —
   *  adding USD to KHR would produce nonsense.
   *
   *  Paid is the *net* customer inflow: invoice + DN receipts add,
   *  CN refunds subtract (regardless of how the row's direction
   *  column was stored). Remain only sums root invoices since
   *  adjustments already roll up into the root's netBalance. */
  const totalsByCurrency = useMemo(() => {
    const m = new Map<string, { total: number; paid: number; remain: number }>();
    for (const r of groupedRows) {
      const c = r.currency || 'USD';
      if (!m.has(c)) m.set(c, { total: 0, paid: 0, remain: 0 });
      const slot = m.get(c)!;
      // CN total represents what we owe the customer → subtract from
      // the running Total. INV + DN add as receivables.
      slot.total += r.kind === 'credit_note' ? -r.total : r.total;
      // CN's paid is a refund — subtract magnitude so the net Paid
      // total reflects what we actually received from the customer.
      slot.paid += r.kind === 'credit_note' ? -Math.abs(r.paidAmount) : r.paidAmount;
      if (!r.parentBillId) {
        slot.remain += r.netBalance ?? (r.total - r.paidAmount);
      }
    }
    return [...m.entries()].map(([currency, sums]) => ({ currency, ...sums }));
  }, [groupedRows]);

  const openCreate = (kind: billsApi.BillKind) => {
    setFormEditing(null);
    setFormParentPrefill(null);
    setFormKind(kind);
    setFormOpen(true);
  };

  /** Open the form dialog for a credit / debit note pre-pointing at
   *  the given parent invoice. Used by the inline dropdown on each
   *  commercial / tax row so HR doesn't have to manually pick the
   *  parent in the form. */
  const openAdjustment = (parent: billsApi.Bill, kind: 'credit_note' | 'debit_note') => {
    setFormEditing(null);
    setFormParentPrefill(parent.id);
    setFormKind(kind);
    setFormOpen(true);
  };

  /** Switch from the detail dialog into edit-mode on the form dialog
   *  pre-filled with this invoice. The detail dialog closes; on save
   *  the list refetches and the user lands back on the list view. */
  const openEdit = (inv: billsApi.Bill) => {
    setFormEditing(inv);
    setFormParentPrefill(null);
    setFormKind(inv.kind);
    setDetailId(null);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await billsApi.remove(deleteTarget.id);
      toast.success(`Deleted ${deleteTarget.billNo}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Bill</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canAdd && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1.5" />
                  New Bill
                  <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {/* Bills have a single root kind ("Bill") — no
                    Commercial / Tax split like the sale side. The
                    Bill row gets all five tax patterns. */}
                <DropdownMenuItem onClick={() => openCreate('commercial')}>
                  <FileText className="h-4 w-4 mr-2 text-blue-600" /> Bill
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openCreate('credit_note')}>
                  <CornerDownRight className="h-4 w-4 mr-2 text-emerald-600" /> Credit Note
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openCreate('debit_note')}>
                  <CornerUpRight className="h-4 w-4 mr-2 text-amber-600" /> Debit Note
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Tabs value={kindFilter} onValueChange={v => setKindFilter(v as typeof kindFilter)}>
              <TabsList>
                {KIND_FILTERS.map(f => (
                  <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              {/* Date range — inclusive, either end may be open. Backend
                  returns the most recent rows; the range narrows the
                  loaded page so HR doesn't need to re-fetch per scrub. */}
              <Label className="text-xs text-gray-500">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 w-36 text-sm"
              />
              <Label className="text-xs text-gray-500">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 w-36 text-sm"
              />
              {(dateFrom || dateTo) && (
                <Button
                  size="sm" variant="ghost" className="h-8 text-xs"
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                >
                  Clear
                </Button>
              )}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search bill no, vendor, notes…"
                  className="h-8 pl-7 w-64 text-sm"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
          ) : groupedRows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {rows.length === 0 ? 'No bills yet.' : 'No bills match your filters.'}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Bill No.</TableHead>
                    <TableHead className="w-[130px]">Type</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              AP
                              <Info className="h-3 w-3 text-gray-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Accounts Payable — what we still owe the vendor after the full ledger (bill + DN − CN − net payments).</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="text-right w-[160px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(inv => {
                    const isAdjustment = !!inv.parentBillId;
                    return (
                    <TableRow key={inv.id} className={isAdjustment ? 'bg-slate-50/50' : ''}>
                      <TableCell className="font-mono text-sm">
                        {isAdjustment && (
                          <span className="text-gray-400 mr-1.5" title="Adjusts the parent bill above">↳</span>
                        )}
                        {inv.billNo}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 ${KIND_BADGE_CLASS[inv.kind]}`}>
                          {KIND_LABEL[inv.kind]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {customerById.get(inv.customerId)?.name ?? <span className="text-gray-400">(unknown)</span>}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{inv.issueDate}</TableCell>
                      {/* CN amount represents money we owe customer →
                          render signed negative in red so the column
                          and footer sum match the ledger direction. */}
                      <TableCell className={`text-right text-sm tabular-nums ${
                        inv.kind === 'credit_note' ? 'text-red-700' : ''
                      }`}>
                        {inv.kind === 'credit_note'
                          ? `− ${fmtMoney(inv.total, inv.currency)}`
                          : fmtMoney(inv.total, inv.currency)}
                      </TableCell>
                      {/* Paid display rules:
                          - Adjustment with zero paid → em-dash (no
                            payment recorded yet; "$0.00" reads like
                            a real receipt and clutters the column).
                          - CN with payment → "− $X" in red (refund =
                            money out, signed for ledger clarity).
                          - INV / DN → plain gray amount. */}
                      <TableCell className={`text-right text-sm tabular-nums ${
                        inv.kind === 'credit_note' ? 'text-red-700' : 'text-gray-600'
                      }`}>
                        {isAdjustment && inv.paidAmount === 0
                          ? <span className="text-gray-300">—</span>
                          : inv.kind === 'credit_note'
                            ? `− ${fmtMoney(Math.abs(inv.paidAmount), inv.currency)}`
                            : fmtMoney(inv.paidAmount, inv.currency)}
                      </TableCell>
                      {/* Remain is meaningful only on the root invoice
                          — CN/DN rows already roll their balance up
                          into the parent's netBalance. Show a muted
                          em-dash on adjustment rows so the column
                          stays visually aligned. */}
                      <TableCell className={`text-right text-sm tabular-nums ${
                        isAdjustment ? 'text-gray-300'
                          : (inv.netBalance ?? (inv.total - inv.paidAmount)) > 0 ? 'text-red-700 font-medium'
                          : 'text-gray-500'
                      }`}>
                        {isAdjustment ? '—' : fmtMoney(inv.netBalance ?? (inv.total - inv.paidAmount), inv.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[inv.status]}`}>
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => setDetailId(inv.id)}>
                            <Eye className="h-3 w-3 mr-1" /> View
                          </Button>
                          {/* Only root invoices (commercial / tax) can
                              carry adjustments; voided rows are sealed.
                              The dropdown skips the parent-picker step
                              in the form by setting formParentPrefill. */}
                          {canAdd && !isAdjustment && inv.status !== 'void' && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7 px-2" title="Add adjustment note">
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openAdjustment(inv, 'credit_note')}>
                                  <CornerDownRight className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Credit Note
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openAdjustment(inv, 'debit_note')}>
                                  <CornerUpRight className="h-3.5 w-3.5 mr-2 text-amber-600" /> Debit Note
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {canRemove && inv.status === 'draft' && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteTarget(inv)}
                              title="Delete draft"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
                {totalsByCurrency.length > 0 && (
                  <TableFooter>
                    {totalsByCurrency.map(t => (
                      <TableRow key={t.currency}>
                        <TableCell colSpan={4} className="text-right text-xs font-semibold text-gray-600">
                          Totals ({t.currency})
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums">
                          {fmtMoney(t.total, t.currency)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums text-emerald-700">
                          {fmtMoney(t.paid, t.currency)}
                        </TableCell>
                        <TableCell className={`text-right text-sm font-semibold tabular-nums ${
                          t.remain > 0 ? 'text-red-700' : 'text-gray-500'
                        }`}>
                          {fmtMoney(t.remain, t.currency)}
                        </TableCell>
                        <TableCell colSpan={2} />
                      </TableRow>
                    ))}
                  </TableFooter>
                )}
              </Table>
              {pagination.totalPages > 1 && (
                <div className="mt-4">
                  <Pagination
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    onPageChange={pagination.goToPage}
                    startIndex={(pagination.currentPage - 1) * 25}
                    endIndex={Math.min(pagination.currentPage * 25, groupedRows.length)}
                    totalItems={groupedRows.length}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create / edit dialog */}
      <BillFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) { setFormEditing(null); setFormParentPrefill(null); } }}
        kind={formKind}
        customers={customers}
        bills={rows}
        editing={formEditing}
        parentPrefill={formParentPrefill}
        onCreated={async () => { setFormOpen(false); setFormEditing(null); setFormParentPrefill(null); await load(); }}
      />

      {/* Detail dialog */}
      {detailId && (
        <BillDetailDialog
          billId={detailId}
          customers={customers}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onChanged={() => { void load(); }}
          onEdit={openEdit}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.billNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Hard delete is only allowed on drafts — the row is removed completely.
              For issued bills use Void instead so the legal record stays auditable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Create-invoice dialog                                                      */
/* -------------------------------------------------------------------------- */
interface FormItem {
  name: string;
  /** Free-form specification (DB column: description). */
  description?: string;
  /** UOM string. */
  unit?: string;
  quantity: string;
  unitPrice: string;
}

const blankItem: FormItem = { name: '', description: '', unit: '', quantity: '1', unitPrice: '0' };

function BillFormDialog({
  open, onOpenChange, kind, customers, bills, editing, parentPrefill, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: billsApi.BillKind;
  customers: customersApi.Customer[];
  bills: billsApi.Bill[];
  /** When set, the dialog runs in edit mode against this invoice
   *  instead of creating a new one. Submit calls PUT /invoices/{id}
   *  instead of POST /invoices. */
  editing?: billsApi.Bill | null;
  /** When set on a create-mode open, seeds parentBillId so the
   *  parent picker is pre-filled. Used by the inline "adjust"
   *  dropdown on commercial / tax rows. */
  parentPrefill?: string | null;
  onCreated: () => Promise<void> | void;
}) {
  const isAdjustment = kind === 'credit_note' || kind === 'debit_note';
  const isEdit = !!editing;

  const [customerId, setCustomerId] = useState('');
  const [parentBillId, setParentInvoiceId] = useState('');
  /** Document number — pre-filled from /invoices/next-number on open
   *  for fresh creates and from the row on edit. Free-form input so
   *  HR can override the auto-sequential when needed (e.g. matching
   *  an external paper invoice). */
  const [billNo, setInvoiceNo] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState('4100');
  const [items, setItems] = useState<FormItem[]>([{ ...blankItem }]);
  const [taxType, setTaxType] = useState<billsApi.BillTaxType | ''>('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [discountType, setDiscountType] = useState<billsApi.DiscountType>('amount');
  const [discountValue, setDiscountValue] = useState('0');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset whenever the dialog opens. In edit mode, hydrate from the
  // invoice being edited; otherwise blank state for a fresh create,
  // and kick off a /next-number fetch so the doc-number input shows
  // the auto-generated default without waiting for the user to type.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCustomerId(editing.customerId);
      setParentInvoiceId(editing.parentBillId ?? '');
      setInvoiceNo(editing.billNo);
      setIssueDate(editing.issueDate);
      setDueDate(editing.dueDate ?? '');
      setCurrency(editing.currency);
      setExchangeRate(String(editing.exchangeRate));
      setItems(editing.items.length === 0
        ? [{ ...blankItem }]
        : editing.items.map(it => ({
            name: it.name,
            description: it.description ?? '',
            unit: it.unit ?? '',
            quantity: String(it.quantity),
            unitPrice: String(it.unitPrice),
          })));
      setTaxType((editing.taxType ?? '') as billsApi.BillTaxType | '');
      setTaxAmount(String(editing.taxAmount));
      setDiscountType(editing.discountType ?? 'amount');
      setDiscountValue(String(editing.discountValue ?? editing.discountAmount));
      setNotes(editing.notes ?? '');
      setTerms(editing.terms ?? '');
    } else {
      // For a CN/DN opened via the inline dropdown, seed the parent
      // (and customer + currency + taxType) from the parent invoice
      // so HR doesn't re-pick them.
      const seedParent = parentPrefill ? bills.find(i => i.id === parentPrefill) : undefined;
      setCustomerId(seedParent?.customerId ?? '');
      setParentInvoiceId(parentPrefill ?? '');
      setInvoiceNo('');
      setIssueDate(new Date().toISOString().slice(0, 10));
      setDueDate('');
      setCurrency(seedParent?.currency ?? 'USD');
      setExchangeRate(seedParent ? String(seedParent.exchangeRate) : '4100');
      setItems([{ ...blankItem }]);
      setTaxType((seedParent?.taxType ?? '') as billsApi.BillTaxType | '');
      setTaxAmount('0');
      setDiscountType('amount');
      setDiscountValue('0');
      setNotes('');
      setTerms('');
      // Fetch the preview after state resets — race-protected so a
      // rapid kind switch doesn't land the wrong value.
      let cancelled = false;
      billsApi.nextNumber(kind)
        .then(res => { if (!cancelled) setInvoiceNo(res.billNo); })
        .catch(() => { /* non-fatal — user can type their own */ });
      return () => { cancelled = true; };
    }
  }, [open, kind, editing, parentPrefill, bills]);

  const rootBillOptions = useMemo(() =>
    bills.filter(i => (i.kind === 'commercial' || i.kind === 'tax') && i.status !== 'void'),
    [bills]
  );

  const subtotal = useMemo(() =>
    items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0),
    [items]
  );
  // When a Taxation pattern is selected, tax = subtotal × rate (server
  // applies the same formula on save); the manual Tax input is locked.
  // Otherwise fall back to whatever the user typed.
  const computedTax = taxType
    ? subtotal * (TAX_TYPE_BY_KEY[taxType]?.rate ?? 0) / 100
    : (Number(taxAmount) || 0);
  // Discount is either a flat amount or a % of subtotal. The toggle
  // determines which; server applies the same formula on save.
  const computedDiscount = discountType === 'percent'
    ? subtotal * (Number(discountValue) || 0) / 100
    : (Number(discountValue) || 0);
  const total = subtotal + computedTax - computedDiscount;

  const updateItem = (idx: number, patch: Partial<FormItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const addItem = () => setItems(prev => [...prev, { ...blankItem }]);
  const removeItem = (idx: number) => setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

  /** Build the request payload from the current form state. Used by
   *  every save flow (create / update / save & add new). */
  const buildPayload = (): billsApi.BillRequest => ({
    kind,
    parentBillId: isAdjustment ? parentBillId : undefined,
    billNo: billNo.trim() || undefined,
    customerId,
    issueDate,
    dueDate: dueDate || undefined,
    currency,
    exchangeRate: Number(exchangeRate) || 1,
    taxType: (taxType || null) as billsApi.BillTaxType | null,
    // computedTax mirrors what the server will write — sending it
    // keeps the printed amount in sync if someone reads the request
    // body before the server's recompute lands.
    taxAmount: computedTax,
    discountType,
    discountValue: Number(discountValue) || 0,
    discountAmount: computedDiscount,
    notes: notes || undefined,
    terms: terms || undefined,
    items: items.map(it => ({
      name: it.name.trim(),
      description: it.description?.trim() || undefined,
      unit: it.unit?.trim() || undefined,
      quantity: Number(it.quantity) || 0,
      unitPrice: Number(it.unitPrice) || 0,
    })),
  });

  const validate = (): boolean => {
    if (!customerId) { toast.error('Customer is required'); return false; }
    if (isAdjustment && !parentBillId) { toast.error('Pick the invoice this note adjusts'); return false; }
    if (items.length === 0 || items.some(it => !it.name.trim())) {
      toast.error('Each line item needs a name');
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit && editing) {
        await billsApi.update(editing.id, buildPayload());
        toast.success(`${editing.billNo} updated`);
      } else {
        await billsApi.create(buildPayload());
        toast.success(`${KIND_LABEL[kind]} created as draft`);
      }
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  const totalKhr = total * (Number(exchangeRate) || 0);

  /** Save the current entry as a *progress* invoice (create → issue
   *  chained) and keep the dialog open with a freshly-armed form so
   *  the bookkeeper can chain entries without re-opening the dialog.
   *  Customer + dates carry over; lines + amounts reset. */
  const submitAndNew = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const created = await billsApi.create(buildPayload());
      // Immediately flip to progress per the UX requirement. If the
      // issue step 4xx's we still report the create — the row exists
      // as a draft and HR can promote it from the list page.
      try {
        await billsApi.issue(created.id);
        toast.success(`${KIND_LABEL[kind]} ${created.billNo} issued — ready for next entry`);
      } catch (e) {
        toast.warning(`${created.billNo} created as draft (issue failed: ${e instanceof Error ? e.message : 'unknown'})`);
      }
      setItems([{ ...blankItem }]);
      setTaxAmount('0');
      setDiscountValue('0');
      setNotes('');
      setTerms('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* sm:max-w-[1260px] beats the dialog default `sm:max-w-lg` —
          without the sm: prefix the variant rule keeps winning above
          the 640px breakpoint. */}
      <DialogContent className="sm:max-w-[1260px] w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${editing?.billNo}` : `New ${KIND_LABEL[kind]}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isAdjustment && (
            <div className="space-y-1.5">
              <Label className="text-xs">Adjusts bill *</Label>
              <Select value={parentBillId} onValueChange={setParentInvoiceId}>
                <SelectTrigger><SelectValue placeholder="Pick the original bill" /></SelectTrigger>
                <SelectContent>
                  {rootBillOptions.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No commercial or tax bills to adjust
                    </SelectItem>
                  ) : rootBillOptions.map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.billNo} — {KIND_LABEL[i.kind]} — {fmtMoney(i.total, i.currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Customer picker on the left, document number on the
              right. The number input is pre-filled by /next-number
              when the dialog opens — HR can keep the sequential default
              or type their own (e.g. matching a paper invoice). Edit
              mode hydrates the existing row's number; changes flow
              through PUT and the unique (tenant, invoice_no)
              constraint catches conflicts. */}
          <div className="grid grid-cols-[1fr_280px] gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Vendor *</Label>
              <SearchablePicker
                value={customerId}
                onChange={setCustomerId}
                placeholder="Pick customer"
                searchPlaceholder="Search by name, phone, or TIN…"
                allowClear={false}
                options={customers.map(c => ({
                  value: c.id,
                  label: c.name,
                  secondary: c.type === 'business'
                    ? `Business · ${c.tin ?? c.phone ?? ''}`
                    : `Individual · ${c.phone ?? ''}`,
                  searchKey: `${c.name} ${c.phone ?? ''} ${c.tin ?? ''} ${c.representative ?? ''}`,
                }))}
              />
              {/* Business vendors carry extra info that HR needs to
                  see on the invoice (TIN / representative / address);
                  individuals show their phone + address. The card is
                  a quick-glance review so the bookkeeper can confirm
                  the right party is selected before saving. */}
              <CustomerInfoCard customer={customers.find(c => c.id === customerId)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {kind === 'credit_note' ? 'Credit Note No.'
                  : kind === 'debit_note' ? 'Debit Note No.'
                  : 'Bill No.'}
              </Label>
              <Input
                value={billNo}
                onChange={e => setInvoiceNo(e.target.value)}
                className="font-mono"
                placeholder="Auto-generated"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Issue date</Label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Due date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <Input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase().slice(0, 8))} placeholder="USD" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Exchange rate (KHR per 1 {currency || 'USD'})</Label>
              <Input
                type="number" min={0} step="0.0001"
                value={exchangeRate}
                onChange={e => setExchangeRate(e.target.value)}
                placeholder="4100"
              />
            </div>
          </div>

          {/* Line items editor — Item / Specification / UOM / Qty /
              Unit price / Line total. Specification is a free-form
              detail ("Coke 330ml can" / "WD-40 1L spray", etc.); UOM
              is the unit it's sold in. Both feed the printed invoice
              line and stay snapshotted on the row at issue time. */}
          <div className="space-y-2 border rounded-md p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Line items</Label>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" /> Add line
              </Button>
            </div>
            <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-gray-500 px-1">
              <div className="col-span-3">Item</div>
              <div className="col-span-3">Specification</div>
              <div className="col-span-1">UOM</div>
              <div className="col-span-1 text-right">Qty</div>
              <div className="col-span-2 text-right">Unit price</div>
              <div className="col-span-1 text-right">Line total</div>
              <div className="col-span-1" />
            </div>
            {items.map((it, idx) => {
              const lineTotal = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
              return (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-3 h-8 text-sm"
                    value={it.name}
                    onChange={e => updateItem(idx, { name: e.target.value })}
                    placeholder="Item or service name"
                  />
                  <Input
                    className="col-span-3 h-8 text-sm"
                    value={it.description ?? ''}
                    onChange={e => updateItem(idx, { description: e.target.value })}
                    placeholder="Model, size, variant…"
                  />
                  <Input
                    className="col-span-1 h-8 text-sm"
                    value={it.unit ?? ''}
                    onChange={e => updateItem(idx, { unit: e.target.value })}
                    placeholder="pcs"
                  />
                  <Input
                    className="col-span-1 h-8 text-sm text-right"
                    type="number" min={0} step="0.01"
                    value={it.quantity}
                    onChange={e => updateItem(idx, { quantity: e.target.value })}
                  />
                  <Input
                    className="col-span-2 h-8 text-sm text-right"
                    type="number" min={0} step="0.01"
                    value={it.unitPrice}
                    onChange={e => updateItem(idx, { unitPrice: e.target.value })}
                  />
                  <div className="col-span-1 text-right text-sm tabular-nums px-2">
                    {lineTotal.toFixed(2)}
                  </div>
                  <Button
                    size="sm" variant="ghost"
                    className="col-span-1 h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                    title="Remove line"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Tax controls — pick a Taxation pattern from the
              cross-system reference; server applies subtotal × rate.
              Commercial / CN-DN-against-commercial → just VAT 0% +
              Exclusive VAT. Tax / CN-DN-against-tax → all five. */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Taxation</Label>
              <Select
                value={taxType || '_none'}
                onValueChange={v => setTaxType(v === '_none' ? '' : v as billsApi.BillTaxType)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {TAX_TYPES_FOR_KIND(
                    kind,
                    parentPrefill
                      ? (bills.find(i => i.id === parentPrefill)?.kind)
                      : (editing?.parentBillId
                          ? bills.find(i => i.id === editing.parentBillId)?.kind
                          : undefined),
                  ).map(t => (
                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Tax {taxType && TAX_TYPE_BY_KEY[taxType] && (
                  <span className="text-[10px] text-gray-400">@ {TAX_TYPE_BY_KEY[taxType].rate}%</span>
                )}
              </Label>
              <Input
                type="number" min={0} step="0.01"
                value={taxType
                  ? (subtotal * (TAX_TYPE_BY_KEY[taxType]?.rate ?? 0) / 100).toFixed(2)
                  : taxAmount}
                onChange={e => setTaxAmount(e.target.value)}
                disabled={!!taxType}
                title={taxType ? 'Auto-computed from the taxation type' : ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Discount {discountType === 'percent' && (
                  <span className="text-[10px] text-gray-400">→ {fmtMoney(computedDiscount, currency)}</span>
                )}
              </Label>
              {/* Input + segmented type toggle on the right end. The
                  $ button = flat money-off, % button = percent of
                  subtotal. Server recomputes discount_amount on save. */}
              <div className="flex">
                <Input
                  type="number" min={0} step="0.01"
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                  className="rounded-r-none"
                />
                <div className="inline-flex border border-l-0 rounded-r-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDiscountType('amount')}
                    className={`px-3 text-sm ${discountType === 'amount'
                      ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    title="Flat money-off"
                  >$</button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('percent')}
                    className={`px-3 text-sm border-l ${discountType === 'percent'
                      ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    title="Percentage of subtotal"
                  >%</button>
                </div>
              </div>
            </div>
          </div>

          {/* Two-column layout: Notes on the left (internal memo),
              Terms + Summary stacked on the right (customer-facing
              terms above the totals card). Same shape on create,
              edit, and detail surfaces. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 flex flex-col">
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={8}
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Internal note or memo (not printed on the invoice)"
                className="flex-1 resize-none"
              />
            </div>
            <div className="space-y-3 flex flex-col">
              <div className="space-y-1.5 flex-1 flex flex-col">
                <Label className="text-xs">Terms &amp; conditions</Label>
                <Textarea
                  rows={3}
                  value={terms} onChange={e => setTerms(e.target.value)}
                  placeholder="Payment terms, bank details, or disclaimers — printed on the invoice"
                  className="flex-1 resize-none"
                />
              </div>
              <div className="bg-slate-50 rounded-md p-3 space-y-1 text-sm">
                <div className="flex justify-end gap-6">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="tabular-nums w-32 text-right">{fmtMoney(subtotal, currency)}</span>
                </div>
                <div className="flex justify-end gap-6">
                  <span className="text-gray-600">Tax</span>
                  <span className="tabular-nums w-32 text-right">+ {fmtMoney(computedTax, currency)}</span>
                </div>
                <div className="flex justify-end gap-6">
                  <span className="text-gray-600">Discount</span>
                  <span className="tabular-nums w-32 text-right">− {fmtMoney(computedDiscount, currency)}</span>
                </div>
                <div className="flex justify-end gap-6 font-semibold border-t pt-1 mt-1">
                  <span>Total USD</span>
                  <span className="tabular-nums w-32 text-right">{fmtMoney(total, currency)}</span>
                </div>
                <div className="flex justify-end gap-6 text-gray-700">
                  <span>Total KHR <span className="text-[10px] text-gray-400">@ {Number(exchangeRate) || 0}</span></span>
                  <span className="tabular-nums w-32 text-right">KHR {totalKhr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          {/* Save & add new only makes sense for fresh entries — on edit
              it would orphan the row mid-flow. */}
          {!isEdit && (
            <Button variant="outline" onClick={submitAndNew} disabled={saving} title="Save and issue, then reset the form for the next entry">
              {saving ? 'Saving…' : 'Save & add new'}
            </Button>
          )}
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create draft')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail dialog — read-only view + actions + payments                        */
/* -------------------------------------------------------------------------- */
function BillDetailDialog({
  billId, customers, canEdit, onClose, onChanged, onEdit,
}: {
  billId: string;
  customers: customersApi.Customer[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
  /** Called when the user clicks Edit. The parent should close this
   *  dialog and open the form dialog in edit-mode with the invoice. */
  onEdit: (inv: billsApi.Bill) => void;
}) {
  const [invoice, setInvoice] = useState<billsApi.Bill | null>(null);
  const [parentInvoice, setParentInvoice] = useState<billsApi.Bill | null>(null);
  // Payments augmented with the source document they were recorded
  // against — so the unified table on a root invoice can show
  // payments + DN receipts + CN refunds in one chronological view.
  type LedgerPayment = billPaymentsApi.Payment & {
    documentNo: string;
    documentKind: billsApi.BillKind;
  };
  const [payments, setPayments] = useState<LedgerPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);

  const customer = invoice ? customers.find(c => c.id === invoice.customerId) : undefined;

  const load = async () => {
    setLoading(true);
    try {
      const inv = await billsApi.get(billId);
      setInvoice(inv);
      // Build the list of documents that contribute payments to this
      // dialog: the invoice itself + each non-void adjustment if this
      // is a root invoice. For an adjustment view (CN/DN) we just
      // fetch its own payments.
      const sources: { id: string; billNo: string; kind: billsApi.BillKind }[] = [
        { id: inv.id, billNo: inv.billNo, kind: inv.kind },
      ];
      if (!inv.parentBillId) {
        for (const a of inv.adjustments ?? []) {
          if (a.status !== 'void') {
            sources.push({ id: a.id, billNo: a.billNo, kind: a.kind });
          }
        }
      }
      const payArrays = await Promise.all(
        sources.map(s =>
          // 4xx is normal when the user has no payment:view; swallow rather
          // than tossing a toast for the read-only audit panel.
          billPaymentsApi.listForBill(s.id).catch(() => [] as billPaymentsApi.Payment[]),
        ),
      );
      const combined: LedgerPayment[] = [];
      payArrays.forEach((arr, idx) => {
        const src = sources[idx];
        for (const p of arr) {
          combined.push({ ...p, documentNo: src.billNo, documentKind: src.kind });
        }
      });
      // Sort chronological so the table reads like a ledger.
      combined.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
      setPayments(combined);
      // If this is an adjustment, follow the parent edge so the
      // "Adjusts bill" row can show the human-readable number
      // instead of a raw UUID. Soft-fail — a deleted parent
      // (theoretically impossible since we block delete with kids)
      // shouldn't crash the read.
      if (inv.parentBillId) {
        billsApi.get(inv.parentBillId)
          .then(setParentInvoice)
          .catch(() => setParentInvoice(null));
      } else {
        setParentInvoice(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [billId]);

  const doAction = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1260px] w-[90vw] max-h-[90vh] overflow-y-auto">
        {loading || !invoice ? (
          <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <DialogTitle className="font-mono">{invoice.billNo}</DialogTitle>
                  <DialogDescription className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className={KIND_BADGE_CLASS[invoice.kind]}>
                      {KIND_LABEL[invoice.kind]}
                    </Badge>
                    <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[invoice.status]}`}>
                      {invoice.status}
                    </Badge>
                    <span className="text-xs text-gray-500">{invoice.issueDate}</span>
                  </DialogDescription>
                </div>
                {/* mr-8 reserves room for the dialog's built-in close (X)
                    button which sits at top:1rem right:1rem inside the
                    DialogContent — without the inset the Void button
                    sat directly under it.
                    print:hidden drops the whole action row from the
                    Print output so the printed page only carries the
                    invoice itself, not the management controls. */}
                <div className="flex gap-1.5 mr-8 print:hidden">
                  <Button size="sm" variant="outline" onClick={() => window.print()} title="Print invoice">
                    <Printer className="h-3.5 w-3.5 mr-1" /> Print
                  </Button>
                  {/* Edit available only on draft + progress per the
                      legal-document rule — paid / partially / overdue /
                      void rows must be adjusted via a credit or debit
                      note, not by rewriting the original. */}
                  {canEdit && (invoice.status === 'draft' || invoice.status === 'progress') && (
                    <Button size="sm" variant="outline" disabled={busy}
                      onClick={() => onEdit(invoice)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                  )}
                  {canEdit && invoice.status === 'draft' && (
                    <Button size="sm" disabled={busy}
                      onClick={() => doAction('Bill issued',
                        () => billsApi.issue(invoice.id).then(setInvoice))}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" /> Issue
                    </Button>
                  )}
                  {canEdit && invoice.status !== 'void' && invoice.status !== 'draft' && (
                    <Button size="sm" variant="outline" disabled={busy}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => doAction('Bill voided',
                        () => billsApi.voidBill(invoice.id).then(setInvoice))}
                    >
                      <Ban className="h-3.5 w-3.5 mr-1" /> Void
                    </Button>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div className="text-gray-500">Vendor</div>
              <div>{customer?.name ?? <span className="text-gray-400">(unknown)</span>}</div>
              <div className="text-gray-500">Due date</div>
              <div>{invoice.dueDate ?? '—'}</div>
              <div className="text-gray-500">Currency</div>
              <div>{invoice.currency}</div>
              <div className="text-gray-500">Taxation</div>
              <div>
                {invoice.taxType && TAX_TYPE_BY_KEY[invoice.taxType]
                  ? `${TAX_TYPE_BY_KEY[invoice.taxType].label} (${TAX_TYPE_BY_KEY[invoice.taxType].rate}%)`
                  : <span className="text-gray-400 italic">None</span>}
              </div>
              {invoice.parentBillId && (
                <>
                  <div className="text-gray-500">Adjusts bill</div>
                  <div className="font-mono text-sm">
                    {parentInvoice
                      ? parentInvoice.billNo
                      : <span className="text-gray-400 text-xs italic">loading…</span>}
                  </div>
                </>
              )}
            </div>

            {/* Line items — Specification + UOM surfaced as their own
                columns so the read view matches what the create dialog
                captures and what the printed invoice will eventually
                show. */}
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Specification</TableHead>
                    <TableHead className="w-[80px]">UOM</TableHead>
                    <TableHead className="text-right w-[80px]">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Line total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map(it => (
                    <TableRow key={it.id}>
                      <TableCell className="text-sm">{it.name}</TableCell>
                      <TableCell className="text-sm text-gray-600">{it.description || '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600">{it.unit || '—'}</TableCell>
                      <TableCell className="text-right text-sm">{it.quantity}</TableCell>
                      <TableCell className="text-right text-sm">{fmtMoney(it.unitPrice, invoice.currency)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtMoney(it.lineTotal, invoice.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Two-column layout matching the create / edit dialog —
                Notes (internal memo) on the left, Terms (customer-
                facing) + amount summary stacked on the right. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-md p-3 text-sm">
                <div className="text-xs text-gray-500 mb-1">Notes</div>
                {invoice.notes ? (
                  <div className="whitespace-pre-wrap">{invoice.notes}</div>
                ) : (
                  <div className="text-gray-400 italic text-xs">No notes recorded for this invoice.</div>
                )}
              </div>
              <div className="space-y-3">
                <div className="bg-slate-50 rounded-md p-3 text-sm">
                  <div className="text-xs text-gray-500 mb-1">Terms &amp; conditions</div>
                  {invoice.terms ? (
                    <div className="whitespace-pre-wrap">{invoice.terms}</div>
                  ) : (
                    <div className="text-gray-400 italic text-xs">No terms recorded for this invoice.</div>
                  )}
                </div>
                {/* Net-balance summary using the full ledger formula:
                    total + ΣDN − ΣCN − payments. Void children are
                    excluded server-side. When no adjustments exist
                    the DN/CN lines fold away so the summary stays
                    compact for the common single-document case. */}
                {(() => {
                  const nonVoidAdj = (invoice.adjustments ?? [])
                    .filter(a => a.status !== 'void');
                  const sumDn = nonVoidAdj
                    .filter(a => a.kind === 'debit_note')
                    .reduce((s, a) => s + a.total, 0);
                  const sumCn = nonVoidAdj
                    .filter(a => a.kind === 'credit_note')
                    .reduce((s, a) => s + a.total, 0);
                  const net = invoice.netBalance ?? (invoice.total + sumDn - sumCn - invoice.paidAmount);
                  return (
                  <div className="bg-slate-50 rounded-md p-3 space-y-1 text-sm">
                    <div className="flex justify-end gap-6"><span className="text-gray-600">Subtotal</span><span className="tabular-nums w-32 text-right">{fmtMoney(invoice.subtotal, invoice.currency)}</span></div>
                    <div className="flex justify-end gap-6"><span className="text-gray-600">Tax</span><span className="tabular-nums w-32 text-right">+ {fmtMoney(invoice.taxAmount, invoice.currency)}</span></div>
                    <div className="flex justify-end gap-6">
                      <span className="text-gray-600">
                        Discount
                        {invoice.discountType === 'percent' && (
                          <span className="text-[10px] text-gray-400 ml-1">@ {invoice.discountValue}%</span>
                        )}
                      </span>
                      <span className="tabular-nums w-32 text-right">− {fmtMoney(invoice.discountAmount, invoice.currency)}</span>
                    </div>
                    <div className="flex justify-end gap-6 font-semibold border-t pt-1 mt-1"><span>Total USD</span><span className="tabular-nums w-32 text-right">{fmtMoney(invoice.total, invoice.currency)}</span></div>
                    {sumDn > 0 && (
                      <div className="flex justify-end gap-6 text-amber-700"><span>Debit notes</span><span className="tabular-nums w-32 text-right">+ {fmtMoney(sumDn, invoice.currency)}</span></div>
                    )}
                    {sumCn > 0 && (
                      <div className="flex justify-end gap-6 text-emerald-700"><span>Credit notes</span><span className="tabular-nums w-32 text-right">− {fmtMoney(sumCn, invoice.currency)}</span></div>
                    )}
                    <div className="flex justify-end gap-6 text-emerald-700"><span>Paid</span><span className="tabular-nums w-32 text-right">− {fmtMoney(invoice.paidAmount, invoice.currency)}</span></div>
                    <div className="flex justify-end gap-6 font-semibold border-t pt-1 mt-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              AP
                              <Info className="h-3 w-3 text-gray-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Accounts Payable — what we still owe the vendor after the full ledger.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span className="tabular-nums w-32 text-right">{fmtMoney(net, invoice.currency)}</span>
                    </div>
                    <div className="flex justify-end gap-6 text-gray-700 border-t pt-1 mt-1">
                      <span>Total KHR <span className="text-[10px] text-gray-400">@ {invoice.exchangeRate}</span></span>
                      <span className="tabular-nums w-32 text-right">KHR {(net * invoice.exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>
                  );
                })()}
              </div>
            </div>

            {/* Adjustments panel — Credit / Debit Notes attached to
                this bill. Shown only on root bills (CN/DN
                themselves have no children). Void rows render with a
                muted strikethrough so the audit trail stays visible
                without inflating the net-balance math. */}
            {!invoice.parentBillId && (invoice.adjustments ?? []).length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Credit / Debit Notes</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead className="w-[120px]">Type</TableHead>
                      <TableHead className="w-[120px]">Issue Date</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(invoice.adjustments ?? []).map(a => {
                      const isVoid = a.status === 'void';
                      const sign = a.kind === 'credit_note' ? '−' : '+';
                      return (
                        <TableRow key={a.id} className={isVoid ? 'text-gray-400' : ''}>
                          <TableCell className={`font-mono text-sm ${isVoid ? 'line-through' : ''}`}>{a.billNo}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={KIND_BADGE_CLASS[a.kind]}>
                              {KIND_LABEL[a.kind]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{a.issueDate}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[a.status]}`}>
                              {a.status}
                            </Badge>
                          </TableCell>
                          <TableCell className={`text-right text-sm tabular-nums ${isVoid ? 'line-through' : ''} ${
                            !isVoid && a.kind === 'credit_note' ? 'text-emerald-700' : !isVoid && a.kind === 'debit_note' ? 'text-amber-700' : ''
                          }`}>
                            {sign} {fmtMoney(a.total, invoice.currency)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Payments panel */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Payments</Label>
                {canEdit && invoice.status !== 'draft' && invoice.status !== 'void' && invoice.status !== 'paid' && (
                  <Button size="sm" variant="outline" onClick={() => setPayDialogOpen(true)} className="print:hidden">
                    <Plus className="h-3 w-3 mr-1" /> Record payment
                  </Button>
                )}
              </div>
              {payments.length === 0 ? (
                <p className="text-xs text-gray-500">No payments recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-[140px]">Document</TableHead>
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map(p => {
                      // Labels mirror the SALE side but flipped for
                      // bills since the money flow is reversed:
                      //   Bill root / DN  → we pay vendor (outflow)
                      //   Bill CN         → vendor refunds us (inflow)
                      // Default direction for a bill root/DN is debit;
                      // for a CN it's credit. The chip color reads
                      // off "outflow" so red = we paid out, green =
                      // money came back.
                      const isCnSrc = p.documentKind === 'credit_note';
                      const isDnSrc = p.documentKind === 'debit_note';
                      const isCredit = p.direction === 'credit';
                      // For bills: cash IN happens on CN refunds or on
                      // a credit-direction payment against an INV/DN
                      // (rare — usually that's an over-payment refund).
                      const isInflow = isCnSrc || ((!isDnSrc) && isCredit);
                      const isOutflow = !isInflow;
                      const typeLabel = isCnSrc ? 'Received'
                        : isDnSrc ? 'Paid'
                        : (isCredit ? '+ Credit' : '− Debit');
                      const chipClass = isOutflow
                        ? 'border-red-300 text-red-700 bg-red-50'
                        : 'border-emerald-300 text-emerald-700 bg-emerald-50';
                      return (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{p.paymentDate}</TableCell>
                        <TableCell className="text-xs font-mono text-gray-600">{p.documentNo}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={chipClass}>
                            {typeLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm capitalize">{p.method}</TableCell>
                        <TableCell className="text-sm text-gray-600">{p.referenceNo ?? '—'}</TableCell>
                        <TableCell className={`text-right text-sm tabular-nums ${isOutflow ? 'text-red-700' : ''}`}>
                          {isOutflow ? '− ' : '+ '}{fmtMoney(p.amount, invoice.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          {canEdit && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 print:hidden"
                              onClick={() => doAction('Payment removed',
                                () => billPaymentsApi.remove(p.id))}
                              title="Delete payment"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            <DialogFooter className="print:hidden">
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </>
        )}

        {payDialogOpen && invoice && (
          <RecordBillPaymentDialog
            invoice={invoice}
            onClose={() => setPayDialogOpen(false)}
            onSaved={async () => {
              setPayDialogOpen(false);
              await load();
              onChanged();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Record-payment dialog                                                      */
/* -------------------------------------------------------------------------- */
function RecordBillPaymentDialog({
  invoice, onClose, onSaved,
}: {
  invoice: billsApi.Bill;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  // Outstanding uses the ledger's net balance when available; falls
  // back to the simple total - paid otherwise.
  const outstanding = Math.max(0, invoice.netBalance ?? (invoice.total - invoice.paidAmount));
  // Default direction depends on what's being settled:
  //   Credit Note  → debit  (we refund the customer)
  //   Debit Note   → credit (customer pays extra)
  //   Bill      → credit (customer pays)
  // HR can still flip it via the toggle for unusual cases.
  // Bill payment defaults flip vs invoice — root bill/DN view means
  // we pay the vendor (debit, money out); CN view means vendor
  // refunds us (credit, money in). HR can flip via the toggle for
  // edge cases (e.g. an over-payment we made + a partial refund).
  const [direction, setDirection] = useState<billPaymentsApi.PaymentDirection>(
    invoice.kind === 'credit_note' ? 'credit' : 'debit'
  );
  const [amount, setAmount] = useState(outstanding.toFixed(2));
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<billPaymentsApi.PaymentMethod>('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }
    setSaving(true);
    try {
      await billPaymentsApi.create({
        invoiceId: invoice.id,
        paymentDate,
        amount: amt,
        method,
        direction,
        referenceNo: referenceNo || undefined,
        notes: notes || undefined,
      });
      toast.success(direction === 'debit' ? 'Refund recorded' : 'Payment recorded');
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Against {invoice.billNo} — outstanding {fmtMoney(outstanding, invoice.currency)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Direction toggle — credit is the normal case (customer
              paid us); debit covers refunding a credit note (we paid
              the customer back). The signed sum feeds the invoice's
              net Paid total. */}
          <div className="space-y-1.5">
            <Label className="text-xs">Direction</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection('credit')}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
                  direction === 'credit'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <span className="text-base leading-none">+</span> Credit · money in
              </button>
              <button
                type="button"
                onClick={() => setDirection('debit')}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
                  direction === 'debit'
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <span className="text-base leading-none">−</span> Debit · refund out
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Amount *</Label>
            <Input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Method</Label>
              <Select value={method} onValueChange={v => setMethod(v as billPaymentsApi.PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reference number</Label>
            <Input value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="Bank ref / cheque no / auth code" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
