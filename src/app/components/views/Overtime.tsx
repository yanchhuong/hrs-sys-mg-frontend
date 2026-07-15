import { useMemo, useState, useEffect } from 'react';
import { mockOTRequests, mockEmployees } from '../../data/mockData';
import { OTRequest } from '../../types/hrms';
import { Employee } from '../../types/hrms';
import * as overtimeApi from '../../api/overtime';
import * as employeesApi from '../../api/employees';
import * as departmentsApi from '../../api/departments';
import * as settingsApi from '../../api/settings';
import { USE_MOCKS } from '../../api/client';
import { makeDeptName } from '../../utils/deptName';
import { useTeamScope, ScopeMode } from '../../hooks/useTeamScope';
import {
  otOverlapsNightWindow, effectiveOtMultiplier,
  splitOtRequestByDay, defaultDayTypeRateFor, computeOtPay, isDateWeekend,
  detectOtRule,
} from '../../utils/otRates';
import { useDateFormat } from '../../context/DateFormatContext';
import { ScopePicker } from '../common/ScopePicker';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { DateRangeFilter } from '../common/DateRangeFilter';
import { EmployeeCell } from '../common/EmployeeCell';
import { Plus, CalendarIcon, Check, X, Search, Timer as TimerIcon, Moon, Pencil, Lock, Download, Upload } from 'lucide-react';
import { exportListToExcel } from '../../utils/excelExport';
import { BulkUploadOtDialog } from '../common/BulkUploadOtDialog';
import { useAuth } from '../../context/AuthContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { formatMoney } from '../../utils/format';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useI18n } from '../../i18n/I18nContext';

// Adapts a backend OtRequest to the front-end OTRequest shape used by the table.
// `isWeekend`/`isHoliday` are not currently provided by the backend DTO — we
// derive `isWeekend` locally from the date and default `isHoliday` to false so
// the rate badge still renders.
function adaptApiOt(o: overtimeApi.OtRequest): OTRequest {
  const d = o.date ? new Date(o.date) : null;
  const dow = d && !Number.isNaN(d.getTime()) ? d.getDay() : -1;
  return {
    id: o.id,
    employeeId: o.employeeId,
    date: o.date,
    // Backend doesn't persist the time range; show "—" via the row fallback.
    startHour: o.startHour ?? '',
    endHour: o.endHour ?? '',
    hours: o.hours,
    reason: o.reason ?? '',
    status: o.status,
    // Backend's field is `requestedAt`. Fall back to `submittedAt` only so old
    // mock fixtures with the legacy field name still render.
    requestedAt: o.requestedAt ?? (o as { submittedAt?: string }).submittedAt ?? new Date().toISOString(),
    approvedBy: o.approvedById ?? undefined,
    approvedAt: o.approvedAt ?? undefined,
    isWeekend: dow === 0 || dow === 6,
    isHoliday: false,
    payrollBatchSubject: o.payrollBatchSubject ?? null,
  };
}

