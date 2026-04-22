import { useState, useEffect } from 'react';
import { mockOTRequests, mockEmployees } from '../../data/mockData';
import { useTeamScope, ScopeMode } from '../../hooks/useTeamScope';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { DateRangeFilter } from '../common/DateRangeFilter';
import { EmployeeCell } from '../common/EmployeeCell';
import { Plus, CalendarIcon, Check, X, Search } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useI18n } from '../../i18n/I18nContext';

export function Overtime() {
  const { t } = useI18n();
  const {
    role,
    isEmployee,
    isManager,
    isTenantWide,
    showScopePicker,
    matchesScope,
    canApproveFor: canApproveOTOf,
  } = useTeamScope();
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [startHour, setStartHour] = useState('');
  const [endHour, setEndHour] = useState('');
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [search, setSearch] = useState('');

  const handleDateFilterChange = (startDate: string | null, endDate: string | null) => {
    setDateFilter({ start: startDate, end: endDate });
  };

  // Admin sees the whole tenant. Manager / employee are scoped to self + direct
  // reports, then narrowed by the ScopePicker (`all` / `mine` / `team`).
  let otRequests = isTenantWide
    ? mockOTRequests
    : mockOTRequests.filter(req => matchesScope(req.employeeId, scopeMode));

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
      const emp = mockEmployees.find(e => e.id === req.employeeId);
      const hay = `${emp?.name ?? ''} ${emp?.id ?? ''} ${emp?.department ?? ''} ${req.reason ?? ''}`.toLowerCase();
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

  const handleSubmitRequest = () => {
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
    toast.success('OT request submitted successfully');
    setDialogOpen(false);
    setStartHour('');
    setEndHour('');
    setHours('');
    setReason('');
  };

  const handleApprove = (id: string) => {
    toast.success('OT request approved');
  };

  const handleReject = (id: string) => {
    toast.error('OT request rejected');
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
      approved: 'bg-green-100 text-green-800 hover:bg-green-100',
      rejected: 'bg-red-100 text-red-800 hover:bg-red-100',
    };
    return variants[status] || 'bg-gray-100 text-gray-800 hover:bg-gray-100';
  };

  const calculateOTRate = (isWeekend: boolean, isHoliday: boolean) => {
    if (isHoliday) return '3x';
    if (isWeekend) return '2x';
    return '1.5x';
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('page.overtime.title')}</h1>
          <p className="text-gray-500">{t('page.overtime.description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showScopePicker && <ScopePicker value={scopeMode} onChange={setScopeMode} />}
          <DateRangeFilter onFilterChange={handleDateFilterChange} />
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
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(selectedDate, 'PPP')}
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
                  {startHour && endHour && Number(hours) > 0 && (
                    <p className="text-[11px] text-gray-500">
                      {startHour} – {endHour} = {hours}h
                    </p>
                  )}
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
                <Button onClick={handleSubmitRequest} className="w-full">
                  Submit Request
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>OT Request History</CardTitle>
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
                <TableHead className="text-center">Start</TableHead>
                <TableHead className="text-center">End</TableHead>
                <TableHead className="text-center">Hours</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested At</TableHead>
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
                const employee = mockEmployees.find(e => e.id === request.employeeId);
                const leader = employee?.managerId
                  ? mockEmployees.find(e => e.id === employee.managerId)
                  : null;
                const approver = request.approvedBy
                  ? mockEmployees.find(e => e.id === request.approvedBy)
                  : null;
                const isPending = request.status === 'pending';
                const canActOnThis = isPending && canApproveOTOf(request.employeeId);
                return (
                  <TableRow key={request.id} className={isPending ? 'bg-yellow-50/50' : ''}>
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
                    <TableCell>{format(new Date(request.date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell className="text-center text-sm">
                      {request.startHour || <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {request.endHour || <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-center">{request.hours}h</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {calculateOTRate(request.isWeekend, request.isHoliday)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={request.reason}>{request.reason}</TableCell>
                    <TableCell>
                      <Badge className={getStatusBadge(request.status)}>
                        {request.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(request.requestedAt), 'MMM dd, HH:mm')}
                    </TableCell>
                    <TableCell className="text-sm">{approver?.name || '-'}</TableCell>
                    <TableCell className="text-right">
                      {canActOnThis ? (
                        <div className="flex items-center justify-end gap-1.5">
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
                        <span className="text-xs text-gray-400">—</span>
                      )}
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
        </CardContent>
      </Card>

      {isEmployee && (
        <Card>
          <CardHeader>
            <CardTitle>OT Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Total OT Hours</p>
                <p className="text-2xl font-bold">
                  {otRequests
                    .filter(req => req.status === 'approved')
                    .reduce((sum, req) => sum + req.hours, 0)}
                  h
                </p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-2xl font-bold">{pendingRequests.length}</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600">Approved</p>
                <p className="text-2xl font-bold">
                  {otRequests.filter(req => req.status === 'approved').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
