import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
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
import { mockDeductions } from '../../data/timeworkData';
import { mockEmployees } from '../../data/mockData';
import { Minus, Plus } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';

export function Deduction() {
  const [deductions] = useState(mockDeductions);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });

  const handleDateFilterChange = (startDate: string | null, endDate: string | null) => {
    setDateFilter({ start: startDate, end: endDate });
  };

  const handleAddDeduction = () => {
    toast.success('Deduction added successfully');
    setDialogOpen(false);
  };

  let filteredDeductions = deductions;

  // Apply date filter based on startDate
  if (dateFilter.start || dateFilter.end) {
    filteredDeductions = filteredDeductions.filter(ded => {
      const dedDate = parseISO(ded.startDate);
      if (dateFilter.start && dateFilter.end) {
        return isWithinInterval(dedDate, {
          start: parseISO(dateFilter.start),
          end: parseISO(dateFilter.end),
        });
      } else if (dateFilter.start) {
        return dedDate >= parseISO(dateFilter.start);
      } else if (dateFilter.end) {
        return dedDate <= parseISO(dateFilter.end);
      }
      return true;
    });
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      tax: 'bg-red-100 text-red-800 hover:bg-red-100',
      insurance: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
      loan: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
      fine: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
      other: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
    };
    return colors[type] || colors.other;
  };

  const deductionsPagination = usePagination(filteredDeductions, 10);

  useEffect(() => {
    deductionsPagination.resetPage();
  }, [dateFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Salary Deductions</h1>
          <p className="text-gray-500">Manage tax, insurance, loans, and other deductions</p>
        </div>
        <div className="flex gap-2">
          <DateRangeFilter onFilterChange={handleDateFilterChange} />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Deduction
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Salary Deduction</DialogTitle>
              <DialogDescription>Configure a new salary deduction for an employee</DialogDescription>
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
                <Label>Deduction Type</Label>
                <select className="w-full px-3 py-2 border rounded-md">
                  <option value="tax">Tax</option>
                  <option value="insurance">Insurance</option>
                  <option value="loan">Loan</option>
                  <option value="fine">Fine</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input placeholder="e.g., Health Insurance" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input type="number" placeholder="100" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <select className="w-full px-3 py-2 border rounded-md">
                    <option value="fixed">Fixed Amount ($)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" />
                </div>
                <div className="space-y-2">
                  <Label>End Date (Optional)</Label>
                  <Input type="date" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="recurring" />
                <Label htmlFor="recurring">Recurring deduction</Label>
              </div>
              <Button onClick={handleAddDeduction} className="w-full">
                Add Deduction
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {['tax', 'insurance', 'loan', 'fine'].map((type) => {
          const count = filteredDeductions.filter((d) => d.type === type && d.status === 'active').length;
          const total = filteredDeductions
            .filter((d) => d.type === type && d.status === 'active')
            .reduce((sum, d) => sum + (d.isPercentage ? 0 : d.amount), 0);
          return (
            <Card key={type}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm capitalize">{type}</CardTitle>
                <Minus className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{count}</div>
                <p className="text-xs text-gray-500">
                  {total > 0 ? `$${total.toLocaleString()}/mo` : 'Active deductions'}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Deductions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deductionsPagination.paginatedItems.map((deduction) => {
                const employee = mockEmployees.find((e) => e.id === deduction.employeeId);
                return (
                  <TableRow key={deduction.id}>
                    <TableCell className="font-medium">{employee?.name}</TableCell>
                    <TableCell>{deduction.name}</TableCell>
                    <TableCell>
                      <Badge className={getTypeColor(deduction.type)}>
                        {deduction.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-red-600">
                      {deduction.isPercentage ? `${deduction.amount}%` : `$${deduction.amount}`}
                    </TableCell>
                    <TableCell>{format(new Date(deduction.startDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      {deduction.endDate ? format(new Date(deduction.endDate), 'MMM dd, yyyy') : 'Ongoing'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={deduction.status === 'active' ? 'default' : 'secondary'}>
                        {deduction.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                        <Button variant="outline" size="sm">
                          Stop
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={deductionsPagination.currentPage}
            totalPages={deductionsPagination.totalPages}
            onPageChange={deductionsPagination.goToPage}
            startIndex={deductionsPagination.startIndex}
            endIndex={deductionsPagination.endIndex}
            totalItems={deductionsPagination.totalItems}
          />
        </CardContent>
      </Card>
    </div>
  );
}
