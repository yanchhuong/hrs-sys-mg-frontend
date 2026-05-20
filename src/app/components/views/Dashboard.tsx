import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  mockEmployees, mockAttendance, mockOTRequests, mockContracts,
} from '../../data/mockData';
import * as employeesApi from '../../api/employees';
import * as attendanceApi from '../../api/attendance';
import * as overtimeApi from '../../api/overtime';
import * as contractsApi from '../../api/contracts';
import * as departmentsApi from '../../api/departments';
import * as leaveApi from '../../api/leave';
import { USE_MOCKS } from '../../api/client';
import { makeDeptName } from '../../utils/deptName';
import { Users, Clock, TimerIcon, FileText, AlertCircle, CheckCircle, RefreshCw, CalendarDays } from 'lucide-react';
import { Badge } from '../ui/badge';
import { format, differenceInDays, parseISO } from 'date-fns';
import { useDateFormat } from '../../context/DateFormatContext';
import { toast } from 'sonner';

/** ISO YYYY-MM-DD for today, used for "today's attendance" lookups. */
const todayISO = () => format(new Date(), 'yyyy-MM-dd');

/** A contract is "expiring soon" when it's still active and ends within 30 days. */
function isExpiringSoon(endDate?: string | null, today = new Date()): boolean {
  if (!endDate) return false;
  const days = differenceInDays(parseISO(endDate), today);
  return days >= 0 && days <= 30;
}

