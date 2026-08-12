import { useEffect, useMemo, useState, type ComponentType } from 'react';
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
import * as dashboardsApi from '../../api/dashboards';
import { USE_MOCKS } from '../../api/client';
import { makeDeptName } from '../../utils/deptName';
import {
  Users, Clock, TimerIcon, FileText, AlertCircle, CheckCircle,
  RefreshCw, CalendarDays, LayoutDashboard, Wallet, Landmark,
  ShoppingCart, Gauge, Sparkles, Loader2,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { format, differenceInDays, parseISO } from 'date-fns';
import { useDateFormat } from '../../context/DateFormatContext';
import { toast } from 'sonner';

/* ============================================================== */
/* V316 — Dynamic multi-category Dashboard shell                   */
/* ============================================================== */

/**
 * Icon lookup keyed by the {@code dashboard_categories.icon} column
 * value (kebab-case Lucide name). Adding a new category on the BE
 * only requires an entry here on the FE. Falls back to a generic
 * dashboard glyph so an unknown icon renders as a shape rather than
 * an empty tile.
 */
const CATEGORY_ICON: Record<string, ComponentType<{ className?: string }>> = {
  users:           Users,
  wallet:          Wallet,
  landmark:        Landmark,
  'shopping-cart': ShoppingCart,
  gauge:           Gauge,
};
function CategoryIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const Icon = (name && CATEGORY_ICON[name]) || LayoutDashboard;
  return <Icon className={className} />;
}

/** V316 — the exported Dashboard is the shell. It resolves the user's
 *  available categories, renders a tab strip, and mounts the widget
 *  bundle for the selected code. Legacy HR content lives on as
 *  {@link HrDashboardWidgets}; unimplemented categories render the
 *  shared {@link ComingSoonBundle} placeholder until real widgets
 *  ship. */
