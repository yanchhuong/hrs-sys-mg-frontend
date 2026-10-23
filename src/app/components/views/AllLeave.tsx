import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { DateInput } from '../common/DateInput';
import { TableBodySkeletonRows } from '../common/LoadingSkeletons';
import { ListEmpty, ListError } from '../common/ListStates';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { statusBadgeClass, TONE_CLASS } from '../../utils/statusTones';
import { useConfirm } from '../../context/ConfirmContext';
import { EmployeeCell } from '../common/EmployeeCell';
import { AuditCell } from '../common/AuditCell';
import { DocAuditLine } from '../common/DocAuditLine';
import { mockExceptions } from '../../data/timeworkData';
import { useI18n } from '../../i18n/I18nContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { mockEmployees } from '../../data/mockData';
import { useTeamScope, ScopeMode } from '../../hooks/useTeamScope';
import { ScopePicker } from '../common/ScopePicker';
import { Check, X, Plus, Search, Download, Eye } from 'lucide-react';
import { exportListToExcel } from '../../utils/excelExport';
import {
  format, isWithinInterval, parseISO, eachDayOfInterval,
} from 'date-fns';
import { toast } from 'sonner';
import { Employee } from '../../types/hrms';
import { AttendanceException } from '../../types/timework';
import * as leaveApi from '../../api/leave';
import * as employeesApi from '../../api/employees';
import * as departmentsApi from '../../api/departments';
import { USE_MOCKS } from '../../api/client';
import { makeDeptName } from '../../utils/deptName';
import { leaderOf } from '../../utils/managerLadder';

// Adapts a backend Employee to the front-end Employee shape. Mirrors
// Exception.tsx — see that file for the wider rationale on apiId/empNo.
function adaptApiEmployee(e: employeesApi.Employee): Employee {
  return {
    id: e.empNo,
    apiId: e.id,
    name: e.name,
    khmerName: e.khmerName ?? undefined,
    email: e.email,
    position: e.position,
    department: e.departmentId ?? '-',
    joinDate: e.joinDate,
    status: (e.status === 'active' ? 'active' : 'inactive') as Employee['status'],
    contactNumber: e.contactNumber ?? '',
    baseSalary: e.baseSalary,
    managerId: e.managerId ?? undefined,
    profileImage: e.profileImage ?? undefined,
    gender: (e.gender === 'male' || e.gender === 'female') ? e.gender : undefined,
    dateOfBirth: e.dateOfBirth ?? undefined,
    placeOfBirth: e.placeOfBirth ?? undefined,
    currentAddress: e.currentAddress ?? undefined,
    nffNo: e.nffNo ?? undefined,
    tid: e.tid ?? undefined,
    contractExpireDate: e.contractExpireDate ?? undefined,
    resignDate: e.resignDate ?? undefined,
  };
}

function narrowExceptionType(t: string): AttendanceException['type'] {
  const allowed: AttendanceException['type'][] = [
    'full', 'half_morning', 'half_noon',
    'missed_punch', 'late_arrival', 'early_leave', 'manual_correction',
  ] as unknown as AttendanceException['type'][];
  return (allowed as string[]).includes(t) ? (t as AttendanceException['type']) : ('full' as AttendanceException['type']);
}

function adaptApiLeave(r: leaveApi.LeaveRequest): AttendanceException {
  const status: AttendanceException['status'] =
    r.status === 'approved' || r.status === 'rejected' ? r.status : 'pending';
  return {
    id: r.id,
    employeeId: r.employeeId,
    date: r.date,
    // V49 — fall back to date so legacy clients keep showing the row.
    endDate: r.endDate ?? r.date,
    type: narrowExceptionType(r.type),
    // V47 category. Older rows that pre-date the migration are returned
    // as 'annual' by the backfill; defend in case the server is older.
    category: r.category ?? (r.isException ? 'exception' : 'annual'),
    reason: r.reason ?? '',
    status,
    submittedBy: r.employeeId,
    submittedAt: r.submittedAt,
    // The DTO field is approvedById; approvedBy never arrived, so the
    // detail's "Approved By" block could not render.
    approvedBy: r.approvedById ?? r.approvedBy ?? undefined,
    approvedAt: r.approvedAt ?? undefined,
    correctedCheckIn: r.correctedCheckIn ?? undefined,
    correctedCheckOut: r.correctedCheckOut ?? undefined,
    isException: r.isException ?? false,
    // v-doc-audit-line — keep the audit fields; they were dropped here,
    // which left the Author / Modifier columns blank.
    createdByName: r.createdByName ?? null,
    updatedByName: r.updatedByName ?? null,
    updatedAt: r.updatedAt ?? null,
  };
}

