import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
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
import { DateRangeFilter } from '../common/DateRangeFilter';
import { EmployeeCell } from '../common/EmployeeCell';
import { AuditCell } from '../common/AuditCell';
import { mockExceptions } from '../../data/timeworkData';
import { useI18n } from '../../i18n/I18nContext';
import { mockEmployees } from '../../data/mockData';
import { useTeamScope, ScopeMode } from '../../hooks/useTeamScope';
import { ScopePicker } from '../common/ScopePicker';
import { X, Search, Pencil } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { useDateFormat } from '../../context/DateFormatContext';
import { toast } from 'sonner';
import { AttendanceException, Employee } from '../../types/hrms';
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
    nffNo: e.nffNo ?? undefined,
    tid: e.tid ?? undefined,
    contractExpireDate: e.contractExpireDate ?? undefined,
    resignDate: e.resignDate ?? undefined,
    attendanceYn: e.attendanceYn ?? true,
    // V51 — Long-term Exception bookkeeping. Pre-V51 rows have null
    // start date; the table falls back to {@link updatedAt} for those.
    attendanceExceptionStartDate: e.attendanceExceptionStartDate ?? undefined,
    attendanceExceptionEndDate: e.attendanceExceptionEndDate ?? undefined,
    attendanceExceptionRemark: e.attendanceExceptionRemark ?? undefined,
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
  const { formatDate } = useDateFormat();
  const [leaves, setLeaves] = useState<AttendanceException[]>(USE_MOCKS ? mockExceptions : []);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [, setLoading] = useState<boolean>(!USE_MOCKS);
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

  const handleDateFilterChange = (startDate: string | null, endDate: string | null) => {
    setDateFilter({ start: startDate, end: endDate });
  };

  const loadLeaves = async () => {
    if (USE_MOCKS) {
      setLeaves([...mockExceptions]);
      return;
    }
    try {
      const res = await leaveApi.list({
        from: dateFilter.start || undefined,
        to: dateFilter.end || undefined,
        size: 500,
      });
      setLeaves(res.data.map(adaptApiLeave));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load leave requests');
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
        tid: editEmp.tid,
        contractExpireDate: editEmp.contractExpireDate,
        resignDate: editEmp.resignDate,
        status: editEmp.status,
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
    setUnmarkingId(emp.id);
    try {
      if (USE_MOCKS) {
        setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, attendanceYn: true } : e));
        toast.success(`${emp.name} restored to attendance counting`);
        return;
      }
      const targetId = (emp as Employee & { apiId?: string }).apiId ?? emp.id;
      const body: employeesApi.CreateEmployeeRequest = {
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
        tid: emp.tid,
        contractExpireDate: emp.contractExpireDate,
        resignDate: emp.resignDate,
        status: emp.status,
        attendanceYn: true,
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

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
      approved: 'bg-green-100 text-green-800 hover:bg-green-100',
      rejected: 'bg-red-100 text-red-800 hover:bg-red-100',
    };
    return variants[status] || 'bg-gray-100 text-gray-800 hover:bg-gray-100';
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">{t('page.exception.title')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showScopePicker && mode === 'day' && (
            <ScopePicker value={scopeMode} onChange={setScopeMode} />
          )}
          {mode === 'day' && <DateRangeFilter onFilterChange={handleDateFilterChange} />}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          {/* Single-row header: view-mode pills on the left, search on
              the right. The hover-tooltip on each pill replaces the old
              separate description line, and the section title is dropped
              because the active pill already labels the table. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-gray-500 mr-1">
              View:
            </span>
            {(['employee', 'day'] as const).map(m => {
              const isActive = mode === m;
              const count = m === 'employee' ? exceptionEmployees.length : dayExceptionRows.length;
              const hint = m === 'employee'
                ? 'Employees opted out of attendance until HR unmarks them (Attendance → Mark Exception).'
                : 'Single-day exceptions (mission, on-site, special) flagged on the Submit Leave dialog.';
              return (
                <button
                  key={m}
                  type="button"
                  title={hint}
                  onClick={() => setMode(m)}
                  className={`h-8 px-3 rounded-full text-sm border transition ${
                    isActive
                      ? 'border-amber-300 bg-amber-50 text-amber-800 font-medium'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {m === 'employee' ? 'Long-term (Employee)' : 'Day Exception'}
                  <Badge variant="outline" className="ml-1.5 h-5 px-1.5 text-[10px]">{count}</Badge>
                </button>
              );
            })}
            <div className="relative ml-auto w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={mode === 'employee'
                  ? 'Search name, ID, department or position…'
                  : 'Search name, ID, department or reason…'}
                className="h-8 pl-8 pr-8 text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {mode === 'employee' ? (
            <Table>
              <TableHeader>
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
                {exceptionEmpsPagination.paginatedItems.length === 0 && (
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
                      <TableCell className="text-sm">{emp.joinDate}</TableCell>
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
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnmarkException(emp)}
                            disabled={unmarkingId === emp.id}
                          >
                            {unmarkingId === emp.id ? 'Restoring…' : 'Unmark Exception'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
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
                {dayExceptionsPagination.paginatedItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-sm text-gray-500 py-10">
                      No Day Exceptions found for the current filters.
                    </TableCell>
                  </TableRow>
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
                        <Badge className={getStatusBadge(exc.status)}>
                          {exc.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {format(new Date(exc.submittedAt), 'MMM dd, HH:mm')}
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
          )}
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
                <Input
                  id="ee-start"
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ee-end" className="text-xs">
                  End Date <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="ee-end"
                  type="date"
                  value={editEndDate}
                  min={editStartDate || undefined}
                  onChange={(e) => setEditEndDate(e.target.value)}
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
