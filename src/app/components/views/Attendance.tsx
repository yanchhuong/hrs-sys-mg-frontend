import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext';
import { useTeamScope, ScopeMode } from '../../hooks/useTeamScope';
import { ScopePicker } from '../common/ScopePicker';
import { mockAttendance, mockEmployees } from '../../data/mockData';
import { Attendance as AttendanceType, AttendanceStatus, Employee } from '../../types/hrms';
import * as attendanceApi from '../../api/attendance';
import * as employeesApi from '../../api/employees';
import * as departmentsApi from '../../api/departments';
import * as leaveApi from '../../api/leave';
import * as overtimeApi from '../../api/overtime';
import * as settingsApi from '../../api/settings';
import { USE_MOCKS } from '../../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Clock, CalendarIcon, Upload, FileSpreadsheet, Fingerprint,
  CheckCircle2, XCircle, AlertTriangle, LogIn, LogOut, Users,
  ChevronLeft, ChevronRight, Pencil, Download, AlertCircle, BarChart3,
  Search, X, UserMinus, Settings as SettingsIcon,
} from 'lucide-react';
import { OfficesDialog } from '../common/OfficesDialog';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isToday as isTodayFn, addMonths, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { EmployeeCell } from '../common/EmployeeCell';
import { AnnualLeaveSetup } from '../common/AnnualLeaveSetup';
import { useI18n } from '../../i18n/I18nContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { detectOtRule } from '../../utils/otRates';
import {
  loadRule, daysForTenure, tenureYears, loadValuesForYear,
} from '../../utils/annualLeave';
import { makeDeptName } from '../../utils/deptName';
import { downloadAttendanceTemplate } from '../../utils/attendanceTemplate';
import { parseAttendanceExcel } from '../../utils/attendanceParser';
import { loadScanRule } from '../../utils/scanRule';

type ViewMode = 'daily' | 'monthly';
type FilterTab = 'all' | 'no_checkin' | 'no_checkout' | 'late' | 'early_leave' | 'absent' | 'present' | 'leave';

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; textColor: string; shortLabel: string }> = {
  present: { label: 'Present', color: 'bg-green-500', bgColor: 'bg-green-50', textColor: 'text-green-700', shortLabel: 'P' },
  late: { label: 'Late', color: 'bg-yellow-500', bgColor: 'bg-yellow-50', textColor: 'text-yellow-700', shortLabel: 'L' },
  absent: { label: 'Absent', color: 'bg-red-500', bgColor: 'bg-red-50', textColor: 'text-red-700', shortLabel: 'A' },
  no_checkin: { label: 'No Check-in', color: 'bg-orange-500', bgColor: 'bg-orange-50', textColor: 'text-orange-700', shortLabel: 'NC' },
  no_checkout: { label: 'No Check-out', color: 'bg-purple-500', bgColor: 'bg-purple-50', textColor: 'text-purple-700', shortLabel: 'NO' },
  leave: { label: 'Leave', color: 'bg-blue-500', bgColor: 'bg-blue-50', textColor: 'text-blue-700', shortLabel: 'LV' },
  early_leave: { label: 'Early Leave', color: 'bg-orange-500', bgColor: 'bg-orange-50', textColor: 'text-orange-700', shortLabel: 'EL' },
};

// Adapts a backend AttendanceEntry to the front-end Attendance shape used
// throughout the UI. The fingerprint sync writes morning/noon punches; carry
// them through so the daily grid shows real check-in / check-out times.
function adaptApiAttendance(
  a: attendanceApi.AttendanceEntry,
  checkOutCutoffMinutes: number,
): AttendanceType {
  const status = ([
    'present', 'late', 'early_leave', 'absent',
    'no_checkin', 'no_checkout', 'leave',
  ] as const).includes(a.status as AttendanceStatus)
    ? (a.status as AttendanceStatus)
    : 'present';

  // Single-scan reclassification, driven by the tenant's check-out rule.
  //
  // A lone punch is ambiguous — was the employee checking IN late, or
  // checking OUT without ever checking in? We resolve it by comparing the
  // scan's wall-clock time against the rule's check-out target:
  //   • scan ≥ check-out rule → Noon Out  (no check-in — they only closed out)
  //   • scan <  11:00         → Morning In (start of day, missing check-out)
  //   • scan 11:00 – check-out → Noon In   (late check-in, missing check-out)
  // This is purely a UI re-shuffle; the original raw scan is unchanged on
  // the server, so admins editing the row see and edit the same value.
  let morningIn  = a.morningIn  ?? undefined;
  let morningOut = a.morningOut ?? undefined;
  let noonIn     = a.noonIn     ?? undefined;
  let noonOut    = a.noonOut    ?? undefined;
  const punches = [morningIn, morningOut, noonIn, noonOut].filter(Boolean) as string[];
  if (punches.length === 1) {
    const only = punches[0];
    const minutes = (() => {
      const m = /^(\d{1,2}):(\d{2})/.exec(only);
      return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
    })();
    morningIn = morningOut = noonIn = noonOut = undefined;
    if (!Number.isFinite(minutes))                       noonIn  = only;
    else if (minutes >= checkOutCutoffMinutes)           noonOut = only;
    else if (minutes < 11 * 60)                          morningIn = only;
    else                                                 noonIn    = only;
  }

  return {
    id: a.id,
    employeeId: a.employeeId,
    date: a.date,
    // morningIn is the canonical "first punch of the day" produced by the
    // fingerprint sync. Mirror it into the legacy `checkIn` field so older
    // table rows that still read `checkIn` keep working.
    checkIn: morningIn ?? a.checkIn ?? '',
    checkOut: noonOut ?? a.checkOut ?? undefined,
    morningIn,
    morningOut,
    noonIn,
    noonOut,
    // Backend now sends `workHours` (rule-aware, deducts lunch). Fall back
    // to the legacy `hoursWorked` so older rows / mock fixtures still render.
    workHours: a.workHours != null ? Number(a.workHours) : a.hoursWorked,
    otHours: a.otHours != null ? Number(a.otHours) : a.overtimeHours,
    status,
    notes: a.notes,
  };
}

// Adapts a backend Employee to the front-end Employee shape. `department` in
// live mode carries the departmentId UUID; a deptName() helper in the component
// resolves it to a display name via the departments list.
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
    // Older rows (pre-V15) don't carry the field — default to true so they
    // continue to be counted in attendance.
    attendanceYn: e.attendanceYn ?? true,
  };
}

/** App.tsx passes setCurrentView as onNavigate so pages can switch
 *  views without their own routing. Used by the gear-icon menu to
 *  open Offices / QR Display (both hideFromSidebar). */
interface Props {
  onNavigate?: (viewId: string) => void;
}

