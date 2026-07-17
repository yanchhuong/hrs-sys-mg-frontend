import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Textarea } from '../../ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import {
  Search, RefreshCw, Eye, UserPlus, Trash2, ArrowRightCircle, FileText, Loader2, X, Clock,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { usePagination } from '../../../hooks/usePagination';
import { Pagination } from '../../common/Pagination';
import {
  platformSurveys, RequirementSurvey, SurveyStatus, SurveyPriority,
  SurveyStatusHistoryEntry, SURVEY_STATUSES, SURVEY_PRIORITIES,
} from '../../../api/platformSurveys';

const STATUS_BY_KEY: Record<SurveyStatus, typeof SURVEY_STATUSES[number]> =
  Object.fromEntries(SURVEY_STATUSES.map(s => [s.key, s])) as any;
const PRIORITY_BY_KEY: Record<SurveyPriority, typeof SURVEY_PRIORITIES[number]> =
  Object.fromEntries(SURVEY_PRIORITIES.map(p => [p.key, p])) as any;

/**
 * Super Admin: Requirement Surveys management (V170).
 *
 * Lists every inbound survey from the landing form, lets the operator
 * search / filter, drill into a detail dialog, change status, assign
 * a sales rep, and soft-delete. Summary cards up top show the
 * pipeline distribution at a glance.
 */
