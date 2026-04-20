import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
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
import { DateRangeFilter } from '../common/DateRangeFilter';
import { mockHolidays } from '../../data/timeworkData';
import { CalendarDays, Plus } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';

export function Holiday() {
  const [holidays] = useState(mockHolidays);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });

  const handleDateFilterChange = (startDate: string | null, endDate: string | null) => {
    setDateFilter({ start: startDate, end: endDate });
  };

  const handleAddHoliday = () => {
    toast.success('Holiday added successfully');
    setDialogOpen(false);
  };

  let filteredHolidays = holidays;

  // Apply date filter
  if (dateFilter.start || dateFilter.end) {
    filteredHolidays = filteredHolidays.filter(hol => {
      const holDate = parseISO(hol.date);
      if (dateFilter.start && dateFilter.end) {
        return isWithinInterval(holDate, {
          start: parseISO(dateFilter.start),
          end: parseISO(dateFilter.end),
        });
      } else if (dateFilter.start) {
        return holDate >= parseISO(dateFilter.start);
      } else if (dateFilter.end) {
        return holDate <= parseISO(dateFilter.end);
      }
      return true;
    });
  }

  const holidayPagination = usePagination(filteredHolidays, 10);

  useEffect(() => {
    holidayPagination.resetPage();
  }, [dateFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Holiday Management</h1>
          <p className="text-gray-500">Configure public and company holidays</p>
        </div>
        <div className="flex gap-2">
          <DateRangeFilter onFilterChange={handleDateFilterChange} />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Holiday
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Holiday</DialogTitle>
              <DialogDescription>Configure a new public or company holiday</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Holiday Name</Label>
                <Input placeholder="e.g., Independence Day" />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <select className="w-full px-3 py-2 border rounded-md">
                  <option value="public">Public Holiday</option>
                  <option value="company">Company Holiday</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isPaid" defaultChecked />
                <Label htmlFor="isPaid">Paid Holiday</Label>
              </div>
              <div className="space-y-2">
                <Label>Description (Optional)</Label>
                <Input placeholder="Additional notes" />
              </div>
              <Button onClick={handleAddHoliday} className="w-full">
                Add Holiday
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Total Holidays</CardTitle>
            <CalendarDays className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredHolidays.length}</div>
            <p className="text-xs text-gray-500">In date range</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Public Holidays</CardTitle>
            <CalendarDays className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredHolidays.filter((h) => h.type === 'public').length}
            </div>
            <p className="text-xs text-gray-500">National holidays</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Company Holidays</CardTitle>
            <CalendarDays className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredHolidays.filter((h) => h.type === 'company').length}
            </div>
            <p className="text-xs text-gray-500">Internal holidays</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Holiday Calendar</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Holiday Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidayPagination.paginatedItems.map((holiday) => (
                <TableRow key={holiday.id}>
                  <TableCell className="font-medium">
                    {format(new Date(holiday.date), 'MMM dd, yyyy')}
                  </TableCell>
                  <TableCell>{holiday.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={holiday.type === 'public' ? 'default' : 'secondary'}
                    >
                      {holiday.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {holiday.isPaid ? (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                        Paid
                      </Badge>
                    ) : (
                      <Badge variant="outline">Unpaid</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {holiday.description || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                      <Button variant="outline" size="sm">
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            currentPage={holidayPagination.currentPage}
            totalPages={holidayPagination.totalPages}
            onPageChange={holidayPagination.goToPage}
            startIndex={holidayPagination.startIndex}
            endIndex={holidayPagination.endIndex}
            totalItems={holidayPagination.totalItems}
          />
        </CardContent>
      </Card>
    </div>
  );
}
