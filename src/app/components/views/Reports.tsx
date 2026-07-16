import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { DateInput } from '../common/DateInput';
import { StatCard, STAT_CARD_TONES } from '../common/StatCard';
import { formatMoney, formatNumber } from '../../utils/format';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Clock, DollarSign, Download, FileText, Eye,
  TrendingUp, Users, Building2, AlertCircle,
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { mockAttendance, mockEmployees, mockPayroll, mockDepartments } from '../../data/mockData';
import { Attendance, Employee, PayrollItem } from '../../types/hrms';
import * as attendanceApi from '../../api/attendance';
import * as leaveApi from '../../api/leave';
import * as settingsApi from '../../api/settings';
import * as payrollApi from '../../api/payroll';
import * as payrollCategoriesApi from '../../api/payrollCategories';
import * as employeesApi from '../../api/employees';
import * as departmentsApi from '../../api/departments';
import * as reportsApi from '../../api/reports';
import { USE_MOCKS } from '../../api/client';
import { makeDeptName } from '../../utils/deptName';
import {
  loadRule as loadAnnualLeaveRule,
  loadValuesForYear as loadALValuesForYear,
  tenureYears as alTenureYears,
  daysForTenure as alDaysForTenure,
} from '../../utils/annualLeave';

// Thin safe wrappers — Reports can render before annual-leave settings
// have been touched. Each helper falls back to a sensible default rather
// than throwing, so a fresh tenant doesn't break the Detailed Records
// table just because Settings → Annual Leave hasn't been opened yet.
const loadRuleSafe = () => {
  try { return loadAnnualLeaveRule(); }
  catch { return [] as ReturnType<typeof loadAnnualLeaveRule>; }
};
const loadValuesSafe = (year: number) => {
  try { return loadALValuesForYear(year); }
  catch { return {} as ReturnType<typeof loadALValuesForYear>; }
};
const tenureYearsSafe = (joinDate: string | Date | undefined, asOf: Date) => {
  try { return alTenureYears(joinDate ?? new Date().toISOString(), asOf); }
  catch { return 0; }
};
const daysForTenureSafe = (
  rule: ReturnType<typeof loadAnnualLeaveRule>,
  years: number,
) => {
  try { return alDaysForTenure(rule, years); }
  catch { return 0; }
};
import {
  exportAttendanceToExcel,
  exportPayrollToExcel,
} from '../../utils/excelExport';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Pagination } from '../common/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useI18n } from '../../i18n/I18nContext';
import { useDateFormat } from '../../context/DateFormatContext';

const TODAY = new Date('2026-04-20');

interface DeptLite { id: string; name: string; }

/**
 * Adapts a backend Employee to the local mock-shaped Employee. We keep the
 * UUID as `id` here (rather than empNo) because Attendance + PayrollItem
 * employeeId fields are UUIDs — using the same key everywhere makes the
 * filter / join logic in the report views straightforward.
 */
function adaptApiEmployee(e: employeesApi.Employee): Employee {
  return {
    id: e.id,
    empNo: e.empNo,
    name: e.name,
    khmerName: e.khmerName ?? undefined,
    email: e.email,
    position: e.position,
    department: e.departmentId ?? '-',
    joinDate: e.joinDate,
    status: (e.status === 'active' ? 'active' : 'inactive') as Employee['status'],
    contactNumber: e.contactNumber ?? '',
    baseSalary: e.baseSalary,
  };
}

function adaptApiAttendance(a: attendanceApi.AttendanceEntry): Attendance {
  // Backend's canonical fields are `workHours` / `otHours` (rule-aware,
  // deducts lunch). The legacy `hoursWorked` / `overtimeHours` keys still
  // exist for older sync payloads — fall back to them when the canonical
  // ones are null. Cast through Number because the wire format can be
  // string-encoded ("8.00") instead of number.
  const wh = a.workHours != null ? Number(a.workHours) : a.hoursWorked;
  const ot = a.otHours    != null ? Number(a.otHours)    : a.overtimeHours;
  return {
    id: a.id,
    employeeId: a.employeeId,
    date: a.date,
    checkIn: a.checkIn ?? '',
    checkOut: a.checkOut ?? undefined,
    morningIn: a.morningIn ?? undefined,
    morningOut: a.morningOut ?? undefined,
    noonIn: a.noonIn ?? undefined,
    noonOut: a.noonOut ?? undefined,
    status: a.status as Attendance['status'],
    workHours: Number.isFinite(wh) ? Number(wh) : undefined,
    otHours:   Number.isFinite(ot) ? Number(ot) : undefined,
    notes: a.notes,
  };
}

function adaptApiPayroll(p: payrollApi.PayrollItem): PayrollItem {
  const earn = p.earnings ?? {};
  const ded = p.deductionsBreakdown ?? {};
  return {
    id: p.id,
    employeeId: p.employeeId,
    month: p.month,
    baseSalary: p.baseSalary,
    otHours: p.otHours ?? 0,
    otPay: p.otPay ?? 0,
    totalEarnings: p.totalEarnings,
    deductions: p.deductions,
    totalPay: p.netSalary,
    // Legacy discrete fields — kept so the existing fullscreen detail view
    // and Excel export keep working unchanged.
    positionAllowance: earn['position'] ?? 0,
    evaluationAllowance: earn['evaluation'] ?? 0,
    taxOnSalary: ded['tax'] ?? 0,
    nssfPension: ded['nssf'] ?? 0,
    otherDeductions: Math.max(0, p.deductions - (ded['tax'] ?? 0) - (ded['nssf'] ?? 0)),
    currency: p.currency ?? 'USD',
    generatedAt: p.generatedAt ?? new Date().toISOString(),
    // Pass the raw Records through so report tables can render columns
    // matching whatever Payroll Categories the user configured.
    earnings: earn,
    deductionsBreakdown: ded,
  };
}

interface ReportsProps {
  /** When set, render only this report section and skip the tabs
   *  header. Used by the per-sub-module sidebar leaves so each menu
   *  entry takes the user straight to one report instead of going
   *  through the tabs at the top of the page. */
  initialView?: 'attendance' | 'payroll' | 'compliance';
}

