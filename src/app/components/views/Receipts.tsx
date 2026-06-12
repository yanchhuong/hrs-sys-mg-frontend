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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Plus, RefreshCw, Send, Ban, Pencil, Eye, FileText, Settings, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { SearchablePicker } from '../common/SearchablePicker';
import { AttachmentsPanel } from '../common/AttachmentsPanel';
import { AccountingSettingsDialog } from '../common/AccountingSettingsDialog';
import { Pagination } from '../common/Pagination';
import { usePagination } from '../../hooks/usePagination';
import * as receiptsApi from '../../api/receipts';
import * as receiptPaymentsApi from '../../api/receiptPayments';
import * as vendorsApi from '../../api/vendors';
import { useAuth } from '../../context/AuthContext';

/** Render an amount with the currency prefix. USD collapses to "$";
 *  other currencies keep the ISO code with a space. */
const fmtMoney = (n: number, currency: string): string => {
  // Consistent negative format across the app: "− $X" (leading minus
  // + unsigned amount), never "$-X". The Paid column in particular
  // shows signed values from credit-direction refunds; this keeps it
  // visually aligned with explicit "− {fmtMoney(positive)}" labels.
  const abs = Math.abs(n);
  const num = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const body = currency === 'USD' ? `$${num}` : `${currency} ${num}`;
  return n < 0 ? `− ${body}` : body;
};

/** Current-month ISO bounds for the toolbar date filter default. */
function currentMonthBounds(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = new Date(y, m + 1, 0);
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to:   `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`,
  };
}

/** V98 simplified the status set to Progress / Paid (+ Void). Legacy
 *  draft / issued values still appear in any unmigrated test data;
 *  the badge map collapses them to the Progress style so the UI
 *  reads consistently. */
const STATUS_BADGE_CLASS: Record<receiptsApi.ReceiptStatus, string> = {
  progress: 'bg-blue-50 text-blue-700 border-blue-200',
  paid:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  void:     'bg-red-50 text-red-700 border-red-200',
  draft:    'bg-blue-50 text-blue-700 border-blue-200',
  issued:   'bg-blue-50 text-blue-700 border-blue-200',
};
/** Friendly label — collapses legacy draft / issued to "Progress" so
 *  the visible status matches the two-state mental model. */
const STATUS_LABEL: Record<receiptsApi.ReceiptStatus, string> = {
  progress: 'progress',
  paid:     'paid',
  void:     'void',
  draft:    'progress',
  issued:   'progress',
};

