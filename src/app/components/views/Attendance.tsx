import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTeamScope, ScopeMode } from '../../hooks/useTeamScope';
import { ScopePicker } from '../common/ScopePicker';
import { mockAttendance, mockEmployees } from '../../data/mockData';
import { Attendance as AttendanceType, AttendanceStatus, Employee } from '../../types/hrms';
import * as attendanceApi from '../../api/attendance';
import * as employeesApi from '../../api/employees';
import * as departmentsApi from '../../api/departments';
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Clock, CalendarIcon, Upload, FileSpreadsheet, Fingerprint,
  CheckCircle2, XCircle, AlertTriangle, LogIn, LogOut, Users,
  ChevronLeft, ChevronRight, Pencil, Download, AlertCircle, BarChart3,
  Search, X,
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isToday as isTodayFn, addMonths, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { EmployeeCell } from '../common/EmployeeCell';
import { AnnualLeaveSetup } from '../common/AnnualLeaveSetup';
import { useI18n } from '../../i18n/I18nContext';
import {
  loadRule, daysForTenure, tenureYears, loadValuesForYear,
} from '../../utils/annualLeave';

type ViewMode = 'daily' | 'monthly';
type FilterTab = 'all' | 'no_checkin' | 'no_checkout' | 'late' | 'absent' | 'present' | 'leave';

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
// throughout the UI. Morning/noon punches are not modelled on the backend DTO
// yet; we leave those fields undefined so the table renders "--:--".
function adaptApiAttendance(a: attendanceApi.AttendanceEntry): AttendanceType {
  const status = ([
    'present', 'late', 'early_leave', 'absent',
    'no_checkin', 'no_checkout', 'leave',
  ] as const).includes(a.status as AttendanceStatus)
    ? (a.status as AttendanceStatus)
    : 'present';
  return {
    id: a.id,
    employeeId: a.employeeId,
    date: a.date,
    checkIn: a.checkIn ?? '',
    checkOut: a.checkOut ?? undefined,
    workHours: a.hoursWorked,
    otHours: a.overtimeHours,
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
  };
}

