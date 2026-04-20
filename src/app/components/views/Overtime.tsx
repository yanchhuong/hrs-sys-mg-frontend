import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { mockOTRequests, mockEmployees } from '../../data/mockData';
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
import { Plus, CalendarIcon, Check, X } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';

export function Overtime() {
  const { currentUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const isEmployee = currentUser?.role === 'employee';
  const isManager = currentUser?.role === 'manager';
  const canApprove = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const handleDateFilterChange = (startDate: string | null, endDate: string | null) => {
    setDateFilter({ start: startDate, end: endDate });
  };

  let otRequests = isEmployee
    ? mockOTRequests.filter(req => req.employeeId === currentUser.employeeId)
    : isManager
    ? mockOTRequests.filter(req => {
        const employee = mockEmployees.find(e => e.id === req.employeeId);
        return employee?.managerId === currentUser.employeeId;
      })
    : mockOTRequests;

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

  const handleSubmitRequest = () => {
    if (!hours || !reason) {
      toast.error('Please fill in all fields');
      return;
    }
    toast.success('OT request submitted successfully');
    setDialogOpen(false);
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
  }, [dateFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Overtime Management</h1>
          <p className="text-gray-500">Request and manage overtime hours</p>
        </div>
        <div className="flex gap-2">
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
                <div className="space-y-2">
                  <Label htmlFor="hours">Hours</Label>
                  <Input
                    id="hours"
                    type="number"
                    placeholder="e.g., 2"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
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
        <CardHeader className="pb-3">
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
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {!isEmployee && <TableHead>Employee</TableHead>}
                <TableHead>Date</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested At</TableHead>
                {!isEmployee && <TableHead>Approved By</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overtimePagination.paginatedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isEmployee ? 7 : 9} className="text-center text-sm text-gray-400 py-10">
                    No OT requests in this status.
                  </TableCell>
                </TableRow>
              )}
              {overtimePagination.paginatedItems.map((request) => {
                const employee = mockEmployees.find(e => e.id === request.employeeId);
                const approver = request.approvedBy
                  ? mockEmployees.find(e => e.id === request.approvedBy)
                  : null;
                const isPending = request.status === 'pending';
                return (
                  <TableRow key={request.id} className={isPending ? 'bg-yellow-50/50' : ''}>
                    {!isEmployee && <TableCell className="font-medium">{employee?.name}</TableCell>}
                    <TableCell>{format(new Date(request.date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{request.hours}h</TableCell>
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
                    {!isEmployee && (
                      <TableCell className="text-sm">{approver?.name || '-'}</TableCell>
                    )}
                    <TableCell className="text-right">
                      {isPending && canApprove ? (
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
