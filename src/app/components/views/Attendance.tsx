import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { mockAttendance, mockEmployees } from '../../data/mockData';
import { Attendance as AttendanceType, AttendanceStatus } from '../../types/hrms';
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
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isToday as isTodayFn, addMonths, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';

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

export function Attendance() {
  const { currentUser } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [selectedDate, setSelectedDate] = useState('2026-04-20');
  const [monthDate, setMonthDate] = useState(new Date(2026, 3, 1)); // April 2026
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [leaveDetailEmp, setLeaveDetailEmp] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const isEmployee = currentUser?.role === 'employee';

  // Today's records
  const todayRecords = useMemo(() => {
    return mockAttendance.filter(a => a.date === selectedDate);
  }, [selectedDate]);

  // Summary counts for selected date
  const summary = useMemo(() => {
    const totalEmployees = mockEmployees.filter(e => e.status === 'active').length;
    const present = todayRecords.filter(r => r.status === 'present' || r.status === 'early_leave').length;
    const absent = todayRecords.filter(r => r.status === 'absent').length;
    const late = todayRecords.filter(r => r.status === 'late').length;
    const noCheckin = todayRecords.filter(r => r.status === 'no_checkin').length;
    const noCheckout = todayRecords.filter(r => r.status === 'no_checkout').length;
    const leave = todayRecords.filter(r => r.status === 'leave').length;
    return { totalEmployees, present, absent, late, noCheckin, noCheckout, leave };
  }, [todayRecords]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    let records = todayRecords;
    if (activeFilter !== 'all') {
      records = records.filter(r => r.status === activeFilter);
    }
    if (departmentFilter !== 'all') {
      records = records.filter(r => {
        const emp = mockEmployees.find(e => e.id === r.employeeId);
        return emp?.department === departmentFilter;
      });
    }
    return records;
  }, [todayRecords, activeFilter, departmentFilter]);

  // Pagination for daily records
  const dailyPagination = usePagination(filteredRecords, 10);

  // Reset pagination when filters change
  useEffect(() => {
    dailyPagination.resetPage();
  }, [activeFilter, departmentFilter, selectedDate]);

  // Monthly data
  const monthlyData = useMemo(() => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    return mockEmployees.filter(e => e.status === 'active').map(emp => {
      const empRecords: Record<string, AttendanceStatus> = {};
      let presentCount = 0, absentCount = 0, lateCount = 0, leaveCount = 0;
      const leaveRecords: { date: string; reason: string }[] = [];

      days.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayOfWeek = getDay(day);
        if (dayOfWeek === 0 || dayOfWeek === 6) return;

        const record = mockAttendance.find(a => a.employeeId === emp.id && a.date === dateStr);
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

      const totalAL = 18; // Annual leave allocation
      const remainAL = totalAL - leaveCount;

      return { employee: emp, records: empRecords, presentCount, absentCount, lateCount, leaveCount, leaveRecords, totalAL, remainAL };
    });
  }, [monthDate]);

  // Top absent employees
  const topAbsent = useMemo(() => {
    return [...monthlyData]
      .sort((a, b) => b.absentCount - a.absentCount)
      .filter(d => d.absentCount > 0)
      .slice(0, 5);
  }, [monthlyData]);

  const departments = [...new Set(mockEmployees.map(e => e.department))];

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

  const handleSaveEdit = () => {
    const emp = mockEmployees.find(e => e.id === editRecord?.employeeId);
    toast.success(`Attendance updated for ${emp?.name}`);
    setEditDialogOpen(false);
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
          <h1 className="text-3xl font-bold">Attendance Management</h1>
          <p className="text-gray-500">Track and manage employee attendance</p>
        </div>
        <div className="flex gap-2">
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
                    <div className="border-2 border-dashed border-blue-300 bg-blue-50 rounded-lg p-8 text-center">
                      <Fingerprint className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                      <h3 className="font-semibold text-lg mb-2">Fingerprint Device Connected</h3>
                      <p className="text-sm text-gray-600 mb-4">Ready to import attendance records</p>
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>Device: ZKTeco K50 | Status: Online | Last Sync: 10 min ago</p>
                      </div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm font-medium text-green-900 mb-2">Auto-calculation Features:</p>
                      <ul className="text-sm text-green-800 space-y-1">
                        <li>Late check-in detection | Early check-out detection</li>
                        <li>Overtime auto-calculation | Working hours computation</li>
                      </ul>
                    </div>
                    <Button onClick={() => { toast.success('Fingerprint attendance imported - 25 records processed'); setFingerprintDialogOpen(false); }} className="w-full" size="lg">
                      <Fingerprint className="mr-2 h-5 w-5" />
                      Import Attendance
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
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">Date:</Label>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={e => setSelectedDate(e.target.value)}
                      className="w-44 h-8"
                    />
                  </div>
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
                      <TableCell colSpan={isAdmin ? 11 : 10} className="text-center py-12 text-gray-400">
                        No records found for the selected filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    dailyPagination.paginatedItems.map(record => {
                      const emp = mockEmployees.find(e => e.id === record.employeeId);
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
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                                {emp?.name?.split(' ').map(n => n[0]).join('')}
                              </div>
                              <div>
                                <p className="font-medium text-sm">{emp?.name}</p>
                                <p className="text-xs text-gray-400">{emp?.id}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{emp?.department}</TableCell>
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
              <Button variant="outline" size="sm" onClick={() => toast.success('Exported monthly data')}>
                <Download className="mr-1.5 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Monthly Summary Table */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Monthly Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-center">Total AL</TableHead>
                      <TableHead className="text-center">Leave</TableHead>
                      <TableHead className="text-center">Remain</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-center">Present</TableHead>
                      <TableHead className="text-center">Absent</TableHead>
                      <TableHead className="text-center">Late</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyData
                      .filter(d => departmentFilter === 'all' || d.employee.department === departmentFilter)
                      .map(data => (
                        <TableRow
                          key={data.employee.id}
                          className={`cursor-pointer hover:bg-gray-50 ${selectedEmployee === data.employee.id ? 'bg-blue-50' : ''}`}
                          onClick={() => setSelectedEmployee(selectedEmployee === data.employee.id ? null : data.employee.id)}
                        >
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
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{data.employee.name}</p>
                              <p className="text-xs text-gray-400">{data.employee.department}</p>
                            </div>
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
                    <p className="text-xs text-gray-400">{selectedEmpData.employee.department} - {format(monthDate, 'MMMM yyyy')}</p>
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
                              <p className="text-xs text-gray-400">{data.employee.department}</p>
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
                    <span className="font-medium">{mockEmployees.filter(e => e.status === 'active').length}</span>
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
              {editRecord && `Update attendance for ${mockEmployees.find(e => e.id === editRecord.employeeId)?.name} on ${editRecord.date}`}
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
    </div>
  );
}
