import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  ListTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Plus, Pencil, Trash2, Search, Settings, Info, Download } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import * as enrollmentsApi from '../../api/enrollments';
import * as customersApi from '../../api/customers';
import * as schedulesApi from '../../api/courseSchedules';
import * as coursesApi from '../../api/courses';
import * as classroomsApi from '../../api/classrooms';
import * as employeesApi from '../../api/employees';
import { useAuth } from '../../context/AuthContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { useConfirm } from '../../context/ConfirmContext';
import { DateInput } from '../common/DateInput';
import { NumericInput } from '../common/NumericInput';
import { TableBodySkeletonRows } from '../common/LoadingSkeletons';
import { ListEmpty, ListError } from '../common/ListStates';
import { TONE_CLASS, statusBadgeClass } from '../../utils/statusTones';
import { formatMoneyForCurrency } from '../../utils/format';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { DocAuditLine } from '../common/DocAuditLine';
import { EnrollmentSettingsDialog } from '../common/EnrollmentSettingsDialog';
import { InvoicePreviewDialog } from '../common/InvoicePreviewDialog';
import { SearchablePicker } from '../common/SearchablePicker';
import { exportListToExcel } from '../../utils/excelExport';

/**
 * Enrollments — School vertical page. One row per (student, course
 * schedule). Flow:
 *   Student → Enrollment → Assign Course Schedule → Generate Invoice
 *   → Payment → Enrollment Active
 *
 * <p>V213 / v-course-schedule-model — the enrollable unit is the
 * scheduled teaching session, not the raw Course row.</p>
 */
const emptyForm: enrollmentsApi.EnrollmentRequest = {
  studentId: '',
  courseScheduleId: '',
  enrollmentDate: null,
  currency: 'USD',
  exchangeRate: 1,
  unitPrice: null,
  quantity: 1,
  notes: '',
};

/** Labels per status; colours come from the shared statusTones palette
 *  (Enrolled = open/in progress → blue, Active / Completed → green,
 *  Withdrawn → slate). */
const STATUS_BADGES: Record<enrollmentsApi.EnrollmentStatus, { label: string; cls: string }> = {
  enrolled:  { label: 'Enrolled',  cls: TONE_CLASS.info },
  active:    { label: 'Active',    cls: statusBadgeClass('active') },
  completed: { label: 'Completed', cls: statusBadgeClass('completed') },
  withdrawn: { label: 'Withdrawn', cls: statusBadgeClass('withdrawn') },
};

const FILTER_SELECT_CLS =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0';

/** Mirrors the state lattice enforced in EnrollmentService.transition.
 *  Current status is always included so the picker's own value is
 *  valid; terminal states (completed / withdrawn) only include
 *  themselves so the dropdown collapses to a read-only pill.
 *  Anything else the backend would reject anyway. */
