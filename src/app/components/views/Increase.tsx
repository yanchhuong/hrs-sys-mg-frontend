import { useState, useEffect } from 'react';
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
import { DateRangeFilter } from '../common/DateRangeFilter';
import { mockIncreases } from '../../data/timeworkData';
import { mockEmployees } from '../../data/mockData';
import { TrendingUp, Plus } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';

export function Increase() {
  const [increases] = useState(mockIncreases);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });

  const handleDateFilterChange = (startDate: string | null, endDate: string | null) => {
    setDateFilter({ start: startDate, end: endDate });
  };

  const handleAddIncrease = () => {
    toast.success('Salary increase added successfully');
    setDialogOpen(false);
  };

  let filteredIncreases = increases;

  // Apply date filter based on effectiveDate
  if (dateFilter.start || dateFilter.end) {
    filteredIncreases = filteredIncreases.filter(inc => {
      const incDate = parseISO(inc.effectiveDate);
      if (dateFilter.start && dateFilter.end) {
        return isWithinInterval(incDate, {
          start: parseISO(dateFilter.start),
          end: parseISO(dateFilter.end),
        });
      } else if (dateFilter.start) {
        return incDate >= parseISO(dateFilter.start);
      } else if (dateFilter.end) {
        return incDate <= parseISO(dateFilter.end);
      }
      return true;
    });
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      raise: 'bg-green-100 text-green-800 hover:bg-green-100',
      bonus: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
      promotion: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
    };
    return colors[type] || colors.raise;
  };

  const increasePagination = usePagination(filteredIncreases, 10);

  useEffect(() => {
    increasePagination.resetPage();
  }, [dateFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Salary Increases</h1>
          <p className="text-gray-500">Manage raises, bonuses, and promotions</p>
        </div>
        <div className="flex gap-2">
          <DateRangeFilter onFilterChange={handleDateFilterChange} />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Increase
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Salary Increase</DialogTitle>
              <DialogDescription>Record a raise, bonus, or promotion</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Employee</Label>
                <select className="w-full px-3 py-2 border rounded-md">
                  {mockEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <select className="w-full px-3 py-2 border rounded-md">
                  <option value="raise">Raise</option>
                  <option value="bonus">Bonus</option>
                  <option value="promotion">Promotion</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input type="number" placeholder="500" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <select className="w-full px-3 py-2 border rounded-md">
                    <option value="fixed">Fixed Amount ($)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Effective Date</Label>
                <Input type="date" />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea placeholder="Annual performance review, promotion to senior role, etc." rows={3} />
              </div>
              <Button onClick={handleAddIncrease} className="w-full">
                Add Increase
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {['raise', 'bonus', 'promotion'].map((type) => {
          const count = filteredIncreases.filter((i) => i.type === type).length;
          const total = filteredIncreases
            .filter((i) => i.type === type)
            .reduce((sum, i) => sum + (i.isPercentage ? 0 : i.amount), 0);
          return (
            <Card key={type}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm capitalize">{type}s</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{count}</div>
                <p className="text-xs text-gray-500">
                  {total > 0 ? `$${total.toLocaleString()} total` : 'This year'}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Salary Increase History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Effective Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Approved By</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {increasePagination.paginatedItems.map((increase) => {
                const employee = mockEmployees.find((e) => e.id === increase.employeeId);
                const approver = mockEmployees.find((e) => e.id === increase.approvedBy);
                return (
                  <TableRow key={increase.id}>
                    <TableCell className="font-medium">{employee?.name}</TableCell>
                    <TableCell>
                      <Badge className={getTypeColor(increase.type)}>
                        {increase.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-green-600">
                      +{increase.isPercentage ? `${increase.amount}%` : `$${increase.amount}`}
                    </TableCell>
                    <TableCell>{format(new Date(increase.effectiveDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell className="max-w-xs truncate">{increase.reason}</TableCell>
                    <TableCell>{approver?.name}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {filteredIncreases.length === 0 && (
            <div className="text-center py-12">
              <TrendingUp className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No salary increases recorded</p>
            </div>
          )}
          <Pagination
            currentPage={increasePagination.currentPage}
            totalPages={increasePagination.totalPages}
            onPageChange={increasePagination.goToPage}
            startIndex={increasePagination.startIndex}
            endIndex={increasePagination.endIndex}
            totalItems={increasePagination.totalItems}
          />
        </CardContent>
      </Card>
    </div>
  );
}
