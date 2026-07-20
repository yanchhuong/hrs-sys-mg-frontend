import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '../ui/table';
import { DateInput } from './DateInput';
import { toast } from 'sonner';
import { DollarSign, ReceiptText, RefreshCw, PlayCircle, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { useDateFormat } from '../../context/DateFormatContext';
import { formatMoney } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';
import * as paymentPlansApi from '../../api/paymentPlans';
import * as paymentPlanItemsApi from '../../api/paymentPlanItems';
import * as customersApi from '../../api/customers';

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
  /** Row-clicked schedule opened as a bank-style receipt. Not the
   *  same state as {@link paymentTarget} — that one opens the
   *  Record-Payment form; this one just shows a read-only detail. */
  const [viewingSchedule, setViewingSchedule] = useState<paymentPlansApi.PaymentSchedule | null>(null);
  /** Cached item catalogue so the receipt dialog can resolve the
   *  plan's item to a name + price without a second BE hop. */
  const [items, setItems] = useState<paymentPlanItemsApi.PaymentPlanItem[]>([]);
  /** Fetched customer — the plan DTO carries only name; the detail
   *  dialog now surfaces phone / address alongside name. */
  const [customer, setCustomer] = useState<customersApi.Customer | null>(null);

  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    paymentPlanItemsApi.list()
      .then(rows => { if (!cancelled) setItems(rows); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [planId]);

  useEffect(() => {
    // Look up customer detail (phone, address) once the plan is
    // loaded and we know the customerId. Silent-fail — the FE
    // falls back to the plan's denormalised customerName.
    if (!plan?.customerId) { setCustomer(null); return; }
    let cancelled = false;
    customersApi.get(plan.customerId)
      .then(c => { if (!cancelled) setCustomer(c); })
      .catch(() => { if (!cancelled) setCustomer(null); });
    return () => { cancelled = true; };
  }, [plan?.customerId]);
  const planItem = plan?.itemId ? items.find(i => i.id === plan.itemId) ?? null : null;

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

  /** Export the full schedule table as a single-sheet .xlsx. Header
   *  block on top (Plan, Purpose, Customer, totals) so the export
   *  is self-contained — a customer can eyeball it without needing
   *  to open the app to explain the numbers. */
  const handleExportExcel = () => {
    if (!plan) return;
    const purpose = paymentPlansApi.PLAN_TYPE_LABELS[plan.planType] ?? plan.planType;
    const header = [
      ['Payment Plan', plan.planNo],
      ['Purpose',      purpose],
      ['Customer',     plan.customerName ?? ''],
      ['Invoice',      plan.invoiceNo ?? ''],
      ['Status',       plan.status],
      ['Total',        plan.totalAmount],
      ['Down Payment', plan.downPayment],
      ['Financed',     plan.totalAmount - plan.downPayment],
      ['Terms',        `${(plan.schedules ?? []).filter(s => s.status === 'paid').length} / ${plan.schedules?.length ?? 0}`],
      [],
      ['#', 'Due Date', 'Due', 'Principal', 'Interest', 'Paid', 'Balance', 'Status'],
    ];
    const rows = (plan.schedules ?? []).map(s => [
      s.installmentNo, s.dueDate, s.dueAmount, s.principal, s.interest, s.paidAmount, s.balance, s.status,
    ]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([...header, ...rows]);
    // Nudge column widths so the sheet opens looking clean.
    ws['!cols'] = [
      { wch: 6 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
    XLSX.writeFile(wb, `${plan.planNo}-schedule.xlsx`);
    toast.success('Schedule exported');
  };

  return (
    <Dialog open={!!planId} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* shadcn's DialogContent has a baked-in `sm:max-w-lg` cap
       *  (32 rem / ~512 px) — an unqualified `max-w-[…]` doesn't
       *  win because breakpoint variants have higher specificity.
       *  Override at the same sm+ tier and also widen lg+. */}
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] sm:max-w-6xl flex flex-col p-0 gap-0">
        {/* Header — title/badges left, action toolbar right. Right
            edge padded ~40 px so shadcn's built-in absolute-
            positioned Close X (top-4 right-4) doesn't overlap the
            Refresh button. */}
        <DialogHeader className="px-6 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap pr-10">
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
            <div className="flex items-center gap-2">
              {plan?.status === 'draft' && canActivate && (
                <Button variant="outline" size="sm" onClick={handleActivate}>
                  <PlayCircle className="h-4 w-4 mr-1.5" />
                  Activate
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!plan}>
                <Download className="h-4 w-4 mr-1.5" />
                Export Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
          {loading || !plan ? (
            <div className="text-sm text-gray-400 italic text-center py-16">Loading…</div>
          ) : (
            <>
              {/* Summary block — Customer card now spans two columns
                  and carries name + phone + address; Total / Financed
                  / Invoice removed (they're already in the table's
                  totals row). Start / End dates surfaced. */}
              {/* Two-card summary — Customer (name / phone / address
                  / deposit) on the left, plan timeline (terms + date
                  range) on the right. Paid / Outstanding removed;
                  those values live in the schedule table's totals row. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border bg-white p-2">
                  <div className="text-[11px] text-gray-500">Customer</div>
                  <div className="text-sm font-semibold text-gray-900 truncate" title={plan.customerName ?? ''}>
                    {plan.customerName ?? '—'}
                  </div>
                  {(customer?.phone || customer?.address) && (
                    <div className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
                      {customer?.phone && <div>{customer.phone}</div>}
                      {customer?.address && <div className="truncate" title={customer.address}>{customer.address}</div>}
                    </div>
                  )}
                  {/* Deposit (down payment) — moved off its own card
                      onto the customer block so the summary keeps
                      to two tiles total. */}
                  <div className="text-[11px] text-gray-600 mt-1 pt-1 border-t border-gray-100 inline-flex items-center gap-1">
                    <span className="text-gray-500">Deposit:</span>
                    <span className="font-semibold text-gray-800 tabular-nums">
                      ${formatMoney(plan.downPayment)}
                    </span>
                  </div>
                </div>
                {/* Terms + Start + End merged into a single card so
                    the three plan-timeline facts sit together. */}
                <div className="rounded-md border bg-white p-2">
                  <div className="text-[11px] text-gray-500">Terms · Start → End</div>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <div className="text-sm font-semibold text-gray-900 tabular-nums">
                      {plan.paidInstallments} / {plan.numberOfTerms}
                    </div>
                    <div className="text-xs text-gray-600 tabular-nums">
                      {plan.startDate ? formatDate(plan.startDate) : '—'}
                      <span className="mx-1 text-gray-400">→</span>
                      {plan.endDate ? formatDate(plan.endDate) : '—'}
                    </div>
                  </div>
                  {plan.remarks && (
                    <div className="text-[11px] text-gray-600 mt-1 pt-1 border-t border-gray-100 line-clamp-2" title={plan.remarks}>
                      <span className="text-gray-500">Remarks:</span> {plan.remarks}
                    </div>
                  )}
                </div>
              </div>

              {/* Compact schedule table with a totals footer summing
                  Due / Principal / Interest / Paid / Balance across
                  every row. Non-monetary cells (dates, names, status)
                  render "—" in the footer. */}
              <div className="rounded-md border overflow-x-auto">
                <Table className="text-xs [&_th]:px-2 [&_td]:px-2 [&_th]:py-2 [&_td]:py-2">
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="w-10 text-xs">#</TableHead>
                      <TableHead className="text-xs">Due Date</TableHead>
                      <TableHead className="text-right text-xs">Due</TableHead>
                      <TableHead className="text-right text-xs">Principal</TableHead>
                      <TableHead className="text-right text-xs">Interest</TableHead>
                      <TableHead className="text-right text-xs">Paid</TableHead>
                      <TableHead className="text-right text-xs">Balance</TableHead>
                      <TableHead className="text-xs whitespace-nowrap">Paid Date</TableHead>
                      <TableHead className="text-xs">Paid By</TableHead>
                      <TableHead className="text-xs whitespace-nowrap">Send Date</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-right text-xs w-16">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(plan.schedules ?? []).map(s => {
                      // 'pending' → 'Schedule' at the display layer;
                      // 'overdue', 'partial', 'paid' pass through.
                      const statusLabel = s.status === 'pending' ? 'Schedule' : s.status;
                      const sentDate = s.lastReminderSentAt
                        ? new Date(s.lastReminderSentAt).toLocaleDateString()
                        : null;
                      return (
                        <TableRow
                          key={s.id}
                          className={`cursor-pointer hover:bg-gray-50 ${s.isOverdue ? 'bg-red-50/50' : ''}`}
                          onClick={() => setViewingSchedule(s)}
                          title="Click to view installment receipt"
                        >
                          <TableCell className="font-mono">{s.installmentNo}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(s.dueDate)}</TableCell>
                          <TableCell className="text-right tabular-nums whitespace-nowrap">${formatMoney(s.dueAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums text-gray-600 whitespace-nowrap">${formatMoney(s.principal)}</TableCell>
                          <TableCell className="text-right tabular-nums text-gray-500 whitespace-nowrap">${formatMoney(s.interest)}</TableCell>
                          <TableCell className="text-right tabular-nums text-green-700 whitespace-nowrap">${formatMoney(s.paidAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium whitespace-nowrap">${formatMoney(s.balance)}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {s.lastPaidDate
                              ? <span className="text-gray-700">{formatDate(s.lastPaidDate)}</span>
                              : <span className="text-gray-300">—</span>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {s.lastPaidBy
                              ? <span className="text-gray-700">{s.lastPaidBy}</span>
                              : <span className="text-gray-300">—</span>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {sentDate
                              ? <span className="text-gray-700">{sentDate}</span>
                              : <span className="text-gray-300">—</span>}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${SCHEDULE_BADGE[s.status] ?? ''} text-[10px] px-1.5 py-0 capitalize`}>{statusLabel}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {canPay && s.status !== 'paid' && plan.status !== 'cancelled' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                onClick={(e) => { e.stopPropagation(); setPaymentTarget(s); }}
                                title="Record payment"
                              >
                                <DollarSign className="h-3 w-3 mr-0.5" />
                                Pay
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  {/* Totals bar — a proper <tfoot> so it sits below
                      every row semantically, styled bold + gray with
                      a top border to read as a "footer". Empty
                      trailing cells collapsed into one colSpan so the
                      row doesn't look like a run of "—" placeholders. */}
                  {(plan.schedules ?? []).length > 0 && (() => {
                    const s = plan.schedules ?? [];
                    const sum = (pick: (r: paymentPlansApi.PaymentSchedule) => number) =>
                      s.reduce((a, r) => a + (pick(r) || 0), 0);
                    return (
                      <TableFooter className="bg-gray-50 border-t-2 border-gray-200">
                        <TableRow className="font-semibold">
                          <TableCell colSpan={2} className="text-xs text-gray-700">Total</TableCell>
                          <TableCell className="text-right tabular-nums whitespace-nowrap">${formatMoney(sum(r => r.dueAmount))}</TableCell>
                          <TableCell className="text-right tabular-nums whitespace-nowrap">${formatMoney(sum(r => r.principal))}</TableCell>
                          <TableCell className="text-right tabular-nums whitespace-nowrap">${formatMoney(sum(r => r.interest))}</TableCell>
                          <TableCell className="text-right tabular-nums text-green-700 whitespace-nowrap">${formatMoney(sum(r => r.paidAmount))}</TableCell>
                          <TableCell className="text-right tabular-nums whitespace-nowrap">${formatMoney(sum(r => r.balance))}</TableCell>
                          {/* Collapse the five non-monetary columns
                              (Paid Date / Paid By / Send Date /
                              Status / Action) into one spacer so
                              the row doesn't parade "—" marks. */}
                          <TableCell colSpan={5} />
                        </TableRow>
                      </TableFooter>
                    );
                  })()}
                </Table>
              </div>
            </>
          )}
        </div>

        {/* Footer dropped entirely — the built-in top-right X
            closes the dialog and the totals row already reads as
            the natural bottom bar. Remarks are surfaced inside the
            schedule table's Remarks-cell context when relevant. */}

        <RecordPaymentDialog
          schedule={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onSaved={() => { setPaymentTarget(null); void load(); onChanged(); }}
        />

        <ScheduleReceiptDialog
          plan={plan}
          schedule={viewingSchedule}
          item={planItem}
          onClose={() => setViewingSchedule(null)}
          onPay={(s) => {
            setViewingSchedule(null);
            setPaymentTarget(s);
          }}
          canPay={canPay && plan?.status !== 'cancelled'}
          formatDate={formatDate}
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

/* ================================================================== */

/**
 * Bank-style installment receipt. Renders the row-clicked schedule
 * as a compact detail card: big amount hero, dashed divider, and a
 * two-column key / value list underneath (Trx ID, Due Date,
 * Principal, Interest, Paid, Balance, Status). Read-only — the Pay
 * button on the row still opens the record-payment form.
 */
function ScheduleReceiptDialog({
  plan, schedule, item, onClose, onPay, canPay, formatDate,
}: {
  plan: paymentPlansApi.PaymentPlan | null;
  schedule: paymentPlansApi.PaymentSchedule | null;
  item: paymentPlanItemsApi.PaymentPlanItem | null;
  onClose: () => void;
  onPay: (s: paymentPlansApi.PaymentSchedule) => void;
  canPay: boolean;
  formatDate: (iso: string) => string;
}) {
  if (!schedule) return null;
  const outgoing = schedule.paidAmount < schedule.dueAmount; // still owing
  const total    = plan?.schedules?.length ?? 0;
  const statusLabel = schedule.status === 'pending' ? 'Schedule' : schedule.status;
  const paidDate = schedule.lastPaidDate ? formatDate(schedule.lastPaidDate) : null;
  const paidMethod = schedule.lastPaymentMethod
    ? paymentPlansApi.PAYMENT_METHOD_LABELS[schedule.lastPaymentMethod]
    : null;
  return (
    <Dialog open={!!schedule} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        {/* Hero — big amount + status pill on top so the row's
            state is legible without scanning the meta list. Right
            padding reserves ~40 px for shadcn's built-in Close X so
            the status badge never sits underneath it. */}
        <div className="px-6 pt-6 pb-4 pr-14">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <div className="h-14 w-14 rounded-full bg-teal-300 text-white font-bold text-lg flex items-center justify-center">
                #{schedule.installmentNo}
              </div>
              <div className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full flex items-center justify-center text-white text-[11px] ${
                outgoing ? 'bg-red-500' : 'bg-green-500'
              }`}>
                {outgoing ? '↗' : '✓'}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-2xl font-bold tabular-nums ${outgoing ? 'text-black' : 'text-green-700'}`}>
                {outgoing ? '−' : ''}${formatMoney(schedule.balance || schedule.dueAmount)}{' '}
                <span className="text-xs font-semibold text-gray-500 tracking-wide">USD</span>
              </div>
              <div className="text-xs uppercase tracking-widest text-gray-600 mt-1">
                {plan?.customerName ?? 'Customer'}
              </div>
            </div>
            {/* Big status badge — same colour family as the table
                badge but ~1.5× the size for eyeball scanning. */}
            <Badge
              className={`${SCHEDULE_BADGE[schedule.status] ?? ''} text-sm px-3 py-1 capitalize shrink-0`}
            >
              {statusLabel}
            </Badge>
          </div>
        </div>

        {/* Dashed divider — same visual signature as the reference
            receipt so it reads as "one row of the ledger". */}
        <div className="relative">
          <div className="border-t border-dashed border-gray-300 mx-4" />
          <div className="absolute -top-2 -left-2 h-4 w-4 rounded-full bg-white border border-gray-200" />
          <div className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-white border border-gray-200" />
        </div>

        {/* Meta rows — left label, right value. Status moved to the
            hero above; Object (item info) added; Paid amount is now
            a composite of amount · date (method). */}
        <div className="px-6 py-5 space-y-3 text-sm">
          <Row label="Trx. ID:"           value={<span className="font-mono">{schedule.id.slice(0, 12).toUpperCase()}</span>} />
          <Row label="Purpose:"           value={<span className="font-semibold">{plan?.planType ? paymentPlansApi.PLAN_TYPE_LABELS[plan.planType] : '—'}</span>} />
          {/* Object — the catalogue item the plan is written against.
              Shows item name + price + optional description on one
              line; falls back to the plan's raw itemId when the item
              was deleted from the catalogue afterwards. */}
          <Row
            label="Object:"
            value={
              item ? (
                <span className="text-right">
                  <span className="font-semibold">{item.name}</span>
                  {item.price != null && (
                    <span className="text-gray-500 ml-1 tabular-nums">· ${Number(item.price).toFixed(2)}</span>
                  )}
                  {item.description && (
                    <div className="text-[11px] text-gray-500 mt-0.5">{item.description}</div>
                  )}
                </span>
              ) : plan?.itemId ? (
                <span className="text-gray-400 italic">deleted</span>
              ) : (
                <span className="text-gray-300">—</span>
              )
            }
          />
          <Row label="Installment:"       value={<span className="font-semibold">{schedule.installmentNo} of {total || '—'}</span>} />
          <Row label="Due Date:"          value={<span className="font-semibold">{formatDate(schedule.dueDate)}</span>} />
          <Row label="Original amount:"   value={<span className="font-semibold tabular-nums">${formatMoney(schedule.dueAmount)} USD</span>} />
          <Row label="Principal:"         value={<span className="tabular-nums text-gray-700">${formatMoney(schedule.principal)}</span>} />
          <Row label="Interest:"          value={<span className="tabular-nums text-gray-700">${formatMoney(schedule.interest)}</span>} />
          {/* Paid amount row now carries the composite receipt
              string: amount · date (method). All three come from
              the latest transaction booked against this schedule. */}
          <Row
            label="Paid amount | Date:"
            value={
              schedule.paidAmount > 0 ? (
                <span className="tabular-nums font-semibold text-green-700">
                  ${formatMoney(schedule.paidAmount)}
                  {paidDate && <span className="text-gray-600 font-normal ml-1">| {paidDate}</span>}
                  {paidMethod && <span className="text-gray-600 font-normal ml-1">({paidMethod})</span>}
                </span>
              ) : (
                <span className="text-gray-300">—</span>
              )
            }
          />
          <Row label="Balance:"           value={<span className={`tabular-nums font-semibold ${schedule.balance > 0 ? 'text-red-700' : 'text-gray-700'}`}>${formatMoney(schedule.balance)}</span>} />
        </div>

        {/* Footer — Close dropped (built-in X handles it); Record
            Payment only when this schedule is still owing. */}
        {canPay && schedule.status !== 'paid' && (
          <DialogFooter className="px-6 py-3 border-t gap-2">
            <Button onClick={() => onPay(schedule)}>
              <DollarSign className="h-4 w-4 mr-1.5" /> Record payment
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