export function Dashboard() {
  const [categories, setCategories] = useState<dashboardsApi.DashboardCategory[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await dashboardsApi.listCategories();
        if (cancelled) return;
        setCategories(list);
        // Default selection order: last-picked (localStorage), then
        // the first category in server-sorted order. This gives us
        // per-user preference for free without needing a DB row.
        const stored = typeof window !== 'undefined'
          ? window.localStorage.getItem('dashboard.lastCategory')
          : null;
        const initial = list.find(c => c.code === stored)?.code ?? list[0]?.code ?? '';
        setSelected(initial);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboards');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pick = (code: string) => {
    setSelected(code);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('dashboard.lastCategory', code);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboards…
      </div>
    );
  }
  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }
  if (categories.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-gray-500 space-y-1">
        <div className="text-gray-700 font-medium">No dashboards available.</div>
        <div>Ask an admin to grant a dashboard permission on your role.</div>
      </div>
    );
  }

  const active = categories.find(c => c.code === selected) ?? categories[0];

  return (
    <div className="space-y-4">
      {/* Category tab strip. Hidden entirely when the user has access
          to just one category — no signal there, keeps the page clean
          (a Cashier with only POS shouldn't see a "POS" tab as their
          only option). */}
      {categories.length > 1 && (
        <div className="filter-strip">
          {categories.map(c => {
            const on = c.code === active.code;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => pick(c.code)}
                className={`h-9 px-3 rounded-md text-sm font-medium border transition-colors inline-flex items-center gap-1.5 ${
                  on
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-transparent bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
                title={c.description ?? c.name}
              >
                <CategoryIcon name={c.icon} className="h-3.5 w-3.5" />
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {/* The current widget bundle. HR is the only category with real
          content; everything else lands on the shared placeholder. */}
      {active.code === 'hr'
        ? <HrDashboardWidgets />
        : <ComingSoonBundle category={active} />}
    </div>
  );
}

/** Shared placeholder for every category whose widgets haven't landed
 *  yet. Reads the server's "coming_soon" stub so we can still show a
 *  friendly message without a per-category component. */
function ComingSoonBundle({ category }: { category: dashboardsApi.DashboardCategory }) {
  const [summary, setSummary] = useState<dashboardsApi.DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardsApi.getCategorySummary(category.code)
      .then(s => { if (!cancelled) setSummary(s); })
      .catch(() => { if (!cancelled) setSummary(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [category.code]);
  return (
    <Card>
      <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
        <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
          <CategoryIcon name={category.icon} className="h-6 w-6 text-blue-600" />
        </div>
        <div className="space-y-1">
          <div className="text-lg font-semibold flex items-center justify-center gap-2">
            {category.name} Dashboard
            <Sparkles className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-sm text-gray-500 max-w-md">
            {loading
              ? 'Loading…'
              : (summary?.message
                  ?? 'Widgets for this dashboard are on the roadmap.')}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** ISO YYYY-MM-DD for today, used for "today's attendance" lookups. */
const todayISO = () => format(new Date(), 'yyyy-MM-dd');

/** A contract is "expiring soon" when it's still active and ends within 30 days. */
function isExpiringSoon(endDate?: string | null, today = new Date()): boolean {
  if (!endDate) return false;
  const days = differenceInDays(parseISO(endDate), today);
  return days >= 0 && days <= 30;
}

/** V316 — the HR-specific widget bundle. Renamed from the previous
 *  top-level {@code Dashboard} export; the shell at the top of this
 *  file now mounts one of the category bundles based on the
 *  selected tab. Content is unchanged from the pre-multi-category
 *  version — this remains the reference "real widgets" bundle until
 *  Payroll / Accounting / POS / Management catch up. */
function HrDashboardWidgets() {
  const { formatDate } = useDateFormat();
  const { currentUser, currentEmployee, isModuleAvailable } = useAuth();

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
        // v-dashboard-module-preflight — skip fetches for modules the
        // tenant doesn't have (e.g. a School tenant has no attendance /
        // overtime / all-leave). Without this we still get the right
        // UX (per-fetch catch swallows the 403), but the browser
        // Network tab shows 3-5 red 403 rows on every Dashboard load,
        // which reads as breakage to anyone watching DevTools. Each
        // fetch is still wrapped in its own catch so a role-level 403
        // (e.g. an employee-role user hitting an admin-only endpoint)
        // still collapses to an empty panel rather than a page toast.
        const attCall = isModuleAvailable('attendance')
          ? attendanceApi.list({ date: todayISO(), size: 500 }).catch(() => ({ data: [] as any[] } as any))
          : Promise.resolve({ data: [] as any[] } as any);
        const otCall = isModuleAvailable('overtime')
          ? overtimeApi.list({ status: 'pending', size: 200 }).catch(() => ({ data: [] as any[] } as any))
          : Promise.resolve({ data: [] as any[] } as any);
        const contractsCall = isModuleAvailable('contracts')
          ? contractsApi.list({ status: 'active', size: 500 }).catch(() => ({ data: [] as any[] } as any))
          : Promise.resolve({ data: [] as any[] } as any);
        const leaveCall = isModuleAvailable('all-leave')
          ? leaveApi.list({ status: 'pending', size: 200 }).catch(() => ({ data: [] as any[] } as any))
          : Promise.resolve({ data: [] as any[] } as any);

        const [empRes, attRes, otRes, contractsRes, deps, leaveRes] = await Promise.all([
          employeesApi.list({ size: 500 }).catch(() => ({ content: [] as any[] } as any)),
          attCall,
          otCall,
          contractsCall,
          departmentsApi.list().catch(() => [] as departmentsApi.Department[]),
          leaveCall,
        ]);
        if (cancelled) return;
        setEmployees((empRes.content ?? []) as any);
        setAttendance((attRes.data ?? []) as any);
        setOtRequests((otRes.data ?? []) as any);
        setContracts((contractsRes.data ?? []) as any);
        setDeptList(deps ?? []);
        setPendingLeaves((leaveRes.data ?? []) as any);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
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
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
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
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
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
