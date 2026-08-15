import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Plus, RefreshCw, Eye, Pencil, Trash2, Ban, FileText, ArrowRightCircle, Printer,
  Mail, ChevronDown, Search, Settings, Send, MessageCircle, Loader2, Info, Share2,
  ScanBarcode,
} from 'lucide-react';
import { CameraBarcodeScanner } from '../common/CameraBarcodeScanner';
import { capturePrintImage } from '../../utils/capturePrintInvoice';
import { capturePrintPdf } from '../../utils/capturePrintPdf';
import { AccountingSettingsDialog } from '../common/AccountingSettingsDialog';
import * as accountingSettingsApi from '../../api/accountingSettings';
import { toast } from 'sonner';
import { SearchablePicker } from '../common/SearchablePicker';
import { Pagination } from '../common/Pagination';
import { DateInput } from '../common/DateInput';
import { usePagination } from '../../hooks/usePagination';
import { formatMoneyForCurrency } from '../../utils/format';
import * as quotationsApi from '../../api/quotations';
import { useI18n } from '../../i18n/I18nContext';
import { addRecentLineItems, getRecentLineItems } from '../../utils/recentLineItems';
import { StockItemPicker } from '../common/StockItemPicker';
import { TableRowsSkeleton } from '../common/LoadingSkeletons';
import { useCustomerQuickAdd } from '../common/CustomerQuickAddDialog';
import { useForwardShare } from '../common/ForwardShareDialog';
import * as itemsApi from '../../api/items';
import * as customersApi from '../../api/customers';
import * as telegramApi from '../../api/telegram';
import * as settingsApi from '../../api/settings';
import * as currencyApi from '../../api/currencySettings';
import * as usersApi from '../../api/users';
import { loadBankAccounts } from '../../utils/bankAccount';
import { printWithKhmerFonts } from '../../utils/printFonts';
import { useAuth } from '../../context/AuthContext';
import { useDateFormat } from '../../context/DateFormatContext';

/** Floating popover that lists every contact reachable for a
 *  quotation — the primary recipient (name/email/phone stamped on the
 *  quote) plus the customer-side fallback (customer name + phone) so
 *  the operator sees who's available without opening the Mail dialog.
 *  Same logic + look in the list page's Recipient cell and the detail
 *  dialog's Recipient row. */
function RecipientsPopover({
  quotation, customer, side = 'bottom',
}: {
  quotation: quotationsApi.Quotation;
  customer?: customersApi.Customer;
  side?: 'bottom' | 'right' | 'top' | 'left';
}) {
  const primaryName = quotation.recipientName || customer?.representative;
  const rows: { label: string; name?: string | null; email?: string | null; phone?: string | null }[] = [];
  rows.push({
    label: 'Primary',
    name: primaryName,
    email: quotation.recipientEmail,
    phone: quotation.recipientPhone,
  });
  if (customer?.name && customer.name !== primaryName) {
    rows.push({ label: 'Customer', name: customer.name, phone: customer.phone });
  } else if (customer?.phone && customer.phone !== quotation.recipientPhone) {
    rows.push({ label: 'Customer phone', phone: customer.phone });
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-gray-400 hover:text-gray-700 align-middle"
          title="Show all recipients"
          onClick={(e) => e.stopPropagation()}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} align="start" className="w-64 p-2">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 px-1 pb-1">
          Recipients
        </div>
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="rounded border bg-white px-2 py-1.5">
              <div className="text-[9px] uppercase tracking-wide text-gray-400">{r.label}</div>
              {r.name && <div className="text-gray-800 text-xs">{r.name}</div>}
              {r.email && <div className="text-blue-700 tabular-nums text-[11px] break-all">{r.email}</div>}
              {r.phone && <div className="text-gray-600 text-[11px]">{r.phone}</div>}
              {!r.name && !r.email && !r.phone && (
                <div className="text-gray-400 text-[11px]">(no contact info)</div>
              )}
            </div>
          ))}
        </div>
        <div className="text-[10px] text-gray-500 px-1 pt-2">
          Separate addresses with commas in the Mail dialog.
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** USD collapses to "$"; KHR uses the riel symbol ៛ matching the
 *  rest of the accounting flows. Negative renders with leading "− "
 *  (almost never happens on a quote — totals are gross positives —
 *  but kept symmetrical with Invoice / Bill / Receipt). */
/**
 * Constrain a raw input string to a decimal shape: digits, an optional
 * single dot, and at most two fractional digits. Cursor-friendly —
 * returns the sanitized text so the controlled input keeps whatever
 * the user *could* have meant (e.g. "1." while they're mid-type). Used
 * on the unit-price cell so cashiers can't paste letters or currency
 * symbols and derail qty × unit-price arithmetic.
 */
const maskDecimal = (raw: string): string => {
  let s = raw.replace(/[^\d.]/g, '');
  const first = s.indexOf('.');
  if (first !== -1) {
    // Keep only the FIRST dot; strip any further ones.
    s = s.slice(0, first + 1) + s.slice(first + 1).replace(/\./g, '');
  }
  const [intPart, decPart] = s.split('.');
  return decPart !== undefined ? `${intPart}.${decPart.slice(0, 2)}` : s;
};

const fmtMoney = (n: number, currency: string): string => {
  const epsilon = currency === 'KHR' ? 0.5 : 0.005;
  if (Math.abs(n) < epsilon) n = 0;
  const num = formatMoneyForCurrency(Math.abs(n), currency);
  const body = currency === 'USD' ? `$${num}`
    : currency === 'KHR' ? `៛ ${num}`
    : `${currency} ${num}`;
  return n < 0 ? `− ${body}` : body;
};

const STATUS_BADGE_CLASS: Record<quotationsApi.QuotationStatus, string> = {
  // Amber for pending — reads as "waiting" without leaning on red
  // (which would imply rejection). V176.
  pending:  'border-amber-300 text-amber-700 bg-amber-50',
  progress: 'border-blue-300 text-blue-700 bg-blue-50',
  done:     'border-emerald-300 text-emerald-700 bg-emerald-50',
  close:    'border-slate-300 text-slate-700 bg-slate-50',
};

const STATUS_FILTERS: ReadonlyArray<{ value: quotationsApi.QuotationStatus | 'all'; label: string }> = [
  { value: 'all',      label: 'All' },
  // Pending sits first after All so operators spot chain-gated
  // quotes without hunting. V176.
  { value: 'pending',  label: 'Pending' },
  { value: 'progress', label: 'Progress' },
  { value: 'done',     label: 'Done' },
  { value: 'close',    label: 'Close' },
];

/** Taxation matrix — mirrors the Invoice page so a quote can use the
 *  same tax patterns and the converted invoice picks them up
 *  unchanged. */
const TAX_TYPES = [
  { key: '1',  label: 'VAT 10%',         rate: 10 },
  { key: '2',  label: 'VAT 0%',          rate: 0 },
  { key: '3',  label: 'Exclusive VAT',   rate: 0 },
  { key: '11', label: 'WHT 15%',         rate: 15 },
  { key: '12', label: 'WHT 14%',         rate: 14 },
] as const;
const TAX_TYPE_BY_KEY: Record<string, typeof TAX_TYPES[number]> =
  TAX_TYPES.reduce((acc, t) => ({ ...acc, [t.key]: t }), {});

/**
 * Sale Quotations — pre-invoice quotes the company sends to a
 * customer. Once accepted the operator hits Convert → Invoice which
 * spawns a Commercial invoice and locks the quote as Done.
 *
 * <p>UI mirrors the Invoice page but skips the payment workflow
 * entirely — quotes have no AR / receipts / refunds / adjustments.
 * The status set is just Progress (editable) / Done (converted) /
 * Close (manually closed, lost lead).</p>
 */
