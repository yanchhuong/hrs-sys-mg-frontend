import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
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
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { DateRangeFilter } from '../common/DateRangeFilter';
import { EmployeeCell } from '../common/EmployeeCell';
import { mockExceptions } from '../../data/timeworkData';
import { mockEmployees as employees } from '../../data/mockData';
import { AlertCircle, Check, X, Plus } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';

export function Exception() {
  const { currentUser } = useAuth();
  const [exceptions] = useState(mockExceptions);
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // New-exception dialog state (employee only)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newType, setNewType] = useState<'missed_punch' | 'late_arrival' | 'early_leave' | 'manual_correction'>('missed_punch');
  const [newReason, setNewReason] = useState('');
  const [newCorrectedIn, setNewCorrectedIn] = useState('');
  const [newCorrectedOut, setNewCorrectedOut] = useState('');

  const role = currentUser?.role;
  const isEmployee = role === 'employee';
  const canApprove = role === 'admin' || role === 'manager';

  const handleDateFilterChange = (startDate: string | null, endDate: string | null) => {
    setDateFilter({ start: startDate, end: endDate });
  };

  const handleApprove = (id: string) => {
    toast.success('Exception approved');
  };

  const handleReject = (id: string) => {
    toast.error('Exception rejected');
  };

  const handleSubmitNew = () => {
    if (!newReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    toast.success('Exception submitted for approval');
    setDialogOpen(false);
    setNewReason('');
    setNewCorrectedIn('');
    setNewCorrectedOut('');
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      missed_punch: 'Missed Punch',
      late_arrival: 'Late Arrival',
      early_leave: 'Early Leave',
      manual_correction: 'Manual Correction',
    };
    return labels[type] || type;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
      approved: 'bg-green-100 text-green-800 hover:bg-green-100',
      rejected: 'bg-red-100 text-red-800 hover:bg-red-100',
    };
    return variants[status] || 'bg-gray-100 text-gray-800 hover:bg-gray-100';
  };

  let filteredExceptions = exceptions;

  // Apply date filter
  if (dateFilter.start || dateFilter.end) {
    filteredExceptions = filteredExceptions.filter(exc => {
      const excDate = parseISO(exc.date);
      if (dateFilter.start && dateFilter.end) {
        return isWithinInterval(excDate, {
          start: parseISO(dateFilter.start),
          end: parseISO(dateFilter.end),
        });
      } else if (dateFilter.start) {
        return excDate >= parseISO(dateFilter.start);
      } else if (dateFilter.end) {
        return excDate <= parseISO(dateFilter.end);
      }
      return true;
    });
  }

  const statusCounts = {
    all: filteredExceptions.length,
    pending: filteredExceptions.filter((e) => e.status === 'pending').length,
    approved: filteredExceptions.filter((e) => e.status === 'approved').length,
    rejected: filteredExceptions.filter((e) => e.status === 'rejected').length,
  };

  const statusFiltered = statusFilter === 'all'
    ? filteredExceptions
    : filteredExceptions.filter((e) => e.status === statusFilter);

  // Sort pending first so approvers see them at the top
  const sortedExceptions = [...statusFiltered].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
  });

  const exceptionsPagination = usePagination(sortedExceptions, 10);

  useEffect(() => {
    exceptionsPagination.resetPage();
  }, [dateFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Attendance Exceptions</h1>
          <p className="text-gray-500">
            Handle missed punches, late arrivals, and manual corrections
          </p>
        </div>
        <div className="flex gap-2">
          <DateRangeFilter onFilterChange={handleDateFilterChange} />
          {isEmployee && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Exception
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Submit Attendance Exception</DialogTitle>
                  <DialogDescription>
                    Your manager will review and approve this request
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="exc-date">Date</Label>
                    <Input
                      id="exc-date"
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      max={format(new Date(), 'yyyy-MM-dd')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="exc-type">Type</Label>
                    <select
                      id="exc-type"
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as typeof newType)}
                      className="w-full px-3 py-2 border rounded-md text-sm h-9"
                    >
                      <option value="missed_punch">Missed Punch</option>
                      <option value="late_arrival">Late Arrival</option>
                      <option value="early_leave">Early Leave</option>
                      <option value="manual_correction">Manual Correction</option>
                    </select>
                  </div>
                  {(newType === 'missed_punch' || newType === 'manual_correction') && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="exc-in">Corrected Check-in</Label>
                        <Input
                          id="exc-in"
                          type="time"
                          value={newCorrectedIn}
                          onChange={(e) => setNewCorrectedIn(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="exc-out">Corrected Check-out</Label>
                        <Input
                          id="exc-out"
                          type="time"
                          value={newCorrectedOut}
                          onChange={(e) => setNewCorrectedOut(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="exc-reason">Reason</Label>
                    <Textarea
                      id="exc-reason"
                      placeholder="Explain why this exception is needed..."
                      value={newReason}
                      onChange={(e) => setNewReason(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button onClick={handleSubmitNew} className="w-full">
                    Submit Exception
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Pending</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.pending}</div>
            <p className="text-xs text-gray-500">Require approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Approved</CardTitle>
            <Check className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.approved}</div>
            <p className="text-xs text-gray-500">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Rejected</CardTitle>
            <X className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.rejected}</div>
            <p className="text-xs text-gray-500">This month</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>Exceptions</CardTitle>
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
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exceptionsPagination.paginatedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-gray-400 py-10">
                    No exceptions in this status.
                  </TableCell>
                </TableRow>
              )}
              {exceptionsPagination.paginatedItems.map((exception) => {
                const employee = employees.find((e) => e.id === exception.employeeId);
                const isPending = exception.status === 'pending';
                return (
                  <TableRow key={exception.id} className={isPending ? 'bg-yellow-50/50' : ''}>
                    <TableCell>
                      <EmployeeCell employee={employee} />
                    </TableCell>
                    <TableCell>{format(new Date(exception.date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTypeLabel(exception.type)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={exception.reason}>{exception.reason}</TableCell>
                    <TableCell>
                      <Badge className={getStatusBadge(exception.status)}>
                        {exception.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {format(new Date(exception.submittedAt), 'MMM dd, HH:mm')}
                    </TableCell>
                    <TableCell className="text-right">
                      {isPending && canApprove ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800"
                            onClick={() => handleApprove(exception.id)}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50 hover:text-red-800"
                            onClick={() => handleReject(exception.id)}
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 text-xs">
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={exceptionsPagination.currentPage}
            totalPages={exceptionsPagination.totalPages}
            onPageChange={exceptionsPagination.goToPage}
            startIndex={exceptionsPagination.startIndex}
            endIndex={exceptionsPagination.endIndex}
            totalItems={exceptionsPagination.totalItems}
          />
        </CardContent>
      </Card>
    </div>
  );
}
