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
  Calendar, Clock, DollarSign, Download, FileText,
  TrendingUp, Users, Building2, AlertCircle,
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { mockAttendance, mockEmployees, mockPayroll, mockDepartments } from '../../data/mockData';
import {
  exportAttendanceToExcel,
  exportPayrollToExcel,
} from '../../utils/excelExport';
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

        {/* Top Absent */}
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
                  <div key={employee?.id || i} className="flex items-center justify-between py-2 border-b last:border-b-0">
                    <div>
                      <p className="text-sm font-medium">{employee?.name}</p>
                      <p className="text-xs text-gray-400">{employee?.department}</p>
                    </div>
                    <Badge className="bg-red-50 text-red-700 border-0">{count} days</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
                  <TableRow key={dept}>
                    <TableCell className="font-medium">{dept}</TableCell>
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
