import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Textarea } from '../ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { CheckCircle2, XCircle, Info, RefreshCw, ClipboardCheck, Clock, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import * as approvalsApi from '../../api/approvals';
import * as quotationsApi from '../../api/quotations';
import * as vouchersApi from '../../api/vouchers';
import * as billsApi from '../../api/bills';
import * as receiptsApi from '../../api/receipts';
import * as customersApi from '../../api/customers';
import * as vendorsApi from '../../api/vendors';
import { useI18n } from '../../i18n/I18nContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { useConfirm } from '../../context/ConfirmContext';

type StatusFilter = 'active' | 'all' | 'pending' | 'approved' | 'rejected';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'active',   label: 'Awaiting me' },
  { value: 'pending',  label: 'In progress' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all',      label: 'All' },
];

/** Human label for the raw `sourceType` string the backend emits. */
function sourceLabel(t: string): string {
  switch (t) {
    case 'cash_advance': return 'Cash Advance';
    case 'leave':        return 'Leave';
    case 'overtime':     return 'Overtime';
    case 'exception':    return 'Attendance Exception';
    // Sale + Purchase chain gates (V172 Phase 3b + V176).
    case 'quotation':    return 'Quotation';
    case 'voucher':      return 'General Voucher';
    case 'bill':         return 'Bill';
    case 'receipt':      return 'Expense';
    // Payroll batch — the legacy per-batch approver flow now also
    // spawns a chain in the unified inbox. V172 Phase 3b.
    case 'payroll_batch': return 'Payroll Batch';
    // Hospital encounter (V182 / v-hospital-api). Chain-gated visits
    // that need physician / admin sign-off before the Medical Bill
    // can be generated.
    case 'encounter':    return 'Encounter';
    default:             return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}

function hoursLabel(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '';
  const suffix = n === 1 ? 'hr' : 'hrs';
  return `${n} ${suffix}`;
}

function money(v: unknown, ccy?: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '';
  const c = typeof ccy === 'string' ? ccy : 'USD';
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}

/**
 * Approval → Inbox (V172). Unified read-only view over every source
 * module's chain — Cash Advance, Leave, Overtime, Attendance
 * Exception, and any future submit-and-await-review flow.
 */
export function Approvals() {
  const { t } = useI18n();
  const { formatDate } = useDateFormat();
  const confirm = useConfirm();
  const [rows, setRows] = useState<approvalsApi.Approval[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [selected, setSelected] = useState<approvalsApi.Approval | null>(null);

  const quickApprove = async (r: approvalsApi.Approval) => {
    if (!(await confirm({
      title: `Approve this ${sourceLabel(r.sourceType).toLowerCase()}?`,
      message: <SummaryCell approval={r} />,
      confirmLabel: 'Approve',
    }))) return;
    try {
      await approvalsApi.decide(r.chainId, { decision: 'approved' });
      toast.success('Approved');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approve failed');
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      setRows(await approvalsApi.pending());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'active':   return rows.filter(r => r.viewerRole === 'active');
      case 'pending':  return rows.filter(r => r.status === 'pending');
      case 'approved': return rows.filter(r => r.status === 'approved' || r.status === 'auto_approved');
      case 'rejected': return rows.filter(r => r.status === 'rejected');
      case 'all':
      default:         return rows;
    }
  }, [rows, filter]);

  const kpis = useMemo(() => ({
    awaiting: rows.filter(r => r.viewerRole === 'active').length,
    inProgress: rows.filter(r => r.status === 'pending' && r.viewerRole !== 'active').length,
    approved: rows.filter(r => r.status === 'approved' || r.status === 'auto_approved').length,
    rejected: rows.filter(r => r.status === 'rejected').length,
  }), [rows]);

  const pagination = usePagination(filtered, 15);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            {t('nav.approvals') || 'Approvals'}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Unified inbox of every request awaiting your sign-off — Cash Advance, Leave, Overtime, and Exceptions. The chain walks your reporting hierarchy; act only on rows tagged "Waiting on you".
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        <KpiCard label="Awaiting you" value={kpis.awaiting} icon={<Clock className="h-5 w-5 text-amber-600" />} tone="amber" />
        <KpiCard label="In progress" value={kpis.inProgress} icon={<ClipboardCheck className="h-5 w-5 text-blue-600" />} tone="blue" />
        <KpiCard label="Approved" value={kpis.approved} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} tone="emerald" />
        <KpiCard label="Rejected" value={kpis.rejected} icon={<XCircle className="h-5 w-5 text-rose-600" />} tone="rose" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-end gap-3 flex-wrap">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
              <TabsList>
                {STATUS_TABS.map(f => (
                  <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Type</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead className="w-[140px]">Requester</TableHead>
                <TableHead className="w-[120px]">Submitted</TableHead>
                <TableHead className="w-[110px] text-center">Progress</TableHead>
                <TableHead className="w-[120px] text-center">Status</TableHead>
                <TableHead className="w-[130px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-gray-400 py-8">Loading…</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-gray-400 py-8">
                  {filter === 'active'
                    ? 'No requests waiting on you right now — nice.'
                    : 'Nothing to show in this view.'}
                </TableCell></TableRow>
              )}
              {pagination.paginatedItems.map(r => (
                <TableRow key={r.chainId} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelected(r)}>
                  <TableCell><Badge variant="outline" className="text-xs">{sourceLabel(r.sourceType)}</Badge></TableCell>
                  <TableCell>
                    <SummaryCell approval={r} />
                  </TableCell>
                  <TableCell className="text-sm text-gray-700">{r.requesterName ?? '—'}</TableCell>
                  <TableCell className="text-xs text-gray-600 tabular-nums">{formatDate(r.createdAt)}</TableCell>
                  <TableCell className="text-center">
                    <ProgressBadge approval={r} />
                  </TableCell>
                  <TableCell className="text-center"><StatusBadge status={r.status} viewerRole={r.viewerRole} /></TableCell>
                  <TableCell className="text-right">
                    {r.viewerRole === 'active' ? (
                      <div
                        className="flex items-center gap-1 justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                          onClick={() => setSelected(r)}
                          title="Reject requires a comment — opens the detail dialog"
                        >
                          <X className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => { void quickApprove(r); }}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">View</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t">
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

      {selected && (
        <ApprovalDetailDialog
          approval={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { void load(); }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Building blocks                                                      */
/* -------------------------------------------------------------------- */

function KpiCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: 'amber' | 'blue' | 'emerald' | 'rose' }) {
  const color =
    tone === 'amber'   ? 'text-amber-600' :
    tone === 'blue'    ? 'text-blue-600' :
    tone === 'emerald' ? 'text-emerald-600' :
                         'text-rose-600';
  return (
    <Card className="border-gray-200">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          {icon}
          <span className={`text-2xl font-bold ${color}`}>{value}</span>
        </div>
        <p className="text-xs font-medium text-gray-700 truncate">{label}</p>
      </CardContent>
    </Card>
  );
}

function SummaryCell({ approval }: { approval: approvalsApi.Approval }) {
  const s = approval.sourceSummary;
  if (approval.sourceType === 'cash_advance') {
    return (
      <div className="text-sm">
        <div className="font-medium">
          {typeof s.advanceNo === 'string' ? s.advanceNo : ''}
          {' · '}
          <span className="tabular-nums">{money(s.amount, s.currency)}</span>
        </div>
        <div className="text-[11px] text-gray-500 truncate max-w-md">
          {typeof s.employeeName === 'string' ? s.employeeName : ''}
          {typeof s.purpose === 'string' ? ` — ${s.purpose}` : ''}
        </div>
      </div>
    );
  }
  if (approval.sourceType === 'overtime') {
    const hours = hoursLabel(s.hours);
    const start = typeof s.startDate === 'string' ? s.startDate : '';
    const end = typeof s.endDate === 'string' ? s.endDate : '';
    const dateLine = start && end && start !== end ? `${start} → ${end}` : start;
    const startHour = typeof s.startHour === 'string' ? s.startHour : '';
    const endHour = typeof s.endHour === 'string' ? s.endHour : '';
    const window = startHour && endHour ? `${startHour}–${endHour}` : '';
    const tags: string[] = [];
    if (s.weekend === true) tags.push('Weekend');
    if (s.holiday === true) tags.push('Holiday');
    return (
      <div className="text-sm">
        <div className="font-medium">
          {[hours, window, ...tags].filter(Boolean).join(' · ')}
        </div>
        <div className="text-[11px] text-gray-500 truncate max-w-md">
          {dateLine}
          {typeof s.reason === 'string' && s.reason ? ` — "${s.reason}"` : ''}
        </div>
      </div>
    );
  }
  if (approval.sourceType === 'leave') {
    const category = typeof s.category === 'string' ? capitalize(s.category) : '';
    const leaveType = typeof s.leaveType === 'string' ? capitalize(s.leaveType) : '';
    const days = typeof s.days === 'number' ? `${s.days} day${s.days !== 1 ? 's' : ''}` : '';
    const start = typeof s.startDate === 'string' ? s.startDate : '';
    const end = typeof s.endDate === 'string' ? s.endDate : '';
    const dateLine = start && end && start !== end ? `${start} → ${end}` : start;
    return (
      <div className="text-sm">
        <div className="font-medium">
          {[category, leaveType, days].filter(Boolean).join(' · ')}
        </div>
        <div className="text-[11px] text-gray-500 truncate max-w-md">
          {dateLine}
          {typeof s.reason === 'string' && s.reason ? ` — "${s.reason}"` : ''}
        </div>
      </div>
    );
  }
  // Quotation / Voucher / Bill / Receipt — sale-purchase chain gates
  // (V176). Same shape as Cash Advance: doc-no + amount up top, party
  // name (customer or vendor) + a distinguishing tag on the second line.
  if (approval.sourceType === 'quotation') {
    return (
      <div className="text-sm">
        <div className="font-medium">
          {typeof s.quotationNo === 'string' ? s.quotationNo : ''}
          {' · '}
          <span className="tabular-nums">{money(s.amount, s.currency)}</span>
        </div>
        <div className="text-[11px] text-gray-500 truncate max-w-md">
          {typeof s.customerName === 'string' ? s.customerName : ''}
          {typeof s.expiryDate === 'string' && s.expiryDate ? ` — expires ${s.expiryDate}` : ''}
        </div>
      </div>
    );
  }
  if (approval.sourceType === 'voucher') {
    return (
      <div className="text-sm">
        <div className="font-medium">
          {typeof s.voucherNo === 'string' ? s.voucherNo : ''}
          {' · '}
          <span className="tabular-nums">{money(s.amount, s.currency)}</span>
        </div>
        <div className="text-[11px] text-gray-500 truncate max-w-md">
          {typeof s.customerName === 'string' ? s.customerName : ''}
          {typeof s.purpose === 'string' && s.purpose ? ` — ${capitalize(s.purpose.replace(/_/g, ' '))}` : ''}
        </div>
      </div>
    );
  }
  if (approval.sourceType === 'bill') {
    return (
      <div className="text-sm">
        <div className="font-medium">
          {typeof s.billNo === 'string' ? s.billNo : ''}
          {' · '}
          <span className="tabular-nums">{money(s.amount, s.currency)}</span>
        </div>
        <div className="text-[11px] text-gray-500 truncate max-w-md">
          {typeof s.vendorName === 'string' ? s.vendorName : ''}
          {typeof s.dueDate === 'string' && s.dueDate ? ` — due ${s.dueDate}` : ''}
        </div>
      </div>
    );
  }
  if (approval.sourceType === 'receipt') {
    return (
      <div className="text-sm">
        <div className="font-medium">
          {typeof s.receiptNo === 'string' ? s.receiptNo : ''}
          {' · '}
          <span className="tabular-nums">{money(s.amount, s.currency)}</span>
        </div>
        <div className="text-[11px] text-gray-500 truncate max-w-md">
          {typeof s.vendorName === 'string' ? s.vendorName : ''}
          {typeof s.issueDate === 'string' && s.issueDate ? ` — ${s.issueDate}` : ''}
        </div>
      </div>
    );
  }
  if (approval.sourceType === 'payroll_batch') {
    return (
      <div className="text-sm">
        <div className="font-medium">
          {typeof s.subject === 'string' ? s.subject : ''}
          {' · '}
          <span className="tabular-nums">{money(s.amount, s.currency)}</span>
        </div>
        <div className="text-[11px] text-gray-500 truncate max-w-md">
          {typeof s.monthYear === 'string' ? s.monthYear : ''}
          {typeof s.totalEmployees === 'number' ? ` — ${s.totalEmployees} employee${s.totalEmployees !== 1 ? 's' : ''}` : ''}
          {typeof s.type === 'string' && s.type ? ` · ${capitalize(String(s.type).replace(/_/g, ' '))}` : ''}
        </div>
      </div>
    );
  }
  if (approval.sourceType === 'encounter') {
    return (
      <div className="text-sm">
        <div className="font-medium">
          {typeof s.encounterNo === 'string' ? s.encounterNo : ''}
          {' · '}
          <span className="tabular-nums">{money(s.amount, s.currency)}</span>
        </div>
        <div className="text-[11px] text-gray-500 truncate max-w-md">
          {typeof s.patientName === 'string' ? s.patientName : ''}
          {typeof s.reason === 'string' && s.reason ? ` — ${s.reason}` : ''}
        </div>
      </div>
    );
  }
  // Generic fallback for future source types — surface any string
  // field the enricher put on the summary.
  const first = Object.entries(s).find(([, v]) => typeof v === 'string' && v);
  return (
    <div className="text-sm text-gray-700 truncate max-w-md">
      {first ? String(first[1]) : <span className="text-gray-400">—</span>}
    </div>
  );
}

function capitalize(v: string): string {
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
}

/** Turn a summary map's camelCase key into a readable label. Fallback
 *  used by the generic source-summary render when a source type hasn't
 *  had a custom layout coded up yet. */
function humanKey(k: string): string {
  return k
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
    .trim();
}

function ProgressBadge({ approval }: { approval: approvalsApi.Approval }) {
  if (approval.totalSteps === 0) {
    return <span className="text-xs text-gray-500">—</span>;
  }
  const doneSteps = approval.status === 'approved'
    ? approval.totalSteps
    : approval.status === 'rejected'
      ? Math.max(0, approval.currentStep - (approval.viewerRole === 'active' ? 1 : 0))
      : approval.currentStep - 1;
  const tone = approval.status === 'approved' ? 'text-emerald-700'
    : approval.status === 'rejected' ? 'text-rose-700'
    : 'text-blue-700';
  return (
    <span className={`text-xs font-medium tabular-nums ${tone}`}>
      {doneSteps}/{approval.totalSteps}{approval.status === 'approved' ? ' done' : ''}
    </span>
  );
}

function StatusBadge({ status, viewerRole }: { status: approvalsApi.ApprovalStatus; viewerRole: approvalsApi.ViewerRole }) {
  if (status === 'approved') return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Approved</Badge>;
  if (status === 'auto_approved') return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Auto-approved</Badge>;
  if (status === 'rejected') return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Rejected</Badge>;
  // pending — highlight if it's the viewer's turn
  return viewerRole === 'active'
    ? <Badge className="bg-amber-100 text-amber-700 border-amber-200">Awaiting you</Badge>
    : <Badge className="bg-blue-100 text-blue-700 border-blue-200">In progress</Badge>;
}

/* -------------------------------------------------------------------- */
/* Detail + decide dialog                                               */
/* -------------------------------------------------------------------- */

function ApprovalDetailDialog({
  approval, onClose, onChanged,
}: {
  approval: approvalsApi.Approval;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { formatDate } = useDateFormat();
  const [current, setCurrent] = useState<approvalsApi.Approval>(approval);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');

  const refresh = async () => {
    try { setCurrent(await approvalsApi.get(approval.chainId)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to reload'); }
  };
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [approval.chainId]);

  const canAct = current.viewerRole === 'active';

  const act = async (decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !comment.trim()) {
      toast.error('Please add a comment before rejecting.');
      return;
    }
    setBusy(true);
    try {
      await approvalsApi.decide(current.chainId, { decision, comment: comment.trim() || undefined });
      toast.success(decision === 'approved' ? 'Approved' : 'Rejected');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const s = current.sourceSummary;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{sourceLabel(current.sourceType)}</Badge>
            <StatusBadge status={current.status} viewerRole={current.viewerRole} />
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground">
              Requested by <span className="font-medium text-gray-700">{current.requesterName ?? '—'}</span>
              {' · '}
              {formatDate(current.createdAt)}
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Source snapshot */}
        <Card className="border-gray-200">
          <CardContent className="p-4 space-y-2">
            {current.sourceType === 'cash_advance' ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Advance No.:</span> <span className="font-medium">{String(s.advanceNo ?? '—')}</span></div>
                <div><span className="text-gray-500">Amount:</span> <span className="font-medium tabular-nums">{money(s.amount, s.currency)}</span></div>
                <div><span className="text-gray-500">Employee:</span> <span className="font-medium">{String(s.employeeName ?? '—')}</span></div>
                <div><span className="text-gray-500">Purpose:</span> <span className="font-medium">{String(s.purpose ?? '—')}</span></div>
              </div>
            ) : current.sourceType === 'overtime' ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Employee:</span> <span className="font-medium">{String(s.employeeName ?? '—')}</span></div>
                <div><span className="text-gray-500">Hours:</span> <span className="font-medium tabular-nums">{hoursLabel(s.hours) || '—'}</span></div>
                <div><span className="text-gray-500">Start date:</span> <span className="font-medium tabular-nums">{s.startDate ? String(s.startDate) : '—'}</span></div>
                <div><span className="text-gray-500">End date:</span> <span className="font-medium tabular-nums">{s.endDate ? String(s.endDate) : '—'}</span></div>
                <div><span className="text-gray-500">Window:</span> <span className="font-medium tabular-nums">
                  {s.startHour && s.endHour ? `${s.startHour}–${s.endHour}` : '—'}
                </span></div>
                <div><span className="text-gray-500">Weekend / Holiday:</span> <span className="font-medium">
                  {s.weekend || s.holiday
                    ? [s.weekend ? 'Weekend' : null, s.holiday ? 'Holiday' : null].filter(Boolean).join(' + ')
                    : '—'}
                </span></div>
                <div className="col-span-2">
                  <span className="text-gray-500">Reason:</span>{' '}
                  <span className="font-medium italic">"{String(s.reason ?? '—')}"</span>
                </div>
              </div>
            ) : current.sourceType === 'leave' ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Employee:</span> <span className="font-medium">{String(s.employeeName ?? '—')}</span></div>
                <div><span className="text-gray-500">Category:</span> <span className="font-medium">{s.category ? capitalize(String(s.category)) : '—'}</span></div>
                <div><span className="text-gray-500">Type:</span> <span className="font-medium">{s.leaveType ? capitalize(String(s.leaveType)) : '—'}</span></div>
                <div><span className="text-gray-500">Duration:</span> <span className="font-medium">{typeof s.days === 'number' ? `${s.days} day${s.days !== 1 ? 's' : ''}` : '—'}</span></div>
                <div><span className="text-gray-500">Start:</span> <span className="font-medium tabular-nums">{s.startDate ? String(s.startDate) : '—'}</span></div>
                <div><span className="text-gray-500">End:</span> <span className="font-medium tabular-nums">{s.endDate ? String(s.endDate) : '—'}</span></div>
                <div className="col-span-2">
                  <span className="text-gray-500">Reason:</span>{' '}
                  <span className="font-medium italic">"{String(s.reason ?? '—')}"</span>
                </div>
              </div>
            ) : current.sourceType === 'quotation' ? (
              // V176 — chain-gated pre-sale quote. Rich preview
              // mirrors the QuotationDetailDialog visual: doc-no
              // header, status chip + issue date, party meta grid,
              // items table, subtotal + total block.
              <QuotationPreview quotationId={current.sourceId} formatDate={formatDate} />
            ) : current.sourceType === 'voucher' ? (
              // V176 — chain-gated Voucher. Same rich-preview style
              // as Quotation (items table + totals). Voucher's total
              // is always zero by design, so we show a "Face value"
              // line under the items instead.
              <VoucherPreview voucherId={current.sourceId} formatDate={formatDate} />
            ) : current.sourceType === 'bill' ? (
              // V177 — chain-gated Bill. Rich preview mirrors the
              // Quotation layout: header + party meta + items table +
              // subtotal/tax/discount/total block.
              <BillPreview billId={current.sourceId} formatDate={formatDate} />
            ) : current.sourceType === 'receipt' ? (
              // V177 — chain-gated Receipt. Single-line doc, so no
              // items table — a taller meta grid + a total tile.
              <ReceiptPreview receiptId={current.sourceId} formatDate={formatDate} />
            ) : current.sourceType === 'payroll_batch' ? (
              // Payroll batch — subject is the primary label; the
              // month + type + employee count identify the run
              // uniquely. Net-salary total is the amount to sign off.
              // No item-by-item table here — payslips live behind the
              // Payroll page's per-batch detail dialog.
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="col-span-2">
                  <span className="text-gray-500">Subject:</span>{' '}
                  <span className="font-medium">{String(s.subject ?? '—')}</span>
                </div>
                <div><span className="text-gray-500">Month:</span> <span className="font-medium">{String(s.monthYear ?? '—')}</span></div>
                <div><span className="text-gray-500">Type:</span> <span className="font-medium">{s.type ? capitalize(String(s.type).replace(/_/g, ' ')) : '—'}</span></div>
                <div><span className="text-gray-500">Employees:</span> <span className="font-medium tabular-nums">{typeof s.totalEmployees === 'number' ? s.totalEmployees : '—'}</span></div>
                <div><span className="text-gray-500">Net total:</span> <span className="font-medium tabular-nums">{money(s.amount, s.currency)}</span></div>
                <div><span className="text-gray-500">Batch date:</span> <span className="font-medium tabular-nums">{s.batchDate ? String(s.batchDate) : '—'}</span></div>
                <div><span className="text-gray-500">Status:</span> <span className="font-medium">{s.status ? capitalize(String(s.status)) : '—'}</span></div>
              </div>
            ) : current.sourceType === 'encounter' ? (
              // V182 / v-hospital-api — Encounter. Chain-gated visits
              // need physician / admin sign-off before billing. Rich
              // fields don't need a bespoke preview yet — the
              // summarize() output is compact enough to read at a
              // glance. Approver clicks "Approve" to release the
              // encounter into progress (billable) or "Reject" to
              // close it out.
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Encounter No.:</span> <span className="font-medium">{String(s.encounterNo ?? '—')}</span></div>
                <div><span className="text-gray-500">Amount:</span> <span className="font-medium tabular-nums">{money(s.amount, s.currency)}</span></div>
                <div><span className="text-gray-500">Patient:</span> <span className="font-medium">{String(s.patientName ?? '—')}</span></div>
                <div><span className="text-gray-500">Status:</span> <span className="font-medium">{s.status ? capitalize(String(s.status)) : '—'}</span></div>
                <div className="col-span-2">
                  <span className="text-gray-500">Encounter date:</span>{' '}
                  <span className="font-medium tabular-nums">{s.encounterDate ? String(s.encounterDate) : '—'}</span>
                </div>
                {s.reason ? (
                  <div className="col-span-2">
                    <span className="text-gray-500">Reason:</span>{' '}
                    <span className="font-medium italic">"{String(s.reason)}"</span>
                  </div>
                ) : null}
              </div>
            ) : (
              // Generic fallback — future source types not yet given a
              // custom layout still render, just as a plain label/value
              // list rather than raw JSON so the operator can actually
              // read what they're about to decide on.
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(s).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-gray-500">{humanKey(k)}:</span>{' '}
                    <span className="font-medium">{v == null ? '—' : String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chain progression */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Approval chain</div>
          <div className="space-y-1.5">
            {current.steps.map(step => (
              <div
                key={step.stepId}
                className={`rounded-md border p-3 text-sm ${
                  step.decision === 'approved' ? 'bg-emerald-50/40 border-emerald-200'
                  : step.decision === 'rejected' ? 'bg-rose-50/40 border-rose-200'
                  : step.stepOrder === current.currentStep && current.status === 'pending' ? 'bg-amber-50/40 border-amber-200'
                  : 'bg-gray-50/40 border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500 tabular-nums">#{step.stepOrder}</span>
                      <span className="font-medium">{step.approverName ?? '—'}</span>
                      {step.decision === 'approved' && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Approved</Badge>}
                      {step.decision === 'rejected' && <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-[10px]">Rejected</Badge>}
                      {!step.decision && step.stepOrder === current.currentStep && current.status === 'pending' && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Current</Badge>
                      )}
                    </div>
                    {step.comment && (
                      <div className="mt-1 text-xs text-gray-700 italic">"{step.comment}"</div>
                    )}
                  </div>
                  {step.decisionAt && (
                    <div className="text-[11px] text-gray-500 shrink-0 tabular-nums">{formatDate(step.decisionAt)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Decide */}
        {canAct && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Your decision</div>
            <Textarea
              placeholder="Comment (required when rejecting)…"
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          {canAct ? (
            <>
              <Button variant="outline" onClick={() => act('rejected')} disabled={busy} className="text-rose-700 border-rose-200 hover:bg-rose-50">
                <X className="h-4 w-4 mr-1.5" />
                Reject
              </Button>
              <Button onClick={() => act('approved')} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
                <Check className="h-4 w-4 mr-1.5" />
                Approve
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------
 * Rich source previews (V176)
 *
 * The Approval inbox for Quotation / Voucher chains renders the full
 * document layout — header, party meta, items table, totals — so the
 * approver has the same visual context as the source page's own
 * detail dialog without having to navigate away. Read-only: no
 * Print / Send / Edit / Convert / Close actions — those belong on
 * the source doc's page.
 * --------------------------------------------------------------------- */

interface PreviewProps { formatDate: (d: Date | string | number | null | undefined) => string; }

/** Format a subtotal-line-total number using the same helper as {@link money}. */
function fmt(v: number, ccy: string): string {
  return `${ccy} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Status chip — matches the amber/pending pattern used in the list
 *  page for chain-gated docs. Falls back to slate for anything else. */
function StatusPill({ status }: { status: string }) {
  const color =
    status === 'pending'  ? 'border-amber-300 text-amber-700 bg-amber-50'   :
    status === 'progress' ? 'border-blue-300 text-blue-700 bg-blue-50'      :
    status === 'done' || status === 'approved' || status === 'issued'
                          ? 'border-emerald-300 text-emerald-700 bg-emerald-50' :
    status === 'rejected' ? 'border-red-300 text-red-700 bg-red-50'          :
    status === 'close' || status === 'void'
                          ? 'border-slate-300 text-slate-700 bg-slate-50'    :
                            'border-slate-300 text-slate-700 bg-slate-50';
  return <Badge variant="outline" className={`capitalize text-[10px] ${color}`}>{status}</Badge>;
}

function QuotationPreview({ quotationId, formatDate }: PreviewProps & { quotationId: string }) {
  const [quote, setQuote] = useState<quotationsApi.Quotation | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const q = await quotationsApi.get(quotationId);
        if (cancelled) return;
        setQuote(q);
        // Customer lookup — best-effort. 403 or missing row → fall
        // back to the id string; the caller's chain summary has the
        // name too so the header line still reads sensibly.
        try {
          const c = await customersApi.get(q.customerId);
          if (!cancelled) setCustomerName(c.name);
        } catch { /* leave blank */ }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load quotation');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [quotationId]);
  if (loading && !quote) return <div className="text-sm text-gray-500 py-6 text-center">Loading…</div>;
  if (!quote) return <div className="text-sm text-gray-500 py-6 text-center">Quotation not found.</div>;
  const subtotal = quote.subtotal ?? 0;
  const total    = quote.total ?? 0;
  const ccy      = quote.currency;
  return (
    <div className="space-y-4">
      {/* Header — doc no + status chip + issue date. Actions live on
          the Quotation page; here it's view-only. */}
      <div className="flex items-baseline gap-3">
        <h3 className="text-lg font-semibold tracking-tight">{quote.quotationNo}</h3>
        <StatusPill status={quote.status} />
        <span className="text-xs text-gray-500">{formatDate(quote.issueDate)}</span>
      </div>

      {/* Party meta — 2-col label/value list. */}
      <div className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
        <span className="text-gray-500">Customer</span>
        <span className="font-medium">{customerName || '—'}</span>
        {(quote.recipientName || quote.recipientEmail || quote.recipientPhone) && (
          <>
            <span className="text-gray-500">Recipient</span>
            <span className="font-medium">
              {quote.recipientName || '—'}
              {quote.recipientEmail ? <span className="text-xs text-gray-500"> · {quote.recipientEmail}</span> : null}
            </span>
          </>
        )}
        <span className="text-gray-500">Currency</span>
        <span className="font-medium">{ccy}</span>
        {quote.expiryDate && (
          <>
            <span className="text-gray-500">Expires</span>
            <span className="font-medium tabular-nums">{formatDate(quote.expiryDate)}</span>
          </>
        )}
      </div>

      {/* Items */}
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Specification</TableHead>
              <TableHead className="w-20">UOM</TableHead>
              <TableHead className="w-20 text-right">Qty</TableHead>
              <TableHead className="w-28 text-right">Unit price</TableHead>
              <TableHead className="w-28 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quote.items.map(it => (
              <TableRow key={it.id}>
                <TableCell className="font-medium">{it.name}</TableCell>
                <TableCell className="text-gray-600">{it.description || '—'}</TableCell>
                <TableCell>{it.unit || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(it.unitPrice, ccy)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(it.lineTotal, ccy)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Totals — right-aligned block */}
      <div className="flex justify-end">
        <div className="w-64 space-y-1 rounded-md bg-slate-50 px-4 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal</span>
            <span className="tabular-nums">{fmt(subtotal, ccy)}</span>
          </div>
          {quote.taxAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Tax</span>
              <span className="tabular-nums">{fmt(quote.taxAmount, ccy)}</span>
            </div>
          )}
          {quote.discountAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Discount</span>
              <span className="tabular-nums">− {fmt(quote.discountAmount, ccy)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t pt-1 mt-1">
            <span>Total {ccy}</span>
            <span className="tabular-nums">{fmt(total, ccy)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function VoucherPreview({ voucherId, formatDate }: PreviewProps & { voucherId: string }) {
  const [voucher, setVoucher] = useState<vouchersApi.Voucher | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const v = await vouchersApi.get(voucherId);
        if (cancelled) return;
        setVoucher(v);
        try {
          const c = await customersApi.get(v.customerId);
          if (!cancelled) setCustomerName(c.name);
        } catch { /* leave blank */ }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load voucher');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [voucherId]);
  if (loading && !voucher) return <div className="text-sm text-gray-500 py-6 text-center">Loading…</div>;
  if (!voucher) return <div className="text-sm text-gray-500 py-6 text-center">Voucher not found.</div>;
  const ccy = voucher.currency;
  // Voucher forces a 100% discount so `total` is always 0. Sum the
  // items so the approver sees the actual face value.
  const faceValue = voucher.items.reduce(
    (acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0,
  );
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h3 className="text-lg font-semibold tracking-tight">{voucher.voucherNo}</h3>
        <StatusPill status={voucher.status} />
        <span className="text-xs text-gray-500">{formatDate(voucher.issueDate)}</span>
      </div>

      <div className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
        <span className="text-gray-500">Customer</span>
        <span className="font-medium">{customerName || '—'}</span>
        <span className="text-gray-500">Purpose</span>
        <span className="font-medium">{capitalize(voucher.purpose.replace(/_/g, ' '))}</span>
        <span className="text-gray-500">Currency</span>
        <span className="font-medium">{ccy}</span>
      </div>

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Specification</TableHead>
              <TableHead className="w-20">UOM</TableHead>
              <TableHead className="w-20 text-right">Qty</TableHead>
              <TableHead className="w-28 text-right">Unit price</TableHead>
              <TableHead className="w-28 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {voucher.items.map(it => (
              <TableRow key={it.id}>
                <TableCell className="font-medium">{it.name}</TableCell>
                <TableCell className="text-gray-600">{it.description || '—'}</TableCell>
                <TableCell>{it.unit || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(it.unitPrice, ccy)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(it.lineTotal, ccy)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Face value + Total. Voucher's total is always zero — the
          face value is what the approver actually needs to see. */}
      <div className="flex justify-end">
        <div className="w-64 space-y-1 rounded-md bg-slate-50 px-4 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Face value</span>
            <span className="tabular-nums">{fmt(faceValue, ccy)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Discount (100%)</span>
            <span className="tabular-nums">− {fmt(faceValue, ccy)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t pt-1 mt-1">
            <span>Total {ccy}</span>
            <span className="tabular-nums">{fmt(0, ccy)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BillPreview({ billId, formatDate }: PreviewProps & { billId: string }) {
  const [bill, setBill] = useState<billsApi.Bill | null>(null);
  const [vendorName, setVendorName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const b = await billsApi.get(billId);
        if (cancelled) return;
        setBill(b);
        // Bill's FE type field is legacy-named `customerId` but the
        // runtime JSON is `vendorId` (see BillDto.java). Cast to
        // reach the actual field.
        const vendorId = (b as unknown as { vendorId: string }).vendorId;
        if (vendorId) {
          try {
            const v = await vendorsApi.get(vendorId);
            if (!cancelled) setVendorName(v.name);
          } catch { /* leave blank */ }
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load bill');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [billId]);
  if (loading && !bill) return <div className="text-sm text-gray-500 py-6 text-center">Loading…</div>;
  if (!bill) return <div className="text-sm text-gray-500 py-6 text-center">Bill not found.</div>;
  const ccy = bill.currency;
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h3 className="text-lg font-semibold tracking-tight">{bill.billNo}</h3>
        <Badge variant="outline" className="capitalize text-[10px] border-slate-300 text-slate-700 bg-slate-50">
          {bill.kind.replace(/_/g, ' ')}
        </Badge>
        <StatusPill status={bill.status} />
        <span className="text-xs text-gray-500">{formatDate(bill.issueDate)}</span>
      </div>

      <div className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
        <span className="text-gray-500">Vendor</span>
        <span className="font-medium">{vendorName || '—'}</span>
        <span className="text-gray-500">Currency</span>
        <span className="font-medium">{ccy}</span>
        {bill.dueDate && (
          <>
            <span className="text-gray-500">Due date</span>
            <span className="font-medium tabular-nums">{formatDate(bill.dueDate)}</span>
          </>
        )}
      </div>

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Specification</TableHead>
              <TableHead className="w-20">UOM</TableHead>
              <TableHead className="w-20 text-right">Qty</TableHead>
              <TableHead className="w-28 text-right">Unit price</TableHead>
              <TableHead className="w-28 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bill.items.map(it => (
              <TableRow key={it.id}>
                <TableCell className="font-medium">{it.name}</TableCell>
                <TableCell className="text-gray-600">{it.description || '—'}</TableCell>
                <TableCell>{it.unit || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(it.unitPrice, ccy)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(it.lineTotal, ccy)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <div className="w-64 space-y-1 rounded-md bg-slate-50 px-4 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal</span>
            <span className="tabular-nums">{fmt(bill.subtotal, ccy)}</span>
          </div>
          {bill.taxAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Tax</span>
              <span className="tabular-nums">{fmt(bill.taxAmount, ccy)}</span>
            </div>
          )}
          {bill.discountAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Discount</span>
              <span className="tabular-nums">− {fmt(bill.discountAmount, ccy)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t pt-1 mt-1">
            <span>Total {ccy}</span>
            <span className="tabular-nums">{fmt(bill.total, ccy)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptPreview({ receiptId, formatDate }: PreviewProps & { receiptId: string }) {
  const [receipt, setReceipt] = useState<receiptsApi.Receipt | null>(null);
  const [vendorName, setVendorName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const r = await receiptsApi.get(receiptId);
        if (cancelled) return;
        setReceipt(r);
        try {
          const v = await vendorsApi.get(r.vendorId);
          if (!cancelled) setVendorName(v.name);
        } catch { /* leave blank */ }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load expense');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [receiptId]);
  if (loading && !receipt) return <div className="text-sm text-gray-500 py-6 text-center">Loading…</div>;
  if (!receipt) return <div className="text-sm text-gray-500 py-6 text-center">Expense not found.</div>;
  const ccy = receipt.currency;
  // Receipt is a single-amount doc — no items to list, so the totals
  // block goes wider to compensate visually.
  const netAmount = (receipt.amount ?? 0) - (receipt.taxAmount ?? 0);
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h3 className="text-lg font-semibold tracking-tight">{receipt.receiptNo}</h3>
        <StatusPill status={receipt.status} />
        <span className="text-xs text-gray-500">{formatDate(receipt.issueDate)}</span>
      </div>

      <div className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
        <span className="text-gray-500">Vendor</span>
        <span className="font-medium">{vendorName || '—'}</span>
        <span className="text-gray-500">Supplier</span>
        <span className="font-medium">{capitalize(receipt.supplierType.replace(/_/g, ' '))}</span>
        {receipt.taxId && (
          <>
            <span className="text-gray-500">Tax ID</span>
            <span className="font-medium">{receipt.taxId}</span>
          </>
        )}
        <span className="text-gray-500">Currency</span>
        <span className="font-medium">{ccy}</span>
        {receipt.notes && (
          <>
            <span className="text-gray-500">Notes</span>
            <span className="font-medium italic text-gray-700">"{receipt.notes}"</span>
          </>
        )}
      </div>

      <div className="flex justify-end">
        <div className="w-72 space-y-1 rounded-md bg-slate-50 px-4 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Gross amount</span>
            <span className="tabular-nums">{fmt(receipt.amount ?? 0, ccy)}</span>
          </div>
          {receipt.taxAmount ? (
            <div className="flex justify-between">
              <span className="text-gray-500">WHT ({receipt.taxType || '—'})</span>
              <span className="tabular-nums">− {fmt(receipt.taxAmount, ccy)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold border-t pt-1 mt-1">
            <span>Net {ccy}</span>
            <span className="tabular-nums">{fmt(netAmount, ccy)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
