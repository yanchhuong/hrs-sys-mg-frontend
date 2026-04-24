import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { DateRangeFilter } from '../common/DateRangeFilter';
import { EmployeeCell } from '../common/EmployeeCell';
import { mockExceptions } from '../../data/timeworkData';
import { useI18n } from '../../i18n/I18nContext';
import { mockEmployees } from '../../data/mockData';
import { useTeamScope, ScopeMode } from '../../hooks/useTeamScope';
import { ScopePicker } from '../common/ScopePicker';
import { AlertCircle, Check, X, Plus, Search } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { AttendanceException, Employee } from '../../types/hrms';
import * as leaveApi from '../../api/leave';
import * as employeesApi from '../../api/employees';
import * as departmentsApi from '../../api/departments';
import { USE_MOCKS } from '../../api/client';

// Adapts a backend Employee to the front-end Employee shape used by this
// view. Mirrors the pattern from Attendance.tsx / Employees.tsx — the
// user-facing `id` holds the human-readable empNo and the backend UUID is
// kept on `apiId` for mutating calls.
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
  };
}

// Narrows a free-form backend leave `type` string to the front-end union used
// by getTypeLabel. Unknown values fall through to `manual_correction` so the
// row still renders cleanly.
function narrowExceptionType(t: string): AttendanceException['type'] {
  const allowed: AttendanceException['type'][] = [
    'missed_punch', 'late_arrival', 'early_leave', 'manual_correction',
  ];
  return (allowed as string[]).includes(t) ? (t as AttendanceException['type']) : 'manual_correction';
}

// Adapts a backend LeaveRequest to the front-end AttendanceException shape
// rendered by this view. employeeName is derived from the loaded employees
// list so the EmployeeCell can resolve department / manager / avatar.
function adaptApiLeave(r: leaveApi.LeaveRequest): AttendanceException {
  // Keep the backend UUID on employeeId. Render-side lookups now match on
  // either `.id` (empNo) or `.apiId` (UUID), so we don't depend on the
  // employees list having loaded before leaves.
  const status: AttendanceException['status'] =
    r.status === 'approved' || r.status === 'rejected' ? r.status : 'pending';
  return {
    id: r.id,
    employeeId: r.employeeId,
    date: r.date,
    type: narrowExceptionType(r.type),
    reason: r.reason ?? '',
    status,
    submittedBy: r.employeeId,
    submittedAt: r.submittedAt,
    approvedBy: r.approvedBy ?? undefined,
    approvedAt: r.approvedAt ?? undefined,
    correctedCheckIn: r.correctedCheckIn ?? undefined,
    correctedCheckOut: r.correctedCheckOut ?? undefined,
  };
}

