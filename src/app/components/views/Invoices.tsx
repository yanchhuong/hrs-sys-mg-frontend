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
import * as invoicesApi from '../../api/invoices';
import * as paymentsApi from '../../api/payments';
import * as customersApi from '../../api/customers';
import {
  Plus, Trash2, RefreshCw, FileText, Receipt, CornerDownRight, CornerUpRight,
  Send, Ban, Eye, ChevronDown, Printer,
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

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [formKind, setFormKind] = useState<invoicesApi.InvoiceKind>('commercial');
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

  const pagination = usePagination(rows, 25);

  const openCreate = (kind: invoicesApi.InvoiceKind) => {
    setFormKind(kind);
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
          <p className="text-gray-500">
            Commercial &amp; tax invoices plus credit / debit notes. Adjustments
            reference the root invoice they correct so the audit chain stays intact.
          </p>
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
          <Tabs value={kindFilter} onValueChange={v => setKindFilter(v as typeof kindFilter)}>
            <TabsList>
              {KIND_FILTERS.map(f => (
                <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No invoices yet.</p>
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
                  {pagination.paginatedItems.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.invoiceNo}</TableCell>
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
                  ))}
                </TableBody>
              </Table>
              {pagination.totalPages > 1 && (
                <div className="mt-4">
                  <Pagination
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    onPageChange={pagination.goToPage}
                    startIndex={(pagination.currentPage - 1) * 25}
                    endIndex={Math.min(pagination.currentPage * 25, rows.length)}
                    totalItems={rows.length}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <InvoiceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        kind={formKind}
        customers={customers}
        invoices={rows}
        onCreated={async () => { setFormOpen(false); await load(); }}
      />

      {/* Detail dialog */}
      {detailId && (
        <InvoiceDetailDialog
          invoiceId={detailId}
          customers={customers}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onChanged={() => { void load(); }}
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
  description?: string;
  quantity: string;
  unitPrice: string;
}

const blankItem: FormItem = { name: '', quantity: '1', unitPrice: '0' };

function InvoiceFormDialog({
  open, onOpenChange, kind, customers, invoices, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: invoicesApi.InvoiceKind;
  customers: customersApi.Customer[];
  invoices: invoicesApi.Invoice[];
  onCreated: () => Promise<void> | void;
}) {
  const isAdjustment = kind === 'credit_note' || kind === 'debit_note';

  const [customerId, setCustomerId] = useState('');
  const [parentInvoiceId, setParentInvoiceId] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState('4100');
  const [items, setItems] = useState<FormItem[]>([{ ...blankItem }]);
  const [taxAmount, setTaxAmount] = useState('0');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset whenever the dialog opens (kind may have changed).
  useEffect(() => {
    if (open) {
      setCustomerId('');
      setParentInvoiceId('');
      setIssueDate(new Date().toISOString().slice(0, 10));
      setDueDate('');
      setCurrency('USD');
      setExchangeRate('4100');
      setItems([{ ...blankItem }]);
      setTaxAmount('0');
      setDiscountAmount('0');
      setNotes('');
    }
  }, [open, kind]);

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

  const submit = async () => {
    if (!customerId) { toast.error('Customer is required'); return; }
    if (isAdjustment && !parentInvoiceId) { toast.error('Pick the invoice this note adjusts'); return; }
    if (items.length === 0 || items.some(it => !it.name.trim())) {
      toast.error('Each line item needs a name');
      return;
    }
    setSaving(true);
    try {
      await invoicesApi.create({
        kind,
        parentInvoiceId: isAdjustment ? parentInvoiceId : undefined,
        customerId,
        issueDate,
        dueDate: dueDate || undefined,
        currency,
        exchangeRate: Number(exchangeRate) || 1,
        taxAmount: Number(taxAmount) || 0,
        discountAmount: Number(discountAmount) || 0,
        notes: notes || undefined,
        items: items.map(it => ({
          name: it.name.trim(),
          description: it.description,
          quantity: Number(it.quantity) || 0,
          unitPrice: Number(it.unitPrice) || 0,
        })),
      });
      toast.success(`${KIND_LABEL[kind]} created as draft`);
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  const totalKhr = total * (Number(exchangeRate) || 0);

  /** Save and keep the dialog open with a freshly-armed form so the
   *  bookkeeper can enter the next invoice without re-opening the
   *  dialog. Customer + dates carry over; lines + amounts reset. */
  const submitAndNew = async () => {
    if (!customerId) { toast.error('Customer is required'); return; }
    if (isAdjustment && !parentInvoiceId) { toast.error('Pick the invoice this note adjusts'); return; }
    if (items.length === 0 || items.some(it => !it.name.trim())) {
      toast.error('Each line item needs a name');
      return;
    }
    setSaving(true);
    try {
      await invoicesApi.create({
        kind,
        parentInvoiceId: isAdjustment ? parentInvoiceId : undefined,
        customerId,
        issueDate,
        dueDate: dueDate || undefined,
        currency,
        exchangeRate: Number(exchangeRate) || 1,
        taxAmount: Number(taxAmount) || 0,
        discountAmount: Number(discountAmount) || 0,
        notes: notes || undefined,
        items: items.map(it => ({
          name: it.name.trim(),
          description: it.description,
          quantity: Number(it.quantity) || 0,
          unitPrice: Number(it.unitPrice) || 0,
        })),
      });
      toast.success(`${KIND_LABEL[kind]} created — ready for next entry`);
      // Reset for the next entry; keep customer/dates so chained
      // entries against the same customer stay quick.
      setItems([{ ...blankItem }]);
      setTaxAmount('0');
      setDiscountAmount('0');
      setNotes('');
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
          <DialogTitle>New {KIND_LABEL[kind]}</DialogTitle>
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

          <div className="space-y-1.5">
            <Label className="text-xs">Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Pick customer" /></SelectTrigger>
              <SelectContent>
                {customers.length === 0 ? (
                  <SelectItem value="_none" disabled>No customers yet</SelectItem>
                ) : customers.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.type === 'business' ? '(B)' : '(I)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          {/* Line items editor */}
          <div className="space-y-2 border rounded-md p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Line items</Label>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" /> Add line
              </Button>
            </div>
            <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-gray-500 px-1">
              <div className="col-span-5">Item</div>
              <div className="col-span-2 text-right">Qty</div>
              <div className="col-span-2 text-right">Unit price</div>
              <div className="col-span-2 text-right">Line total</div>
              <div className="col-span-1" />
            </div>
            {items.map((it, idx) => {
              const lineTotal = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
              return (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-5 h-8 text-sm"
                    value={it.name}
                    onChange={e => updateItem(idx, { name: e.target.value })}
                    placeholder="Item or service name"
                  />
                  <Input
                    className="col-span-2 h-8 text-sm text-right"
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
                  <div className="col-span-2 text-right text-sm tabular-nums px-2">
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

          {/* Right-aligned summary: labels sit next to their amounts
              rather than spanning the full dialog width. Easier to
              scan vertically and keeps the eye in one column. */}
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

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={2}
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Internal note or memo printed on the invoice"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button variant="outline" onClick={submitAndNew} disabled={saving} title="Save then reset the form for the next entry">
            {saving ? 'Saving…' : 'Save & add new'}
          </Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create draft'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail dialog — read-only view + actions + payments                        */
/* -------------------------------------------------------------------------- */
function InvoiceDetailDialog({
  invoiceId, customers, canEdit, onClose, onChanged,
}: {
  invoiceId: string;
  customers: customersApi.Customer[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [invoice, setInvoice] = useState<invoicesApi.Invoice | null>(null);
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => window.print()} title="Print invoice">
                    <Printer className="h-3.5 w-3.5 mr-1" /> Print
                  </Button>
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
                  <div className="font-mono text-xs">{invoice.parentInvoiceId}</div>
                </>
              )}
            </div>

            {/* Line items */}
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Line total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map(it => (
                    <TableRow key={it.id}>
                      <TableCell className="text-sm">
                        <div>{it.name}</div>
                        {it.description && (
                          <div className="text-xs text-gray-500">{it.description}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">{it.quantity}</TableCell>
                      <TableCell className="text-right text-sm">{fmtMoney(it.unitPrice, invoice.currency)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtMoney(it.lineTotal, invoice.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

            {invoice.notes && (
              <div className="text-sm">
                <div className="text-xs text-gray-500">Notes</div>
                <div className="whitespace-pre-wrap">{invoice.notes}</div>
              </div>
            )}

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
