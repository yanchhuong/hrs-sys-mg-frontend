import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Pagination } from '../common/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { DateInput } from '../common/DateInput';
import { SearchablePicker } from '../common/SearchablePicker';
import { toast } from 'sonner';
import { Plus, Search, Eye, Ban, Trash2, FileText, DollarSign, Calendar, Info, Settings } from 'lucide-react';
import { PaymentPlanItemsDialog } from '../common/PaymentPlanItemsDialog';
import * as paymentPlanItemsApi from '../../api/paymentPlanItems';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { format, addDays, addWeeks, addMonths, addYears } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { formatMoney } from '../../utils/format';
import * as paymentPlansApi from '../../api/paymentPlans';
import * as customersApi from '../../api/customers';
import * as invoicesApi from '../../api/invoices';
import { PaymentPlanDetailDialog } from '../common/PaymentPlanDetailDialog';

type PlanRow = paymentPlansApi.PaymentPlan;

const STATUS_BADGE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-700 hover:bg-gray-100',
  active:    'bg-blue-100 text-blue-800 hover:bg-blue-100',
  completed: 'bg-green-100 text-green-800 hover:bg-green-100',
  cancelled: 'bg-red-100 text-red-800 hover:bg-red-100',
};

const PLAN_TYPE_BADGE: Record<string, string> = {
  installment: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rental:      'bg-amber-50 text-amber-700 border-amber-200',
  loan:        'bg-indigo-50 text-indigo-700 border-indigo-200',
  tuition:     'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  custom:      'bg-slate-50 text-slate-700 border-slate-200',
};

