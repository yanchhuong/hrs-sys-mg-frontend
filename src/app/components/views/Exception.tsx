import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
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
import { DateInput } from '../common/DateInput';
import { TableBodySkeletonRows } from '../common/LoadingSkeletons';
import { ListEmpty, ListError } from '../common/ListStates';
import { useConfirm } from '../../context/ConfirmContext';
import { statusBadgeClass } from '../../utils/statusTones';
import { EmployeeCell } from '../common/EmployeeCell';
import { AuditCell } from '../common/AuditCell';
import { mockExceptions } from '../../data/timeworkData';
import { useI18n } from '../../i18n/I18nContext';
import { mockEmployees } from '../../data/mockData';
import { useTeamScope, ScopeMode } from '../../hooks/useTeamScope';
import { ScopePicker } from '../common/ScopePicker';
import { Search, Pencil, RotateCcw } from 'lucide-react';
import { isWithinInterval, parseISO } from 'date-fns';
import { useDateFormat } from '../../context/DateFormatContext';
import { toast } from 'sonner';
import { Employee } from '../../types/hrms';
import { AttendanceException } from '../../types/timework';
import * as leaveApi from '../../api/leave';
import * as employeesApi from '../../api/employees';
import * as departmentsApi from '../../api/departments';
import { USE_MOCKS } from '../../api/client';
import { makeDeptName } from '../../utils/deptName';

// Adapts a backend Employee to the front-end Employee shape used by this
// view. Mirrors the pattern from AllLeave.tsx / Employees.tsx.
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
    // Payroll-affecting columns this screen never shows, carried ONLY so the
    // full-replace PUTs below can round-trip them. EmployeeService coerces a
    // missing allowance to ZERO (not "leave alone") and assigns maritalStatus
    // unconditionally, so omitting them silently zeroed real money on every
    // save from here — the allowances feed the payslip, the AL-remain payout
    // and the seniority indemnity base.
    maritalStatus: (e.maritalStatus === 'single' || e.maritalStatus === 'married'
      || e.maritalStatus === 'divorced' || e.maritalStatus === 'widowed')
      ? e.maritalStatus : undefined,
    positionAllowance: e.positionAllowance ?? 0,
    evaluationAllowance: e.evaluationAllowance ?? 0,
    nffNo: e.nffNo ?? undefined,
    tid: e.tid ?? undefined,
    // Carried purely so the PUT bodies below can round-trip them. The
    // employees endpoint is a full replace — EmployeeService assigns
    // tidType / nationalityType / visaExpireDate unconditionally, so a
    // key this screen omits is persisted as NULL. Editing one Exception
    // remark used to erase a foreign employee's passport flag and visa
    // expiry. Nothing on this screen renders them.
    tidType: (e.tidType ?? undefined) as 'PA' | 'TID' | undefined,
    nationalityType: (e.nationalityType ?? undefined) as 'national_id' | 'passport' | undefined,
    visaExpireDate: e.visaExpireDate ?? undefined,
    contractExpireDate: e.contractExpireDate ?? undefined,
    resignDate: e.resignDate ?? undefined,
    attendanceYn: e.attendanceYn ?? true,
    // V51 — Long-term Exception bookkeeping. Pre-V51 rows have null
    // start date; the table falls back to {@link updatedAt} for those.
    attendanceExceptionStartDate: e.attendanceExceptionStartDate ?? undefined,
    attendanceExceptionEndDate: e.attendanceExceptionEndDate ?? undefined,
    attendanceExceptionRemark: e.attendanceExceptionRemark ?? undefined,
    // TOS dependent-claim flags + child count — full-replace PUT, so a
    // missing key would reset them and silently change the payslip's
    // dependent deduction.
    numberOfChildren: e.numberOfChildren ?? 0,
    decouple: e.decouple ?? false,
    claimSpouse: e.claimSpouse ?? false,
    updatedAt: e.updatedAt ?? undefined,
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
    endDate: r.endDate ?? r.date,
    type: narrowExceptionType(r.type),
    category: r.category ?? (r.isException ? 'exception' : 'annual'),
    reason: r.reason ?? '',
    status,
    submittedBy: r.employeeId,
    submittedAt: r.submittedAt,
    approvedBy: r.approvedBy ?? undefined,
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

