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
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '../ui/tooltip';
import {
  Plus, RefreshCw, Eye, Pencil, Trash2, Ban, Printer,
  Mail, ChevronDown, Search, Info, Settings, FileText,
} from 'lucide-react';
import { AccountingSettingsDialog } from '../common/AccountingSettingsDialog';
import * as accountingSettingsApi from '../../api/accountingSettings';
import { toast } from 'sonner';
import { SearchablePicker } from '../common/SearchablePicker';
import { Pagination } from '../common/Pagination';
import { DateInput } from '../common/DateInput';
import { usePagination } from '../../hooks/usePagination';
import { formatMoneyForCurrency } from '../../utils/format';
import * as vouchersApi from '../../api/vouchers';
import { addRecentLineItems, getRecentLineItems } from '../../utils/recentLineItems';
import { StockItemPicker } from '../common/StockItemPicker';
import * as itemsApi from '../../api/items';
import * as customersApi from '../../api/customers';
import * as usersApi from '../../api/users';
import * as settingsApi from '../../api/settings';
import * as currencyApi from '../../api/currencySettings';
import { loadBankAccounts } from '../../utils/bankAccount';
import { printWithKhmerFonts } from '../../utils/printFonts';
import { useAuth } from '../../context/AuthContext';
import { useDateFormat } from '../../context/DateFormatContext';

/** USD collapses to "$"; KHR uses the riel symbol ៛. Mirrors the
 *  formatting helper in Invoices / Quotations so the column widths
 *  and minus-sign convention all line up across the sale ledger. */
const fmtMoney = (n: number, currency: string): string => {
  const epsilon = currency === 'KHR' ? 0.5 : 0.005;
  if (Math.abs(n) < epsilon) n = 0;
  const num = formatMoneyForCurrency(Math.abs(n), currency);
  const body = currency === 'USD' ? `$${num}`
    : currency === 'KHR' ? `៛ ${num}`
    : `${currency} ${num}`;
  return n < 0 ? `− ${body}` : body;
};

const STATUS_BADGE_CLASS: Record<vouchersApi.VoucherStatus, string> = {
  // Amber for pending — signals "waiting on chain approvers"
  // without leaning on red. V176.
  pending:  'border-amber-300 text-amber-700 bg-amber-50',
  progress: 'border-blue-300 text-blue-700 bg-blue-50',
  done:     'border-emerald-300 text-emerald-700 bg-emerald-50',
  approved: 'border-emerald-400 text-emerald-800 bg-emerald-100',
  rejected: 'border-red-300 text-red-700 bg-red-50',
  void:     'border-slate-300 text-slate-500 bg-slate-50 line-through',
  // Legacy V104 rows — treat as a finalised state visually.
  issued:   'border-emerald-300 text-emerald-700 bg-emerald-50',
};

const STATUS_FILTERS: ReadonlyArray<{ value: vouchersApi.VoucherStatus | 'all'; label: string }> = [
  { value: 'all',      label: 'All' },
  // Pending first after All so operators spot chain-gated vouchers. V176.
  { value: 'pending',  label: 'Pending' },
  { value: 'progress', label: 'Progress' },
  { value: 'done',     label: 'Done' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'void',     label: 'Void' },
];

const PURPOSE_OPTIONS: ReadonlyArray<{ value: vouchersApi.VoucherPurpose; label: string }> = [
  { value: 'free_service', label: vouchersApi.PURPOSE_LABELS.free_service },
  { value: 'charity',      label: vouchersApi.PURPOSE_LABELS.charity },
  { value: 'donation',     label: vouchersApi.PURPOSE_LABELS.donation },
  { value: 'sponsorship',  label: vouchersApi.PURPOSE_LABELS.sponsorship },
  { value: 'promo',        label: vouchersApi.PURPOSE_LABELS.promo },
  { value: 'warranty',     label: vouchersApi.PURPOSE_LABELS.warranty },
];

/** Bilingual title rendered on the printed voucher. Picked from the
 *  selected Purpose so the recipient sees "DONATION VOUCHER" / "CHARITY
 *  VOUCHER" / etc. at the top of the page rather than the generic
 *  "GENERAL VOUCHER" header. Keeps the Khmer column readable by Moul. */
const PRINT_TITLES: Record<vouchersApi.VoucherPurpose, { kh: string; en: string }> = {
  free_service: { kh: 'សេវាកម្មឥតគិតថ្លៃ',     en: 'FREE SERVICE VOUCHER' },
  charity:      { kh: 'ប័ណ្ណសប្បុរសធម៌',        en: 'CHARITY VOUCHER' },
  donation:     { kh: 'ប័ណ្ណអំណោយ',             en: 'DONATION VOUCHER' },
  sponsorship:  { kh: 'ប័ណ្ណឧបត្ថម្ភ',           en: 'SPONSORSHIP VOUCHER' },
  promo:        { kh: 'ប័ណ្ណផ្តល់ប្រូម៉ូសិន',     en: 'PROMOTIONAL VOUCHER' },
  warranty:     { kh: 'ប័ណ្ណផ្លាស់ប្តូរការធានា', en: 'WARRANTY VOUCHER' },
};

/** Same taxation matrix as Invoice/Quotation. Tax on a voucher is
 *  display-only — the total is locked at zero — but operators still
 *  want the VAT line visible for some giveaway audits. */
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
 * General Voucher — documents goods or services the company gives
 * away for free (charity, donation, sponsorship, promo giveaway,
 * warranty replacement, free service). UI mirrors the Invoice page
 * but every voucher has discount locked at 100% so the total is
 * always zero and there's no payment workflow.
 */