export function PaymentPlans() {
  const { canCreate, canUpdate, canDelete } = useAuth();
  const { formatDate } = useDateFormat();
  const canAdd    = canCreate('payment_plan');
  const canModify = canUpdate('payment_plan');
  const canRemove = canDelete('payment_plan');

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  const [invoices, setInvoices] = useState<invoicesApi.Invoice[]>([]);
  /** Item catalogue — cached at the top level so both the list
   *  table (row.itemId → name lookup) and the CreatePlanDialog
   *  share the same fetch. */
  const [allItems, setAllItems] = useState<paymentPlanItemsApi.PaymentPlanItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<'all' | paymentPlansApi.PlanStatus>('all');
  const [typeFilter,   setTypeFilter]   = useState<'all' | paymentPlansApi.PlanType>('all');
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [detailPlanId, setDetailPlanId] = useState<string | null>(null);
  /** Payment Plan Items catalogue dialog — tenant defines Room /
   *  Utility / Car / House / etc. rows the plan picker will consume. */
  const [itemsSettingsOpen, setItemsSettingsOpen] = useState(false);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const res = await paymentPlansApi.list({ size: 200 });
      setPlans(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load payment plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPlans();
    // Customers + Invoices for the picker in the create dialog.
    // Defensive `?? []` guards against a rejected fetch (connection
    // refused during API restart) or an unexpected response shape —
    // the create dialog reads .slice() on these and would crash if
    // the state ever went undefined.
    void customersApi.list({ size: 500 })
      // Spring PagedResponse uses `content`, not `data` — the old
      // `r?.data` fallback silently returned [] and the picker
      // stayed empty regardless of how many customers existed.
      .then(r => setCustomers(Array.isArray(r?.content) ? r.content : []))
      .catch(() => setCustomers([]));
    void invoicesApi.list({ size: 500 })
      .then(r => setInvoices(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setInvoices([]));
    void paymentPlanItemsApi.list()
      .then(setAllItems)
      .catch(() => setAllItems([]));
  }, []);
  const itemsById = useMemo(
    () => new Map(allItems.map(i => [i.id, i])),
    [allItems],
  );

  const statusCounts = useMemo(() => ({
    all:       plans.length,
    draft:     plans.filter(p => p.status === 'draft').length,
    active:    plans.filter(p => p.status === 'active').length,
    completed: plans.filter(p => p.status === 'completed').length,
    cancelled: plans.filter(p => p.status === 'cancelled').length,
  }), [plans]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (typeFilter   !== 'all' && p.planType !== typeFilter) return false;
      if (q) {
        const hay = `${p.planNo} ${p.customerName ?? ''} ${p.invoiceNo ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [plans, statusFilter, typeFilter, search]);

  const pagination = usePagination(filtered, 15);
  useEffect(() => { pagination.resetPage(); }, [statusFilter, typeFilter, search]);

  const handleCancel = async (plan: PlanRow) => {
    if (!confirm(`Cancel plan ${plan.planNo}? Recorded payments stay on the row; no new payments will be accepted.`)) return;
    try {
      await paymentPlansApi.cancel(plan.id);
      toast.success('Plan cancelled');
      await loadPlans();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    }
  };

  const handleDelete = async (plan: PlanRow) => {
    if (!confirm(`Delete draft plan ${plan.planNo}? This wipes the schedule too. Cannot be undone.`)) return;
    try {
      await paymentPlansApi.remove(plan.id);
      toast.success('Plan deleted');
      await loadPlans();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold inline-flex items-center gap-2">
            Payment Plans
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Installment, rental, loan, and tuition schedules — one plan holds many expected payments.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Settings gear — opens the Payment Plan Items catalogue.
              Sits left of New Plan so the operator can curate the
              picker options BEFORE writing a plan against them. */}
          <Button
            variant="outline"
            size="icon"
            title="Payment Plan settings — items catalogue + Telegram reminders"
            onClick={() => setItemsSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
          {canAdd && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Plan
                </Button>
              </DialogTrigger>
              <CreatePlanDialogContent
                customers={customers}
                invoices={invoices}
                onSaved={() => { setCreateOpen(false); void loadPlans(); }}
              />
            </Dialog>
          )}
        </div>
      </div>
      <PaymentPlanItemsDialog open={itemsSettingsOpen} onOpenChange={setItemsSettingsOpen} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search plan #, customer, invoice #"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={v => setTypeFilter(v as any)}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {(Object.entries(paymentPlansApi.PLAN_TYPE_LABELS) as [paymentPlansApi.PlanType, string][])
                  .map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All <Badge variant="secondary" className="ml-2">{statusCounts.all}</Badge></TabsTrigger>
              <TabsTrigger value="draft">Draft <Badge variant="secondary" className="ml-2">{statusCounts.draft}</Badge></TabsTrigger>
              <TabsTrigger value="active">Active <Badge variant="secondary" className="ml-2">{statusCounts.active}</Badge></TabsTrigger>
              <TabsTrigger value="completed">Completed <Badge variant="secondary" className="ml-2">{statusCounts.completed}</Badge></TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled <Badge variant="secondary" className="ml-2">{statusCounts.cancelled}</Badge></TabsTrigger>
            </TabsList>
          </Tabs>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan #</TableHead>
                <TableHead>Customer / Invoice</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Next Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={13} className="text-center text-sm text-gray-400 py-10">Loading…</TableCell></TableRow>
              )}
              {!loading && pagination.paginatedItems.length === 0 && (
                <TableRow><TableCell colSpan={13} className="text-center text-sm text-gray-400 py-10">
                  {plans.length === 0 ? 'No plans yet. Click "New Plan" to start.' : 'No plans match the filters.'}
                </TableCell></TableRow>
              )}
              {pagination.paginatedItems.map(p => {
                const progress = p.numberOfTerms > 0
                  ? Math.round((p.paidInstallments / p.numberOfTerms) * 100)
                  : 0;
                return (
                  <TableRow key={p.id} className={p.overdueInstallments > 0 ? 'bg-red-50/40' : ''}>
                    <TableCell className="font-mono text-sm">{p.planNo}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{p.customerName ?? '—'}</div>
                      {/* Phone joined from the local customers state
                          — plan DTO carries customerId but not phone,
                          so the FE resolves it here instead of a BE
                          denormalisation round-trip. */}
                      {(() => {
                        const phone = customers.find(c => c.id === p.customerId)?.phone;
                        return phone ? (
                          <div className="text-[11px] text-gray-500">{phone}</div>
                        ) : null;
                      })()}
                      {p.invoiceNo && (
                        <div className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" />{p.invoiceNo}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={PLAN_TYPE_BADGE[p.planType] ?? ''}>
                        {paymentPlansApi.PLAN_TYPE_LABELS[p.planType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.itemId ? (
                        (() => {
                          const it = itemsById.get(p.itemId);
                          if (!it) return <span className="text-gray-400 italic">deleted</span>;
                          return (
                            <div>
                              <div className="text-gray-800">{it.name}</div>
                              {it.price != null && (
                                <div className="text-[11px] text-gray-500 tabular-nums">${Number(it.price).toFixed(2)}</div>
                              )}
                            </div>
                          );
                        })()
                      ) : <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">${formatMoney(p.totalAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-green-700">${formatMoney(p.totalPaid)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">${formatMoney(p.outstanding)}</TableCell>
                    <TableCell className="text-sm text-gray-700 whitespace-nowrap">
                      {p.startDate ? formatDate(p.startDate) : <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-gray-700 whitespace-nowrap">
                      {p.endDate ? formatDate(p.endDate) : <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full ${progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-gray-600 tabular-nums">{p.paidInstallments}/{p.numberOfTerms}</span>
                      </div>
                      {p.overdueInstallments > 0 && (
                        <div className="text-[10px] text-red-700 mt-0.5">
                          {p.overdueInstallments} overdue
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.nextDueDate ? (
                        <div>
                          <div className="text-gray-700">{formatDate(p.nextDueDate)}</div>
                          <div className="text-[11px] text-gray-500 tabular-nums">${formatMoney(p.nextDueAmount ?? 0)}</div>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_BADGE[p.status]}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1 flex-nowrap">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetailPlanId(p.id)} title="View schedule">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canModify && p.status !== 'cancelled' && p.status !== 'completed' && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700" onClick={() => handleCancel(p)} title="Cancel plan">
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                        {canRemove && p.status === 'draft' && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700" onClick={() => handleDelete(p)} title="Delete draft">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            onPageChange={pagination.goToPage}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            totalItems={pagination.totalItems}
          />
        </CardContent>
      </Card>

      <PaymentPlanDetailDialog
        planId={detailPlanId}
        onClose={() => setDetailPlanId(null)}
        onChanged={() => void loadPlans()}
      />
    </div>
  );
}

/* ==================================================================
 *  Create dialog
 * ================================================================== */

function CreatePlanDialogContent({
  customers, invoices, onSaved,
}: {
  customers: customersApi.Customer[];
  invoices: invoicesApi.Invoice[];
  onSaved: () => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [planType, setPlanType] = useState<paymentPlansApi.PlanType>('installment');
  const [totalAmount, setTotalAmount] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [numberOfTerms, setNumberOfTerms] = useState('12');
  const [interestRate, setInterestRate] = useState('0');
  const [interestRateMode, setInterestRateMode] = useState<paymentPlansApi.InterestRateMode>('annual');
  const [itemId, setItemId] = useState('');
  const [items, setItems] = useState<paymentPlanItemsApi.PaymentPlanItem[]>([]);
  const [frequency, setFrequency] = useState<paymentPlansApi.PlanFrequency>('monthly');
  const [startDate, setStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  // Auto-fill total from picked invoice.
  useEffect(() => {
    if (!invoiceId) return;
    const inv = invoices.find(i => i.id === invoiceId);
    if (inv) {
      setTotalAmount(String(inv.total ?? inv.grandTotal ?? ''));
      if (inv.customerId) setCustomerId(inv.customerId);
    }
  }, [invoiceId, invoices]);

  // Fetch the full item catalogue once on mount. Items are now
  // cross-plan (the catalogue is a single flat list), so the picker
  // shows every active row regardless of the currently-selected
  // Plan Type. Reset itemId if a stale ID isn't in the returned set.
  useEffect(() => {
    let cancelled = false;
    paymentPlanItemsApi.list()
      .then(rows => {
        if (cancelled) return;
        const active = rows.filter(r => r.active);
        setItems(active);
        setItemId(prev => (active.some(r => r.id === prev) ? prev : ''));
      })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, []);

  const financed = useMemo(() => {
    const t = Number(totalAmount) || 0;
    const d = Number(downPayment) || 0;
    return Math.max(0, t - d);
  }, [totalAmount, downPayment]);

  const perTermPreview = useMemo(() => {
    const n = Number(numberOfTerms) || 0;
    if (n <= 0 || financed <= 0) return 0;
    if (planType === 'loan' && Number(interestRate) > 0) {
      const periodsPerYear = frequency === 'weekly' ? 52
                          : frequency === 'biweekly' ? 26
                          : frequency === 'quarterly' ? 4
                          : frequency === 'yearly' ? 1 : 12;
      // Mirror the BE: monthly-mode rate gets annualised (× 12)
      // before being spread across the payment frequency.
      const annualised = interestRateMode === 'monthly'
        ? Number(interestRate) * 12
        : Number(interestRate);
      const r = annualised / 100 / periodsPerYear;
      const denom = Math.pow(1 + r, n) - 1;
      if (denom <= 0) return 0;
      return (financed * r * Math.pow(1 + r, n)) / denom;
    }
    return financed / n;
  }, [financed, numberOfTerms, planType, interestRate, interestRateMode, frequency]);

  /** Maturity date = last installment's due date. Mirrors the BE
   *  schedule generator: row 1 lands on startDate, row N lands on
   *  startDate + (N − 1) × step. Empty string when either input is
   *  missing so the display gracefully collapses to "—". */
  const maturityDate = useMemo(() => {
    const n = Number(numberOfTerms) || 0;
    if (!startDate || n <= 0) return '';
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) return '';
    const steps = n - 1;
    const last =
      frequency === 'weekly'    ? addWeeks(start, steps)
      : frequency === 'biweekly' ? addDays(start, steps * 14)
      : frequency === 'quarterly' ? addMonths(start, steps * 3)
      : frequency === 'yearly'    ? addYears(start, steps)
      :                             addMonths(start, steps);
    return format(last, 'MMM dd, yyyy');
  }, [startDate, numberOfTerms, frequency]);

  /** Rental / Installment plans MUST reference a catalogue item —
   *  the plan's Total Amount is derived from the item's price so a
   *  plan without an item has no auditable source-of-truth. Loan /
   *  Tuition / Custom keep the field optional (the operator enters
   *  Total Amount directly on those). */
  const itemRequired = planType === 'rental' || planType === 'installment';
  const canSave = customerId && Number(totalAmount) > 0 && Number(numberOfTerms) > 0 && startDate
    && !(planType === 'loan' && Number(interestRate) <= 0)
    && !(itemRequired && !itemId);

  /** Save action — two footer buttons feed through the same code
   *  path with different `active` flags: Draft (false) skips
   *  activation, Create Plan (true) saves straight as active. */
  const handleSave = async (active: boolean) => {
    if (itemRequired && !itemId) {
      toast.error(`${paymentPlansApi.PLAN_TYPE_LABELS[planType]} plans require an item`);
      return;
    }
    if (!canSave) return;
    setSaving(true);
    try {
      await paymentPlansApi.create({
        invoiceId: invoiceId || undefined,
        customerId,
        planType,
        totalAmount: Number(totalAmount),
        downPayment: Number(downPayment) || 0,
        numberOfTerms: Number(numberOfTerms),
        interestRate: Number(interestRate) || 0,
        interestRateMode,
        itemId: itemId || null,
        frequency,
        startDate,
        remarks: remarks || undefined,
        activateImmediately: active,
      });
      toast.success(`Plan created — ${active ? 'active' : 'draft'}`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] sm:max-w-6xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="inline-flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-600" />
          New Payment Plan
        </DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>Source Invoice (optional)</Label>
          <Select
            value={invoiceId || 'none'}
            onValueChange={v => setInvoiceId(v === 'none' ? '' : v)}
          >
            <SelectTrigger><SelectValue placeholder="No invoice — standalone plan" /></SelectTrigger>
            <SelectContent>
              {/* Radix rejects empty-string SelectItem values, so we
                  route "no invoice" through the sentinel 'none' and
                  translate back to empty on write. */}
              <SelectItem value="none">— Standalone —</SelectItem>
              {(Array.isArray(invoices) ? invoices : []).slice(0, 100).map(i => (
                <SelectItem key={i.id} value={i.id}>{i.invoiceNo}{i.customerName ? ` · ${i.customerName}` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Customer <span className="text-red-500">*</span></Label>
          {/* Searchable customer picker — the plain Select scaled
              poorly once tenants had 100+ customers. Fuzzy search
              + inline scroll fits the same visual slot. */}
          <SearchablePicker
            value={customerId}
            onChange={setCustomerId}
            options={(Array.isArray(customers) ? customers : []).map(c => ({
              value: c.id,
              label: c.name,
              // Phone rendered muted after the name — helps the
              // operator disambiguate two "Chan Rithy"s in a long
              // customer list.
              secondary: c.phone ?? undefined,
            }))}
            placeholder="Pick a customer"
            searchPlaceholder="Search customers…"
            allowClear={false}
          />
        </div>
        <div className="space-y-1">
          <Label>Plan Type <span className="text-red-500">*</span></Label>
          <Select value={planType} onValueChange={v => setPlanType(v as paymentPlansApi.PlanType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(paymentPlansApi.PLAN_TYPE_LABELS) as [paymentPlansApi.PlanType, string][])
                .map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Frequency <span className="text-red-500">*</span></Label>
          <Select value={frequency} onValueChange={v => setFrequency(v as paymentPlansApi.PlanFrequency)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(paymentPlansApi.FREQUENCY_LABELS) as [paymentPlansApi.PlanFrequency, string][])
                .map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        {/* Item picker — catalogue rows filtered by planType. Optional
            (allowClear so the operator can leave it empty when the
            plan doesn't map to a catalogue row). Falls through to a
            hint when the catalogue for this plan type is empty so
            the operator knows where to add rows. */}
        <div className="col-span-2 space-y-1">
          <Label>Item {itemRequired && <span className="text-red-500">*</span>}</Label>
          {/* Picking an item auto-fills Total Amount from the
              catalogue's Price when the item has one. Empty selection
              leaves the operator's own totalAmount untouched. */}
          <SearchablePicker
            value={itemId}
            onChange={(id) => {
              setItemId(id);
              if (!id) return;
              const picked = items.find(i => i.id === id);
              if (picked?.price != null) setTotalAmount(String(picked.price));
            }}
            options={items.map(i => ({
              value: i.id,
              label: i.name,
              secondary: [
                i.price != null ? `$${Number(i.price).toFixed(2)}` : null,
                i.description ?? null,
              ].filter(Boolean).join(' · ') || undefined,
            }))}
            placeholder={items.length === 0
              ? 'No items yet — add some via the ⚙ Settings button on the Payment Plans page.'
              : itemRequired ? 'Pick an item' : 'Pick an item — optional'}
            searchPlaceholder="Search items…"
            allowClear={!itemRequired}
            disabled={items.length === 0}
          />
        </div>
        {/* Number fields right-align their value — matches the
            common accounting convention (text left, numbers right)
            and lets the totals block below the form line up
            visually with these inputs. */}
        <div className="space-y-1">
          <Label>Total Amount <span className="text-red-500">*</span></Label>
          <Input type="number" step="0.01" min="0" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} className="text-right tabular-nums" />
        </div>
        <div className="space-y-1">
          <Label>Down Payment</Label>
          <Input type="number" step="0.01" min="0" value={downPayment} onChange={e => setDownPayment(e.target.value)} className="text-right tabular-nums" />
        </div>
        <div className="space-y-1">
          <Label># of Terms <span className="text-red-500">*</span></Label>
          <Input type="number" min="1" max="360" value={numberOfTerms} onChange={e => setNumberOfTerms(e.target.value)} className="text-right tabular-nums" />
        </div>
        {/* Interest Rate — input flanked by a small "annual / monthly"
            segmented toggle. Monthly-mode entries get × 12'd on the
            BE (and in the per-term preview above) before being spread
            across the plan frequency, so the operator can enter the
            rate in whichever unit their contract uses. */}
        <div className="space-y-1">
          <Label>
            Interest Rate {planType === 'loan' ? <span className="text-red-500">*</span> : null}
            <span className="text-xs text-gray-500 font-normal ml-1">
              ({interestRateMode === 'monthly' ? 'monthly' : 'annual'} %)
            </span>
          </Label>
          <div className="flex items-stretch gap-1">
            <Input
              type="number" step="0.001" min="0" max="100"
              value={interestRate}
              onChange={e => setInterestRate(e.target.value)}
              disabled={planType !== 'loan'}
              className="text-right tabular-nums flex-1"
            />
            <div
              role="radiogroup"
              aria-label="Interest rate mode"
              className="inline-flex items-center gap-0.5 rounded-md border p-0.5 bg-white shrink-0"
            >
              {(['annual', 'monthly'] as const).map(mode => {
                const active = interestRateMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={planType !== 'loan'}
                    onClick={() => setInterestRateMode(mode)}
                    className={`px-2 h-8 text-[11px] rounded capitalize transition ${
                      active
                        ? 'bg-blue-600 text-white font-medium'
                        : 'text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                  >
                    {mode === 'annual' ? 'Annual' : 'Monthly'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Start Date <span className="text-red-500">*</span></Label>
          <DateInput value={startDate} onChange={v => setStartDate(v ?? '')} className="w-full" />
        </div>
        {/* Maturity Date — computed from Start Date + (# of Terms − 1)
            × frequency. Replaces the old "Activate on save" checkbox;
            activation is now driven by which footer button the
            operator hits (Save Draft vs Create Plan). */}
        <div className="space-y-1">
          <Label>Maturity Date</Label>
          <Input
            value={maturityDate || '—'}
            readOnly
            disabled
            className="bg-gray-50 text-gray-700 cursor-default"
            title="Last installment's due date. Recomputed as Start Date, # of Terms, or Frequency changes."
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Remarks</Label>
          <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} />
        </div>
        <div className="col-span-2 rounded-md border bg-emerald-50/40 p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Financed Amount:</span>
            <span className="font-semibold tabular-nums">${formatMoney(financed)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Approx. per term:</span>
            <span className="font-semibold tabular-nums text-emerald-700">${formatMoney(perTermPreview)}</span>
          </div>
          <div className="text-[11px] text-gray-500 inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            First due {startDate ? format(new Date(startDate), 'MMM dd, yyyy') : '—'}, then every {paymentPlansApi.FREQUENCY_LABELS[frequency].toLowerCase()}.
          </div>
        </div>
      </div>
      <DialogFooter className="gap-2">
        {/* Two save paths on the footer — Draft (outline) skips
            activation so the plan lands as status='draft'; Create
            Plan (primary) saves as 'active' immediately. */}
        <Button variant="outline" disabled={!canSave || saving} onClick={() => handleSave(false)}>
          {saving ? 'Saving…' : 'Save Draft'}
        </Button>
        <Button disabled={!canSave || saving} onClick={() => handleSave(true)}>
          {saving ? 'Saving…' : 'Create Plan'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