export function Attendance() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [dateFrom, setDateFrom] = useState('2026-04-20');
  const [dateTo, setDateTo] = useState('2026-04-20');
  const [monthDate, setMonthDate] = useState(new Date(2026, 3, 1)); // April 2026
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
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
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [fingerprintDialogOpen, setFingerprintDialogOpen] = useState(false);
  const [fpIp, setFpIp] = useState(() => localStorage.getItem('hrms:fp:ip') ?? '192.168.178.243');
  const [fpPort, setFpPort] = useState(() => localStorage.getItem('hrms:fp:port') ?? '80');
  const [fpTesting, setFpTesting] = useState(false);
  const [fpStatus, setFpStatus] = useState<'unknown' | 'reachable' | 'unreachable'>('unknown');
  const [fpLastSyncAt, setFpLastSyncAt] = useState<string | null>(
    () => localStorage.getItem('hrms:fp:lastSyncAt'),
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [leaveDetailEmp, setLeaveDetailEmp] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const isEmployee = currentUser?.role === 'employee';
  const { isTenantWide, matchesScope, showScopePicker } = useTeamScope();
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');

  // Live data — falls back to mock arrays when VITE_USE_MOCKS is on.
  const [attendance, setAttendance] = useState<AttendanceType[]>(USE_MOCKS ? mockAttendance : []);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [deptList, setDeptList] = useState<departmentsApi.Department[]>([]);
  const deptNameById = new Map<string, string>(deptList.map(d => [d.id, d.name]));
  const deptName = (id: string | undefined): string => {
    if (!id) return '-';
    return deptNameById.get(id) ?? id;
  };

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
      setAttendance(rows.map(adaptApiAttendance));
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
      // Non-fatal — department cells fall back to the raw UUID.
      console.warn('Could not load departments', err);
    }
  };

  // Initial load on mount.
  useEffect(() => {
    void loadEmployees();
    void loadDepartments();
    void loadAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload attendance when the date range changes (live mode only — mock data
  // is already loaded and filtered client-side).
  useEffect(() => {
    if (USE_MOCKS) return;
    void loadAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  // Today's records — scoped to self + direct reports for the employee role.
  const todayRecords = useMemo(() => {
    // Range inclusive on both ends. Single-day behaviour is preserved when
    // dateFrom === dateTo (the original experience).
    const rows = attendance.filter(a => {
      if (dateFrom && a.date < dateFrom) return false;
      if (dateTo && a.date > dateTo) return false;
      return true;
    });
    return isTenantWide ? rows : rows.filter(a => matchesScope(a.employeeId, scopeMode));
  }, [attendance, dateFrom, dateTo, isTenantWide, matchesScope, scopeMode]);

  // Roster-driven rows: one row per active employee per day in the range.
  // A day with no attendance record shows a synthetic row marked `absent`
  // with empty punches, which the fingerprint import flow then fills in.
  const dailyRows = useMemo((): AttendanceType[] => {
    const scopedEmployees = employees.filter(
      e => e.status === 'active' && (isTenantWide || matchesScope(e.id, scopeMode)),
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

    const rows: AttendanceType[] = [];
    for (const emp of scopedEmployees) {
      for (const day of days) {
        // Try matching on id and apiId (UUID) — attendance rows from the
        // backend carry the employee UUID, not the empNo.
        const apiId = (emp as any).apiId as string | undefined;
        const rec = byKey.get(`${day}|${emp.id}`)
          ?? (apiId ? byKey.get(`${day}|${apiId}`) : undefined)
          ?? null;
        if (rec) {
          rows.push(rec);
        } else {
          rows.push({
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
            status: 'absent',
            notes: '',
          } satisfies AttendanceType);
        }
      }
    }
    return rows;
  }, [employees, todayRecords, dateFrom, dateTo, isTenantWide, matchesScope, scopeMode]);

  // Summary counts derived from the roster-driven rows so that employees
  // without any punch for the day are still counted (as absent).
  const summary = useMemo(() => {
    const totalEmployees = employees
      .filter(e => e.status === 'active' && (isTenantWide || matchesScope(e.id, scopeMode))).length;
    const present = dailyRows.filter(r => r.status === 'present' || r.status === 'early_leave').length;
    const absent = dailyRows.filter(r => r.status === 'absent').length;
    const late = dailyRows.filter(r => r.status === 'late').length;
    const noCheckin = dailyRows.filter(r => r.status === 'no_checkin').length;
    const noCheckout = dailyRows.filter(r => r.status === 'no_checkout').length;
    const leave = dailyRows.filter(r => r.status === 'leave').length;
    return { totalEmployees, present, absent, late, noCheckin, noCheckout, leave };
  }, [dailyRows, employees, isTenantWide, matchesScope, scopeMode]);

  // Filtered records — built on top of the roster-driven dailyRows so employees
  // without any punch record still appear (as "absent" until fingerprint sync).
  const filteredRecords = useMemo(() => {
    let records = dailyRows;
    if (activeFilter !== 'all') {
      records = records.filter(r => r.status === activeFilter);
    }
    if (departmentFilter !== 'all') {
      records = records.filter(r => {
        const emp = employees.find(e => e.id === r.employeeId);
        return deptName(emp?.department) === departmentFilter;
      });
    }
    const kw = dailySearch.trim().toLowerCase();
    if (kw) {
      records = records.filter(r => {
        const emp = employees.find(e => e.id === r.employeeId);
        const hay = `${emp?.name ?? ''} ${emp?.id ?? ''} ${deptName(emp?.department)}`.toLowerCase();
        return hay.includes(kw);
      });
    }
    return records;
    // deptName is derived from deptList, tracked via employees.length/deptList upstream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyRows, employees, activeFilter, departmentFilter, dailySearch]);

  // Pagination for daily records
  const dailyPagination = usePagination(filteredRecords, 10);

  // Reset pagination when filters change
  useEffect(() => {
    dailyPagination.resetPage();
  }, [activeFilter, departmentFilter, dateFrom, dateTo, dailySearch]);

  // Monthly data
  const monthlyData = useMemo(() => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const year = monthDate.getFullYear();
    const storedAL = loadValuesForYear(year);
    const rule = loadRule();
    const ruleAsOf = new Date(year, 0, 1);

    return employees
      .filter(e => e.status === 'active' && (isTenantWide || matchesScope(e.id, scopeMode)))
      .map(emp => {
      const empRecords: Record<string, AttendanceStatus> = {};
      let presentCount = 0, absentCount = 0, lateCount = 0, leaveCount = 0;
      const leaveRecords: { date: string; reason: string }[] = [];

      days.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayOfWeek = getDay(day);
        if (dayOfWeek === 0 || dayOfWeek === 6) return;

        const record = attendance.find(a => a.employeeId === emp.id && a.date === dateStr);
        if (record) {
          empRecords[dateStr] = record.status;
          if (record.status === 'present' || record.status === 'early_leave') presentCount++;
          else if (record.status === 'absent' || record.status === 'no_checkin') absentCount++;
          else if (record.status === 'late') { lateCount++; presentCount++; }
          else if (record.status === 'no_checkout') presentCount++;
          else if (record.status === 'leave') {
            leaveCount++;
            leaveRecords.push({ date: dateStr, reason: record.notes || 'No reason provided' });
          }
        }
      });

      // Prefer the stored per-year value; fall back to applying the rule live.
      const totalAL = storedAL[emp.id]?.totalAL
        ?? daysForTenure(rule, tenureYears(emp.joinDate, ruleAsOf));
      const remainAL = Math.max(0, totalAL - leaveCount);

      return { employee: emp, records: empRecords, presentCount, absentCount, lateCount, leaveCount, leaveRecords, totalAL, remainAL };
    });
    // alVersion invalidates when AL values/rule change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthDate, alVersion, attendance, employees, isTenantWide, matchesScope, scopeMode]);

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
    { key: 'all', label: 'All', count: todayRecords.length, icon: <Users className="h-4 w-4" /> },
    { key: 'present', label: 'Present', count: summary.present, icon: <CheckCircle2 className="h-4 w-4" /> },
    { key: 'no_checkin', label: 'No Check-in', count: summary.noCheckin, icon: <AlertTriangle className="h-4 w-4" /> },
    { key: 'no_checkout', label: 'No Check-out', count: summary.noCheckout, icon: <AlertCircle className="h-4 w-4" /> },
    { key: 'late', label: 'Late', count: summary.late, icon: <Clock className="h-4 w-4" /> },
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
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editRecord) return;
    const emp = employees.find(
      e => e.id === editRecord.employeeId || (e as any).apiId === editRecord.employeeId,
    );
    if (USE_MOCKS) {
      toast.success(`Attendance updated for ${emp?.name}`);
      setEditDialogOpen(false);
      return;
    }

    const isSynthetic = editRecord.id.startsWith('synthetic:');
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
        } as any);
      }
      toast.success(`Attendance updated for ${emp?.name ?? 'employee'}`);
      setEditDialogOpen(false);
      await loadAttendance();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save attendance');
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('page.attendance.title')}</h1>
          <p className="text-gray-500">{t('page.attendance.description')}</p>
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
              <Dialog open={fingerprintDialogOpen} onOpenChange={setFingerprintDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Fingerprint className="mr-1.5 h-4 w-4" />
                    Import Fingerprint
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Import from Fingerprint Device</DialogTitle>
                    <DialogDescription>Sync attendance data from fingerprint scanner</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-blue-50/50 p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Fingerprint className="h-8 w-8 text-blue-600 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold">Device connection</p>
                          <p className="text-xs text-gray-500">Saved to this browser. Rotate in production.</p>
                        </div>
                        <Badge
                          className={
                            fpStatus === 'reachable'
                              ? 'bg-green-100 text-green-800 border-0'
                              : fpStatus === 'unreachable'
                              ? 'bg-red-100 text-red-800 border-0'
                              : 'bg-gray-100 text-gray-700 border-0'
                          }
                        >
                          {fpStatus === 'reachable'
                            ? 'Reachable'
                            : fpStatus === 'unreachable'
                            ? 'Unreachable'
                            : 'Unknown'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-gray-500">IP address</Label>
                          <Input
                            value={fpIp}
                            onChange={(e) => {
                              setFpIp(e.target.value);
                              setFpStatus('unknown');
                              localStorage.setItem('hrms:fp:ip', e.target.value);
                            }}
                            placeholder="192.168.178.243"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-gray-500">Port</Label>
                          <Input
                            value={fpPort}
                            onChange={(e) => {
                              setFpPort(e.target.value);
                              setFpStatus('unknown');
                              localStorage.setItem('hrms:fp:port', e.target.value);
                            }}
                            placeholder="80"
                            className="h-8 w-24 text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                        <span>
                          Last sync: {fpLastSyncAt ? format(new Date(fpLastSyncAt), 'MMM d, HH:mm') : 'never'}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={fpTesting || !fpIp || !fpPort}
                          onClick={async () => {
                            setFpTesting(true);
                            try {
                              // Browser CORS blocks reading the response, but a successful fetch
                              // in no-cors mode is enough to confirm the host responded.
                              const ctrl = new AbortController();
                              const t = setTimeout(() => ctrl.abort(), 3000);
                              await fetch(`http://${fpIp}:${fpPort}/`, { mode: 'no-cors', signal: ctrl.signal });
                              clearTimeout(t);
                              setFpStatus('reachable');
                              toast.success(`Device at ${fpIp}:${fpPort} responded`);
                            } catch {
                              setFpStatus('unreachable');
                              toast.error(`Cannot reach ${fpIp}:${fpPort}`);
                            } finally {
                              setFpTesting(false);
                            }
                          }}
                        >
                          {fpTesting ? 'Testing…' : 'Test connection'}
                        </Button>
                      </div>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg">
                      <p className="text-sm font-medium text-green-900 mb-1">Auto-calculation</p>
                      <ul className="text-xs text-green-800 space-y-0.5">
                        <li>Late check-in / early check-out detection</li>
                        <li>Overtime + working-hours computation</li>
                      </ul>
                    </div>
                    <Button
                      onClick={async () => {
                        try {
                          setFpTesting(true);
                          if (USE_MOCKS) {
                            await new Promise(r => setTimeout(r, 400));
                            toast.success(`Imported attendance from ${fpIp}:${fpPort} (mock)`);
                          } else {
                            const res = await attendanceApi.importFingerprint({
                              ip: fpIp,
                              port: Number(fpPort),
                              commKey: 0,
                              timeoutMs: 15000,
                            });
                            const p = res.persisted;
                            if (p) {
                              const bits: string[] = [];
                              if (p.inserted) bits.push(`${p.inserted} new`);
                              if (p.updated) bits.push(`${p.updated} updated`);
                              if (p.unchanged) bits.push(`${p.unchanged} unchanged`);
                              const body = `${res.recordCount} punch${res.recordCount === 1 ? '' : 'es'} pulled — ${bits.length ? bits.join(', ') : 'nothing to save'}`;
                              if (p.unmatchedUsers > 0) {
                                toast.warning(`${body}. ${p.unmatchedUsers} device user${p.unmatchedUsers === 1 ? '' : 's'} didn't match any employee: ${p.unmatchedUserIds.slice(0, 5).join(', ')}${p.unmatchedUserIds.length > 5 ? '…' : ''}`, { duration: 8000 });
                              } else {
                                toast.success(body);
                              }
                            } else {
                              toast.success(`Imported ${res.recordCount} punches from ${fpIp}:${fpPort}`);
                            }
                            // Pull fresh attendance so the new check-ins/outs
                            // land in the roster-driven table immediately.
                            await loadAttendance();
                          }
                          const now = new Date().toISOString();
                          localStorage.setItem('hrms:fp:lastSyncAt', now);
                          setFpLastSyncAt(now);
                          setFingerprintDialogOpen(false);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Fingerprint import failed');
                        } finally {
                          setFpTesting(false);
                        }
                      }}
                      className="w-full"
                      size="lg"
                      disabled={!fpIp || !fpPort || fpTesting}
                    >
                      <Fingerprint className="mr-2 h-5 w-5" />
                      {fpTesting ? 'Importing…' : `Import from ${fpIp}:${fpPort}`}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

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
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                      <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" id="att-upload" />
                      <label htmlFor="att-upload" className="cursor-pointer">
                        <Button variant="outline" asChild><span>Select Excel File</span></Button>
                      </label>
                      {selectedFile && <p className="mt-2 text-sm text-gray-600">{selectedFile.name}</p>}
                    </div>
                    <Button onClick={() => { toast.success(`Uploaded ${selectedFile?.name || 'file'} - records processed`); setUploadDialogOpen(false); setSelectedFile(null); }} className="w-full">
                      <Upload className="mr-2 h-4 w-4" />
                      Upload & Process
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

          {/* Alerts */}
          {(summary.noCheckin > 0 || summary.noCheckout > 0 || summary.absent > 0) && (
            <div className="flex flex-wrap gap-3">
              {summary.noCheckin > 0 && (
                <div
                  className="flex items-center gap-2 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors"
                  onClick={() => setActiveFilter('no_checkin')}
                >
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <span className="text-sm text-orange-800 font-medium">{summary.noCheckin} employee(s) have not checked in</span>
                </div>
              )}
              {summary.noCheckout > 0 && (
                <div
                  className="flex items-center gap-2 px-4 py-2.5 bg-purple-50 border border-purple-200 rounded-lg cursor-pointer hover:bg-purple-100 transition-colors"
                  onClick={() => setActiveFilter('no_checkout')}
                >
                  <AlertCircle className="h-4 w-4 text-purple-600" />
                  <span className="text-sm text-purple-800 font-medium">{summary.noCheckout} employee(s) missing check-out</span>
                </div>
              )}
              {summary.absent > 0 && (
                <div
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg cursor-pointer hover:bg-red-100 transition-colors"
                  onClick={() => setActiveFilter('absent')}
                >
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-800 font-medium">{summary.absent} employee(s) absent today</span>
                </div>
              )}
            </div>
          )}

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
                      placeholder="Search name, ID, department…"
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
                <Button variant="outline" size="sm" onClick={() => toast.success('Exported attendance data')}>
                  <Download className="mr-1.5 h-4 w-4" />
                  Export
                </Button>
              </div>

              {/* Filter tabs */}
              <div className="flex flex-wrap gap-1 mt-3">
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
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Dept</TableHead>
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
                      <TableCell colSpan={(isAdmin ? 11 : 10) + (dateFrom !== dateTo ? 1 : 0)} className="text-center py-12 text-gray-400">
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
                      return (
                        <TableRow key={record.id} className="hover:bg-gray-50">
                          <TableCell>
                            <EmployeeCell employee={emp} subtitle={emp?.id} />
                          </TableCell>
                          <TableCell className="text-sm">{deptName(emp?.department)}</TableCell>
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
                            {record.otHours ? (
                              <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">
                                +{record.otHours}h
                              </Badge>
                            ) : <span className="text-gray-300">-</span>}
                          </TableCell>
                          <TableCell className="text-center text-sm">{record.workHours ? `${record.workHours}h` : '-'}</TableCell>
                          <TableCell>{getStatusBadge(record.status)}</TableCell>
                          <TableCell>
                            <p className="text-xs text-gray-500 max-w-[150px] truncate">{record.notes || '-'}</p>
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(record)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              <Pagination
                currentPage={dailyPagination.currentPage}
                totalPages={dailyPagination.totalPages}
                onPageChange={dailyPagination.goToPage}
                startIndex={dailyPagination.startIndex}
                endIndex={dailyPagination.endIndex}
                totalItems={dailyPagination.totalItems}
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
                      placeholder="Search name, ID, department…"
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
                  const kw = monthlySearch.trim().toLowerCase();
                  const filteredRows = monthlyData.filter(d => {
                    if (departmentFilter !== 'all' && deptName(d.employee.department) !== departmentFilter) return false;
                    if (kw) {
                      const hay = `${d.employee.name} ${d.employee.id} ${deptName(d.employee.department)}`.toLowerCase();
                      if (!hay.includes(kw)) return false;
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
                        .filter(e => e.status === 'active' && (isTenantWide || matchesScope(e.id, scopeMode)))
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
                {/* Leave records list */}
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
                        </div>
                        <Badge className="bg-indigo-50 text-indigo-700 border-0 text-xs shrink-0">Leave</Badge>
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
              {editRecord && `Update attendance for ${employees.find(e => e.id === editRecord.employeeId)?.name} on ${editRecord.date}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Morning Session</p>
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
            <div className="space-y-2">
              <Label className="text-sm">Status</Label>
              <Select value={editStatus} onValueChange={v => setEditStatus(v as AttendanceStatus)}>
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
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit}>Save Changes</Button>
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
    </div>
  );
}