/** Categories the AllLeave page exposes on its Submit Leave dialog.
 *  Annual / Sick / Special deduct from balances; Maternity is filed from
 *  here too (90-day paid leave) but does NOT deduct. Pure on-site /
 *  mission "Exception" stays Attendance-only since it usually comes
 *  with attendance corrections, not a leave request. */
const LEAVE_CATEGORIES_DEDUCTIBLE = [
  { value: 'annual',    label: 'Annual Leave',    hint: 'Deducts from annual leave balance' },
  { value: 'sick',      label: 'Sick Leave',      hint: 'Cert required > 3 consecutive days' },
  { value: 'special',   label: 'Special Leave',   hint: 'Marriage / bereavement / family — pulls from AL first' },
  { value: 'maternity', label: 'Maternity Leave', hint: '90-day paid leave — does NOT deduct from annual leave' },
] as const;

/** Tailwind classes per category — used by the table badge. Kept in
 *  one place so AllLeave + Exception render the same colours. */
export const LEAVE_CATEGORY_STYLES: Record<string, string> = {
  annual:    'bg-blue-100 text-blue-800 hover:bg-blue-100',
  sick:      'bg-rose-100 text-rose-800 hover:bg-rose-100',
  // Exception is violet on Attendance, so it is violet here too;
  // Special moved to indigo to keep the two apart.
  special:   'bg-indigo-100 text-indigo-800 hover:bg-indigo-100',
  maternity: 'bg-pink-100 text-pink-800 hover:bg-pink-100',
  exception: 'bg-violet-100 text-violet-800 hover:bg-violet-100',
};
export const LEAVE_CATEGORY_LABELS: Record<string, string> = {
  annual:    'Annual',
  sick:      'Sick',
  special:   'Special',
  maternity: 'Maternity',
  exception: 'Exception',
};