export function Vouchers() {
  const { canView, canCreate, canUpdate, canDelete, currentUser } = useAuth();
  const { formatDate } = useDateFormat();
  const canAdd    = canCreate('voucher');
  const canEdit   = canUpdate('voucher');
  const canRemove = canDelete('voucher');

  const [rows, setRows] = useState<vouchersApi.Voucher[]>([]);
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  const [vUsers, setVUsers] = useState<usersApi.User[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<vouchersApi.VoucherStatus | 'all'>('all');
  const [purposeFilter, setPurposeFilter] = useState<vouchersApi.VoucherPurpose | 'all'>('all');
  const [search, setSearch] = useState('');
  // Empty defaults so the landing view shows every voucher; users
  // pick a range to narrow. Pagination bounds the scroll.
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<vouchersApi.Voucher | null>(null);
  // Set when opening a new-voucher dialog from the purpose dropdown
  // so the form lands on the right purpose pre-selected.
  const [initialPurpose, setInitialPurpose] = useState<vouchersApi.VoucherPurpose>('free_service');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<vouchersApi.Voucher | null>(null);

  // Sale-side Accountant settings — shared with Invoice / Quotation.
  // Gates Notes / Terms / Tax (Voucher's discount is locked at 100%
  // server-side regardless of the toggle, but we still hide the field
  // when showDiscount is off so the form stays uncluttered).
  const [settings, setSettings] = useState<accountingSettingsApi.AccountingSettings>(
    accountingSettingsApi.defaultsFor('voucher'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    accountingSettingsApi.get('voucher').then(setSettings).catch(() => {
      setSettings(accountingSettingsApi.defaultsFor('voucher'));
    });
  }, []);

  const load = async () => {
    if (!canView('voucher')) return;
    setLoading(true);
    try {
      const [vRes, cRes, uRes] = await Promise.all([
        vouchersApi.list({ size: 500 }),
        customersApi.list({ size: 500 }),
        // Approver picker pulls the tenant user list. Inactive users
        // stay in for now so a voucher assigned to someone who later
        // got suspended still resolves to a name.
        usersApi.list({ size: 500 }).catch(() => ({ data: [] as usersApi.User[] })),
      ]);
      setRows(vRes.content ?? []);
      setCustomers(cRes.content ?? []);
      setVUsers((uRes as { data: usersApi.User[] }).data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load vouchers');
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
      if (purposeFilter !== 'all' && r.purpose !== purposeFilter) return false;
      if (dateFrom && r.issueDate < dateFrom) return false;
      if (dateTo   && r.issueDate > dateTo)   return false;
      if (!q) return true;
      const cn = customerById.get(r.customerId)?.name?.toLowerCase() ?? '';
      return r.voucherNo.toLowerCase().includes(q)
        || cn.includes(q)
        || (r.notes ?? '').toLowerCase().includes(q);
    });
  }, [rows, statusFilter, purposeFilter, dateFrom, dateTo, search, customerById]);

  const pagination = usePagination(filtered, 25);

  // Sub-up Fair Value across the entire filtered set (not just the
  // current page) — that's the figure the operator cares about when
  // they ask "how much did we give away this month?". Sums are
  // bucketed by currency since adding USD + KHR would be apples +
  // oranges; if there's a single currency the footer shows just
  // that one line.
  const fairValueTotals = useMemo(() => {
    const sums = new Map<string, number>();
    for (const v of filtered) {
      sums.set(v.currency, (sums.get(v.currency) ?? 0) + (v.subtotal ?? 0));
    }
    return Array.from(sums.entries())
      .sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);
  useEffect(() => {
    pagination.goToPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, purposeFilter, dateFrom, dateTo, search]);

  const openCreate = (purpose: vouchersApi.VoucherPurpose) => {
    setEditing(null);
    setInitialPurpose(purpose);
    setFormOpen(true);
  };
  const openEdit = (v: vouchersApi.Voucher) => { setEditing(v); setFormOpen(true); };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await vouchersApi.remove(deleteTarget.id);
      toast.success(`Deleted ${deleteTarget.voucherNo}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-bold">Voucher</h1>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}
                  title="Accountant settings">
            <Settings className="h-4 w-4" />
          </Button>
          {canAdd && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1.5" /> New Voucher
                  <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-80" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {PURPOSE_OPTIONS.map(p => (
                  <DropdownMenuItem
                    key={p.value}
                    onSelect={() => openCreate(p.value)}
                  >
                    {p.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 sm:justify-between sm:flex-wrap overflow-x-auto sm:overflow-visible">
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="h-8 w-44 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map(f => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.value === 'all' ? (
                        <span className="text-sm">{f.label}</span>
                      ) : (
                        <Badge variant="outline" className={`capitalize text-[10px] px-1.5 py-0 ${STATUS_BADGE_CLASS[f.value as vouchersApi.VoucherStatus]}`}>
                          {f.label}
                        </Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={purposeFilter} onValueChange={v => setPurposeFilter(v as typeof purposeFilter)}>
                <SelectTrigger className="h-8 w-56 text-sm">
                  <SelectValue placeholder="All purposes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All purposes</SelectItem>
                  {PURPOSE_OPTIONS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                  placeholder="Search voucher no, customer, notes…"
                  className="h-8 pl-7 w-64 text-sm"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No vouchers yet.</p>
          ) : (
            <div className="border rounded-md overflow-auto max-h-[calc(100vh-280px)]">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10 shadow-[inset_0_-1px_0_0_rgb(229,231,235)]">
                <TableRow>
                  <TableHead className="w-[160px]">Voucher No.</TableHead>
                  <TableHead className="w-[180px]">Purpose</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="w-28">Issue Date</TableHead>
                  <TableHead className="text-right">Fair Value</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="text-right w-[160px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map(v => {
                  const c = customerById.get(v.customerId);
                  return (
                    <TableRow key={v.id} className="hover:bg-gray-50">
                      <TableCell className="tabular-nums text-sm">{v.voucherNo}</TableCell>
                      <TableCell className="text-sm">{vouchersApi.PURPOSE_LABELS[v.purpose]}</TableCell>
                      <TableCell>{c?.name ?? <span className="text-gray-400">(unknown)</span>}</TableCell>
                      <TableCell className="text-sm">{formatDate(v.issueDate)}</TableCell>
                      <TableCell className="text-right tabular-nums text-gray-500">
                        {/* Subtotal = fair value being given away. The
                            actual total is always 0; we surface the
                            subtotal here so the table is informative. */}
                        {fmtMoney(v.subtotal, v.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[v.status]}`}>
                          {v.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setDetailId(v.id)} title="View details">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canEdit && v.status === 'progress' && (
                            <Button size="sm" variant="ghost" onClick={() => openEdit(v)} title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canRemove && v.status === 'progress' && (
                            <Button size="sm" variant="ghost"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => setDeleteTarget(v)}
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
              {fairValueTotals.length > 0 && (
                <TableFooter>
                  {fairValueTotals.map(([currency, sum], idx) => (
                    <TableRow key={currency} className="bg-slate-50">
                      <TableCell colSpan={4} className="text-right text-sm font-medium text-gray-600">
                        {idx === 0 ? 'Total fair value' : ''}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {fmtMoney(sum, currency)}
                      </TableCell>
                      <TableCell colSpan={2} className="text-[11px] text-gray-500">
                        {idx === 0 && filtered.length > pagination.paginatedItems.length
                          ? `across all ${filtered.length} matching rows`
                          : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableFooter>
              )}
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

      <VoucherFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        editing={editing}
        initialPurpose={initialPurpose}
        customers={customers}
        users={vUsers}
        settings={settings}
        onSaved={async () => { setFormOpen(false); setEditing(null); await load(); }}
      />

      <AccountingSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        scope="voucher"
        onSaved={setSettings}
      />

      {detailId && (
        <VoucherDetailDialog
          voucherId={detailId}
          customers={customers}
          users={vUsers}
          currentUserId={currentUser?.id ?? null}
          canEdit={canEdit}
          settings={settings}
          onClose={() => setDetailId(null)}
          onChanged={() => { void load(); }}
          onEdit={openEdit}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.voucherNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Voided vouchers stay for audit. Only non-void vouchers can be deleted.
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
  localId: string;
  stockItemId?: string | null;
  name: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
}

function newLine(): FormLine {
  return {
    localId: Math.random().toString(36).slice(2),
    name: '', description: '', unit: '', quantity: '1', unitPrice: '0',
  };
}

function VoucherFormDialog({
  open, onOpenChange, editing, initialPurpose, customers, users, settings, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: vouchersApi.Voucher | null;
  /** Purpose to start the form with when creating (driven by the
   *  user's pick from the New Voucher dropdown). Ignored on edit. */
  initialPurpose: vouchersApi.VoucherPurpose;
  customers: customersApi.Customer[];
  /** Tenant users — populates the Approver picker. */
  users: usersApi.User[];
  /** Sale-scope settings — gates Notes / Terms / Discount / Tax. */
  settings: accountingSettingsApi.AccountingSettings;
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = !!editing;
  const [voucherNo, setVoucherNo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState('4100');
  const [purpose, setPurpose] = useState<vouchersApi.VoucherPurpose>('free_service');
  const [approverId, setApproverId] = useState<string>('');
  const [taxType, setTaxType] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [lines, setLines] = useState<FormLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  // Chain-approver picker state (V172, Phase 3b) — manual-assign
  // chain, mirrors Quotations. Distinct from `approverId` above,
  // which is the legacy per-voucher approver. Empty = skip chain,
  // voucher flows through the existing progress → done states
  // unchanged.
  const [chainApprover1, setChainApprover1] = useState('');
  const [chainApprover2, setChainApprover2] = useState('');
  const [chainApprover3, setChainApprover3] = useState('');
  // Recent-items typeahead — shared with Invoices + Quotations.
  const [focusedLineId, setFocusedLineId] = useState<string | null>(null);
  const [recentItems, setRecentItems] = useState(() => getRecentLineItems());
  // Stock-catalog picker state — lazy-loaded on first picker open.
  // Same lazy pattern as Invoices / Quotations.
  const [stockCatalog, setStockCatalog] = useState<itemsApi.Item[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  // Per-tenant gate from the Items → Settings dialog (V120). Hidden
  // when the tenant hasn't opted in for Voucher.
  const [pickerEnabled, setPickerEnabled] = useState(false);
  // Tenant currency settings (V166). Drives the dropdown options +
  // the default new-document currency / exchange rate. Refetched on
  // every dialog open so a Settings > Currency change is picked up
  // without a page reload.
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  useEffect(() => {
    if (!open) return;
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, [open]);
  const currencyOptions = currencyApi.enabledCurrencies(currencySettings);
  useEffect(() => {
    itemsApi.getUsageSettings()
      .then(s => setPickerEnabled(s.enabledForVoucher))
      .catch(() => setPickerEnabled(false));
  }, []);
  const ensureCatalog = async () => {
    if (catalogLoaded) return;
    try {
      const res = await itemsApi.list({ size: 200 });
      setStockCatalog(res.content ?? []);
    } catch {
      // Silent fail — picker stays empty, free-text lines still work.
    } finally {
      setCatalogLoaded(true);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setVoucherNo(editing.voucherNo);
      setCustomerId(editing.customerId);
      setIssueDate(editing.issueDate);
      setCurrency(editing.currency);
      setExchangeRate(String(editing.exchangeRate));
      setPurpose(editing.purpose);
      setApproverId(editing.approverId ?? '');
      setTaxType(editing.taxType ?? '');
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
      vouchersApi.nextNumber()
        .then(r => setVoucherNo(r.voucherNo))
        .catch(() => setVoucherNo(''));
      setCustomerId('');
      setIssueDate(new Date().toISOString().slice(0, 10));
      setCurrency(currencySettings?.primaryCurrency ?? 'USD');
      setExchangeRate(String(currencySettings?.secondaryRate ?? 4100));
      setPurpose(initialPurpose);
      setApproverId('');
      setTaxType('');
      setNotes('');
      setTerms('');
      setLines([newLine()]);
      setChainApprover1('');
      setChainApprover2('');
      setChainApprover3('');
    }
  }, [open, editing, initialPurpose]);

  // Follow-up sync: when the tenant currency settings arrive AFTER
  // the reset effect above ran (network race on first open), pin the
  // form's currency + exchange rate to the tenant defaults. Skip in
  // edit mode (the row's own currency wins).
  useEffect(() => {
    if (!open || editing || !currencySettings) return;
    setCurrency(currencySettings.primaryCurrency);
    setExchangeRate(String(currencySettings.secondaryRate ?? 4100));
  }, [open, editing, currencySettings]);

  /** Subtotal / tax / discount(=subtotal, 100%) / total(=0). The
   *  display mirrors Invoice's totals block so the operator sees
   *  exactly what they're giving away. */
  const totals = useMemo(() => {
    let subtotal = 0;
    for (const l of lines) {
      const q = Number(l.quantity) || 0;
      const p = Number(l.unitPrice) || 0;
      subtotal += q * p;
    }
    const taxRate = TAX_TYPE_BY_KEY[taxType]?.rate ?? 0;
    const tax = (subtotal * taxRate) / 100;
    const disc = subtotal;        // 100% off
    const total = 0;              // always zero on a voucher
    return { subtotal, tax, disc, total };
  }, [lines, taxType]);

  const addLine = () => setLines(prev => [...prev, newLine()]);
  const removeLine = (id: string) =>
    setLines(prev => prev.length === 1 ? prev : prev.filter(l => l.localId !== id));
  const updateLine = (id: string, patch: Partial<FormLine>) =>
    setLines(prev => prev.map(l => l.localId === id ? { ...l, ...patch } : l));

  const validate = (): boolean => {
    if (!customerId) { toast.error('Customer is required'); return false; }
    if (!purpose) { toast.error('Purpose is required'); return false; }
    const hasLine = lines.some(l => l.name.trim());
    if (!hasLine) { toast.error('At least one line item is required'); return false; }
    return true;
  };

  const buildPayload = (): vouchersApi.VoucherRequest => {
    // Chain approvers — ordered, dedup, drop blanks. Only sent on
    // create; update ignores the field server-side.
    const orderedApprovers: string[] = [];
    const seen = new Set<string>();
    for (const raw of [chainApprover1, chainApprover2, chainApprover3]) {
      const v = raw?.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      orderedApprovers.push(v);
    }
    return {
      voucherNo: voucherNo.trim() || undefined,
      customerId,
      issueDate,
      currency: currency.trim().toUpperCase(),
      exchangeRate: Number(exchangeRate) || 0,
      purpose,
      approverId: approverId || null,
      taxType: taxType || undefined,
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
        await vouchersApi.update(editing.id, buildPayload());
        toast.success(`${editing.voucherNo} updated`);
      } else {
        const created = await vouchersApi.create(buildPayload());
        toast.success(`Voucher ${created.voucherNo} created`);
      }
      addRecentLineItems(lines.map(l => ({
        name: l.name,
        unit: l.unit,
        unitPrice: Number(l.unitPrice) || undefined,
      })));
      setRecentItems(getRecentLineItems());
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save voucher');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1260px] w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            {isEdit ? `Edit ${editing?.voucherNo}` : 'New Voucher'}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Voucher description"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                Records goods or services given away for free. Total is always zero — the line items capture the fair value for audit.
              </TooltipContent>
            </Tooltip>
          </DialogTitle>
          {/* DialogDescription kept (visually hidden) so Radix's a11y
              requirement is satisfied; the visible copy lives in the
              tooltip above the title. */}
          <DialogDescription className="sr-only">
            Records goods or services given away for free. Total is always zero — the line items capture the fair value for audit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Customer *</Label>
              <SearchablePicker
                value={customerId}
                onChange={setCustomerId}
                placeholder="Pick a customer"
                options={customers.map(c => ({
                  value: c.id,
                  label: c.name,
                  searchKey: `${c.name} ${c.phone ?? ''} ${c.tin ?? ''}`,
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Voucher No.</Label>
              <Input value={voucherNo} onChange={e => setVoucherNo(e.target.value)} className="tabular-nums" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Issue date</Label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Purpose *</Label>
              <Select value={purpose} onValueChange={v => setPurpose(v as vouchersApi.VoucherPurpose)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PURPOSE_OPTIONS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          {/* Approver — kept on its own row so the Tax/Discount cells
              below match the Invoice form 1:1. */}
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                Approver (optional)
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-gray-600"
                      aria-label="Approver field help"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    If set, the voucher needs this user to Approve / Reject. Otherwise the operator marks it Done.
                  </TooltipContent>
                </Tooltip>
              </Label>
              <SearchablePicker
                value={approverId}
                onChange={setApproverId}
                placeholder="(no approval required)"
                allowClear
                options={users.map(u => ({
                  value: u.id,
                  label: u.email,
                  searchKey: `${u.email} ${u.role}`,
                }))}
              />
            </div>
          </div>

          {/* Line items editor — same 12-col grid card as the Invoice
              form so the visual rhythm (header strip + h-8 input rows +
              Trash icon at the end) is identical. */}
          <div className="space-y-2 border rounded-md p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Line items</Label>
              <Button size="sm" variant="outline" onClick={addLine}>
                <Plus className="h-3 w-3 mr-1" /> Add line
              </Button>
            </div>
            <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-gray-500 px-1">
              <div className="col-span-3">Item</div>
              <div className="col-span-3">Specification</div>
              <div className="col-span-1">UOM</div>
              <div className="col-span-1 text-right">Qty</div>
              <div className="col-span-2 text-right">Unit price</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1" />
            </div>
            {lines.map(l => {
              const lineTotal = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
              return (
                <div key={l.localId} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3 flex items-center gap-1">
                    {/* Stock-catalog picker — same UX as Invoices /
                        Quotations. Gated by the per-tenant Items →
                        Settings toggle (V120); hidden when the tenant
                        hasn't opted in for Voucher. */}
                    {pickerEnabled && (
                    <StockItemPicker
                      catalog={stockCatalog}
                      loaded={catalogLoaded}
                      onOpen={ensureCatalog}
                      selectedId={l.stockItemId ?? ''}
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
                      className="h-8 text-sm w-full"
                      value={l.name}
                      onChange={e => updateLine(l.localId, {
                        name: e.target.value,
                        // Hand-editing unlinks the catalog row.
                        stockItemId: null,
                      })}
                      onFocus={() => setFocusedLineId(l.localId)}
                      onBlur={() => setTimeout(() => setFocusedLineId(p => p === l.localId ? null : p), 120)}
                      placeholder="Item or service name"
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
                  </div>
                  <Input
                    className="col-span-3 h-8 text-sm"
                    value={l.description}
                    onChange={e => updateLine(l.localId, { description: e.target.value })}
                    placeholder="Model, size, variant…"
                  />
                  <Input
                    className="col-span-1 h-8 text-sm"
                    value={l.unit}
                    onChange={e => updateLine(l.localId, { unit: e.target.value })}
                    placeholder="pcs"
                  />
                  <Input
                    className="col-span-1 h-8 text-sm text-right"
                    type="number" min={0} step="0.01"
                    value={l.quantity}
                    onChange={e => updateLine(l.localId, { quantity: e.target.value })}
                  />
                  <Input
                    className="col-span-2 h-8 text-sm text-right"
                    type="number" min={0} step="0.01"
                    value={l.unitPrice}
                    onChange={e => updateLine(l.localId, { unitPrice: e.target.value })}
                  />
                  <div className="col-span-1 text-right text-sm tabular-nums px-2">
                    {lineTotal.toFixed(2)}
                  </div>
                  <Button
                    size="sm" variant="ghost"
                    className="col-span-1 h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                    onClick={() => removeLine(l.localId)}
                    disabled={lines.length === 1}
                    title="Remove line"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Tax + Discount row — mirrors the Invoice form layout.
              Each cell is gated by the shared Sale-side Accountant
              settings popup. Voucher's Discount is server-locked at
              100% regardless of the toggle, but hiding the field when
              showDiscount is off keeps the form uncluttered for
              tenants who don't want to see it. */}
          {(settings.showTax || settings.showDiscount) && (
          <div className="grid grid-cols-3 gap-3">
            {settings.showTax && (
            <div className="space-y-1.5">
              <Label className="text-xs">Taxation</Label>
              <Select
                value={taxType || '_none'}
                onValueChange={v => setTaxType(v === '_none' ? '' : v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {TAX_TYPES.filter(t => settings.taxTypesEnabled.includes(t.key) || t.key === editing?.taxType).map(t => (
                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}
            {settings.showTax && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Tax {taxType && TAX_TYPE_BY_KEY[taxType] && (
                  <span className="text-[10px] text-gray-400">@ {TAX_TYPE_BY_KEY[taxType].rate}%</span>
                )}
              </Label>
              <Input
                type="number" min={0} step="0.01"
                value={taxType
                  ? (totals.subtotal * (TAX_TYPE_BY_KEY[taxType]?.rate ?? 0) / 100).toFixed(2)
                  : '0.00'}
                disabled
                title="Voucher tax is auto-computed and informational only"
              />
            </div>
            )}
            {settings.showDiscount && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Discount <span className="text-[10px] text-gray-400">(locked at 100%)</span>
              </Label>
              <div className="flex">
                <Input
                  type="number"
                  value="100"
                  disabled
                  className="rounded-r-none text-gray-500"
                  title="Voucher discount is server-locked at 100%"
                />
                <div className="inline-flex border border-l-0 rounded-r-md overflow-hidden">
                  <button
                    type="button"
                    disabled
                    className="px-3 text-sm bg-white text-gray-400 cursor-not-allowed"
                    title="Voucher discount is always a percentage"
                  >$</button>
                  <button
                    type="button"
                    disabled
                    className="px-3 text-sm border-l bg-blue-50 text-blue-700 cursor-not-allowed"
                    title="Voucher discount is server-locked at 100%"
                  >%</button>
                </div>
              </div>
            </div>
            )}
          </div>
          )}

          {/* Notes + Terms + summary card. Single-column for the text
              side when only one of Notes/Terms is on. The totals card
              stays even when Notes/Terms are hidden — we still need to
              show the user where the $0 came from. */}
          <div className="grid grid-cols-2 gap-3">
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
            <div className="bg-slate-50 rounded-md p-3 space-y-1 text-sm self-start">
              <div className="flex justify-end gap-6"><span className="text-gray-600">Subtotal (fair value)</span><span className="tabular-nums w-32 text-right">{fmtMoney(totals.subtotal, currency)}</span></div>
              {settings.showTax && totals.tax > 0 && (
                <div className="flex justify-end gap-6"><span className="text-gray-600">Tax (informational)</span><span className="tabular-nums w-32 text-right">+ {fmtMoney(totals.tax, currency)}</span></div>
              )}
              {settings.showDiscount && (
                <div className="flex justify-end gap-6"><span className="text-gray-600">Discount (100%)</span><span className="tabular-nums w-32 text-right">− {fmtMoney(totals.disc, currency)}</span></div>
              )}
              <div className="flex justify-end gap-6 font-semibold border-t pt-1 mt-1"><span>Total {currency}</span><span className="tabular-nums w-32 text-right">{fmtMoney(totals.total, currency)}</span></div>
              {/* Secondary-currency total — rendered only when the
                  tenant has a secondary currency AND the voucher's
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

          {/* Chain approvers — manual-assign chain (V172, Phase 3b).
              Distinct from the single-approver picker above: this
              routes the voucher through the unified approval inbox.
              Only shown on create AND when the tenant flipped
              "Show Approval" on in Voucher Settings (V175). */}
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
                      Leave blank to skip approval. Otherwise the voucher waits until each picked approver acts, in order.
                    </TooltipContent>
                  </Tooltip>
                </div>
                {(chainApprover1 || chainApprover2 || chainApprover3) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-gray-500"
                    onClick={() => { setChainApprover1(''); setChainApprover2(''); setChainApprover3(''); }}
                    type="button"
                  >
                    Clear
                  </Button>
                )}
              </div>
              {[
                { label: '1st', value: chainApprover1, set: setChainApprover1 },
                { label: '2nd', value: chainApprover2, set: setChainApprover2 },
                { label: '3rd', value: chainApprover3, set: setChainApprover3 },
              ].slice(0, settings.approverCount ?? 3).map((slot, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 w-6 shrink-0">{slot.label}</span>
                  <Select value={slot.value || '__none'} onValueChange={(v) => slot.set(v === '__none' ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="— none —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— none —</SelectItem>
                      {users
                        .filter(u => u.isActive)
                        .filter(u => u.id !== chainApprover1 || slot.value === chainApprover1)
                        .filter(u => u.id !== chainApprover2 || slot.value === chainApprover2)
                        .filter(u => u.id !== chainApprover3 || slot.value === chainApprover3)
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
            {saving ? 'Saving…' : (isEdit ? 'Save' : 'Issue Voucher')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Detail dialog — view + Void + Mail + Print                          */
/* ------------------------------------------------------------------ */

function VoucherDetailDialog({
  voucherId, customers, users, currentUserId, canEdit, settings, onClose, onChanged, onEdit,
}: {
  voucherId: string;
  customers: customersApi.Customer[];
  users: usersApi.User[];
  currentUserId: string | null;
  canEdit: boolean;
  settings: accountingSettingsApi.AccountingSettings;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (v: vouchersApi.Voucher) => void;
}) {
  const { formatDate } = useDateFormat();
  const [voucher, setVoucher] = useState<vouchersApi.Voucher | null>(null);
  const [companyInfo, setCompanyInfo] = useState<settingsApi.CompanyInfo | null>(null);
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const customer = voucher ? customers.find(c => c.id === voucher.customerId) : undefined;
  const approver = voucher?.approverId
    ? users.find(u => u.id === voucher.approverId)
    : undefined;
  const approvedBy = voucher?.approvedById
    ? users.find(u => u.id === voucher.approvedById)
    : undefined;
  const rejectedBy = voucher?.rejectedById
    ? users.find(u => u.id === voucher.rejectedById)
    : undefined;
  // The Approve / Reject buttons are gated by both "is there an
  // approver assigned" and "is that approver me". The backend enforces
  // the same check, so failing the FE check just keeps the buttons
  // hidden rather than disabled-with-error.
  const isAssignedApprover = !!voucher?.approverId
    && !!currentUserId
    && voucher.approverId === currentUserId;

  const load = async () => {
    setLoading(true);
    try {
      setVoucher(await vouchersApi.get(voucherId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load voucher');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [voucherId]);
  useEffect(() => {
    settingsApi.getCompanyInfo().then(setCompanyInfo).catch(() => setCompanyInfo(null));
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, []);

  const runTransition = async (
    label: string,
    call: () => Promise<vouchersApi.Voucher>,
  ) => {
    if (!voucher) return;
    setBusy(true);
    try {
      const next = await call();
      toast.success(`${next.voucherNo} ${label}`);
      setVoucher(next);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  };

  const doMarkDone = () => runTransition('marked done', () => vouchersApi.markDone(voucher!.id));
  const doApprove  = () => runTransition('approved',     () => vouchersApi.approve(voucher!.id));
  const doVoid     = () => runTransition('voided',       () => vouchersApi.voidVoucher(voucher!.id));

  const doReject = async () => {
    if (!voucher) return;
    setBusy(true);
    try {
      const next = await vouchersApi.reject(voucher.id, rejectReason.trim() || undefined);
      toast.success(`${next.voucherNo} rejected`);
      setVoucher(next);
      setRejectOpen(false);
      setRejectReason('');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1100px] w-[90vw] max-h-[90vh] overflow-y-auto">
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
              font-family: 'Moul', 'Battambang', 'Noto Sans Khmer', serif !important;
              font-weight: 400 !important;
              letter-spacing: 0.5px;
            }
            @page { margin: 0; size: A4; }
          }
        `}</style>
        {voucher && (
          <PrintVoucher voucher={voucher} customer={customer} company={companyInfo} currencySettings={currencySettings} />
        )}
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="tabular-nums">{voucher?.voucherNo ?? 'Voucher details'}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                {loading || !voucher ? (
                  <span className="text-xs text-gray-500">Loading voucher…</span>
                ) : (
                  <>
                    <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[voucher.status]}`}>
                      {voucher.status}
                    </Badge>
                    <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                      {vouchersApi.PURPOSE_LABELS[voucher.purpose]}
                    </Badge>
                    <span className="text-xs text-gray-500">{formatDate(voucher.issueDate)}</span>
                  </>
                )}
              </DialogDescription>
            </div>
            {voucher && (
              <div className="flex gap-1.5 mr-8 print:hidden">
                <Button size="sm" variant="outline" onClick={() => { void printWithKhmerFonts(); }}>
                  <Printer className="h-3.5 w-3.5 mr-1" /> Print
                </Button>
                {/* Mail is only meaningful once the voucher is
                    finalised through one of the two completion paths.
                    Progress is unfinished, rejected/void shouldn't be
                    sent to the recipient. */}
                {(voucher.status === 'done' || voucher.status === 'approved') && (
                  <Button size="sm" variant="outline" onClick={() => setMailOpen(true)} title="Send voucher by email">
                    <Mail className="h-3.5 w-3.5 mr-1" /> Mail
                  </Button>
                )}
                {/* Edit/Delete only in progress — finalised rows stay
                    read-only. Void is broader (any non-void). */}
                {canEdit && voucher.status === 'progress' && (
                  <Button size="sm" variant="outline" disabled={busy}
                          onClick={() => onEdit(voucher)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                )}
                {/* No-approval path: Mark Done. Hidden once an
                    approver is assigned. */}
                {canEdit && voucher.status === 'progress' && !voucher.approverId && (
                  <Button size="sm" disabled={busy} onClick={doMarkDone}>
                    <FileText className="h-3.5 w-3.5 mr-1" /> Mark Done
                  </Button>
                )}
                {/* Approver path: only the assigned approver sees
                    Approve / Reject. Other users see "Pending …" via
                    the meta badge below. */}
                {canEdit && voucher.status === 'progress' && isAssignedApprover && (
                  <>
                    <Button size="sm" disabled={busy} onClick={doApprove}
                            className="bg-emerald-600 hover:bg-emerald-700">
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => { setRejectReason(''); setRejectOpen(true); }}>
                      Reject
                    </Button>
                  </>
                )}
                {canEdit && voucher.status !== 'void' && (
                  <Button size="sm" variant="outline" disabled={busy}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={doVoid}>
                    <Ban className="h-3.5 w-3.5 mr-1" /> Void
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {loading || !voucher ? (
          <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
        ) : (
          <div className="space-y-4 print:hidden">
            <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1 text-sm">
              <div className="text-gray-500">Customer</div>
              <div>{customer?.name ?? <span className="text-gray-400">(unknown)</span>}</div>
              <div className="text-gray-500">Purpose</div>
              <div>{vouchersApi.PURPOSE_LABELS[voucher.purpose]}</div>
              <div className="text-gray-500">Currency</div>
              <div>{voucher.currency}</div>
              {settings.showTax && voucher.taxType && (<>
                <div className="text-gray-500">Taxation</div>
                <div>{TAX_TYPE_BY_KEY[voucher.taxType]?.label ?? voucher.taxType}</div>
              </>)}
              {voucher.approverId && (<>
                <div className="text-gray-500">Approver</div>
                <div>
                  {approver?.email ?? <span className="text-gray-400">{voucher.approverId}</span>}
                  {voucher.status === 'progress' && (
                    <span className="ml-2 text-xs text-amber-700">
                      {isAssignedApprover ? '(waiting on you)' : '(awaiting approval)'}
                    </span>
                  )}
                </div>
              </>)}
              {voucher.status === 'approved' && voucher.approvedAt && (<>
                <div className="text-gray-500">Approved</div>
                <div className="text-sm">
                  by {approvedBy?.email ?? voucher.approvedById ?? '—'}
                  {' '}<span className="text-gray-500">· {new Date(voucher.approvedAt).toLocaleString()}</span>
                </div>
              </>)}
              {voucher.status === 'rejected' && voucher.rejectedAt && (<>
                <div className="text-gray-500">Rejected</div>
                <div className="text-sm">
                  by {rejectedBy?.email ?? voucher.rejectedById ?? '—'}
                  {' '}<span className="text-gray-500">· {new Date(voucher.rejectedAt).toLocaleString()}</span>
                  {voucher.rejectedReason && (
                    <div className="mt-1 text-red-700 whitespace-pre-wrap">{voucher.rejectedReason}</div>
                  )}
                </div>
              </>)}
            </div>

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
                  {voucher.items.map(it => (
                    <TableRow key={it.id}>
                      <TableCell>{it.name}</TableCell>
                      <TableCell className="text-sm text-gray-600">{it.description || '—'}</TableCell>
                      <TableCell className="text-sm">{it.unit || '—'}</TableCell>
                      <TableCell className="text-right text-sm">{it.quantity}</TableCell>
                      <TableCell className="text-right text-sm">{fmtMoney(it.unitPrice, voucher.currency)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtMoney(it.lineTotal, voucher.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-3">
                {settings.showNotes && voucher.notes && (
                  <div className="bg-slate-50 rounded-md p-3 text-sm">
                    <div className="text-xs text-gray-500 mb-1">Notes</div>
                    <div className="whitespace-pre-wrap">{voucher.notes}</div>
                  </div>
                )}
                {settings.showTerms && voucher.terms && (
                  <div className="bg-slate-50 rounded-md p-3 text-sm">
                    <div className="text-xs text-gray-500 mb-1">Terms &amp; conditions</div>
                    <div className="whitespace-pre-wrap">{voucher.terms}</div>
                  </div>
                )}
              </div>
              <div className="bg-slate-50 rounded-md p-3 space-y-1 text-sm">
                <div className="flex justify-end gap-6"><span className="text-gray-600">Subtotal (fair value)</span><span className="tabular-nums w-32 text-right">{fmtMoney(voucher.subtotal, voucher.currency)}</span></div>
                {settings.showTax && voucher.taxAmount > 0 && (
                  <div className="flex justify-end gap-6"><span className="text-gray-600">Tax</span><span className="tabular-nums w-32 text-right">+ {fmtMoney(voucher.taxAmount, voucher.currency)}</span></div>
                )}
                {settings.showDiscount && (
                <div className="flex justify-end gap-6"><span className="text-gray-600">Discount (100%)</span><span className="tabular-nums w-32 text-right">− {fmtMoney(voucher.discountAmount, voucher.currency)}</span></div>
                )}
                <div className="flex justify-end gap-6 font-semibold border-t pt-1 mt-1"><span>Total {voucher.currency}</span><span className="tabular-nums w-32 text-right">{fmtMoney(voucher.total, voucher.currency)}</span></div>
              </div>
            </div>
          </div>
        )}

        {mailOpen && voucher && (
          <MailVoucherDialog
            voucher={voucher}
            customer={customer}
            company={companyInfo}
            onClose={() => setMailOpen(false)}
          />
        )}

        {/* Reject dialog — captured reason is stored on the row so a
            later audit can see why the approver said no. */}
        <Dialog open={rejectOpen} onOpenChange={(o) => !o && setRejectOpen(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reject voucher</DialogTitle>
              <DialogDescription>
                The voucher will be marked Rejected and become read-only. Add an optional reason for the audit trail.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason (optional)"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={doReject} disabled={busy}
                      className="bg-red-600 hover:bg-red-700">
                Reject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Mail dialog                                                        */
/* ------------------------------------------------------------------ */

function MailVoucherDialog({
  voucher, customer, company, onClose,
}: {
  voucher: vouchersApi.Voucher;
  customer?: customersApi.Customer;
  company: settingsApi.CompanyInfo | null;
  onClose: () => void;
}) {
  const defaultSubject =
    `Voucher ${voucher.voucherNo}${company?.name ? ` from ${company.name}` : ''}`;
  const defaultBody = [
    `Dear ${customer?.representative || customer?.name || 'Customer'},`,
    '',
    `Please find voucher ${voucher.voucherNo} dated ${voucher.issueDate}.`,
    `Purpose: ${vouchersApi.PURPOSE_LABELS[voucher.purpose]}.`,
    '',
    'A printed copy is attached. Let us know if you have any questions.',
    '',
    `Regards,${company?.name ? `\n${company.name}` : ''}`,
  ].join('\n');

  const [to, setTo] = useState<string>('');
  const [cc, setCc] = useState<string>('');
  const [subject, setSubject] = useState<string>(defaultSubject);
  const [body, setBody] = useState<string>(defaultBody);

  const handleSend = () => {
    const trimmed = to.trim();
    if (!trimmed) {
      toast.error('Recipient email is required');
      return;
    }
    const params = new URLSearchParams();
    params.set('subject', subject);
    params.set('body', body);
    if (cc.trim()) params.set('cc', cc.trim());
    const href = `mailto:${encodeURIComponent(trimmed)}?${params.toString()}`;
    window.location.href = href;
    toast.success('Opened your mail client — review and send.');
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Send voucher by email
          </DialogTitle>
          <DialogDescription>
            Opens your default mail client with the message pre-filled.
            Print → Save as PDF first if you want to attach the voucher.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>To <span className="text-red-500">*</span></Label>
            <Input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="alice@example.com, bob@example.com"
              autoFocus
            />
            <div className="text-[11px] text-gray-500">
              Separate multiple addresses with commas.
            </div>
          </div>
          <div className="space-y-1">
            <Label>Cc</Label>
            <Input type="text" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="carol@example.com" />
          </div>
          <div className="space-y-1">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Body</Label>
            <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend}>
            <Mail className="h-4 w-4 mr-1.5" /> Open mail client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Print template — mirrors Invoice / Quotation WABOOKS layout, retitled.     */
/* -------------------------------------------------------------------------- */

function VBiLabel({ kh, en }: { kh: string; en: string }) {
  return (
    <div style={{ lineHeight: 1.15 }}>
      <div style={{ fontSize: '11px' }}>{kh}</div>
      <div style={{ fontSize: '9px', color: '#555' }}>{en}</div>
    </div>
  );
}

function VVatTinBoxes({ tin }: { tin: string }) {
  const chars = tin.trim().split('');
  // See Invoices.tsx VatTinBoxes for why this uses flex + flex-shrink
  // instead of inline-block — html2canvas rendered the previous shape
  // with one digit per line.
  return (
    <span style={{
      display: 'inline-flex', flexWrap: 'nowrap', gap: '2px',
      verticalAlign: 'middle', whiteSpace: 'nowrap',
    }}>
      {chars.map((c, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flex: '0 0 auto', width: '14px', height: '16px', fontSize: '11px',
          border: c === '-' ? 'none' : '1px solid #000',
          boxSizing: 'border-box',
        }}>{c}</span>
      ))}
    </span>
  );
}

function PrintVoucher({
  voucher, customer, company, currencySettings,
}: {
  voucher: vouchersApi.Voucher;
  customer?: customersApi.Customer;
  company: settingsApi.CompanyInfo | null;
  currencySettings?: currencyApi.CurrencySettings | null;
}) {
  const primaryCode = voucher.currency || 'USD';
  const secondaryCode = currencySettings?.secondaryCurrency ?? null;
  const showSecondary = !!secondaryCode && secondaryCode !== primaryCode;
  // Grand Total (secondary) = total × rate (voucher total is always 0,
  // so this also lands on 0 — matches Invoice / Quotation labelling).
  const grandSecondary = showSecondary
    ? Math.round(voucher.total * (voucher.exchangeRate || 0))
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
  const showVat = voucher.taxAmount > 0;
  const vatPct = voucher.subtotal > 0 ? Math.round((voucher.taxAmount / voucher.subtotal) * 100) : 0;
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
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px', alignItems: 'center', gap: '16px' }}>
        <div style={{ minHeight: '52px' }}>
          {company?.logoUrl && (
            <img src={company.logoUrl} alt="" style={{ height: '52px', objectFit: 'contain' }} />
          )}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="kh-title" style={{
            fontSize: '20px', fontWeight: 400, lineHeight: 1.15,
            fontFamily: "'Moul', 'Battambang', 'Noto Sans Khmer', serif",
          }}>{companyKh}</div>
          {companyEn && companyEn !== companyKh && (
            <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '2px' }}>{companyEn}</div>
          )}
        </div>
        <div />
      </div>

      <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '11px', lineHeight: 1.5 }}>
        {company?.address && <div>{company.address}</div>}
        {(company?.phone || company?.taxId) && (
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {company?.phone && <span>{company.phone}</span>}
            {company?.taxId && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <VBiLabel kh="លេខអត្តសញ្ញាណកម្ម អតប" en="VAT TIN" />
                <VVatTinBoxes tin={company.taxId} />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Title — purpose-driven so the printed page reads "CHARITY
          VOUCHER" / "DONATION VOUCHER" / etc., matching the option
          the operator picked from the New Voucher dropdown. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
        <div style={{ flex: 1, borderTop: '1px solid #000' }} />
        <div style={{ textAlign: 'center' }}>
          <div className="kh-title" style={{
            fontSize: '20px', fontWeight: 400,
            fontFamily: "'Moul', 'Battambang', 'Noto Sans Khmer', serif",
          }}>{PRINT_TITLES[voucher.purpose].kh}</div>
          <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '0.5px' }}>
            {PRINT_TITLES[voucher.purpose].en}
          </div>
        </div>
        <div style={{ flex: 1, borderTop: '1px solid #000' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '32px', rowGap: '6px', fontSize: '11px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '140px' }}><VBiLabel kh="ឈ្មោះក្រុមហ៊ុន ឬ អតិថិជន" en="Company Name / Customer" /></div>
          <div style={{ fontWeight: 600 }}>{customer?.name ?? ''}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '120px' }}><VBiLabel kh="លេខរៀងប័ណ្ណផ្តល់" en="Voucher N°" /></div>
          <div style={{ fontFamily: 'monospace' }}>{voucher.voucherNo}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '140px' }}><VBiLabel kh="អាសយដ្ឋាន" en="Address" /></div>
          <div>{customer?.address ?? ''}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '120px' }}><VBiLabel kh="កាលបរិច្ឆេទ" en="Issue Date" /></div>
          <div>{fmtDate(voucher.issueDate)}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '140px' }}><VBiLabel kh="ទូរស័ព្ទលេខ , ឈ្មោះអ្នកតំណាង" en="Telephone No. , Representative" /></div>
          <div>{[customer?.phone, customer?.representative].filter(Boolean).join(', ')}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '120px' }}><VBiLabel kh="គោលបំណង" en="Purpose" /></div>
          <div style={{ fontWeight: 600 }}>{vouchersApi.PURPOSE_LABELS[voucher.purpose]}</div>
        </div>
        {customer?.tin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', gridColumn: '1 / span 2' }}>
            <VBiLabel kh="លេខអត្តសញ្ញាណកម្ម អតប" en="VAT TIN" />
            <VVatTinBoxes tin={customer.tin} />
          </div>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr>
            <th style={vThStyle}><VBiLabel kh="ល.រ." en="N°" /></th>
            <th style={{ ...vThStyle, textAlign: 'left' }}><VBiLabel kh="បរិយាយមុខទំនិញ ឬ សេវាកម្ម" en="Description" /></th>
            <th style={vThStyle}><VBiLabel kh="បរិមាណ" en="Quantity" /></th>
            <th style={{ ...vThStyle, textAlign: 'right' }}><VBiLabel kh="ថ្លៃឯកតា" en="Unit Price" /></th>
            <th style={{ ...vThStyle, textAlign: 'right' }}><VBiLabel kh="បញ្ចុះតម្លៃ" en="Discount" /></th>
            <th style={{ ...vThStyle, textAlign: 'right' }}><VBiLabel kh="ថ្លៃទំនិញ" en="Amount" /></th>
          </tr>
        </thead>
        <tbody>
          {voucher.items.map((it, idx) => (
            <tr key={it.id}>
              <td style={{ ...vTdStyle, textAlign: 'center' }}>{idx + 1}</td>
              <td style={vTdStyle}>
                <div>{it.name}</div>
                {it.description && <div style={{ fontSize: '10px', color: '#555' }}>{it.description}</div>}
              </td>
              <td style={{ ...vTdStyle, textAlign: 'center' }}>{it.quantity}</td>
              <td style={{ ...vTdStyle, textAlign: 'right' }}>{fmtPrimary(it.unitPrice)}</td>
              {/* Per-line Discount column stays 0 — the 100% discount
                  is shown once at the totals block so each line still
                  prints its fair value in the Amount column. Mirrors
                  Invoice's column ordering. */}
              <td style={{ ...vTdStyle, textAlign: 'right' }}>{fmtPrimary(0)}</td>
              <td style={{ ...vTdStyle, textAlign: 'right' }}>{fmtPrimary(it.lineTotal)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={5} style={{ ...vTdStyle, textAlign: 'right' }}>សរុប ({primaryCode}) / Sub Total ({primaryCode})</td>
            <td style={{ ...vTdStyle, textAlign: 'right' }}>{fmtPrimary(voucher.subtotal)}</td>
          </tr>
          {showVat && (
            <tr>
              <td colSpan={5} style={{ ...vTdStyle, textAlign: 'right' }}>
                អាករលើតម្លៃបន្ថែម {vatPct}% ({primaryCode}) / VAT {vatPct}% ({primaryCode})
              </td>
              <td style={{ ...vTdStyle, textAlign: 'right' }}>{fmtPrimary(voucher.taxAmount)}</td>
            </tr>
          )}
          <tr>
            <td colSpan={5} style={{ ...vTdStyle, textAlign: 'right' }}>បញ្ចុះតម្លៃ 100% / Discount 100%</td>
            <td style={{ ...vTdStyle, textAlign: 'right' }}>− {fmtPrimary(voucher.subtotal)}</td>
          </tr>
          <tr>
            <td colSpan={5} style={{ ...vTdStyle, textAlign: 'right', fontWeight: 700 }}>សរុបរួម ({primaryCode}) / Grand Total ({primaryCode})</td>
            <td style={{ ...vTdStyle, textAlign: 'right', fontWeight: 700 }}>{fmtPrimary(voucher.total)}</td>
          </tr>
          {showSecondary && (
            <tr>
              <td colSpan={5} style={{ ...vTdStyle, textAlign: 'right', fontWeight: 700 }}>សរុបរួម ({secondaryCode}) / Grand Total ({secondaryCode})</td>
              <td style={{ ...vTdStyle, textAlign: 'right', fontWeight: 700 }}>{fmtSecondary(grandSecondary)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ marginTop: '14px', fontSize: '11px', lineHeight: 1.5 }}>
        <div style={{ fontWeight: 600 }}>សម្គាល់ / Notes</div>
        {voucher.notes && (
          <div style={{ whiteSpace: 'pre-wrap' }}>{voucher.notes}</div>
        )}
        {voucher.terms && (
          <div style={{ whiteSpace: 'pre-wrap', marginTop: voucher.notes ? '6px' : '0' }}>{voucher.terms}</div>
        )}
        {showBank && (
          <>
            <div style={{ color: '#555', marginTop: (voucher.notes || voucher.terms) ? '6px' : '0' }}>
              ** គណនីសម្រាប់ព័ត៌មាន / Bank info (for reference):
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
        {(voucher.exchangeRate || 0) > 0 && (
          <div style={{ marginTop: '6px' }}>អត្រាប្តូរប្រាក់ / Exchange rate : {voucher.exchangeRate}</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', marginTop: '60px', fontSize: '11px', textAlign: 'center' }}>
        <div style={{ borderTop: '1px solid #000', paddingTop: '4px' }}>
          <div>ហត្ថលេខា និងឈ្មោះអ្នកទទួល</div>
          <div style={{ fontSize: '10px', color: '#555' }}>Recipient's Signature &amp; Name</div>
        </div>
        <div style={{ borderTop: '1px solid #000', paddingTop: '4px' }}>
          <div>ហត្ថលេខា និងឈ្មោះអ្នកផ្តល់</div>
          <div style={{ fontSize: '10px', color: '#555' }}>Issuer's Signature &amp; Name</div>
        </div>
      </div>
    </div>
  );
  return createPortal(tree, document.body) as unknown as React.ReactElement;
}

const vThStyle: React.CSSProperties = {
  border: '1px solid #000', padding: '4px 6px',
  textAlign: 'center', verticalAlign: 'middle', fontWeight: 600,
};
const vTdStyle: React.CSSProperties = {
  border: '1px solid #000', padding: '4px 6px', verticalAlign: 'top',
};
