import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { DateInput } from './DateInput';
import { toast } from 'sonner';
import { DollarSign, ReceiptText, RefreshCw, PlayCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useDateFormat } from '../../context/DateFormatContext';
import { formatMoney } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';
import * as paymentPlansApi from '../../api/paymentPlans';

const SCHEDULE_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  partial: 'bg-amber-100 text-amber-800',
  paid:    'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
};

/**
 * Full-schedule view for a single Payment Plan. Shows the row-by-row
 * installment table, per-row payment log, and inline "Record Payment"
 * form. Reload comes from the plan-list page after every mutation so
 * summary stats stay in sync.
 */
export function PaymentPlanDetailDialog({
  planId, onClose, onChanged,
}: {
  planId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { canCreate, canUpdate } = useAuth();
  const { formatDate } = useDateFormat();
  // V253 retired the `payment_transaction` permission module —
  // recording a payment is now gated on payment_plan.update, matching
  // "if you can change the plan, you can log a receipt against it".
  const canPay      = canUpdate('payment_plan');
  const canActivate = canUpdate('payment_plan');

  const [plan, setPlan] = useState<paymentPlansApi.PaymentPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<paymentPlansApi.PaymentSchedule | null>(null);

  const load = async () => {
    if (!planId) return;
    setLoading(true);
    try {
      setPlan(await paymentPlansApi.get(planId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!planId) { setPlan(null); return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const handleActivate = async () => {
    if (!plan) return;
    try {
      await paymentPlansApi.activate(plan.id);
      toast.success('Plan activated');
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Activate failed');
    }
  };

  return (
    <Dialog open={!!planId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="inline-flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-emerald-600" />
            {plan?.planNo ?? 'Payment Plan'}
            {plan && (
              <Badge className="ml-2">{paymentPlansApi.PLAN_TYPE_LABELS[plan.planType]}</Badge>
            )}
            {plan && (
              <Badge variant="outline" className="ml-1">{plan.status}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Installment schedule and payment log. Payments allocate to the row you record against.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
          {loading || !plan ? (
            <div className="text-sm text-gray-400 italic text-center py-16">Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <SummaryStat label="Customer" value={plan.customerName ?? '—'} />
                <SummaryStat label="Invoice"  value={plan.invoiceNo ?? '—'} />
                <SummaryStat label="Total"    value={`$${formatMoney(plan.totalAmount)}`} />
                <SummaryStat label="Financed" value={`$${formatMoney(plan.financedAmount)}`} />
                <SummaryStat label="Paid"        value={`$${formatMoney(plan.totalPaid)}`}     tone="green" />
                <SummaryStat label="Outstanding" value={`$${formatMoney(plan.outstanding)}`}   tone={plan.outstanding > 0 ? 'red' : 'green'} />
                <SummaryStat label="Terms"       value={`${plan.paidInstallments} / ${plan.numberOfTerms}`} />
                <SummaryStat label="Ends"        value={plan.endDate ? formatDate(plan.endDate) : '—'} />
              </div>

              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Due</TableHead>
                      <TableHead className="text-right">Principal</TableHead>
                      <TableHead className="text-right">Interest</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(plan.schedules ?? []).map(s => (
                      <TableRow key={s.id} className={s.isOverdue ? 'bg-red-50/50' : ''}>
                        <TableCell className="font-mono text-xs">{s.installmentNo}</TableCell>
                        <TableCell className="text-sm">{formatDate(s.dueDate)}</TableCell>
                        <TableCell className="text-right tabular-nums">${formatMoney(s.dueAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums text-gray-600">${formatMoney(s.principal)}</TableCell>
                        <TableCell className="text-right tabular-nums text-gray-500">${formatMoney(s.interest)}</TableCell>
                        <TableCell className="text-right tabular-nums text-green-700">${formatMoney(s.paidAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">${formatMoney(s.balance)}</TableCell>
                        <TableCell>
                          <Badge className={SCHEDULE_BADGE[s.status] ?? ''}>{s.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canPay && s.status !== 'paid' && plan.status !== 'cancelled' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPaymentTarget(s)}>
                              <DollarSign className="h-3.5 w-3.5 mr-1" />
                              Pay
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0 gap-2 sm:justify-between">
          <div className="text-xs text-gray-500">
            {plan?.remarks && <span>Remarks: {plan.remarks}</span>}
          </div>
          <div className="flex gap-2">
            {plan?.status === 'draft' && canActivate && (
              <Button variant="outline" onClick={handleActivate}>
                <PlayCircle className="h-4 w-4 mr-2" />
                Activate
              </Button>
            )}
            <Button variant="outline" onClick={() => load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        </DialogFooter>

        <RecordPaymentDialog
          schedule={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onSaved={() => { setPaymentTarget(null); void load(); onChanged(); }}
        />
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  const cls = tone === 'green' ? 'text-green-700'
            : tone === 'red'   ? 'text-red-700'
            : 'text-gray-900';
  return (
    <div className="rounded-md border bg-white p-2">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`text-sm font-semibold truncate ${cls}`} title={value}>{value}</div>
    </div>
  );
}

/* ================================================================== */

function RecordPaymentDialog({
  schedule, onClose, onSaved,
}: {
  schedule: paymentPlansApi.PaymentSchedule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [paymentDate, setPaymentDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<paymentPlansApi.PaymentMethod>('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!schedule) return;
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    setAmount(String(schedule.balance));
    setPaymentMethod('cash');
    setReferenceNo('');
    setNote('');
  }, [schedule]);

  const handleSave = async () => {
    if (!schedule) return;
    const amt = Number(amount);
    if (!(amt > 0)) { toast.error('Amount must be > 0'); return; }
    if (amt > schedule.balance) {
      toast.error(`Amount exceeds remaining balance ($${schedule.balance})`); return;
    }
    setSaving(true);
    try {
      await paymentPlansApi.recordPayment({
        scheduleId: schedule.id,
        paymentDate,
        amount: amt,
        paymentMethod,
        referenceNo: referenceNo || undefined,
        note: note || undefined,
      });
      toast.success('Payment recorded');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!schedule} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            Record Payment
          </DialogTitle>
          <DialogDescription>
            {schedule
              ? `Installment #${schedule.installmentNo} · balance $${formatMoney(schedule.balance)}`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Payment Date *</Label>
            <DateInput value={paymentDate} onChange={v => setPaymentDate(v ?? '')} className="w-full" />
          </div>
          <div className="space-y-1">
            <Label>Amount *</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Method *</Label>
            <Select value={paymentMethod} onValueChange={v => setPaymentMethod(v as paymentPlansApi.PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(paymentPlansApi.PAYMENT_METHOD_LABELS) as [paymentPlansApi.PaymentMethod, string][])
                  .map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Reference #</Label>
            <Input value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="Receipt / txn id" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Record'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