export function AllLeave() {
  const { t } = useI18n();
  const { formatDate, formatDateTime } = useDateFormat();
  const confirm = useConfirm();
  const [leaves, setLeaves] = useState<AttendanceException[]>(USE_MOCKS ? mockExceptions : []);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [loading, setLoading] = useState<boolean>(!USE_MOCKS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deptList, setDeptList] = useState<departmentsApi.Department[]>([]);
  const deptName = makeDeptName(deptList, '');
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });

  // Status tabs only — the Exception axis lives on its own menu now.
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  /** Leave-type filter — narrows the listing to one category. 'all'
   *  shows everything. */
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'annual' | 'sick' | 'special' | 'maternity' | 'exception'>('all');
  const [search, setSearch] = useState('');

  // Submit-leave dialog state.
  const [dialogOpen, setDialogOpen] = useState(false);
  /** Start date of the leave window. */
  const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  /** Inclusive end date. Equals newDate for single-day leaves.
   *  Auto-set to start+89 when Maternity is selected (90-day window). */
  const [newEndDate, setNewEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  /** Category — Annual / Sick / Special / Maternity. Pure Exception
   *  lives on the Attendance → Mark Exception flow only. */
  const [newCategory, setNewCategory] = useState<'annual' | 'sick' | 'special' | 'maternity'>('annual');
  /** Duration — independent from category. Half-day implies single-day. */
  const [newDuration, setNewDuration] = useState<'full' | 'half_morning' | 'half_noon'>('full');
  const [newReason, setNewReason] = useState('');
  const [newCorrectedIn, setNewCorrectedIn] = useState('');
  const [newCorrectedOut, setNewCorrectedOut] = useState('');

  /** Auto-fill End Date when category switches to Maternity (90 days
   *  inclusive = start + 89 days). For any other category, leave the
   *  end date alone so the user can keep their existing pick. */
  const handleCategoryChange = (cat: typeof newCategory) => {
    setNewCategory(cat);
    if (cat === 'maternity' && newDate) {
      const start = parseISO(newDate);
      const end = new Date(start.getTime());
      end.setDate(end.getDate() + 89);
      setNewEndDate(format(end, 'yyyy-MM-dd'));
      setNewDuration('full');
    } else if (newEndDate < newDate || newEndDate === '') {
      setNewEndDate(newDate);
    }
  };

  /** Half-day duration is inherently single-day — keep the dates in
   *  lockstep when the user flips into a half. */
  const handleDurationChange = (dur: typeof newDuration) => {
    setNewDuration(dur);
    if (dur !== 'full') setNewEndDate(newDate);
  };

  const [viewTarget, setViewTarget] = useState<AttendanceException | null>(null);

  const {
    role,
    isEmployee,
    isManager,
    isTenantWide,
    showScopePicker,
    matchesScope,
    canApproveFor: canApproveLeaveOf,
  } = useTeamScope();
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');


  const loadLeaves = async () => {
    if (USE_MOCKS) {
      setLeaves([...mockExceptions]);
      return;
    }
    setLoading(true);
    try {
      const res = await leaveApi.list({
        from: dateFilter.start || undefined,
        to: dateFilter.end || undefined,
        size: 500,
      });
      setLeaves(res.data.map(adaptApiLeave));
      setLoadError(null);
    } catch (err) {
      // Inline error + Retry instead of a toast over an empty table.
      setLoadError(err instanceof Error ? err.message : 'Failed to load leave requests');
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    if (USE_MOCKS) {
      setEmployees([...mockEmployees]);
      return;
    }
    try {
      const res = await employeesApi.list({ size: 500 });
      setEmployees(res.content.map(adaptApiEmployee));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load employees');
    }
  };

  const loadDepartments = async () => {
    if (USE_MOCKS) return;
    try {
      setDeptList(await departmentsApi.list());
    } catch (err) {
      console.warn('Could not load departments', err);
    }
  };

  useEffect(() => {
    void loadEmployees();
    void loadDepartments();
    void loadLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (USE_MOCKS) return;
    void loadLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter.start, dateFilter.end]);

  const handleApprove = async (id: string) => {
    if (USE_MOCKS) {
      setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: 'approved' } : l));
      toast.success('Leave approved');
      return;
    }
    try {
      await leaveApi.approve(id);
      toast.success('Leave approved');
      await loadLeaves();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve leave');
    }
  };

  const handleReject = async (id: string) => {
    const ok = await confirm({
      title: 'Reject this leave request?',
      message: 'The employee will see the request as rejected.',
      confirmLabel: 'Reject',
      variant: 'destructive',
    });
    if (!ok) return;
    if (USE_MOCKS) {
      setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: 'rejected' } : l));
      toast.success('Leave rejected');
      return;
    }
    try {
      await leaveApi.reject(id);
      // The reject succeeded — a red error toast read as a failure.
      toast.success('Leave rejected');
      await loadLeaves();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject leave');
    }
  };

  /** Inclusive day count for the current date range. Half-day durations
   *  always count as 0.5; multi-day ranges always full days at the edges
   *  (mid-range half-days are no longer modelled — Cambodian leave law
   *  doesn't need that complexity, and Maternity is the dominant range
   *  use case). */
  const totalDays = (() => {
    if (!newDate || !newEndDate) return 0;
    const s = parseISO(newDate);
    const e = parseISO(newEndDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
    const dayCount = eachDayOfInterval({ start: s, end: e }).length;
    if (newDuration !== 'full') return 0.5; // half-day implies single-day
    return dayCount;
  })();

  const handleSubmitNew = async () => {
    if (!newReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    if (totalDays <= 0) {
      toast.error('End date must be on or after start date');
      return;
    }
    if (USE_MOCKS) {
      toast.success('Leave submitted for approval');
      setDialogOpen(false);
      setNewReason('');
      setNewCorrectedIn('');
      setNewCorrectedOut('');
      return;
    }

    try {
      await leaveApi.create({
        date: newDate,
        endDate: newEndDate,
        days: totalDays,
        halfDay: newDuration !== 'full',
        type: newDuration,
        category: newCategory,
        reason: newReason,
        correctedCheckIn: newCorrectedIn || undefined,
        correctedCheckOut: newCorrectedOut || undefined,
      });
      toast.success(
        totalDays === 1
          ? 'Leave submitted for approval'
          : `Leave submitted for approval (${totalDays} days)`,
      );
      setDialogOpen(false);
      setNewReason('');
      setNewCorrectedIn('');
      setNewCorrectedOut('');
      await loadLeaves();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit leave request');
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      full:         'Full',
      half_morning: 'Half Morning',
      half_noon:    'Half Noon',
      missed_punch: 'Full',
      late_arrival: 'Half Morning',
      early_leave: 'Half Noon',
      manual_correction: 'Full',
    };
    return labels[type] || type;
  };

  // Shared status palette — Pending amber, Approved green, Rejected red.
  const getStatusBadge = (status: string) => statusBadgeClass(status);

  const hasFilters = !!(
    search || categoryFilter !== 'all' || statusFilter !== 'all'
    || dateFilter.start || dateFilter.end
  );
  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setDateFilter({ start: null, end: null });
  };

  let filteredLeaves = leaves;

  if (!isTenantWide) {
    filteredLeaves = filteredLeaves.filter(e => matchesScope(e.employeeId, scopeMode, employees));
  }

  if (dateFilter.start || dateFilter.end) {
    filteredLeaves = filteredLeaves.filter(exc => {
      const excDate = parseISO(exc.date);
      if (dateFilter.start && dateFilter.end) {
        return isWithinInterval(excDate, {
          start: parseISO(dateFilter.start),
          end: parseISO(dateFilter.end),
        });
      } else if (dateFilter.start) {
        return excDate >= parseISO(dateFilter.start);
      } else if (dateFilter.end) {
        return excDate <= parseISO(dateFilter.end);
      }
      return true;
    });
  }

  const kw = search.trim().toLowerCase();
  if (kw) {
    filteredLeaves = filteredLeaves.filter(exc => {
      const emp = employees.find(e => e.id === exc.employeeId || (e as any).apiId === exc.employeeId);
      const hay = `${emp?.name ?? ''} ${emp?.id ?? ''} ${deptName(emp?.department)} ${exc.reason ?? ''}`.toLowerCase();
      return hay.includes(kw);
    });
  }

  // Apply the leave-type filter AFTER status counts so the tab badges
  // still show the totals for "all categories" — picking a category
  // re-filters the body without making the tab badges feel wrong.
  const categoryFiltered = categoryFilter === 'all'
    ? filteredLeaves
    : filteredLeaves.filter((e) => (e.category ?? 'annual') === categoryFilter);

  const statusCounts = {
    all: categoryFiltered.length,
    pending: categoryFiltered.filter((e) => e.status === 'pending').length,
    approved: categoryFiltered.filter((e) => e.status === 'approved').length,
    rejected: categoryFiltered.filter((e) => e.status === 'rejected').length,
  };

  const statusFiltered = statusFilter === 'all'
    ? categoryFiltered
    : categoryFiltered.filter((e) => e.status === statusFilter);

  const sortedLeaves = [...statusFiltered].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
  });

  const leavesPagination = usePagination(sortedLeaves, 10);

  useEffect(() => {
    leavesPagination.resetPage();
  }, [dateFilter, statusFilter, categoryFilter, scopeMode, search]);

  // Excel export — mirrors the on-screen columns and honours the current
  // filters (date range, keyword search, scope, category, status tab).
  const handleExportExcel = () => {
    exportListToExcel({
      filename: 'AllLeave',
      sheetName: 'Leave Requests',
      columns: [
        { header: 'Employee ID', value: r => employees.find(e => e.id === r.employeeId || (e as any).apiId === r.employeeId)?.id ?? r.employeeId },
        { header: 'Employee', value: r => employees.find(e => e.id === r.employeeId || (e as any).apiId === r.employeeId)?.name ?? '-' },
        { header: 'Department', value: r => deptName(employees.find(e => e.id === r.employeeId || (e as any).apiId === r.employeeId)?.department) },
        { header: 'Start Date', value: r => r.date },
        { header: 'End Date', value: r => r.endDate ?? r.date },
        { header: 'Category', value: r => r.category ? (LEAVE_CATEGORY_LABELS[r.category] ?? r.category) : '' },
        { header: 'Duration', value: r => getTypeLabel(r.type) },
        { header: 'Reason', value: r => r.reason ?? '' },
        { header: 'Status', value: r => r.status },
        { header: 'Submitted', value: r => r.submittedAt ?? '' },
        { header: 'Author', value: r => (r as any).createdByName ?? '' },
        { header: 'Modifier', value: r => (r as any).updatedByName ?? '' },
      ],
      rows: sortedLeaves,
    });
  };

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <h1 className="text-3xl font-bold">{t('page.allleave.title')}</h1>
        <div className="flex items-center gap-2">
          {showScopePicker && <ScopePicker value={scopeMode} onChange={setScopeMode} />}
          <Button
            variant="outline"
            size="icon"
            onClick={handleExportExcel}
            disabled={sortedLeaves.length === 0}
            title="Download Excel"
          >
            <Download className="h-4 w-4" />
          </Button>
          {isEmployee && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Leave Request
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Submit Leave Request</DialogTitle>
                  <DialogDescription>
                    Your manager will review and approve this request
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Category — Annual / Sick / Special / Maternity.
                      Pure Exception is filed from Attendance → Mark
                      Exception, not here. */}
                  <div className="space-y-2">
                    <Label htmlFor="lv-category">Leave Type</Label>
                    <Select
                      value={newCategory}
                      onValueChange={(v) => handleCategoryChange(v as typeof newCategory)}
                    >
                      <SelectTrigger id="lv-category" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAVE_CATEGORIES_DEDUCTIBLE.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-gray-500">
                      {LEAVE_CATEGORIES_DEDUCTIBLE.find(c => c.value === newCategory)?.hint}
                    </p>
                  </div>
                  {/* Duration — Full / Half. Half-day implies single-day
                      (end_date gets locked to start_date below). */}
                  <div className="space-y-2">
                    <Label htmlFor="lv-duration">Duration</Label>
                    <Select
                      value={newDuration}
                      onValueChange={(v) => handleDurationChange(v as typeof newDuration)}
                    >
                      <SelectTrigger id="lv-duration" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full Day</SelectItem>
                        {/* Wording matches the badge labels above and the
                            Telegram bot's duration buttons — the same leave
                            should read the same in every surface. */}
                        <SelectItem value="half_morning">Half Morning</SelectItem>
                        <SelectItem value="half_noon">Half Noon</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Date range — Start + End. End is read-only for
                      half-day durations. For Maternity it auto-fills to
                      Start + 89 days (90-day inclusive window). */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Start Date <span className="text-red-500">*</span></Label>
                      <DateInput
                        value={newDate}
                        className="w-full"
                        clearable={false}
                        onChange={(val) => {
                          const v = val ?? '';
                          setNewDate(v);
                          if (newDuration !== 'full') setNewEndDate(v);
                          else if (newCategory === 'maternity' && v) {
                            const s = parseISO(v);
                            const end = new Date(s.getTime());
                            end.setDate(end.getDate() + 89);
                            setNewEndDate(format(end, 'yyyy-MM-dd'));
                          } else if (newEndDate < v) {
                            setNewEndDate(v);
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date <span className="text-red-500">*</span></Label>
                      <DateInput
                        value={newEndDate}
                        min={newDate}
                        className="w-full"
                        clearable={false}
                        disabled={newDuration !== 'full'}
                        onChange={(v) => setNewEndDate(v ?? '')}
                      />
                    </div>
                  </div>
                  {totalDays > 0 ? (
                    <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
                      Total: <span className="font-semibold">{totalDays} day{totalDays === 1 ? '' : 's'}</span>
                      {newCategory === 'maternity' && (
                        <span className="ml-2 text-blue-700">(Maternity — does not deduct from annual leave)</span>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                      End date must be on or after start date.
                    </div>
                  )}
                  {(newDuration === 'half_morning' || newDuration === 'half_noon') && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="lv-in">Corrected Check-in</Label>
                        <Input
                          id="lv-in"
                          type="time"
                          value={newCorrectedIn}
                          onChange={(e) => setNewCorrectedIn(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lv-out">Corrected Check-out</Label>
                        <Input
                          id="lv-out"
                          type="time"
                          value={newCorrectedOut}
                          onChange={(e) => setNewCorrectedOut(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="lv-reason">Reason <span className="text-red-500">*</span></Label>
                    <Textarea
                      id="lv-reason"
                      placeholder="Explain why you need this leave…"
                      value={newReason}
                      onChange={(e) => setNewReason(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSubmitNew}>Submit Leave</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          {/* One filter strip, Transactions-style: status tabs, search,
              Leave Type, From / To and a single Clear that resets all. */}
          <div className="filter-strip">
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <TabsList>
                <TabsTrigger value="all">
                  All
                  <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{statusCounts.all}</Badge>
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending
                  <Badge variant="outline" className={`ml-1.5 h-5 px-1.5 text-[10px] ${TONE_CLASS.attention}`}>{statusCounts.pending}</Badge>
                </TabsTrigger>
                <TabsTrigger value="approved">
                  Approved
                  <Badge variant="outline" className={`ml-1.5 h-5 px-1.5 text-[10px] ${TONE_CLASS.success}`}>{statusCounts.approved}</Badge>
                </TabsTrigger>
                <TabsTrigger value="rejected">
                  Rejected
                  <Badge variant="outline" className={`ml-1.5 h-5 px-1.5 text-[10px] ${TONE_CLASS.danger}`}>{statusCounts.rejected}</Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee, department, reason…"
                className="h-9 pl-7 w-64 text-sm"
              />
            </div>
            {/* Leave Type filter — values match the LeaveCategory enum. */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Filter by leave type"
            >
              <option value="all">Leave Type : All</option>
              <option value="annual">Leave Type : Annual</option>
              <option value="sick">Leave Type : Sick</option>
              <option value="special">Leave Type : Special</option>
              <option value="maternity">Leave Type : Maternity</option>
              <option value="exception">Leave Type : Exception</option>
            </select>
            <Label className="text-xs text-gray-500 shrink-0">From</Label>
            <div className="shrink-0">
              <DateInput
                value={dateFilter.start}
                onChange={v => setDateFilter(f => ({ ...f, start: v || null }))}
                max={dateFilter.end || undefined}
              />
            </div>
            <Label className="text-xs text-gray-500 shrink-0">To</Label>
            <div className="shrink-0">
              <DateInput
                value={dateFilter.end}
                onChange={v => setDateFilter(f => ({ ...f, end: v || null }))}
                min={dateFilter.start || undefined}
              />
            </div>
            {hasFilters && (
              <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Dept/Group</TableHead>
                <TableHead>Leader</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Leave Type</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Modifier</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && leaves.length === 0 ? (
                <TableBodySkeletonRows rows={6} columns={13} />
              ) : loadError && leaves.length === 0 ? (
                <ListError colSpan={13} message={loadError} onRetry={() => void loadLeaves()} />
              ) : leavesPagination.paginatedItems.length === 0 ? (
                <ListEmpty colSpan={13} noun="leave requests" filtered={hasFilters} />
              ) : null}
              {leavesPagination.paginatedItems.map((leave) => {
                const employee = employees.find(
                  (e) => e.id === leave.employeeId || (e as any).apiId === leave.employeeId,
                );
                const leader = leaderOf(employee, employees);
                const isPending = leave.status === 'pending';
                const canActOnThis = isPending && canApproveLeaveOf(leave.employeeId, employees);
                return (
                  <TableRow key={leave.id} className={`hover:bg-gray-50 ${isPending ? 'bg-amber-50/50' : ''}`}>
                    <TableCell>
                      <EmployeeCell employee={employee} subtitle={employee?.id} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {deptName(employee?.department)
                        ? <Badge variant="outline" className="font-normal">{deptName(employee?.department)}</Badge>
                        : <span className="text-gray-400">—</span>}
                    </TableCell>
                    <TableCell>
                      {/* Blank, not a placeholder: an employee at the top
                          of the org has no leader by design, and "No leader
                          assigned" reads as data somebody forgot to fill in. */}
                      {leader && <EmployeeCell employee={leader} subtitle={leader.position} />}
                    </TableCell>
                    <TableCell>{formatDate(leave.date)}</TableCell>
                    <TableCell>
                      {formatDate(leave.endDate ?? leave.date)}
                    </TableCell>
                    <TableCell>
                      {leave.category ? (
                        <Badge className={LEAVE_CATEGORY_STYLES[leave.category]}>
                          {LEAVE_CATEGORY_LABELS[leave.category]}
                        </Badge>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTypeLabel(leave.type)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={leave.reason}>
                      {leave.reason || <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusBadge(leave.status)}>
                        {leave.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {formatDateTime(leave.submittedAt)}
                    </TableCell>
                    <TableCell>
                      <AuditCell
                        name={(leave as any).createdByName}
                        at={(leave as any).submittedAt}
                      />
                    </TableCell>
                    <TableCell>
                      <AuditCell
                        name={(leave as any).updatedByName}
                        at={(leave as any).updatedAt}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {canActOnThis ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-700 hover:bg-green-50 hover:text-green-800"
                            onClick={() => handleApprove(leave.id)}
                            title="Approve"
                            aria-label="Approve"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => handleReject(leave.id)}
                            title="Reject"
                            aria-label="Reject"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : isPending && role !== 'admin' ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-gray-500"
                          title="Only this employee's direct leader can approve."
                        >
                          <X className="h-3 w-3 mr-1" />
                          {isManager ? 'Not your team' : 'Awaiting leader'}
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setViewTarget(leave)}
                          title="View (read-only). Approve / Reject is only available while pending."
                          aria-label="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={leavesPagination.currentPage}
            totalPages={leavesPagination.totalPages}
            onPageChange={leavesPagination.goToPage}
            startIndex={leavesPagination.startIndex}
            endIndex={leavesPagination.endIndex}
            totalItems={leavesPagination.totalItems}
          />
        </CardContent>
      </Card>

      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Leave Detail</DialogTitle>
            <DialogDescription>
              Read-only view. Approve / Reject is only available while pending.
            </DialogDescription>
            {/* v-doc-audit-line — creator / last editor under the meta row */}
            {viewTarget && (
              <DocAuditLine createdBy={viewTarget.createdByName} updatedBy={viewTarget.updatedByName} className="mt-1" />
            )}
          </DialogHeader>
          {viewTarget && (() => {
            const employee = employees.find(
              (e) => e.id === viewTarget.employeeId || (e as any).apiId === viewTarget.employeeId,
            );
            const approver = viewTarget.approvedBy
              ? employees.find(
                  (e) => e.id === viewTarget.approvedBy || (e as any).apiId === viewTarget.approvedBy,
                )
              : null;
            const safeFmt = (s: string | undefined, withTime: boolean) => {
              if (!s) return '—';
              const d = new Date(s);
              if (Number.isNaN(d.getTime())) return '—';
              return withTime ? formatDateTime(s) : formatDate(s);
            };
            return (
              <div className="space-y-3 text-sm">
                <div className="p-3 rounded-md border">
                  <EmployeeCell employee={employee} subtitle={employee?.id} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Start Date</p>
                    <p className="font-medium">{safeFmt(viewTarget.date, false)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">End Date</p>
                    <p className="font-medium">{safeFmt(viewTarget.endDate ?? viewTarget.date, false)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Leave Type</p>
                    <p>
                      {viewTarget.category ? (
                        <Badge className={LEAVE_CATEGORY_STYLES[viewTarget.category]}>
                          {LEAVE_CATEGORY_LABELS[viewTarget.category] ?? viewTarget.category}
                        </Badge>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Duration</p>
                    <p><Badge variant="outline">{getTypeLabel(viewTarget.type)}</Badge></p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Status</p>
                    <p><Badge variant="outline" className={getStatusBadge(viewTarget.status)}>{viewTarget.status}</Badge></p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Submitted</p>
                    <p className="font-medium">{safeFmt(viewTarget.submittedAt, true)}</p>
                  </div>
                </div>
                {viewTarget.correctedCheckIn || viewTarget.correctedCheckOut ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500">Corrected Check-in</p>
                      <p className="font-medium">{viewTarget.correctedCheckIn || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Corrected Check-out</p>
                      <p className="font-medium">{viewTarget.correctedCheckOut || '—'}</p>
                    </div>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs text-gray-500">Reason</p>
                  <p className="whitespace-pre-wrap">{viewTarget.reason || <span className="text-gray-300">—</span>}</p>
                </div>
                {/* "Remark" (notes) removed — leave requests carry no notes
                    field, so it always read "—". */}
                {(approver || viewTarget.approvedAt) && viewTarget.status !== 'pending' && (
                  <div>
                    <p className="text-xs text-gray-500">{viewTarget.status === 'rejected' ? 'Rejected' : 'Approved'}{approver ? ' By' : ''}</p>
                    {approver && <p className="font-medium">{approver.name}</p>}
                    {viewTarget.approvedAt && (
                      <p className="text-xs text-gray-500">{safeFmt(viewTarget.approvedAt, true)}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