export function Reports({ initialView }: ReportsProps = {}) {
  const { t } = useI18n();
  const { formatDate } = useDateFormat();
  const { currentUser, isModuleAvailable } = useAuth();

  // Shared datasets pulled once at this level. Children re-use them so we
  // don't fetch the same employee list twice when the user toggles tabs.
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [departments, setDepartments] = useState<DeptLite[]>(
    USE_MOCKS ? mockDepartments.map(d => ({ id: d.id, name: d.name })) : [],
  );
  // Payroll categories drive which columns the payroll detail table shows.
  // Default-empty in mock mode falls back to the legacy fixed-column view.
  const [payrollCategories, setPayrollCategories] = useState<payrollCategoriesApi.PayrollCategory[]>([]);
  const [loadingShared, setLoadingShared] = useState(!USE_MOCKS);

  useEffect(() => {
    if (USE_MOCKS) return;
    let cancelled = false;
    (async () => {
      setLoadingShared(true);
      try {
        const [empPage, deps, cats] = await Promise.all([
          employeesApi.list({ size: 500 }),
          departmentsApi.list(),
          payrollCategoriesApi.list({ enabled: true }),
        ]);
        if (cancelled) return;
        setEmployees(empPage.content.map(adaptApiEmployee));
        setDepartments(deps.map(d => ({ id: d.id, name: d.name })));
        setPayrollCategories(cats);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load employees');
      } finally {
        if (!cancelled) setLoadingShared(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Gate
  if (currentUser?.role === 'employee' || !currentUser) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center text-center gap-2">
          <AlertCircle className="h-10 w-10 text-gray-400" />
          <p className="font-medium">Reports are only available to Admin and Manager roles.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('page.reports.title')}</h1>
      </div>

      {/* Each tab corresponds to a sub-module under the 'reports'
          parent in the platform catalog (V77). When the Super Admin
          marks one of these as draft, or a tenant turns it off in
          Tenant Modules, the tab drops out automatically. When
          rendered with `initialView` (one sidebar leaf per sub-module
          in nav.ts), we skip the tabs header and render the chosen
          section directly — sidebar IS the navigation, no double
          chrome. */}
      {(() => {
        const tabs: Array<{
          id: 'attendance' | 'payroll' | 'compliance';
          subModule: string;
          label: string;
          icon: typeof Clock;
        }> = [
          { id: 'attendance', subModule: 'attendance-report', label: 'Attendance', icon: Clock },
          { id: 'payroll',    subModule: 'payroll-report',    label: 'Payroll',    icon: DollarSign },
          { id: 'compliance', subModule: 'compliance',        label: 'Compliance', icon: FileText },
        ];

        // Single-view mode: nav leaf maps directly to one section.
        if (initialView) {
          if (!isModuleAvailable(tabs.find(t => t.id === initialView)?.subModule ?? '')) {
            return (
              <p className="text-sm text-gray-500">
                This report is not enabled for your company.
              </p>
            );
          }
          if (initialView === 'attendance') {
            return <AttendanceReport employees={employees} departments={departments} sharedLoading={loadingShared} />;
          }
          if (initialView === 'payroll') {
            return <PayrollReport employees={employees} departments={departments} sharedLoading={loadingShared} categories={payrollCategories} />;
          }
          if (initialView === 'compliance') {
            return <ComplianceReport departments={departments} />;
          }
        }

        // Tabs fallback — for the legacy 'reports' route or any caller
        // that wants the all-in-one tabbed view. isModuleAvailable
        // returns false for drafts and per-tenant disables; pre-fetch
        // it's optimistic so the page doesn't blank during load.
        const visible = tabs.filter(t => isModuleAvailable(t.subModule));
        if (visible.length === 0) {
          return (
            <p className="text-sm text-gray-500">
              No report views are enabled for this company. Ask Super Admin to
              enable a Reports sub-module under Tenant Modules.
            </p>
          );
        }
        const defaultTab = visible[0].id;
        const gridCols = visible.length === 1 ? 'grid-cols-1'
          : visible.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
        return (
          <Tabs defaultValue={defaultTab} className="space-y-6">
            <TabsList className={`grid w-full max-w-xl ${gridCols}`}>
              {visible.map(t => (
                <TabsTrigger key={t.id} value={t.id}>
                  <t.icon className="h-4 w-4 mr-2" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {visible.some(t => t.id === 'attendance') && (
              <TabsContent value="attendance" className="space-y-6">
                <AttendanceReport employees={employees} departments={departments} sharedLoading={loadingShared} />
              </TabsContent>
            )}
            {visible.some(t => t.id === 'payroll') && (
              <TabsContent value="payroll" className="space-y-6">
                <PayrollReport
                  employees={employees}
                  departments={departments}
                  sharedLoading={loadingShared}
                  categories={payrollCategories}
                />
              </TabsContent>
            )}
            {visible.some(t => t.id === 'compliance') && (
              <TabsContent value="compliance" className="space-y-6">
                <ComplianceReport departments={departments} />
              </TabsContent>
            )}
          </Tabs>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attendance Report
// ---------------------------------------------------------------------------
function AttendanceReport({
  employees: allEmployees, departments, sharedLoading,
}: {
  employees: Employee[];
  departments: DeptLite[];
  sharedLoading: boolean;
}) {
  const [startDate, setStartDate] = useState(format(subMonths(TODAY, 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(TODAY, 'yyyy-MM-dd'));
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);
  const [records, setRecords] = useState<Attendance[]>(USE_MOCKS ? mockAttendance : []);
  const [loading, setLoading] = useState(false);

  // Refetch on date-range change. Department + status are applied client-side
  // so the user can flip filters without a round-trip.
  // Approved leaves loaded alongside attendance so the per-employee
  // summary can credit Leave days even when the backend doesn't write a
  // matching attendance row with status='leave' (most installs derive
  // leave on the fly by joining leave_requests, so the raw attendance
  // feed comes back without those days).
  const [leaves, setLeaves] = useState<leaveApi.LeaveRequest[]>([]);
  // Active attendance rule — drives the standard check-in time used for
  // computing per-record late-minutes (e.g. expected 08:00, scanned 08:12
  // → 12 minutes late). Defaults to 08:00 when no rule is configured.
  const [attRule, setAttRule] = useState<settingsApi.AttendanceRule | null>(null);

  useEffect(() => {
    if (USE_MOCKS) return;
    let cancelled = false;
    (async () => {
      try {
        const rules = await settingsApi.listAttendanceRules();
        if (cancelled) return;
        // Pick the default rule when present, else the first one.
        const def = rules.find(r => r.isDefault) ?? rules[0] ?? null;
        setAttRule(def);
      } catch {
        // Fall through silently — late minutes will use the 08:00
        // default rather than block the whole page.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (USE_MOCKS) {
      setRecords(mockAttendance);
      setLeaves([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Leaves load for the WHOLE YEAR of the selected end date — not
        // the narrow date filter — so Leave Used + Remaining read as
        // year-to-date (matching the yearly Annual Leave entitlement).
        // Without this, narrowing the filter to "this month" makes
        // Remaining wrong because it'd subtract only this-month's leaves
        // from a yearly cap.
        const yearForLeaves = new Date(endDate || new Date().toISOString()).getFullYear();
        const yearStart = `${yearForLeaves}-01-01`;
        const yearEnd   = `${yearForLeaves}-12-31`;
        const [att, lv] = await Promise.all([
          attendanceApi.listRange({ from: startDate, to: endDate }),
          leaveApi.list({
            status: 'approved',
            from: yearStart,
            to: yearEnd,
            scope: 'all',
            size: 5000,
          }).catch(() => ({ data: [] as leaveApi.LeaveRequest[] } as never)),
        ]);
        if (cancelled) return;
        setRecords(att.map(adaptApiAttendance));
        setLeaves(((lv as { data?: leaveApi.LeaveRequest[] }).data) ?? []);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load attendance');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  // Apply department filter client-side over the prefetched range.
  const employees = useMemo(() => {
    return departmentFilter === 'all'
      ? allEmployees
      : allEmployees.filter(e => e.department === departmentFilter);
  }, [allEmployees, departmentFilter]);

  const empIds = useMemo(() => new Set(employees.map(e => e.id)), [employees]);

  // Resolve a department id to its name (no-op in mock mode where dept on
  // Employee is already the human name). Stale UUIDs (dept deleted) collapse
  // to '—' rather than leak into the UI.
  const deptName = useMemo(() => makeDeptName(departments), [departments]);

  // Records used by the Status Breakdown chart, Top Absent list, and
  // Excel export — applies all three filters (date, employee scope,
  // status). Reflects exactly what the user asked to see.
  const filtered = useMemo(() => {
    return records.filter(a => {
      if (a.date < startDate || a.date > endDate) return false;
      if (!empIds.has(a.employeeId)) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      return true;
    });
  }, [records, startDate, endDate, empIds, statusFilter]);

  // Same date + employee scope as `filtered` but DOES NOT apply the status
  // filter — used by the per-employee summary so picking "Late" doesn't
  // zero out everyone's work hours / leave / OT. The status filter is then
  // applied at the displayed-row level (see AttendanceDetailTable) so HR
  // sees the full stat line for matching employees, not a filtered slice.
  const recordsForSummary = useMemo(() => {
    return records.filter(a => {
      if (a.date < startDate || a.date > endDate) return false;
      if (!empIds.has(a.employeeId)) return false;
      return true;
    });
  }, [records, startDate, endDate, empIds]);

  // ---- Per-employee aggregation (shared by KPI cards + Detailed table) ----
  // Active-only scoreboard. The Detailed Records table renders this
  // verbatim; the KPI cards above derive counts from it. Keeping a single
  // source of truth means a card's "10/120 perfect" matches exactly what
  // the table shows when that filter is active.
  const activeEmployees = useMemo(
    () => employees.filter(e => e.status === 'active'),
    [employees],
  );
  const yearForAL = useMemo(() => new Date(endDate || new Date().toISOString()).getFullYear(), [endDate]);
  const expectedHoursByEmpKey = useMemo(() => {
    if (!startDate || !endDate) return new Map<string, number>();
    const start = new Date(startDate);
    const end = new Date(endDate);
    let weekdays = 0;
    const c = new Date(start);
    while (c <= end) {
      const dow = c.getDay();
      if (dow !== 0 && dow !== 6) weekdays++;
      c.setDate(c.getDate() + 1);
    }
    const standardExpected = weekdays * 8;
    const m = new Map<string, number>();
    for (const e of activeEmployees) {
      const join = new Date(e.joinDate);
      if (join <= start) { m.set(e.id, standardExpected); continue; }
      if (join > end)    { m.set(e.id, 0); continue; }
      let perEmpDays = 0;
      const cc = new Date(join);
      while (cc <= end) {
        const dow = cc.getDay();
        if (dow !== 0 && dow !== 6) perEmpDays++;
        cc.setDate(cc.getDate() + 1);
      }
      m.set(e.id, perEmpDays * 8);
    }
    return m;
  }, [startDate, endDate, activeEmployees]);

  const alRule = useMemo(() => loadRuleSafe(), []);
  const totalALByEmpKey = useMemo(() => {
    const stored = loadValuesSafe(yearForAL);
    const m = new Map<string, number>();
    const asOf = new Date(yearForAL, 0, 1);
    for (const e of activeEmployees) {
      const fromStorage = stored[e.id]?.totalAL;
      if (typeof fromStorage === 'number') { m.set(e.id, fromStorage); continue; }
      m.set(e.id, daysForTenureSafe(alRule, tenureYearsSafe(e.joinDate, asOf)));
    }
    return m;
  }, [yearForAL, alRule, activeEmployees]);

  // Per-employee year-to-date leave-day count for ANNUAL-LEAVE-DEDUCTING
  // categories only (annual / sick / special). Maternity and Exception
  // are non-deductible — they're paid time but don't reduce the AL
  // balance — so they're filtered out here. Half-days count as 0.5;
  // multi-day requests use the backend's `days` value verbatim. Window
  // is the full calendar year of the selected end date, not the narrow
  // date filter — so Remaining = Annual Leave − Leave Used is consistent
  // with the yearly entitlement column even when the user narrows the
  // filter to a single month.
  const leaveDaysByEmp = useMemo(() => {
    const yearStart = `${yearForAL}-01-01`;
    const yearEnd   = `${yearForAL}-12-31`;
    const DEDUCTS_FROM_AL = new Set(['annual', 'sick', 'special']);
    const m = new Map<string, { count: number; dates: Set<string> }>();
    for (const lv of leaves) {
      if (lv.status !== 'approved') continue;
      if (lv.date < yearStart || lv.date > yearEnd) continue;
      // Skip non-deductible categories. Pre-V47 rows with no category
      // still flow through as 'annual' (legacy default), so existing
      // tenant data keeps deducting as before.
      const category = lv.category ?? 'annual';
      if (!DEDUCTS_FROM_AL.has(category)) continue;
      const cur = m.get(lv.employeeId) ?? { count: 0, dates: new Set() };
      const days = Number(lv.days) || (lv.halfDay ? 0.5 : 1);
      cur.count += days;
      cur.dates.add(lv.date);
      m.set(lv.employeeId, cur);
    }
    return m;
  }, [leaves, yearForAL]);

  // "08:00" → 480 minutes. Tolerates "HH:mm" or "HH:mm:ss"; returns null
  // for malformed input so callers can fall back without throwing.
  const parseHm = (hm: string | null | undefined): number | null => {
    if (!hm) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(hm);
    if (!m) return null;
    const h = Number(m[1]); const mn = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(mn)) return null;
    return h * 60 + mn;
  };
  const standardCheckInMin = useMemo(
    () => parseHm(attRule?.standardCheckIn) ?? 8 * 60,
    [attRule?.standardCheckIn],
  );

  const summaryRows = useMemo(() => {
    const byKey = new Map<string, {
      workHours: number; otHours: number;
      leaveDays: number; leaveDates: Set<string>;
      lateDays: number; lateMinutes: number;
      absentDays: number; presentDays: number;
    }>();
    for (const r of recordsForSummary) {
      const cur = byKey.get(r.employeeId) ?? {
        workHours: 0, otHours: 0,
        leaveDays: 0, leaveDates: new Set<string>(),
        lateDays: 0, lateMinutes: 0,
        absentDays: 0, presentDays: 0,
      };
      cur.workHours += Number(r.workHours ?? 0);
      cur.otHours   += Number(r.otHours ?? 0);
      if (r.status === 'leave')   { cur.leaveDays++; cur.leaveDates.add(r.date); }
      else if (r.status === 'late')   cur.lateDays++;
      else if (r.status === 'absent') cur.absentDays++;
      else if (r.status === 'present' || r.status === 'early_leave') cur.presentDays++;
      // Late minutes — computed off the actual punch time vs the
      // standard check-in. We don't depend on status='late' so a row
      // labelled 'present' but with a tardy scan still counts the
      // minutes (some sync rules only flag late past a threshold).
      const punchMin = parseHm(r.morningIn ?? r.checkIn ?? null);
      if (punchMin != null && punchMin > standardCheckInMin) {
        cur.lateMinutes += (punchMin - standardCheckInMin);
      }
      byKey.set(r.employeeId, cur);
    }
    return activeEmployees.map(e => {
      const s = byKey.get(e.id) ?? {
        workHours: 0, otHours: 0,
        leaveDays: 0, leaveDates: new Set<string>(),
        lateDays: 0, lateMinutes: 0,
        absentDays: 0, presentDays: 0,
      };
      // Merge approved-leave-request days that aren't already represented
      // by an attendance row. Avoids double-counting when the backend
      // wrote BOTH an attendance row (status=leave) and a leave request.
      const lvBucket = leaveDaysByEmp.get(e.id);
      let mergedLeaveDays = s.leaveDays;
      if (lvBucket) {
        for (const d of lvBucket.dates) {
          if (!s.leaveDates.has(d)) mergedLeaveDays += 1;
        }
        // Half-days only ever come through leave_requests (attendance
        // doesn't carry .5 leave). Pick up the fractional remainder by
        // comparing the request total against the integer date count.
        const requestedCount = lvBucket.count;
        const datesCount = lvBucket.dates.size;
        if (requestedCount > datesCount) {
          mergedLeaveDays += (requestedCount - datesCount);
        }
      }
      const expected = expectedHoursByEmpKey.get(e.id) ?? 0;
      const totalAL  = totalALByEmpKey.get(e.id) ?? 0;
      const ratio = expected > 0 ? Math.min(1, s.workHours / expected) : 0;
      return {
        emp: e,
        workHours: Math.round(s.workHours * 10) / 10,
        expectedHours: Math.round(expected * 10) / 10,
        otHours: Math.round(s.otHours * 10) / 10,
        leaveDays: Math.round(mergedLeaveDays * 10) / 10,
        lateDays: s.lateDays,
        lateMinutes: Math.round(s.lateMinutes),
        absentDays: s.absentDays,
        totalAL,
        remainingAL: Math.max(0, totalAL - mergedLeaveDays),
        ratio,
      };
    });
  }, [recordsForSummary, activeEmployees, expectedHoursByEmpKey, totalALByEmpKey, leaveDaysByEmp, standardCheckInMin]);

  // KPI counts derived from summaryRows. Each card maps to a filter the
  // user can toggle to slice the Detailed Records table.
  type KpiFilter = 'all' | 'perfect' | 'late' | 'metHours' | 'absent';
  const kpiCounts = useMemo(() => {
    const total = summaryRows.length;
    let perfect = 0, late = 0, metHours = 0, absent = 0;
    for (const r of summaryRows) {
      if (r.lateDays === 0 && r.absentDays === 0) perfect++;
      if (r.lateDays > 0)   late++;
      if (r.expectedHours > 0 && r.workHours >= r.expectedHours) metHours++;
      if (r.absentDays > 0) absent++;
    }
    return { total, perfect, late, metHours, absent };
  }, [summaryRows]);

  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('all');

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error('No records to export');
      return;
    }
    exportAttendanceToExcel({
      attendance: filtered,
      employees,
      startDate,
      endDate,
      fileName: `Attendance-${startDate}_to_${endDate}${departmentFilter !== 'all' ? '-' + departmentFilter : ''}.xlsx`,
    });
    toast.success(`Exported ${filtered.length} attendance records`);
  };

  const setPreset = (preset: 'thisMonth' | 'lastMonth' | 'last7' | 'last30') => {
    if (preset === 'thisMonth') {
      setStartDate(format(startOfMonth(TODAY), 'yyyy-MM-dd'));
      setEndDate(format(TODAY, 'yyyy-MM-dd'));
    } else if (preset === 'lastMonth') {
      const prev = subMonths(TODAY, 1);
      setStartDate(format(startOfMonth(prev), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(prev), 'yyyy-MM-dd'));
    } else if (preset === 'last7') {
      const s = new Date(TODAY);
      s.setDate(s.getDate() - 7);
      setStartDate(format(s, 'yyyy-MM-dd'));
      setEndDate(format(TODAY, 'yyyy-MM-dd'));
    } else if (preset === 'last30') {
      const s = new Date(TODAY);
      s.setDate(s.getDate() - 30);
      setStartDate(format(s, 'yyyy-MM-dd'));
      setEndDate(format(TODAY, 'yyyy-MM-dd'));
    }
  };

  return (
    <>
      {/* KPI cards — clickable filters that slice the Detailed Records
          table below. Click an active card again to clear back to "All".
          Counts are computed off the same per-employee aggregation the
          table renders, so the numbers stay in lockstep. Surfaced
          directly under the page title so HR sees the headline numbers
          before drilling in with filters. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        <KpiCard
          label="Perfect Attendance"
          subtitle="No late · No absent"
          count={kpiCounts.perfect}
          total={kpiCounts.total}
          tone="green"
          icon={TrendingUp}
          active={kpiFilter === 'perfect'}
          onClick={() => setKpiFilter(prev => prev === 'perfect' ? 'all' : 'perfect')}
        />
        <KpiCard
          label="Top Late"
          subtitle="≥ 1 late mark"
          count={kpiCounts.late}
          total={kpiCounts.total}
          tone="amber"
          icon={Clock}
          active={kpiFilter === 'late'}
          onClick={() => setKpiFilter(prev => prev === 'late' ? 'all' : 'late')}
        />
        <KpiCard
          label="Met Work Hours"
          subtitle="Worked ≥ expected"
          count={kpiCounts.metHours}
          total={kpiCounts.total}
          tone="blue"
          icon={FileText}
          active={kpiFilter === 'metHours'}
          onClick={() => setKpiFilter(prev => prev === 'metHours' ? 'all' : 'metHours')}
        />
        <KpiCard
          label="Has Absent"
          subtitle="≥ 1 absent day"
          count={kpiCounts.absent}
          total={kpiCounts.total}
          tone="red"
          icon={AlertCircle}
          active={kpiFilter === 'absent'}
          onClick={() => setKpiFilter(prev => prev === 'absent' ? 'all' : 'absent')}
        />
      </div>

      {/* Filter bar — single-row compact layout. Date inputs first, then
          Dept + Status selects, presets pushed to the right as quick
          buttons. No CardHeader / "Filters" title — the KPI cards above
          and the page H1 already frame the section. */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-gray-500">From</Label>
            <DateInput
              value={startDate}
              onChange={setStartDate}
              className="h-9 w-36 text-sm"
              title="Start date"
            />
            <Label className="text-xs text-gray-500">To</Label>
            <DateInput
              value={endDate}
              onChange={setEndDate}
              className="h-9 w-36 text-sm"
              title="End date"
            />
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="h-9 w-44 text-sm" title="Department"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(d => (
                  // value matches Employee.department (id in live, name in mock)
                  <SelectItem key={d.id} value={USE_MOCKS ? d.name : d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-36 text-sm" title="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="early_leave">Early Leave</SelectItem>
                <SelectItem value="leave">On Leave</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="no_checkin">No Check-in</SelectItem>
                <SelectItem value="no_checkout">No Check-out</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPreset('thisMonth')}>This Month</Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPreset('lastMonth')}>Last Month</Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPreset('last7')}>7d</Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPreset('last30')}>30d</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed records — per-employee yearly attendance summary.
          Receives the precomputed summaryRows from the parent so the
          numbers in this table match the KPI cards exactly. Export
          Excel is rendered in the table's header. */}
      <AttendanceDetailTable
        rows={summaryRows}
        kpiFilter={kpiFilter}
        onClearFilter={() => setKpiFilter('all')}
        statusFilter={statusFilter}
        onPickEmployee={setDetailEmployee}
        loading={loading || sharedLoading}
        deptName={deptName}
        onExport={handleExport}
        exportCount={filtered.length}
      />

      <AttendanceEmployeeDialog
        employee={detailEmployee}
        records={filtered}
        startDate={startDate}
        endDate={endDate}
        onClose={() => setDetailEmployee(null)}
        deptName={deptName}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Payroll Report
// ---------------------------------------------------------------------------
function PayrollReport({
  employees: allEmployees, departments, sharedLoading, categories,
}: {
  employees: Employee[];
  departments: DeptLite[];
  sharedLoading: boolean;
  categories: payrollCategoriesApi.PayrollCategory[];
}) {
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [detailDept, setDetailDept] = useState<string | null>(null);
  const [items, setItems] = useState<PayrollItem[]>(USE_MOCKS ? mockPayroll : []);
  const [availableMonths, setAvailableMonths] = useState<string[]>(
    USE_MOCKS
      ? Array.from(new Set(mockPayroll.map(p => p.month))).sort((a, b) => b.localeCompare(a))
      : [],
  );
  const [loading, setLoading] = useState(false);

  // Source of available months: distinct monthYear values across payroll
  // batches. Refreshed once on mount; if a new batch lands during the
  // session the user picks "all" and we fetch every month anyway.
  useEffect(() => {
    if (USE_MOCKS) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await payrollApi.listBatches({ size: 200 });
        if (cancelled) return;
        const months = Array.from(new Set(res.data.map(b => b.monthYear)))
          .sort((a, b) => b.localeCompare(a));
        setAvailableMonths(months);
      } catch (err) {
        if (!cancelled) console.warn('Could not load payroll batches', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch items when month filter changes. "all" fans out across every
  // available month and concatenates — cheap enough for the dataset sizes
  // a typical tenant accumulates per year.
  useEffect(() => {
    if (USE_MOCKS) {
      setItems(mockPayroll);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const monthsToFetch = monthFilter === 'all' ? availableMonths : [monthFilter];
        if (monthsToFetch.length === 0) {
          setItems([]);
          return;
        }
        const all = await Promise.all(
          monthsToFetch.map(m => payrollApi.listItemsByMonth(m).catch(() => [])),
        );
        if (cancelled) return;
        setItems(all.flat().map(adaptApiPayroll));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load payroll items');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [monthFilter, availableMonths]);

  const employees = useMemo(() => {
    return departmentFilter === 'all'
      ? allEmployees
      : allEmployees.filter(e => e.department === departmentFilter);
  }, [allEmployees, departmentFilter]);

  const empIds = useMemo(() => new Set(employees.map(e => e.id)), [employees]);

  const filtered = useMemo(() => {
    return items.filter(p => {
      if (monthFilter !== 'all' && p.month !== monthFilter) return false;
      if (!empIds.has(p.employeeId)) return false;
      return true;
    });
  }, [items, monthFilter, empIds]);

  const stats = useMemo(() => {
    let earn = 0, ded = 0, net = 0, ot = 0, otHours = 0;
    filtered.forEach(p => {
      earn += p.totalEarnings;
      ded += p.deductions;
      net += p.totalPay;
      ot += p.otPay || 0;
      otHours += p.otHours || 0;
    });
    return { count: filtered.length, earn, ded, net, ot, otHours };
  }, [filtered]);

  // Map deptId → deptName for live mode; identity in mock mode (Employee
  // already carries the dept name there). Stale UUIDs collapse to '—'.
  const deptName = useMemo(() => makeDeptName(departments), [departments]);

  const byDept = useMemo(() => {
    const map = new Map<string, { count: number; earn: number; ded: number; net: number }>();
    filtered.forEach(p => {
      const empDept = allEmployees.find(e => e.id === p.employeeId)?.department || 'Unknown';
      const display = deptName(empDept);
      const v = map.get(display) || { count: 0, earn: 0, ded: 0, net: 0 };
      v.count++;
      v.earn += p.totalEarnings;
      v.ded += p.deductions;
      v.net += p.totalPay;
      map.set(display, v);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].net - a[1].net);
  }, [filtered, allEmployees, deptName]);

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error('No records to export');
      return;
    }
    exportPayrollToExcel({
      payrollItems: filtered,
      employees,
      period: monthFilter === 'all' ? 'All' : monthFilter,
      fileName: `Payroll-${monthFilter === 'all' ? 'All' : monthFilter}${departmentFilter !== 'all' ? '-' + departmentFilter : ''}.xlsx`,
    });
    toast.success(`Exported ${filtered.length} payroll records`);
  };

  return (
    <>
      {/* Summary Stats — surfaced before the filter bar so the headline
          numbers land first, matching the Attendance and Compliance tabs. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        <StatCard label="Records" value={stats.count} icon={FileText} tone="blue" />
        <StatCard label="Total Earnings" value={`$${formatMoney(stats.earn)}`} icon={TrendingUp} tone="green" />
        <StatCard label="Total Deductions" value={`$${formatMoney(stats.ded)}`} icon={DollarSign} tone="red" />
        <StatCard label="Net Salary" value={`$${formatMoney(stats.net)}`} icon={DollarSign} tone="purple" />
      </div>

      {/* Filter bar — same compact single-row treatment as the
          Attendance tab. Only two selects here (Month + Department). */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-gray-500">Month</Label>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="h-9 w-44 text-sm" title="Month"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {availableMonths.map(m => (
                  <SelectItem key={m} value={m}>{format(parseISO(m + '-01'), 'MMMM yyyy')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="h-9 w-44 text-sm" title="Department"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(d => (
                  <SelectItem key={d.id} value={USE_MOCKS ? d.name : d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* By Department */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            By Department
          </CardTitle>
        </CardHeader>
        <CardContent>
          {byDept.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No records in the selected range</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net Salary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDept.map(([dept, v]) => (
                  <TableRow
                    key={dept}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setDetailDept(dept)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {dept}
                        <Eye className="h-3.5 w-3.5 text-gray-400" />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(v.count)}</TableCell>
                    <TableCell className="text-right text-green-700">
                      ${formatMoney(v.earn)}
                    </TableCell>
                    <TableCell className="text-right text-red-700">
                      ${formatMoney(v.ded)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${formatMoney(v.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detailed records — full per-employee payroll breakdown.
          Export Excel lives in the table's own header now. */}
      <PayrollDetailTable
        records={filtered}
        employees={allEmployees}
        deptName={deptName}
        period={monthFilter === 'all' ? 'All Months' : format(parseISO(monthFilter + '-01'), 'MMMM yyyy')}
        loading={loading || sharedLoading}
        categories={categories}
        onExport={handleExport}
        exportCount={filtered.length}
      />

      <PayrollDeptDialog
        department={detailDept}
        records={filtered}
        employees={allEmployees}
        deptName={deptName}
        period={monthFilter === 'all' ? 'All Months' : format(parseISO(monthFilter + '-01'), 'MMMM yyyy')}
        onClose={() => setDetailDept(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Detail components — Attendance
// ---------------------------------------------------------------------------
type AttendanceSummaryRow = {
  emp: Employee;
  workHours: number;
  expectedHours: number;
  otHours: number;
  leaveDays: number;
  lateDays: number;
  /** Total minutes late across the period, computed as
   *  max(0, morningIn − standardCheckIn) summed per row. */
  lateMinutes: number;
  absentDays: number;
  totalAL: number;
  remainingAL: number;
  ratio: number;
};

function AttendanceDetailTable({
  rows, kpiFilter, onClearFilter, statusFilter, onPickEmployee, loading, deptName,
  onExport, exportCount,
}: {
  rows: AttendanceSummaryRow[];
  kpiFilter: 'all' | 'perfect' | 'late' | 'metHours' | 'absent';
  onClearFilter: () => void;
  /** Status dropdown from the page header. Filters the displayed rows
   *  by which employees actually had records of that status — does NOT
   *  zero out their work hours / OT / etc. */
  statusFilter: string;
  onPickEmployee: (e: Employee) => void;
  loading?: boolean;
  deptName?: (id: string) => string;
  /** Top-right Export Excel button — supplied by the parent so the
   *  table doesn't need to know about the raw daily records used in
   *  the workbook. */
  onExport?: () => void;
  /** Number of underlying daily records the export will include —
   *  shown in the button label so HR knows the scope at a glance. */
  exportCount?: number;
}) {
  const resolveDept = deptName ?? ((s: string) => s);

  // Apply the KPI-card filter selected up top. 'all' = full list.
  const kpiFiltered = useMemo(() => {
    switch (kpiFilter) {
      case 'perfect':  return rows.filter(r => r.lateDays === 0 && r.absentDays === 0);
      case 'late':     return rows.filter(r => r.lateDays > 0);
      case 'metHours': return rows.filter(r => r.expectedHours > 0 && r.workHours >= r.expectedHours);
      case 'absent':   return rows.filter(r => r.absentDays > 0);
      default:         return rows;
    }
  }, [rows, kpiFilter]);

  // Status filter — narrows to employees who exhibited the chosen status
  // at least once. AND-combines with the KPI filter (both restrict).
  const statusFiltered = useMemo(() => {
    if (!statusFilter || statusFilter === 'all') return kpiFiltered;
    switch (statusFilter) {
      case 'present':     return kpiFiltered.filter(r => (r.workHours > 0) || (r.expectedHours > 0 && r.lateDays + r.absentDays + r.leaveDays === 0));
      case 'late':        return kpiFiltered.filter(r => r.lateDays > 0);
      case 'absent':      return kpiFiltered.filter(r => r.absentDays > 0);
      case 'leave':       return kpiFiltered.filter(r => r.leaveDays > 0);
      // The remaining statuses (no_checkin / no_checkout / early_leave)
      // aren't tracked at the per-employee scoreboard level — they're
      // edge-of-day flags, not a meaningful "this employee is X" tag —
      // so leave the list untouched and rely on the records-level
      // breakdown for those.
      default:            return kpiFiltered;
    }
  }, [kpiFiltered, statusFilter]);

  // Sortable headers. Default sort: attendance ratio desc with the same
  // tie-break as before (lower absent+late wins). Click a header to sort
  // by that column; click again to flip direction.
  type SortKey =
    | 'employee' | 'department' | 'work' | 'ot' | 'late'
    | 'leave' | 'totalAL' | 'remaining' | 'attendance';
  const [sortKey, setSortKey] = useState<SortKey>('attendance');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      // Sensible default: text columns ascending, numeric columns descending.
      setSortDir(key === 'employee' || key === 'department' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    const cmp = (a: AttendanceSummaryRow, b: AttendanceSummaryRow): number => {
      switch (sortKey) {
        case 'employee':   return (a.emp.name || '').localeCompare(b.emp.name || '');
        case 'department': return (a.emp.department || '').localeCompare(b.emp.department || '');
        case 'work':       return a.workHours - b.workHours;
        case 'ot':         return a.otHours - b.otHours;
        case 'late':       return a.lateDays - b.lateDays;
        case 'leave':      return a.leaveDays - b.leaveDays;
        case 'totalAL':    return a.totalAL - b.totalAL;
        case 'remaining':  return a.remainingAL - b.remainingAL;
        case 'attendance':
        default: {
          if (b.ratio !== a.ratio) return a.ratio - b.ratio;
          return (b.absentDays + b.lateDays) - (a.absentDays + a.lateDays);
        }
      }
    };
    const out = [...statusFiltered].sort(cmp);
    return sortDir === 'asc' ? out : out.reverse();
  }, [statusFiltered, sortKey, sortDir]);

  const pagination = usePagination(sorted, 25);

  // Render a column header with a tiny sort indicator. Clicking either
  // sets this column active or flips the direction when it already is.
  const SortableHead = ({
    label, sortKeyValue, align = 'left',
  }: {
    label: string;
    sortKeyValue: SortKey;
    align?: 'left' | 'right';
  }) => {
    const active = sortKey === sortKeyValue;
    const arrow = !active ? '↕' : sortDir === 'asc' ? '↑' : '↓';
    const alignCls = align === 'right' ? 'text-right justify-end' : 'text-left';
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortKeyValue)}
        className={`flex items-center gap-1 ${alignCls} w-full hover:text-blue-700 transition`}
      >
        <span>{label}</span>
        <span className={active ? 'text-blue-600 font-semibold' : 'text-gray-300'}>{arrow}</span>
      </button>
    );
  };

  const ratioBadgeCls = (ratio: number) => {
    if (ratio >= 0.95) return 'bg-green-50 text-green-700';
    if (ratio >= 0.85) return 'bg-blue-50 text-blue-700';
    if (ratio >= 0.70) return 'bg-amber-50 text-amber-700';
    return 'bg-red-50 text-red-700';
  };

  const filterLabel: Record<typeof kpiFilter, string> = {
    all:      '',
    perfect:  'Perfect attendance',
    late:     'With late marks',
    metHours: 'Met work hours',
    absent:   'Has absent days',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3 sm:justify-between sm:flex-wrap overflow-x-auto sm:overflow-visible">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <FileText className="h-4 w-4" />
            Detailed Records
            <Badge variant="secondary" className="ml-1 font-normal">{rows.length} employees</Badge>
            {kpiFilter !== 'all' && (
              <button
                type="button"
                onClick={onClearFilter}
                className="text-xs font-normal text-blue-700 bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100"
                title="Clear filter"
              >
                Filter: {filterLabel[kpiFilter]} ({sorted.length}) ✕
              </button>
            )}
            <span className="text-xs font-normal text-gray-500">
              Sorted by attendance — best first
            </span>
          </CardTitle>
          {onExport && (
            <Button
              size="sm"
              onClick={onExport}
              disabled={!exportCount}
              title="Excel file with summary, per-employee breakdown, and daily log"
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export Excel{exportCount != null ? ` (${exportCount})` : ''}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            {loading ? 'Loading…' : 'No active employees in the current scope'}
          </p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            No employees match the current filter — <button onClick={onClearFilter} className="text-blue-600 hover:underline">clear filter</button> to show all.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead><SortableHead label="Employee" sortKeyValue="employee" /></TableHead>
                  <TableHead><SortableHead label="Department" sortKeyValue="department" /></TableHead>
                  <TableHead
                    className="text-right"
                    title="Hours actually worked (sum of scanned work-hours) vs hours expected (weekday count × 8h, capped to days since join)"
                  >
                    <SortableHead label="Hours Worked / Expected" sortKeyValue="work" align="right" />
                  </TableHead>
                  <TableHead className="text-right"><SortableHead label="OT (h)" sortKeyValue="ot" align="right" /></TableHead>
                  <TableHead className="text-right" title="Times late · total hours late (vs standard check-in)">
                    <SortableHead label="Late (× / hrs)" sortKeyValue="late" align="right" />
                  </TableHead>
                  <TableHead className="text-right" title="Year-to-date approved leave days (Annual / Sick / Special only — Maternity & Exception don't deduct from AL)">
                    <SortableHead label="Leave Used (YTD)" sortKeyValue="leave" align="right" />
                  </TableHead>
                  <TableHead className="text-right"><SortableHead label="Annual Leave" sortKeyValue="totalAL" align="right" /></TableHead>
                  <TableHead className="text-right"><SortableHead label="Remaining" sortKeyValue="remaining" align="right" /></TableHead>
                  <TableHead className="text-right"><SortableHead label="Attendance" sortKeyValue="attendance" align="right" /></TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map((row, i) => {
                  const rank = pagination.startIndex + i + 1;
                  return (
                    <TableRow key={row.emp.id}>
                      <TableCell className="text-xs text-gray-500">{rank}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{row.emp.name}</p>
                          <p className="text-xs text-gray-400">{row.emp.empNo ?? row.emp.id}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {resolveDept(row.emp.department) || '—'}
                      </TableCell>
                      <TableCell
                        className="text-right text-xs"
                        title={
                          row.expectedHours > 0
                            ? `Worked ${row.workHours}h of ${row.expectedHours}h expected (${
                                row.workHours >= row.expectedHours
                                  ? `+${(row.workHours - row.expectedHours).toFixed(1)}h above`
                                  : `${(row.expectedHours - row.workHours).toFixed(1)}h short`
                              })`
                            : `Worked ${row.workHours}h`
                        }
                      >
                        <span className="font-medium">{row.workHours}h</span>
                        <span className="text-gray-400"> / {row.expectedHours}h</span>
                        {row.expectedHours > 0 && (
                          <span
                            className={`ml-1 text-[10px] font-normal ${
                              row.workHours >= row.expectedHours ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {row.workHours >= row.expectedHours
                              ? `(+${(row.workHours - row.expectedHours).toFixed(1)})`
                              : `(−${(row.expectedHours - row.workHours).toFixed(1)})`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">{row.otHours || '—'}</TableCell>
                      <TableCell className="text-right text-xs">
                        {row.lateDays > 0 || row.lateMinutes > 0 ? (
                          <span
                            className="text-amber-600 font-medium"
                            title={`${row.lateMinutes} minutes total`}
                          >
                            {row.lateDays}
                            <span className="text-gray-400 font-normal"> / </span>
                            <span className="text-amber-700">
                              {(row.lateMinutes / 60).toFixed(2)}
                            </span>
                            <span className="text-gray-500 font-normal"> hrs</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">{row.leaveDays || '—'}</TableCell>
                      <TableCell className="text-right text-xs">{row.totalAL}</TableCell>
                      <TableCell className="text-right text-xs">
                        <span className={row.remainingAL <= 0 ? 'text-red-600 font-medium' : ''}>
                          {row.remainingAL}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className={`${ratioBadgeCls(row.ratio)} border-0`}>
                          {(row.ratio * 100).toFixed(0)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title={`View daily entries for ${row.emp.name}`}
                          onClick={() => onPickEmployee(row.emp)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {sorted.length > 25 && (
              <div className="mt-4">
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
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AttendanceEmployeeDialog({
  employee, records, startDate, endDate, onClose, deptName,
}: {
  employee: Employee | null;
  records: Attendance[];
  startDate: string;
  endDate: string;
  onClose: () => void;
  deptName?: (id: string) => string;
}) {
  const { formatDate } = useDateFormat();
  const resolveDept = deptName ?? ((s: string) => s);
  const myRecords = useMemo(() => {
    if (!employee) return [];
    return records
      .filter(r => r.employeeId === employee.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [employee, records]);

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    let ot = 0, work = 0;
    myRecords.forEach(r => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      ot += r.otHours || 0;
      work += r.workHours || 0;
    });
    return { byStatus, ot, work };
  }, [myRecords]);

  return (
    <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Attendance Detail — {employee?.name}</DialogTitle>
          <DialogDescription>
            {formatDate(startDate)} – {formatDate(endDate)} ·{' '}
            {employee ? resolveDept(employee.department) : ''} · {employee?.position}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-500">Total Days</p>
              <p className="text-lg font-semibold">{myRecords.length}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-500">Total Leave</p>
              <p className="text-lg font-semibold text-blue-600">{stats.byStatus['leave'] ?? 0}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-500">Total Late</p>
              <p className="text-lg font-semibold text-amber-600">{stats.byStatus['late'] ?? 0}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-500">Total Absences</p>
              <p className="text-lg font-semibold text-red-600">{stats.byStatus['absent'] ?? 0}</p>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">OT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-gray-400 py-6">
                      No records in this range
                    </TableCell>
                  </TableRow>
                ) : myRecords.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{format(new Date(r.date), 'MMM dd')}</TableCell>
                    <TableCell className="text-xs capitalize">{r.status.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-xs tabular-nums">{r.morningIn ?? r.checkIn ?? '-'}</TableCell>
                    <TableCell className="text-xs tabular-nums">{r.noonOut ?? r.checkOut ?? '-'}</TableCell>
                    <TableCell className="text-xs text-right">{r.workHours?.toFixed(1) ?? '-'}</TableCell>
                    <TableCell className="text-xs text-right">{r.otHours?.toFixed(1) ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Detail components — Payroll
// ---------------------------------------------------------------------------
function PayrollDetailTable({
  records, employees, period, deptName, loading, categories,
  onExport, exportCount,
}: {
  records: PayrollItem[];
  employees: Employee[];
  period: string;
  deptName?: (id: string) => string;
  loading?: boolean;
  categories?: payrollCategoriesApi.PayrollCategory[];
  /** Top-right Export Excel button — handled by the parent. */
  onExport?: () => void;
  exportCount?: number;
}) {
  const empById = useMemo(
    () => new Map(employees.map(e => [e.id, e])),
    [employees],
  );
  const resolveDept = deptName ?? ((s: string) => s);
  const sorted = useMemo(
    () => [...records].sort((a, b) => b.month.localeCompare(a.month) || a.employeeId.localeCompare(b.employeeId)),
    [records],
  );
  const pagination = usePagination(sorted, 25);

  // The backend uses `displayOrder` while the FE type calls it `order` —
  // accept either so this view doesn't depend on which name the API client
  // happens to expose at any given time.
  const orderOf = (c: payrollCategoriesApi.PayrollCategory): number =>
    (c as unknown as { displayOrder?: number }).displayOrder ?? c.order ?? 0;

  // Split + sort the configured categories. If the categories API is empty
  // (e.g. mock mode or categories haven't loaded), fall back to a fixed
  // legacy column set so the table still renders something sensible.
  const earningCols = useMemo(
    () => (categories ?? [])
      .filter(c => c.kind === 'earning' && c.enabled)
      .sort((a, b) => orderOf(a) - orderOf(b)),
    [categories],
  );
  const deductionCols = useMemo(
    () => (categories ?? [])
      .filter(c => c.kind === 'deduction' && c.enabled)
      .sort((a, b) => orderOf(a) - orderOf(b)),
    [categories],
  );
  const useDynamic = earningCols.length > 0 || deductionCols.length > 0;

  // Resolves a per-category amount for one payroll item. Special-cases the
  // built-in 'basic' and 'ot' codes to read from the dedicated fields, since
  // historical rows may not duplicate those into the earnings JSONB.
  const earnAmount = (p: PayrollItem, code: string): number => {
    const fromMap = p.earnings?.[code];
    if (fromMap !== undefined) return fromMap;
    if (code === 'basic') return p.baseSalary;
    if (code === 'ot') return p.otPay ?? 0;
    return 0;
  };
  const dedAmount = (p: PayrollItem, code: string): number => p.deductionsBreakdown?.[code] ?? 0;

  const fmt = (n: number) => formatMoney(n);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3 sm:justify-between sm:flex-wrap overflow-x-auto sm:overflow-visible">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Detailed Records
            <Badge variant="secondary" className="ml-1 font-normal">{records.length}</Badge>
            <span className="text-xs font-normal text-gray-400 ml-1">{period}</span>
          </CardTitle>
          {onExport && (
            <Button
              size="sm"
              onClick={onExport}
              disabled={!exportCount}
              title="Excel file with summary, detailed rows, and per-employee totals"
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export Excel{exportCount != null ? ` (${exportCount})` : ''}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            {loading ? 'Loading…' : 'No payroll records in the selected range'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-white z-10">Employee</TableHead>
                    <TableHead>Month</TableHead>
                    {useDynamic ? (
                      <>
                        {earningCols.map(c => (
                          <TableHead key={c.id} className="text-right text-green-700">{c.label}</TableHead>
                        ))}
                        <TableHead className="text-right">Earnings</TableHead>
                        {deductionCols.map(c => (
                          <TableHead key={c.id} className="text-right text-red-700">{c.label}</TableHead>
                        ))}
                        <TableHead className="text-right">Deductions</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead className="text-right">Basic</TableHead>
                        <TableHead className="text-right">OT</TableHead>
                        <TableHead className="text-right">Allowance</TableHead>
                        <TableHead className="text-right">Earnings</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">NSSF</TableHead>
                        <TableHead className="text-right">Other Ded.</TableHead>
                      </>
                    )}
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(p => {
                    const emp = empById.get(p.employeeId);
                    const allowance = (p.positionAllowance ?? 0) + (p.evaluationAllowance ?? 0);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="sticky left-0 bg-white">
                          <p className="text-sm font-medium">{emp?.name ?? p.employeeId}</p>
                          <p className="text-xs text-gray-400">{emp?.empNo ?? emp?.id ?? ''}</p>
                        </TableCell>
                        <TableCell className="text-xs">{p.month}</TableCell>
                        {useDynamic ? (
                          <>
                            {earningCols.map(c => (
                              <TableCell key={c.id} className="text-right text-xs">${fmt(earnAmount(p, c.code))}</TableCell>
                            ))}
                            <TableCell className="text-right text-xs text-green-700 font-medium">${fmt(p.totalEarnings)}</TableCell>
                            {deductionCols.map(c => (
                              <TableCell key={c.id} className="text-right text-xs">${fmt(dedAmount(p, c.code))}</TableCell>
                            ))}
                            <TableCell className="text-right text-xs text-red-700 font-medium">${fmt(p.deductions)}</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-right text-xs">${fmt(p.baseSalary)}</TableCell>
                            <TableCell className="text-right text-xs">${fmt(p.otPay)}</TableCell>
                            <TableCell className="text-right text-xs">${fmt(allowance)}</TableCell>
                            <TableCell className="text-right text-xs text-green-700">${fmt(p.totalEarnings)}</TableCell>
                            <TableCell className="text-right text-xs">${fmt(p.taxOnSalary ?? 0)}</TableCell>
                            <TableCell className="text-right text-xs">${fmt(p.nssfPension ?? 0)}</TableCell>
                            <TableCell className="text-right text-xs">${fmt(p.otherDeductions ?? 0)}</TableCell>
                          </>
                        )}
                        <TableCell className="text-right text-sm font-semibold">${fmt(p.totalPay)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {sorted.length > 25 && (
              <div className="mt-4">
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
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PayrollDeptDialog({
  department, records, employees, period, onClose, deptName,
}: {
  /** The department NAME selected from the byDept table. */
  department: string | null;
  records: PayrollItem[];
  employees: Employee[];
  period: string;
  onClose: () => void;
  deptName?: (id: string) => string;
}) {
  const resolveDept = deptName ?? ((s: string) => s);
  const empById = useMemo(
    () => new Map(employees.map(e => [e.id, e])),
    [employees],
  );

  const myRecords = useMemo(() => {
    if (!department) return [];
    return records.filter(p => {
      const emp = empById.get(p.employeeId);
      // department is a name; emp.department is an id (live) or name (mock).
      // resolveDept normalizes to name in both modes.
      return (emp ? resolveDept(emp.department) : 'Unknown') === department;
    });
  }, [department, records, empById, resolveDept]);

  const totals = useMemo(() => {
    let earn = 0, ded = 0, net = 0;
    myRecords.forEach(p => { earn += p.totalEarnings; ded += p.deductions; net += p.totalPay; });
    return { earn, ded, net };
  }, [myRecords]);

  return (
    <Dialog open={!!department} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Payroll Detail — {department}</DialogTitle>
          <DialogDescription>
            {period} · {myRecords.length} record{myRecords.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-500">Total Earnings</p>
              <p className="text-lg font-semibold text-green-700">
                ${formatMoney(totals.earn)}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-500">Total Deductions</p>
              <p className="text-lg font-semibold text-red-700">
                ${formatMoney(totals.ded)}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-500">Net Salary</p>
              <p className="text-lg font-semibold">
                ${formatMoney(totals.net)}
              </p>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white">
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-gray-400 py-6">
                      No records
                    </TableCell>
                  </TableRow>
                ) : myRecords.map(p => {
                  const emp = empById.get(p.employeeId);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="text-sm font-medium">{emp?.name ?? p.employeeId}</p>
                        <p className="text-xs text-gray-400">{emp?.position ?? ''}</p>
                      </TableCell>
                      <TableCell className="text-xs">{p.month}</TableCell>
                      <TableCell className="text-right text-xs text-green-700">
                        ${formatMoney(p.totalEarnings)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-red-700">
                        ${formatMoney(p.deductions)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        ${formatMoney(p.totalPay)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Compliance Report — surfaces users with the most missed punches per the
// observation pattern (e.g. user 6151: 98/102 single-scan days).
// ---------------------------------------------------------------------------
function ComplianceReport({ departments }: { departments: DeptLite[] }) {
  const [startDate, setStartDate] = useState(format(subMonths(TODAY, 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(TODAY, 'yyyy-MM-dd'));
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [rows, setRows] = useState<reportsApi.ComplianceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await reportsApi.compliance({
          from: startDate,
          to: endDate,
          departmentId: departmentFilter === 'all' ? undefined : departmentFilter,
        });
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load compliance');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [startDate, endDate, departmentFilter]);

  // Aggregate stats for the StatCards row.
  const totals = useMemo(() => {
    let scanned = 0, complete = 0, single = 0, absent = 0;
    rows.forEach(r => {
      scanned += r.scannedDays;
      complete += r.completeDays;
      single += r.singleScanDays;
      absent += r.absentDays;
    });
    const overallPct = scanned === 0 ? 0 : Math.round((complete * 100) / scanned);
    return { scanned, complete, single, absent, overallPct };
  }, [rows]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.name.toLowerCase().includes(q)
      || r.empNo.toLowerCase().includes(q)
      || (r.departmentName || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const pagination = usePagination(filtered, 25);
  useEffect(() => { pagination.resetPage(); }, [search, departmentFilter, startDate, endDate]);

  const pctClass = (pct: number, scanned: number) =>
    scanned === 0 ? 'text-gray-400'
      : pct >= 90 ? 'text-green-700'
      : pct >= 60 ? 'text-amber-700'
      : 'text-red-700';

  return (
    <>
      {/* Aggregate stats — surfaced before the filter bar so the
          headline numbers land first, matching the other report tabs. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        <StatCard label="Overall Compliance" value={`${totals.overallPct}%`} icon={TrendingUp} tone={totals.overallPct >= 90 ? 'green' : totals.overallPct >= 60 ? 'orange' : 'red'} />
        <StatCard label="Complete Days" value={totals.complete} icon={FileText} tone="green" />
        <StatCard label="Single-Scan Days" value={totals.single} icon={AlertCircle} tone="orange" />
        <StatCard label="Absent Days" value={totals.absent} icon={Users} tone="red" />
      </div>

      {/* Filter bar — single-row compact layout. */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-gray-500">From</Label>
            <DateInput
              value={startDate}
              onChange={setStartDate}
              className="h-9 w-36 text-sm"
              title="Start date"
            />
            <Label className="text-xs text-gray-500">To</Label>
            <DateInput
              value={endDate}
              onChange={setEndDate}
              className="h-9 w-36 text-sm"
              title="End date"
            />
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="h-9 w-44 text-sm" title="Department"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Name, ID, or department"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 w-56 text-sm ml-auto"
            />
          </div>
        </CardContent>
      </Card>

      {/* Per-employee breakdown — sorted least compliant first by the API. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Per-Employee Compliance
            <Badge variant="secondary" className="ml-1 font-normal">{filtered.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No employees in the selected scope</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Scanned</TableHead>
                    <TableHead className="text-right">Complete</TableHead>
                    <TableHead className="text-right">Single-scan</TableHead>
                    <TableHead className="text-right">Absent</TableHead>
                    <TableHead className="text-right">Compliance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(r => (
                    <TableRow key={r.employeeId}>
                      <TableCell>
                        <p className="text-sm font-medium">{r.name}</p>
                        <p className="text-xs text-gray-400">{r.empNo}</p>
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {r.departmentName ?? <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm">{r.scannedDays}</TableCell>
                      <TableCell className="text-right text-sm text-green-700">{r.completeDays}</TableCell>
                      <TableCell className="text-right text-sm text-amber-700">{r.singleScanDays}</TableCell>
                      <TableCell className="text-right text-sm text-red-700">{r.absentDays}</TableCell>
                      <TableCell className={`text-right text-sm font-semibold ${pctClass(r.compliancePct, r.scannedDays)}`}>
                        {r.scannedDays === 0 ? '—' : `${r.compliancePct}%`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filtered.length > 25 && (
                <div className="mt-4">
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
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// StatCard + TONE_MAP consolidated into common/StatCard.tsx. The
// KpiCard below (clickable filter tile with ring on active state)
// uses the same tone palette via STAT_CARD_TONES.
const TONE_MAP = STAT_CARD_TONES;

/** KPI card — count of employees / total active, clickable to filter the
 *  Detailed Records table below. Active state shown with a colored ring. */
function KpiCard({
  label, subtitle, count, total, icon: Icon, tone, active, onClick,
}: {
  label: string;
  subtitle?: string;
  count: number;
  total: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONE_MAP;
  active: boolean;
  onClick: () => void;
}) {
  const t = TONE_MAP[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left transition w-full ${active ? `ring-2 ${t.ring} rounded-lg` : ''}`}
    >
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className={`p-2 rounded-lg ${t.bg}`}>
              <Icon className={`h-4 w-4 ${t.text}`} />
            </div>
            <div className={`flex items-baseline gap-1 ${t.text}`}>
              <span className="text-2xl font-bold">{count}</span>
              <span className="text-sm text-gray-400">/ {total}</span>
            </div>
          </div>
          <p className="text-xs font-medium text-gray-700">{label}</p>
          {subtitle && <p className="text-[10px] text-gray-500">{subtitle}</p>}
          {active && <p className="text-[10px] text-gray-500 mt-1 italic">Click again to clear filter</p>}
        </CardContent>
      </Card>
    </button>
  );
}