export function Exception() {
  const { t } = useI18n();
  const [leaves, setLeaves] = useState<AttendanceException[]>(USE_MOCKS ? mockExceptions : []);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [, setLoading] = useState<boolean>(!USE_MOCKS);
  // Retained for potential future department display; loaded alongside employees
  // so the cell resolvers match the patterns used in Attendance.tsx.
  const [, setDeptList] = useState<departmentsApi.Department[]>([]);
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [search, setSearch] = useState('');

  // New-exception dialog state (employee only)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newType, setNewType] = useState<'missed_punch' | 'late_arrival' | 'early_leave' | 'manual_correction'>('missed_punch');
  const [newReason, setNewReason] = useState('');
  const [newCorrectedIn, setNewCorrectedIn] = useState('');
  const [newCorrectedOut, setNewCorrectedOut] = useState('');

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
      const res = await employeesApi.list({ size: 200 });
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
      // Non-fatal — currently unused in rendering but kept for parity with
      // Attendance.tsx in case department cells are added later.
      console.warn('Could not load departments', err);
    }
  };

  // Initial load on mount.
  useEffect(() => {
    void loadEmployees();
    void loadDepartments();
    void loadLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch leaves when the date-range filter changes (live mode only —
  // mock data is filtered client-side downstream).
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
    if (USE_MOCKS) {
      setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: 'rejected' } : l));
      toast.error('Leave rejected');
      return;
    }
    try {
      await leaveApi.reject(id);
      toast.error('Leave rejected');
      await loadLeaves();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject leave');
    }
  };

  const handleSubmitNew = async () => {
    if (!newReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    if (USE_MOCKS) {
      toast.success('Exception submitted for approval');
      setDialogOpen(false);
      setNewReason('');
      setNewCorrectedIn('');
      setNewCorrectedOut('');
      return;
    }
    try {
      await leaveApi.create({
        date: newDate,
        days: 1,
        halfDay: false,
        type: newType,
        reason: newReason,
        correctedCheckIn: newCorrectedIn || undefined,
        correctedCheckOut: newCorrectedOut || undefined,
      });
      toast.success('Exception submitted for approval');
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
      missed_punch: 'Missed Punch',
      late_arrival: 'Late Arrival',
      early_leave: 'Early Leave',
      manual_correction: 'Manual Correction',
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

  let filteredExceptions = leaves;

  // Scope: admin sees everything; manager/employee see self + direct reports,
  // optionally narrowed to `mine` or `team` via the ScopePicker.
  if (!isTenantWide) {
    filteredExceptions = filteredExceptions.filter(e => matchesScope(e.employeeId, scopeMode));
  }

  // Apply date filter
  if (dateFilter.start || dateFilter.end) {
    filteredExceptions = filteredExceptions.filter(exc => {
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

  // Apply keyword search against employee name/ID/dept and the request reason.
  const kw = search.trim().toLowerCase();
  if (kw) {
    filteredExceptions = filteredExceptions.filter(exc => {
      const emp = employees.find(e => e.id === exc.employeeId || (e as any).apiId === exc.employeeId);
      const hay = `${emp?.name ?? ''} ${emp?.id ?? ''} ${emp?.department ?? ''} ${exc.reason ?? ''}`.toLowerCase();
      return hay.includes(kw);
    });
  }

  const statusCounts = {
    all: filteredExceptions.length,
    pending: filteredExceptions.filter((e) => e.status === 'pending').length,
    approved: filteredExceptions.filter((e) => e.status === 'approved').length,
    rejected: filteredExceptions.filter((e) => e.status === 'rejected').length,
  };

  const statusFiltered = statusFilter === 'all'
    ? filteredExceptions
    : filteredExceptions.filter((e) => e.status === statusFilter);

  // Sort pending first so approvers see them at the top
  const sortedExceptions = [...statusFiltered].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
  });

  const exceptionsPagination = usePagination(sortedExceptions, 10);

  useEffect(() => {
    exceptionsPagination.resetPage();
  }, [dateFilter, statusFilter, scopeMode, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">{t('page.exception.title')}</h1>
          <p className="text-gray-500">{t('page.exception.description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showScopePicker && <ScopePicker value={scopeMode} onChange={setScopeMode} />}
          <DateRangeFilter onFilterChange={handleDateFilterChange} />
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
                  <div className="space-y-2">
                    <Label htmlFor="exc-date">Date</Label>
                    <Input
                      id="exc-date"
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      max={format(new Date(), 'yyyy-MM-dd')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="exc-type">Type</Label>
                    <select
                      id="exc-type"
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as typeof newType)}
                      className="w-full px-3 py-2 border rounded-md text-sm h-9"
                    >
                      <option value="missed_punch">Missed Punch</option>
                      <option value="late_arrival">Late Arrival</option>
                      <option value="early_leave">Early Leave</option>
                      <option value="manual_correction">Manual Correction</option>
                    </select>
                  </div>
                  {(newType === 'missed_punch' || newType === 'manual_correction') && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="exc-in">Corrected Check-in</Label>
                        <Input
                          id="exc-in"
                          type="time"
                          value={newCorrectedIn}
                          onChange={(e) => setNewCorrectedIn(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="exc-out">Corrected Check-out</Label>
                        <Input
                          id="exc-out"
                          type="time"
                          value={newCorrectedOut}
                          onChange={(e) => setNewCorrectedOut(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="exc-reason">Reason</Label>
                    <Textarea
                      id="exc-reason"
                      placeholder="Explain why this exception is needed..."
                      value={newReason}
                      onChange={(e) => setNewReason(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button onClick={handleSubmitNew} className="w-full">
                    Submit Exception
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Pending</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.pending}</div>
            <p className="text-xs text-gray-500">Require approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Approved</CardTitle>
            <Check className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.approved}</div>
            <p className="text-xs text-gray-500">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Rejected</CardTitle>
            <X className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.rejected}</div>
            <p className="text-xs text-gray-500">This month</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>All Leave</CardTitle>
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <TabsList>
                <TabsTrigger value="all">
                  All
                  <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{statusCounts.all}</Badge>
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending
                  <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-yellow-100 text-yellow-800 hover:bg-yellow-100">{statusCounts.pending}</Badge>
                </TabsTrigger>
                <TabsTrigger value="approved">
                  Approved
                  <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-green-100 text-green-800 hover:bg-green-100">{statusCounts.approved}</Badge>
                </TabsTrigger>
                <TabsTrigger value="rejected">
                  Rejected
                  <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-red-100 text-red-800 hover:bg-red-100">{statusCounts.rejected}</Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID, department or reason…"
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
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Dept/Group</TableHead>
                <TableHead>Leader</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exceptionsPagination.paginatedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-gray-400 py-10">
                    No leaves in this status.
                  </TableCell>
                </TableRow>
              )}
              {exceptionsPagination.paginatedItems.map((exception) => {
                const employee = employees.find(
                  (e) => e.id === exception.employeeId || (e as any).apiId === exception.employeeId,
                );
                const leader = employee?.managerId
                  ? employees.find(
                      (e) => e.id === employee.managerId || (e as any).apiId === employee.managerId,
                    )
                  : null;
                const isPending = exception.status === 'pending';
                const canActOnThis = isPending && canApproveLeaveOf(exception.employeeId);
                return (
                  <TableRow key={exception.id} className={isPending ? 'bg-yellow-50/50' : ''}>
                    <TableCell>
                      <EmployeeCell employee={employee} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {employee?.department
                        ? <Badge variant="outline" className="font-normal">{employee.department}</Badge>
                        : <span className="text-gray-400">—</span>}
                    </TableCell>
                    <TableCell>
                      {leader ? (
                        <EmployeeCell employee={leader} subtitle={leader.position} />
                      ) : (
                        <span className="text-xs text-gray-400">No leader assigned</span>
                      )}
                    </TableCell>
                    <TableCell>{format(new Date(exception.date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTypeLabel(exception.type)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={exception.reason}>{exception.reason}</TableCell>
                    <TableCell>
                      <Badge className={getStatusBadge(exception.status)}>
                        {exception.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {format(new Date(exception.submittedAt), 'MMM dd, HH:mm')}
                    </TableCell>
                    <TableCell className="text-right">
                      {canActOnThis ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800"
                            onClick={() => handleApprove(exception.id)}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50 hover:text-red-800"
                            onClick={() => handleReject(exception.id)}
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Reject
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
                        <Button variant="ghost" size="sm" className="h-7 text-xs">
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={exceptionsPagination.currentPage}
            totalPages={exceptionsPagination.totalPages}
            onPageChange={exceptionsPagination.goToPage}
            startIndex={exceptionsPagination.startIndex}
            endIndex={exceptionsPagination.endIndex}
            totalItems={exceptionsPagination.totalItems}
          />
        </CardContent>
      </Card>
    </div>
  );
}