// Adapts a backend Employee to the front-end Employee shape. Mirrors the
// helper in Attendance.tsx — `department` carries the departmentId UUID in
// live mode; the component resolves it via the loaded departments list.
function adaptApiEmployee(e: employeesApi.Employee): Employee {
  return {
    // empNo is the human-readable id (e.g. "1003"); the backend UUID lives
    // on `apiId`. Other pages follow this convention so EmployeeCell falls
    // back to the empNo subtitle and the Manager/Lead resolver works.
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

export function Overtime() {
  const { t } = useI18n();
  const { formatDate, formatDateTime } = useDateFormat();
  const { canCreate, canUpdate, canDelete } = useAuth();
  // "Full OT permission AND see all employees" — only surface bulk upload
  // to operators who can legitimately file / edit / delete OT for any
  // employee in the tenant. Employees / leaders scoped to their reports
  // never see this button.
  const canBulkUploadOt =
    canCreate('overtime') && canUpdate('overtime') && canDelete('overtime');
  const [bulkOpen, setBulkOpen] = useState(false);
  const {
    role,
    isAdmin,
    isEmployee,
    isManager,
    isTenantWide,
    showScopePicker,
    matchesScope,
    canApproveFor: canApproveOTOf,
  } = useTeamScope();
  /** Admin-only day-type override for the Request OT dialog. `null` =
   *  use the auto-detected rule (driven by date + holiday calendar). */
  const [reqOtDayTypeOverride, setReqOtDayTypeOverride] = useState<'workday' | 'weekend' | 'holiday' | null>(null);
  /** Admin-only manual rate override (V62). String to allow partial
   *  entry; empty = use auto-detected rate. */
  const [reqOtRateOverride, setReqOtRateOverride] = useState<string>('');

  /** State for the admin "Edit OT row" dialog. `null` = closed. */
  const [editingOt, setEditingOt] = useState<overtimeApi.OtRequest | null>(null);
  const [editOtRowStartHour, setEditOtRowStartHour] = useState('');
  const [editOtRowEndHour, setEditOtRowEndHour] = useState('');
  const [editOtRowDayType, setEditOtRowDayType] = useState<'auto' | 'workday' | 'weekend' | 'holiday'>('auto');
  const [editOtRowRateOverride, setEditOtRowRateOverride] = useState<string>('');
  const [editOtRowSaving, setEditOtRowSaving] = useState(false);
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  /** Submit-dialog End Date. Auto-bumps to selectedDate+1 when the picked
   *  endHour wraps past midnight (endHour <= startHour); HR can still
   *  override it manually for unusual cases. */
  const [selectedEndDate, setSelectedEndDate] = useState<Date>(new Date());
  const [startHour, setStartHour] = useState('');
  const [endHour, setEndHour] = useState('');
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'paid'>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'by-request' | 'by-employee'>('by-request');

  // Live data — falls back to the mock arrays when VITE_USE_MOCKS is on.
  const [allOtRequests, setAllOtRequests] = useState<OTRequest[]>(USE_MOCKS ? mockOTRequests : []);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [deptList, setDeptList] = useState<departmentsApi.Department[]>([]);
  const deptName = makeDeptName(deptList, '-');
  // OT multipliers come from Attendance Settings → OT Rules. We load the
  // settings once on mount and read the rates from them. Pre-load with
  // the legal-default 1.5 / 2 / 3 so the first render doesn't show 0× while
  // the network call is in flight.
  const [otRates, setOtRates] = useState<{
    weekday: number; weekend: number; holiday: number;
    nightEnabled: boolean; nightRate: number; nightStart: string; nightEnd: string;
    nightCompose: 'replace' | 'max' | 'multiply';
  }>(
    { weekday: 1.5, weekend: 2, holiday: 3,
      nightEnabled: true, nightRate: 1.3, nightStart: '22:00', nightEnd: '05:00',
      nightCompose: 'replace' },
  );

  const loadOtRequests = async () => {
    if (USE_MOCKS) {
      setAllOtRequests([...mockOTRequests]);
      return;
    }
    try {
      const res = await overtimeApi.list({
        from: dateFilter.start ?? undefined,
        to: dateFilter.end ?? undefined,
        size: 500,
      });
      setAllOtRequests(res.data.map(adaptApiOt));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load OT requests');
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

  /** Pull the tenant's OT rules so the rate / amount columns reflect
   *  whatever Attendance Settings → OT Rules has saved (e.g. 3× for
   *  Holiday). Non-fatal — falls back to the legal-default 1.5/2/3 if
   *  the request fails or the row is missing on a fresh tenant. */
  const loadOtSettings = async () => {
    if (USE_MOCKS) return;
    try {
      const s = await settingsApi.getOtSettings();
      // Prefer the nested workdayRule.rate / etc. (what the OT Rules
      // editor binds to) but fall back to the top-level weekdayRate /
      // weekendRate / holidayRate so older rows still work.
      const nested = (k: keyof settingsApi.OtSettings): number | undefined => {
        const v = (s[k] as Record<string, unknown> | undefined)?.rate;
        return typeof v === 'number' && v > 0 ? v : undefined;
      };
      setOtRates({
        // Parens required: ES2020 forbids mixing `??` with `||` without
        // explicit grouping (Babel raises a parse error).
        weekday: nested('workdayRule') ?? (Number(s.weekdayRate) || 1.5),
        weekend: nested('weekendRule') ?? (Number(s.weekendRate) || 2),
        holiday: nested('holidayRule') ?? (Number(s.holidayRate) || 3),
        // Night-work overlay (V58). Flat columns, not nested in a JSON
        // blob — fall back to the Cambodian Labour Law defaults so a
        // legacy ot_settings row still drives the rate sensibly.
        nightEnabled: s.nightEnabled ?? true,
        nightRate:    Number(s.nightRate)   || 1.3,
        nightStart:   (s.nightStartTime ?? '22:00').slice(0, 5),
        nightEnd:     (s.nightEndTime   ?? '05:00').slice(0, 5),
        nightCompose: (s.nightCompose === 'max' || s.nightCompose === 'multiply' || s.nightCompose === 'replace')
          ? s.nightCompose
          : 'replace',
      });
    } catch (err) {
      console.warn('Could not load OT settings — using default 1.5 / 2 / 3 rates', err);
    }
  };

  // Initial load on mount.
  useEffect(() => {
    void loadEmployees();
    void loadDepartments();
    void loadOtRequests();
    void loadOtSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload OT requests when the date range changes (live mode only — mock data
  // is already loaded and filtered client-side).
  useEffect(() => {
    if (USE_MOCKS) return;
    void loadOtRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter.start, dateFilter.end]);

  const handleDateFilterChange = (startDate: string | null, endDate: string | null) => {
    setDateFilter({ start: startDate, end: endDate });
  };

  // Admin sees the whole tenant. Manager / employee are scoped to self + direct
  // reports, then narrowed by the ScopePicker (`all` / `mine` / `team`).
  // Pass the live employees roster so a Manager's "self + direct reports"
  // set resolves from real data (mockEmployees doesn't have the live UUIDs).
  let otRequests = isTenantWide
    ? allOtRequests
    : allOtRequests.filter(req => matchesScope(req.employeeId, scopeMode, employees));

  // Apply date filter
  if (dateFilter.start || dateFilter.end) {
    otRequests = otRequests.filter(req => {
      const reqDate = parseISO(req.date);
      if (dateFilter.start && dateFilter.end) {
        return isWithinInterval(reqDate, {
          start: parseISO(dateFilter.start),
          end: parseISO(dateFilter.end),
        });
      } else if (dateFilter.start) {
        return reqDate >= parseISO(dateFilter.start);
      } else if (dateFilter.end) {
        return reqDate <= parseISO(dateFilter.end);
      }
      return true;
    });
  }

  // Apply keyword search against employee name/ID/dept and the request reason.
  const kw = search.trim().toLowerCase();
  if (kw) {
    otRequests = otRequests.filter(req => {
      const emp = employees.find(e => e.id === req.employeeId || (e as any).apiId === req.employeeId);
      const hay = `${emp?.name ?? ''} ${emp?.id ?? ''} ${deptName(emp?.department)} ${req.reason ?? ''}`.toLowerCase();
      return hay.includes(kw);
    });
  }

  const pendingRequests = otRequests.filter(req => req.status === 'pending');
  const statusCounts = {
    all: otRequests.length,
    pending: pendingRequests.length,
    approved: otRequests.filter(req => req.status === 'approved').length,
    rejected: otRequests.filter(req => req.status === 'rejected').length,
  };

  const statusFiltered = statusFilter === 'all'
    ? otRequests
    : otRequests.filter(req => req.status === statusFilter);

  // Auto-compute hours from start/end whenever both are valid times.
  useEffect(() => {
    if (!startHour || !endHour) return;
    const [sh, sm] = startHour.split(':').map(Number);
    const [eh, em] = endHour.split(':').map(Number);
    if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return;
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) mins += 24 * 60; // crosses midnight
    setHours((mins / 60).toFixed(2).replace(/\.00$/, ''));
  }, [startHour, endHour]);

  // Cross-midnight detection — when endHour wraps to a non-positive
  // delta, the end belongs to the next calendar day. We auto-bump
  // selectedEndDate to selectedDate + 1 so HR doesn't have to remember.
  // Keeping in sync with selectedDate too so swapping the start date
  // drags the end date along.
  useEffect(() => {
    if (!startHour || !endHour) {
      // Without hours yet, end date mirrors start date.
      setSelectedEndDate(selectedDate);
      return;
    }
    const [sh, sm] = startHour.split(':').map(Number);
    const [eh, em] = endHour.split(':').map(Number);
    if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return;
    const wraps = (eh * 60 + em) <= (sh * 60 + sm);
    const next = new Date(selectedDate);
    if (wraps) next.setDate(next.getDate() + 1);
    setSelectedEndDate(next);
  }, [startHour, endHour, selectedDate]);

  const handleSubmitRequest = async () => {
    if (!startHour || !endHour) {
      toast.error('Please provide start and end hours');
      return;
    }
    if (!hours || Number(hours) <= 0) {
      toast.error('End hour must be after start hour');
      return;
    }
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const endDateStr = format(selectedEndDate, 'yyyy-MM-dd');
    if (USE_MOCKS) {
      toast.success('OT request submitted successfully');
      setDialogOpen(false);
      setStartHour('');
      setEndHour('');
      setHours('');
      setReason('');
      setReqOtDayTypeOverride(null);
      setReqOtRateOverride('');
      return;
    }
    // Hours is the canonical value the backend persists. Parse from the
    // (auto-computed) hours state — already shown in the dialog under
    // "Hours (auto)". Reject anything ≤ 0 so the user gets a clear error
    // before the round-trip rather than a generic "Validation failed".
    const hoursNum = Number(hours);
    if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
      toast.error('Hours must be greater than 0 — check Start / End hour');
      return;
    }
    try {
      await overtimeApi.create({
        date: dateStr,
        endDate: endDateStr,
        hours: hoursNum,
        startHour,
        endHour,
        dayType: reqOtDayTypeOverride ?? undefined,
        rateOverride: (() => {
          const n = Number(reqOtRateOverride);
          return Number.isFinite(n) && n > 0 ? n : undefined;
        })(),
        reason: reason.trim(),
      });
      toast.success('OT request submitted successfully');
      setDialogOpen(false);
      setStartHour('');
      setEndHour('');
      setHours('');
      setReason('');
      setReqOtDayTypeOverride(null);
      setReqOtRateOverride('');
      await loadOtRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit OT request');
    }
  };

  const handleApprove = async (id: string) => {
    if (USE_MOCKS) {
      toast.success('OT request approved');
      return;
    }
    try {
      await overtimeApi.approve(id);
      toast.success('OT request approved');
      await loadOtRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve OT request');
    }
  };

  const handleReject = async (id: string) => {
    if (USE_MOCKS) {
      toast.error('OT request rejected');
      return;
    }
    try {
      await overtimeApi.reject(id);
      toast.success('OT request rejected');
      await loadOtRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject OT request');
    }
  };

  /**
   * Open the admin "Edit OT row" dialog seeded from the picked row.
   * Day-type starts at 'auto' (no override) — admin can pick a different
   * bucket from the Select to force it. Custom rate seeds from the row's
   * persisted rateOverride; empty = follow the rule engine.
   */
  const openEditOtRow = (req: overtimeApi.OtRequest) => {
    setEditingOt(req);
    setEditOtRowStartHour(req.startHour ?? '');
    setEditOtRowEndHour(req.endHour ?? '');
    setEditOtRowDayType('auto');
    setEditOtRowRateOverride(
      typeof req.rateOverride === 'number' && req.rateOverride > 0
        ? String(req.rateOverride)
        : '',
    );
  };

  const handleSaveOtRowEdit = async () => {
    if (!editingOt) return;
    // Recompute hours from the picked start/end when both are filled.
    // Falls back to the row's existing hours when the admin clears the
    // hour inputs (edge case — rare but lets HR drop the labels without
    // zeroing the pay).
    let hoursNum: number | undefined;
    if (editOtRowStartHour && editOtRowEndHour) {
      const [sh, sm] = editOtRowStartHour.split(':').map(n => Number(n) || 0);
      const [eh, em] = editOtRowEndHour.split(':').map(n => Number(n) || 0);
      let mins = (eh * 60 + em) - (sh * 60 + sm);
      if (mins <= 0) mins += 24 * 60;
      hoursNum = Math.round((mins / 60) * 100) / 100;
    }
    // Send 0 to explicitly clear the override when the input is empty
    // — backend interprets 0 as "drop the override". Positive value
    // pins the rate; null leaves it untouched (we never send null).
    const rateNum = editOtRowRateOverride.trim() === ''
      ? 0
      : Number(editOtRowRateOverride);
    const body: overtimeApi.UpdateOtRequest = {
      startHour: editOtRowStartHour || undefined,
      endHour: editOtRowEndHour || undefined,
      hours: hoursNum,
      dayType: editOtRowDayType === 'auto' ? undefined : editOtRowDayType,
      rateOverride: Number.isFinite(rateNum) ? rateNum : undefined,
    };
    if (USE_MOCKS) {
      toast.success('OT row updated');
      setEditingOt(null);
      return;
    }
    setEditOtRowSaving(true);
    try {
      await overtimeApi.update(editingOt.id, body);
      toast.success('OT row updated');
      setEditingOt(null);
      await loadOtRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update OT row');
    } finally {
      setEditOtRowSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
      approved: 'bg-green-100 text-green-800 hover:bg-green-100',
      rejected: 'bg-red-100 text-red-800 hover:bg-red-100',
      paid: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
    };
    return variants[status] || 'bg-gray-100 text-gray-800 hover:bg-gray-100';
  };

  /**
   * Bucket an OT request by calendar day so each day gets its own
   * day-type + night overlay (V59). Same-day OT collapses to one bucket;
   * a cross-midnight request splits at 24:00.
   */
  const segmentsFor = (req: { date?: string; endDate?: string | null; startHour?: string; endHour?: string; hours: number }) =>
    splitOtRequestByDay({
      startDate: req.date ?? '',
      startHour: req.startHour ?? '',
      endDate:   req.endDate ?? req.date ?? '',
      endHour:   req.endHour ?? '',
      totalHours: Number(req.hours) || 0,
    });

  /** Day-type rate function for one request. Honours the row's
   *  isHoliday flag on the START date; falls back to day-of-week
   *  weekend detection on each segment so a Fri→Sat shift correctly
   *  picks up the Saturday weekend rate for the second bucket. */
  const dayTypeRateFor = (req: { date?: string; isWeekend?: boolean; isHoliday?: boolean }) =>
    defaultDayTypeRateFor({
      weekdayRate: otRates.weekday,
      weekendRate: otRates.weekend,
      holidayRate: otRates.holiday,
      // Treat the row's isHoliday flag as evidence the START date is a
      // holiday — apply that rate on its segment specifically.
      holidayDates: req.isHoliday && req.date ? new Set([req.date]) : undefined,
    });

  /**
   * Headline rate badge for the table. We show the highest effective
   * rate across the request's day buckets so admins see at a glance
   * "Saturday-night → 2.0×". The actual pay below uses the per-bucket
   * sum, so the displayed badge can read lower than the pay implies on
   * mixed-day OT — the (i) tooltip explains the breakdown.
   */
  const calculateOTRate = (req: {
    date?: string; endDate?: string | null;
    isWeekend?: boolean; isHoliday?: boolean;
    startHour?: string; endHour?: string;
    hours: number;
  }): string => {
    const segs = segmentsFor(req);
    const rateOf = dayTypeRateFor(req);
    // Row-level rate override (V62) wins outright — no need to walk
    // segments. Otherwise pick the highest segment rate as the badge
    // headline so HR can see the top-billed bucket at a glance.
    const rowOverride = (req as { rateOverride?: number | null }).rateOverride;
    if (typeof rowOverride === 'number' && rowOverride > 0) {
      return `${rowOverride}x`;
    }
    let max = 0;
    for (const s of segs) {
      const isNight = otOverlapsNightWindow(s.startHour, s.endHour, otRates.nightStart, otRates.nightEnd);
      const m = effectiveOtMultiplier({
        dayTypeRate: rateOf(s),
        nightEnabled: otRates.nightEnabled,
        nightRate: otRates.nightRate,
        isNight,
        nightCompose: otRates.nightCompose,
      });
      if (m > max) max = m;
    }
    return `${max || otRates.weekday}x`;
  };

  /**
   * OT pay amount for a single request — per-day bucketed so a
   * Fri→Sat night shift bills the Friday segment at the weekday rate
   * and the Saturday segment at the weekend rate, with the night
   * overlay layered on each bucket independently. Hourly = base / 160
   * (20 working days × 8 hours).
   */
  const calculateOTAmount = (
    baseSalary: number | undefined,
    req: {
      date?: string; endDate?: string | null;
      isWeekend?: boolean; isHoliday?: boolean;
      startHour?: string; endHour?: string;
      hours: number;
    },
  ): number => {
    if (!baseSalary) return 0;
    return computeOtPay({
      hourlyWage: baseSalary / 160,
      segments: segmentsFor(req),
      dayTypeRateFor: dayTypeRateFor(req),
      nightEnabled: otRates.nightEnabled,
      nightRate: otRates.nightRate,
      nightStart: otRates.nightStart,
      nightEnd: otRates.nightEnd,
      nightCompose: otRates.nightCompose,
      rateOverride: (req as { rateOverride?: number | null }).rateOverride ?? undefined,
    });
  };

  // Pending first, then newest by requested date
  const sortedRequests = [...statusFiltered].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
  });

  const overtimePagination = usePagination(sortedRequests, 10);

  useEffect(() => {
    overtimePagination.resetPage();
  }, [dateFilter, statusFilter, scopeMode, search]);

  // Group-by-employee aggregation. Only approved requests count toward pay —
  // pending/rejected amounts would mislead admins reconciling payroll.
  const byEmployeeRows = useMemo(() => {
    const approved = otRequests.filter(r => r.status === 'approved');
    const map = new Map<string, { workday: number; weekend: number; holiday: number }>();
    approved.forEach(req => {
      const entry = map.get(req.employeeId) ?? { workday: 0, weekend: 0, holiday: 0 };
      if (req.isHoliday) entry.holiday += req.hours;
      else if (req.isWeekend) entry.weekend += req.hours;
      else entry.workday += req.hours;
      map.set(req.employeeId, entry);
    });
    return Array.from(map.entries()).map(([employeeId, hours]) => {
      const employee = mockEmployees.find(e => e.id === employeeId);
      const hourlyRate = (employee?.baseSalary ?? 0) / 160; // 160 hrs/month baseline
      const totalAmount =
        hourlyRate * (hours.workday * 1 + hours.weekend * 1.5 + hours.holiday * 2);
      return { employeeId, employee, ...hours, hourlyRate, totalAmount };
    }).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [otRequests]);

  const byEmployeePagination = usePagination(byEmployeeRows, 10);

  // Excel export — mirrors the on-screen columns and honours the current
  // filters (date range, keyword search, scope, and the active status tab).
  const handleExportExcel = () => {
    exportListToExcel({
      filename: 'Overtime',
      sheetName: 'Overtime',
      columns: [
        { header: 'Employee ID', value: r => employees.find(e => e.id === r.employeeId || (e as any).apiId === r.employeeId)?.id ?? r.employeeId },
        { header: 'Employee', value: r => employees.find(e => e.id === r.employeeId || (e as any).apiId === r.employeeId)?.name ?? '-' },
        { header: 'Department', value: r => deptName(employees.find(e => e.id === r.employeeId || (e as any).apiId === r.employeeId)?.department) },
        { header: 'Date', value: r => r.date },
        { header: 'End Date', value: r => r.endDate ?? '' },
        { header: 'Start', value: r => r.startHour ?? '' },
        { header: 'End', value: r => r.endHour ?? '' },
        { header: 'Hours', value: r => r.hours },
        { header: 'Rate', value: r => calculateOTRate(r) },
        { header: 'Amount (USD)', value: r => {
          const emp = employees.find(e => e.id === r.employeeId || (e as any).apiId === r.employeeId);
          const amt = calculateOTAmount(emp?.baseSalary, r);
          return amt > 0 ? Number(amt.toFixed(2)) : '';
        } },
        { header: 'Reason', value: r => r.reason ?? '' },
        { header: 'Status', value: r => r.status },
        { header: 'Requested At', value: r => r.requestedAt ?? '' },
        { header: 'Submitted By', value: r => r.submittedByName ?? '' },
        { header: 'Approved By', value: r => r.approvedByName ?? '' },
      ],
      rows: statusFiltered,
    });
  };

  useEffect(() => {
    byEmployeePagination.resetPage();
  }, [dateFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('page.overtime.title')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showScopePicker && <ScopePicker value={scopeMode} onChange={setScopeMode} />}
          <DateRangeFilter onFilterChange={handleDateFilterChange} />
          <Button
            variant="outline"
            size="icon"
            onClick={handleExportExcel}
            disabled={statusFiltered.length === 0}
            title="Download Excel"
          >
            <Download className="h-4 w-4" />
          </Button>
          {canBulkUploadOt && isTenantWide && (
            <Button
              variant="outline"
              onClick={() => setBulkOpen(true)}
              title="Bulk upload overtime from an Excel workbook"
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Bulk Upload
            </Button>
          )}
        {isEmployee && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Request OT
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Submit Overtime Request</DialogTitle>
                <DialogDescription>Fill in the details for your overtime request</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formatDate(selectedDate)}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={(date) => date && setSelectedDate(date)}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      End Date
                      {selectedEndDate > selectedDate && (
                        <Badge variant="outline" className="px-1 py-0 text-[10px] border-indigo-300 text-indigo-700 bg-indigo-50">
                          cross-date
                        </Badge>
                      )}
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formatDate(selectedEndDate)}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={selectedEndDate}
                          onSelect={(date) => date && setSelectedEndDate(date)}
                          disabled={(d) => d < selectedDate}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="ot-start">Start Hour</Label>
                    <Input
                      id="ot-start"
                      type="time"
                      value={startHour}
                      onChange={(e) => setStartHour(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ot-end">End Hour</Label>
                    <Input
                      id="ot-end"
                      type="time"
                      value={endHour}
                      onChange={(e) => setEndHour(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hours">Hours <span className="text-xs text-gray-400">(auto)</span></Label>
                  <Input
                    id="hours"
                    type="number"
                    step="0.25"
                    placeholder="e.g., 2"
                    value={hours}
                    readOnly
                    className="bg-gray-50"
                  />
                  {startHour && endHour && Number(hours) > 0 && (() => {
                    const crosses = endHour <= startHour;
                    const isNight = otOverlapsNightWindow(startHour, endHour, otRates.nightStart, otRates.nightEnd);
                    return (
                      <div className="space-y-1">
                        <p className="text-[11px] text-gray-500">
                          {startHour} – {endHour}
                          {crosses && <span className="text-indigo-700"> (next day)</span>}
                          {' = '}{hours}h
                        </p>
                        {otRates.nightEnabled && isNight && (
                          <p className="inline-flex items-center gap-1 text-[11px] text-indigo-700">
                            <Moon className="h-3 w-3" />
                            Overlaps {otRates.nightStart}–{otRates.nightEnd} → night rate ({otRates.nightRate}×) replaces the day-type rate.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason</Label>
                  <Textarea
                    id="reason"
                    placeholder="Explain why overtime is needed..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Rule-type badge — Admin can override the day-type
                    bucket via the Select; Manager / Employee see the
                    auto-detected rule as read-only. Holiday detection
                    is admin-driven here (the dialog doesn't load the
                    tenant's holiday calendar); pick "Holiday" manually
                    if filing OT for a known holiday. */}
                {(() => {
                  const startStr = format(selectedDate, 'yyyy-MM-dd');
                  const rateOverrideNum = (() => {
                    const n = Number(reqOtRateOverride);
                    return Number.isFinite(n) && n > 0 ? n : undefined;
                  })();
                  const rule = detectOtRule({
                    date: startStr,
                    startHour,
                    endHour,
                    weekdayRate: otRates.weekday,
                    weekendRate: otRates.weekend,
                    holidayRate: otRates.holiday,
                    nightEnabled: otRates.nightEnabled,
                    nightRate: otRates.nightRate,
                    nightStart: otRates.nightStart,
                    nightEnd: otRates.nightEnd,
                    nightCompose: otRates.nightCompose,
                    override: reqOtDayTypeOverride ?? undefined,
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
                        {reqOtDayTypeOverride && (
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
                      {isAdmin ? (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-gray-500">Override day-type</Label>
                            <Select
                              value={reqOtDayTypeOverride ?? 'auto'}
                              onValueChange={(v) =>
                                setReqOtDayTypeOverride(v === 'auto' ? null : (v as 'workday' | 'weekend' | 'holiday'))
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
                            <Label className="text-[11px] text-gray-500">Custom rate</Label>
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                value={reqOtRateOverride}
                                onChange={(e) => setReqOtRateOverride(e.target.value)}
                                placeholder={String(rule.effectiveRate)}
                                className="h-8"
                              />
                              <span className="text-sm font-medium text-indigo-600">×</span>
                              {reqOtRateOverride && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() => setReqOtRateOverride('')}
                                >
                                  Clear
                                </Button>
                              )}
                            </div>
                          </div>
                          <p className="text-[11px] text-gray-500 col-span-2">
                            Leave Custom Rate blank to follow the OT settings. Any positive value skips the day-type + night composition for this row only. Night overlay is auto-detected from the configured {otRates.nightStart}–{otRates.nightEnd} window.
                          </p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-500">
                          Rule is auto-detected from the date and OT settings — only admins can override.
                        </p>
                      )}
                    </div>
                  );
                })()}

                <Button onClick={handleSubmitRequest} className="w-full">
                  Submit Request
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {/* OT summary cards — surfaced above the listing for quick context.
          Employee-only since admins / managers see the same numbers via
          the by-employee view + Reports. */}
      {isEmployee && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <TimerIcon className="h-5 w-5 text-gray-600" />
                <span className="text-2xl font-bold text-gray-700">
                  {otRequests
                    .filter(req => req.status === 'approved')
                    .reduce((sum, req) => sum + req.hours, 0)}h
                </span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Total OT Hours</p>
              <p className="text-[11px] text-gray-500 truncate">Approved this period</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <TimerIcon className="h-5 w-5 text-yellow-600" />
                <span className="text-2xl font-bold text-yellow-600">{pendingRequests.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Pending</p>
              <p className="text-[11px] text-gray-500 truncate">Awaiting approval</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <TimerIcon className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold text-green-600">
                  {otRequests.filter(req => req.status === 'approved').length}
                </span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Approved</p>
              <p className="text-[11px] text-gray-500 truncate">Requests approved</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          {/* Tabs + search share a single row, mirroring AllLeave.
              The by-employee tab swaps the search for the rate hint
              since that view doesn't filter by keyword. */}
          <div className="flex items-center gap-3 sm:justify-between sm:flex-wrap overflow-x-auto sm:overflow-visible">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
              <TabsList>
                <TabsTrigger value="by-request">By Request</TabsTrigger>
                <TabsTrigger value="by-employee">By Employee</TabsTrigger>
              </TabsList>
            </Tabs>
            {viewMode === 'by-request' && (
              <div className="relative w-40 sm:w-56 ml-auto">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
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
            )}
          </div>
          {viewMode === 'by-employee' && (
            <p className="text-xs text-gray-500 mt-2">
              Totals from approved OT only. Rates: workday ×1, weekend ×1.5, holiday ×2. Hourly rate = base salary ÷ 160.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {viewMode === 'by-request' ? (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Dept/Group</TableHead>
                <TableHead>Leader</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-center">Start</TableHead>
                <TableHead className="text-center">End</TableHead>
                <TableHead className="text-center">Hours</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested At</TableHead>
                <TableHead>Submitted By</TableHead>
                <TableHead>Approved By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overtimePagination.paginatedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-sm text-gray-400 py-10">
                    No OT requests in this status.
                  </TableCell>
                </TableRow>
              )}
              {overtimePagination.paginatedItems.map((request) => {
                const employee = employees.find(e => e.id === request.employeeId || (e as any).apiId === request.employeeId);
                const leader = employee?.managerId
                  ? employees.find(e => e.id === employee.managerId || (e as any).apiId === employee.managerId)
                  : null;
                // The backend resolves the approver's display name on
                // the OT DTO (`approvedByName`). Front-end lookups would
                // miss because `approvedById` is a USER UUID, not an
                // employee id, and the row data doesn't include users.
                const approverName = request.approvedByName ?? null;
                const isPending = request.status === 'pending';
                const canActOnThis = isPending && canApproveOTOf(request.employeeId, employees);
                return (
                  <TableRow key={request.id} className={isPending ? 'bg-yellow-50/50' : ''}>
                    <TableCell>
                      <EmployeeCell employee={employee} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {employee?.department
                        ? <Badge variant="outline" className="font-normal">{deptName(employee.department)}</Badge>
                        : <span className="text-gray-400">—</span>}
                    </TableCell>
                    <TableCell>
                      {leader ? (
                        <EmployeeCell employee={leader} subtitle={leader.position} />
                      ) : (
                        <span className="text-xs text-gray-400">No leader assigned</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(request.date)}</TableCell>
                    <TableCell className="text-center text-sm">
                      {request.startHour || <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {request.endHour
                        ? (() => {
                            // Cross-date OT: prefer the explicit endDate
                            // (V59); fall back to "endHour <= startHour"
                            // for legacy rows submitted before the column
                            // existed.
                            const crosses = request.endDate && request.date && request.endDate !== request.date
                              ? true
                              : (!!request.startHour && request.endHour <= request.startHour);
                            return crosses ? (
                              <span className="inline-flex items-center gap-1">
                                {request.endHour}
                                <Badge variant="outline" className="px-1 py-0 text-[10px] border-indigo-300 text-indigo-700 bg-indigo-50">+1d</Badge>
                              </span>
                            ) : request.endHour;
                          })()
                        : <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-center">{request.hours}h</TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-1.5">
                        <Badge variant="outline">
                          {calculateOTRate(request)}
                        </Badge>
                        {(() => {
                          const segs = segmentsFor(request);
                          const isCrossDate = segs.length > 1;
                          const hasNight = otRates.nightEnabled && segs.some(s =>
                            otOverlapsNightWindow(s.startHour, s.endHour, otRates.nightStart, otRates.nightEnd));
                          // Mixed Fri+Sat or weekday+holiday tooltip — show the
                          // per-day buckets so HR can audit the blended pay.
                          if (!isCrossDate && !hasNight) return null;
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                                  <Moon className="h-3 w-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs max-w-xs">
                                <p className="font-medium mb-1">
                                  {isCrossDate ? 'Cross-date OT' : 'Night work'}
                                </p>
                                <ul className="space-y-0.5">
                                  {segs.map((s, i) => {
                                    const dayKind = (request.isHoliday && s.date === request.date)
                                      ? 'holiday'
                                      : isDateWeekend(s.date) ? 'weekend' : 'weekday';
                                    const isNight = otOverlapsNightWindow(s.startHour, s.endHour, otRates.nightStart, otRates.nightEnd);
                                    return (
                                      <li key={i}>
                                        {s.date} {s.startHour}–{s.endHour}: {s.hours}h · {dayKind}
                                        {isNight && otRates.nightEnabled ? ' + night' : ''}
                                      </li>
                                    );
                                  })}
                                </ul>
                                <p className="mt-1.5 opacity-80">
                                  Buckets whose hours overlap the night window use the night rate ({otRates.nightRate}×); others use the day-type rate above.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {(() => {
                        const amount = calculateOTAmount(employee?.baseSalary, request);
                        return amount > 0
                          ? `$${formatMoney(amount)}`
                          : <span className="text-gray-300">—</span>;
                      })()}
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={request.reason}>{request.reason}</TableCell>
                    <TableCell>
                      <Badge className={getStatusBadge(request.status)}>
                        {request.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatDateTime(request.requestedAt)}</TableCell>
                    <TableCell className="text-sm">{request.submittedByName || '-'}</TableCell>
                    <TableCell className="text-sm">{approverName || '-'}</TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        // Paid = locked: row has been folded into an
                        // approved payroll batch. All admin/leader
                        // actions hide until the batch is rejected. The
                        // batch subject is surfaced as the slip ref.
                        const isPaid = request.status === 'paid';
                        if (isPaid) {
                          const slipRef = request.payrollBatchSubject;
                          return (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-blue-700 bg-blue-50 border-blue-200 max-w-[180px] truncate"
                              title={slipRef
                                ? `Paid via ${slipRef} — reject the batch to edit this row.`
                                : 'OT row is locked — folded into a payroll batch. Reject the batch to edit.'}
                            >
                              <Lock className="h-3 w-3 mr-1 shrink-0" />
                              <span className="truncate">{slipRef ? `Paid · ${slipRef}` : 'Paid'}</span>
                            </Badge>
                          );
                        }
                        return (
                          <div className="flex items-center justify-end gap-1.5">
                            {isAdmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => openEditOtRow(request)}
                                title="Edit start/end hour and rate"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canActOnThis ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800"
                                  onClick={() => handleApprove(request.id)}
                                >
                                  <Check className="h-3.5 w-3.5 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50 hover:text-red-800"
                                  onClick={() => handleReject(request.id)}
                                >
                                  <X className="h-3.5 w-3.5 mr-1" />
                                  Reject
                                </Button>
                              </>
                            ) : isPending && role !== 'admin' ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-gray-500"
                                title="Only this employee's direct leader can approve."
                              >
                                <X className="h-3 w-3 mr-1" />
                                {isManager ? 'Not your team' : 'Awaiting leader'}
                              </Badge>
                            ) : !isAdmin ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={overtimePagination.currentPage}
            totalPages={overtimePagination.totalPages}
            onPageChange={overtimePagination.goToPage}
            startIndex={overtimePagination.startIndex}
            endIndex={overtimePagination.endIndex}
            totalItems={overtimePagination.totalItems}
          />
          </>
          ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Workday OT (×1)</TableHead>
                <TableHead className="text-right">Weekend OT (×1.5)</TableHead>
                <TableHead className="text-right">Holiday OT (×2)</TableHead>
                <TableHead className="text-right">Total Hours</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byEmployeePagination.paginatedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-gray-400 py-10">
                    No approved OT to aggregate.
                  </TableCell>
                </TableRow>
              )}
              {byEmployeePagination.paginatedItems.map((row) => {
                const totalHours = row.workday + row.weekend + row.holiday;
                return (
                  <TableRow key={row.employeeId}>
                    <TableCell>
                      <EmployeeCell employee={row.employee} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.workday.toFixed(1)}h</TableCell>
                    <TableCell className="text-right tabular-nums">{row.weekend.toFixed(1)}h</TableCell>
                    <TableCell className="text-right tabular-nums">{row.holiday.toFixed(1)}h</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{totalHours.toFixed(1)}h</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-green-700">
                      ${formatMoney(row.totalAmount)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {byEmployeePagination.paginatedItems.length > 0 && (() => {
                const all = byEmployeeRows;
                const sumWork = all.reduce((s, r) => s + r.workday, 0);
                const sumWkd  = all.reduce((s, r) => s + r.weekend, 0);
                const sumHol  = all.reduce((s, r) => s + r.holiday, 0);
                const sumAmt  = all.reduce((s, r) => s + r.totalAmount, 0);
                return (
                  <TableRow className="bg-gray-50 font-semibold">
                    <TableCell>Total ({all.length} employee{all.length !== 1 ? 's' : ''})</TableCell>
                    <TableCell className="text-right tabular-nums">{sumWork.toFixed(1)}h</TableCell>
                    <TableCell className="text-right tabular-nums">{sumWkd.toFixed(1)}h</TableCell>
                    <TableCell className="text-right tabular-nums">{sumHol.toFixed(1)}h</TableCell>
                    <TableCell className="text-right tabular-nums">{(sumWork + sumWkd + sumHol).toFixed(1)}h</TableCell>
                    <TableCell className="text-right tabular-nums text-green-700">
                      ${formatMoney(sumAmt)}
                    </TableCell>
                  </TableRow>
                );
              })()}
            </TableBody>
          </Table>
          <Pagination
            currentPage={byEmployeePagination.currentPage}
            totalPages={byEmployeePagination.totalPages}
            onPageChange={byEmployeePagination.goToPage}
            startIndex={byEmployeePagination.startIndex}
            endIndex={byEmployeePagination.endIndex}
            totalItems={byEmployeePagination.totalItems}
          />
          </>
          )}
        </CardContent>
      </Card>

      {/* Admin Edit OT row dialog. Lets HR re-adjust the start/end
          hour, force a day-type bucket, or pin a custom rate after the
          fact — useful when an approved row turns out to need a
          different multiplier (special-bonus shift, negotiated rate).
          Gated to admin via the trigger button + the backend
          PATCH's @PreAuthorize('overtime','update'). */}
      <Dialog open={!!editingOt} onOpenChange={(o) => { if (!o) setEditingOt(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit OT Row</DialogTitle>
            <DialogDescription>
              Adjust the start / end hour, force a day-type bucket, or pin a custom rate. Empty rate falls back to the OT settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Check-In Hour</Label>
                <Input
                  type="time"
                  value={editOtRowStartHour}
                  onChange={(e) => setEditOtRowStartHour(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Check-Out Hour</Label>
                <Input
                  type="time"
                  value={editOtRowEndHour}
                  onChange={(e) => setEditOtRowEndHour(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Override day-type</Label>
                <Select
                  value={editOtRowDayType}
                  onValueChange={(v) => setEditOtRowDayType(v as 'auto' | 'workday' | 'weekend' | 'holiday')}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Keep current</SelectItem>
                    <SelectItem value="workday">Workday</SelectItem>
                    <SelectItem value="weekend">Weekend</SelectItem>
                    <SelectItem value="holiday">Holiday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Custom Rate</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editOtRowRateOverride}
                    onChange={(e) => setEditOtRowRateOverride(e.target.value)}
                    placeholder="e.g. 2.5"
                  />
                  <span className="text-sm font-medium text-indigo-600">×</span>
                </div>
                <p className="text-[11px] text-gray-500">Empty to clear and follow OT settings.</p>
              </div>
            </div>
            {editingOt && editOtRowStartHour && editOtRowEndHour && (() => {
              const [sh, sm] = editOtRowStartHour.split(':').map(n => Number(n) || 0);
              const [eh, em] = editOtRowEndHour.split(':').map(n => Number(n) || 0);
              let mins = (eh * 60 + em) - (sh * 60 + sm);
              const crosses = mins <= 0;
              if (crosses) mins += 24 * 60;
              return (
                <p className="text-[11px] text-gray-500">
                  {editOtRowStartHour} – {editOtRowEndHour}
                  {crosses && <span className="text-indigo-700"> (next day)</span>}
                  {' = '}{(mins / 60).toFixed(2).replace(/\.00$/, '')}h
                </p>
              );
            })()}
            <p className="text-[11px] text-gray-500">
              Changes go through the audit trail; the row's approval status is unchanged.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOt(null)} disabled={editOtRowSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveOtRowEdit} disabled={editOtRowSaving}>
              {editOtRowSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canBulkUploadOt && isTenantWide && (
        <BulkUploadOtDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          employees={employees}
          onImported={() => { void loadOtRequests(); }}
        />
      )}
    </div>
  );
}