export function RequirementSurveys() {
  const [rows, setRows] = useState<RequirementSurvey[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SurveyStatus | ''>('');
  const [priority, setPriority] = useState<SurveyPriority | ''>('');

  const [detail, setDetail] = useState<RequirementSurvey | null>(null);
  const [statusEdit, setStatusEdit] = useState<RequirementSurvey | null>(null);
  const [assignEdit, setAssignEdit] = useState<RequirementSurvey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RequirementSurvey | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [list, sum] = await Promise.all([
        platformSurveys.list({
          q: search || undefined,
          status: status || undefined,
          priority: priority || undefined,
          size: 200,
        }),
        platformSurveys.summary(),
      ]);
      setRows(list);
      setSummary(sum);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load surveys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Client-side search echo — hits the server via q param but the
  // instant-feedback filter uses the loaded set.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (status && r.status !== status) return false;
      if (priority && r.priority !== priority) return false;
      if (!q) return true;
      const hay = `${r.surveyNo} ${r.companyName} ${r.contactPerson} ${r.email} ${r.phone ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, status, priority]);

  const pager = usePagination(filtered, 15);

  // Summary tiles are hardcoded to the highest-signal statuses; the
  // full pipeline distribution is visible via the filter chips below.
  const summaryTiles: { key: SurveyStatus | 'all'; label: string; tone: string }[] = [
    { key: 'all',           label: 'Total',          tone: 'text-gray-800' },
    { key: 'new',           label: 'New',            tone: 'text-blue-700' },
    { key: 'contacted',     label: 'Contacted',      tone: 'text-sky-700' },
    { key: 'quotation_sent',label: 'Quotation Sent', tone: 'text-violet-700' },
    { key: 'won',           label: 'Won',            tone: 'text-emerald-700' },
    { key: 'lost',          label: 'Lost',           tone: 'text-rose-700' },
  ];
  const totalAll = Object.values(summary).reduce((a, b) => a + b, 0);
  const valueFor = (k: SurveyStatus | 'all') => k === 'all' ? totalAll : (summary[k] ?? 0);

  return (
    <div className="space-y-6">
      {/* Header + refresh */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Requirement Surveys</h1>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryTiles.map(t => (
          <Card key={t.key}>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{t.label}</p>
              <p className={`text-2xl font-semibold mt-1 tabular-nums ${t.tone}`}>{valueFor(t.key)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter bar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search survey no, company, contact, email…"
                className="pl-8 h-9"
              />
            </div>
            <Select value={status || 'all'} onValueChange={v => setStatus(v === 'all' ? '' : v as SurveyStatus)}>
              <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {SURVEY_STATUSES.map(s => (
                  <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priority || 'all'} onValueChange={v => setPriority(v === 'all' ? '' : v as SurveyPriority)}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {SURVEY_PRIORITIES.map(p => (
                  <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(search || status || priority) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatus(''); setPriority(''); }}>
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px]">Survey No.</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="hidden md:table-cell">Apps</TableHead>
                <TableHead className="w-[100px]">Priority</TableHead>
                <TableHead className="w-[130px]">Status</TableHead>
                <TableHead className="w-[130px]">Submitted</TableHead>
                <TableHead className="text-right w-[180px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.paginatedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-gray-400 py-10">
                    {loading ? 'Loading…' : 'No surveys match these filters.'}
                  </TableCell>
                </TableRow>
              )}
              {pager.paginatedItems.map(r => {
                const s = STATUS_BY_KEY[r.status];
                const p = PRIORITY_BY_KEY[r.priority];
                return (
                  <TableRow key={r.id} className="hover:bg-gray-50">
                    <TableCell className="font-mono text-xs">{r.surveyNo}</TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{r.companyName}</p>
                      <p className="text-[11px] text-gray-500">{r.industry ?? '—'}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{r.contactPerson}</p>
                      <p className="text-[11px] text-gray-500">{r.email}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {r.selectedApps.slice(0, 3).map(a => (
                          <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
                        ))}
                        {r.selectedApps.length > 3 && (
                          <span className="text-[10px] text-gray-500">+{r.selectedApps.length - 3}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={p?.tone + ' text-[10px]'}>
                        {p?.label ?? r.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={s?.tone + ' text-[10px]'}>
                        {s?.label ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <p>{formatDistanceToNow(new Date(r.submittedAt), { addSuffix: true })}</p>
                      <p className="text-gray-400">{format(new Date(r.submittedAt), 'MMM dd, HH:mm')}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setDetail(r)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" title="Change status"
                                onClick={() => setStatusEdit(r)}>
                          <ArrowRightCircle className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" title="Assign"
                                onClick={() => setAssignEdit(r)}>
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                title="Delete" onClick={() => setDeleteTarget(r)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={pager.currentPage}
            totalPages={pager.totalPages}
            onPageChange={pager.goToPage}
            startIndex={pager.startIndex}
            endIndex={pager.endIndex}
            totalItems={pager.totalItems}
          />
        </CardContent>
      </Card>

      {detail && (
        <SurveyDetailDialog
          survey={detail}
          onClose={() => setDetail(null)}
        />
      )}
      {statusEdit && (
        <ChangeStatusDialog
          survey={statusEdit}
          onClose={() => setStatusEdit(null)}
          onSaved={() => { setStatusEdit(null); void load(); }}
        />
      )}
      {assignEdit && (
        <AssignDialog
          survey={assignEdit}
          onClose={() => setAssignEdit(null)}
          onSaved={() => { setAssignEdit(null); void load(); }}
        />
      )}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete survey {deleteTarget?.surveyNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              The row is soft-deleted — it's hidden from the list but stays in the
              audit trail. Contact engineering if you need a hard remove.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await platformSurveys.delete(deleteTarget.id);
                  toast.success('Survey removed');
                  setDeleteTarget(null);
                  await load();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Delete failed');
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -----------------------------------------------------------------------
 *  Detail dialog — full survey view with company / project / requirements
 *  / internal blocks. Also shows the status-change history timeline.
 * ----------------------------------------------------------------------- */
function SurveyDetailDialog({ survey, onClose }: { survey: RequirementSurvey; onClose: () => void }) {
  const [history, setHistory] = useState<SurveyStatusHistoryEntry[] | null>(null);

  useEffect(() => {
    void platformSurveys.history(survey.id)
      .then(setHistory)
      .catch(() => setHistory([])); // silent — timeline is informational
  }, [survey.id]);

  const s = STATUS_BY_KEY[survey.status];
  const p = PRIORITY_BY_KEY[survey.priority];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <FileText className="h-4 w-4" />
            <span className="font-mono text-sm">{survey.surveyNo}</span>
            <span>·</span>
            <span>{survey.companyName}</span>
            <Badge variant="outline" className={s?.tone + ' text-[10px]'}>{s?.label}</Badge>
            <Badge variant="outline" className={p?.tone + ' text-[10px]'}>{p?.label}</Badge>
          </DialogTitle>
          <DialogDescription>
            Submitted {format(new Date(survey.submittedAt), 'MMM dd, yyyy HH:mm')} · updated {formatDistanceToNow(new Date(survey.updatedAt), { addSuffix: true })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <DetailSection title="Company Information">
            <DetailGrid rows={[
              ['Company',       survey.companyName],
              ['Contact person',survey.contactPerson],
              ['Email',         survey.email],
              ['Phone',         survey.phone],
              ['Industry',      survey.industry],
              ['Company size',  survey.companySize],
              ['Country',       survey.country],
            ]} />
          </DetailSection>

          <DetailSection title="Selected Applications">
            {survey.selectedApps.length === 0
              ? <p className="text-sm text-gray-400">No apps selected.</p>
              : (
                <div className="flex flex-wrap gap-1.5">
                  {survey.selectedApps.map(a => (
                    <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                  ))}
                </div>
              )}
          </DetailSection>

          <DetailSection title="Project Information">
            <DetailGrid rows={[
              ['Project type',      survey.projectType],
              ['Priority',          p?.label ?? survey.priority],
              ['Budget',            survey.budgetRange],
              ['Expected date',     survey.expectedImplDate],
              ['Current system',    survey.currentSystem],
            ]} />
          </DetailSection>

          <DetailSection title="Requirement">
            {survey.businessRequirement || survey.additionalNotes ? (
              <div className="space-y-3">
                {survey.businessRequirement && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Business requirement</p>
                    <p className="text-sm whitespace-pre-wrap bg-gray-50 rounded-md border p-3">{survey.businessRequirement}</p>
                  </div>
                )}
                {survey.additionalNotes && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Additional notes</p>
                    <p className="text-sm whitespace-pre-wrap bg-gray-50 rounded-md border p-3">{survey.additionalNotes}</p>
                  </div>
                )}
              </div>
            ) : <p className="text-sm text-gray-400">Nothing recorded.</p>}
          </DetailSection>

          <DetailSection title="Internal Management">
            <DetailGrid rows={[
              ['Assigned to',      survey.assignedUserId
                ? <span className="tabular-nums text-xs">{survey.assignedUserId}</span>
                : <span className="text-gray-400">Unassigned</span>],
              ['Assignment note',  survey.assignmentNote],
              ['Last status remark', survey.statusRemarks],
            ]} />
          </DetailSection>

          <DetailSection title="Status Timeline">
            {history === null
              ? <p className="text-sm text-gray-400 inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</p>
              : history.length === 0
                ? <p className="text-sm text-gray-400">No changes yet.</p>
                : (
                  <ol className="space-y-2 border-l-2 border-gray-200 pl-4">
                    {history.map(h => {
                      const toStatus = STATUS_BY_KEY[h.toStatus];
                      const fromStatus = h.fromStatus ? STATUS_BY_KEY[h.fromStatus] : null;
                      return (
                        <li key={h.id} className="relative">
                          <span className="absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white" />
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            <Clock className="h-3 w-3 text-gray-400" />
                            <span className="text-gray-600">{format(new Date(h.updatedAt), 'MMM dd, HH:mm')}</span>
                            {fromStatus && (
                              <>
                                <Badge variant="outline" className={fromStatus.tone + ' text-[10px]'}>{fromStatus.label}</Badge>
                                <span className="text-gray-400">→</span>
                              </>
                            )}
                            <Badge variant="outline" className={toStatus?.tone + ' text-[10px]'}>{toStatus?.label ?? h.toStatus}</Badge>
                          </div>
                          {h.remarks && (
                            <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{h.remarks}</p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
          </DetailSection>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-sm text-gray-900 mb-2">{title}</p>
      {children}
    </div>
  );
}

function DetailGrid({ rows }: { rows: [string, React.ReactNode | string | null | undefined][] }) {
  return (
    <dl className="grid grid-cols-3 gap-y-2 text-sm">
      {rows.map(([label, val], i) => (
        <div key={i} className="contents">
          <dt className="text-gray-500">{label}</dt>
          <dd className="col-span-2">
            {val == null || val === ''
              ? <span className="text-gray-400">—</span>
              : val}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* -----------------------------------------------------------------------
 *  Change-status dialog
 * ----------------------------------------------------------------------- */
function ChangeStatusDialog({ survey, onClose, onSaved }: {
  survey: RequirementSurvey; onClose: () => void; onSaved: () => void;
}) {
  const [next, setNext] = useState<SurveyStatus>(survey.status);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await platformSurveys.changeStatus(survey.id, next, remarks.trim() || undefined);
      toast.success('Status updated');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change status · {survey.surveyNo}</DialogTitle>
          <DialogDescription>
            The change is logged in the timeline with your remark.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">New status</p>
            <Select value={next} onValueChange={(v) => setNext(v as SurveyStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SURVEY_STATUSES.map(s => (
                  <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Remarks (optional)</p>
            <Textarea
              rows={3}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Why is the status moving? Anything the next reviewer should know?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || next === survey.status}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -----------------------------------------------------------------------
 *  Assign dialog — MVP uses a free-text User ID field. Wiring in a real
 *  platform-users picker is a small follow-up when that roster is
 *  exposed via an API.
 * ----------------------------------------------------------------------- */
function AssignDialog({ survey, onClose, onSaved }: {
  survey: RequirementSurvey; onClose: () => void; onSaved: () => void;
}) {
  const [userId, setUserId] = useState(survey.assignedUserId ?? '');
  const [note, setNote] = useState(survey.assignmentNote ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (clear = false) => {
    setSaving(true);
    try {
      await platformSurveys.assign(
        survey.id,
        clear ? null : (userId.trim() || null),
        note.trim() || undefined,
      );
      toast.success(clear ? 'Assignment cleared' : 'Survey assigned');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Assignment failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign · {survey.surveyNo}</DialogTitle>
          <DialogDescription>
            Assign the survey to a sales rep by user ID. Leave blank + click Clear to
            return it to the Unassigned queue.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">Assigned user (UUID)</p>
            <Input
              value={userId}
              onChange={e => setUserId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Note (optional)</p>
            <Textarea
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Any context for the assignee — customer preferences, urgency, etc."
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {survey.assignedUserId ? (
            <Button variant="outline" onClick={() => save(true)} disabled={saving}
                    className="text-red-600 border-red-200 hover:bg-red-50">
              Clear assignment
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={() => save(false)} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