const NEXT_STATUS: Record<enrollmentsApi.EnrollmentStatus, enrollmentsApi.EnrollmentStatus[]> = {
  enrolled:  ['enrolled', 'active', 'withdrawn'],
  active:    ['active', 'completed', 'withdrawn'],
  completed: ['completed'],
  withdrawn: ['withdrawn'],
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** {@code onNavigate} is the cross-page nav escape hatch wired by
 *  App.tsx (viewProps). We use it to jump to the Invoices page when
 *  the operator clicks an Invoice No.; the target invoice number is
 *  handed off via sessionStorage so Invoices can prefill its search
 *  filter on mount. */
export function Enrollments({ onNavigate }: { onNavigate?: (view: string) => void } = {}) {
  const { canCreate, canUpdate, canDelete, canView } = useAuth();
  const { formatDate } = useDateFormat();
  const confirm = useConfirm();
  const canAdd = canCreate('enrollment');
  const canEdit = canUpdate('enrollment');
  const canRemove = canDelete('enrollment');

  const [rows, setRows] = useState<enrollmentsApi.Enrollment[]>([]);
  const [students, setStudents] = useState<customersApi.Customer[]>([]);
  const [schedules, setSchedules] = useState<schedulesApi.CourseSchedule[]>([]);
  const [courses, setCourses] = useState<coursesApi.Course[]>([]);
  const [classrooms, setClassrooms] = useState<classroomsApi.Classroom[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | enrollmentsApi.EnrollmentStatus>('all');
  // Client-side filters — enrollments API doesn't take course /
  // classroom / teacher / date params, so we resolve each row's
  // course_schedule ↦ course/classroom/teacher via the schedule map
  // below and filter in memory. Fine at the demo scale (page size
  // capped at 200); the backend can gain proper filters later if
  // schools grow.
  const [courseFilter, setCourseFilter] = useState<string>('');
  const [classroomFilter, setClassroomFilter] = useState<string>('');
  const [teacherFilter, setTeacherFilter] = useState<string>('');
  // Date range (from / to on enrollmentDate) — matches the
  // Transactions filter surface for consistency.
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [teachers, setTeachers] = useState<employeesApi.Employee[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<enrollmentsApi.Enrollment | null>(null);
  const [form, setForm] = useState<enrollmentsApi.EnrollmentRequest>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // v-invoice-no-and-auto-payment (round 2) — Invoice No. clicks
  // open a read-only preview modal instead of navigating away.
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const page = await enrollmentsApi.list({
        status: statusFilter === 'all' ? undefined : statusFilter,
        size: 200,
      });
      setRows(page.content ?? []);
    } catch (e) {
      // Inline error + Retry instead of a toast that reads as an empty list.
      setLoadError(e instanceof Error ? e.message : 'Failed to load enrollments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  useEffect(() => {
    (async () => {
      try {
        const gated = canView('enrollment');
        const [s, sched, c, r, e] = await Promise.all([
          gated ? customersApi.list({ kind: 'student', size: 500 }) : Promise.resolve({ content: [] }),
          gated ? schedulesApi.list({ size: 500 }) : Promise.resolve({ content: [] }),
          gated ? coursesApi.list({ size: 500 }) : Promise.resolve({ content: [] }),
          gated ? classroomsApi.list({ size: 500 }) : Promise.resolve({ content: [] }),
          gated ? employeesApi.list({ size: 500, status: 'active' }) : Promise.resolve({ content: [] }),
        ]);
        setStudents(s.content ?? []);
        setSchedules(sched.content ?? []);
        setCourses(c.content ?? []);
        setClassrooms(r.content ?? []);
        setTeachers((e.content ?? []).filter(x => x.clinicalRole === 'teacher'));
      } catch { /* soft-fail — pickers show empty */ }
    })();
  }, [canView]);

  const studentName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) map.set(s.id, s.name);
    return (id: string) => map.get(id) ?? '—';
  }, [students]);

  const scheduleById = useMemo(() => {
    const map = new Map<string, schedulesApi.CourseSchedule>();
    for (const s of schedules) map.set(s.id, s);
    return (id: string) => map.get(id);
  }, [schedules]);

  const courseName    = useMemo(() => new Map(courses.map(c => [c.id, c.name])), [courses]);
  const classroomName = useMemo(() => new Map(classrooms.map(c => [c.id, c.name])), [classrooms]);

  // "English Level 1 · Room A · Mon 08:00–10:00" — a one-liner that
  // uniquely identifies a schedule in the picker + table.
  const scheduleLabel = (s: schedulesApi.CourseSchedule): string => {
    const parts: string[] = [];
    const cname = courseName.get(s.courseId);
    const rname = classroomName.get(s.classroomId);
    if (cname) parts.push(cname);
    if (s.name) parts.push(s.name);
    if (rname) parts.push(rname);
    if (s.learnTimes && s.learnTimes.length > 0) {
      const first = s.learnTimes[0];
      const suffix = s.learnTimes.length > 1 ? ` +${s.learnTimes.length - 1}` : '';
      parts.push(`${DAY_LABELS[first.dayOfWeek - 1]} ${first.fromTime.slice(0, 5)}–${first.toTime.slice(0, 5)}${suffix}`);
    }
    return parts.join(' · ') || '—';
  };

  /** Full learn-times string, e.g. "Mon 10:00–12:00, Wed 10:00–12:00".
   *  Used under the schedule picker so all slots are visible after a
   *  pick without cramming into the trigger label. */
  const allLearnTimes = (s: schedulesApi.CourseSchedule): string => {
    if (!s.learnTimes || s.learnTimes.length === 0) return '—';
    return s.learnTimes
      .map(t => `${DAY_LABELS[t.dayOfWeek - 1]} ${t.fromTime.slice(0, 5)}–${t.toTime.slice(0, 5)}`)
      .join(', ');
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      const sched = scheduleById(r.courseScheduleId);
      if (courseFilter    && sched?.courseId    !== courseFilter)    return false;
      if (classroomFilter && sched?.classroomId !== classroomFilter) return false;
      if (teacherFilter   && sched?.teacherId   !== teacherFilter)   return false;
      // Date range compares as ISO yyyy-mm-dd strings — lex ordering
      // matches chronological ordering for this format, so no Date
      // constructor is needed.
      if (fromDate && (r.enrollmentDate ?? '') < fromDate) return false;
      if (toDate   && (r.enrollmentDate ?? '') > toDate)   return false;
      if (!needle) return true;
      const scheduleText = sched ? scheduleLabel(sched).toLowerCase() : '';
      return r.enrollmentNo.toLowerCase().includes(needle)
        || studentName(r.studentId).toLowerCase().includes(needle)
        || scheduleText.includes(needle);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, courseFilter, classroomFilter, teacherFilter, fromDate, toDate, studentName, scheduleById, courseName, classroomName]);

  const pagination = usePagination(filtered, 25);

  const filtersActive = !!(q.trim() || courseFilter || classroomFilter || teacherFilter
    || fromDate || toDate || statusFilter !== 'all');
  const clearFilters = () => {
    setQ('');
    setCourseFilter(''); setClassroomFilter('');
    setTeacherFilter(''); setFromDate(''); setToDate('');
    setStatusFilter('all');
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (e: enrollmentsApi.Enrollment) => {
    setEditing(e);
    setForm({
      enrollmentNo: e.enrollmentNo,
      studentId: e.studentId,
      courseScheduleId: e.courseScheduleId,
      enrollmentDate: e.enrollmentDate ?? null,
      currency: e.currency,
      exchangeRate: e.exchangeRate,
      unitPrice: e.unitPrice,
      quantity: e.quantity,
      notes: e.notes ?? '',
    });
    setDialogOpen(true);
  };

  // Auto-fill unit price from the picked schedule when the user
  // hasn't manually overridden. Only fires on schedule change and
  // only when the field is empty / matches the previous schedule's
  // default.
  const onScheduleChange = (courseScheduleId: string) => {
    setForm(f => {
      const next = { ...f, courseScheduleId };
      const picked = scheduleById(courseScheduleId);
      const prevPickedPrice = scheduleById(f.courseScheduleId)?.unitPrice;
      const priceUnchanged = f.unitPrice == null || f.unitPrice === prevPickedPrice;
      if (picked && priceUnchanged) next.unitPrice = picked.unitPrice ?? 0;
      return next;
    });
  };

  const submit = async () => {
    if (!form.studentId)        { toast.error('Pick a student'); return; }
    if (!form.courseScheduleId) { toast.error('Pick a course schedule'); return; }
    setSaving(true);
    try {
      if (editing) {
        await enrollmentsApi.update(editing.id, form);
        toast.success('Enrollment updated');
      } else {
        await enrollmentsApi.create(form);
        toast.success('Enrollment created');
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save enrollment');
    } finally {
      setSaving(false);
    }
  };

  const doTransition = async (r: enrollmentsApi.Enrollment, next: enrollmentsApi.EnrollmentStatus) => {
    // Completed and Withdrawn are terminal — the status can't be moved
    // back afterwards, so ask first.
    if (next === 'withdrawn' || next === 'completed') {
      const ok = await confirm(next === 'withdrawn'
        ? {
            title: 'Withdraw this enrollment?',
            message: `${r.enrollmentNo} will be marked Withdrawn. This can't be changed back.`,
            confirmLabel: 'Withdraw',
            variant: 'destructive',
          }
        : {
            title: 'Mark this enrollment completed?',
            message: `${r.enrollmentNo} will be marked Completed. This can't be changed back.`,
            confirmLabel: 'Complete',
            variant: 'destructive',
          });
      if (!ok) return;
    }
    try {
      await enrollmentsApi.transition(r.id, next);
      toast.success(`Moved to ${next}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status');
    }
  };

  const doDelete = async (target: enrollmentsApi.Enrollment) => {
    const ok = await confirm({
      title: 'Delete this enrollment?',
      message: `${target.enrollmentNo} will be removed permanently. This is only possible for enrollments that haven't been billed.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await enrollmentsApi.remove(target.id);
      toast.success('Enrollment deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete enrollment');
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <h1 className="text-3xl font-bold">Enrollments</h1>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={() => exportListToExcel({
              filename: 'Enrollments',
              sheetName: 'Enrollments',
              columns: [
                { header: 'No.',              value: r => r.enrollmentNo },
                { header: 'Student',          value: r => studentName(r.studentId) },
                { header: 'Course Schedule',  value: r => {
                    const s = scheduleById(r.courseScheduleId);
                    return s ? scheduleLabel(s) : '';
                  } },
                { header: 'Course',           value: r => {
                    const s = scheduleById(r.courseScheduleId);
                    return s ? (courseName.get(s.courseId) ?? '') : '';
                  } },
                { header: 'Classroom',        value: r => {
                    const s = scheduleById(r.courseScheduleId);
                    return s ? (classroomName.get(s.classroomId) ?? '') : '';
                  } },
                { header: 'Enroll Date',      value: r => r.enrollmentDate ?? '' },
                { header: 'Start Date',       value: r => scheduleById(r.courseScheduleId)?.startDate ?? '' },
                { header: 'End Date',         value: r => scheduleById(r.courseScheduleId)?.endDate ?? '' },
                { header: 'Fee',              value: r => Number(r.unitPrice ?? 0) },
                { header: 'Quantity',         value: r => Number(r.quantity ?? 1) },
                { header: 'Total',            value: r => Number(r.total ?? 0) },
                { header: 'Currency',         value: r => r.currency },
                { header: 'Sessions Attended',value: r => Number(r.attendedSessions ?? 0) },
                { header: 'Sessions Total',   value: r => Number(r.totalSessions ?? 0) },
                { header: 'Status',           value: r => r.status },
                { header: 'Invoice No.',      value: r => r.convertedInvoiceNo ?? '' },
                { header: 'Notes',            value: r => r.notes ?? '' },
              ],
              rows: filtered,
            })}
            disabled={filtered.length === 0}
            title={filtered.length === 0 ? 'Nothing to export' : 'Download the filtered rows as Excel'}
          >
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}
            title="Enrollment Settings — Courses, Classrooms, Schedules, Teachers">
            <Settings className="h-4 w-4" />
          </Button>
          {canAdd && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New Enrollment
            </Button>
          )}
        </div>
      </div>

      <EnrollmentSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <InvoicePreviewDialog
        open={!!previewInvoiceId}
        onOpenChange={o => { if (!o) setPreviewInvoiceId(null); }}
        invoiceId={previewInvoiceId}
        onNavigate={onNavigate}
      />

      <Card>
        <CardHeader className="pb-3">
          {/* Inline filter strip — mirrors the Transactions filter
              (v-transactions-filter-strip) for cross-page
              consistency: same select classes, From/To date range
              with muted labels, ghost Clear that only surfaces when
              a filter is active. */}
          <div className="filter-strip">
            <div className="relative shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search by number, student, or schedule…"
                className="h-9 pl-7 w-64 text-sm"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className={FILTER_SELECT_CLS}
              aria-label="Filter by status"
            >
              <option value="all">Status : All</option>
              <option value="enrolled">Status : Enrolled</option>
              <option value="active">Status : Active</option>
              <option value="completed">Status : Completed</option>
              <option value="withdrawn">Status : Withdrawn</option>
            </select>
            <select
              value={courseFilter}
              onChange={e => setCourseFilter(e.target.value)}
              className={`${FILTER_SELECT_CLS} max-w-[180px]`}
              aria-label="Filter by course"
            >
              <option value="">Course : All</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>Course : {c.name}</option>
              ))}
            </select>
            <select
              value={classroomFilter}
              onChange={e => setClassroomFilter(e.target.value)}
              className={`${FILTER_SELECT_CLS} max-w-[180px]`}
              aria-label="Filter by classroom"
            >
              <option value="">Classroom : All</option>
              {classrooms.map(r => (
                <option key={r.id} value={r.id}>Classroom : {r.name}</option>
              ))}
            </select>
            <select
              value={teacherFilter}
              onChange={e => setTeacherFilter(e.target.value)}
              className={`${FILTER_SELECT_CLS} max-w-[180px]`}
              aria-label="Filter by teacher"
            >
              <option value="">Teacher : All</option>
              {teachers.map(t => (
                <option key={t.apiId ?? t.id} value={t.apiId ?? t.id}>Teacher : {t.name}</option>
              ))}
            </select>
            <Label className="text-xs text-gray-500 shrink-0">From</Label>
            <div className="shrink-0"><DateInput value={fromDate || null} onChange={v => setFromDate(v ?? '')} max={toDate || undefined} /></div>
            <Label className="text-xs text-gray-500 shrink-0">To</Label>
            <div className="shrink-0"><DateInput value={toDate || null} onChange={v => setToDate(v ?? '')} min={fromDate || undefined} /></div>
            {/* One Clear that resets every filter, search included. */}
            {filtersActive && (
              <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
              <ListTable>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">No.</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Course Schedule</TableHead>
                    <TableHead className="w-[110px]">Enroll Date</TableHead>
                    <TableHead className="w-[110px]">Start Date</TableHead>
                    <TableHead className="w-[110px]">End Date</TableHead>
                    <TableHead className="w-[100px] text-right">Total</TableHead>
                    <TableHead className="w-[110px] text-right">Sessions</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="w-[140px]">Invoice No.</TableHead>
                    <TableHead className="w-[130px]">Registror</TableHead>
                    <TableHead className="text-right w-[96px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && rows.length === 0 ? (
                    <TableBodySkeletonRows rows={6} columns={12} />
                  ) : loadError && rows.length === 0 ? (
                    <ListError colSpan={12} message={loadError} onRetry={() => { void load(); }} />
                  ) : filtered.length === 0 ? (
                    <ListEmpty colSpan={12} noun="enrollments" filtered={filtersActive} />
                  ) : null}
                  {pagination.paginatedItems.map(r => {
                    const badge = STATUS_BADGES[r.status];
                    const sched = scheduleById(r.courseScheduleId);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium tabular-nums">{r.enrollmentNo}</TableCell>
                        <TableCell className="text-sm">{studentName(r.studentId)}</TableCell>
                        <TableCell className="text-sm text-gray-600">{sched ? scheduleLabel(sched) : '—'}</TableCell>
                        <TableCell className="text-sm text-gray-600 tabular-nums">{r.enrollmentDate ? formatDate(r.enrollmentDate) : '—'}</TableCell>
                        <TableCell className="text-sm text-gray-600 tabular-nums">{sched?.startDate ? formatDate(sched.startDate) : '—'}</TableCell>
                        <TableCell className="text-sm text-gray-600 tabular-nums">{sched?.endDate ? formatDate(sched.endDate) : '—'}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">
                          {r.total != null ? `${r.currency} ${formatMoneyForCurrency(r.total, r.currency)}` : '—'}
                        </TableCell>
                        <TableCell
                          className="text-sm text-right tabular-nums text-gray-600"
                          title="Present / total sessions to date (only rows marked Present count; future sessions excluded)"
                        >
                          {r.totalSessions
                            ? `${r.attendedSessions ?? 0} / ${r.totalSessions}`
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const options = NEXT_STATUS[r.status];
                            const isTerminal = options.length <= 1;
                            const disabled = isTerminal || !canEdit;
                            return (
                              <select
                                value={r.status}
                                disabled={disabled}
                                onChange={ev => {
                                  const next = ev.target.value as enrollmentsApi.EnrollmentStatus;
                                  if (next !== r.status) void doTransition(r, next);
                                }}
                                className={`h-7 text-xs rounded-full border px-2.5 py-0.5 font-medium capitalize appearance-none pr-6 bg-[right_0.3rem_center] bg-no-repeat cursor-pointer disabled:cursor-default disabled:opacity-90 ${badge.cls}`}
                                style={{
                                  backgroundImage: disabled ? 'none' :
                                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
                                }}
                                title={disabled ? `${badge.label} is a terminal state` : 'Change status'}
                              >
                                {options.map(s => (
                                  <option key={s} value={s}>{STATUS_BADGES[s].label}</option>
                                ))}
                              </select>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600 tabular-nums">
                          {r.convertedInvoiceNo && r.convertedInvoiceId ? (
                            <button
                              type="button"
                              className="text-emerald-700 hover:text-emerald-900 hover:underline underline-offset-2 cursor-pointer"
                              onClick={() => setPreviewInvoiceId(r.convertedInvoiceId!)}
                              title="Preview invoice"
                            >
                              {r.convertedInvoiceNo}
                            </button>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600 truncate max-w-[130px]" title={r.createdByName ?? ''}>
                          {r.createdByName ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1 flex-nowrap justify-end whitespace-nowrap">
                            {/* Invoice + payment are auto-minted on
                                enrollment save when the fee is > 0
                                (v-invoice-no-and-auto-payment), so no
                                manual "Invoice" button here. State
                                transitions live in the Status column
                                dropdown. */}
                            {canEdit && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)} title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canRemove && !r.convertedInvoiceId && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => doDelete(r)} title="Delete">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </ListTable>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              {editing ? `Edit ${editing.enrollmentNo}` : 'New enrollment'}
              <TooltipProvider delayDuration={120}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-gray-600"
                      aria-label="How enrollment works"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                    Pick a student + course schedule. Unit price defaults from
                    the schedule's tuition fee.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Pick a student + course schedule. Unit price defaults from the
              schedule's tuition fee.
            </DialogDescription>
            {/* v-doc-audit-line — creator / last editor, edit mode only */}
            {editing && (
              <DocAuditLine createdBy={editing.createdByName} updatedBy={editing.updatedByName} className="mt-1" />
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="enr-student" className="text-xs">
                  Student<span className="text-red-500"> *</span>
                </Label>
                <SearchablePicker
                  options={students.map(s => ({
                    value: s.id,
                    label: s.name,
                    secondary: s.phone ?? undefined,
                    searchKey: `${s.name} ${s.phone ?? ''}`,
                  }))}
                  value={form.studentId}
                  onChange={v => setForm(f => ({ ...f, studentId: v }))}
                  placeholder="— pick a student —"
                  searchPlaceholder="Search student by name or phone…"
                  allowClear={false}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enr-sched" className="text-xs">
                  Course Schedule<span className="text-red-500"> *</span>
                </Label>
                {/* Native <select> was truncating the composed
                    schedule label ("Course · Session · Room · Day
                    HH:mm–HH:mm +N"). SearchablePicker wraps + shows
                    the full text and adds fuzzy search. */}
                <SearchablePicker
                  options={schedules.map(s => ({
                    value: s.id,
                    label: scheduleLabel(s),
                    searchKey: scheduleLabel(s),
                  }))}
                  value={form.courseScheduleId}
                  onChange={onScheduleChange}
                  placeholder="— pick a schedule —"
                  searchPlaceholder="Search course · room · time…"
                  allowClear={false}
                />
                {/* Full-slot helper — the picker trigger truncates
                    the compact label, so once a schedule is chosen
                    surface all learn times + the date window inline
                    so the operator sees the full picture. */}
                {(() => {
                  const picked = scheduleById(form.courseScheduleId);
                  if (!picked) return null;
                  return (
                    <div className="rounded-md border bg-gray-50/60 px-2.5 py-1.5 text-[11px] leading-snug text-gray-600 space-y-0.5">
                      <div>
                        <span className="tabular-nums">{allLearnTimes(picked)}</span>
                      </div>
                      {(picked.startDate || picked.endDate) && (
                        <div className="tabular-nums">
                          <span className="text-gray-500">Dates: </span>
                          {picked.startDate ? formatDate(picked.startDate) : '—'} → {picked.endDate ? formatDate(picked.endDate) : '—'}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="enr-date" className="text-xs">Enrollment date</Label>
                <DateInput
                  value={form.enrollmentDate ?? null}
                  onChange={(v) => setForm(f => ({ ...f, enrollmentDate: v }))}
                  placeholder="Pick a date"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enr-fee" className="text-xs">Tuition fee</Label>
                <NumericInput
                  id="enr-fee"
                  decimals={form.currency === 'KHR' ? 0 : 2}
                  value={form.unitPrice == null ? '' : String(form.unitPrice)}
                  onChange={v => setForm(f => ({ ...f, unitPrice: v === '' ? null : Number(v) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enr-qty" className="text-xs">Quantity</Label>
                <NumericInput
                  id="enr-qty"
                  decimals={0}
                  value={form.quantity == null ? '' : String(form.quantity)}
                  onChange={v => setForm(f => ({ ...f, quantity: v === '' ? null : Number(v) }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enr-notes" className="text-xs">Notes</Label>
              <Input
                id="enr-notes"
                value={form.notes ?? ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
