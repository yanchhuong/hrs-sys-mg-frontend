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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { SearchablePicker } from '../common/SearchablePicker';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { DateInput } from '../common/DateInput';
import * as cashAdvancesApi from '../../api/cashAdvances';
import * as cashAdvancePurposesApi from '../../api/cashAdvancePurposes';
import * as employeesApi from '../../api/employees';
import * as currencyApi from '../../api/currencySettings';
import * as usersApi from '../../api/users';
import * as receiptsApi from '../../api/receipts';
import * as receiptPaymentsApi from '../../api/receiptPayments';
import * as vendorsApi from '../../api/vendors';
import {
  ArrowLeftRight, Banknote, Check, Info, Plus, RefreshCw, Search, Settings, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { CashAdvancePurposesDialog } from '../common/CashAdvancePurposesDialog';
import { useDateFormat } from '../../context/DateFormatContext';
import { useI18n } from '../../i18n/I18nContext';
import { useConfirm } from '../../context/ConfirmContext';

const STATUS_TABS: { value: '' | cashAdvancesApi.CashAdvanceStatus; label: string }[] = [
  { value: '',                  label: 'All' },
  { value: 'draft',             label: 'Draft' },
  { value: 'disbursed',         label: 'Disbursed' },
  { value: 'partially_settled', label: 'Partially Settled' },
  { value: 'settled',           label: 'Settled' },
  { value: 'cancelled',         label: 'Cancelled' },
];

const STATUS_BADGE: Record<cashAdvancesApi.CashAdvanceStatus, string> = {
  draft:             'bg-slate-100 text-slate-700 border-slate-200',
  disbursed:         'bg-blue-100 text-blue-700 border-blue-200',
  partially_settled: 'bg-amber-100 text-amber-700 border-amber-200',
  settled:           'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled:         'bg-rose-100 text-rose-700 border-rose-200',
};

const COMMON_EXPENSE_CATEGORIES = [
  'hotel', 'taxi', 'meals', 'fuel', 'office_supplies', 'flight', 'parking', 'other',
];

function fmtMoney(amt: number, ccy: string): string {
  if (ccy === 'KHR') return `៛ ${amt.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (ccy === 'USD') return `$${amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${ccy} ${amt.toLocaleString('en-US')}`;
}

/**
 * Cash Flow → Cash Advance. List + detail dialog (V158).
 *
 * <p>Each row is one advance request. Action buttons honour the
 * state machine: Draft → Disburse → Add Expenses → Settle. The
 * detail dialog inlines expense receipts so the operator can file
 * proof-of-spending without leaving the page.</p>
 */
export function CashAdvances() {
  const { formatDate } = useDateFormat();
  const { t } = useI18n();
  const [rows, setRows] = useState<cashAdvancesApi.CashAdvance[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'' | cashAdvancesApi.CashAdvanceStatus>('');
  /** Client-side filters layered on top of the server-side status
   *  query. Search is a case-insensitive contains-match against
   *  advance no, employee name, and purpose; date range is applied
   *  to the createdAt timestamp because every advance has one
   *  regardless of workflow state. */
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<cashAdvancesApi.CashAdvance | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Purpose presets — loaded once on mount + reloaded whenever the
   *  settings dialog changes them so the New Advance form picker
   *  stays fresh without a manual refresh. */
  const [purposes, setPurposes] = useState<cashAdvancePurposesApi.CashAdvancePurpose[]>([]);
  const loadPurposes = async () => {
    try { setPurposes(await cashAdvancePurposesApi.list()); }
    catch { /* silent — picker degrades to free-text only */ }
  };
  useEffect(() => { void loadPurposes(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await cashAdvancesApi.list({
        status: statusFilter || undefined,
        size: 200,
      });
      setRows(res.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load cash advances');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  /** Final rendered list after applying the search query + date
   *  range on top of the server-loaded {@link rows} (which already
   *  honour the status tab). */
  const visibleRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter(r => {
      if (q) {
        const haystack = `${r.advanceNo} ${r.employeeName ?? ''} ${r.purpose}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (dateFrom && r.createdAt.slice(0, 10) < dateFrom) return false;
      if (dateTo   && r.createdAt.slice(0, 10) > dateTo)   return false;
      return true;
    });
  }, [rows, searchQuery, dateFrom, dateTo]);

  const pagination = usePagination(visibleRows, 10);

  const totals = useMemo(() => {
    const acc = new Map<string, { advance: number; expense: number; refund: number; balance: number }>();
    for (const r of visibleRows) {
      const b = acc.get(r.currency) ?? { advance: 0, expense: 0, refund: 0, balance: 0 };
      b.advance += Number(r.advanceAmount) || 0;
      b.expense += Number(r.expenseTotal) || 0;
      b.refund  += Number(r.refundAmount) || 0;
      b.balance += Number(r.balance) || 0;
      acc.set(r.currency, b);
    }
    return Array.from(acc.entries()).map(([currency, b]) => ({ currency, ...b }));
  }, [visibleRows]);

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Banknote className="h-7 w-7 text-slate-600" />
          {t('nav.cashflow.advance')}
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help" aria-label="What is Cash Advance?">
                  <Info className="h-4 w-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                Workflow for handing company cash to an employee against an upcoming expense.
                Draft → Disburse → Add expense receipts → Settle. Disbursement and settlement
                each write a row in the Transactions ledger.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Advance
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => setSettingsOpen(true)}
            title="Manage purpose presets"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 flex-wrap">
          <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
            <TabsList>
              {STATUS_TABS.map(t => <TabsTrigger key={t.value || 'all'} value={t.value}>{t.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          {/* Search + date range strip — mirrors the Bills / Stock
              pages so the filter UI feels the same across the app.
              `.filter-strip` gives the same POS-style single-line scroll
              on tablet / phone. */}
          <div className="filter-strip">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search no, employee, purpose…"
                className="h-9 w-60 pl-7 text-sm"
              />
            </div>
            <Label className="text-xs text-gray-500">From</Label>
            <DateInput value={dateFrom || null} onChange={v => setDateFrom(v ?? '')} max={dateTo || undefined} />
            <Label className="text-xs text-gray-500">To</Label>
            <DateInput value={dateTo || null} onChange={v => setDateTo(v ?? '')} min={dateFrom || undefined} />
            {(searchQuery || dateFrom || dateTo) && (
              <Button
                size="sm" variant="ghost" className="h-9"
                onClick={() => { setSearchQuery(''); setDateFrom(''); setDateTo(''); }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Table scroller — {@code max-h} so the card shrinks to
              fit its content when rows are few and only engages
              inner scroll when rows would overflow. Header + footer
              stay sticky inside this container. */}
          <div className="overflow-auto max-h-[calc(100vh-22rem)]">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
                <TableRow>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead className="w-[120px]">Advance No</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                  <TableHead className="text-right w-[130px]">Advance</TableHead>
                  <TableHead className="text-right w-[130px]">Expenses</TableHead>
                  <TableHead className="text-right w-[130px]">Refund</TableHead>
                  <TableHead className="text-right w-[130px]">Balance</TableHead>
                  <TableHead className="w-[80px]">Currency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-sm text-gray-500 py-8">
                      {loading ? 'Loading…' : 'No cash advances yet — click New Advance to create one.'}
                    </TableCell>
                  </TableRow>
                ) : pagination.paginatedItems.map(r => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setDetail(r)}
                  >
                    <TableCell className="text-xs">{formatDate(r.createdAt)}</TableCell>
                    <TableCell className="tabular-nums text-xs">{r.advanceNo}</TableCell>
                    <TableCell>{r.employeeName ?? '—'}</TableCell>
                    <TableCell className="truncate max-w-[280px]" title={r.purpose}>{r.purpose}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[r.status]}>
                        {r.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(Number(r.advanceAmount), r.currency)}</TableCell>
                    <TableCell className="text-right tabular-nums text-gray-600">{fmtMoney(Number(r.expenseTotal), r.currency)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${
                      Number(r.refundAmount) > 0 ? 'text-emerald-700'
                      : Number(r.refundAmount) < 0 ? 'text-rose-700'
                      : 'text-gray-300'
                    }`}>
                      {Number(r.refundAmount) === 0
                        ? '—'
                        : `${Number(r.refundAmount) < 0 ? '− ' : ''}${fmtMoney(Math.abs(Number(r.refundAmount)), r.currency)}`}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${
                      Number(r.balance) > 0 ? 'text-emerald-700'
                      : Number(r.balance) < 0 ? 'text-rose-700'
                      : 'text-gray-600'
                    }`}>
                      {fmtMoney(Number(r.balance), r.currency)}
                    </TableCell>
                    <TableCell className="text-xs uppercase text-gray-500">{r.currency}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {totals.length > 0 && (
                <TableFooter className="sticky bottom-0 bg-slate-50 z-10 shadow-[0_-1px_0_rgba(0,0,0,0.08)]">
                  {totals.map(t => (
                    <TableRow key={t.currency} className="bg-slate-50">
                      <TableCell colSpan={5} className="text-xs uppercase tracking-wide text-gray-500">Total</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtMoney(t.advance, t.currency)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtMoney(t.expense, t.currency)}</TableCell>
                      <TableCell className={`text-right text-xs tabular-nums ${
                        t.refund > 0 ? 'text-emerald-700' : t.refund < 0 ? 'text-rose-700' : 'text-gray-400'
                      }`}>
                        {t.refund === 0
                          ? '—'
                          : `${t.refund < 0 ? '− ' : ''}${fmtMoney(Math.abs(t.refund), t.currency)}`}
                      </TableCell>
                      <TableCell className={`text-right text-xs font-semibold tabular-nums ${t.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(t.balance, t.currency)}</TableCell>
                      <TableCell className="text-xs uppercase text-gray-500">{t.currency}</TableCell>
                    </TableRow>
                  ))}
                </TableFooter>
              )}
            </Table>
          </div>
          {visibleRows.length > 0 && (
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

      {createOpen && (
        <CashAdvanceFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          purposes={purposes}
          onPurposesChanged={loadPurposes}
          onSaved={() => { setCreateOpen(false); void load(); }}
        />
      )}

      <CashAdvancePurposesDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onChanged={() => void loadPurposes()}
      />

      {detail && (
        <CashAdvanceDetailDialog
          advanceId={detail.id}
          onClose={() => setDetail(null)}
          onChanged={() => { void load(); }}
        />
      )}
    </div>
  );
}

/* ====================================================================
   Create / Edit dialog
   ==================================================================== */

function CashAdvanceFormDialog({
  open, onOpenChange, onSaved, editing, purposes, onPurposesChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  editing?: cashAdvancesApi.CashAdvance;
  /** Preset Purpose labels managed via the Settings popup. Only
   *  enabled rows are surfaced — the operator can still type a
   *  free-text value that isn't on the list. */
  purposes: cashAdvancePurposesApi.CashAdvancePurpose[];
  /** Re-read the presets after the picker creates one inline, so the
   *  parent list (and the next open of this dialog) sees it. */
  onPurposesChanged: () => Promise<void>;
}) {
  const [employees, setEmployees] = useState<employeesApi.Employee[]>([]);
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? '');
  const [purpose, setPurpose] = useState(editing?.purpose ?? '');
  /**
   * Picker options = enabled presets, plus the currently-held value
   * when it isn't one of them.
   *
   * That last part matters: SearchablePicker resolves its trigger
   * label by finding `value` in `options`, so editing an advance
   * whose purpose was typed free-hand (or whose preset was since
   * disabled or deleted) would render an empty-looking field over a
   * purpose that is in fact still set — and saving would look like it
   * had silently dropped it.
   */
  const purposeOptions = useMemo(() => {
    const enabled = purposes.filter(p => p.enabled);
    const opts = enabled.map(p => ({ value: p.label, label: p.label }));
    const held = purpose.trim();
    if (held && !enabled.some(p => p.label === held)) {
      opts.unshift({ value: held, label: held });
    }
    return opts;
  }, [purposes, purpose]);
  const [amount, setAmount] = useState(String(editing?.advanceAmount ?? ''));
  const [currency, setCurrency] = useState(editing?.currency ?? 'USD');
  const [remarks, setRemarks] = useState(editing?.remarks ?? '');
  const [saving, setSaving] = useState(false);
  // Approvers — up to 3, ordered. Only used on create; the backend
  // ignores the field on update to keep the chain stable across
  // routine edits.
  const [users, setUsers] = useState<usersApi.User[]>([]);
  const [approver1, setApprover1] = useState('');
  const [approver2, setApprover2] = useState('');
  const [approver3, setApprover3] = useState('');
  // Tenant currency settings — hide the picker when only one currency
  // is enabled (single-currency tenant has nothing to pick). Refetched
  // on each open so a currency change made via Settings picks up.
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  useEffect(() => {
    if (!open) return;
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, [open]);
  const currencyOptions = currencyApi.enabledCurrencies(currencySettings);
  // When settings arrive after form open, pin the currency to the
  // tenant primary — unless we're editing an existing row (respect
  // the saved currency snapshot).
  useEffect(() => {
    if (!open || editing || !currencySettings) return;
    setCurrency(currencySettings.primaryCurrency);
  }, [open, editing, currencySettings]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await employeesApi.list({ size: 500 });
        setEmployees(res.content ?? []);
      } catch {
        // Silent — operator can still type employee id by hand if list 403s.
      }
    })();
    // Users list feeds the Approver dropdowns. 403 silently → no
    // approver picker options; the operator can still create the
    // advance without approvers (draft → disburse flow proceeds).
    void (async () => {
      try {
        const res = await usersApi.list({ size: 500 });
        setUsers(res.data ?? []);
      } catch {
        setUsers([]);
      }
    })();
  }, [open]);

  const save = async () => {
    if (!employeeId || !purpose.trim() || !amount) {
      toast.error('Employee, purpose, and amount are required');
      return;
    }
    setSaving(true);
    try {
      // Preserve entry order, drop blanks, dedup — backend also caps
      // at ApprovalService.MAX_MANUAL_APPROVERS (3) but this keeps the
      // wire payload tidy.
      const orderedApprovers: string[] = [];
      const seen = new Set<string>();
      for (const raw of [approver1, approver2, approver3]) {
        const v = raw?.trim();
        if (!v || seen.has(v)) continue;
        seen.add(v);
        orderedApprovers.push(v);
      }
      const req: cashAdvancesApi.CreateRequest = {
        employeeId,
        purpose: purpose.trim(),
        advanceAmount: Number(amount) || 0,
        currency,
        remarks: remarks || undefined,
        // Only send on create — the backend ignores it on update.
        ...(editing ? {} : { approverUserIds: orderedApprovers.length > 0 ? orderedApprovers : undefined }),
      };
      if (editing) await cashAdvancesApi.update(editing.id, req);
      else         await cashAdvancesApi.create(req);
      toast.success(editing ? 'Cash advance updated' : 'Cash advance created');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            {editing ? 'Edit Cash Advance' : 'New Cash Advance'}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Cash Advance description"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                Draft a cash advance for an employee. Money doesn't move until you Disburse.
              </TooltipContent>
            </Tooltip>
          </DialogTitle>
          {/* DialogDescription kept sr-only for a11y — Radix warns when
              a DialogContent has no description. */}
          <DialogDescription className="sr-only">
            Draft a cash advance for an employee. Money doesn't move until you Disburse.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Employee</Label>
            <SearchablePicker
              value={employeeId}
              onChange={setEmployeeId}
              placeholder="Pick an employee"
              searchPlaceholder="Search by name or employee no…"
              allowClear={false}
              options={employees.map(e => ({
                value: e.id,
                label: e.name,
                secondary: e.empNo,
                // Name AND emp no both feed the fuzzy match so the
                // operator can search either way.
                searchKey: `${e.name} ${e.empNo}`,
              }))}
            />
          </div>
          {/* Purpose — the same SearchablePicker the Bill / Invoice /
              Receipt forms use, replacing the old `datalist` over a
              plain Input. The datalist shape looked like a combobox
              but wasn't one: no visible dropdown affordance, browser-
              dependent rendering, no inline "add this" step, and
              nothing telling the operator whether what they typed was
              a preset or a brand-new value. */}
          <div className="space-y-1">
            <Label className="text-xs">Purpose</Label>
            <SearchablePicker
              value={purpose}
              onChange={setPurpose}
              // Required field (see save()'s !purpose.trim() guard),
              // so no None row — the trigger shows the placeholder.
              allowClear={false}
              placeholder='Pick or type a purpose — e.g. "Site visit"'
              searchPlaceholder="Search or type a new purpose…"
              emptyResultsLabel="No match — type a new purpose to add."
              createLabel={q => `Add "${q}" as a new purpose`}
              emptyOptionsHint={
                <p className="px-2 py-1.5 text-[11px] text-gray-500">
                  No presets yet — type one and it&rsquo;s saved for next time,
                  or manage the whole list from the gear icon on the Cash
                  Advance page.
                </p>
              }
              onCreate={async label => {
                const trimmed = label.trim();
                // Bill purposes materialise as options by themselves
                // (listPurposes reads distinct used values), but cash
                // advance presets are a real table — so persist, to
                // land in the same place: what you typed once is there
                // next time. `advance.purpose` stays free text, so a
                // failed POST still lets the advance be created with
                // the typed value.
                try {
                  const created = await cashAdvancePurposesApi.create({ label: trimmed });
                  await onPurposesChanged();
                  return { value: created.label, label: created.label };
                } catch {
                  toast.error(`Saved "${trimmed}" on this advance, but couldn't add it to the presets`);
                  return { value: trimmed, label: trimmed };
                }
              }}
              options={purposeOptions}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Amount</Label>
              <Input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="text-right" />
            </div>
            {/* Picker hidden on single-currency tenants — currency is
                pinned to the primary. Gated on `currencySettings`
                being loaded to avoid a brief USD/KHR flash from the
                enabledCurrencies fallback while the fetch is in flight. */}
            {currencySettings && currencyOptions.length > 1 && (
              <div className="space-y-1">
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
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Remarks</Label>
            <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional notes" rows={2} />
          </div>
          {/* Approvers — manual-assign chain (V172). Optional: leave
              blank and the advance skips approval, going straight to
              the existing draft → disburse flow. Only shown on create;
              editing an existing advance doesn't re-spawn the chain. */}
          {!editing && (
            <div className="space-y-2 rounded-md border border-dashed border-gray-200 p-3 bg-gray-50/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-medium">Approvers (optional, ordered — up to 3)</Label>
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
                      Leave blank to skip approval. Otherwise the advance waits until each picked approver acts, in order.
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
              ].map((slot, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 w-6 shrink-0">{slot.label}</span>
                  <div className="flex-1">
                    <SearchablePicker
                      value={slot.value}
                      onChange={slot.set}
                      placeholder="— none —"
                      emptyLabel="— none —"
                      searchPlaceholder="Search users by name, email, or role…"
                      options={users
                        .filter(u => u.isActive)
                        // Exclude users already picked in other slots.
                        .filter(u => u.id !== approver1 || slot.value === approver1)
                        .filter(u => u.id !== approver2 || slot.value === approver2)
                        .filter(u => u.id !== approver3 || slot.value === approver3)
                        .map(u => ({
                          value: u.id,
                          // V140 — prefer the display name; null falls
                          // back to email, same precedence User.name's
                          // own doc comment declares.
                          label: u.name || u.email,
                          secondary: u.role,
                          searchKey: `${u.name ?? ''} ${u.email} ${u.role}`,
                        }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : (editing ? 'Save' : 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ====================================================================
   Detail dialog — workflow actions + expense receipts
   ==================================================================== */

function CashAdvanceDetailDialog({
  advanceId, onClose, onChanged,
}: {
  advanceId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { formatDate } = useDateFormat();
  const confirm = useConfirm();
  const [advance, setAdvance] = useState<cashAdvancesApi.CashAdvance | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCategory, setNewCategory] = useState('hotel');
  const [newReceiptNo, setNewReceiptNo] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Receipt No options — feeds the same SearchablePicker the create
  // dialog uses for Purpose. Not a real FK: this manual row's
  // receiptNo stays free text, the list is purely so the operator can
  // pick an existing Expense's number instead of retyping it.
  // Progress-only (still outstanding) — matches Receipts.tsx's own
  // STATUS_LABEL collapse of legacy 'draft'/'issued' into "progress";
  // pending/paid/void are excluded since there's nothing left to do
  // with those from here.
  const [receipts, setReceipts] = useState<receiptsApi.Receipt[]>([]);
  const [vendorNameById, setVendorNameById] = useState<Record<string, string>>({});
  /** Free-text references typed into the picker this session. Held so
   *  the trigger can render them — SearchablePicker resolves its label
   *  by finding `value` in `options`, so a manual reference that isn't
   *  an option would show as an empty field. Not persisted: a manual
   *  line's receiptNo is free text, not an FK. */
  const [manualReceiptNos, setManualReceiptNos] = useState<string[]>([]);

  /**
   * Receipt-No picker options: every outstanding expense (vendor as
   * the secondary line, outstanding balance as a trailing chip), then
   * any manual reference typed this session, then — defensively — the
   * held value if it's neither. Ordered so the rows that actually do
   * something (settle a real expense) come first.
   *
   * Lives up here with the other hooks, ABOVE this component's
   * `if (!advance) return null` bail-out. Below it, the hook only runs
   * once the fetch lands, which changes the hook count between renders
   * and throws "Rendered more hooks than during the previous render".
   */
  const receiptNoOptions = useMemo(() => {
    const opts = receipts.map(r => {
      const vendor = vendorNameById[r.vendorId] ?? 'Unknown vendor';
      const remaining = Math.max(0, Number(r.amount) - Math.abs(Number(r.paidAmount)));
      return {
        value: r.receiptNo,
        label: r.receiptNo,
        secondary: vendor,
        trailing: (
          <span className="text-[11px] tabular-nums text-gray-500">
            {fmtMoney(remaining, r.currency)} left
          </span>
        ),
        searchKey: `${r.receiptNo} ${vendor}`,
      };
    });
    const known = new Set(opts.map(o => o.value));
    for (const m of manualReceiptNos) {
      if (!known.has(m)) { opts.push({ value: m, label: m, secondary: 'manual reference' } as typeof opts[number]); known.add(m); }
    }
    const held = newReceiptNo.trim();
    if (held && !known.has(held)) {
      opts.push({ value: held, label: held, secondary: 'manual reference' } as typeof opts[number]);
    }
    return opts;
  }, [receipts, vendorNameById, manualReceiptNos, newReceiptNo]);

  const loadReceiptOptions = async () => {
    try {
      const [receiptPage, vendorPage] = await Promise.all([
        receiptsApi.list({ size: 200 }),
        vendorsApi.list({ size: 500 }),
      ]);
      setReceipts(receiptPage.content.filter(
        r => r.status === 'progress' || r.status === 'draft' || r.status === 'issued',
      ));
      setVendorNameById(Object.fromEntries(vendorPage.content.map(v => [v.id, v.name])));
    } catch {
      // Datalist just stays empty — free-text entry still works.
    }
  };
  useEffect(() => { void loadReceiptOptions(); }, []);

  const load = async () => {
    try {
      const a = await cashAdvancesApi.get(advanceId);
      setAdvance(a);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load cash advance');
      onClose();
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [advanceId]);

  if (!advance) return null;

  const canDisburse = advance.status === 'draft';
  const canSettle   = advance.status === 'disbursed' || advance.status === 'partially_settled';
  const canCancel   = advance.status === 'draft';
  const canAddExpense = advance.status === 'disbursed' || advance.status === 'partially_settled';
  const isTerminal  = advance.status === 'settled' || advance.status === 'cancelled';

  const action = async (fn: () => Promise<unknown>, label: string) => {
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

  // Picking a REAL receipt from the picker (as opposed to typing a
  // free-text reference) means the operator wants to actually settle
  // that Expense from this advance — the same thing Receipts.tsx's own
  // "Record Payment → Method = Cash Advance" dialog does, just
  // initiated from here. So this row routes to the real
  // receiptPayments.create() (method='cash_advance') instead of the
  // free-text cashAdvancesApi.addExpense() whenever the typed Receipt
  // No exactly matches one of the fetched receipts — that's what
  // actually moves the Expense's own status toward Paid, which a
  // disconnected manual note never could.
  const matchedReceipt = receipts.find(r => r.receiptNo === newReceiptNo.trim());

  const submitExpense = async () => {
    if (matchedReceipt) {
      if (!newAmount) { toast.error('Amount required'); return; }
      setBusy(true);
      try {
        await receiptPaymentsApi.create({
          receiptId: matchedReceipt.id,
          amount: Number(newAmount) || 0,
          currency: advance.currency === 'KHR' ? 'KHR' : 'USD',
          method: 'cash_advance',
          direction: 'debit',
          cashAdvanceId: advance.id,
          paymentDate: newDate,
          // Same rule as Receipts.tsx's own Record Payment dialog:
          // a cash-advance-funded payment references the advance
          // itself, not a bank/cheque ref.
          referenceNo: advance.advanceNo,
        });
        setNewReceiptNo(''); setNewAmount('');
        toast.success('Payment recorded');
        await load();
        await loadReceiptOptions();
        onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to record payment');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!newCategory || !newAmount) { toast.error('Category and amount required'); return; }
    setBusy(true);
    try {
      await cashAdvancesApi.addExpense(advance.id, {
        expenseCategory: newCategory,
        receiptNo: newReceiptNo || undefined,
        amount: Number(newAmount) || 0,
        currency: advance.currency,
        expenseDate: newDate,
      });
      setNewReceiptNo(''); setNewAmount('');
      toast.success('Expense recorded');
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add expense');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{advance.advanceNo}</span>
            <Badge variant="outline" className={STATUS_BADGE[advance.status]}>
              {advance.status.replace(/_/g, ' ')}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {advance.employeeName ?? 'Unknown employee'} · {advance.purpose}
          </DialogDescription>
        </DialogHeader>

        {/* Money summary */}
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">Advance</div>
            <div className="font-semibold">{fmtMoney(Number(advance.advanceAmount), advance.currency)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">Expenses</div>
            <div className="font-semibold">{fmtMoney(Number(advance.expenseTotal), advance.currency)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">Balance</div>
            <div className={`font-semibold ${
              Number(advance.balance) > 0 ? 'text-emerald-700'
              : Number(advance.balance) < 0 ? 'text-rose-700'
              : 'text-gray-600'
            }`}>
              {fmtMoney(Number(advance.balance), advance.currency)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              {Number(advance.balance) > 0 ? 'Employee returns'
                : Number(advance.balance) < 0 ? 'Company reimburses'
                : 'Clean'}
            </div>
          </div>
        </div>

        {/* Expense receipts */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Expense receipts</h3>
            <span className="text-xs text-gray-500">{advance.expenses.length} receipt(s)</span>
          </div>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead>Receipt No</TableHead>
                  <TableHead className="text-right w-[120px]">Amount</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {advance.expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-gray-500 py-4">
                      No receipts yet.
                    </TableCell>
                  </TableRow>
                ) : advance.expenses.map(e => {
                  const isSettlement = e.source === 'settlement';
                  return (
                  <TableRow key={e.id} className={isSettlement ? 'bg-emerald-50/30' : ''}>
                    <TableCell className="text-xs">{formatDate(e.expenseDate)}</TableCell>
                    <TableCell className="tabular-nums text-xs">{e.receiptNo ?? '—'}</TableCell>
                    <TableCell className={`text-right tabular-nums ${isSettlement ? 'text-emerald-700 font-semibold' : ''}`}>
                      {Number(e.amount) < 0 ? '− ' : ''}{fmtMoney(Math.abs(Number(e.amount)), e.currency)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {/* A settlement row's own "category" is literally
                          refund/reimbursement — not a spending category
                          at all, so showing it under a Category header
                          reads oddly next to real ones like Hotel/Taxi.
                          The settlement badge alone already says what
                          this row is. */}
                      {!isSettlement && (
                        <span className="capitalize">{e.expenseCategory.replace(/_/g, ' ')}</span>
                      )}
                      {e.source === 'receipt' && (
                        <Badge variant="outline" className="ml-1.5 bg-amber-50 text-amber-700 border-amber-200">
                          from receipt
                        </Badge>
                      )}
                      {isSettlement && (
                        <Badge variant="outline" className="ml-1.5 bg-emerald-100 text-emerald-700 border-emerald-200">
                          settlement
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* Manual rows can be removed from the advance;
                          receipt-funded + settlement rows are derived
                          (delete the receipt or revoke settle from
                          the parent action instead). */}
                      {!isTerminal && e.source === 'manual' && (
                        <Button
                          size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                          disabled={busy}
                          onClick={() => void action(() => cashAdvancesApi.deleteExpense(e.id), 'Receipt deleted')}
                          title="Remove receipt"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Add-receipt inline row — field order matches the table
              above (Date, Receipt No, Amount, Category). No per-row
              Notes here — remarks are common to the whole advance,
              see the Remarks card below instead of a note per line. */}
          {canAddExpense && (
            <div className="grid grid-cols-12 gap-2 items-end pt-1">
              <div className="col-span-2 space-y-1">
                <Label className="text-[11px]">Date</Label>
                <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-3 space-y-1">
                <Label className="text-[11px]">Receipt No</Label>
                {/* Same SearchablePicker as Purpose. This field carries
                    a real branch, which the old datalist hid: picking
                    an existing expense routes the submit through a
                    receipt-payment (Category stops applying and
                    disables), while a typed reference only adds a
                    manual note. The picker makes that visible — a
                    matched row shows its vendor and outstanding
                    balance, a novel one arrives via an explicit
                    "Use … as a manual reference" step. */}
                <SearchablePicker
                  value={newReceiptNo}
                  onChange={v => {
                    setNewReceiptNo(v);
                    // Picking a real receipt pre-fills its own date +
                    // outstanding balance. A manual reference (or a
                    // clear) leaves Date/Amount alone.
                    const match = receipts.find(r => r.receiptNo === v);
                    if (match) {
                      setNewDate(match.issueDate.slice(0, 10));
                      const remaining = Math.max(0, Number(match.amount) - Math.abs(Number(match.paidAmount)));
                      setNewAmount(remaining.toFixed(2));
                    }
                  }}
                  // Optional field, so the None row stays. The trigger
                  // shows a greyed hint rather than "None" — with
                  // allowClear on, `placeholder` never reaches the
                  // trigger, so the hint goes in triggerEmptyLabel.
                  emptyLabel="None"
                  triggerEmptyLabel="Pick or type…"
                  searchPlaceholder="Search or type a receipt no…"
                  emptyResultsLabel="No match — type a number to use it as a manual reference."
                  createLabel={q => `Use "${q}" as a manual reference`}
                  emptyOptionsHint={
                    <p className="px-2 py-1.5 text-[11px] text-gray-500">
                      No outstanding expenses to settle — type a reference to
                      record this as a manual receipt line.
                    </p>
                  }
                  // A typed value isn't persisted anywhere: receiptNo
                  // on a manual expense line is free text, not an FK.
                  // Adopting it locally is the whole job.
                  onCreate={async label => {
                    const trimmed = label.trim();
                    setManualReceiptNos(prev =>
                      prev.includes(trimmed) ? prev : [...prev, trimmed]);
                    return { value: trimmed, label: trimmed };
                  }}
                  // Wider than the 3-col cell so vendor + balance stay
                  // readable instead of clipping.
                  contentClassName="min-w-80"
                  options={receiptNoOptions}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-[11px]">Amount</Label>
                <Input type="number" min={0} step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)} className="h-9 text-sm text-right" />
              </div>
              <div className="col-span-4 space-y-1">
                <Label className="text-[11px]">Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory} disabled={!!matchedReceipt}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMMON_EXPENSE_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1">
                <Button size="sm" className="h-9 w-full" disabled={busy} onClick={() => void submitExpense()}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Remarks — one common note for the whole advance (set at
            creation), shown here instead of a note per expense row. */}
        {advance.remarks && (
          <div className="rounded-md border p-3 space-y-1">
            <div className="text-xs uppercase tracking-wide text-gray-500">Remarks</div>
            <div className="text-sm whitespace-pre-wrap">{advance.remarks}</div>
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          {canCancel && (
            <Button variant="outline" size="sm" className="text-rose-700" disabled={busy}
              onClick={async () => {
                if (!(await confirm({
                  title: 'Cancel this draft advance?',
                  message: 'This is permanent — the advance can\'t be re-opened.',
                  variant: 'destructive',
                  confirmLabel: 'Cancel advance',
                }))) return;
                void action(() => cashAdvancesApi.cancel(advance.id), 'Cancelled');
              }}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Cancel advance
            </Button>
          )}
          {canDisburse && (
            <Button variant="default" size="sm" disabled={busy}
              onClick={async () => {
                if (!(await confirm({
                  title: `Disburse ${fmtMoney(Number(advance.advanceAmount), advance.currency)} to ${advance.employeeName ?? 'this employee'}?`,
                  message: 'This writes an OUT row to the Transactions ledger.',
                  confirmLabel: 'Disburse',
                }))) return;
                void action(() => cashAdvancesApi.disburse(advance.id), 'Disbursed');
              }}
            >
              <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />
              Disburse
            </Button>
          )}
          {canSettle && (
            <Button variant="default" size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy}
              onClick={async () => {
                const label = Number(advance.balance) > 0 ? `Employee returns ${fmtMoney(Number(advance.balance), advance.currency)}`
                  : Number(advance.balance) < 0 ? `Company reimburses ${fmtMoney(Math.abs(Number(advance.balance)), advance.currency)}`
                  : 'Clean settlement — no transaction';
                if (!(await confirm({
                  title: 'Settle this advance?',
                  message: label + '.',
                  confirmLabel: 'Settle',
                }))) return;
                void action(() => cashAdvancesApi.settle(advance.id), 'Settled');
              }}
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Settle
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