export function Receipts() {
  const { canView, canCreate, canUpdate } = useAuth();
  const canAdd  = canCreate('receipt');
  const canEdit = canUpdate('receipt');

  const [rows, setRows] = useState<receiptsApi.Receipt[]>([]);
  const [vendors, setVendors] = useState<vendorsApi.Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  // Date-range filter — applied client-side. Defaults to the current
  // calendar month so HR lands on recent receipts rather than a
  // multi-year scroll. Clear button on the toolbar empties both inputs.
  const [dateFrom, setDateFrom] = useState(() => currentMonthBounds().from);
  const [dateTo, setDateTo] = useState(() => currentMonthBounds().to);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<receiptsApi.Receipt | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = async () => {
    if (!canView('receipt')) return;
    setLoading(true);
    try {
      const [rRes, vRes] = await Promise.all([
        receiptsApi.list({ size: 500 }),
        vendorsApi.list({ size: 500 }),
      ]);
      setRows(rRes.content ?? []);
      setVendors(vRes.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load receipts');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const vendorById = useMemo(() => {
    const m = new Map<string, vendorsApi.Vendor>();
    vendors.forEach(v => m.set(v.id, v));
    return m;
  }, [vendors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (dateFrom && r.issueDate < dateFrom) return false;
      if (dateTo   && r.issueDate > dateTo)   return false;
      if (!q) return true;
      const vn = vendorById.get(r.vendorId)?.name?.toLowerCase() ?? '';
      return r.receiptNo.toLowerCase().includes(q)
        || vn.includes(q)
        || (r.taxId ?? '').toLowerCase().includes(q);
    });
  }, [rows, search, dateFrom, dateTo, vendorById]);

  const pagination = usePagination(filtered, 25);

  // Reset pagination to page 1 whenever a filter changes so HR
  // doesn't sit on a stale page after narrowing the results.
  useEffect(() => {
    pagination.goToPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, search]);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit   = (r: receiptsApi.Receipt) => { setEditing(r); setFormOpen(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-bold">Receipt</h1>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}
                  title="Receipt settings">
            <Settings className="h-4 w-4" />
          </Button>
          {canAdd && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" /> New Receipt
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              placeholder="Search by receipt no, vendor, tax id…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-500">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-40"
              />
              <Label className="text-xs text-gray-500">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-40"
              />
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="sm"
                        onClick={() => { setDateFrom(''); setDateTo(''); }}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No receipts yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Receipt No</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Type of Supplier</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="text-right w-32">Amount</TableHead>
                  <TableHead className="text-right w-32">Tax</TableHead>
                  <TableHead className="text-right w-32">Paid</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-40 text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map(r => {
                  const v = vendorById.get(r.vendorId);
                  return (
                    <TableRow key={r.id} className="hover:bg-gray-50">
                      <TableCell className="font-mono text-sm">{r.receiptNo}</TableCell>
                      <TableCell>{v?.name ?? <span className="text-gray-400">(unknown)</span>}</TableCell>
                      <TableCell className="capitalize text-sm">
                        {(receiptsApi.SUPPLIER_TYPES.find(s => s.key === r.supplierType)?.label) ?? r.supplierType}
                      </TableCell>
                      <TableCell className="text-sm">{r.issueDate}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.amount, r.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.taxAmount, r.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {/* Receipt payments default to Debit (money out), so
                            paidAmount is typically negative. Show magnitude
                            with a leading "−" when funds went out, "+" on
                            the rare credit-direction refund. */}
                        {r.paidAmount === 0
                          ? <span className="text-gray-300">—</span>
                          : r.paidAmount < 0
                            ? `− ${fmtMoney(Math.abs(r.paidAmount), r.currency)}`
                            : `+ ${fmtMoney(r.paidAmount, r.currency)}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[r.status]}`}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setDetailId(r.id)}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> View
                          </Button>
                          {canEdit && (r.status === 'draft' || r.status === 'issued') && (
                            <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {pagination.totalPages > 1 && (
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              onPageChange={pagination.goToPage}
              startIndex={pagination.startIndex}
              endIndex={pagination.endIndex}
              totalItems={pagination.totalItems}
            />
          )}
        </CardContent>
      </Card>

      <ReceiptFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        editing={editing}
        vendors={vendors}
        onSaved={async () => { setFormOpen(false); setEditing(null); await load(); }}
      />

      {detailId && (
        <ReceiptDetailDialog
          receiptId={detailId}
          vendors={vendors}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onChanged={() => { void load(); }}
          onEdit={openEdit}
        />
      )}

      {/* Tenant-wide Receipt settings (single Notes toggle + RCPT
          prefix + WHT tax-type list). Independent row from
          Invoice + Bill settings. */}
      <AccountingSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        scope="receipt"
      />
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Create / edit dialog                                                 */
/* -------------------------------------------------------------------- */

function ReceiptFormDialog({
  open, onOpenChange, editing, vendors, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: receiptsApi.Receipt | null;
  vendors: vendorsApi.Vendor[];
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = !!editing;
  const [savedReceiptId, setSavedReceiptId] = useState<string | null>(null);
  const [receiptNo, setReceiptNo] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplierType, setSupplierType] = useState<receiptsApi.SupplierType>('taxable_person');
  const [taxId, setTaxId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState('4100');
  const [amount, setAmount] = useState('0');
  const [taxType, setTaxType] = useState<receiptsApi.ReceiptTaxType | ''>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset / seed when dialog opens
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setSavedReceiptId(editing.id);
      setReceiptNo(editing.receiptNo);
      setVendorId(editing.vendorId);
      setIssueDate(editing.issueDate);
      setSupplierType(editing.supplierType);
      setTaxId(editing.taxId ?? '');
      setCurrency(editing.currency);
      setExchangeRate(String(editing.exchangeRate));
      setAmount(String(editing.amount));
      setTaxType((editing.taxType ?? '') as any);
      setNotes(editing.notes ?? '');
    } else {
      setSavedReceiptId(null);
      receiptsApi.nextNumber().then(r => setReceiptNo(r.receiptNo)).catch(() => setReceiptNo(''));
      setVendorId('');
      setIssueDate(new Date().toISOString().slice(0, 10));
      setSupplierType('taxable_person');
      setTaxId('');
      setCurrency('USD');
      setExchangeRate('4100');
      setAmount('0');
      setTaxType('');
      setNotes('');
    }
  }, [open, editing]);

  // Pre-fill Tax ID from vendor TIN on first pick (or vendor change),
  // but only when the user hasn't typed something custom in.
  useEffect(() => {
    if (!vendorId) return;
    const v = vendors.find(x => x.id === vendorId);
    if (v?.tin && (taxId === '' || taxId === undefined)) {
      setTaxId(v.tin);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [vendorId]);

  const amountNum = Number(amount) || 0;
  const taxRate = taxType ? receiptsApi.RECEIPT_TAX_TYPE_BY_KEY[taxType]?.rate ?? 0 : 0;
  const computedTax = taxType ? +(amountNum * taxRate / 100).toFixed(2) : 0;

  const validate = (): boolean => {
    if (!vendorId) { toast.error('Vendor is required'); return false; }
    if (!amount || isNaN(Number(amount))) { toast.error('Amount must be a number'); return false; }
    return true;
  };

  const buildPayload = (): receiptsApi.ReceiptRequest => ({
    receiptNo: receiptNo.trim() || undefined,
    vendorId,
    issueDate,
    supplierType,
    taxId: taxId.trim() || undefined,
    currency: currency.trim().toUpperCase(),
    exchangeRate: Number(exchangeRate) || 0,
    amount: amountNum,
    taxType: taxType || '',
    taxAmount: computedTax,
    notes: notes.trim() || undefined,
  });

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit && editing) {
        await receiptsApi.update(editing.id, buildPayload());
        toast.success(`${editing.receiptNo} updated`);
      } else {
        const created = await receiptsApi.create(buildPayload());
        setSavedReceiptId(created.id);
        toast.success(`Receipt ${created.receiptNo} created`);
      }
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save receipt');
    } finally {
      setSaving(false);
    }
  };

  /** Save as Draft + reset the form so the bookkeeper can chain
   *  entries. Receipts always land on Draft from this dialog —
   *  promotion to Issued happens later from the row's View Details
   *  popup. */
  const submitAndNew = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const created = await receiptsApi.create(buildPayload());
      toast.success(`Receipt ${created.receiptNo} created`);
      // Reset the bits that change per row; keep vendor + currency
      // + dates so chaining stays fast.
      setSavedReceiptId(null);
      receiptsApi.nextNumber().then(r => setReceiptNo(r.receiptNo)).catch(() => setReceiptNo(''));
      setAmount('0');
      setTaxType('');
      setNotes('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create receipt');
    } finally {
      setSaving(false);
    }
  };

  /** Save as Draft + close the dialog. Same workflow as Create
   *  draft; offered as a left-side action for the common "save and
   *  move on" case so HR's thumb doesn't have to travel. */
  const submitAndClose = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const created = await receiptsApi.create(buildPayload());
      toast.success(`Receipt ${created.receiptNo} created`);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create receipt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${editing?.receiptNo}` : 'New Receipt'}</DialogTitle>
          <DialogDescription className="sr-only">Receipt form</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Receipt No</Label>
              <Input value={receiptNo} onChange={e => setReceiptNo(e.target.value)}
                     className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Vendor *</Label>
            <SearchablePicker
              value={vendorId}
              onChange={setVendorId}
              placeholder="Pick vendor"
              options={vendors.map(v => ({
                value: v.id,
                label: v.name,
                searchKey: `${v.name} ${v.phone ?? ''} ${v.tin ?? ''}`,
              }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type of Supplier *</Label>
              <Select value={supplierType} onValueChange={v => setSupplierType(v as receiptsApi.SupplierType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {receiptsApi.SUPPLIER_TYPES.map(s => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tax ID</Label>
              <Input value={taxId} onChange={e => setTaxId(e.target.value)}
                     placeholder="E/K/L000-000000000 if in Cambodia" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <div className="flex gap-3 items-center h-9">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" checked={currency === 'KHR'} onChange={() => setCurrency('KHR')} /> KHR
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" checked={currency === 'USD'} onChange={() => setCurrency('USD')} /> USD
                </label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Exchange rate (KHR / 1 USD)</Label>
              <Input type="number" value={exchangeRate}
                     onChange={e => setExchangeRate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount *</Label>
              <Input type="number" min={0} step="0.01" value={amount}
                     onChange={e => setAmount(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Withholding Tax</Label>
              <Select value={taxType || '_none'}
                      onValueChange={v => setTaxType(v === '_none' ? '' : v as receiptsApi.ReceiptTaxType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {receiptsApi.RECEIPT_TAX_TYPES.map(t => (
                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Tax Amount
                {taxType && (
                  <span className="text-[10px] text-gray-400 ml-1">
                    @ {taxRate}% → {fmtMoney(computedTax, currency)}
                  </span>
                )}
              </Label>
              <Input type="number" min={0} step="0.01"
                     value={taxType ? computedTax.toFixed(2) : '0'}
                     disabled
                     title="Auto-computed from the WHT pattern" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Internal memo" />
          </div>

          {/* Attachments — once the receipt has been saved (or in
              edit mode), the panel lights up. Pre-save creates show
              a hint and disable upload. */}
          <div className="border-t pt-3">
            <AttachmentsPanel docType="receipt" docId={savedReceiptId} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          {/* All three save paths land on Draft — Receipts are
              recorded as drafts during data entry and promoted to
              Issued explicitly from the row's View Details popup. */}
          {!isEdit && (
            <>
              <Button variant="outline" onClick={submitAndNew} disabled={saving}
                      title="Save as Draft and reset the form for the next entry">
                {saving ? 'Saving…' : 'Save & add new'}
              </Button>
              <Button variant="outline" onClick={submitAndClose} disabled={saving}
                      title="Save as Draft and close the dialog">
                {saving ? 'Saving…' : 'Save & close'}
              </Button>
            </>
          )}
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------- */
/* Detail dialog                                                        */
/* -------------------------------------------------------------------- */

function ReceiptDetailDialog({
  receiptId, vendors, canEdit, onClose, onChanged, onEdit,
}: {
  receiptId: string;
  vendors: vendorsApi.Vendor[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (r: receiptsApi.Receipt) => void;
}) {
  const [receipt, setReceipt] = useState<receiptsApi.Receipt | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setReceipt(await receiptsApi.get(receiptId)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load receipt'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [receiptId]);

  const doAction = async (label: string, fn: () => Promise<receiptsApi.Receipt>) => {
    setBusy(true);
    try {
      setReceipt(await fn());
      toast.success(label);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally { setBusy(false); }
  };

  const vendor = receipt ? vendors.find(v => v.id === receipt.vendorId) : undefined;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="font-mono">{receipt?.receiptNo ?? 'Receipt'}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                {loading || !receipt ? (
                  <span className="text-xs text-gray-500">Loading…</span>
                ) : (
                  <>
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      <FileText className="h-3 w-3 mr-1" /> Receipt
                    </Badge>
                    <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[receipt.status]}`}>
                      {STATUS_LABEL[receipt.status] ?? receipt.status}
                    </Badge>
                    <span className="text-xs text-gray-500">{receipt.issueDate}</span>
                  </>
                )}
              </DialogDescription>
            </div>
            {receipt && (
              <div className="flex gap-1.5 mr-8">
                {/* Progress is the active editable state; Paid is the
                    settled terminal (read-only). Void is destructive
                    cancellation. The legacy Issue button is gone — the
                    receipt is already in progress on creation. */}
                {canEdit && receipt.status !== 'void' && receipt.status !== 'paid' && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onEdit(receipt)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                )}
                {canEdit && receipt.status !== 'void' && (
                  <Button size="sm" variant="outline" disabled={busy}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => doAction('Receipt voided',
                            () => receiptsApi.voidReceipt(receipt.id))}>
                    <Ban className="h-3.5 w-3.5 mr-1" /> Void
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {loading || !receipt ? (
          <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div className="text-gray-500">Vendor</div>
              <div>{vendor?.name ?? <span className="text-gray-400">(unknown)</span>}</div>
              <div className="text-gray-500">Type of Supplier</div>
              <div>
                {(receiptsApi.SUPPLIER_TYPES.find(s => s.key === receipt.supplierType)?.label) ?? receipt.supplierType}
              </div>
              <div className="text-gray-500">Tax ID</div>
              <div className="font-mono">{receipt.taxId || <span className="text-gray-400">—</span>}</div>
              <div className="text-gray-500">Currency</div>
              <div>{receipt.currency}</div>
              <div className="text-gray-500">Amount</div>
              <div className="tabular-nums">{fmtMoney(receipt.amount, receipt.currency)}</div>
              <div className="text-gray-500">Withholding Tax</div>
              <div>
                {receipt.taxType && receiptsApi.RECEIPT_TAX_TYPE_BY_KEY[receipt.taxType]
                  ? receiptsApi.RECEIPT_TAX_TYPE_BY_KEY[receipt.taxType].label
                  : <span className="text-gray-400 italic">None</span>}
              </div>
              <div className="text-gray-500">Tax Amount</div>
              <div className="tabular-nums">{fmtMoney(receipt.taxAmount, receipt.currency)}</div>
            </div>

            {receipt.notes && (
              <div className="bg-slate-50 rounded-md p-3 text-sm">
                <div className="text-xs text-gray-500 mb-1">Notes</div>
                <div className="whitespace-pre-wrap">{receipt.notes}</div>
              </div>
            )}

            <div className="border-t pt-3">
              <ReceiptPaymentsPanel
                receiptId={receipt.id}
                receiptAmount={receipt.amount}
                receiptCurrency={receipt.currency}
                readOnly={receipt.status === 'void' || !canEdit}
              />
            </div>

            <div className="border-t pt-3">
              <AttachmentsPanel docType="receipt" docId={receipt.id}
                                readOnly={receipt.status === 'void' || !canEdit} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------- */
/* Payments panel — embedded in the Receipt detail dialog               */
/* -------------------------------------------------------------------- */

function ReceiptPaymentsPanel({
  receiptId, receiptAmount, receiptCurrency, readOnly,
}: {
  receiptId: string;
  receiptAmount: number;
  receiptCurrency: string;
  readOnly: boolean;
}) {
  const [rows, setRows] = useState<receiptPaymentsApi.ReceiptPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await receiptPaymentsApi.listForReceipt(receiptId)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load payments'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [receiptId]);

  // Signed sum mirrors the backend math: credit = +amount, debit = -amount.
  const paid = rows.reduce((s, r) => s + (r.direction === 'debit' ? -r.amount : r.amount), 0);
  const remain = receiptAmount - paid;

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this payment?')) return;
    try {
      await receiptPaymentsApi.remove(id);
      toast.success('Payment deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-gray-500" /> Payments
          {rows.length > 0 && (
            <span className="text-xs text-gray-500">({rows.length})</span>
          )}
        </div>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Record Payment
          </Button>
        )}
      </div>

      {/* Tiny ledger strip — Receipt amount, what's been paid, what's
          left. Helps spot half-paid receipts without doing arithmetic. */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="bg-slate-50 rounded p-2">
          <div className="text-gray-500">Receipt amount</div>
          <div className="font-mono">{fmtMoney(receiptAmount, receiptCurrency)}</div>
        </div>
        <div className="bg-slate-50 rounded p-2">
          <div className="text-gray-500">Paid</div>
          <div className="font-mono">{fmtMoney(paid, receiptCurrency)}</div>
        </div>
        <div className="bg-slate-50 rounded p-2">
          <div className="text-gray-500">Remain</div>
          <div className={`font-mono ${remain > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {fmtMoney(remain, receiptCurrency)}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No payments yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Date</TableHead>
              <TableHead className="w-24">Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="w-20">Direction</TableHead>
              <TableHead className="text-right w-28">Amount</TableHead>
              {!readOnly && <TableHead className="w-10"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{r.paymentDate}</TableCell>
                <TableCell className="text-xs capitalize">{r.method}</TableCell>
                <TableCell className="text-xs text-gray-500">{r.referenceNo || '—'}</TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className={r.direction === 'debit'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'}>
                    {r.direction === 'debit' ? '− Out' : '+ In'}
                  </Badge>
                </TableCell>
                <TableCell className={`text-right font-mono text-xs ${r.direction === 'debit' ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {r.direction === 'debit' ? '−' : ''}{fmtMoney(r.amount, receiptCurrency)}
                </TableCell>
                {!readOnly && (
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600"
                            onClick={() => void handleDelete(r.id)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <RecordReceiptPaymentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        receiptId={receiptId}
        defaultAmount={Math.max(0, remain)}
        currency={receiptCurrency}
        onSaved={() => { setAddOpen(false); void load(); }}
      />
    </div>
  );
}

function RecordReceiptPaymentDialog({
  open, onOpenChange, receiptId, defaultAmount, currency, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  receiptId: string;
  defaultAmount: number;
  currency: string;
  onSaved: () => void;
}) {
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(String(defaultAmount.toFixed(2)));
  const [method, setMethod] = useState<receiptPaymentsApi.PaymentMethod>('cash');
  // Receipts are typically money out (we paid the supplier and now
  // record the WHT receipt against it), so debit is the natural
  // default — saves HR from changing it on every save.
  const [direction, setDirection] = useState<receiptPaymentsApi.PaymentDirection>('debit');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setAmount(String(Math.max(0, defaultAmount).toFixed(2)));
    setMethod('cash');
    setDirection('debit');
    setReferenceNo('');
    setNotes('');
  }, [open, defaultAmount]);

  const submit = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }
    setSaving(true);
    try {
      await receiptPaymentsApi.create({
        receiptId,
        paymentDate,
        amount: amt,
        method,
        direction,
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success('Payment recorded');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription className="text-xs">
            {currency} {defaultAmount.toFixed(2)} remaining on this receipt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount *</Label>
              <Input type="number" min={0} step="0.01" value={amount}
                     onChange={e => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Method</Label>
              <Select value={method} onValueChange={v => setMethod(v as receiptPaymentsApi.PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Direction</Label>
              <Select value={direction} onValueChange={v => setDirection(v as receiptPaymentsApi.PaymentDirection)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">+ Money in (Credit)</SelectItem>
                  <SelectItem value="debit">− Money out (Debit)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reference No</Label>
            <Input value={referenceNo} onChange={e => setReferenceNo(e.target.value)}
                   placeholder="Cheque #, bank ref, auth code" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