export function Quotations() {
  const { canView, canCreate, canUpdate, canDelete } = useAuth();
  const { formatDate } = useDateFormat();
  const { t } = useI18n();
  const canAdd    = canCreate('quotation');
  const canEdit   = canUpdate('quotation');
  const canRemove = canDelete('quotation');
  const canConvert = canUpdate('quotation') && canCreate('invoice');

  const [rows, setRows] = useState<quotationsApi.Quotation[]>([]);
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<quotationsApi.QuotationStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  // Empty defaults so the landing view shows every quotation; users
  // pick a range to narrow. Pagination bounds the scroll.
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<quotationsApi.Quotation | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<quotationsApi.Quotation | null>(null);

  // Sale-side Accountant settings — shared with Invoice and Voucher.
  // Gates Notes / Terms / Discount / Tax on every Sale form so all
  // three documents render the same field set without per-page drift.
  const [settings, setSettings] = useState<accountingSettingsApi.AccountingSettings>(
    accountingSettingsApi.defaultsFor('quotation'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    accountingSettingsApi.get('quotation').then(setSettings).catch(() => {
      setSettings(accountingSettingsApi.defaultsFor('quotation'));
    });
  }, []);

  const load = async () => {
    if (!canView('quotation')) return;
    setLoading(true);
    try {
      const [qRes, cRes] = await Promise.all([
        // v-perf-list-slim — slim=true drops notes / terms / items[]
        // from the response. Row-open re-fetches the fat DTO via
        // quotationsApi.get() so edit / print still get everything.
        quotationsApi.list({ size: 500, slim: true }),
        customersApi.list({ size: 500 }),
      ]);
      setRows(qRes.content ?? []);
      setCustomers(cRes.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load quotations');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const customerById = useMemo(() => {
    const m = new Map<string, customersApi.Customer>();
    customers.forEach(c => m.set(c.id, c));
    return m;
  }, [customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (dateFrom && r.issueDate < dateFrom) return false;
      if (dateTo   && r.issueDate > dateTo)   return false;
      if (!q) return true;
      const cn = customerById.get(r.customerId)?.name?.toLowerCase() ?? '';
      return r.quotationNo.toLowerCase().includes(q)
        || cn.includes(q)
        || (r.recipientName ?? '').toLowerCase().includes(q)
        || (r.notes ?? '').toLowerCase().includes(q);
    });
  }, [rows, statusFilter, dateFrom, dateTo, search, customerById]);

  const pagination = usePagination(filtered, 25);
  useEffect(() => {
    pagination.goToPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFrom, dateTo, search]);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  /** v-perf-list-slim — the list payload now ships without items[]
   *  / notes / terms (slim projection), so we re-fetch the fat DTO
   *  before opening the edit form. Opens optimistically with the
   *  slim row so the dialog paints immediately; a fresh {@code get}
   *  overwrites it with the full record once the network call
   *  resolves. Save path is unchanged — the form still POSTs the
   *  full items array back. */
  const openEdit = (q: quotationsApi.Quotation) => {
    setEditing(q);
    setFormOpen(true);
    void quotationsApi.get(q.id)
      .then(full => setEditing(prev => prev && prev.id === full.id ? full : prev))
      .catch(() => { /* toast omitted — the slim row is a valid interim state */ });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await quotationsApi.remove(deleteTarget.id);
      toast.success(`Deleted ${deleteTarget.quotationNo}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <h1 className="text-3xl font-bold km-title">{t('nav.quotation')}</h1>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {/* Settings popup — shared Sale-side row, gates Notes / Terms /
              Discount / Tax on Quotation, Invoice, and Voucher forms. */}
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}
                  title="Accountant settings">
            <Settings className="h-4 w-4" />
          </Button>
          {canAdd && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" /> New Quotation
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="filter-strip">
            <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
              <TabsList>
                {STATUS_FILTERS.map(f => (
                  <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-500">From</Label>
              <DateInput
                value={dateFrom || null}
                onChange={v => setDateFrom(v ?? '')}
                max={dateTo || undefined}
              />
              <Label className="text-xs text-gray-500">To</Label>
              <DateInput
                value={dateTo || null}
                onChange={v => setDateTo(v ?? '')}
                min={dateFrom || undefined}
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
                  placeholder="Search quotation no, customer, recipient…"
                  className="h-8 pl-7 w-64 text-sm"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableRowsSkeleton rows={8} columns={7} />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No quotations yet.</p>
          ) : (
            <div className="border rounded-md overflow-auto max-h-[calc(100vh-280px)]">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10 shadow-[inset_0_-1px_0_0_rgb(229,231,235)]">
                <TableRow>
                  <TableHead className="w-44">Quote No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead className="w-28">Issue Date</TableHead>
                  <TableHead className="w-28">Expiry</TableHead>
                  <TableHead className="text-right w-32">Total</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map(q => {
                  const c = customerById.get(q.customerId);
                  const primaryName = q.recipientName || c?.representative;
                  return (
                    <TableRow key={q.id} className="hover:bg-gray-50">
                      <TableCell className="tabular-nums text-sm">{q.quotationNo}</TableCell>
                      <TableCell>{c?.name ?? <span className="text-gray-400">(unknown)</span>}</TableCell>
                      <TableCell className="text-sm text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <span>{primaryName ?? '—'}</span>
                          <RecipientsPopover quotation={q} customer={c} />
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(q.issueDate)}</TableCell>
                      <TableCell className="text-sm">{q.expiryDate ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(q.total, q.currency)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[q.status]}`}>
                          {q.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setDetailId(q.id)} title="View details">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canEdit && q.status === 'progress' && (
                            <Button size="sm" variant="ghost" onClick={() => openEdit(q)} title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canRemove && q.status === 'progress' && (
                            <Button size="sm" variant="ghost"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => setDeleteTarget(q)}
                                    title="Delete">
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
            </div>
          )}
          {filtered.length > 0 && (
            <div className="px-1 py-0 border-t">
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

      <QuotationFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        editing={editing}
        customers={customers}
        setCustomers={setCustomers}
        settings={settings}
        onSaved={async () => { setFormOpen(false); setEditing(null); await load(); }}
      />

      <AccountingSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        scope="quotation"
        onSaved={setSettings}
      />

      {detailId && (
        <QuotationDetailDialog
          quotationId={detailId}
          customers={customers}
          settings={settings}
          canConvert={canConvert}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onChanged={() => { void load(); }}
          onEdit={openEdit}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.quotationNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Only quotations still in Progress can be deleted. Done / Close rows stay for audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create / Edit dialog                                               */
/* ------------------------------------------------------------------ */

interface FormLine {
  /** Local-only id so React can stable-key rows during add/remove
   *  before the server assigns a real UUID on save. */
  localId: string;
  stockItemId?: string | null;
  name: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  /** Holds the raw text the user is typing in the Total cell while
   *  that cell has focus. Lets the input stay controlled while we
   *  back-compute unitPrice = total ÷ qty without the cursor jumping
   *  on every keystroke. Cleared on blur / qty / unitPrice edits. */
  totalEditing?: string;
}

function newLine(): FormLine {
  return {
    localId: Math.random().toString(36).slice(2),
    name: '', description: '', unit: '', quantity: '1', unitPrice: '0',
  };
}

function QuotationFormDialog({
  open, onOpenChange, editing, customers, setCustomers, settings, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: quotationsApi.Quotation | null;
  customers: customersApi.Customer[];
  /** Passed through to {@link useCustomerQuickAdd} so the inline
   *  "Add customer" flow can extend the parent's cached list on
   *  create (v-customer-quickadd). */
  setCustomers: React.Dispatch<React.SetStateAction<customersApi.Customer[]>>;
  /** Sale-scope Accountant settings — gates Notes / Terms /
   *  Discount / Tax just like the Invoice form. */
  settings: accountingSettingsApi.AccountingSettings;
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = !!editing;
  const [quotationNo, setQuotationNo] = useState('');
  const [customerId, setCustomerId] = useState('');
  // v-customer-quickadd — inline "Add customer" flow for the picker.
  // Same shape POS uses; adds the created row to the parent's
  // customers list and pins it as the current selection.
  const quickAdd = useCustomerQuickAdd({
    customers,
    setCustomers,
    onSelect: id => setCustomerId(id),
  });
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState('4100');
  const [taxType, setTaxType] = useState('');
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [discountValue, setDiscountValue] = useState('0');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [lines, setLines] = useState<FormLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  // Approver picker state (V172, Phase 3b) — manual-assign chain,
  // mirrors CashAdvances. Empty = skip approval, quotation flows
  // through the existing progress → done / close states unchanged.
  const [users, setUsers] = useState<usersApi.User[]>([]);
  const [approver1, setApprover1] = useState('');
  const [approver2, setApprover2] = useState('');
  const [approver3, setApprover3] = useState('');
  // Recent-items typeahead — same pattern as Invoices. Tracks which
  // row's Item input is focused so the dropdown only renders for it.
  const [focusedLineId, setFocusedLineId] = useState<string | null>(null);
  const [recentItems, setRecentItems] = useState(() => getRecentLineItems());
  // Stock-catalog picker state — lazy-loaded on first open of any
  // line's picker, then shared across rows. Same lazy pattern as
  // the Invoice form to keep the dialog mount path light.
  const [stockCatalog, setStockCatalog] = useState<itemsApi.Item[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  // Per-tenant gate from the Items → Settings dialog (V120). Hidden
  // when the tenant hasn't opted in for Quotation.
  const [pickerEnabled, setPickerEnabled] = useState(false);
  /** V302 phase 2 — barcode scan input gate. */
  const [barcodeFeatureOn, setBarcodeFeatureOn] = useState(false);
  useEffect(() => {
    itemsApi.getUsageSettings()
      .then(s => {
        setPickerEnabled(s.enabledForQuotation);
        setBarcodeFeatureOn(s.enabledForBarcode);
      })
      .catch(() => { setPickerEnabled(false); setBarcodeFeatureOn(false); });
  }, []);

  // Tenant currency settings (V166). Drives the currency dropdown +
  // the default new-document currency / exchange rate. Refetched
  // every time the dialog OPENS so a currency change made via
  // Settings > Currency lands here on the next open rather than only
  // after a page reload.
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  useEffect(() => {
    if (!open) return;
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, [open]);
  const currencyOptions = currencyApi.enabledCurrencies(currencySettings);
  const ensureCatalog = async () => {
    if (catalogLoaded) return;
    try {
      const res = await itemsApi.list({ size: 1000 });
      setStockCatalog(res.content ?? []);
    } catch {
      // Silent fail — a 403 (no stock perm) just leaves the picker
      // empty; free-text lines still work.
    } finally {
      setCatalogLoaded(true);
    }
  };

  // Reset / seed when dialog opens
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setQuotationNo(editing.quotationNo);
      setCustomerId(editing.customerId);
      setIssueDate(editing.issueDate);
      setExpiryDate(editing.expiryDate ?? '');
      setRecipientName(editing.recipientName ?? '');
      setRecipientEmail(editing.recipientEmail ?? '');
      setRecipientPhone(editing.recipientPhone ?? '');
      setCurrency(editing.currency);
      setExchangeRate(String(editing.exchangeRate));
      setTaxType(editing.taxType ?? '');
      setDiscountType((editing.discountType as 'amount' | 'percent') ?? 'amount');
      setDiscountValue(String(editing.discountValue));
      setNotes(editing.notes ?? '');
      setTerms(editing.terms ?? '');
      setLines(editing.items.length > 0
        ? editing.items.map(it => ({
            localId: it.id,
            stockItemId: it.stockItemId,
            name: it.name,
            description: it.description ?? '',
            unit: it.unit ?? '',
            quantity: String(it.quantity),
            unitPrice: String(it.unitPrice),
          }))
        : [newLine()]);
    } else {
      quotationsApi.nextNumber()
        .then(r => setQuotationNo(r.quotationNo))
        .catch(() => setQuotationNo(''));
      setCustomerId('');
      setIssueDate(new Date().toISOString().slice(0, 10));
      setExpiryDate('');
      setRecipientName('');
      setRecipientEmail('');
      setRecipientPhone('');
      setCurrency(currencySettings?.primaryCurrency ?? 'USD');
      setExchangeRate(String(currencySettings?.secondaryRate ?? 4100));
      setTaxType('');
      setDiscountType('amount');
      setDiscountValue('0');
      setNotes('');
      setTerms('');
      setLines([newLine()]);
      setApprover1('');
      setApprover2('');
      setApprover3('');
    }
  }, [open, editing]);

  // Users list feeds the Approver dropdowns. Only fetched when the
  // dialog is opened for a NEW quotation AND the tenant has flipped
  // Show Approval on in Settings (V175). 403 silently → empty picker;
  // the operator can still create without approvers.
  useEffect(() => {
    if (!open || editing || !settings.showApproval) return;
    void (async () => {
      try {
        const res = await usersApi.list({ size: 200 });
        setUsers(res.data);
      } catch {
        setUsers([]);
      }
    })();
  }, [open, editing, settings.showApproval]);

  // Follow-up sync: when the tenant currency settings arrive AFTER
  // the reset effect above ran (network race on first open), pin the
  // form's currency + exchange rate to the tenant defaults. Skip in
  // edit mode (row's own currency wins).
  useEffect(() => {
    if (!open || editing || !currencySettings) return;
    setCurrency(currencySettings.primaryCurrency);
    setExchangeRate(String(currencySettings.secondaryRate ?? 4100));
  }, [open, editing, currencySettings]);

  // Pre-fill recipient fields when the user picks a customer (only
  // on the first pick — don't clobber edits the operator already
  // made on this form).
  useEffect(() => {
    if (!customerId) return;
    const c = customers.find(x => x.id === customerId);
    if (!c) return;
    if (!recipientName) setRecipientName(c.representative ?? c.name);
    if (!recipientEmail && c.email) setRecipientEmail(c.email);
    if (!recipientPhone && c.phone) setRecipientPhone(c.phone);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [customerId]);

  const totals = useMemo(() => {
    let subtotal = 0;
    for (const l of lines) {
      const q = Number(l.quantity) || 0;
      const p = Number(l.unitPrice) || 0;
      subtotal += q * p;
    }
    const taxRate = TAX_TYPE_BY_KEY[taxType]?.rate ?? 0;
    const tax = (subtotal * taxRate) / 100;
    const dv = Number(discountValue) || 0;
    const disc = discountType === 'percent' ? (subtotal * dv) / 100 : dv;
    const total = subtotal + tax - disc;
    return { subtotal, tax, disc, total };
  }, [lines, taxType, discountType, discountValue]);

  const addLine = () => setLines(prev => [...prev, newLine()]);
  const removeLine = (id: string) =>
    setLines(prev => prev.length === 1 ? prev : prev.filter(l => l.localId !== id));
  const updateLine = (id: string, patch: Partial<FormLine>) =>
    setLines(prev => prev.map(l => l.localId === id ? { ...l, ...patch } : l));

  /** localId of the line whose row-icon opened the camera scanner.
   *  On decode, we look up the barcode and fill THAT specific row,
   *  not a fresh one. Cleared when the scanner closes. */
  const [scanTargetLineId, setScanTargetLineId] = useState<string | null>(null);

  /** Fill an existing row with a scanned item — same field shape as
   *  the catalog picker's onPick. Used by the per-row barcode icon so
   *  each row scans into itself instead of appending a new line. */
  const fillLineFromBarcode = async (localId: string, code: string) => {
    try {
      const si = await itemsApi.getByBarcode(code.trim());
      updateLine(localId, {
        stockItemId: si.id,
        name: si.name,
        unit: si.unit ?? '',
        unitPrice: String(si.unitPrice ?? 0),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `No item found for barcode ${code}`);
    }
  };

  const validate = (): boolean => {
    if (!customerId) { toast.error('Customer is required'); return false; }
    const hasLine = lines.some(l => l.name.trim());
    if (!hasLine) { toast.error('At least one line item is required'); return false; }
    return true;
  };

  const buildPayload = (): quotationsApi.QuotationRequest => {
    // Approvers — ordered, dedup, drop blanks. Only sent on create;
    // update ignores the field server-side.
    const orderedApprovers: string[] = [];
    const seen = new Set<string>();
    for (const raw of [approver1, approver2, approver3]) {
      const v = raw?.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      orderedApprovers.push(v);
    }
    return {
      quotationNo: quotationNo.trim() || undefined,
      customerId,
      issueDate,
      expiryDate: expiryDate.trim() || null,
      recipientName: recipientName.trim() || undefined,
      recipientEmail: recipientEmail.trim() || undefined,
      recipientPhone: recipientPhone.trim() || undefined,
      currency: currency.trim().toUpperCase(),
      exchangeRate: Number(exchangeRate) || 0,
      taxType: taxType || undefined,
      discountType,
      discountValue: Number(discountValue) || 0,
      notes: notes.trim() || undefined,
      terms: terms.trim() || undefined,
      items: lines
        .filter(l => l.name.trim())
        .map(l => ({
          stockItemId: l.stockItemId ?? null,
          name: l.name.trim(),
          description: l.description.trim() || null,
          unit: l.unit.trim() || null,
          quantity: Number(l.quantity) || 0,
          unitPrice: Number(l.unitPrice) || 0,
        })),
      ...(isEdit ? {} : { approverUserIds: orderedApprovers.length > 0 ? orderedApprovers : undefined }),
    };
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit && editing) {
        await quotationsApi.update(editing.id, buildPayload());
        toast.success(`${editing.quotationNo} updated`);
      } else {
        const created = await quotationsApi.create(buildPayload());
        toast.success(`Quotation ${created.quotationNo} created`);
      }
      addRecentLineItems(lines.map(l => ({
        name: l.name,
        unit: l.unit,
        unitPrice: Number(l.unitPrice) || undefined,
      })));
      setRecentItems(getRecentLineItems());
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save quotation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1260px] w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? `Edit ${editing?.quotationNo}` : 'New Quotation'}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                    aria-label="About Quotation"
                  >
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Pre-sale quote sent to a customer. Convert to a real Invoice once accepted.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
          {/* DialogDescription intentionally omitted — the same copy
              now surfaces via the info tooltip beside the title so
              the header stays compact. Radix requires either a
              DialogDescription or an explicit aria-describedby to
              avoid a console warning; we pass a hidden one for the
              a11y hint while keeping the visible chrome clean. */}
          <DialogDescription className="sr-only">
            Pre-sale quote sent to a customer. Convert to a real Invoice once accepted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer + meta */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Customer *</Label>
              <SearchablePicker
                value={customerId}
                onChange={setCustomerId}
                placeholder="Pick a customer"
                emptyResultsLabel="No customer matches — type a name to create."
                createLabel={q => `Add "${q}" as a new customer`}
                onCreate={quickAdd.onCreate}
                options={customers.map(c => ({
                  value: c.id,
                  label: c.name,
                  searchKey: `${c.name} ${c.email ?? ''} ${c.phone ?? ''} ${c.tin ?? ''}`,
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quotation No.</Label>
              <Input value={quotationNo} onChange={e => setQuotationNo(e.target.value)} className="tabular-nums" />
            </div>
          </div>

          {/* Recipient overrides */}
          <div className="grid grid-cols-3 gap-3 p-3 border rounded-md bg-slate-50/40">
            <div className="space-y-1.5">
              <Label className="text-xs">Recipient name</Label>
              <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="(uses customer's representative)" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Recipient email</Label>
              <Input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Recipient phone</Label>
              <Input value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Issue date</Label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expiry date</Label>
              <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </div>
            {/* Gated on `currencySettings` being loaded to avoid a
                brief USD/KHR flash from the enabledCurrencies fallback
                while the fetch is in flight. */}
            {currencySettings && currencyOptions.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map(c => (
                      <SelectItem key={c} value={c}>{currencyApi.currencyLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Exchange-rate field renders only when the tenant has
                a secondary currency AND it differs from the form's
                selected currency. */}
            {currencySettings?.secondaryCurrency && currency !== currencySettings.secondaryCurrency && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Exchange rate ({currencySettings.secondaryCurrency} per 1 {currency || 'USD'})
                </Label>
                <Input value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} />
              </div>
            )}
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs font-semibold shrink-0">Line items</Label>
              <Button size="sm" variant="outline" onClick={addLine} className="shrink-0">
                <Plus className="h-3 w-3 mr-1" /> Add line
              </Button>
            </div>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item *</TableHead>
                    <TableHead>Specification</TableHead>
                    <TableHead className="w-[80px]">UOM</TableHead>
                    <TableHead className="text-right w-[80px]">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map(l => {
                    const lineTotal = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
                    return (
                      <TableRow key={l.localId}>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {/* Catalog picker — Package icon to the
                                left, same UX as Invoices. Gated by
                                the per-tenant Items → Settings toggle
                                (V120); hidden when the tenant hasn't
                                opted in for Quotation. */}
                            {pickerEnabled && (
                              <StockItemPicker
                                catalog={stockCatalog}
                                loaded={catalogLoaded}
                                onOpen={ensureCatalog}
                                selectedId={l.stockItemId ?? ''}
                                // v-picker-stock-scope — quotations are
                                // offers, not fulfilment. Include any
                                // active item regardless of current
                                // on-hand stock.
                                requireStock={false}
                                onPick={si => updateLine(l.localId, {
                                  stockItemId: si.id,
                                  name: si.name,
                                  unit: si.unit ?? l.unit ?? '',
                                  unitPrice: String(si.unitPrice ?? 0),
                                })}
                              />
                            )}
                            <div className="relative flex-1">
                              <Input
                                value={l.name}
                                onChange={e => updateLine(l.localId, {
                                  name: e.target.value,
                                  // Hand-editing unlinks the catalog
                                  // row — same rationale as Invoices.
                                  stockItemId: null,
                                })}
                                onFocus={() => setFocusedLineId(l.localId)}
                                onBlur={() => setTimeout(() => setFocusedLineId(p => p === l.localId ? null : p), 120)}
                                placeholder="Item name"
                              />
                              {focusedLineId === l.localId && !l.name && recentItems.length > 0 && (
                              <div className="absolute top-full left-0 mt-1 w-72 z-20 bg-white border rounded-md shadow-lg max-h-64 overflow-y-auto">
                                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-gray-400 border-b">
                                  Recent
                                </div>
                                {recentItems.map(r => (
                                  <button
                                    key={r.name}
                                    type="button"
                                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50 border-b last:border-b-0"
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      updateLine(l.localId, {
                                        name: r.name,
                                        unit: r.unit ?? l.unit ?? '',
                                        unitPrice: r.unitPrice != null ? String(r.unitPrice) : l.unitPrice,
                                      });
                                      setFocusedLineId(null);
                                    }}
                                  >
                                    <div className="font-medium truncate">{r.name}</div>
                                    <div className="text-[11px] text-gray-500 flex justify-between gap-2">
                                      <span>{r.unit ?? 'pcs'}</span>
                                      <span className="tabular-nums">{(r.unitPrice ?? 0).toFixed(2)}</span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                            </div>
                            {/* v-quotation-barcode-per-row — icon-only
                                scan trigger sits AFTER the Item name.
                                Tapping it opens the camera scanner and
                                the decoded barcode fills THIS row (not
                                a fresh one). Hidden when the tenant's
                                barcode feature is off. */}
                            {barcodeFeatureOn && (
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="shrink-0 h-9 w-9"
                                onClick={() => setScanTargetLineId(l.localId)}
                                title="Scan barcode into this row"
                                aria-label="Scan barcode into this row"
                              >
                                <ScanBarcode className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input value={l.description} onChange={e => updateLine(l.localId, { description: e.target.value })} placeholder="—" />
                        </TableCell>
                        <TableCell>
                          <Input value={l.unit} onChange={e => updateLine(l.localId, { unit: e.target.value })} placeholder="pcs" />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="text-right tabular-nums"
                            inputMode="decimal"
                            value={l.quantity}
                            onChange={e => updateLine(l.localId, {
                              quantity: maskDecimal(e.target.value),
                              // Changing qty invalidates any stale
                              // Total override — fall back to the
                              // canonical qty × unitPrice display.
                              totalEditing: undefined,
                            })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="text-right tabular-nums"
                            inputMode="decimal"
                            value={l.unitPrice}
                            onChange={e => updateLine(l.localId, {
                              unitPrice: maskDecimal(e.target.value),
                              totalEditing: undefined,
                            })}
                          />
                        </TableCell>
                        {/* Total is editable too — typing here back-
                            computes unitPrice = total ÷ qty. While the
                            input has focus we display the raw user
                            text verbatim so the cursor doesn't jump
                            on every rounded round-trip; on blur the
                            cell snaps to the canonical fmtMoney
                            display. */}
                        <TableCell className="text-right tabular-nums text-sm">
                          <Input
                            className="text-right tabular-nums"
                            inputMode="decimal"
                            value={l.totalEditing !== undefined
                              ? l.totalEditing
                              : lineTotal.toFixed(2)}
                            onChange={e => {
                              // Sanitize first so a stray comma or letter
                              // never reaches the qty × unitPrice math.
                              // type="text" also stops Chrome from
                              // re-rendering "33.00" as "33,00" under
                              // locales that use a comma decimal.
                              const raw = maskDecimal(e.target.value);
                              const total = Number(raw);
                              const qty = Number(l.quantity) || 0;
                              const nextUnitPrice = qty > 0 && raw !== '' && Number.isFinite(total)
                                ? String(total / qty)
                                : l.unitPrice;
                              updateLine(l.localId, {
                                unitPrice: nextUnitPrice,
                                totalEditing: raw,
                              });
                            }}
                            onBlur={() => updateLine(l.localId, { totalEditing: undefined })}
                          />
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => removeLine(l.localId)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Tax / Discount + totals — each cell is gated by the
              shared Sale-side Accountant settings popup, so flipping a
              toggle hides it on Quotation, Invoice, and Voucher
              consistently. The summary card remains visible even if
              the tax/discount inputs are off, since totals still need
              to render. */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              {settings.showTax && (
              <div className="space-y-1.5">
                <Label className="text-xs">Taxation</Label>
                <Select value={taxType || '_none'} onValueChange={v => setTaxType(v === '_none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {TAX_TYPES.filter(t => settings.taxTypesEnabled.includes(t.key) || t.key === editing?.taxType).map(t => (
                      <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              )}
              {settings.showDiscount && (
              <div className="space-y-1.5">
                <Label className="text-xs">Discount</Label>
                <div className="flex gap-2">
                  <Select value={discountType} onValueChange={v => setDiscountType(v as 'amount' | 'percent')}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amount">$ amount</SelectItem>
                      <SelectItem value="percent">% percent</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    inputMode="decimal"
                    className="tabular-nums"
                    value={discountValue}
                    onChange={e => setDiscountValue(maskDecimal(e.target.value))}
                  />
                </div>
              </div>
              )}
            </div>

            <div className="bg-slate-50 rounded-md p-3 space-y-1 text-sm">
              <div className="flex justify-end gap-6"><span className="text-gray-600">Subtotal</span><span className="tabular-nums w-32 text-right">{fmtMoney(totals.subtotal, currency)}</span></div>
              {settings.showTax && totals.tax > 0 && (
              <div className="flex justify-end gap-6"><span className="text-gray-600">Tax</span><span className="tabular-nums w-32 text-right">+ {fmtMoney(totals.tax, currency)}</span></div>
              )}
              {settings.showDiscount && totals.disc > 0 && (
              <div className="flex justify-end gap-6"><span className="text-gray-600">Discount</span><span className="tabular-nums w-32 text-right">− {fmtMoney(totals.disc, currency)}</span></div>
              )}
              <div className="flex justify-end gap-6 font-semibold border-t pt-1 mt-1"><span>Total {currency}</span><span className="tabular-nums w-32 text-right">{fmtMoney(totals.total, currency)}</span></div>
              {/* Secondary-currency total — rendered only when the
                  tenant has a secondary currency AND the quotation's
                  currency isn't already that secondary. */}
              {currencySettings?.secondaryCurrency && currency !== currencySettings.secondaryCurrency && (
                <div className="flex justify-end gap-6 text-gray-700">
                  <span>
                    Total {currencySettings.secondaryCurrency}
                    {' '}<span className="text-[10px] text-gray-400">@ {Number(exchangeRate) || 0}</span>
                  </span>
                  <span className="tabular-nums w-32 text-right">
                    {currencySettings.secondaryCurrency} {(totals.total * (Number(exchangeRate) || 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Notes + Terms. Single-column layout when only one is on
              so the visible textarea gets full width. */}
          {(settings.showNotes || settings.showTerms) && (
          <div className={`grid gap-3 ${
            (settings.showNotes && settings.showTerms) ? 'grid-cols-2' : 'grid-cols-1'
          }`}>
            {settings.showNotes && (
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Internal memo" />
            </div>
            )}
            {settings.showTerms && (
            <div className="space-y-1.5">
              <Label className="text-xs">Terms &amp; conditions</Label>
              <Textarea value={terms} onChange={e => setTerms(e.target.value)} rows={3} placeholder="Customer-facing terms" />
            </div>
            )}
          </div>
          )}

          {/* Approvers — manual-assign chain (V172, Phase 3b). Optional:
              leave blank and the quotation skips approval, flowing
              through the existing progress → done / close states.
              Only shown on create AND when the operator has flipped
              "Show Approval" on in the Quotation settings dialog
              (V175). Off-by-default keeps existing tenants' forms
              unchanged on the next deploy. */}
          {!isEdit && settings.showApproval && (
            <div className="space-y-2 rounded-md border border-dashed border-gray-200 p-3 bg-gray-50/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-medium">Approvers (optional, ordered — up to {settings.approverCount ?? 3})</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-gray-400 hover:text-gray-600"
                        aria-label="Approvers help"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      Leave blank to skip approval. Otherwise the quotation waits until each picked approver acts, in order.
                    </TooltipContent>
                  </Tooltip>
                </div>
                {(approver1 || approver2 || approver3) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-gray-500"
                    onClick={() => { setApprover1(''); setApprover2(''); setApprover3(''); }}
                    type="button"
                  >
                    Clear
                  </Button>
                )}
              </div>
              {[
                { label: '1st', value: approver1, set: setApprover1 },
                { label: '2nd', value: approver2, set: setApprover2 },
                { label: '3rd', value: approver3, set: setApprover3 },
              ].slice(0, settings.approverCount ?? 3).map((slot, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 w-6 shrink-0">{slot.label}</span>
                  <Select value={slot.value || '__none'} onValueChange={(v) => slot.set(v === '__none' ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="— none —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— none —</SelectItem>
                      {users
                        .filter(u => u.isActive)
                        .filter(u => u.id !== approver1 || slot.value === approver1)
                        .filter(u => u.id !== approver2 || slot.value === approver2)
                        .filter(u => u.id !== approver3 || slot.value === approver3)
                        .map(u => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.email} <span className="text-[10px] text-gray-500">· {u.role}</span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save' : 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
      {quickAdd.dialog}
      {/* Per-row barcode scanner — mounted once at the form level and
          fills whichever row set scanTargetLineId. Closes automatically
          on successful decode via onDecoded → fillLineFromBarcode. */}
      <CameraBarcodeScanner
        open={scanTargetLineId !== null}
        onOpenChange={o => { if (!o) setScanTargetLineId(null); }}
        onDecoded={code => {
          const target = scanTargetLineId;
          setScanTargetLineId(null);
          if (target) void fillLineFromBarcode(target, code);
        }}
      />
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Detail dialog — view-only + Convert / Close                        */
/* ------------------------------------------------------------------ */

function QuotationDetailDialog({
  quotationId, customers, settings, canConvert, canEdit, onClose, onChanged, onEdit,
}: {
  quotationId: string;
  customers: customersApi.Customer[];
  settings: accountingSettingsApi.AccountingSettings;
  canConvert: boolean;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (q: quotationsApi.Quotation) => void;
}) {
  const [quotation, setQuotation] = useState<quotationsApi.Quotation | null>(null);
  const { formatDate } = useDateFormat();
  const [companyInfo, setCompanyInfo] = useState<settingsApi.CompanyInfo | null>(null);
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  // v-quotation-stock-guard-fix — stockShortages below needs the
  // current catalog to compare quoted-vs-onhand for each linked SKU.
  // Was referenced but never defined here (regression from commit
  // 1740384); on prod the useMemo blew up with `stockCatalog is not
  // defined` the moment the detail dialog rendered. Fetch on mount
  // so the guard has a real list; empty array is a safe "no
  // shortages" default while the request is in flight.
  const [stockCatalog, setStockCatalog] = useState<itemsApi.Item[]>([]);
  useEffect(() => {
    itemsApi.list({ size: 1000, slim: true })
      .then(r => setStockCatalog(r.content ?? []))
      .catch(() => setStockCatalog([]));
  }, []);
  // v-send-menu-bot-link-gate — hide the "Bot Link" send option when
  // neither the tenant's own bot nor the platform fallback is
  // configured. Nothing else works either way; letting the operator
  // click it just yields a "Telegram delivery isn't configured on
  // this server" toast. Fetch once per dialog open; treat any error
  // as "no bot" so a network hiccup doesn't stall the dropdown.
  const [botAvailable, setBotAvailable] = useState<boolean>(false);
  useEffect(() => {
    telegramApi.getStatus()
      .then(s => setBotAvailable(s.source !== 'none'))
      .catch(() => setBotAvailable(false));
  }, []);
  // Separate from `busy` so the Send dropdown can show a spinner +
  // disable itself while a Telegram dispatch is in flight, without
  // also locking out Convert/Close (which use `busy`). Prevents
  // double-clicks from firing two sends.
  const [telegramBusy, setTelegramBusy] = useState(false);

  const customer = quotation ? customers.find(c => c.id === quotation.customerId) : undefined;

  const load = async () => {
    setLoading(true);
    try {
      setQuotation(await quotationsApi.get(quotationId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load quotation');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [quotationId]);
  useEffect(() => {
    settingsApi.getCompanyInfo().then(setCompanyInfo).catch(() => setCompanyInfo(null));
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, []);

  /** Manual "Send via Telegram" trigger. Captures the print template
   *  to a PNG via html2canvas before calling the API so the customer
   *  receives the actual bilingual print layout via sendPhoto. The
   *  {@code telegramBusy} flag blocks double-clicks until the
   *  round-trip completes. */
  const sendViaTelegram = async () => {
    if (!quotation || telegramBusy) return;
    setTelegramBusy(true);
    try {
      const imageDataUrl = await capturePrintImage();
      const res = await quotationsApi.sendTelegram(quotation.id, imageDataUrl ?? undefined);
      switch (res.status) {
        case 'sent':
          toast.success(`Quotation ${quotation.quotationNo} sent via Telegram`);
          break;
        case 'not_linked':
          toast.error('Customer hasn\'t connected their Telegram yet — share the link from the Customers page first.');
          break;
        case 'disabled':
          toast.error('Telegram delivery isn\'t configured on this server.');
          break;
        case 'failed':
          toast.error(`Telegram send failed: ${res.message ?? 'unknown error'}`);
          break;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Telegram send failed');
    } finally {
      setTelegramBusy(false);
    }
  };

  // v-forward-share — shared hook packages the whole flow. Only the
  // per-doc `buildConfig` differs between Quotation and Invoice.
  const forwardShare = useForwardShare({
    buildConfig: () => quotation ? {
      title: `Quotation ${quotation.quotationNo}`,
      summary: [
        `Quotation ${quotation.quotationNo}`,
        customer?.name && `Customer: ${customer.name}`,
        quotation.issueDate && `Issue date: ${formatDate(quotation.issueDate)}`,
        quotation.expiryDate && `Expiry: ${formatDate(quotation.expiryDate)}`,
        `Total: ${fmtMoney(quotation.total, quotation.currency)}`,
      ].filter((s): s is string => typeof s === 'string').join('\n'),
      fileNameStem: quotation.quotationNo,
    } : null,
    busy: telegramBusy,
    setBusy: setTelegramBusy,
  });

  const doConvert = async () => {
    if (!quotation) return;
    setBusy(true);
    try {
      const inv = await quotationsApi.convertToInvoice(quotation.id);
      toast.success(`Converted to ${inv.invoiceNo}`);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Convert failed');
    } finally {
      setBusy(false);
    }
  };

  /** v-quotation-stock-guard — walk each line that's linked to a
   *  deduction-tracked catalog item and see whether the quoted
   *  quantity still fits current on-hand. Returns one entry per
   *  short-stock line so the UI can list them in a red remark
   *  and disable Convert-to-Invoice until the operator either
   *  restocks or trims the quantities. Free-text lines (no
   *  stockItemId) and non-deduction items are ignored — same
   *  rule the BE's V270 atomic decrement enforces at checkout. */
  const stockShortages = useMemo(() => {
    if (!quotation) return [];
    // Merge sibling lines pointing at the same SKU so a customer
    // ordering the same product on two lines doesn't get missed.
    const requested = new Map<string, number>();
    for (const l of quotation.items) {
      if (!l.stockItemId) continue;
      requested.set(l.stockItemId, (requested.get(l.stockItemId) ?? 0) + (l.quantity ?? 0));
    }
    const out: Array<{ name: string; requested: number; onHand: number }> = [];
    for (const [sid, want] of requested) {
      const src = stockCatalog.find(c => c.id === sid);
      if (!src || !src.deductionEnabled) continue;
      const onHand = src.stockQty ?? 0;
      if (want > onHand) out.push({ name: src.name, requested: want, onHand });
    }
    return out;
  }, [quotation, stockCatalog]);
  const convertBlocked = stockShortages.length > 0;

  const doClose = async () => {
    if (!quotation) return;
    setBusy(true);
    try {
      const next = await quotationsApi.close(quotation.id);
      toast.success(`${next.quotationNo} closed`);
      setQuotation(next);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Close failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      {/* Radix X restored for consistency with the rest of the app's
          popups. The header's action group carries mr-10 below to
          reserve enough clearance so the X doesn't overlap the Send
          dropdown chevron even on narrow mobile viewports. */}
      <DialogContent className="sm:max-w-[1100px] w-[90vw] max-h-[90vh] overflow-y-auto">
        {/* Same bilingual print layout as Invoice, just retitled — the
            screen dashboard is hidden via @media print; only the
            body-level .print-tax-invoice portal renders on paper. */}
        <style>{`
          @media print {
            html, body { background: white !important; }
            body > *:not(.print-tax-invoice) { display: none !important; }
            body > .print-tax-invoice {
              display: block !important;
              position: relative !important;
              padding: 14mm !important;
              color: black !important;
              font-family: 'Battambang', 'Noto Sans Khmer', system-ui, sans-serif !important;
            }
            .print-tax-invoice .kh-title {
              font-family: 'Khmer OS Muol Light', 'Moul', 'Battambang', 'Noto Sans Khmer', serif !important;
              font-weight: 400 !important;
              letter-spacing: 0.5px;
            }
            @page { margin: 0; size: A4; }
          }
        `}</style>
        {quotation && (
          <PrintQuotation quotation={quotation} customer={customer} company={companyInfo} currencySettings={currencySettings} />
        )}
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="tabular-nums">{quotation?.quotationNo ?? 'Quotation details'}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                {loading || !quotation ? (
                  <span className="text-xs text-gray-500">Loading quotation…</span>
                ) : (
                  <>
                    <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[quotation.status]}`}>
                      {quotation.status}
                    </Badge>
                    <span className="text-xs text-gray-500">{formatDate(quotation.issueDate)}</span>
                    {quotation.expiryDate && (
                      <span className="text-xs text-gray-500">· Expires {quotation.expiryDate}</span>
                    )}
                  </>
                )}
              </DialogDescription>
            </div>
            {quotation && (
              <div className="flex gap-1.5 mr-10 print:hidden">
                <Button size="sm" variant="outline" onClick={() => { void printWithKhmerFonts(); }}>
                  <Printer className="h-3.5 w-3.5 mr-1" /> Print
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" disabled={telegramBusy} title="Send this quotation to the customer">
                      {telegramBusy ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5 mr-1" />
                      )}
                      {telegramBusy ? 'Sending…' : 'Send'}
                      <ChevronDown className="h-3 w-3 ml-1.5 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={() => setMailOpen(true)}>
                      <Mail className="h-4 w-4 mr-2 text-blue-600" />
                      Email
                    </DropdownMenuItem>
                    {botAvailable && (
                      <DropdownMenuItem
                        onSelect={(e) => {
                          // Stop the auto-close so we can drive the
                          // busy state ourselves; the menu still
                          // closes via the dropdown's own focus loss.
                          e.preventDefault();
                          if (!telegramBusy) void sendViaTelegram();
                        }}
                        disabled={telegramBusy}
                      >
                        <MessageCircle className="h-4 w-4 mr-2 text-sky-600" />
                        Bot Link
                      </DropdownMenuItem>
                    )}
                    {/* v-forward-share — shared "Forward to" chooser.
                        Same UX + capture flow on Invoice. */}
                    <DropdownMenuItem onSelect={(e) => {
                      e.preventDefault();
                      forwardShare.open();
                    }}>
                      <Share2 className="h-4 w-4 mr-2 text-blue-600" />
                      Forward to
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {canEdit && quotation.status === 'progress' && (
                  <Button size="sm" variant="outline" disabled={busy}
                          onClick={() => onEdit(quotation)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                )}
                {canConvert && quotation.status === 'progress' && (
                  <Button
                    size="sm"
                    disabled={busy || convertBlocked}
                    onClick={doConvert}
                    title={convertBlocked
                      ? 'Insufficient stock on one or more lines — see the red remark below.'
                      : undefined}
                  >
                    <ArrowRightCircle className="h-3.5 w-3.5 mr-1" /> Convert to Invoice
                  </Button>
                )}
                {canEdit && quotation.status === 'progress' && (
                  <Button size="sm" variant="outline" disabled={busy}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={doClose}>
                    <Ban className="h-3.5 w-3.5 mr-1" /> Close
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {loading || !quotation ? (
          <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
        ) : (
          <div className="space-y-4 print:hidden">
            {/* Converted callout */}
            {quotation.convertedInvoiceId && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-700" />
                <span>This quotation was converted to an invoice. Open Invoices to view the linked document.</span>
              </div>
            )}

            {/* v-quotation-stock-guard — surfaced right above the customer
                block so the operator sees WHY the Convert button is
                greyed out. Lists every short-stocked line so they can
                either restock or trim the quote first. */}
            {convertBlocked && !quotation.convertedInvoiceId && (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm">
                <div className="flex items-start gap-2">
                  <Ban className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-red-800">Not enough stock to convert.</p>
                    <ul className="mt-1 space-y-0.5 text-red-700">
                      {stockShortages.map(s => (
                        <li key={s.name} className="text-xs">
                          <span className="font-medium">{s.name}</span>
                          — quote asks <span className="tabular-nums">{s.requested}</span>, on hand{' '}
                          <span className="tabular-nums">{s.onHand}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[11px] text-red-600">
                      Restock the item or edit the quotation to reduce the quantity, then try again.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Customer + recipient. The chevron next to the recipient
                name opens a floating popover listing every contact the
                quote could be mailed to. */}
            <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1 text-sm">
              <div className="text-gray-500">Customer</div>
              <div>{customer?.name ?? <span className="text-gray-400">(unknown)</span>}</div>
              <div className="text-gray-500">Recipient</div>
              <div className="flex items-center gap-2">
                <span>{quotation.recipientName || customer?.representative || '—'}</span>
                <RecipientsPopover quotation={quotation} customer={customer} />
              </div>
              <div className="text-gray-500">Currency</div>
              <div>{quotation.currency}</div>
              {settings.showTax && quotation.taxType && (<>
                <div className="text-gray-500">Taxation</div>
                <div>{TAX_TYPE_BY_KEY[quotation.taxType]?.label ?? quotation.taxType}</div>
              </>)}
            </div>

            {/* Line items */}
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Specification</TableHead>
                    <TableHead className="w-[80px]">UOM</TableHead>
                    <TableHead className="text-right w-[80px]">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotation.items.map(it => (
                    <TableRow key={it.id}>
                      <TableCell>{it.name}</TableCell>
                      <TableCell className="text-sm text-gray-600">{it.description || '—'}</TableCell>
                      <TableCell className="text-sm">{it.unit || '—'}</TableCell>
                      <TableCell className="text-right text-sm">{it.quantity}</TableCell>
                      <TableCell className="text-right text-sm">{fmtMoney(it.unitPrice, quotation.currency)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtMoney(it.lineTotal, quotation.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Notes / Terms + totals */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-3">
                {settings.showNotes && quotation.notes && (
                  <div className="bg-slate-50 rounded-md p-3 text-sm">
                    <div className="text-xs text-gray-500 mb-1">Notes</div>
                    <div className="whitespace-pre-wrap">{quotation.notes}</div>
                  </div>
                )}
                {settings.showTerms && quotation.terms && (
                  <div className="bg-slate-50 rounded-md p-3 text-sm">
                    <div className="text-xs text-gray-500 mb-1">Terms &amp; conditions</div>
                    <div className="whitespace-pre-wrap">{quotation.terms}</div>
                  </div>
                )}
              </div>
              <div className="bg-slate-50 rounded-md p-3 space-y-1 text-sm">
                <div className="flex justify-end gap-6"><span className="text-gray-600">Subtotal</span><span className="tabular-nums w-32 text-right">{fmtMoney(quotation.subtotal, quotation.currency)}</span></div>
                {settings.showTax && quotation.taxAmount > 0 && (
                <div className="flex justify-end gap-6"><span className="text-gray-600">Tax</span><span className="tabular-nums w-32 text-right">+ {fmtMoney(quotation.taxAmount, quotation.currency)}</span></div>
                )}
                {settings.showDiscount && (
                <div className="flex justify-end gap-6">
                  <span className="text-gray-600">
                    Discount
                    {/* Show the raw input (e.g. "5%" or "$10") next to
                        the label so the viewer sees the same thing the
                        editor entered, not only the computed deduction.
                        Matches the Discount row on the Edit form. */}
                    {quotation.discountValue > 0 && (
                      <span className="ml-1 text-gray-400">
                        ({quotation.discountType === 'percent'
                          ? `${quotation.discountValue}%`
                          : fmtMoney(quotation.discountValue, quotation.currency)})
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums w-32 text-right">
                    {quotation.discountAmount > 0
                      ? `− ${fmtMoney(quotation.discountAmount, quotation.currency)}`
                      : fmtMoney(0, quotation.currency)}
                  </span>
                </div>
                )}
                <div className="flex justify-end gap-6 font-semibold border-t pt-1 mt-1"><span>Total {quotation.currency}</span><span className="tabular-nums w-32 text-right">{fmtMoney(quotation.total, quotation.currency)}</span></div>
              </div>
            </div>
          </div>
        )}

        {mailOpen && quotation && (
          <MailQuotationDialog
            quotation={quotation}
            customer={customer}
            company={companyInfo}
            onClose={() => setMailOpen(false)}
          />
        )}
      </DialogContent>
      {forwardShare.dialog}
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Send-quotation-by-email dialog — mirrors the Invoice Mail dialog. To /     */
/* Cc accept multiple comma-separated addresses; the body is pre-filled with   */
/* the quote no, total, and expiry, but the operator can edit before sending. */
/* Uses a mailto: URL so the user's own client (Gmail/Outlook/Apple Mail)     */
/* handles the actual send — no SMTP plumbing in the system.                   */
/* -------------------------------------------------------------------------- */
function MailQuotationDialog({
  quotation, customer, company, onClose,
}: {
  quotation: quotationsApi.Quotation;
  customer?: customersApi.Customer;
  company: settingsApi.CompanyInfo | null;
  onClose: () => void;
}) {
  const fmtUsd = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const defaultSubject =
    `Quotation ${quotation.quotationNo}${company?.name ? ` from ${company.name}` : ''}`;
  const defaultBody = [
    `Dear ${quotation.recipientName || customer?.representative || customer?.name || 'Customer'},`,
    '',
    `Please find our quotation ${quotation.quotationNo} dated ${quotation.issueDate}.`,
    `Total: ${fmtUsd(quotation.total)}${quotation.expiryDate ? ` — valid until ${quotation.expiryDate}` : ''}.`,
    '',
    'A printed copy is attached. Let us know if you have any questions.',
    '',
    `Regards,${company?.name ? `\n${company.name}` : ''}`,
  ].join('\n');

  // V271 — server-side SMTP send. Body is the "note above the PDF";
  // the actual PDF attachment is captured client-side from the mounted
  // .print-tax-invoice template so the recipient gets the same layout
  // they'd get from browser Print.
  const initialTo = quotation.recipientEmail ?? customer?.email ?? '';
  const [to, setTo] = useState<string>(initialTo);
  const [body, setBody] = useState<string>(defaultBody);
  const [busy, setBusy] = useState(false);

  const handleSend = async () => {
    const trimmed = to.trim();
    if (!trimmed) {
      toast.error('Recipient email is required');
      return;
    }
    setBusy(true);
    try {
      const pdf = await capturePrintPdf(`quotation-${quotation.quotationNo}.pdf`).catch((err) => {
        console.warn('[MailQuotationDialog] PDF capture threw:', err);
        return null;
      });
      const attachment = pdf
        ? { filename: pdf.filename, contentType: pdf.contentType, base64: pdf.base64 }
        : undefined;
      if (!pdf) {
        toast.warning('Could not render the quotation PDF — sending link only.');
      } else {
        const kb = Math.round((pdf.base64.length * 3 / 4) / 1024);
        console.info(`[MailQuotationDialog] Attaching ${pdf.filename} (${kb} KB)`);
      }
      const res = await quotationsApi.sendEmail(quotation.id, { to: trimmed, message: body, attachment });
      if (res.delivered) {
        toast.success(
          pdf
            ? `Quotation ${quotation.quotationNo} sent to ${res.to} with PDF attachment`
            : `Quotation ${quotation.quotationNo} sent to ${res.to} (link only)`
        );
        onClose();
      } else {
        toast.error('SMTP delivery failed — opening your mail client as a fallback.');
        const params = new URLSearchParams();
        params.set('subject', defaultSubject);
        params.set('body', body);
        const href = `mailto:${encodeURIComponent(trimmed)}?${params.toString()}`;
        window.location.href = href;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send email');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Send quotation by email
          </DialogTitle>
          <DialogDescription>
            Sends the recipient a PDF of this quotation (rendered from the print
            template) from your company's mail server. Leave "To" blank to use
            the quotation's recipient ({initialTo || 'none'}).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>To <span className="text-red-500">*</span></Label>
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={initialTo || 'customer@example.com'}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label>Subject</Label>
            <Input value={defaultSubject} readOnly className="text-slate-500" />
          </div>
          <div className="space-y-1">
            <Label>Message</Label>
            <Textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              A PDF of the quotation is attached automatically.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSend} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />}
            {busy ? 'Sending…' : 'Send email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Quotation print template — mirrors the Invoice bilingual layout. Only the  */
/* document title (វិក្កយបត្រអាករ / TAX INVOICE → សំណើតម្លៃ / QUOTATION)        */
/* and the meta block label (Invoice N° → Quotation N°, Payment Due Date →    */
/* Expiry Date) change; everything else is identical so a sales operator       */
/* sends a quote that looks like the future invoice it'll spawn.               */
/* -------------------------------------------------------------------------- */

function QBiLabel({ kh, en }: { kh: string; en: string }) {
  // v-print-bilabel-shift-fix — html2canvas compresses line-height for
  // Khmer complex glyphs (subscript stacks + coeng) so the English row
  // below crept up into the Khmer baseline in the captured PNG.
  // Give each line explicit block display + a floor line-height that
  // html2canvas honours, and add a small gap so the two rows never
  // collide even when Khmer's rendered box shrinks below its expected
  // metrics. Purely visual — CSS-print output stays identical because
  // it never depended on the tighter default.
  return (
    <div style={{ lineHeight: 1.35 }}>
      <div style={{
        fontSize: '11px', display: 'block', lineHeight: '15px',
        whiteSpace: 'nowrap',
      }}>{kh}</div>
      <div style={{
        fontSize: '9px', color: '#555', display: 'block',
        lineHeight: '12px', marginTop: '1px', whiteSpace: 'nowrap',
      }}>{en}</div>
    </div>
  );
}

function QVatTinBoxes({ tin }: { tin: string }) {
  const chars = tin.trim().split('');
  // v-print-tinbox-align-fix — mirrors Invoices.tsx VatTinBoxes: flex
  // with tabular-nums + Arial for uniform digit advance widths under
  // html2canvas + line-height 1 so the digit sits on the cell
  // midline. Previous version rendered each digit stacked or
  // slightly offset in the captured PNG on some tenants' TINs.
  return (
    <span style={{
      display: 'inline-flex', flexWrap: 'nowrap', gap: '2px',
      verticalAlign: 'middle', whiteSpace: 'nowrap',
    }}>
      {chars.map((c, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flex: '0 0 auto', width: '16px', height: '18px',
          fontSize: '11px', lineHeight: 1,
          fontFamily: 'Arial, sans-serif',
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'center',
          border: c === '-' ? 'none' : '1px solid #000',
          boxSizing: 'border-box',
        }}>{c}</span>
      ))}
    </span>
  );
}

function PrintQuotation({
  quotation, customer, company, currencySettings,
}: {
  quotation: quotationsApi.Quotation;
  customer?: customersApi.Customer;
  company: settingsApi.CompanyInfo | null;
  currencySettings?: currencyApi.CurrencySettings | null;
}) {
  const primaryCode = quotation.currency || 'USD';
  const secondaryCode = currencySettings?.secondaryCurrency ?? null;
  const showSecondary = !!secondaryCode && secondaryCode !== primaryCode;
  const grandSecondary = showSecondary
    ? Math.round(quotation.total * (quotation.exchangeRate || 0))
    : 0;
  const primarySym = currencyApi.currencySymbol(primaryCode);
  const secondarySym = secondaryCode ? currencyApi.currencySymbol(secondaryCode) : '';
  const fmtPrimary = (n: number) =>
    primaryCode === 'KHR' || primaryCode === 'KRW'
      ? `${primarySym} ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      : `${primarySym}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtSecondary = (n: number) =>
    secondaryCode === 'KHR' || secondaryCode === 'KRW'
      ? `${secondarySym} ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      : `${secondarySym}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const showVat      = quotation.taxAmount > 0;
  const showDiscount = (quotation.discountAmount ?? 0) > 0;
  const vatPct      = quotation.subtotal > 0 ? Math.round((quotation.taxAmount / quotation.subtotal) * 100) : 0;
  const discountPct = quotation.discountType === 'percent'
    ? Math.round(Number(quotation.discountValue ?? 0))
    : (quotation.subtotal > 0 ? Math.round(((quotation.discountAmount ?? 0) / quotation.subtotal) * 100) : 0);
  const fmtDate = (iso?: string | null) => {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
  };
  const companyKh = company?.legalName?.trim() || company?.name || '';
  const companyEn = company?.name || '';
  const banks = loadBankAccounts('sale').filter(
    b => b.bankName || b.accountName || b.accountNumber || b.notes || b.qrDataUrl,
  );
  const showBank = banks.length > 0;

  const tree = (
    <div className="print-tax-invoice" style={{
      fontSize: '12px',
      color: '#000',
      display: 'none',
      position: 'relative',
      fontFamily: "'Battambang', 'Noto Sans Khmer', system-ui, sans-serif",
    }}>
      {/* Header — logo pinned to the left, company info centered on
       *  the FULL page width so it lines up with the QUOTATION title
       *  strip and the body table below. */}
      <div style={{ position: 'relative', minHeight: '60px' }}>
        {company?.logoUrl && (
          <img
            src={company.logoUrl}
            alt=""
            style={{
              position: 'absolute', left: 0, top: 0,
              maxHeight: '60px', maxWidth: '140px', objectFit: 'contain',
            }}
          />
        )}
        <div style={{ textAlign: 'center' }}>
          <div className="kh-title" style={{
            fontSize: '20px', fontWeight: 400, lineHeight: 1.15,
            fontFamily: "'Khmer OS Muol Light', 'Moul', 'Battambang', 'Noto Sans Khmer', serif",
          }}>{companyKh}</div>
          {companyEn && companyEn !== companyKh && (
            <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px' }}>{companyEn}</div>
          )}
          {company?.address && (
            <div style={{ marginTop: '4px', fontSize: '11px', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{company.address}</div>
          )}
          {(company?.phone || company?.taxId) && (
            <div style={{
              marginTop: '2px', fontSize: '11px', lineHeight: 1.5,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              gap: '16px', flexWrap: 'wrap',
            }}>
              {company?.phone && <span>{company.phone}</span>}
              {company?.taxId && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <QBiLabel kh="លេខអត្តសញ្ញាណកម្ម អតប" en="VAT TIN" />
                  <QVatTinBoxes tin={company.taxId} />
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Title — the only material difference from the invoice print. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
        <div style={{ flex: 1, borderTop: '1px solid #000' }} />
        <div style={{ textAlign: 'center' }}>
          <div className="kh-title" style={{
            fontSize: '20px', fontWeight: 400,
            fontFamily: "'Khmer OS Muol Light', 'Moul', 'Battambang', 'Noto Sans Khmer', serif",
          }}>សំណើតម្លៃ</div>
          <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '0.5px' }}>QUOTATION</div>
        </div>
        <div style={{ flex: 1, borderTop: '1px solid #000' }} />
      </div>

      {/* Customer + meta. Recipient name overrides customer name on the
          quote — sales typically address the procurement contact, not
          the legal entity. Falls back to the customer name when empty. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '32px', rowGap: '6px', fontSize: '11px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '140px' }}><QBiLabel kh="ឈ្មោះក្រុមហ៊ុន ឬ អតិថិជន" en="Company Name / Customer" /></div>
          <div style={{ fontWeight: 600 }}>{quotation.recipientName || customer?.name || ''}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '120px' }}><QBiLabel kh="លេខរៀងសំណើតម្លៃ" en="Quotation N°" /></div>
          <div style={{ fontFamily: 'monospace' }}>{quotation.quotationNo}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '140px' }}><QBiLabel kh="អាសយដ្ឋាន" en="Address" /></div>
          <div>{customer?.address ?? ''}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '120px' }}><QBiLabel kh="កាលបរិច្ឆេទ" en="Issue Date" /></div>
          <div>{fmtDate(quotation.issueDate)}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '140px' }}><QBiLabel kh="ទូរស័ព្ទលេខ , ឈ្មោះអ្នកតំណាង" en="Telephone No. , Representative" /></div>
          <div>{[quotation.recipientPhone || customer?.phone, customer?.representative].filter(Boolean).join(', ')}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '120px' }}><QBiLabel kh="ថ្ងៃផុតកំណត់" en="Expiry Date" /></div>
          <div>{fmtDate(quotation.expiryDate)}</div>
        </div>
        {customer?.tin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', gridColumn: '1 / span 2' }}>
            <QBiLabel kh="លេខអត្តសញ្ញាណកម្ម អតប" en="VAT TIN" />
            <QVatTinBoxes tin={customer.tin} />
          </div>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr>
            <th style={qThStyle}><QBiLabel kh="ល.រ." en="N°" /></th>
            <th style={{ ...qThStyle, textAlign: 'left' }}><QBiLabel kh="បរិយាយមុខទំនិញ ឬ សេវាកម្ម" en="Description" /></th>
            <th style={qThStyle}><QBiLabel kh="បរិមាណ" en="Quantity" /></th>
            <th style={{ ...qThStyle, textAlign: 'right' }}><QBiLabel kh="ថ្លៃឯកតា" en="Unit Price" /></th>
            <th style={{ ...qThStyle, textAlign: 'right' }}><QBiLabel kh="បញ្ចុះតម្លៃ" en="Discount" /></th>
            <th style={{ ...qThStyle, textAlign: 'right' }}><QBiLabel kh="ថ្លៃទំនិញ" en="Amount" /></th>
          </tr>
        </thead>
        <tbody>
          {quotation.items.map((it, idx) => (
            <tr key={it.id}>
              <td style={{ ...qTdStyle, textAlign: 'center' }}>{idx + 1}</td>
              <td style={qTdStyle}>
                <div>{it.name}</div>
                {it.description && <div style={{ fontSize: '10px', color: '#555' }}>{it.description}</div>}
              </td>
              <td style={{ ...qTdStyle, textAlign: 'center' }}>{it.quantity}</td>
              <td style={{ ...qTdStyle, textAlign: 'right' }}>{fmtPrimary(it.unitPrice)}</td>
              <td style={{ ...qTdStyle, textAlign: 'right' }}>{fmtPrimary(0)}</td>
              <td style={{ ...qTdStyle, textAlign: 'right' }}>{fmtPrimary(it.lineTotal)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={5} style={{ ...qTdStyle, textAlign: 'right' }}>សរុប ({primaryCode}) / Sub Total ({primaryCode})</td>
            <td style={{ ...qTdStyle, textAlign: 'right' }}>{fmtPrimary(quotation.subtotal)}</td>
          </tr>
          {showDiscount && (
            <tr>
              <td colSpan={5} style={{ ...qTdStyle, textAlign: 'right' }}>
                បញ្ចុះតម្លៃ{quotation.discountType === 'percent' && discountPct > 0 ? ` ${discountPct}%` : ''} ({primaryCode}) / Discount{quotation.discountType === 'percent' && discountPct > 0 ? ` ${discountPct}%` : ''} ({primaryCode})
              </td>
              <td style={{ ...qTdStyle, textAlign: 'right' }}>− {fmtPrimary(quotation.discountAmount ?? 0)}</td>
            </tr>
          )}
          {showVat && (
            <tr>
              <td colSpan={5} style={{ ...qTdStyle, textAlign: 'right' }}>
                អាករលើតម្លៃបន្ថែម {vatPct}% ({primaryCode}) / VAT {vatPct}% ({primaryCode})
              </td>
              <td style={{ ...qTdStyle, textAlign: 'right' }}>{fmtPrimary(quotation.taxAmount)}</td>
            </tr>
          )}
          <tr>
            <td colSpan={5} style={{ ...qTdStyle, textAlign: 'right', fontWeight: 700 }}>សរុបរួម ({primaryCode}) / Grand Total ({primaryCode})</td>
            <td style={{ ...qTdStyle, textAlign: 'right', fontWeight: 700 }}>{fmtPrimary(quotation.total)}</td>
          </tr>
          {showSecondary && (
            <tr>
              <td colSpan={5} style={{ ...qTdStyle, textAlign: 'right', fontWeight: 700 }}>សរុបរួម ({secondaryCode}) / Grand Total ({secondaryCode})</td>
              <td style={{ ...qTdStyle, textAlign: 'right', fontWeight: 700 }}>{fmtSecondary(grandSecondary)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ marginTop: '14px', fontSize: '11px', lineHeight: 1.5 }}>
        <div style={{ fontWeight: 600 }}>សម្គាល់ / Notes</div>
        {quotation.notes && (
          <div style={{ whiteSpace: 'pre-wrap' }}>{quotation.notes}</div>
        )}
        {quotation.terms && (
          <div style={{ whiteSpace: 'pre-wrap', marginTop: quotation.notes ? '6px' : '0' }}>{quotation.terms}</div>
        )}
        {showBank && (
          <>
            <div style={{ color: '#555', marginTop: (quotation.notes || quotation.terms) ? '6px' : '0' }}>
              ** គណនីសម្រាប់បង់ប្រាក់ / Payment method:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '6px' }}>
              {banks.map(b => (
                <div key={b.id} style={{
                  width: '36mm', border: '1px solid #ddd', borderRadius: '4px',
                  padding: '4px', textAlign: 'center', background: '#fff',
                }}>
                  {b.qrDataUrl ? (
                    <img src={b.qrDataUrl} alt="KHRQR" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'contain' }} />
                  ) : (
                    <div style={{
                      width: '100%', aspectRatio: '1 / 1',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#999', fontSize: '9px', border: '1px dashed #ddd', borderRadius: '4px',
                    }}>(no QR)</div>
                  )}
                  {b.accountName && (<div style={{ marginTop: '3px', fontWeight: 600, fontSize: '10px' }}>{b.accountName}</div>)}
                  {b.accountNumber && (<div style={{ fontFamily: 'monospace', fontSize: '10px' }}>{b.accountNumber}</div>)}
                  {b.bankName && (<div style={{ fontSize: '9px', color: '#555' }}>{b.bankName}</div>)}
                  {b.notes && (<div style={{ fontSize: '9px', color: '#555' }}>{b.notes}</div>)}
                </div>
              ))}
            </div>
          </>
        )}
        {(quotation.exchangeRate || 0) > 0 && (
          <div style={{ marginTop: '6px' }}>អត្រាប្តូរប្រាក់ / Exchange rate : {quotation.exchangeRate}</div>
        )}
      </div>

      {/* Signatures — marginTop is the pen-room. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', marginTop: '110px', fontSize: '11px', textAlign: 'center' }}>
        <div style={{ borderTop: '1px solid #000', paddingTop: '6px' }}>
          <div>ហត្ថលេខា និងឈ្មោះអ្នកទិញ</div>
          <div style={{ fontSize: '10px', color: '#555' }}>Customer's Signature &amp; Name</div>
        </div>
        <div style={{ borderTop: '1px solid #000', paddingTop: '6px' }}>
          <div>ហត្ថលេខា និងឈ្មោះអ្នកលក់</div>
          <div style={{ fontSize: '10px', color: '#555' }}>Seller's Signature &amp; Name</div>
        </div>
      </div>
    </div>
  );
  return createPortal(tree, document.body) as unknown as React.ReactElement;
}

const qThStyle: React.CSSProperties = {
  border: '1px solid #000', padding: '4px 6px',
  textAlign: 'center', verticalAlign: 'middle', fontWeight: 600,
};
const qTdStyle: React.CSSProperties = {
  border: '1px solid #000', padding: '4px 6px', verticalAlign: 'top',
};