/** Categories that surface on the Day Exception sub-view — the
 *  non-deductible flavours of leave. */
const NON_DEDUCTIBLE_CATEGORIES = new Set(['maternity', 'exception']);

const CATEGORY_BADGE: Record<string, string> = {
  annual:    'bg-blue-100 text-blue-800 hover:bg-blue-100',
  sick:      'bg-rose-100 text-rose-800 hover:bg-rose-100',
  special:   'bg-violet-100 text-violet-800 hover:bg-violet-100',
  maternity: 'bg-pink-100 text-pink-800 hover:bg-pink-100',
  exception: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
};
const CATEGORY_LABEL: Record<string, string> = {
  annual:    'Annual',
  sick:      'Sick',
  special:   'Special',
  maternity: 'Maternity',
  exception: 'Exception',
};

export function Exception() {
  const { t } = useI18n();
  const { formatDate, formatDateTime } = useDateFormat();
  const [leaves, setLeaves] = useState<AttendanceException[]>(USE_MOCKS ? mockExceptions : []);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const confirm = useConfirm();
  const [loading, setLoading] = useState<boolean>(!USE_MOCKS);
  const [loadingEmps, setLoadingEmps] = useState<boolean>(!USE_MOCKS);
  const [leavesError, setLeavesError] = useState<string | null>(null);
  const [empsError, setEmpsError] = useState<string | null>(null);
  // Raw API rows keyed by empNo — spread into the full-replace PUTs so
  // every column this screen doesn't model (decouple, claimSpouse,
  // numberOfChildren, level, clinicalRole, …) round-trips unchanged.
  const [rawEmps, setRawEmps] = useState<Record<string, employeesApi.Employee>>({});
  const [deptList, setDeptList] = useState<departmentsApi.Department[]>([]);
  const deptName = makeDeptName(deptList, '');
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });

  /** Top-level mode for this page: Long-term (employee-level attendanceYn=false)
   *  vs Day (per-leave-row is_exception flag). No status tabs — Day Exception
   *  rows are typically auto-approved or out-of-band, and the Long-term axis
   *  has no status to filter on. */
  const [mode, setMode] = useState<'employee' | 'day'>('employee');
  const [search, setSearch] = useState('');

  const {
    isTenantWide,
    showScopePicker,
    matchesScope,
  } = useTeamScope();
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');

  const loadLeaves = async () => {
    if (USE_MOCKS) {
      setLeaves([...mockExceptions]);
      return;
    }
    setLoading(true);
    setLeavesError(null);
    try {
      const res = await leaveApi.list({
        from: dateFilter.start || undefined,
        to: dateFilter.end || undefined,
        size: 500,
      });
      setLeaves(res.data.map(adaptApiLeave));
    } catch (err) {
      setLeavesError(err instanceof Error ? err.message : 'Failed to load leave requests');
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    if (USE_MOCKS) {
      setEmployees([...mockEmployees]);
      return;
    }
    setLoadingEmps(true);
    setEmpsError(null);
    try {
      const res = await employeesApi.list({ size: 500 });
      setEmployees(res.content.map(adaptApiEmployee));
      setRawEmps(Object.fromEntries(res.content.map(r => [r.empNo, r])));
    } catch (err) {
      setEmpsError(err instanceof Error ? err.message : 'Failed to load employees');
    } finally {
      setLoadingEmps(false);
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

  // Edit-Exception dialog state. Lets HR set the Start / End / Remark
  // on a Long-term Exception row without flipping the attendanceYn flag.
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editRemark, setEditRemark] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const openEditExceptionDialog = (emp: Employee) => {
    setEditEmp(emp);
    setEditStartDate(emp.attendanceExceptionStartDate
      ?? (emp.updatedAt ? emp.updatedAt.slice(0, 10) : ''));
    setEditEndDate(emp.attendanceExceptionEndDate ?? '');
    setEditRemark(emp.attendanceExceptionRemark ?? '');
  };

  const handleSaveEditException = async () => {
    if (!editEmp) return;
    if (editEndDate && editStartDate && editEndDate < editStartDate) {
      toast.error('End Date must be on or after Start Date');
      return;
    }
    setEditSaving(true);
    try {
      if (USE_MOCKS) {
        setEmployees(prev => prev.map(e => e.id === editEmp.id ? {
          ...e,
          attendanceExceptionStartDate: editStartDate || undefined,
          attendanceExceptionEndDate:   editEndDate   || undefined,
          attendanceExceptionRemark:    editRemark    || undefined,
        } : e));
        toast.success('Exception details updated');
        setEditEmp(null);
        return;
      }
      const targetId = (editEmp as Employee & { apiId?: string }).apiId ?? editEmp.id;
      const body: employeesApi.CreateEmployeeRequest = {
        ...(rawEmps[editEmp.id] as unknown as employeesApi.CreateEmployeeRequest | undefined),
        empNo: editEmp.id,
        name: editEmp.name,
        khmerName: editEmp.khmerName,
        email: editEmp.email,
        position: editEmp.position,
        departmentId: editEmp.department && editEmp.department !== '-' ? editEmp.department : null,
        joinDate: editEmp.joinDate,
        baseSalary: editEmp.baseSalary,
        managerId: editEmp.managerId ?? null,
        gender: editEmp.gender,
        dateOfBirth: editEmp.dateOfBirth,
        placeOfBirth: editEmp.placeOfBirth,
        contactNumber: editEmp.contactNumber,
        currentAddress: editEmp.currentAddress,
        nffNo: editEmp.nffNo,
        // Full-replace PUT: a missing allowance is coerced to ZERO server-side.
        positionAllowance: editEmp.positionAllowance ?? 0,
        evaluationAllowance: editEmp.evaluationAllowance ?? 0,
        maritalStatus: editEmp.maritalStatus ?? null,
        tid: editEmp.tid,
        // Full-replace PUT — omitting these nulls them server-side.
        tidType: editEmp.tidType ?? null,
        nationalityType: editEmp.nationalityType ?? null,
        visaExpireDate: editEmp.visaExpireDate ?? null,
        contractExpireDate: editEmp.contractExpireDate,
        resignDate: editEmp.resignDate,
        status: editEmp.status,
        numberOfChildren: editEmp.numberOfChildren ?? 0,
        decouple: editEmp.decouple ?? false,
        claimSpouse: editEmp.claimSpouse ?? false,
        // Keep the row on Exception while editing — only the date / remark
        // fields change. Use the Unmark Exception button to restore.
        attendanceYn: false,
        attendanceExceptionStartDate: editStartDate || null,
        attendanceExceptionEndDate:   editEndDate   || null,
        attendanceExceptionRemark:    editRemark    || null,
      } as employeesApi.CreateEmployeeRequest;
      await employeesApi.update(targetId, body);
      setEmployees(prev => prev.map(e => e.id === editEmp.id ? {
        ...e,
        attendanceExceptionStartDate: editStartDate || undefined,
        attendanceExceptionEndDate:   editEndDate   || undefined,
        attendanceExceptionRemark:    editRemark    || undefined,
      } : e));
      toast.success('Exception details updated');
      setEditEmp(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save Exception details');
    } finally {
      setEditSaving(false);
    }
  };

  // Inverse of the Attendance "Mark Exception" action — flip attendanceYn
  // back to true so the employee is counted in attendance again.
  const [unmarkingId, setUnmarkingId] = useState<string | null>(null);
  const handleUnmarkException = async (emp: Employee) => {
    if (!(await confirm({
      title: `Unmark ${emp.name} as Exception?`,
      message: 'The employee goes back into attendance counting and the Exception start / end / remark are cleared.',
      confirmLabel: 'Unmark',
      variant: 'destructive',
    }))) return;
    setUnmarkingId(emp.id);
    try {
      if (USE_MOCKS) {
        setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, attendanceYn: true } : e));
        toast.success(`${emp.name} restored to attendance counting`);
        return;
      }
      const targetId = (emp as Employee & { apiId?: string }).apiId ?? emp.id;
      const body: employeesApi.CreateEmployeeRequest = {
        ...(rawEmps[emp.id] as unknown as employeesApi.CreateEmployeeRequest | undefined),
        empNo: emp.id,
        name: emp.name,
        khmerName: emp.khmerName,
        email: emp.email,
        position: emp.position,
        departmentId: emp.department && emp.department !== '-' ? emp.department : null,
        joinDate: emp.joinDate,
        baseSalary: emp.baseSalary,
        managerId: emp.managerId ?? null,
        gender: emp.gender,
        dateOfBirth: emp.dateOfBirth,
        placeOfBirth: emp.placeOfBirth,
        contactNumber: emp.contactNumber,
        currentAddress: emp.currentAddress,
        nffNo: emp.nffNo,
        // Full-replace PUT: a missing allowance is coerced to ZERO server-side.
        positionAllowance: emp.positionAllowance ?? 0,
        evaluationAllowance: emp.evaluationAllowance ?? 0,
        maritalStatus: emp.maritalStatus ?? null,
        tid: emp.tid,
        // Full-replace PUT — omitting these nulls them server-side.
        tidType: emp.tidType ?? null,
        nationalityType: emp.nationalityType ?? null,
        visaExpireDate: emp.visaExpireDate ?? null,
        contractExpireDate: emp.contractExpireDate,
        resignDate: emp.resignDate,
        status: emp.status,
        numberOfChildren: emp.numberOfChildren ?? 0,
        decouple: emp.decouple ?? false,
        claimSpouse: emp.claimSpouse ?? false,
        attendanceYn: true,
        // Explicit nulls (these used to be omitted, which the full-replace
        // PUT already treated as null) — the raw spread above would
        // otherwise carry the old Exception dates forward.
        attendanceExceptionStartDate: null,
        attendanceExceptionEndDate: null,
        attendanceExceptionRemark: null,
      } as employeesApi.CreateEmployeeRequest;
      await employeesApi.update(targetId, body);
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, attendanceYn: true } : e));
      toast.success(`${emp.name} restored to attendance counting`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unmark Exception');
    } finally {
      setUnmarkingId(null);
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

  const kw = search.trim().toLowerCase();

  // Long-term roster: employees with attendanceYn=false. Date filter is
  // ignored here — attendanceYn is a continuous state, not a per-day event.
  let exceptionEmployees = employees.filter(
    e => e.attendanceYn === false && e.status === 'active',
  );
  if (kw) {
    exceptionEmployees = exceptionEmployees.filter(emp => {
      const hay = `${emp.name} ${emp.id} ${deptName(emp.department)} ${emp.position ?? ''}`.toLowerCase();
      return hay.includes(kw);
    });
  }

  // Day Exception: leave-request rows whose category is non-deductible
  // (maternity or exception). The legacy isException flag still flows
  // through adaptApiLeave (mapped to 'exception') for pre-V47 rows, so
  // this filter stays correct even on older data.
  let dayExceptionRows = leaves.filter(r => r.category && NON_DEDUCTIBLE_CATEGORIES.has(r.category));
  if (!isTenantWide) {
    dayExceptionRows = dayExceptionRows.filter(e => matchesScope(e.employeeId, scopeMode, employees));
  }
  if (dateFilter.start || dateFilter.end) {
    dayExceptionRows = dayExceptionRows.filter(exc => {
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
  if (kw) {
    dayExceptionRows = dayExceptionRows.filter(exc => {
      const emp = employees.find(e => e.id === exc.employeeId || (e as any).apiId === exc.employeeId);
      const hay = `${emp?.name ?? ''} ${emp?.id ?? ''} ${deptName(emp?.department)} ${exc.reason ?? ''}`.toLowerCase();
      return hay.includes(kw);
    });
  }

  const sortedDayExceptions = [...dayExceptionRows].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );

  const exceptionEmpsPagination = usePagination(exceptionEmployees, 10);
  const dayExceptionsPagination = usePagination(sortedDayExceptions, 10);

  useEffect(() => {
    exceptionEmpsPagination.resetPage();
    dayExceptionsPagination.resetPage();
  }, [dateFilter, scopeMode, search, mode]);

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <h1 className="text-3xl font-bold">{t('page.exception.title')}</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          {/* One filter strip (Transactions pattern): search, view
              select (with counts), and — on the Day view — scope +
              From/To. Clear resets every filter. */}
          <div className="filter-strip">
            <div className="relative shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={mode === 'employee'
                  ? 'Search name, ID, department or position…'
                  : 'Search name, ID, department or reason…'}
                className="h-9 pl-7 w-64 text-sm"
              />
            </div>
            <select
              value={mode}
              onChange={e => setMode(e.target.value as 'employee' | 'day')}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="View"
              title={mode === 'employee'
                ? 'Employees opted out of attendance until HR unmarks them (Attendance → Mark Exception).'
                : 'Single-day exceptions (mission, on-site, special) flagged on the Submit Leave dialog.'}
            >
              <option value="employee">View : Long-term (Employee) ({exceptionEmployees.length})</option>
              <option value="day">View : Day Exception ({dayExceptionRows.length})</option>
            </select>
            {showScopePicker && mode === 'day' && (
              <div className="shrink-0"><ScopePicker value={scopeMode} onChange={setScopeMode} /></div>
            )}
            {mode === 'day' && (
              <>
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
              </>
            )}
            {(search || dateFilter.start || dateFilter.end || scopeMode !== 'all') && (
              <Button
                size="sm" variant="ghost"
                className="h-9 shrink-0"
                onClick={() => { setSearch(''); setDateFilter({ start: null, end: null }); setScopeMode('all'); }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        {/* p-0 keeps the table flush against the card edges so the gap
            between the view-mode pill row and the table header stays
            tight — matches the Increase / Deduction / Movement /
            Adjustment pages. */}
        {/* Default padding, not p-0 — the bordered scroller needs the
            side gutter to read as an inset panel (see Items). */}
        <CardContent>
          {mode === 'employee' ? (
            <div className="border rounded-md overflow-auto max-h-[calc(100vh-280px)]">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10 shadow-[inset_0_-1px_0_0_rgb(229,231,235)]">
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Dept/Group</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Join date</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Remark</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingEmps && employees.length === 0 ? (
                  <TableBodySkeletonRows columns={9} />
                ) : empsError && employees.length === 0 ? (
                  <ListError colSpan={9} message={empsError} onRetry={() => void loadEmployees()} />
                ) : exceptionEmpsPagination.paginatedItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-gray-500 py-10">
                      {kw
                        ? <>No Exception employees match <strong>"{search}"</strong>.</>
                        : <>No employees are currently marked as Exception. Use{' '}
                          <strong>Attendance → Mark Exception</strong> on a row
                          to opt that employee out of attendance counting.</>
                      }
                    </TableCell>
                  </TableRow>
                )}
                {exceptionEmpsPagination.paginatedItems.map(emp => {
                  // Start Date prefers the V51 explicit field; pre-V51
                  // rows still fall back to updated_at as an approximation.
                  const startSource = emp.attendanceExceptionStartDate ?? emp.updatedAt;
                  const startDate = startSource
                    ? formatDate(startSource)
                    : '—';
                  const endDate = emp.attendanceExceptionEndDate
                    ? formatDate(emp.attendanceExceptionEndDate)
                    : <span className="text-gray-400 text-xs">Open-ended</span>;
                  const remark = emp.attendanceExceptionRemark
                    ? emp.attendanceExceptionRemark
                    : <span className="text-gray-300">—</span>;
                  return (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <EmployeeCell employee={emp} />
                      </TableCell>
                      <TableCell className="text-sm">{deptName(emp.department)}</TableCell>
                      <TableCell className="text-sm">{emp.position ?? '—'}</TableCell>
                      <TableCell className="text-sm">{emp.joinDate ? formatDate(emp.joinDate) : '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600">{startDate}</TableCell>
                      <TableCell className="text-sm text-gray-600">{endDate}</TableCell>
                      <TableCell className="text-sm text-gray-600 max-w-xs truncate" title={emp.attendanceExceptionRemark ?? ''}>{remark}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          Exception
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Edit Exception details"
                            onClick={() => openEditExceptionDialog(emp)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-600 hover:text-red-700"
                            title={unmarkingId === emp.id ? 'Restoring…' : 'Unmark Exception'}
                            aria-label="Unmark Exception"
                            onClick={() => handleUnmarkException(emp)}
                            disabled={unmarkingId === emp.id}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          ) : (
            <div className="border rounded-md overflow-auto max-h-[calc(100vh-280px)]">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10 shadow-[inset_0_-1px_0_0_rgb(229,231,235)]">
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Dept/Group</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Modifier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && leaves.length === 0 ? (
                  <TableBodySkeletonRows columns={11} />
                ) : leavesError && leaves.length === 0 ? (
                  <ListError colSpan={11} message={leavesError} onRetry={() => void loadLeaves()} />
                ) : dayExceptionsPagination.paginatedItems.length === 0 && (
                  <ListEmpty
                    colSpan={11}
                    noun="Day Exceptions"
                    filtered={!!(kw || dateFilter.start || dateFilter.end || scopeMode !== 'all')}
                  />
                )}
                {dayExceptionsPagination.paginatedItems.map((exc) => {
                  const employee = employees.find(
                    (e) => e.id === exc.employeeId || (e as any).apiId === exc.employeeId,
                  );
                  return (
                    <TableRow key={exc.id}>
                      <TableCell>
                        <EmployeeCell employee={employee} subtitle={employee?.id} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {deptName(employee?.department)
                          ? <Badge variant="outline" className="font-normal">{deptName(employee?.department)}</Badge>
                          : <span className="text-gray-400">—</span>}
                      </TableCell>
                      <TableCell>{formatDate(exc.date)}</TableCell>
                      <TableCell>
                        {formatDate(exc.endDate ?? exc.date)}
                      </TableCell>
                      <TableCell>
                        {exc.category ? (
                          <Badge className={CATEGORY_BADGE[exc.category]}>
                            {CATEGORY_LABEL[exc.category]}
                          </Badge>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getTypeLabel(exc.type)}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate" title={exc.reason}>
                        {exc.reason || <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadgeClass(exc.status)}>
                          {exc.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {formatDateTime(exc.submittedAt)}
                      </TableCell>
                      <TableCell>
                        <AuditCell
                          name={(exc as any).createdByName}
                          at={(exc as any).submittedAt}
                        />
                      </TableCell>
                      <TableCell>
                        <AuditCell
                          name={(exc as any).updatedByName}
                          at={(exc as any).updatedAt}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
          {/* Pagination gets its own padded chrome since CardContent
              is p-0. Matches Increase / Deduction / Movement layout. */}
          <div className="px-4 py-3 border-t">
            {mode === 'employee' ? (
              <Pagination
                currentPage={exceptionEmpsPagination.currentPage}
                totalPages={exceptionEmpsPagination.totalPages}
                onPageChange={exceptionEmpsPagination.goToPage}
                startIndex={exceptionEmpsPagination.startIndex}
                endIndex={exceptionEmpsPagination.endIndex}
                totalItems={exceptionEmpsPagination.totalItems}
              />
            ) : (
              <Pagination
                currentPage={dayExceptionsPagination.currentPage}
                totalPages={dayExceptionsPagination.totalPages}
                onPageChange={dayExceptionsPagination.goToPage}
                startIndex={dayExceptionsPagination.startIndex}
                endIndex={dayExceptionsPagination.endIndex}
                totalItems={dayExceptionsPagination.totalItems}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit-Exception dialog — Long-term roster's per-row Start Date /
          End Date / Remark editor. Doesn't touch attendanceYn; use the
          Unmark Exception button to restore the employee. */}
      <Dialog open={!!editEmp} onOpenChange={(o) => { if (!o && !editSaving) setEditEmp(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Exception Details</DialogTitle>
            <DialogDescription>
              {editEmp ? `Update Start / End / Remark for ${editEmp.name}.` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ee-start" className="text-xs">Start Date</Label>
                <DateInput
                  value={editStartDate || null}
                  onChange={(v) => setEditStartDate(v ?? '')}
                  max={editEndDate || undefined}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ee-end" className="text-xs">
                  End Date <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <DateInput
                  value={editEndDate || null}
                  min={editStartDate || undefined}
                  onChange={(v) => setEditEndDate(v ?? '')}
                  className="w-full"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ee-remark" className="text-xs">
                Remark <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Textarea
                id="ee-remark"
                rows={3}
                value={editRemark}
                onChange={(e) => setEditRemark(e.target.value)}
                placeholder="Reason for the Exception, e.g. field engineer based on customer site…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEmp(null)} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEditException} disabled={editSaving}>
              {editSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
