import { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Calendar, Clock, DollarSign, Download, FileText, Eye,
  TrendingUp, Users, Building2, AlertCircle,
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { mockAttendance, mockEmployees, mockPayroll, mockDepartments } from '../../data/mockData';
import { Attendance, Employee, PayrollItem } from '../../types/hrms';
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

const TODAY = new Date('2026-04-20');

export function Reports() {
  const { t } = useI18n();
  const { currentUser } = useAuth();

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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">{t('page.reports.title')}</h1>
          <p className="text-gray-500">{t('page.reports.description')}</p>
        </div>
        <Badge variant="secondary" className="text-sm">
          <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
          Admin / Manager
        </Badge>
      </div>

      <Tabs defaultValue="attendance" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="attendance">
            <Clock className="h-4 w-4 mr-2" />
            Attendance
          </TabsTrigger>
          <TabsTrigger value="payroll">
            <DollarSign className="h-4 w-4 mr-2" />
            Payroll
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-6">
          <AttendanceReport />
        </TabsContent>

        <TabsContent value="payroll" className="space-y-6">
          <PayrollReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attendance Report
// ---------------------------------------------------------------------------
function AttendanceReport() {
  const [startDate, setStartDate] = useState(format(subMonths(TODAY, 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(TODAY, 'yyyy-MM-dd'));
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);

  const employees = useMemo(() => {
    return departmentFilter === 'all'
      ? mockEmployees
      : mockEmployees.filter(e => e.department === departmentFilter);
  }, [departmentFilter]);

  const empIds = useMemo(() => new Set(employees.map(e => e.id)), [employees]);

  const filtered = useMemo(() => {
    return mockAttendance.filter(a => {
      if (a.date < startDate || a.date > endDate) return false;
      if (!empIds.has(a.employeeId)) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      return true;
    });
  }, [startDate, endDate, empIds, statusFilter]);

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    let totalOT = 0;
    let totalWorkHours = 0;
    filtered.forEach(a => {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      totalOT += a.otHours || 0;
      totalWorkHours += a.workHours || 0;
    });
    return {
      total: filtered.length,
      byStatus,
      totalOT,
      totalWorkHours,
      uniqueEmployees: new Set(filtered.map(a => a.employeeId)).size,
    };
  }, [filtered]);

  const topAbsent = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.filter(a => a.status === 'absent').forEach(a => {
      counts.set(a.employeeId, (counts.get(a.employeeId) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([id, c]) => ({ employee: mockEmployees.find(e => e.id === id), count: c }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filtered]);

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
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreset('thisMonth')}>This Month</Button>
            <Button variant="outline" size="sm" onClick={() => setPreset('lastMonth')}>Last Month</Button>
            <Button variant="outline" size="sm" onClick={() => setPreset('last7')}>Last 7 Days</Button>
            <Button variant="outline" size="sm" onClick={() => setPreset('last30')}>Last 30 Days</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {mockDepartments.map(d => (
                    <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Records" value={stats.total} icon={FileText} tone="blue" />
        <StatCard label="Employees" value={stats.uniqueEmployees} icon={Users} tone="purple" />
        <StatCard label="Total OT Hours" value={stats.totalOT.toFixed(1)} icon={Clock} tone="orange" />
        <StatCard label="Total Work Hours" value={stats.totalWorkHours.toFixed(0)} icon={TrendingUp} tone="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(stats.byStatus).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No records in the selected range</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(stats.byStatus).map(([status, count]) => {
                  const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                  const color = STATUS_COLORS[status] || 'bg-gray-400';
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="capitalize">{status.replace(/_/g, ' ')}</span>
                        <span className="text-gray-500">{count} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Absent — clickable rows open the per-employee detail dialog */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top Absent Employees</CardTitle>
          </CardHeader>
          <CardContent>
            {topAbsent.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No absences in the selected range</p>
            ) : (
              <div className="space-y-2">
                {topAbsent.map(({ employee, count }, i) => (
                  <button
                    key={employee?.id || i}
                    type="button"
                    onClick={() => employee && setDetailEmployee(employee)}
                    className="w-full flex items-center justify-between py-2 border-b last:border-b-0 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm font-medium">{employee?.name}</p>
                      <p className="text-xs text-gray-400">{employee?.department}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-red-50 text-red-700 border-0">{count} days</Badge>
                      <Eye className="h-3.5 w-3.5 text-gray-400" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed records — full table of filtered attendance entries */}
      <AttendanceDetailTable
        records={filtered}
        employees={mockEmployees}
        onPickEmployee={setDetailEmployee}
      />

      <AttendanceEmployeeDialog
        employee={detailEmployee}
        records={filtered}
        startDate={startDate}
        endDate={endDate}
        onClose={() => setDetailEmployee(null)}
      />

      {/* Export */}
      <Card>
        <CardContent className="py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-medium">Export Attendance Report</p>
            <p className="text-sm text-gray-500">
              Excel file with summary, per-employee breakdown, and daily log.
            </p>
          </div>
          <Button onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export Excel ({filtered.length})
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Payroll Report
// ---------------------------------------------------------------------------
function PayrollReport() {
  const availableMonths = useMemo(() => {
    return Array.from(new Set(mockPayroll.map(p => p.month))).sort((a, b) => b.localeCompare(a));
  }, []);

  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [detailDept, setDetailDept] = useState<string | null>(null);

  const employees = useMemo(() => {
    return departmentFilter === 'all'
      ? mockEmployees
      : mockEmployees.filter(e => e.department === departmentFilter);
  }, [departmentFilter]);

  const empIds = useMemo(() => new Set(employees.map(e => e.id)), [employees]);

  const filtered = useMemo(() => {
    return mockPayroll.filter(p => {
      if (monthFilter !== 'all' && p.month !== monthFilter) return false;
      if (!empIds.has(p.employeeId)) return false;
      return true;
    });
  }, [monthFilter, empIds]);

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

  const byDept = useMemo(() => {
    const map = new Map<string, { count: number; earn: number; ded: number; net: number }>();
    filtered.forEach(p => {
      const dept = mockEmployees.find(e => e.id === p.employeeId)?.department || 'Unknown';
      const v = map.get(dept) || { count: 0, earn: 0, ded: 0, net: 0 };
      v.count++;
      v.earn += p.totalEarnings;
      v.ded += p.deductions;
      v.net += p.totalPay;
      map.set(dept, v);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].net - a[1].net);
  }, [filtered]);

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
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {availableMonths.map(m => (
                    <SelectItem key={m} value={m}>{format(parseISO(m + '-01'), 'MMMM yyyy')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {mockDepartments.map(d => (
                    <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Records" value={stats.count} icon={FileText} tone="blue" />
        <StatCard label="Total Earnings" value={`$${stats.earn.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={TrendingUp} tone="green" />
        <StatCard label="Total Deductions" value={`$${stats.ded.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={DollarSign} tone="red" />
        <StatCard label="Net Salary" value={`$${stats.net.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={DollarSign} tone="purple" />
      </div>

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
                    <TableCell className="text-right">{v.count}</TableCell>
                    <TableCell className="text-right text-green-700">
                      ${v.earn.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-red-700">
                      ${v.ded.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${v.net.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detailed records — full per-employee payroll breakdown */}
      <PayrollDetailTable
        records={filtered}
        employees={mockEmployees}
        period={monthFilter === 'all' ? 'All Months' : format(parseISO(monthFilter + '-01'), 'MMMM yyyy')}
      />

      <PayrollDeptDialog
        department={detailDept}
        records={filtered}
        employees={mockEmployees}
        period={monthFilter === 'all' ? 'All Months' : format(parseISO(monthFilter + '-01'), 'MMMM yyyy')}
        onClose={() => setDetailDept(null)}
      />

      {/* Export */}
      <Card>
        <CardContent className="py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-medium">Export Payroll Report</p>
            <p className="text-sm text-gray-500">
              Excel file with summary, detailed rows, and per-employee totals.
            </p>
          </div>
          <Button onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export Excel ({filtered.length})
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Detail components — Attendance
// ---------------------------------------------------------------------------
function AttendanceDetailTable({
  records, employees, onPickEmployee,
}: {
  records: Attendance[];
  employees: Employee[];
  onPickEmployee: (e: Employee) => void;
}) {
  // Most-recent first so the user sees today's entries on page 1.
  const sorted = useMemo(
    () => [...records].sort((a, b) => b.date.localeCompare(a.date)),
    [records],
  );
  const empById = useMemo(
    () => new Map(employees.map(e => [e.id, e])),
    [employees],
  );
  const pagination = usePagination(sorted, 25);

  const statusBadgeCls = (status: string) =>
    ({
      present: 'bg-green-50 text-green-700',
      late: 'bg-yellow-50 text-yellow-700',
      early_leave: 'bg-orange-50 text-orange-700',
      leave: 'bg-blue-50 text-blue-700',
      absent: 'bg-red-50 text-red-700',
      no_checkin: 'bg-purple-50 text-purple-700',
      no_checkout: 'bg-indigo-50 text-indigo-700',
    } as Record<string, string>)[status] || 'bg-gray-100 text-gray-700';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Detailed Records
          <Badge variant="secondary" className="ml-1 font-normal">{records.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No attendance records in the selected range</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead className="text-right">Work Hours</TableHead>
                  <TableHead className="text-right">OT</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map(a => {
                  const emp = empById.get(a.employeeId);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs">{format(new Date(a.date), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{emp?.name ?? a.employeeId}</p>
                          <p className="text-xs text-gray-400">{emp?.department ?? ''}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusBadgeCls(a.status)} border-0 capitalize`}>
                          {a.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{a.morningIn ?? a.checkIn ?? '-'}</TableCell>
                      <TableCell className="text-xs font-mono">{a.noonOut ?? a.checkOut ?? '-'}</TableCell>
                      <TableCell className="text-right text-xs">{a.workHours?.toFixed(1) ?? '-'}</TableCell>
                      <TableCell className="text-right text-xs">{a.otHours?.toFixed(1) ?? '-'}</TableCell>
                      <TableCell>
                        {emp && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title={`View all entries for ${emp.name}`}
                            onClick={() => onPickEmployee(emp)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
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
                  onPageChange={pagination.setPage}
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
  employee, records, startDate, endDate, onClose,
}: {
  employee: Employee | null;
  records: Attendance[];
  startDate: string;
  endDate: string;
  onClose: () => void;
}) {
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
            {format(new Date(startDate), 'MMM dd, yyyy')} – {format(new Date(endDate), 'MMM dd, yyyy')} ·{' '}
            {employee?.department} · {employee?.position}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-500">Total Days</p>
              <p className="text-lg font-semibold">{myRecords.length}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-500">Work Hours</p>
              <p className="text-lg font-semibold">{stats.work.toFixed(1)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-500">OT Hours</p>
              <p className="text-lg font-semibold">{stats.ot.toFixed(1)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-500">Absences</p>
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
                    <TableCell className="text-xs font-mono">{r.morningIn ?? r.checkIn ?? '-'}</TableCell>
                    <TableCell className="text-xs font-mono">{r.noonOut ?? r.checkOut ?? '-'}</TableCell>
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
  records, employees, period,
}: {
  records: PayrollItem[];
  employees: Employee[];
  period: string;
}) {
  const empById = useMemo(
    () => new Map(employees.map(e => [e.id, e])),
    [employees],
  );
  const sorted = useMemo(
    () => [...records].sort((a, b) => b.month.localeCompare(a.month) || a.employeeId.localeCompare(b.employeeId)),
    [records],
  );
  const pagination = usePagination(sorted, 25);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Detailed Records
          <Badge variant="secondary" className="ml-1 font-normal">{records.length}</Badge>
          <span className="ml-auto text-xs font-normal text-gray-400">{period}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No payroll records in the selected range</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Basic</TableHead>
                    <TableHead className="text-right">OT</TableHead>
                    <TableHead className="text-right">Allowance</TableHead>
                    <TableHead className="text-right">Earnings</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">NSSF</TableHead>
                    <TableHead className="text-right">Other Ded.</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(p => {
                    const emp = empById.get(p.employeeId);
                    const allowance = (p.positionAllowance ?? 0) + (p.evaluationAllowance ?? 0);
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <p className="text-sm font-medium">{emp?.name ?? p.employeeId}</p>
                          <p className="text-xs text-gray-400">{emp?.department ?? ''}</p>
                        </TableCell>
                        <TableCell className="text-xs">{p.month}</TableCell>
                        <TableCell className="text-right text-xs">${p.baseSalary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right text-xs">${p.otPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right text-xs">${allowance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right text-xs text-green-700">${p.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right text-xs">${(p.taxOnSalary ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right text-xs">${(p.nssfPension ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right text-xs">${(p.otherDeductions ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">${p.totalPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
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
                  onPageChange={pagination.setPage}
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
  department, records, employees, period, onClose,
}: {
  department: string | null;
  records: PayrollItem[];
  employees: Employee[];
  period: string;
  onClose: () => void;
}) {
  const empById = useMemo(
    () => new Map(employees.map(e => [e.id, e])),
    [employees],
  );

  const myRecords = useMemo(() => {
    if (!department) return [];
    return records.filter(p => {
      const emp = empById.get(p.employeeId);
      return (emp?.department ?? 'Unknown') === department;
    });
  }, [department, records, empById]);

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
                ${totals.earn.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-500">Total Deductions</p>
              <p className="text-lg font-semibold text-red-700">
                ${totals.ded.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-500">Net Salary</p>
              <p className="text-lg font-semibold">
                ${totals.net.toLocaleString(undefined, { maximumFractionDigits: 2 })}
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
                        ${p.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right text-xs text-red-700">
                        ${p.deductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        ${p.totalPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
const STATUS_COLORS: Record<string, string> = {
  present: 'bg-green-500',
  late: 'bg-yellow-500',
  early_leave: 'bg-orange-500',
  leave: 'bg-blue-500',
  absent: 'bg-red-500',
  no_checkin: 'bg-purple-500',
  no_checkout: 'bg-indigo-500',
};

const TONE_MAP: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700' },
  green: { bg: 'bg-green-50', text: 'text-green-700' },
  red: { bg: 'bg-red-50', text: 'text-red-700' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700' },
};

function StatCard({
  label, value, icon: Icon, tone,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONE_MAP;
}) {
  const t = TONE_MAP[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className={`p-2 rounded-lg ${t.bg}`}>
            <Icon className={`h-4 w-4 ${t.text}`} />
          </div>
          <span className={`text-xl font-bold ${t.text}`}>{value}</span>
        </div>
        <p className="text-xs text-gray-500">{label}</p>
      </CardContent>
    </Card>
  );
}
