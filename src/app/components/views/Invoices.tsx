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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { SearchablePicker } from '../common/SearchablePicker';
import * as invoicesApi from '../../api/invoices';
import * as paymentsApi from '../../api/payments';
import * as customersApi from '../../api/customers';
import {
  Plus, Trash2, RefreshCw, FileText, Receipt, CornerDownRight, CornerUpRight,
  Send, Ban, Eye, ChevronDown, Printer, Pencil, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

/* -------------------------------------------------------------------------- */
/* Kind / status helpers — labels, badge colours, icons                       */
/* -------------------------------------------------------------------------- */
const KIND_LABEL: Record<invoicesApi.InvoiceKind, string> = {
  commercial:  'Commercial',
  tax:         'Tax',
  credit_note: 'Credit Note',
  debit_note:  'Debit Note',
};
const KIND_BADGE_CLASS: Record<invoicesApi.InvoiceKind, string> = {
  commercial:  'border-blue-300 text-blue-700 bg-blue-50',
  tax:         'border-violet-300 text-violet-700 bg-violet-50',
  credit_note: 'border-emerald-300 text-emerald-700 bg-emerald-50',
  debit_note:  'border-amber-300 text-amber-700 bg-amber-50',
};
const STATUS_BADGE_CLASS: Record<invoicesApi.InvoiceStatus, string> = {
  draft:     'border-slate-300 text-slate-700 bg-slate-50',
  progress:  'border-blue-300 text-blue-700 bg-blue-50',
  partially: 'border-amber-300 text-amber-700 bg-amber-50',
  paid:      'border-emerald-300 text-emerald-700 bg-emerald-50',
  overdue:   'border-orange-400 text-orange-800 bg-orange-50',
  void:      'border-red-300 text-red-700 bg-red-50',
};

const KIND_FILTERS: ReadonlyArray<{ value: invoicesApi.InvoiceKind | 'all'; label: string }> = [
  { value: 'all',         label: 'All' },
  { value: 'commercial',  label: 'Commercial' },
  { value: 'tax',         label: 'Tax' },
  { value: 'credit_note', label: 'Credit Notes' },
  { value: 'debit_note',  label: 'Debit Notes' },
];

const fmtMoney = (n: number, currency: string): string =>
  `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* -------------------------------------------------------------------------- */
/* Main page component                                                        */
/* -------------------------------------------------------------------------- */
export function Invoices() {
  const { canCreate, canUpdate, canDelete } = useAuth();
  const canAdd = canCreate('invoice');
  const canEdit = canUpdate('invoice');
  const canRemove = canDelete('invoice');

  const [rows, setRows] = useState<invoicesApi.Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [kindFilter, setKindFilter] = useState<invoicesApi.InvoiceKind | 'all'>('all');
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  // Date-range + keyword filters — applied client-side over the rows
  // we already loaded so HR sees instant feedback when scrubbing dates
  // or typing without round-tripping for each keystroke.
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [formKind, setFormKind] = useState<invoicesApi.InvoiceKind>('commercial');
  /** When set, the form dialog runs in edit-mode against this invoice
   *  instead of opening blank for a fresh create. */
  const [formEditing, setFormEditing] = useState<invoicesApi.Invoice | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<invoicesApi.Invoice | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [invRes, custRes] = await Promise.all([
        invoicesApi.list({ kind: kindFilter === 'all' ? undefined : kindFilter, size: 200 }),
        customersApi.list({ size: 500 }),
      ]);
      setRows(invRes.content ?? []);
      setCustomers(custRes.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load invoices');
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
    const passesFilters = (r: invoicesApi.Invoice): boolean => {
      if (dateFrom && r.issueDate < dateFrom) return false;
      if (dateTo   && r.issueDate > dateTo)   return false;
      if (!q) return true;
      const customerName = customerById.get(r.customerId)?.name?.toLowerCase() ?? '';
      return r.invoiceNo.toLowerCase().includes(q)
          || customerName.includes(q)
          || (r.notes ?? '').toLowerCase().includes(q);
    };

    // For grouping: keep an adjustment visible if it OR its parent passes.
    // The parent stays visible too in that case so the chain isn't broken.
    const parentOf = new Map<string, invoicesApi.Invoice>();
    rows.forEach(r => parentOf.set(r.id, r));
    const keepIds = new Set<string>();
    for (const r of rows) {
      if (passesFilters(r)) {
        keepIds.add(r.id);
        if (r.parentInvoiceId && parentOf.has(r.parentInvoiceId)) keepIds.add(r.parentInvoiceId);
      }
    }
    const visible = rows.filter(r => keepIds.has(r.id));

    const adjustmentsByParent = new Map<string, invoicesApi.Invoice[]>();
    const orphans: invoicesApi.Invoice[] = [];
    const rowIds = new Set(visible.map(r => r.id));
    for (const r of visible) {
      if (!r.parentInvoiceId) continue;
      if (rowIds.has(r.parentInvoiceId)) {
        if (!adjustmentsByParent.has(r.parentInvoiceId)) adjustmentsByParent.set(r.parentInvoiceId, []);
        adjustmentsByParent.get(r.parentInvoiceId)!.push(r);
      } else {
        orphans.push(r);
      }
    }
    const out: invoicesApi.Invoice[] = [];
    for (const r of visible) {
      if (r.parentInvoiceId) continue;
      out.push(r);
      const kids = adjustmentsByParent.get(r.id);
      if (kids) out.push(...kids);
    }
    return [...out, ...orphans];
  }, [rows, search, dateFrom, dateTo, customerById]);

  const pagination = usePagination(groupedRows, 25);

  const openCreate = (kind: invoicesApi.InvoiceKind) => {
    setFormEditing(null);
    setFormKind(kind);
    setFormOpen(true);
  };

  /** Switch from the detail dialog into edit-mode on the form dialog
   *  pre-filled with this invoice. The detail dialog closes; on save
   *  the list refetches and the user lands back on the list view. */
  const openEdit = (inv: invoicesApi.Invoice) => {
    setFormEditing(inv);
    setFormKind(inv.kind);
    setDetailId(null);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await invoicesApi.remove(deleteTarget.id);
      toast.success(`Deleted ${deleteTarget.invoiceNo}`);
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
          <h1 className="text-3xl font-bold">Invoice</h1>
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
                  New Invoice
                  <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => openCreate('commercial')}>
                  <FileText className="h-4 w-4 mr-2 text-blue-600" /> Commercial Invoice
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openCreate('tax')}>
                  <Receipt className="h-4 w-4 mr-2 text-violet-600" /> Tax Invoice
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
                  placeholder="Search invoice no, customer, notes…"
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
              {rows.length === 0 ? 'No invoices yet.' : 'No invoices match your filters.'}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Invoice No.</TableHead>
                    <TableHead className="w-[130px]">Kind</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="text-right w-[110px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(inv => {
                    const isAdjustment = !!inv.parentInvoiceId;
                    return (
                    <TableRow key={inv.id} className={isAdjustment ? 'bg-slate-50/50' : ''}>
                      <TableCell className="font-mono text-sm">
                        {isAdjustment && (
                          <span className="text-gray-400 mr-1.5" title="Adjusts the parent invoice above">↳</span>
                        )}
                        {inv.invoiceNo}
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
                      <TableCell className="text-right text-sm">{fmtMoney(inv.total, inv.currency)}</TableCell>
                      <TableCell className="text-right text-sm text-gray-600">{fmtMoney(inv.paidAmount, inv.currency)}</TableCell>
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
      <InvoiceFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setFormEditing(null); }}
        kind={formKind}
        customers={customers}
        invoices={rows}
        editing={formEditing}
        onCreated={async () => { setFormOpen(false); setFormEditing(null); await load(); }}
      />

      {/* Detail dialog */}
      {detailId && (
        <InvoiceDetailDialog
          invoiceId={detailId}
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
            <AlertDialogTitle>Delete {deleteTarget?.invoiceNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Hard delete is only allowed on drafts — the row is removed completely.
              For issued invoices use Void instead so the legal record stays auditable.
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

function InvoiceFormDialog({
  open, onOpenChange, kind, customers, invoices, editing, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: invoicesApi.InvoiceKind;
  customers: customersApi.Customer[];
  invoices: invoicesApi.Invoice[];
  /** When set, the dialog runs in edit mode against this invoice
   *  instead of creating a new one. Submit calls PUT /invoices/{id}
   *  instead of POST /invoices. */
  editing?: invoicesApi.Invoice | null;
  onCreated: () => Promise<void> | void;
}) {
  const isAdjustment = kind === 'credit_note' || kind === 'debit_note';
  const isEdit = !!editing;

  const [customerId, setCustomerId] = useState('');
  const [parentInvoiceId, setParentInvoiceId] = useState('');
  /** Document number — pre-filled from /invoices/next-number on open
   *  for fresh creates and from the row on edit. Free-form input so
   *  HR can override the auto-sequential when needed (e.g. matching
   *  an external paper invoice). */
  const [invoiceNo, setInvoiceNo] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState('4100');
  const [items, setItems] = useState<FormItem[]>([{ ...blankItem }]);
  const [taxAmount, setTaxAmount] = useState('0');
  const [discountAmount, setDiscountAmount] = useState('0');
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
      setParentInvoiceId(editing.parentInvoiceId ?? '');
      setInvoiceNo(editing.invoiceNo);
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
      setTaxAmount(String(editing.taxAmount));
      setDiscountAmount(String(editing.discountAmount));
      setNotes(editing.notes ?? '');
      setTerms(editing.terms ?? '');
    } else {
      setCustomerId('');
      setParentInvoiceId('');
      setInvoiceNo('');
      setIssueDate(new Date().toISOString().slice(0, 10));
      setDueDate('');
      setCurrency('USD');
      setExchangeRate('4100');
      setItems([{ ...blankItem }]);
      setTaxAmount('0');
      setDiscountAmount('0');
      setNotes('');
      setTerms('');
      // Fetch the preview after state resets — race-protected so a
      // rapid kind switch doesn't land the wrong value.
      let cancelled = false;
      invoicesApi.nextNumber(kind)
        .then(res => { if (!cancelled) setInvoiceNo(res.invoiceNo); })
        .catch(() => { /* non-fatal — user can type their own */ });
      return () => { cancelled = true; };
    }
  }, [open, kind, editing]);

  const rootInvoiceOptions = useMemo(() =>
    invoices.filter(i => (i.kind === 'commercial' || i.kind === 'tax') && i.status !== 'void'),
    [invoices]
  );

  const subtotal = useMemo(() =>
    items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0),
    [items]
  );
  const total = subtotal + (Number(taxAmount) || 0) - (Number(discountAmount) || 0);

  const updateItem = (idx: number, patch: Partial<FormItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const addItem = () => setItems(prev => [...prev, { ...blankItem }]);
  const removeItem = (idx: number) => setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

  /** Build the request payload from the current form state. Used by
   *  every save flow (create / update / save & add new). */
  const buildPayload = (): invoicesApi.InvoiceRequest => ({
    kind,
    parentInvoiceId: isAdjustment ? parentInvoiceId : undefined,
    invoiceNo: invoiceNo.trim() || undefined,
    customerId,
    issueDate,
    dueDate: dueDate || undefined,
    currency,
    exchangeRate: Number(exchangeRate) || 1,
    taxAmount: Number(taxAmount) || 0,
    discountAmount: Number(discountAmount) || 0,
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
    if (isAdjustment && !parentInvoiceId) { toast.error('Pick the invoice this note adjusts'); return false; }
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
        await invoicesApi.update(editing.id, buildPayload());
        toast.success(`${editing.invoiceNo} updated`);
      } else {
        await invoicesApi.create(buildPayload());
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
      const created = await invoicesApi.create(buildPayload());
      // Immediately flip to progress per the UX requirement. If the
      // issue step 4xx's we still report the create — the row exists
      // as a draft and HR can promote it from the list page.
      try {
        await invoicesApi.issue(created.id);
        toast.success(`${KIND_LABEL[kind]} ${created.invoiceNo} issued — ready for next entry`);
      } catch (e) {
        toast.warning(`${created.invoiceNo} created as draft (issue failed: ${e instanceof Error ? e.message : 'unknown'})`);
      }
      setItems([{ ...blankItem }]);
      setTaxAmount('0');
      setDiscountAmount('0');
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
          <DialogTitle>{isEdit ? `Edit ${editing?.invoiceNo}` : `New ${KIND_LABEL[kind]}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isAdjustment && (
            <div className="space-y-1.5">
              <Label className="text-xs">Adjusts invoice *</Label>
              <Select value={parentInvoiceId} onValueChange={setParentInvoiceId}>
                <SelectTrigger><SelectValue placeholder="Pick the original invoice" /></SelectTrigger>
                <SelectContent>
                  {rootInvoiceOptions.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No commercial or tax invoices to adjust
                    </SelectItem>
                  ) : rootInvoiceOptions.map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.invoiceNo} — {KIND_LABEL[i.kind]} — {fmtMoney(i.total, i.currency)}
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
              <Label className="text-xs">Customer *</Label>
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
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {kind === 'credit_note' ? 'Credit Note No.'
                  : kind === 'debit_note' ? 'Debit Note No.'
                  : 'Invoice No.'}
              </Label>
              <Input
                value={invoiceNo}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tax</Label>
              <Input
                type="number" min={0} step="0.01"
                value={taxAmount} onChange={e => setTaxAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Discount</Label>
              <Input
                type="number" min={0} step="0.01"
                value={discountAmount} onChange={e => setDiscountAmount(e.target.value)}
              />
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
                  <span className="tabular-nums w-32 text-right">+ {fmtMoney(Number(taxAmount) || 0, currency)}</span>
                </div>
                <div className="flex justify-end gap-6">
                  <span className="text-gray-600">Discount</span>
                  <span className="tabular-nums w-32 text-right">− {fmtMoney(Number(discountAmount) || 0, currency)}</span>
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
function InvoiceDetailDialog({
  invoiceId, customers, canEdit, onClose, onChanged, onEdit,
}: {
  invoiceId: string;
  customers: customersApi.Customer[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
  /** Called when the user clicks Edit. The parent should close this
   *  dialog and open the form dialog in edit-mode with the invoice. */
  onEdit: (inv: invoicesApi.Invoice) => void;
}) {
  const [invoice, setInvoice] = useState<invoicesApi.Invoice | null>(null);
  const [parentInvoice, setParentInvoice] = useState<invoicesApi.Invoice | null>(null);
  const [payments, setPayments] = useState<paymentsApi.Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);

  const customer = invoice ? customers.find(c => c.id === invoice.customerId) : undefined;

  const load = async () => {
    setLoading(true);
    try {
      const [inv, pays] = await Promise.all([
        invoicesApi.get(invoiceId),
        // 4xx is normal when the user has no payment:view; swallow rather
        // than tossing a toast for the read-only audit panel.
        paymentsApi.listForInvoice(invoiceId).catch(() => [] as paymentsApi.Payment[]),
      ]);
      setInvoice(inv);
      setPayments(pays);
      // If this is an adjustment, follow the parent edge so the
      // "Adjusts invoice" row can show the human-readable number
      // instead of a raw UUID. Soft-fail — a deleted parent
      // (theoretically impossible since we block delete with kids)
      // shouldn't crash the read.
      if (inv.parentInvoiceId) {
        invoicesApi.get(inv.parentInvoiceId)
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

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [invoiceId]);

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
                  <DialogTitle className="font-mono">{invoice.invoiceNo}</DialogTitle>
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
                    sat directly under it. */}
                <div className="flex gap-1.5 mr-8">
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
                      onClick={() => doAction('Invoice issued',
                        () => invoicesApi.issue(invoice.id).then(setInvoice))}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" /> Issue
                    </Button>
                  )}
                  {canEdit && invoice.status !== 'void' && invoice.status !== 'draft' && (
                    <Button size="sm" variant="outline" disabled={busy}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => doAction('Invoice voided',
                        () => invoicesApi.voidInvoice(invoice.id).then(setInvoice))}
                    >
                      <Ban className="h-3.5 w-3.5 mr-1" /> Void
                    </Button>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div className="text-gray-500">Customer</div>
              <div>{customer?.name ?? <span className="text-gray-400">(unknown)</span>}</div>
              <div className="text-gray-500">Due date</div>
              <div>{invoice.dueDate ?? '—'}</div>
              <div className="text-gray-500">Currency</div>
              <div>{invoice.currency}</div>
              {invoice.parentInvoiceId && (
                <>
                  <div className="text-gray-500">Adjusts invoice</div>
                  <div className="font-mono text-sm">
                    {parentInvoice
                      ? parentInvoice.invoiceNo
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
                <div className="bg-slate-50 rounded-md p-3 space-y-1 text-sm">
                  <div className="flex justify-end gap-6"><span className="text-gray-600">Subtotal</span><span className="tabular-nums w-32 text-right">{fmtMoney(invoice.subtotal, invoice.currency)}</span></div>
                  <div className="flex justify-end gap-6"><span className="text-gray-600">Tax</span><span className="tabular-nums w-32 text-right">+ {fmtMoney(invoice.taxAmount, invoice.currency)}</span></div>
                  <div className="flex justify-end gap-6"><span className="text-gray-600">Discount</span><span className="tabular-nums w-32 text-right">− {fmtMoney(invoice.discountAmount, invoice.currency)}</span></div>
                  <div className="flex justify-end gap-6 font-semibold border-t pt-1 mt-1"><span>Total USD</span><span className="tabular-nums w-32 text-right">{fmtMoney(invoice.total, invoice.currency)}</span></div>
                  <div className="flex justify-end gap-6 text-emerald-700"><span>Paid</span><span className="tabular-nums w-32 text-right">{fmtMoney(invoice.paidAmount, invoice.currency)}</span></div>
                  <div className="flex justify-end gap-6 font-medium"><span>Balance</span><span className="tabular-nums w-32 text-right">{fmtMoney(invoice.total - invoice.paidAmount, invoice.currency)}</span></div>
                  <div className="flex justify-end gap-6 text-gray-700 border-t pt-1 mt-1">
                    <span>Total KHR <span className="text-[10px] text-gray-400">@ {invoice.exchangeRate}</span></span>
                    <span className="tabular-nums w-32 text-right">KHR {((invoice.total - invoice.paidAmount) * invoice.exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Payments panel */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Payments</Label>
                {canEdit && invoice.status !== 'draft' && invoice.status !== 'void' && invoice.status !== 'paid' && (
                  <Button size="sm" variant="outline" onClick={() => setPayDialogOpen(true)}>
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
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{p.paymentDate}</TableCell>
                        <TableCell className="text-sm capitalize">{p.method}</TableCell>
                        <TableCell className="text-sm text-gray-600">{p.referenceNo ?? '—'}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{fmtMoney(p.amount, invoice.currency)}</TableCell>
                        <TableCell className="text-right">
                          {canEdit && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                              onClick={() => doAction('Payment removed',
                                () => paymentsApi.remove(p.id))}
                              title="Delete payment"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </>
        )}

        {payDialogOpen && invoice && (
          <RecordPaymentDialog
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
function RecordPaymentDialog({
  invoice, onClose, onSaved,
}: {
  invoice: invoicesApi.Invoice;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const outstanding = Math.max(0, invoice.total - invoice.paidAmount);
  const [amount, setAmount] = useState(outstanding.toFixed(2));
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<paymentsApi.PaymentMethod>('cash');
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
      await paymentsApi.create({
        invoiceId: invoice.id,
        paymentDate,
        amount: amt,
        method,
        referenceNo: referenceNo || undefined,
        notes: notes || undefined,
      });
      toast.success('Payment recorded');
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
            Against {invoice.invoiceNo} — outstanding {fmtMoney(outstanding, invoice.currency)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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
              <Select value={method} onValueChange={v => setMethod(v as paymentsApi.PaymentMethod)}>
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
