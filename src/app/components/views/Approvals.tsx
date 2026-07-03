import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
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
import { useI18n } from '../../i18n/I18nContext';
import { useDateFormat } from '../../context/DateFormatContext';

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
    default:             return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
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
  const [rows, setRows] = useState<approvalsApi.Approval[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [selected, setSelected] = useState<approvalsApi.Approval | null>(null);

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
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-blue-600" />
              Inbox
            </CardTitle>
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
                      <span className="text-xs text-amber-700 font-medium">Waiting on you</span>
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
  // Generic fallback for future source types — surface any string
  // field the enricher put on the summary.
  const first = Object.entries(s).find(([, v]) => typeof v === 'string' && v);
  return (
    <div className="text-sm text-gray-700 truncate max-w-md">
      {first ? String(first[1]) : <span className="text-gray-400">—</span>}
    </div>
  );
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
            ) : (
              <div className="text-xs text-gray-500">
                <pre className="whitespace-pre-wrap font-sans">{JSON.stringify(s, null, 2)}</pre>
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
