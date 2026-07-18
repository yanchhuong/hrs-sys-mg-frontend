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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Pagination } from '../common/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { DateInput } from '../common/DateInput';
import { toast } from 'sonner';
import { Plus, Search, Eye, Ban, Trash2, FileText, DollarSign, Calendar } from 'lucide-react';
import { format } from 'date-fns';
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
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<'all' | paymentPlansApi.PlanStatus>('all');
  const [typeFilter,   setTypeFilter]   = useState<'all' | paymentPlansApi.PlanType>('all');
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [detailPlanId, setDetailPlanId] = useState<string | null>(null);

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
    void customersApi.list({ size: 500 }).then(r => setCustomers(r.data)).catch(() => {});
    void invoicesApi.list({ size: 500 }).then(r => setInvoices(r.data)).catch(() => {});
  }, []);

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
          <h1 className="text-3xl font-bold">Payment Plans</h1>
          <p className="text-sm text-gray-500 mt-1">
            Installment, rental, loan, and tuition schedules — one plan holds many expected payments.
          </p>
        </div>
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
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Next Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={10} className="text-center text-sm text-gray-400 py-10">Loading…</TableCell></TableRow>
              )}
              {!loading && pagination.paginatedItems.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-sm text-gray-400 py-10">
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
                    <TableCell className="text-right tabular-nums">${formatMoney(p.totalAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-green-700">${formatMoney(p.totalPaid)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">${formatMoney(p.outstanding)}</TableCell>
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
  const [frequency, setFrequency] = useState<paymentPlansApi.PlanFrequency>('monthly');
  const [startDate, setStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [remarks, setRemarks] = useState('');
  const [activateImmediately, setActivateImmediately] = useState(true);
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
      const r = Number(interestRate) / 100 / periodsPerYear;
      const denom = Math.pow(1 + r, n) - 1;
      if (denom <= 0) return 0;
      return (financed * r * Math.pow(1 + r, n)) / denom;
    }
    return financed / n;
  }, [financed, numberOfTerms, planType, interestRate, frequency]);

  const canSave = customerId && Number(totalAmount) > 0 && Number(numberOfTerms) > 0 && startDate
    && !(planType === 'loan' && Number(interestRate) <= 0);

  const handleSave = async () => {
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
        frequency,
        startDate,
        remarks: remarks || undefined,
        activateImmediately,
      });
      toast.success(`Plan created — ${activateImmediately ? 'active' : 'draft'}`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="inline-flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-600" />
          New Payment Plan
        </DialogTitle>
        <DialogDescription>
          Set the total, terms, and frequency. The system auto-generates the schedule; loan plans use
          standard amortization (equal payment) with the annual rate you enter.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>Source Invoice (optional)</Label>
          <Select value={invoiceId} onValueChange={setInvoiceId}>
            <SelectTrigger><SelectValue placeholder="No invoice — standalone plan" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— Standalone —</SelectItem>
              {invoices.slice(0, 100).map(i => (
                <SelectItem key={i.id} value={i.id}>{i.invoiceNo}{i.customerName ? ` · ${i.customerName}` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Customer *</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger><SelectValue placeholder="Pick a customer" /></SelectTrigger>
            <SelectContent>
              {customers.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Plan Type *</Label>
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
          <Label>Frequency *</Label>
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
        <div className="space-y-1">
          <Label>Total Amount *</Label>
          <Input type="number" step="0.01" min="0" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Down Payment</Label>
          <Input type="number" step="0.01" min="0" value={downPayment} onChange={e => setDownPayment(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label># of Terms *</Label>
          <Input type="number" min="1" max="360" value={numberOfTerms} onChange={e => setNumberOfTerms(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Interest Rate {planType === 'loan' ? '* (annual %)' : '(annual %)'}</Label>
          <Input type="number" step="0.001" min="0" max="100" value={interestRate} onChange={e => setInterestRate(e.target.value)} disabled={planType !== 'loan'} />
        </div>
        <div className="space-y-1">
          <Label>Start Date *</Label>
          <DateInput value={startDate} onChange={v => setStartDate(v ?? '')} className="w-full" />
        </div>
        <div className="space-y-1 flex items-end">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={activateImmediately} onChange={e => setActivateImmediately(e.target.checked)} className="h-4 w-4" />
            Activate on save
          </label>
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
      <DialogFooter>
        <Button disabled={!canSave || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Create Plan'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
