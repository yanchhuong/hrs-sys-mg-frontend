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
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import * as cashAdvancesApi from '../../api/cashAdvances';
import * as cashAdvancePurposesApi from '../../api/cashAdvancePurposes';
import * as employeesApi from '../../api/employees';
import * as currencyApi from '../../api/currencySettings';
import * as usersApi from '../../api/users';
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
      <div className="flex items-start justify-between gap-4">
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
              pages so the filter UI feels the same across the app. */}
          <div className="flex items-center gap-2 flex-wrap">
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
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-36 text-sm" />
            <Label className="text-xs text-gray-500">To</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-36 text-sm" />
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
  open, onOpenChange, onSaved, editing, purposes,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  editing?: cashAdvancesApi.CashAdvance;
  /** Preset Purpose labels managed via the Settings popup. Only
   *  enabled rows are surfaced — the operator can still type a
   *  free-text value that isn't on the list. */
  purposes: cashAdvancePurposesApi.CashAdvancePurpose[];
}) {
  const [employees, setEmployees] = useState<employeesApi.Employee[]>([]);
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? '');
  const [purpose, setPurpose] = useState(editing?.purpose ?? '');
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
        setUsers(res.content ?? []);
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
          <DialogTitle>{editing ? 'Edit Cash Advance' : 'New Cash Advance'}</DialogTitle>
          <DialogDescription>
            Draft a cash advance for an employee. Money doesn't move until you Disburse.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Pick an employee" /></SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.name} ({e.empNo})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Purpose</Label>
            <div className="flex items-center gap-2">
              {/* List input gets a `datalist` so the operator sees
                  the preset options as suggestions while still being
                  able to type a free-text purpose — the simplest
                  Combobox shape that doesn't require a popover. */}
              <Input
                list="cash-advance-purpose-presets"
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
                placeholder="Pick from list or type a new purpose"
              />
              <datalist id="cash-advance-purpose-presets">
                {purposes.filter(p => p.enabled).map(p => (
                  <option key={p.id} value={p.label} />
                ))}
              </datalist>
            </div>
            {purposes.filter(p => p.enabled).length === 0 && (
              <p className="text-[11px] text-gray-500">
                No presets yet — manage them via the gear icon on the Cash Advance page.
              </p>
            )}
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
                <Label className="text-xs font-medium">Approvers (optional, ordered — up to 3)</Label>
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
              <p className="text-[11px] text-gray-500">
                Leave blank to skip approval. Otherwise the advance waits until each picked approver acts, in order.
              </p>
              {[
                { label: '1st', value: approver1, set: setApprover1 },
                { label: '2nd', value: approver2, set: setApprover2 },
                { label: '3rd', value: approver3, set: setApprover3 },
              ].map((slot, idx) => (
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
  const [newNotes, setNewNotes] = useState('');

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

  const submitExpense = async () => {
    if (!newCategory || !newAmount) { toast.error('Category and amount required'); return; }
    setBusy(true);
    try {
      await cashAdvancesApi.addExpense(advance.id, {
        expenseCategory: newCategory,
        receiptNo: newReceiptNo || undefined,
        amount: Number(newAmount) || 0,
        currency: advance.currency,
        expenseDate: newDate,
        notes: newNotes || undefined,
      });
      setNewReceiptNo(''); setNewAmount(''); setNewNotes('');
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
                  <TableHead>Category</TableHead>
                  <TableHead>Receipt No</TableHead>
                  <TableHead className="text-right w-[120px]">Amount</TableHead>
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
                    <TableCell className="text-sm">
                      <span className="capitalize">{e.expenseCategory.replace(/_/g, ' ')}</span>
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
                    <TableCell className="tabular-nums text-xs">{e.receiptNo ?? '—'}</TableCell>
                    <TableCell className={`text-right tabular-nums ${isSettlement ? 'text-emerald-700 font-semibold' : ''}`}>
                      {Number(e.amount) < 0 ? '− ' : ''}{fmtMoney(Math.abs(Number(e.amount)), e.currency)}
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

          {/* Add-receipt inline row */}
          {canAddExpense && (
            <div className="grid grid-cols-12 gap-2 items-end pt-1">
              <div className="col-span-3 space-y-1">
                <Label className="text-[11px]">Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMMON_EXPENSE_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-[11px]">Receipt No</Label>
                <Input value={newReceiptNo} onChange={e => setNewReceiptNo(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-[11px]">Amount</Label>
                <Input type="number" min={0} step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)} className="h-9 text-sm text-right" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-[11px]">Date</Label>
                <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-[11px]">Notes</Label>
                <Input value={newNotes} onChange={e => setNewNotes(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-1">
                <Button size="sm" className="h-9 w-full" disabled={busy} onClick={() => void submitExpense()}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

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