export function Dashboard() {
  const { formatDate } = useDateFormat();
  const { currentUser, currentEmployee } = useAuth();

  // ---------- State (mock-seeded in mock mode, refetched from API otherwise)
  const [employees, setEmployees] = useState(USE_MOCKS ? mockEmployees : []);
  const [attendance, setAttendance] = useState(USE_MOCKS ? mockAttendance : []);
  const [otRequests, setOtRequests] = useState(USE_MOCKS ? mockOTRequests : []);
  const [contracts, setContracts] = useState(USE_MOCKS ? mockContracts : []);
  const [deptList, setDeptList] = useState<departmentsApi.Department[]>([]);
  // Pending leave requests — surfaces alongside OT in Recent Alerts so
  // tenant-wide roles (admin + custom) can act on them at a glance.
  const [pendingLeaves, setPendingLeaves] = useState<leaveApi.LeaveRequest[]>([]);
  const [loading, setLoading] = useState(!USE_MOCKS);

  useEffect(() => {
    if (USE_MOCKS) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [empRes, attRes, otRes, contractsRes, deps, leaveRes] = await Promise.all([
          employeesApi.list({ size: 500 }),
          attendanceApi.list({ date: todayISO(), size: 500 }),
          overtimeApi.list({ status: 'pending', size: 200 }),
          contractsApi.list({ status: 'active', size: 500 }),
          departmentsApi.list(),
          leaveApi.list({ status: 'pending', size: 200 }),
        ]);
        if (cancelled) return;
        // Stash raw API shapes — the dashboard reads them directly, matching
        // field names used by the backend DTOs (empNo, status, etc.).
        setEmployees(empRes.content as any);
        setAttendance(attRes.data as any);
        setOtRequests(otRes.data as any);
        setContracts(contractsRes.data as any);
        setDeptList(deps);
        setPendingLeaves(leaveRes.data);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---------- Derived values
  // Employee lookup by either empNo or backend UUID — the current user's
  // employeeId comes from the JWT (UUID in live mode, mock id in mock mode).
  const findEmployee = (id?: string | null) => {
    if (!id) return undefined;
    return employees.find((e: any) => e.id === id || e.apiId === id || e.empNo === id);
  };

  const todayStr = todayISO();
  const todayAttendance = useMemo(
    () => attendance.filter((a: any) => a.date === todayStr),
    [attendance, todayStr],
  );

  const pendingOT = useMemo(
    () => otRequests.filter((r: any) => r.status === 'pending'),
    [otRequests],
  );

  const expiringContracts = useMemo(
    () =>
      contracts.filter((c: any) =>
        USE_MOCKS ? c.status === 'expiring' : isExpiringSoon(c.endDate),
      ),
    [contracts],
  );

  const activeEmployeeCount = useMemo(
    () => employees.filter((e: any) => (e.status ?? 'active') === 'active').length,
    [employees],
  );

  const myEmployeeKey = currentUser?.employeeId ?? null;
  const myAttendance = currentUser?.role === 'employee'
    ? todayAttendance.find((a: any) => a.employeeId === myEmployeeKey)
    : null;
  const myPendingOT = currentUser?.role === 'employee'
    ? pendingOT.filter((r: any) => r.employeeId === myEmployeeKey)
    : pendingOT;

  // Department list for the admin card — prefers the real roster when present.
  const departmentBreakdown = useMemo(() => {
    if (USE_MOCKS) {
      return ['Engineering', 'Human Resources', 'Sales'].map(name => ({
        name,
        count: employees.filter((e: any) => e.department === name).length,
      }));
    }
    return deptList.map(dep => ({
      name: dep.name,
      count: employees.filter((e: any) => e.departmentId === dep.id).length,
    }));
  }, [deptList, employees]);

  // ---------- Loading screen
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-500">Welcome back, {currentEmployee?.name}</p>
        </div>
        <div className="rounded-md border border-blue-200 bg-blue-50 p-6 flex items-center gap-3">
          <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
          <span className="text-sm text-blue-900">Loading your dashboard…</span>
        </div>
      </div>
    );
  }

  // ---------- Admin view (also drives custom roles, since they're seeded
  // from the Admin base and expect tenant-wide visibility).
  if (currentUser?.role === 'admin'
      || (currentUser?.role
          && currentUser.role !== 'manager'
          && currentUser.role !== 'employee')) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-500">Welcome back, {currentEmployee?.name}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Users className="h-5 w-5 text-blue-600" />
                <span className="text-2xl font-bold text-blue-600">{employees.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Total Employees</p>
              <p className="text-[11px] text-gray-500 truncate">{activeEmployeeCount} active</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Clock className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold text-green-600">{todayAttendance.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Today&apos;s Attendance</p>
              <p className="text-[11px] text-gray-500 truncate">
                {todayAttendance.filter((a: any) => a.status === 'late').length} late arrivals
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <TimerIcon className="h-5 w-5 text-orange-600" />
                <span className="text-2xl font-bold text-orange-600">{pendingOT.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Pending OT</p>
              <p className="text-[11px] text-gray-500 truncate">Require approval</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <CalendarDays className="h-5 w-5 text-purple-600" />
                <span className="text-2xl font-bold text-purple-600">{pendingLeaves.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Pending Leave</p>
              <p className="text-[11px] text-gray-500 truncate">Awaiting approval</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <FileText className="h-5 w-5 text-red-600" />
                <span className="text-2xl font-bold text-red-600">{expiringContracts.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Expiring Contracts</p>
              <p className="text-[11px] text-gray-500 truncate">Within 30 days</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {expiringContracts.map((contract: any) => {
                  const employee = findEmployee(contract.employeeId);
                  return (
                    <div key={contract.id} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Contract Expiring Soon</p>
                        <p className="text-sm text-gray-600">
                          {employee?.name ?? '—'}&apos;s contract expires on {formatDate(contract.endDate)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {pendingOT.slice(0, 2).map((ot: any) => {
                  const employee = findEmployee(ot.employeeId);
                  return (
                    <div key={ot.id} className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                      <TimerIcon className="h-5 w-5 text-orange-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Pending OT Approval</p>
                        <p className="text-sm text-gray-600">
                          {employee?.name ?? '—'} – {ot.hours} hours on {formatDate(ot.date)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {pendingLeaves.slice(0, 3).map((lr) => {
                  const employee = findEmployee(lr.employeeId);
                  return (
                    <div key={lr.id} className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                      <CalendarDays className="h-5 w-5 text-purple-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Pending Leave Approval</p>
                        <p className="text-sm text-gray-600">
                          {(employee?.name ?? lr.employeeName) ?? '—'} – {lr.type.replace('_', ' ')} on {formatDate(lr.date)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {expiringContracts.length === 0 && pendingOT.length === 0 && pendingLeaves.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-6">Nothing needs your attention right now.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Department Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {departmentBreakdown.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">No departments configured yet.</p>
                )}
                {departmentBreakdown.map(dept => (
                  <div key={dept.name} className="flex items-center justify-between">
                    <span className="text-sm">{dept.name}</span>
                    <Badge variant="secondary">{dept.count} employees</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ---------- Manager view
  if (currentUser?.role === 'manager') {
    const teamMembers = employees.filter((e: any) =>
      e.managerId === myEmployeeKey || e.managerId === currentEmployee?.apiId,
    );
    const teamIds = new Set<string>(
      teamMembers.map((t: any) => t.apiId ?? t.id).filter(Boolean),
    );
    const teamPresentToday = todayAttendance.filter((a: any) => teamIds.has(a.employeeId)).length;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-500">Welcome back, {currentEmployee?.name}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Users className="h-5 w-5 text-blue-600" />
                <span className="text-2xl font-bold text-blue-600">{teamMembers.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Team Members</p>
              <p className="text-[11px] text-gray-500 truncate">Under your management</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <TimerIcon className="h-5 w-5 text-orange-600" />
                <span className="text-2xl font-bold text-orange-600">{pendingOT.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Pending Approvals</p>
              <p className="text-[11px] text-gray-500 truncate">OT requests</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Clock className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold text-green-600">{teamPresentToday}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Team Attendance</p>
              <p className="text-[11px] text-gray-500 truncate">Present today</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pending OT Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {myPendingOT.map((ot: any) => {
                const employee = findEmployee(ot.employeeId);
                return (
                  <div key={ot.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{employee?.name ?? '—'}</p>
                      <p className="text-sm text-gray-600">
                        {ot.hours} hours on {formatDate(ot.date)} – {ot.reason ?? 'no reason provided'}
                      </p>
                    </div>
                    <Badge variant="secondary">Pending</Badge>
                  </div>
                );
              })}
              {myPendingOT.length === 0 && (
                <p className="text-center text-gray-500 py-4">No pending approvals</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- Employee view (self)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-gray-500">Welcome back, {currentEmployee?.name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            {myAttendance ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Check In</span>
                  <span className="font-medium">{(myAttendance as any).checkIn ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Check Out</span>
                  <span className="font-medium">{(myAttendance as any).checkOut ?? 'Not yet'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Status</span>
                  <Badge variant={(myAttendance as any).status === 'present' ? 'default' : 'secondary'}>
                    {String((myAttendance as any).status).replace('_', ' ')}
                  </Badge>
                </div>
                {(myAttendance as any).hoursWorked != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Work Hours</span>
                    <span className="font-medium">{(myAttendance as any).hoursWorked}h</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No attendance record today</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My OT Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {myPendingOT.map((ot: any) => (
                <div key={ot.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{formatDate(ot.date)}</p>
                    <p className="text-sm text-gray-600">{ot.hours} hours – {ot.reason ?? '—'}</p>
                  </div>
                  <Badge variant="secondary">{ot.status}</Badge>
                </div>
              ))}
              {myPendingOT.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No pending OT requests</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Position</p>
              <p className="font-medium">{currentEmployee?.position ?? '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Department</p>
              <p className="font-medium">
                {/* employee.department carries the department UUID in
                    live mode; resolve to its human-readable name from
                    the departments list. Mock mode already stores the
                    name, so makeDeptName falls through cleanly. */}
                {(() => {
                  const id = currentEmployee?.department;
                  if (!id || id === '-') return '—';
                  const name = makeDeptName(deptList, '')(id);
                  return name || id;
                })()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Join Date</p>
              <p className="font-medium">
                {currentEmployee && formatDate(currentEmployee.joinDate)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <Badge variant="default">{currentEmployee?.status ?? 'active'}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