export function Attendance({ onNavigate }: Props = {}) {
  const { t } = useI18n();
  const { formatDate } = useDateFormat();
  const { currentUser } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  // Default filter to TODAY so the page lands on a date that has data right
  // after a fingerprint sync. Hardcoding the seed date meant April 28's
  // synced rows looked invisible because the page was stuck on April 20.
  const today = format(new Date(), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  // Manage Offices popup state — opened from the gear-icon dropdown.
  const [officesDialogOpen, setOfficesDialogOpen] = useState(false);
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  /**
   * Hours-fulfillment filter — independent of the activeFilter chips.
   *   • 'all'       — no constraint (default)
   *   • 'fulfilled' — only rows with workHours >= 8h
   *   • 'short'     — only rows with 0 < workHours < 8h
   * Rows without any workHours at all (no scan) are excluded from both
   * 'fulfilled' and 'short' so the picker stays meaningful.
   */
  const [hoursFilter, setHoursFilter] = useState<'all' | 'fulfilled' | 'short'>('all');
  /**
   * View mode for the daily attendance card. 'roster' is the default
   * employee-per-row aggregation; 'history' flattens each row's punches
   * into a per-scan event log so admins can see exactly who tapped
   * which device when.
   */
  const [dailyViewMode, setDailyViewMode] = useState<'roster' | 'history'>('roster');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [monthlySearch, setMonthlySearch] = useState('');
  const [dailySearch, setDailySearch] = useState('');
  const [monthlyStatusFilter, setMonthlyStatusFilter] = useState<'all' | 'late' | 'absent' | 'late_or_absent'>('all');
  const [alDialogOpen, setAlDialogOpen] = useState(false);
  // Bumped whenever the AL dialog applies/resets values so monthlyData re-reads storage.
  const [alVersion, setAlVersion] = useState(0);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<AttendanceType | null>(null);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [editMorningIn, setEditMorningIn] = useState('');
  const [editMorningOut, setEditMorningOut] = useState('');
  const [editNoonIn, setEditNoonIn] = useState('');
  const [editNoonOut, setEditNoonOut] = useState('');
  const [editStatus, setEditStatus] = useState<AttendanceStatus>('present');
  const [editRemark, setEditRemark] = useState('');
  // Sub-type when {@link editStatus} is "leave". The dialog defaults this
  // from the punch pattern (single-scan-morning ⇒ half_noon, etc.) but
  // lets the admin override before saving.
  const [editLeaveType, setEditLeaveType] = useState<'full' | 'half_morning' | 'half_noon'>('full');
  // V47 leave category — Annual / Sick / Special / Maternity / Exception.
  // Defaults to 'annual' since that's what the column defaults to server-side.
  const [editLeaveCategory, setEditLeaveCategory] = useState<
    'annual' | 'sick' | 'special' | 'maternity' | 'exception'
  >('annual');
  // V49 — end date for the auto-created LeaveRequest. Defaults to the
  // editing row's date (single-day) and auto-jumps to start+89 when the
  // admin picks Maternity. Empty string means "same as start date".
  const [editLeaveEndDate, setEditLeaveEndDate] = useState<string>('');
  // Optional "Apply OT for this employee on this date" branch in the
  // Edit Attendance dialog. Pre-filled from the day's punches: free-style
  // days suggest the full work hours; weekday rows skip the section.
  // The admin can adjust before saving — submitted alongside the
  // attendance update via overtimeApi.create() with the target employee's
  // UUID.
  const [editApplyOt, setEditApplyOt] = useState(false);
  /** Whether the Morning/Noon session inputs in Edit Attendance are
   *  expanded. Auto-collapses when Apply OT is checked so the dialog
   *  doesn't overflow; admin can re-expand with the "Edit punches"
   *  button. Resets to expanded on every dialog open via handleEditRow. */
  const [editSessionsExpanded, setEditSessionsExpanded] = useState(true);
  const [editOtHours, setEditOtHours] = useState('');
  const [editOtReason, setEditOtReason] = useState('');
  const [editOtAlreadyFiled, setEditOtAlreadyFiled] = useState(false);
  /** OT Start Hour (HH:mm) — drives both the auto-computed hours and the
   *  day-bucket rate calc on the OT page. Empty = admin will type. */
  const [editOtStartHour, setEditOtStartHour] = useState('');
  /** OT End Hour (HH:mm). When endHour <= startHour we treat the OT as
   *  cross-midnight and auto-bump editOtEndDate to start+1. */
  const [editOtEndHour, setEditOtEndHour] = useState('');
  /** OT End Date (YYYY-MM-DD). Starts equal to the row's date; auto-bumps
   *  to start+1 whenever the picked hour range wraps past midnight. */
  const [editOtEndDate, setEditOtEndDate] = useState('');
  // Locks the Save button while a save is in flight — without it, a slow
  // round-trip plus an impatient double-click fires two PATCHes for the
  // same row.
  const [editSaving, setEditSaving] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  // Read-only status of the Node Device-Integration worker's last push.
  // Polled every 30 s while the page is mounted.
  const [fpSyncStatus, setFpSyncStatus] = useState<attendanceApi.FingerprintSyncStatus | null>(null);
  // Re-render every 15 s so the "x s ago" relative label stays fresh between
  // the slower 30 s status polls.
  const [, setFpTick] = useState(0);
  /**
   * Per-tenant General attendance settings — drive weekend skipping and the
   * "auto-mark absent" deadline. Loaded once on mount; defaults match the
   * backend's seed values so the page stays usable while the request flies.
   */
  const [generalSettings, setGeneralSettings] = useState<{
    autoMarkAbsent: boolean;
    absentDeadlineTime: string;
    trackMissingCheckout: boolean;
    weekendDays: string[];
  }>({
    autoMarkAbsent: true,
    absentDeadlineTime: '10:00',
    trackMissingCheckout: true,
    weekendDays: ['Sat', 'Sun'],
  });
  /**
   * Set of public-holiday dates (YYYY-MM-DD) for the displayed period.
   * Treated the same as weekends — no synthetic absent row, no
   * compliance penalty. Loaded from /settings/holidays on mount and
   * whenever the year changes. Live punches on these days still
   * surface (and feed OT at 3× rate via the OT module's isHoliday flag).
   */
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());
  /**
   * OT rate settings for the rule-type badge on the Apply OT section.
   * Loaded lazily on mount; defaults to the Cambodian Labour Law
   * baselines so the badge stays sensible while the GET is in flight.
   */
  const [otRates, setOtRates] = useState<{
    weekday: number; weekend: number; holiday: number;
    nightEnabled: boolean; nightRate: number; nightStart: string; nightEnd: string;
    nightCompose: 'replace' | 'max' | 'multiply';
  }>({
    weekday: 1.5, weekend: 2, holiday: 3,
    nightEnabled: true, nightRate: 1.3, nightStart: '22:00', nightEnd: '05:00',
    nightCompose: 'replace',
  });
  /** Admin-only day-type override for the Apply OT branch. `null` = use
   *  the auto-detected value (driven by date + holidayDates). */
  const [editOtDayTypeOverride, setEditOtDayTypeOverride] = useState<'workday' | 'weekend' | 'holiday' | null>(null);
  /** Admin-only manual rate override (V62). Stored as a string so the
   *  Input can hold partial entry (e.g. "1." while typing). `''` = use
   *  the auto-detected rate. */
  const [editOtRateOverride, setEditOtRateOverride] = useState<string>('');
  /**
   * Set of (date|employeeApiId) keys for which a non-rejected OT
   * request already exists. Used to dim the OT badge in the daily
   * table — once an admin or employee has filed an OT request for that
   * day, the badge greys out so it's clear no new request is needed.
   */
  const [otRequestKeys, setOtRequestKeys] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProcessing, setUploadProcessing] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [leaveDetailEmp, setLeaveDetailEmp] = useState<string | null>(null);

  // Reads as "isAdmin" but really gates admin-level Attendance UI: Upload
  // Excel, Mark Exception, Edit punches, etc. Built-in admin + manager get
  // it, plus every custom role (created from the Admin base) — those roles
  // already pass `isTenantWide` in useTeamScope, so they expect admin UI.
  // The Permission Matrix toggles can still revoke individual actions.
  const isAdmin = currentUser?.role === 'admin'
    || currentUser?.role === 'manager'
    || (!!currentUser?.role
        && currentUser.role !== 'employee');
  const isEmployee = currentUser?.role === 'employee';
  /** Stricter check used by the Apply OT rule-type override Select.
   *  Manager + Employee see the auto-detected badge as read-only;
   *  only the true 'admin' role can force a different day-type. */
  const canOverrideOtRule = currentUser?.role === 'admin';
  /** Strict-admin gate for the per-row edit pencil. Managers still
   *  need the actions column for the Day-Exception button, but the
   *  edit pencil is admin-only — a manager fixing a punch could
   *  hide a late arrival on their own team's row. */
  const canEditPunches = currentUser?.role === 'admin';
  const { isTenantWide, matchesScope, showScopePicker } = useTeamScope();
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');

  /**
   * Classify a date as work / weekend / holiday — used by the daily
   * table's Day column, by the late→present override on free-style
   * days, and by the OT auto-fill (free-style hours all count as OT).
   * Reads weekend days from the tenant's General settings; holidays
   * come from {@link holidayDates} (loaded by loadHolidays()).
   */
  type DayKind = 'work' | 'weekend' | 'holiday';
  const WEEKEND_CODE: Record<number, string> = {
    0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
  };
  const dayKindOf = (dateStr: string): DayKind => {
    if (holidayDates.has(dateStr)) return 'holiday';
    try {
      const dow = parseISO(dateStr).getDay();
      if (generalSettings.weekendDays.includes(WEEKEND_CODE[dow])) return 'weekend';
    } catch { /* fall through */ }
    return 'work';
  };

  // Live data — falls back to mock arrays when VITE_USE_MOCKS is on.
  const [attendance, setAttendance] = useState<AttendanceType[]>(USE_MOCKS ? mockAttendance : []);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [deptList, setDeptList] = useState<departmentsApi.Department[]>([]);
  // Leaves for the selected range — merged into dailyRows so a pending or
  // approved leave shows up on the Attendance page as status=leave with the
  // reason in the Remark column, even if the backend sync didn't run when
  // the leave was originally filed.
  const [leaves, setLeaves] = useState<leaveApi.LeaveRequest[]>([]);
  // Leaves scoped to the Monthly Summary's displayed month — independent of
  // the daily From/To filter, so changing the monthly cursor (April,
  // March, …) re-pulls the right window. Without this the monthly Leave
  // column sees only the daily-filter window (today by default) and shows
  // 0 for every employee even when leaves are clearly approved.
  const [monthlyLeaves, setMonthlyLeaves] = useState<leaveApi.LeaveRequest[]>([]);
  const deptName = makeDeptName(deptList, '-');

  const loadAttendance = async () => {
    if (USE_MOCKS) {
      setAttendance([...mockAttendance]);
      return;
    }
    try {
      // Backend serves attendance one day at a time; listRange fans the range
      // out into per-day calls and stitches the results together.
      const rows = dateFrom && dateTo
        ? await attendanceApi.listRange({ from: dateFrom, to: dateTo, size: 500 })
        : (await attendanceApi.list({ date: dateFrom || format(new Date(), 'yyyy-MM-dd'), size: 500 })).data;
      const rule = loadScanRule();
      const m = /^(\d{1,2}):(\d{2})/.exec(rule.eveningOut);
      const cutoff = m ? Number(m[1]) * 60 + Number(m[2]) : 17 * 60;
      setAttendance(rows.map(r => adaptApiAttendance(r, cutoff)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load attendance');
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
      // Non-fatal — department cells fall back to the raw UUID.
      console.warn('Could not load departments', err);
    }
  };

  const loadLeaves = async () => {
    if (USE_MOCKS) return;
    try {
      const res = await leaveApi.list({
        from: dateFrom || undefined,
        to: dateTo || undefined,
        size: 500,
      });
      // Everything except rejected — pending leaves display the same as
      // approved (per spec), and only rejection makes them disappear.
      setLeaves(res.data.filter(r => r.status !== 'rejected'));
    } catch (err) {
      console.warn('Could not load leaves', err);
    }
  };

  /**
   * Pull every non-rejected leave that overlaps the Monthly Summary's
   * displayed month. Independent of the daily From/To filter so the Leave
   * column reflects the actual month being viewed. Backend caps page size,
   * so we walk pages defensively up to a sane ceiling.
   */
  const loadMonthlyLeaves = async (target: Date) => {
    if (USE_MOCKS) return;
    const monthStart = format(startOfMonth(target), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(target), 'yyyy-MM-dd');
    try {
      const PAGE_SIZE = 500;
      const SAFETY_PAGES = 20;
      const all: leaveApi.LeaveRequest[] = [];
      for (let p = 0; p < SAFETY_PAGES; p++) {
        const res = await leaveApi.list({
          from: monthStart,
          to: monthEnd,
          size: PAGE_SIZE,
          page: p,
        });
        all.push(...res.data);
        if (p + 1 >= (res.totalPages ?? 1)) break;
      }
      setMonthlyLeaves(all.filter(r => r.status !== 'rejected'));
    } catch (err) {
      console.warn('Could not load monthly leaves', err);
    }
  };

  // Pull the public-holiday calendar for the current and previous year
  // (covers any cross-year date filter the user might pick) and store the
  // dates as a Set for O(1) lookup in the synthetic-row generator.
  const loadHolidays = async () => {
    if (USE_MOCKS) return;
    const now = new Date();
    const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() + 1];
    try {
      const lists = await Promise.all(
        years.map(y => settingsApi.listHolidays({ year: y }).catch(() => [])),
      );
      const dates = new Set<string>();
      for (const list of lists) for (const h of list) if (h.date) dates.add(h.date);
      setHolidayDates(dates);
    } catch (err) {
      console.warn('Could not load holidays', err);
    }
  };

  /**
   * Load every non-rejected OT request that overlaps the daily date
   * range and stash a Set of `date|employeeId` keys. The table render
   * uses that set to dim the OT badge for rows whose employee has
   * already filed (or had filed for them) an OT request that day.
   */
  const loadOtRequests = async () => {
    if (USE_MOCKS) return;
    try {
      const res = await overtimeApi.list({
        from: dateFrom || undefined,
        to: dateTo || undefined,
        size: 500,
      });
      const keys = new Set<string>();
      for (const r of res.data) {
        if (r.status === 'rejected') continue;
        keys.add(`${r.date}|${r.employeeId}`);
      }
      setOtRequestKeys(keys);
    } catch (err) {
      console.warn('Could not load OT requests', err);
    }
  };

  // Refresh the attendance grid whenever the top-bar widget signals
  // a successful punch. Custom DOM event keeps the components
  // decoupled — the widget lives in Layout, the page lives here, no
  // shared context needed. Re-runs the same fetches the date / scope
  // change does, so the new check-in row appears immediately.
  useEffect(() => {
    const handler = () => {
      void loadAttendance();
      void loadLeaves();
    };
    window.addEventListener('attendance:punched', handler);
    return () => window.removeEventListener('attendance:punched', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, scopeMode]);

  // Initial load on mount.
  useEffect(() => {
    void loadEmployees();
    void loadDepartments();
    void loadAttendance();
    void loadLeaves();
    void loadHolidays();
    void loadOtRequests();
    // Pull the General attendance settings (weekend days, auto-mark absent
    // deadline, missing-checkout tracking). Failures fall back to defaults.
    if (!USE_MOCKS) {
      void (async () => {
        try {
          const remote = await settingsApi.getGeneralAttendanceSettings();
          setGeneralSettings({
            autoMarkAbsent: remote.autoMarkAbsent,
            absentDeadlineTime: remote.absentDeadlineTime,
            trackMissingCheckout: remote.trackMissingCheckout,
            weekendDays: remote.weekendDays || [],
          });
        } catch (err) {
          console.warn('Could not load general attendance settings', err);
        }
      })();
      // OT settings — feed the rule-type badge on the Apply OT branch.
      void (async () => {
        try {
          const s = await settingsApi.getOtSettings();
          const nested = (k: keyof settingsApi.OtSettings): number | undefined => {
            const v = (s[k] as Record<string, unknown> | undefined)?.rate;
            return typeof v === 'number' && v > 0 ? v : undefined;
          };
          setOtRates({
            weekday: nested('workdayRule') ?? (Number(s.weekdayRate) || 1.5),
            weekend: nested('weekendRule') ?? (Number(s.weekendRate) || 2),
            holiday: nested('holidayRule') ?? (Number(s.holidayRate) || 3),
            nightEnabled: s.nightEnabled ?? true,
            nightRate:    Number(s.nightRate)   || 1.3,
            nightStart:   (s.nightStartTime ?? '22:00').slice(0, 5),
            nightEnd:     (s.nightEndTime   ?? '05:00').slice(0, 5),
            nightCompose: (s.nightCompose === 'max' || s.nightCompose === 'multiply' || s.nightCompose === 'replace')
              ? s.nightCompose
              : 'replace',
          });
        } catch (err) {
          console.warn('Could not load OT settings — Apply OT badge will use defaults', err);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload attendance + leaves when the date range changes (live mode only —
  // mock data is already loaded and filtered client-side).
  useEffect(() => {
    if (USE_MOCKS) return;
    void loadAttendance();
    void loadLeaves();
    void loadOtRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  // Re-pull leaves whenever the Monthly Summary's month cursor changes so
  // the Leave column stays in sync with the displayed month. Also covers
  // the initial mount and the daily↔monthly toggle.
  useEffect(() => {
    if (USE_MOCKS) return;
    void loadMonthlyLeaves(monthDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthDate]);

  // Poll the fingerprint sync status (Node worker → backend pushes) every 30 s
  // and re-render the relative-time label every 15 s. Admin-only — non-admins
  // never see the pill so we skip the network traffic for them.
  useEffect(() => {
    if (!isAdmin || USE_MOCKS) return;
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const s = await attendanceApi.getFingerprintSyncStatus();
        if (!cancelled) setFpSyncStatus(s);
      } catch {
        if (!cancelled) setFpSyncStatus(null);
      }
    };
    void fetchStatus();
    const pollId = window.setInterval(fetchStatus, 30_000);
    const tickId = window.setInterval(() => setFpTick(t => t + 1), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      window.clearInterval(tickId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Today's records — scoped to self + direct reports for the employee role.
  const todayRecords = useMemo(() => {
    // Range inclusive on both ends. Single-day behaviour is preserved when
    // dateFrom === dateTo (the original experience).
    const rows = attendance.filter(a => {
      if (dateFrom && a.date < dateFrom) return false;
      if (dateTo && a.date > dateTo) return false;
      return true;
    });
    return isTenantWide ? rows : rows.filter(a => matchesScope(a.employeeId, scopeMode, employees));
  }, [attendance, dateFrom, dateTo, isTenantWide, matchesScope, scopeMode]);

  // Roster-driven rows: one row per active employee per day in the range.
  // A day with no attendance record shows a synthetic row marked `absent`
  // with empty punches, which the fingerprint import flow then fills in.
  const dailyRows = useMemo((): AttendanceType[] => {
    const scopedEmployees = employees.filter(
      // Exception employees (attendanceYn === false) are skipped here so they
      // never appear in the daily roster, summary chip counts, or the
      // synthetic-absent augmentation. See Employees → Employment tab.
      // matchesScope compares against the auth context's employeeId, which
      // is a UUID in live mode and the empNo in mocks. Pass the apiId
      // (UUID) when present so live-mode employees match correctly.
      e => e.status === 'active'
        && e.attendanceYn !== false
        && (isTenantWide || matchesScope((e as any).apiId ?? e.id, scopeMode, employees)),
    );
    if (scopedEmployees.length === 0) return [];

    const days: string[] = [];
    if (dateFrom && dateTo) {
      const start = parseISO(dateFrom);
      const end = parseISO(dateTo);
      const cursor = new Date(start);
      while (cursor <= end) {
        days.push(format(cursor, 'yyyy-MM-dd'));
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      days.push(format(new Date(), 'yyyy-MM-dd'));
    }

    // Attendance lookup: `date|employeeId` → record. Employee id can arrive
    // as either empNo or backend UUID depending on mode, so we index on
    // whatever the record carries.
    const byKey = new Map<string, AttendanceType>();
    todayRecords.forEach(r => byKey.set(`${r.date}|${r.employeeId}`, r));

    // Leave lookup: `date|employeeId (UUID)` → LeaveRequest. Non-rejected
    // leaves only. Applied on top of the attendance row so a pending or
    // approved leave shows up here even if the backend sync didn't run
    // when the leave was originally filed.
    const leaveByKey = new Map<string, leaveApi.LeaveRequest>();
    leaves.forEach(l => leaveByKey.set(`${l.date}|${l.employeeId}`, l));

    // Settings-driven gates for the synthetic-absent rows that get
    // injected for employees with no punch on a given day:
    //   • Weekend days are skipped entirely (no row at all).
    //   • For "today", the absent row is suppressed until the deadline
    //     time is reached, so an admin opening the page at 09:00 doesn't
    //     see everyone marked absent before they've had a chance to scan in.
    //   • If autoMarkAbsent is off, the synthetic row uses status "no_checkin"
    //     instead of "absent" so the totals don't lie.
    const WEEKEND_CODE: Record<number, string> = {
      0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
    };
    const isWeekend = (dateStr: string) => {
      const dow = parseISO(dateStr).getDay();
      return generalSettings.weekendDays.includes(WEEKEND_CODE[dow]);
    };
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const deadlineReachedToday = (() => {
      const [h, m] = generalSettings.absentDeadlineTime.split(':').map(Number);
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setHours(h || 0, m || 0, 0, 0);
      return now >= cutoff;
    })();

    const rows: AttendanceType[] = [];
    for (const emp of scopedEmployees) {
      const apiId = (emp as any).apiId as string | undefined;
      for (const day of days) {
        const rec = byKey.get(`${day}|${emp.id}`)
          ?? (apiId ? byKey.get(`${day}|${apiId}`) : undefined)
          ?? null;
        const leave = (apiId ? leaveByKey.get(`${day}|${apiId}`) : undefined)
          ?? leaveByKey.get(`${day}|${emp.id}`);

        let row: AttendanceType;
        if (rec) {
          row = rec;
        } else {
          // Skip synthetic rows on weekends and public holidays — those
          // days don't require attendance. A real punch on a holiday
          // still surfaces (the row exists in `byKey`); only the
          // would-be-absent placeholder is suppressed. OT scans on
          // holidays already pick up the 3× rate via OtRequest.isHoliday.
          if ((isWeekend(day) || holidayDates.has(day)) && !leave) continue;
          // For today, hold off on flagging absent until the deadline has passed.
          const isToday = day === todayStr;
          const beforeDeadline = isToday && !deadlineReachedToday;
          const syntheticStatus =
            generalSettings.autoMarkAbsent && !beforeDeadline ? 'absent' : 'no_checkin';
          row = {
            id: `synthetic:${emp.id}:${day}`,
            employeeId: emp.id,
            date: day,
            checkIn: '',
            checkOut: undefined,
            morningIn: undefined,
            morningOut: undefined,
            noonIn: undefined,
            noonOut: undefined,
            otHours: undefined,
            workHours: undefined,
            status: syntheticStatus,
            notes: '',
          } satisfies AttendanceType;
        }

        // Leave takes precedence over the attendance row's own status —
        // the employee is definitively on leave that day. Remark shows
        // the reason, with "(pending approval)" when the leave isn't
        // approved yet.
        if (leave) {
          const remark = `Leave: ${leave.type}`
            + (leave.reason ? ` — ${leave.reason}` : '')
            + (leave.status === 'pending' ? ' (pending approval)' : '');
          row = { ...row, status: 'leave' as AttendanceStatus, notes: remark };
        }

        rows.push(row);
      }
    }
    return rows;
  }, [employees, todayRecords, leaves, dateFrom, dateTo, isTenantWide, matchesScope, scopeMode, generalSettings, holidayDates]);

  // Summary counts derived from the roster-driven rows so that employees
  // without any punch for the day are still counted (as absent).
  const summary = useMemo(() => {
    const totalEmployees = employees
      .filter(e => e.status === 'active' && e.attendanceYn !== false && (isTenantWide || matchesScope((e as any).apiId ?? e.id, scopeMode, employees))).length;
    const present = dailyRows.filter(r => r.status === 'present' || r.status === 'early_leave').length;
    const absent = dailyRows.filter(r => r.status === 'absent').length;
    const late = dailyRows.filter(r => r.status === 'late').length;
    // Early Out = employee left before the scheduled out time.
    // Server-set status drives this — same predicate the FE uses for
    // the Late chip.
    const earlyLeave = dailyRows.filter(r => r.status === 'early_leave').length;
    // "No Check-in" / "No Check-out" are surfaced by field presence rather
    // than the strict status enum, so an absent employee (all punch slots
    // null) is counted under both — matches what an admin scanning the
    // table sees: blank In columns → "no check-in". Counts overlap with
    // Absent intentionally; these are filter views, not exclusive buckets.
    //
    // BOTH slots checked so a half-morning leave employee whose only
    // punch landed in noon_in still registers as checked in. Same
    // mirror for the out side (half-noon leave → morning_out).
    const hasAnyIn  = (r: typeof dailyRows[number]) => !!r.morningIn || !!r.noonIn;
    const hasAnyOut = (r: typeof dailyRows[number]) => !!r.morningOut || !!r.noonOut;
    const noCheckin  = dailyRows.filter(r => !hasAnyIn(r)  && r.status !== 'leave').length;
    const noCheckout = dailyRows.filter(r => !hasAnyOut(r) && r.status !== 'leave').length;
    const leave = dailyRows.filter(r => r.status === 'leave').length;
    return { totalEmployees, present, absent, late, earlyLeave, noCheckin, noCheckout, leave };
  }, [dailyRows, employees, isTenantWide, matchesScope, scopeMode]);

  // Filtered records — built on top of the roster-driven dailyRows so employees
  // without any punch record still appear (as "absent" until fingerprint sync).
  const filteredRecords = useMemo(() => {
    let records = dailyRows;
    if (activeFilter !== 'all') {
      // Match the same predicates the chip badges count by — "no_checkin" and
      // "no_checkout" filter on the *field*, not the strict status enum, so
      // they include absent rows where the column is blank.
      if (activeFilter === 'no_checkin') {
        // Treat noon_in as a valid check-in too — half-morning leave
        // employees only punch in the afternoon and would otherwise
        // wrongly appear in this bucket.
        records = records.filter(r => !r.morningIn && !r.noonIn && r.status !== 'leave');
      } else if (activeFilter === 'no_checkout') {
        records = records.filter(r => !r.morningOut && !r.noonOut && r.status !== 'leave');
      } else {
        records = records.filter(r => r.status === activeFilter);
      }
    }
    if (hoursFilter !== 'all') {
      records = records.filter(r => {
        const wh = Number(r.workHours);
        if (!Number.isFinite(wh) || wh <= 0) return false;
        return hoursFilter === 'fulfilled' ? wh >= 8 : wh < 8;
      });
    }
    // Live mode keys attendance.employeeId by the backend UUID, so we have to
    // try both `e.id` (empNo / 4-digit) and `(e as any).apiId` (UUID) when
    // resolving the row to its employee — otherwise the lookup always misses
    // and the filters appear to do nothing.
    const findEmp = (employeeId: string) =>
      employees.find(e => e.id === employeeId || (e as any).apiId === employeeId);

    if (departmentFilter !== 'all') {
      records = records.filter(r => {
        const emp = findEmp(r.employeeId);
        return deptName(emp?.department) === departmentFilter;
      });
    }
    // Multi-token wildcard search across name, Khmer name, empNo, phone,
    // department, and device — matches the Employees page convention plus
    // the fingerprint-device label parsed from `notes` ("fingerprint:Lobby"
    // → "Lobby"), so admins can slice the roster by terminal too.
    const tokens = dailySearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      records = records.filter(r => {
        const emp = findEmp(r.employeeId);
        const note = r.notes ?? '';
        const device = note.startsWith('fingerprint:')
          ? note.slice('fingerprint:'.length)
          : (note === 'fingerprint' ? 'fingerprint' : '');
        const hay = [
          emp?.name,
          emp?.khmerName,
          emp?.id,
          emp?.empNo,
          emp?.contactNumber,
          deptName(emp?.department),
          device,
        ].filter(Boolean).join(' ').toLowerCase();
        return tokens.every(tok => hay.includes(tok));
      });
    }
    return records;
    // deptName is derived from deptList, tracked via employees.length/deptList upstream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyRows, employees, activeFilter, hoursFilter, departmentFilter, dailySearch]);

  // Pagination for daily records
  const dailyPagination = usePagination(filteredRecords, 10);

  /**
   * Build + download an Excel workbook of the currently-filtered daily
   * attendance rows. Two sheets:
   *   Summary — header context (range, dept, search, hours filter, status
   *             tab, counts per status).
   *   Records — one row per (employee, date) with punches, OT, hours,
   *             status, remark, and department.
   * Honours every active filter from the page, so what HR sees on the
   * table is exactly what lands in the file (no surprise "1,200 rows
   * exported when I was looking at 12"). */
  const handleDailyExport = () => {
    if (filteredRecords.length === 0) {
      toast.error('No attendance rows to export under the current filters');
      return;
    }
    const findEmp = (employeeId: string) =>
      employees.find(e => e.id === employeeId || (e as any).apiId === employeeId);

    // Per-status counts for the summary sheet — mirrors the filter chips.
    const statusCounts: Record<string, number> = {};
    for (const r of filteredRecords) {
      const k = r.status || 'unknown';
      statusCounts[k] = (statusCounts[k] || 0) + 1;
    }

    const summary: Array<[string, string | number]> = [
      ['Attendance Export',                  ''],
      ['Generated',                          format(new Date(), 'yyyy-MM-dd HH:mm')],
      ['From',                               dateFrom || '(all)'],
      ['To',                                 dateTo   || '(all)'],
      ['Department',                         departmentFilter === 'all' ? 'All Departments' : departmentFilter],
      ['Search',                             dailySearch || '—'],
      ['Hours filter',                       hoursFilter === 'all' ? 'All' : hoursFilter === 'fulfilled' ? '≥ 8h' : '< 8h'],
      ['Status tab',                         activeFilter === 'all' ? 'All' : activeFilter],
      ['',                                   ''],
      ['Total rows',                         filteredRecords.length],
    ];
    for (const [status, count] of Object.entries(statusCounts).sort()) {
      summary.push([`  ${status}`, count]);
    }

    const detailHeader = [
      'Date',
      'Day',
      'Emp No',
      'Name',
      'Khmer Name',
      'Department',
      'Position',
      'Morning In',
      'Morning Out',
      'Noon In',
      'Noon Out',
      'OT (h)',
      'Work Hours',
      'Status',
      'Remark',
    ];
    // Sort rows for export: status priority (rows with real punches
    // first), then date desc, then by empNo. Without this, alphabetical
    // employee order surfaces the unrecorded / absent rows at the top
    // and the actual data feels missing on first scroll.
    const STATUS_RANK: Record<string, number> = {
      present: 0, late: 0, early_leave: 0, no_checkout: 1,
      no_checkin: 2, leave: 3, absent: 4,
    };
    const sortedRecords = [...filteredRecords].sort((a, b) => {
      const ra = STATUS_RANK[a.status] ?? 5;
      const rb = STATUS_RANK[b.status] ?? 5;
      if (ra !== rb) return ra - rb;
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      const ae = findEmp(a.employeeId)?.id ?? a.employeeId;
      const be = findEmp(b.employeeId)?.id ?? b.employeeId;
      return ae.localeCompare(be);
    });
    const detailRows = sortedRecords.map(r => {
      const emp = findEmp(r.employeeId);
      const note = r.notes ?? '';
      // Legacy single check-in/check-out fields survive on older rows
      // where the morning/noon split is null. Fall back to them so the
      // Excel never shows blanks when the underlying record really had
      // a scan recorded.
      const mIn  = r.morningIn  ?? r.checkIn  ?? '';
      const mOut = r.morningOut ?? '';
      const nIn  = r.noonIn     ?? '';
      const nOut = r.noonOut    ?? r.checkOut ?? '';
      return [
        r.date,
        r.date ? format(parseISO(r.date), 'EEE') : '',
        emp?.id ?? r.employeeId,
        emp?.name ?? '',
        emp?.khmerName ?? '',
        deptName(emp?.department) || '',
        emp?.position ?? '',
        mIn,
        mOut,
        nIn,
        nOut,
        Number(r.otHours ?? 0),
        Number(r.workHours ?? 0),
        r.status ?? '',
        note,
      ];
    });

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.aoa_to_sheet(summary);
    // 28-char first column gets the long labels; second column is the value.
    wsSummary['!cols'] = [{ wch: 28 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    const wsDetail = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);
    // Reasonable column widths for the columns that benefit; rest auto.
    wsDetail['!cols'] = [
      { wch: 12 }, { wch: 6 }, { wch: 8 }, { wch: 22 }, { wch: 18 },
      { wch: 22 }, { wch: 22 }, { wch: 11 }, { wch: 11 }, { wch: 11 },
      { wch: 11 }, { wch: 7 }, { wch: 10 }, { wch: 11 }, { wch: 36 },
    ];
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Records');

    const periodSlug = dateFrom && dateTo && dateFrom === dateTo
      ? dateFrom
      : dateFrom && dateTo
        ? `${dateFrom}_to_${dateTo}`
        : format(new Date(), 'yyyy-MM-dd');
    XLSX.writeFile(wb, `attendance_${periodSlug}.xlsx`);
    toast.success(`Exported ${filteredRecords.length} row${filteredRecords.length === 1 ? '' : 's'}`);
  };

  // Scan History — flattens each row's four punches (morningIn / morningOut /
  // noonIn / noonOut) into individual scan events. Reuses the dept + search
  // filters from the roster pipeline (skipping status / hours filters since
  // those are aggregate concepts that don't apply to a single tap), then
  // sorts newest-first so the latest activity bubbles to the top.
  const scanEvents = useMemo(() => {
    const findEmp = (employeeId: string) =>
      employees.find(e => e.id === employeeId || (e as any).apiId === employeeId);

    let rows = dailyRows;
    if (departmentFilter !== 'all') {
      rows = rows.filter(r => {
        const emp = findEmp(r.employeeId);
        return deptName(emp?.department) === departmentFilter;
      });
    }
    const tokens = dailySearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      rows = rows.filter(r => {
        const emp = findEmp(r.employeeId);
        const note = r.notes ?? '';
        const device = note.startsWith('fingerprint:')
          ? note.slice('fingerprint:'.length)
          : (note === 'fingerprint' ? 'fingerprint' : '');
        const hay = [
          emp?.name, emp?.khmerName, emp?.id, emp?.empNo,
          emp?.contactNumber, deptName(emp?.department), device,
        ].filter(Boolean).join(' ').toLowerCase();
        return tokens.every(tok => hay.includes(tok));
      });
    }

    type ScanEvent = {
      key: string;
      employeeId: string;
      date: string;
      time: string;
      kind: 'Morning In' | 'Morning Out' | 'Noon In' | 'Noon Out';
      direction: 'in' | 'out';
      device: string;
      notes?: string;
    };
    const events: ScanEvent[] = [];
    for (const r of rows) {
      const note = r.notes ?? '';
      const isFp = note === 'fingerprint' || note.startsWith('fingerprint:');
      const device = isFp
        ? (note.startsWith('fingerprint:') ? note.slice('fingerprint:'.length) : 'Fingerprint')
        : '';
      const push = (
        time: string | undefined,
        kind: ScanEvent['kind'],
        direction: ScanEvent['direction'],
      ) => {
        if (!time) return;
        events.push({
          key: `${r.id}|${kind}`,
          employeeId: r.employeeId,
          date: r.date,
          time,
          kind,
          direction,
          device,
          notes: r.notes,
        });
      };
      push(r.morningIn, 'Morning In', 'in');
      push(r.morningOut, 'Morning Out', 'out');
      push(r.noonIn, 'Noon In', 'in');
      push(r.noonOut, 'Noon Out', 'out');
    }
    events.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.time.localeCompare(a.time);
    });
    return events;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyRows, employees, departmentFilter, dailySearch]);

  const scanPagination = usePagination(scanEvents, 20);

  // Reset pagination when filters change
  useEffect(() => {
    dailyPagination.resetPage();
    scanPagination.resetPage();
  }, [activeFilter, departmentFilter, dateFrom, dateTo, dailySearch, hoursFilter, dailyViewMode]);

  // Monthly data
  const monthlyData = useMemo(() => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const year = monthDate.getFullYear();
    const storedAL = loadValuesForYear(year);
    const rule = loadRule();
    const ruleAsOf = new Date(year, 0, 1);

    // Pre-aggregate non-rejected leaves for the month, keyed by both empNo
    // and apiId so the per-employee lookup below matches in either mode.
    // Half-day leaves count 0.5; full-day count 1. The backend already
    // populates {@code leave.days} but we fall back to the type when not.
    //
    // Source = {@link monthlyLeaves} (fetched per displayed month) rather
    // than {@link leaves} (scoped to the daily From/To filter). Without
    // this swap the Leave column always reflected the daily filter — so a
    // user viewing the April monthly summary saw 0 leaves even when the
    // daily filter was already on a different day.
    const monthStartStr = format(monthStart, 'yyyy-MM-dd');
    const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
    type LeaveRow = { date: string; reason: string; category: string; deducts: boolean };
    type LeaveAgg = { days: number; rows: LeaveRow[] };
    // Only annual / sick / special deduct from the AL balance. Maternity
    // and Exception are paid time but don't reduce AL — they're still
    // listed in the Leave Records popup so HR can see them, just with
    // a "no AL deduction" marker.
    const DEDUCTS_FROM_AL = new Set(['annual', 'sick', 'special']);
    const leavesByEmp = new Map<string, LeaveAgg>();
    const addLeave = (key: string, days: number, row: LeaveRow) => {
      const cur = leavesByEmp.get(key) ?? { days: 0, rows: [] };
      if (row.deducts) cur.days += days;
      cur.rows.push(row);
      leavesByEmp.set(key, cur);
    };
    // Mock mode still uses the legacy `leaves` array (mock leaves are
    // global). Live mode prefers the month-scoped slice so freshly
    // approved rows show up immediately when the loader refires.
    const sourceLeaves = USE_MOCKS ? leaves : monthlyLeaves;
    for (const lv of sourceLeaves) {
      if (lv.status === 'rejected') continue;
      if (lv.date < monthStartStr || lv.date > monthEndStr) continue;
      const isHalf = lv.type === 'half_morning' || lv.type === 'half_noon' || lv.halfDay === true;
      const days =
        typeof lv.days === 'number' && lv.days > 0
          ? lv.days
          : isHalf ? 0.5 : 1;
      const category = lv.category ?? 'annual';
      const deducts = DEDUCTS_FROM_AL.has(category);
      const reason = `${lv.type ?? 'leave'}${lv.reason ? ` — ${lv.reason}` : ''}`
        + (lv.status === 'pending' ? ' (pending)' : '');
      // Index by both forms; the lookup tries each in order below.
      addLeave(lv.employeeId, days, { date: lv.date, reason, category, deducts });
    }

    return employees
      .filter(e => e.status === 'active' && (isTenantWide || matchesScope((e as any).apiId ?? e.id, scopeMode, employees)))
      .map(emp => {
      const empRecords: Record<string, AttendanceStatus> = {};
      let presentCount = 0, absentCount = 0, lateCount = 0;

      days.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayOfWeek = getDay(day);
        if (dayOfWeek === 0 || dayOfWeek === 6) return;

        const record = attendance.find(a =>
          (a.employeeId === emp.id || a.employeeId === (emp as any).apiId)
          && a.date === dateStr);
        if (record) {
          empRecords[dateStr] = record.status;
          if (record.status === 'present' || record.status === 'early_leave') presentCount++;
          else if (record.status === 'absent' || record.status === 'no_checkin') absentCount++;
          else if (record.status === 'late') { lateCount++; presentCount++; }
          else if (record.status === 'no_checkout') presentCount++;
          // 'leave' status on attendance is superseded by the dedicated
          // leaves aggregation below — don't double-count.
        }
      });

      // Pull aggregated leaves for this employee. Try every id variant so
      // the lookup matches whether the leave row stored UUID or empNo.
      const leaveAgg =
        leavesByEmp.get(emp.id)
        ?? ((emp as any).apiId ? leavesByEmp.get((emp as any).apiId) : undefined)
        ?? { days: 0, rows: [] as { date: string; reason: string }[] };
      const leaveCount = leaveAgg.days;
      const leaveRecords = leaveAgg.rows;

      // Prefer the stored per-year value; fall back to applying the rule live.
      const totalAL = storedAL[emp.id]?.totalAL
        ?? daysForTenure(rule, tenureYears(emp.joinDate, ruleAsOf));
      const remainAL = Math.max(0, totalAL - leaveCount);

      return { employee: emp, records: empRecords, presentCount, absentCount, lateCount, leaveCount, leaveRecords, totalAL, remainAL };
    });
    // alVersion invalidates when AL values/rule change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthDate, alVersion, attendance, employees, leaves, monthlyLeaves, isTenantWide, matchesScope, scopeMode]);

  // Top absent employees
  const topAbsent = useMemo(() => {
    return [...monthlyData]
      .sort((a, b) => b.absentCount - a.absentCount)
      .filter(d => d.absentCount > 0)
      .slice(0, 5);
  }, [monthlyData]);

  // In mock mode `e.department` is a human-readable name; in live mode it's a
  // departmentId UUID, so we prefer the loaded departments list for the picker.
  const departments = USE_MOCKS
    ? [...new Set(employees.map(e => e.department))]
    : deptList.map(d => d.name);

  const filterTabs: { key: FilterTab; label: string; count: number; icon: React.ReactNode }[] = [
    // Count the roster-augmented `dailyRows` (which includes synthetic absent
    // rows), not the raw API list — otherwise "All" undercounts and disagrees
    // with the bucket badges and the "Showing X of Y" pagination footer.
    { key: 'all', label: 'All', count: dailyRows.length, icon: <Users className="h-4 w-4" /> },
    { key: 'present', label: 'Present', count: summary.present, icon: <CheckCircle2 className="h-4 w-4" /> },
    { key: 'no_checkin', label: 'No Check-in', count: summary.noCheckin, icon: <AlertTriangle className="h-4 w-4" /> },
    { key: 'no_checkout', label: 'No Check-out', count: summary.noCheckout, icon: <AlertCircle className="h-4 w-4" /> },
    { key: 'late', label: 'Late', count: summary.late, icon: <Clock className="h-4 w-4" /> },
    { key: 'early_leave', label: 'Early Out', count: summary.earlyLeave, icon: <LogOut className="h-4 w-4" /> },
    { key: 'absent', label: 'Absent', count: summary.absent, icon: <XCircle className="h-4 w-4" /> },
    { key: 'leave', label: 'Leave', count: summary.leave, icon: <CalendarIcon className="h-4 w-4" /> },
  ];

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status];
    if (!config) return <Badge variant="secondary">{status}</Badge>;
    return (
      <Badge className={`${config.bgColor} ${config.textColor} border-0 hover:${config.bgColor}`}>
        {config.label}
      </Badge>
    );
  };

  const handleEdit = (record: AttendanceType) => {
    setEditRecord(record);
    setEditCheckIn(record.checkIn || '');
    setEditCheckOut(record.checkOut || '');
    setEditMorningIn(record.morningIn || '');
    setEditMorningOut(record.morningOut || '');
    setEditNoonIn(record.noonIn || '');
    setEditNoonOut(record.noonOut || '');
    setEditStatus(record.status);
    setEditRemark(record.notes || '');
    setEditLeaveType(suggestLeaveType(
      record.morningIn || '', record.morningOut || '',
      record.noonIn || '',    record.noonOut || '',
    ));
    // Default category + end date for the auto-created LeaveRequest
    // when status='leave'. Admin can override before saving.
    setEditLeaveCategory('annual');
    setEditLeaveEndDate(record.date);
    // Pre-fill the optional "Apply OT" branch from the row.
    //   • Free-style days (weekend / holiday) → suggest the full
    //     work-hours value.
    //   • Weekday rows → suggest 0 (admin can still type a value).
    //   • Only auto-check the box when there are eligible OT hours
    //     AND no OT request has been filed yet for this (employee, date).
    const kind = dayKindOf(record.date);
    const isFreeStyle = kind === 'weekend' || kind === 'holiday';
    const suggestedOt = isFreeStyle && record.workHours ? Number(record.workHours) : 0;
    const empForOt = employees.find(
      e => e.id === record.employeeId || (e as any).apiId === record.employeeId,
    );
    const otApiId = (empForOt as any)?.apiId ?? record.employeeId;
    const alreadyFiled = !!otApiId && otRequestKeys.has(`${record.date}|${otApiId}`);
    setEditOtAlreadyFiled(alreadyFiled);
    setEditOtHours(suggestedOt > 0 ? String(suggestedOt) : '');
    setEditOtReason('');
    // Seed Start / End Hour for free-style days from the first / last
    // punch — saves HR a few clicks for the common "weekend OT = full
    // shift" case. Weekday rows leave them blank for explicit entry.
    if (isFreeStyle) {
      const first = record.morningIn || record.noonIn || '';
      const last  = record.noonOut || record.morningOut || '';
      setEditOtStartHour(first);
      setEditOtEndHour(last);
    } else {
      setEditOtStartHour('');
      setEditOtEndHour('');
    }
    // End Date defaults to same day; the wrap-detector effect below will
    // bump it to date+1 the moment the picked hours imply cross-midnight.
    setEditOtEndDate(record.date);
    // Reset the rule-type override — every fresh dialog starts from
    // auto-detection so a previous admin pick doesn't leak across rows.
    setEditOtDayTypeOverride(null);
    setEditOtRateOverride('');
    setEditApplyOt(false); // explicit opt-in even when hours suggest OT
    setEditSessionsExpanded(true); // sessions visible by default on open
    setEditDialogOpen(true);
  };

  // Auto-collapse the Morning/Noon session inputs the moment Apply OT
  // is checked — the OT block adds a lot of new fields and the dialog
  // overflows on a 720p screen. Re-expanding stays a one-click action
  // via the "Edit punches" button below. Unchecking Apply OT brings
  // the sessions back automatically so HR doesn't get stuck with a
  // collapsed view they didn't ask for.
  useEffect(() => {
    setEditSessionsExpanded(!editApplyOt);
  }, [editApplyOt]);

  // Auto-compute OT Hours from Start / End Hour, and derive the End Date
  // strictly from whether the hour range wraps past midnight. Mirrors
  // the Overtime page's submit-dialog logic so the two entry points
  // stay consistent. End Date is fully derived (no manual override
  // here) — admins who need an OT spanning >24h should use the dedicated
  // Overtime page instead.
  useEffect(() => {
    if (!editApplyOt || !editRecord) return;
    if (!editOtStartHour || !editOtEndHour) return;
    const [sh, sm] = editOtStartHour.split(':').map(n => Number(n) || 0);
    const [eh, em] = editOtEndHour.split(':').map(n => Number(n) || 0);
    if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return;

    // Add 24h when end falls on or before start so 22:00 → 05:00 reads
    // as 7h instead of -17h.
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    const wraps = mins <= 0;
    if (wraps) mins += 24 * 60;
    setEditOtHours((mins / 60).toFixed(2).replace(/\.00$/, ''));

    const rowDate = editRecord.date;
    if (wraps) {
      const next = new Date(rowDate + 'T00:00:00');
      next.setDate(next.getDate() + 1);
      setEditOtEndDate(format(next, 'yyyy-MM-dd'));
    } else {
      setEditOtEndDate(rowDate);
    }
  }, [editApplyOt, editRecord, editOtStartHour, editOtEndHour]);

  /**
   * Pick a default leave sub-type from the punch pattern. The admin can
   * override it in the dialog, but the suggestion follows the rule the
   * user described: under-six-hours of scanned time ⇒ half day, no scans
   * at all ⇒ full day.
   *
   *   • no scans of any kind          → "full"
   *   • only morning side has scans   → "half_noon"     (afternoon is leave)
   *   • only noon side has scans      → "half_morning"  (morning is leave)
   *   • both sides scanned but the
   *     first→last span is < 6h       → infer from where the first scan
   *                                     sits: morning ⇒ left early ⇒
   *                                     "half_noon"; otherwise
   *                                     "half_morning"
   *   • both sides scanned, ≥ 6h      → "full" (atypical for status=leave
   *                                     but a safe fallback)
   */
  const suggestLeaveType = (
    mIn: string, mOut: string, nIn: string, nOut: string,
  ): 'full' | 'half_morning' | 'half_noon' => {
    const hasMorning = !!(mIn || mOut);
    const hasNoon    = !!(nIn || nOut);
    if (!hasMorning && !hasNoon) return 'full';
    if (hasMorning && !hasNoon)  return 'half_noon';
    if (!hasMorning && hasNoon)  return 'half_morning';

    const toMin = (hhmm: string): number | null => {
      if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm)) return null;
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };
    const candidates = [mIn, mOut, nIn, nOut].map(toMin).filter((v): v is number => v !== null);
    const first = Math.min(...candidates);
    const last  = Math.max(...candidates);
    const span  = last - first;
    if (span < 6 * 60) {
      // First scan in the morning slot (before 12:00) → worked morning,
      // afternoon is the leave half. Otherwise the morning is the leave.
      return first < 12 * 60 ? 'half_noon' : 'half_morning';
    }
    return 'full';
  };

  /**
   * Two-step "Mark as Exception" flow.
   *
   * The row's UserMinus button calls {@link requestMarkException} which
   * just stages the target {@link Employee}. The shared AlertDialog at the
   * bottom of the page renders the confirm prompt and, on accept, fires
   * {@link confirmMarkException} which actually PATCHes the employee.
   *
   * Once flipped, the employee:
   *   • disappears from the daily roster augmentation (no synthetic absent)
   *   • is excluded from the summary chip counts
   *   • is skipped in the Compliance report on the backend
   * They stay opted out until an admin flips them back via Employees →
   * Employment → "Count in Attendance".
   */
  // Mark Exception now creates a DAY EXCEPTION leave row for the
  // specific (employee, date) — a one-day "mission / on-site / special"
  // entry. Long-term opt-outs (employee never counted until HR flips
  // back) live on the Employee page's "Count in Attendance" toggle
  // (attendanceYn). The split keeps the Attendance page's single-day
  // context honest: marking from here is always day-scoped.
  const [markExceptionTarget, setMarkExceptionTarget] = useState<{ employee: Employee; date: string } | null>(null);
  const [markExceptionBusy, setMarkExceptionBusy] = useState(false);
  // Two-axis Mark Exception form state. Category covers the non-deductible
  // leave kinds (Maternity / Exception); duration is independent. Default
  // to 'exception' + 'full' since that matches the previous behaviour.
  const [markCategory, setMarkCategory] = useState<'maternity' | 'exception'>('exception');
  const [markDuration, setMarkDuration] = useState<'full' | 'half_morning' | 'half_noon'>('full');
  // V49 — end date for the auto-created LeaveRequest. Empty string =
  // single-day (use the target row's date).
  const [markEndDate, setMarkEndDate] = useState<string>('');

  const requestMarkException = (record: AttendanceType) => {
    const emp = employees.find(
      e => e.id === record.employeeId || (e as any).apiId === record.employeeId,
    );
    if (!emp) {
      toast.error('Could not resolve employee for this row');
      return;
    }
    if (!record.date) {
      toast.error('Attendance row has no date — cannot mark a Day Exception');
      return;
    }
    setMarkExceptionTarget({ employee: emp, date: record.date });
    // Default end to the row's date — single-day. Maternity below will
    // bump it to start + 89 when the admin picks that category.
    setMarkEndDate(record.date);
  };

  const confirmMarkException = async () => {
    const target = markExceptionTarget;
    if (!target) return;
    const { employee: emp, date } = target;
    setMarkExceptionBusy(true);
    try {
      if (USE_MOCKS) {
        toast.success(`Day Exception recorded for ${emp.name} on ${date}`);
        setMarkExceptionTarget(null);
        return;
      }
      // Resolve the backend UUID — the picker / row stores apiId, but
      // fall back to empNo for safety on legacy rows.
      const employeeId = (emp as Employee & { apiId?: string }).apiId ?? emp.id;
      await leaveApi.create({
        // Backend's LeaveRequestService maps the caller to their own
        // employee when employeeId is omitted. Admins marking on
        // behalf of someone else send it explicitly here.
        employeeId,
        date,
        endDate: markEndDate || date,
        days: markDuration === 'full' ? 1 : 0.5,
        halfDay: markDuration !== 'full',
        type: markDuration,
        category: markCategory,
        reason: markCategory === 'maternity'
          ? 'Maternity leave (marked from Attendance)'
          : 'Marked exception from Attendance',
      });
      toast.success(
        markCategory === 'maternity'
          ? `Maternity leave recorded for ${emp.name} on ${date}`
          : `Day Exception recorded for ${emp.name} on ${date}`,
      );
      setMarkExceptionTarget(null);
      // Reset back to defaults so the next click on a fresh row
      // doesn't inherit the previous choice.
      setMarkCategory('exception');
      setMarkDuration('full');
      setMarkEndDate('');
      await loadLeaves();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record Day Exception');
    } finally {
      setMarkExceptionBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editRecord) return;
    // Re-entrancy guard — bail out if the previous click is still in flight.
    if (editSaving) return;
    const emp = employees.find(
      e => e.id === editRecord.employeeId || (e as any).apiId === editRecord.employeeId,
    );
    if (USE_MOCKS) {
      toast.success(`Attendance updated for ${emp?.name}`);
      setEditDialogOpen(false);
      return;
    }

    const isSynthetic = editRecord.id.startsWith('synthetic:');
    // Only forward the leave sub-type when the admin actually picked
    // "leave" — for any other status the backend ignores it anyway.
    const leaveTypePatch = editStatus === 'leave'
      ? {
          leaveType: editLeaveType,
          leaveCategory: editLeaveCategory,
          // Blank → server defaults to leave's start date (single-day row).
          leaveEndDate: editLeaveEndDate || undefined,
        }
      : {};
    setEditSaving(true);
    try {
      if (isSynthetic) {
        // The row doesn't exist in the DB yet — create it via the
        // (employeeId, date) upsert endpoint. The backend employee key is
        // the UUID (apiId), not the empNo the user sees in the table.
        const employeeId = ((emp as any)?.apiId ?? editRecord.employeeId) as string;
        await attendanceApi.upsert({
          employeeId,
          date: editRecord.date,
          morningIn: editMorningIn || null,
          morningOut: editMorningOut || null,
          noonIn: editNoonIn || null,
          noonOut: editNoonOut || null,
          status: editStatus,
          notes: editRemark || null,
          ...leaveTypePatch,
        });
      } else {
        await attendanceApi.update(editRecord.id, {
          // The backend PATCH schema accepts the four named punch fields
          // directly — these are the columns the fingerprint sync fills in.
          ...(editMorningIn  ? { morningIn:  editMorningIn  } : {}),
          ...(editMorningOut ? { morningOut: editMorningOut } : {}),
          ...(editNoonIn     ? { noonIn:     editNoonIn     } : {}),
          ...(editNoonOut    ? { noonOut:    editNoonOut    } : {}),
          status: editStatus,
          notes: editRemark || undefined,
          ...leaveTypePatch,
        } as any);
      }
      // Optional OT request — admin can opt in via the dialog. Filed
      // after the attendance update succeeds so a server-side reject
      // doesn't leave dangling OT rows. Failures here are non-fatal:
      // the attendance edit still stuck, the toast just notes the
      // partial outcome and the admin can retry from the OT page.
      if (editApplyOt) {
        const otHoursNum = Number(editOtHours);
        const targetEmpId = ((emp as any)?.apiId ?? editRecord.employeeId) as string;
        if (!Number.isFinite(otHoursNum) || otHoursNum <= 0) {
          toast.error('OT hours must be greater than 0');
        } else if (!editOtReason.trim()) {
          toast.error('OT reason is required');
        } else {
          try {
            await overtimeApi.create({
              employeeId: targetEmpId,
              date: editRecord.date,
              // endDate either matches the row's date (same-day OT) or
              // is auto-bumped to +1 by the effect above when the picked
              // hour range wraps past midnight (night-shift OT). Fall back
              // to row date if the field somehow ended up blank.
              endDate: editOtEndDate || editRecord.date,
              hours: otHoursNum,
              startHour: editOtStartHour || undefined,
              endHour: editOtEndHour || undefined,
              // Day-type override — only sent when an admin explicitly
              // picked one in the rule-type Select. Backend leaves it
              // null/auto otherwise.
              dayType: editOtDayTypeOverride ?? undefined,
              // Rate override (V62) — only sent when the admin typed a
              // positive value. Empty / 0 / NaN falls through to the
              // auto-detected rate. Stored as number on the wire.
              rateOverride: (() => {
                const n = Number(editOtRateOverride);
                return Number.isFinite(n) && n > 0 ? n : undefined;
              })(),
              reason: editOtReason.trim(),
            });
            toast.success(`OT request filed for ${emp?.name ?? 'employee'} (${otHoursNum}h)`);
            // Refresh the (date, emp) → OT key set so the badge greys
            // out immediately on the row that just had OT filed.
            void loadOtRequests();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Attendance saved, but OT request failed');
          }
        }
      }

      toast.success(`Attendance updated for ${emp?.name ?? 'employee'}`);
      setEditDialogOpen(false);
      // Status=leave creates a leave record on the backend, so re-read
      // leaves too to keep the overlay in sync. Both the daily-scoped
      // and the monthly-scoped slices are reloaded so the Monthly
      // Summary's Leave column flips immediately.
      await Promise.all([loadAttendance(), loadLeaves(), loadMonthlyLeaves(monthDate)]);
    } catch (err) {
      console.error('attendance save failed', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save attendance');
    } finally {
      setEditSaving(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
  };

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [monthDate]);

  // Employee detail view for monthly
  const selectedEmpData = useMemo(() => {
    if (!selectedEmployee) return null;
    return monthlyData.find(d => d.employee.id === selectedEmployee);
  }, [selectedEmployee, monthlyData]);

  return (
    <div className="space-y-6">
      {/* Manage Offices popup — mounted at page level so it overlays
          the whole attendance grid, not just the action bar. State
          is controlled from the gear-icon dropdown above. */}
      <OfficesDialog open={officesDialogOpen} onOpenChange={setOfficesDialogOpen} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('page.attendance.title')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showScopePicker && <ScopePicker value={scopeMode} onChange={setScopeMode} />}
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <Button
              variant={viewMode === 'daily' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('daily')}
            >
              <CalendarIcon className="mr-1.5 h-4 w-4" />
              Daily
            </Button>
            <Button
              variant={viewMode === 'monthly' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('monthly')}
            >
              <BarChart3 className="mr-1.5 h-4 w-4" />
              Monthly
            </Button>
          </div>
          {isAdmin && (
            <>
              {/* Gear icon → Manage Office popup (Offices + Devices).
                  Strict-admin only — both screens change attendance
                  hardware state (geofence radius + on-prem terminals)
                  so a manager fiddling could mass-bypass scans for
                  their whole team. */}
              {canEditPunches && (
                <Button
                  variant="outline" size="icon"
                  title="Manage office (locations + devices)"
                  aria-label="Manage office"
                  onClick={() => setOfficesDialogOpen(true)}
                >
                  <SettingsIcon className="h-4 w-4" />
                </Button>
              )}
              <FingerprintSyncPill status={fpSyncStatus} />

              <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Upload className="mr-1.5 h-4 w-4" />
                    Upload Excel
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Attendance Records</DialogTitle>
                    <DialogDescription>Upload Excel file with attendance data</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    {/* Sample download — generates a pre-filled template
                        with active employees + 3 example rows so HR can
                        see exactly which columns/formats are expected
                        before they fill the file. Uses the chosen "from"
                        date so the date column is sensible by default. */}
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-start gap-3">
                      <FileSpreadsheet className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-900">First time? Download the sample.</p>
                        <p className="text-xs text-blue-700 mt-0.5">
                          Pre-filled with active employees + 3 example rows showing full-day, single-scan, and leave shapes.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-white"
                        onClick={() => {
                          downloadAttendanceTemplate(employees, dateFrom);
                          toast.success('Sample template downloaded');
                        }}
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Download Sample
                      </Button>
                    </div>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                      <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" id="att-upload" />
                      <label htmlFor="att-upload" className="cursor-pointer">
                        <Button variant="outline" asChild><span>Select Excel File</span></Button>
                      </label>
                      {selectedFile && <p className="mt-2 text-sm text-gray-600">{selectedFile.name}</p>}
                    </div>
                    <Button
                      onClick={async () => {
                        if (!selectedFile) {
                          toast.error('Pick a file first.');
                          return;
                        }
                        setUploadProcessing(true);
                        try {
                          // 1) Parse the workbook on the client. Errors at
                          //    this stage (malformed file, missing header,
                          //    bad status enum) never hit the network.
                          const parsed = await parseAttendanceExcel(selectedFile);
                          if (parsed.errors.length > 0 && parsed.rows.length === 0) {
                            toast.error(`File rejected — ${parsed.errors.length} error(s). First: ${parsed.errors[0]}`);
                            return;
                          }
                          if (parsed.rows.length === 0) {
                            toast.warning('No data rows found in the file.');
                            return;
                          }

                          // 2) Mock mode just acknowledges — no live API.
                          if (USE_MOCKS) {
                            toast.success(`Parsed ${parsed.rows.length} rows (mock — not persisted)`);
                            setUploadDialogOpen(false);
                            setSelectedFile(null);
                            return;
                          }

                          // 3) Live mode — POST the parsed batch and
                          //    surface the per-row outcome counts. The
                          //    backend's Excel endpoint upserts by
                          //    (employee, date) so re-uploading the same
                          //    file is idempotent.
                          const result = await attendanceApi.uploadBulk(parsed.rows);
                          const errs = [...parsed.errors, ...result.errors];
                          if (errs.length > 0 && result.saved === 0) {
                            toast.error(`${errs.length} row(s) failed. First: ${errs[0]}`);
                          } else if (errs.length > 0) {
                            toast.warning(`Saved ${result.saved} · skipped ${errs.length}. First issue: ${errs[0]}`);
                          } else {
                            toast.success(`Saved ${result.saved} attendance row${result.saved === 1 ? '' : 's'}`);
                          }
                          setUploadDialogOpen(false);
                          setSelectedFile(null);
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Upload failed');
                        } finally {
                          setUploadProcessing(false);
                        }
                      }}
                      disabled={!selectedFile || uploadProcessing}
                      className="w-full"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {uploadProcessing ? 'Processing…' : 'Upload & Process'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {viewMode === 'daily' ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Present', value: summary.present, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', filter: 'present' as FilterTab },
              { label: 'Absent', value: summary.absent, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', filter: 'absent' as FilterTab },
              { label: 'Late', value: summary.late, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', filter: 'late' as FilterTab },
              { label: 'No Check-in', value: summary.noCheckin, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', filter: 'no_checkin' as FilterTab },
              { label: 'No Check-out', value: summary.noCheckout, icon: AlertCircle, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', filter: 'no_checkout' as FilterTab },
              { label: 'On Leave', value: summary.leave, icon: CalendarIcon, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', filter: 'leave' as FilterTab },
            ].map(card => (
              <Card
                key={card.label}
                className={`cursor-pointer transition-all hover:shadow-md border ${activeFilter === card.filter ? `${card.border} ${card.bg} ring-2 ring-offset-1 ring-${card.color.replace('text-', '')}` : 'border-gray-200'}`}
                onClick={() => setActiveFilter(activeFilter === card.filter ? 'all' : card.filter)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                    <span className={`text-2xl font-bold ${card.color}`}>{card.value}</span>
                  </div>
                  <p className="text-xs text-gray-500">{card.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Date picker + department filter + filter tabs */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">From:</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      max={dateTo || undefined}
                      className="w-40 h-8"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">To:</Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      min={dateFrom || undefined}
                      className="w-40 h-8"
                    />
                  </div>
                  {(dateFrom || dateTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-gray-500"
                      onClick={() => { setDateFrom(''); setDateTo(''); }}
                      title="Clear date range"
                    >
                      Clear
                    </Button>
                  )}
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">Dept:</Label>
                    <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                      <SelectTrigger className="w-40 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Departments</SelectItem>
                        {departments.map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="relative w-60">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <Input
                      value={dailySearch}
                      onChange={(e) => setDailySearch(e.target.value)}
                      placeholder="Search name, Khmer name, ID, phone, department, device…"
                      className="h-8 pl-8 pr-8 text-sm"
                    />
                    {dailySearch && (
                      <button
                        type="button"
                        onClick={() => setDailySearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        title="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDailyExport}
                  disabled={filteredRecords.length === 0}
                  title="Excel workbook with a Summary sheet (range, filters, counts) + a Records sheet (one row per employee per day)"
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  Export ({filteredRecords.length})
                </Button>
              </div>

              {/* Filter tabs + Hours filter + view-mode toggle */}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <div className="flex flex-wrap gap-1 flex-1">
                  {filterTabs.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveFilter(tab.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                        activeFilter === tab.key
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                      <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                        activeFilter === tab.key ? 'bg-white/20' : 'bg-gray-200'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
                {/* Hours fulfilment filter — independent of the chips
                    above. Slices to rows that did vs. didn't reach 8h
                    of scanned work, leaving everything else untouched. */}
                <Select value={hoursFilter} onValueChange={v => setHoursFilter(v as typeof hoursFilter)}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder="Hours" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Hours: all</SelectItem>
                    <SelectItem value="fulfilled">Fulfilled (≥ 8h)</SelectItem>
                    <SelectItem value="short">Short (&lt; 8h)</SelectItem>
                  </SelectContent>
                </Select>
                {/* Roster ↔ Scan History toggle. Roster aggregates one
                    row per (employee, date) with the four punches.
                    Scan History flattens those punches into a per-event
                    log so admins can see exactly who tapped which
                    device when, sorted newest-first. */}
                <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
                  <button
                    type="button"
                    onClick={() => setDailyViewMode('roster')}
                    className={`px-3 py-1.5 text-xs rounded ${
                      dailyViewMode === 'roster' ? 'bg-white shadow-sm font-medium' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Roster
                  </button>
                  <button
                    type="button"
                    onClick={() => setDailyViewMode('history')}
                    className={`px-3 py-1.5 text-xs rounded ${
                      dailyViewMode === 'history' ? 'bg-white shadow-sm font-medium' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Scan History
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
              {dailyViewMode === 'roster' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Dept</TableHead>
                    <TableHead>Day</TableHead>
                    {dateFrom !== dateTo && <TableHead>Date</TableHead>}
                    <TableHead className="text-center">
                      <div className="text-xs">Morning</div>
                      <div className="text-xs text-green-600">In</div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="text-xs">Morning</div>
                      <div className="text-xs text-orange-600">Out</div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="text-xs">Noon</div>
                      <div className="text-xs text-green-600">In</div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="text-xs">Noon</div>
                      <div className="text-xs text-orange-600">Out</div>
                    </TableHead>
                    <TableHead className="text-center">OT</TableHead>
                    <TableHead className="text-center">Hours</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Remark</TableHead>
                    {isAdmin && <TableHead className="w-16">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyPagination.paginatedItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={(isAdmin ? 12 : 11) + (dateFrom !== dateTo ? 1 : 0)} className="text-center py-12 text-gray-400">
                        No records found for the selected filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    dailyPagination.paginatedItems.map(record => {
                      const emp = employees.find(
                        e => e.id === record.employeeId || (e as any).apiId === record.employeeId,
                      );
                      const isSynthetic = record.id.startsWith('synthetic:');
                      const timeCell = (val?: string, icon?: 'in' | 'out') => {
                        if (!val) return <span className="text-gray-300 text-center block">--:--</span>;
                        return (
                          <span className="flex items-center justify-center gap-1 text-sm">
                            {icon === 'in' ? <LogIn className="h-3 w-3 text-green-500" /> : <LogOut className="h-3 w-3 text-blue-500" />}
                            {val}
                          </span>
                        );
                      };
                      const kind = dayKindOf(record.date);
                      const isFreeStyle = kind === 'weekend' || kind === 'holiday';
                      // On free-style days, late is meaningless — any scan is
                      // present. Hardens against legacy rows where the backend
                      // sync stamped 'late' before the V23/V24 free-style
                      // rules landed.
                      const displayStatus = isFreeStyle && record.status === 'late'
                        ? 'present'
                        : record.status;
                      // OT auto-fill rules:
                      //   • Stored otHours wins when present.
                      //   • Free-style days (weekend / holiday) — every
                      //     worked hour is OT-eligible.
                      //   • Weekdays — anything past 8h counts; we only
                      //     surface OT once the row crosses 8.5h, then
                      //     show (workHours - 8) so 8.5h reads as +0.5h,
                      //     9h as +1h, etc.
                      const otDisplay = (() => {
                        if (record.otHours && Number(record.otHours) > 0) return Number(record.otHours);
                        const wh = Number(record.workHours);
                        if (!Number.isFinite(wh) || wh <= 0) return null;
                        if (isFreeStyle) return wh;
                        if (wh >= 8.5) return Math.round((wh - 8) * 100) / 100;
                        return null;
                      })();
                      // Workday hours coloring — green when fulfilled
                      // (≥ 8h), orange otherwise. Mirrors the new
                      // "Hours filter" chip the admin can use to slice
                      // the daily list by fulfillment.
                      const wh = Number(record.workHours);
                      const fulfilled = Number.isFinite(wh) && wh >= 8;
                      const hoursClass = !record.workHours
                        ? 'text-gray-400'
                        : fulfilled
                          ? 'text-green-600 font-medium'
                          : 'text-orange-600 font-medium';
                      // Has an OT request already been filed for this
                      // (employee, date)? Backend stores employeeId as the
                      // UUID; emp.apiId carries the same. If found, dim
                      // the badge so it's clear no further action is
                      // needed. Coloured (blue) badges flag potential OT
                      // that hasn't been claimed yet.
                      const otApiId = (emp as any)?.apiId ?? record.employeeId;
                      const otRequested = otApiId
                        && otRequestKeys.has(`${record.date}|${otApiId}`);
                      return (
                        <TableRow key={record.id} className="hover:bg-gray-50">
                          <TableCell>
                            <EmployeeCell employee={emp} subtitle={emp?.id} />
                          </TableCell>
                          <TableCell className="text-sm">{deptName(emp?.department)}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                kind === 'holiday'
                                  ? 'bg-red-50 text-red-700 border-red-200 text-xs font-normal'
                                  : kind === 'weekend'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200 text-xs font-normal'
                                    : 'bg-gray-50 text-gray-600 text-xs font-normal'
                              }
                            >
                              {kind === 'holiday' ? 'Holiday Day' : kind === 'weekend' ? 'Weekend' : 'Work Day'}
                            </Badge>
                          </TableCell>
                          {dateFrom !== dateTo && (
                            <TableCell className="text-sm whitespace-nowrap">
                              {format(parseISO(record.date), 'MMM dd')}
                            </TableCell>
                          )}
                          <TableCell className="text-center">{timeCell(record.morningIn, 'in')}</TableCell>
                          <TableCell className="text-center">{timeCell(record.morningOut, 'out')}</TableCell>
                          <TableCell className="text-center">{timeCell(record.noonIn, 'in')}</TableCell>
                          <TableCell className="text-center">{timeCell(record.noonOut, 'out')}</TableCell>
                          <TableCell className="text-center">
                            {otDisplay !== null ? (
                              <Badge
                                className={
                                  otRequested
                                    ? 'bg-gray-100 text-gray-500 border-0 text-xs'
                                    : 'bg-blue-100 text-blue-700 border-0 text-xs'
                                }
                                title={otRequested ? 'OT request already filed' : 'Potential OT — not yet claimed'}
                              >
                                +{otDisplay}h
                              </Badge>
                            ) : <span className="text-gray-300">-</span>}
                          </TableCell>
                          <TableCell className={`text-center text-sm ${hoursClass}`}>
                            {record.workHours ? `${record.workHours}h` : '-'}
                          </TableCell>
                          <TableCell>{getStatusBadge(displayStatus)}</TableCell>
                          <TableCell>
                            {(() => {
                              // Notes set by the fingerprint sync follow the
                              // shape "fingerprint" or "fingerprint:<DeviceName>"
                              // (e.g. "fingerprint:We-Cafe"). Render the device
                              // name so admins can trace which terminal
                              // captured the latest punch of the day.
                              const note = record.notes ?? '';
                              const isFp = note === 'fingerprint' || note.startsWith('fingerprint:');
                              if (!isFp) {
                                return <p className="text-xs text-gray-500 max-w-[150px] truncate">{note || '-'}</p>;
                              }
                              const deviceLabel = note.startsWith('fingerprint:') ? note.slice('fingerprint:'.length) : '';
                              return (
                                <p
                                  className="text-xs text-gray-500 max-w-[200px] truncate"
                                  title={deviceLabel ? `Captured by ${deviceLabel}` : 'Captured by fingerprint sync'}
                                >
                                  fingerprint
                                  {deviceLabel && (
                                    <>
                                      {' · '}
                                      <span className="text-gray-700">{deviceLabel}</span>
                                    </>
                                  )}
                                </p>
                              );
                            })()}
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {canEditPunches && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    title="Edit punches"
                                    onClick={() => handleEdit(record)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700"
                                  title="Add Day Exception (mission / on-site / special work for this day)"
                                  onClick={() => requestMarkException(record)}
                                >
                                  <UserMinus className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              ) : (
                /* Scan History — flat per-tap event log. Each row is a
                   single fingerprint scan attached to the (employee, date)
                   it landed on. Newest events first; useful for forensics
                   ("who tapped which device when") and for verifying the
                   sync caught a punch the roster column would mask if a
                   later scan overwrote it. */
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Dept</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Day</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Scan</TableHead>
                      <TableHead>Device</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scanPagination.paginatedItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-gray-400">
                          No scans found for the selected filters
                        </TableCell>
                      </TableRow>
                    ) : (
                      scanPagination.paginatedItems.map(ev => {
                        const emp = employees.find(
                          e => e.id === ev.employeeId || (e as any).apiId === ev.employeeId,
                        );
                        const kind = dayKindOf(ev.date);
                        return (
                          <TableRow key={ev.key} className="hover:bg-gray-50">
                            <TableCell>
                              <EmployeeCell employee={emp} subtitle={emp?.id} />
                            </TableCell>
                            <TableCell className="text-sm">{deptName(emp?.department)}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {formatDate(ev.date)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  kind === 'holiday'
                                    ? 'bg-red-50 text-red-700 border-red-200 text-xs font-normal'
                                    : kind === 'weekend'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200 text-xs font-normal'
                                      : 'bg-gray-50 text-gray-600 text-xs font-normal'
                                }
                              >
                                {kind === 'holiday' ? 'Holiday' : kind === 'weekend' ? 'Weekend' : 'Workday'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{ev.time}</TableCell>
                            <TableCell>
                              <span className="flex items-center gap-1.5 text-sm">
                                {ev.direction === 'in'
                                  ? <LogIn className="h-3.5 w-3.5 text-green-500" />
                                  : <LogOut className="h-3.5 w-3.5 text-blue-500" />}
                                {ev.kind}
                              </span>
                            </TableCell>
                            <TableCell>
                              {ev.device ? (
                                <span
                                  className="flex items-center gap-1 text-xs text-gray-700"
                                  title="Captured by fingerprint sync"
                                >
                                  <Fingerprint className="h-3 w-3 text-gray-400" />
                                  {ev.device}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              )}
              <Pagination
                currentPage={dailyViewMode === 'roster' ? dailyPagination.currentPage : scanPagination.currentPage}
                totalPages={dailyViewMode === 'roster' ? dailyPagination.totalPages : scanPagination.totalPages}
                onPageChange={dailyViewMode === 'roster' ? dailyPagination.goToPage : scanPagination.goToPage}
                startIndex={dailyViewMode === 'roster' ? dailyPagination.startIndex : scanPagination.startIndex}
                endIndex={dailyViewMode === 'roster' ? dailyPagination.endIndex : scanPagination.endIndex}
                totalItems={dailyViewMode === 'roster' ? dailyPagination.totalItems : scanPagination.totalItems}
              />
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {/* Monthly View */}
          <div className="flex items-center gap-4 mb-2">
            <Button variant="outline" size="sm" onClick={() => setMonthDate(subMonths(monthDate, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold min-w-[160px] text-center">{format(monthDate, 'MMMM yyyy')}</h2>
            <Button variant="outline" size="sm" onClick={() => setMonthDate(addMonths(monthDate, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Label className="text-sm">Dept:</Label>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-40 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setAlDialogOpen(true)}>
                <CalendarIcon className="mr-1.5 h-4 w-4" />
                Annual Leave
              </Button>
              <Button variant="outline" size="sm" onClick={() => toast.success('Exported monthly data')}>
                <Download className="mr-1.5 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Monthly Summary Table */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3 space-y-3">
                <CardTitle className="text-base">Monthly Summary</CardTitle>
                {/* Filters row */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[180px] max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <Input
                      value={monthlySearch}
                      onChange={(e) => setMonthlySearch(e.target.value)}
                      placeholder="Search name, Khmer name, ID, phone, department, device…"
                      className="h-8 pl-8 pr-8 text-sm"
                    />
                    {monthlySearch && (
                      <button
                        type="button"
                        onClick={() => setMonthlySearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        title="Clear"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {([
                      { key: 'all', label: 'All' },
                      { key: 'late', label: 'Late' },
                      { key: 'absent', label: 'Absent' },
                      { key: 'late_or_absent', label: 'Late or Absent' },
                    ] as const).map(chip => (
                      <Button
                        key={chip.key}
                        variant={monthlyStatusFilter === chip.key ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setMonthlyStatusFilter(chip.key)}
                      >
                        {chip.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const tokens = monthlySearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
                  const filteredRows = monthlyData.filter(d => {
                    if (departmentFilter !== 'all' && deptName(d.employee.department) !== departmentFilter) return false;
                    if (tokens.length > 0) {
                      const e = d.employee;
                      const hay = [
                        e.name, e.khmerName, e.id, (e as any).empNo,
                        e.contactNumber, deptName(e.department),
                      ].filter(Boolean).join(' ').toLowerCase();
                      if (!tokens.every(tok => hay.includes(tok))) return false;
                    }
                    if (monthlyStatusFilter === 'late' && d.lateCount === 0) return false;
                    if (monthlyStatusFilter === 'absent' && d.absentCount === 0) return false;
                    if (monthlyStatusFilter === 'late_or_absent' && d.lateCount === 0 && d.absentCount === 0) return false;
                    return true;
                  });
                  return (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-center">Total AL</TableHead>
                      <TableHead className="text-center">Leave</TableHead>
                      <TableHead className="text-center">Remain</TableHead>
                      <TableHead className="text-center">Present</TableHead>
                      <TableHead className="text-center">Absent</TableHead>
                      <TableHead className="text-center">Late</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-sm text-gray-400 py-10">
                          No employees match these filters.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredRows
                      .map(data => (
                        <TableRow
                          key={data.employee.id}
                          className={`cursor-pointer hover:bg-gray-50 ${selectedEmployee === data.employee.id ? 'bg-blue-50' : ''}`}
                          onClick={() => setSelectedEmployee(selectedEmployee === data.employee.id ? null : data.employee.id)}
                        >
                          <TableCell>
                            <EmployeeCell employee={data.employee} />
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex items-center justify-center h-7 min-w-[28px] rounded-full bg-blue-50 text-blue-700 text-sm font-medium">
                              {data.totalAL}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {data.leaveCount > 0 ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); setLeaveDetailEmp(data.employee.id); }}
                                className="inline-flex items-center justify-center h-7 min-w-[28px] rounded-full bg-indigo-100 text-indigo-700 text-sm font-medium hover:bg-indigo-200 hover:ring-2 hover:ring-indigo-300 transition-all cursor-pointer"
                                title="Click to view leave details"
                              >
                                {data.leaveCount}
                              </button>
                            ) : (
                              <span className="inline-flex items-center justify-center h-7 min-w-[28px] rounded-full bg-gray-100 text-gray-400 text-sm font-medium">
                                0
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`inline-flex items-center justify-center h-7 min-w-[28px] rounded-full text-sm font-medium ${data.remainAL > 5 ? 'bg-green-100 text-green-700' : data.remainAL > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                              {data.remainAL}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex items-center justify-center h-7 min-w-[28px] rounded-full bg-green-100 text-green-700 text-sm font-medium">
                              {data.presentCount}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`inline-flex items-center justify-center h-7 min-w-[28px] rounded-full text-sm font-medium ${data.absentCount > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}`}>
                              {data.absentCount}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`inline-flex items-center justify-center h-7 min-w-[28px] rounded-full text-sm font-medium ${data.lateCount > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-400'}`}>
                              {data.lateCount}
                            </span>
                          </TableCell>
                          <TableCell>
                            <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${selectedEmployee === data.employee.id ? 'rotate-90' : ''}`} />
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Right panel: Calendar or Top Absent */}
            <div className="space-y-6">
              {selectedEmpData ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{selectedEmpData.employee.name}</span>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedEmployee(null)}>Close</Button>
                    </CardTitle>
                    <p className="text-xs text-gray-400">{deptName(selectedEmpData.employee.department)} - {format(monthDate, 'MMMM yyyy')}</p>
                  </CardHeader>
                  <CardContent>
                    {/* Mini calendar grid */}
                    <div className="grid grid-cols-7 gap-1 mb-4">
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                        <div key={i} className="text-center text-xs text-gray-400 py-1">{d}</div>
                      ))}
                      {(() => {
                        const firstDay = getDay(startOfMonth(monthDate));
                        const offset = firstDay === 0 ? 6 : firstDay - 1;
                        const cells = [];
                        for (let i = 0; i < offset; i++) {
                          cells.push(<div key={`empty-${i}`} />);
                        }
                        calendarDays.forEach(day => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const dayOfWeek = getDay(day);
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                          const status = selectedEmpData.records[dateStr];
                          const config = status ? STATUS_CONFIG[status] : null;

                          cells.push(
                            <div
                              key={dateStr}
                              className={`text-center py-1 rounded text-xs ${
                                isWeekend ? 'text-gray-300 bg-gray-50' :
                                config ? `${config.bgColor} ${config.textColor} font-medium` :
                                'text-gray-400'
                              }`}
                              title={`${format(day, 'MMM d')}${status ? ` - ${STATUS_CONFIG[status]?.label}` : ''}`}
                            >
                              {format(day, 'd')}
                            </div>
                          );
                        });
                        return cells;
                      })()}
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-2 pt-3 border-t">
                      {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'early_leave').map(([key, config]) => (
                        <div key={key} className="flex items-center gap-1">
                          <div className={`h-2.5 w-2.5 rounded-full ${config.color}`} />
                          <span className="text-xs text-gray-500">{config.shortLabel}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Top Absent Employees
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {topAbsent.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">No absences this month</p>
                    ) : (
                      <div className="space-y-3">
                        {topAbsent.map((data, idx) => (
                          <div
                            key={data.employee.id}
                            className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-2 rounded-lg -mx-2"
                            onClick={() => setSelectedEmployee(data.employee.id)}
                          >
                            <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-medium ${idx === 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{data.employee.name}</p>
                              <p className="text-xs text-gray-400">{deptName(data.employee.department)}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-semibold text-red-600">{data.absentCount}</span>
                              <span className="text-xs text-gray-400">days</span>
                            </div>
                            {/* Simple bar */}
                            <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.min((data.absentCount / 5) * 100, 100)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Quick stats */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Month Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Total Employees</span>
                    <span className="font-medium">
                      {employees
                        .filter(e => e.status === 'active' && (isTenantWide || matchesScope((e as any).apiId ?? e.id, scopeMode, employees)))
                        .length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Avg. Attendance Rate</span>
                    <span className="font-medium text-green-600">
                      {monthlyData.length > 0 ? Math.round((monthlyData.reduce((s, d) => s + d.presentCount, 0) / Math.max(monthlyData.reduce((s, d) => s + d.presentCount + d.absentCount, 0), 1)) * 100) : 0}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Total Absences</span>
                    <span className="font-medium text-red-600">{monthlyData.reduce((s, d) => s + d.absentCount, 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Total Late</span>
                    <span className="font-medium text-yellow-600">{monthlyData.reduce((s, d) => s + d.lateCount, 0)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Leave Details Dialog */}
      <Dialog open={!!leaveDetailEmp} onOpenChange={() => setLeaveDetailEmp(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-indigo-600" />
              Leave Details
            </DialogTitle>
            <DialogDescription>
              {leaveDetailEmp && (() => {
                const data = monthlyData.find(d => d.employee.id === leaveDetailEmp);
                return data ? `${data.employee.name} — ${format(monthDate, 'MMMM yyyy')}` : '';
              })()}
            </DialogDescription>
          </DialogHeader>
          {leaveDetailEmp && (() => {
            const data = monthlyData.find(d => d.employee.id === leaveDetailEmp);
            if (!data) return null;
            return (
              <div className="space-y-4">
                {/* Summary bar */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <p className="text-lg font-bold text-blue-700">{data.totalAL}</p>
                    <p className="text-xs text-blue-600">Total AL</p>
                  </div>
                  <div className="text-center p-3 bg-indigo-50 rounded-lg">
                    <p className="text-lg font-bold text-indigo-700">{data.leaveCount}</p>
                    <p className="text-xs text-indigo-600">Used</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-lg font-bold text-green-700">{data.remainAL}</p>
                    <p className="text-xs text-green-600">Remaining</p>
                  </div>
                </div>
                {/* Leave records list — non-deductible categories
                    (Maternity / Exception) are listed but flagged as
                    not counting toward AL Used, so HR has full context. */}
                {data.leaveRecords.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Leave Records</p>
                    {data.leaveRecords.map((lr, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                          <CalendarIcon className="h-4 w-4 text-indigo-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{format(parseISO(lr.date), 'EEE, MMM d, yyyy')}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{lr.reason}</p>
                          {!lr.deducts && (
                            <p className="text-[11px] text-amber-700 mt-0.5">Does not deduct from AL</p>
                          )}
                        </div>
                        {lr.deducts ? (
                          <Badge className="bg-indigo-50 text-indigo-700 border-0 text-xs shrink-0 capitalize">
                            {lr.category}
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-50 text-amber-700 border-0 text-xs shrink-0 capitalize">
                            {lr.category}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">No leave records this month</p>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Attendance</DialogTitle>
            <DialogDescription>
              {editRecord && `Update attendance for ${
                employees.find(
                  e => e.id === editRecord.employeeId || (e as any).apiId === editRecord.employeeId,
                )?.name ?? 'employee'
              } on ${editRecord.date}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editSessionsExpanded ? (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Morning Session</p>
                    {editApplyOt && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-gray-500"
                        onClick={() => setEditSessionsExpanded(false)}
                      >
                        Hide punches
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-sm text-green-700">Morning In</Label>
                      <Input type="time" value={editMorningIn} onChange={e => setEditMorningIn(e.target.value)} className="h-8" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-orange-700">Morning Out</Label>
                      <Input type="time" value={editMorningOut} onChange={e => setEditMorningOut(e.target.value)} className="h-8" />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Noon Session</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-sm text-green-700">Noon In</Label>
                      <Input type="time" value={editNoonIn} onChange={e => setEditNoonIn(e.target.value)} className="h-8" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-orange-700">Noon Out</Label>
                      <Input type="time" value={editNoonOut} onChange={e => setEditNoonOut(e.target.value)} className="h-8" />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              // Collapsed summary — one-line preview of all four punches
              // with an "Edit punches" button to re-expand. Keeps the
              // dialog short when the admin is focused on the Apply OT
              // section but doesn't hide the data.
              <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                  <span className="font-medium text-gray-500 uppercase tracking-wide">Punches</span>
                  <span className="font-mono">
                    <span className="text-green-700">{editMorningIn || '—:—'}</span>
                    <span className="text-gray-400"> / </span>
                    <span className="text-orange-700">{editMorningOut || '—:—'}</span>
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="font-mono">
                    <span className="text-green-700">{editNoonIn || '—:—'}</span>
                    <span className="text-gray-400"> / </span>
                    <span className="text-orange-700">{editNoonOut || '—:—'}</span>
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setEditSessionsExpanded(true)}
                >
                  Edit punches
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm">Status</Label>
              <Select
                value={editStatus}
                onValueChange={v => {
                  setEditStatus(v as AttendanceStatus);
                  // Re-suggest the leave sub-type from the current punches
                  // every time the admin flips status to "leave". The pick
                  // remains editable below.
                  if (v === 'leave') {
                    setEditLeaveType(
                      suggestLeaveType(editMorningIn, editMorningOut, editNoonIn, editNoonOut),
                    );
                  }
                }}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editStatus === 'leave' && (
              <div className="space-y-3">
                {/* V47 two-axis model: category (what kind) + duration
                    (full / half). Maternity & Exception don't deduct
                    from the annual leave balance. */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm">Leave Type</Label>
                    <Select
                      value={editLeaveCategory}
                      onValueChange={v => {
                        const next = v as typeof editLeaveCategory;
                        setEditLeaveCategory(next);
                        // Maternity = 90 days inclusive → auto-fill end date.
                        // For half-day durations end stays at the row date.
                        if (next === 'maternity' && editRecord?.date && editLeaveType === 'full') {
                          const s = new Date(editRecord.date + 'T00:00:00');
                          s.setDate(s.getDate() + 89);
                          const yyyy = s.getFullYear();
                          const mm = String(s.getMonth() + 1).padStart(2, '0');
                          const dd = String(s.getDate()).padStart(2, '0');
                          setEditLeaveEndDate(`${yyyy}-${mm}-${dd}`);
                        } else if (next !== 'maternity' && editRecord?.date) {
                          // Reset to single-day when stepping away from Maternity.
                          setEditLeaveEndDate(editRecord.date);
                        }
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="annual">Annual</SelectItem>
                        <SelectItem value="sick">Sick</SelectItem>
                        <SelectItem value="special">Special</SelectItem>
                        <SelectItem value="maternity">Maternity (90 days)</SelectItem>
                        <SelectItem value="exception">Exception</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Duration</Label>
                    <Select
                      value={editLeaveType}
                      onValueChange={v => {
                        const next = v as 'full' | 'half_morning' | 'half_noon';
                        setEditLeaveType(next);
                        // Half-day implies single-day — clamp end to start.
                        if (next !== 'full' && editRecord?.date) {
                          setEditLeaveEndDate(editRecord.date);
                        }
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full Day</SelectItem>
                        <SelectItem value="half_morning">Half — Morning</SelectItem>
                        <SelectItem value="half_noon">Half — Afternoon</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* End Date — only meaningful when Duration = Full Day.
                    For half-day rows we lock it to the attendance row's
                    date (single-day leave). */}
                <div className="space-y-1">
                  <Label className="text-sm" htmlFor="edit-leave-end">End Date</Label>
                  <Input
                    id="edit-leave-end"
                    type="date"
                    value={editLeaveEndDate}
                    min={editRecord?.date}
                    disabled={editLeaveType !== 'full'}
                    onChange={e => setEditLeaveEndDate(e.target.value)}
                  />
                  <p className="text-[11px] text-gray-500">
                    {editLeaveType !== 'full'
                      ? 'Half-day leave is always single-day.'
                      : editLeaveCategory === 'maternity'
                        ? '90 days from start date — adjust if the leave spans a different range.'
                        : 'Same as start date for single-day leaves; pick a later date for a range.'}
                  </p>
                </div>
              </div>
            )}

            {/* Optional "Apply OT" branch. Visible whenever there's an
                edited record — admin can opt in even if no auto-suggest
                came through. When an OT request was already filed for
                this (employee, date), the section explains that and the
                checkbox is disabled to avoid duplicates. */}
            {editRecord && editStatus !== 'leave' && (
              <div className="rounded-md border border-blue-200 bg-blue-50/40 p-3 space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editApplyOt}
                    onChange={e => setEditApplyOt(e.target.checked)}
                    disabled={editOtAlreadyFiled}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      Apply OT for this employee
                      <span className="text-xs text-gray-500 font-normal ml-1">(optional)</span>
                    </p>
                    <p className="text-xs text-gray-600">
                      {editOtAlreadyFiled
                        ? 'An OT request already exists for this date — no further action needed.'
                        : 'Files an OT request on the employee\'s behalf. Goes through the normal Approve / Reject flow.'}
                    </p>
                  </div>
                </label>
                {editApplyOt && !editOtAlreadyFiled && (
                  <div className="space-y-2">
                    {/* Date range — Start Date is the row's date and stays
                        locked. End Date auto-bumps to start+1 when the
                        hour range wraps past midnight (night shift). */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Start Date</Label>
                        <Input
                          type="date"
                          value={editRecord?.date ?? ''}
                          readOnly
                          className="h-8 bg-gray-50"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1.5">
                          End Date
                          {editOtEndDate && editRecord && editOtEndDate !== editRecord.date && (
                            <Badge variant="outline" className="px-1 py-0 text-[10px] border-indigo-300 text-indigo-700 bg-indigo-50">
                              cross-date
                            </Badge>
                          )}
                        </Label>
                        <Input
                          type="date"
                          value={editOtEndDate}
                          readOnly
                          className="h-8 bg-gray-50"
                        />
                      </div>
                    </div>
                    {/* Hour range — drives day-bucket rate calc on the OT
                        page. Hours below is auto-computed from these. */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Check-In Hour</Label>
                        <Input
                          type="time"
                          value={editOtStartHour}
                          onChange={e => setEditOtStartHour(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Check-Out Hour</Label>
                        <Input
                          type="time"
                          value={editOtEndHour}
                          onChange={e => setEditOtEndHour(e.target.value)}
                          className="h-8"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">
                          OT Hours <span className="text-gray-400">(auto)</span>
                        </Label>
                        <Input
                          type="number"
                          step="0.25"
                          min="0"
                          value={editOtHours}
                          onChange={e => setEditOtHours(e.target.value)}
                          placeholder="e.g., 3"
                          className="h-8 bg-gray-50"
                          readOnly={!!editOtStartHour && !!editOtEndHour}
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Reason</Label>
                        <Input
                          value={editOtReason}
                          onChange={e => setEditOtReason(e.target.value)}
                          placeholder="e.g., Holiday work — order pack"
                          className="h-8"
                        />
                      </div>
                    </div>
                    {/* Helper line — shows what the OT page will treat the
                        row as the moment it gets filed. */}
                    {editOtStartHour && editOtEndHour && Number(editOtHours) > 0 && (
                      <p className="text-[11px] text-gray-500">
                        {editOtStartHour} – {editOtEndHour}
                        {editOtEndDate && editRecord && editOtEndDate !== editRecord.date && (
                          <span className="text-indigo-700"> (next day)</span>
                        )}
                        {' = '}{editOtHours}h
                      </p>
                    )}

                    {/* Rule-type badge — read-only for Manager / Employee,
                        editable Select for Admin. Detection uses the row's
                        date + the configured holiday calendar + the
                        picked start/end hours (for the night overlay). */}
                    {editRecord && (() => {
                      const rateOverrideNum = (() => {
                        const n = Number(editOtRateOverride);
                        return Number.isFinite(n) && n > 0 ? n : undefined;
                      })();
                      const rule = detectOtRule({
                        date: editRecord.date,
                        startHour: editOtStartHour,
                        endHour: editOtEndHour,
                        holidayDates,
                        weekdayRate: otRates.weekday,
                        weekendRate: otRates.weekend,
                        holidayRate: otRates.holiday,
                        nightEnabled: otRates.nightEnabled,
                        nightRate: otRates.nightRate,
                        nightStart: otRates.nightStart,
                        nightEnd: otRates.nightEnd,
                        nightCompose: otRates.nightCompose,
                        override: editOtDayTypeOverride ?? undefined,
                        rateOverride: rateOverrideNum,
                      });
                      const dayBadgeColor = rule.dayType === 'holiday'
                        ? 'bg-red-100 text-red-800 border-red-200'
                        : rule.dayType === 'weekend'
                          ? 'bg-orange-100 text-orange-800 border-orange-200'
                          : 'bg-blue-100 text-blue-800 border-blue-200';
                      return (
                        <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-2 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Label className="text-xs">OT Rule:</Label>
                            <Badge variant="outline" className={dayBadgeColor}>
                              {rule.dayType === 'holiday' ? 'Holiday' : rule.dayType === 'weekend' ? 'Weekend' : 'Workday'}
                            </Badge>
                            {rule.isNight && otRates.nightEnabled && (
                              <Badge variant="outline" className="bg-indigo-100 text-indigo-800 border-indigo-200">+ Night</Badge>
                            )}
                            <span className="text-xs text-gray-600 font-medium">→ {rule.effectiveRate}×</span>
                            {editOtDayTypeOverride && (
                              <Badge variant="outline" className="px-1 py-0 text-[10px] bg-amber-50 text-amber-800 border-amber-200">
                                day-type override
                              </Badge>
                            )}
                            {rule.fromOverride && (
                              <Badge variant="outline" className="px-1 py-0 text-[10px] bg-amber-50 text-amber-800 border-amber-200">
                                custom rate
                              </Badge>
                            )}
                          </div>
                          {canOverrideOtRule ? (
                            <div className="grid grid-cols-2 gap-2 items-end">
                              <div className="space-y-1">
                                <Label className="text-[11px] text-gray-500">Override day-type (admin)</Label>
                                <Select
                                  value={editOtDayTypeOverride ?? 'auto'}
                                  onValueChange={(v) =>
                                    setEditOtDayTypeOverride(v === 'auto' ? null : (v as 'workday' | 'weekend' | 'holiday'))
                                  }
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="auto">Auto-detect</SelectItem>
                                    <SelectItem value="workday">Workday</SelectItem>
                                    <SelectItem value="weekend">Weekend</SelectItem>
                                    <SelectItem value="holiday">Holiday</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-gray-500">Custom rate (admin)</Label>
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={editOtRateOverride}
                                    onChange={(e) => setEditOtRateOverride(e.target.value)}
                                    placeholder={String(rule.effectiveRate)}
                                    className="h-8"
                                  />
                                  <span className="text-sm font-medium text-indigo-600">×</span>
                                  {editOtRateOverride && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-[11px]"
                                      onClick={() => setEditOtRateOverride('')}
                                    >
                                      Clear
                                    </Button>
                                  )}
                                </div>
                              </div>
                              <p className="text-[11px] text-gray-500 col-span-2">
                                Leave Custom Rate blank to follow the OT settings. Any positive value skips the day-type + night composition for this row only.
                              </p>
                            </div>
                          ) : (
                            <p className="text-[11px] text-gray-500">
                              Rule is auto-detected from the row's date and OT settings — only admins can override.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm">Remark</Label>
              <Input
                value={editRemark}
                onChange={e => setEditRemark(e.target.value)}
                placeholder="e.g., Traffic delay, Medical appointment..."
                className="h-8"
              />
            </div>
            <div className="bg-amber-50 p-3 rounded-lg">
              <p className="text-xs text-amber-800">Changes will be logged in the audit trail with your user ID and timestamp.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                disabled={editSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Annual Leave setup */}
      <AnnualLeaveSetup
        open={alDialogOpen}
        onOpenChange={setAlDialogOpen}
        defaultYear={monthDate.getFullYear()}
        employees={employees.map(e => ({ id: e.id, name: e.name, joinDate: e.joinDate, status: e.status }))}
        onChanged={() => setAlVersion(v => v + 1)}
      />

      {/* Mark-as-Exception confirm — replaces the native browser confirm()
          so the prompt looks like every other destructive action in the app. */}
      <AlertDialog
        open={!!markExceptionTarget}
        onOpenChange={(open) => { if (!open && !markExceptionBusy) setMarkExceptionTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {markCategory === 'maternity' ? 'Add Maternity Leave' : 'Add Day Exception'}
              {' for '}{markExceptionTarget?.employee.name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                Recording a non-deductible leave for{' '}
                <span className="font-medium">{markExceptionTarget?.date}</span>.
                It will appear under{' '}
                <span className="font-medium">Exception → Day</span> and will NOT
                deduct from the employee's annual leave balance.
                <div className="mt-1 text-xs text-gray-500">
                  Need a permanent opt-out instead? Use{' '}
                  <span className="font-medium">Employees → Employment → "Count in Attendance"</span>{' '}
                  for a long-term Exception.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Category + Duration form. Maternity is the 90-day flavour;
              Exception covers mission / on-site / special work. Both are
              non-deductible — that's what makes them live on this page. */}
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="me-cat" className="text-xs">Leave Type</Label>
                <select
                  id="me-cat"
                  value={markCategory}
                  onChange={(e) => {
                    const next = e.target.value as typeof markCategory;
                    setMarkCategory(next);
                    // Maternity = 90 days inclusive from the row date.
                    const rowDate = markExceptionTarget?.date;
                    if (next === 'maternity' && rowDate && markDuration === 'full') {
                      const s = new Date(rowDate + 'T00:00:00');
                      s.setDate(s.getDate() + 89);
                      const yyyy = s.getFullYear();
                      const mm = String(s.getMonth() + 1).padStart(2, '0');
                      const dd = String(s.getDate()).padStart(2, '0');
                      setMarkEndDate(`${yyyy}-${mm}-${dd}`);
                    } else if (next !== 'maternity' && rowDate) {
                      setMarkEndDate(rowDate);
                    }
                  }}
                  disabled={markExceptionBusy}
                  className="w-full px-3 py-2 border rounded-md text-sm h-9"
                >
                  <option value="exception">Exception (mission / on-site)</option>
                  <option value="maternity">Maternity (90 days)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="me-dur" className="text-xs">Duration</Label>
                <select
                  id="me-dur"
                  value={markDuration}
                  onChange={(e) => {
                    const next = e.target.value as typeof markDuration;
                    setMarkDuration(next);
                    if (next !== 'full' && markExceptionTarget?.date) {
                      setMarkEndDate(markExceptionTarget.date);
                    }
                  }}
                  disabled={markExceptionBusy}
                  className="w-full px-3 py-2 border rounded-md text-sm h-9"
                >
                  <option value="full">Full Day</option>
                  <option value="half_morning">Half Day — Morning</option>
                  <option value="half_noon">Half Day — Afternoon</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="me-end" className="text-xs">
                End Date <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <input
                id="me-end"
                type="date"
                value={markEndDate}
                min={markExceptionTarget?.date}
                disabled={markExceptionBusy || markDuration !== 'full'}
                onChange={e => setMarkEndDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm h-9 disabled:bg-gray-100"
              />
              <p className="text-[11px] text-gray-500">
                {markDuration !== 'full'
                  ? 'Half-day leave is always single-day.'
                  : markCategory === 'maternity'
                    ? '90 days from start — adjust if the leave spans a different range.'
                    : 'Leave blank or match the start date for a single-day Exception.'}
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markExceptionBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={(e) => { e.preventDefault(); void confirmMarkException(); }}
              disabled={markExceptionBusy}
            >
              {markExceptionBusy
                ? 'Recording…'
                : markCategory === 'maternity' ? 'Add Maternity Leave' : 'Add Day Exception'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Read-only pill showing the latest Node-worker → backend fingerprint sync.
 * Replaces the old "Import Fingerprint" admin dialog: the worker now polls
 * the device every 60 s and pushes results, so the UI just observes status
 * instead of triggering an import.
 *
 *   ●  Connected   · synced 30s ago        (lastSyncAt < 3 min)
 *   ●  Stale       · last sync 12 min ago  (3 min ≤ lastSyncAt < 30 min)
 *   ●  Offline     · last sync 2h ago      (lastSyncAt ≥ 30 min)
 *   ◌  Awaiting sync                       (no push since backend started)
 */
function FingerprintSyncPill({ status }: { status: attendanceApi.FingerprintSyncStatus | null }) {
  const lastSyncAt = status?.lastSyncAt ? new Date(status.lastSyncAt) : null;
  const ageMs = lastSyncAt ? Date.now() - lastSyncAt.getTime() : null;
  // Connected when the backend received a push within the last 3 minutes —
  // the worker pushes every 60 s by default, so 3 min covers a missed beat.
  const tone: 'live' | 'stale' | 'offline' | 'idle' =
    ageMs == null ? 'idle'
    : ageMs < 3 * 60_000 ? 'live'
    : ageMs < 30 * 60_000 ? 'stale'
    : 'offline';

  const label =
    tone === 'live'    ? 'Connected'
    : tone === 'stale' ? 'Stale'
    : tone === 'offline' ? 'Offline'
    : 'Awaiting sync';

  const dotColor =
    tone === 'live' ? 'bg-green-500'
    : tone === 'stale' ? 'bg-amber-500'
    : tone === 'offline' ? 'bg-red-500'
    : 'bg-gray-300';

  const wrapColor =
    tone === 'live' ? 'border-green-200 bg-green-50 text-green-800'
    : tone === 'stale' ? 'border-amber-200 bg-amber-50 text-amber-800'
    : tone === 'offline' ? 'border-red-200 bg-red-50 text-red-800'
    : 'border-gray-200 bg-gray-50 text-gray-600';

  const ageLabel = (() => {
    if (ageMs == null) return null;
    const sec = Math.floor(ageMs / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  })();

  const tooltipParts: string[] = [];
  if (lastSyncAt) tooltipParts.push(`Last push: ${format(lastSyncAt, 'MMM d, HH:mm:ss')}`);
  if (status) {
    tooltipParts.push(`Records received: ${status.received}`);
    tooltipParts.push(`Inserted: ${status.inserted} · Updated: ${status.updated} · Unchanged: ${status.unchanged}`);
    if (status.unmatchedUsers > 0) tooltipParts.push(`Unmatched users: ${status.unmatchedUsers}`);
  }

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${wrapColor}`}
      title={tooltipParts.join('\n') || 'No sync data yet'}
    >
      <Fingerprint className="h-3.5 w-3.5" />
      <span className={`h-2 w-2 rounded-full ${dotColor} ${tone === 'live' ? 'animate-pulse' : ''}`} />
      <span className="font-medium">{label}</span>
      {ageLabel && <span className="text-current/70">· {ageLabel}</span>}
    </div>
  );
}
