import { useState, useEffect } from 'react';
import { mockContracts, mockEmployees } from '../../data/mockData';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
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
import { DateRangeFilter } from '../common/DateRangeFilter';
import { EmployeeCell } from '../common/EmployeeCell';
import { FileText, AlertCircle, Plus } from 'lucide-react';
import { format, differenceInDays, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';

export function Contracts() {
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });

  const handleDateFilterChange = (startDate: string | null, endDate: string | null) => {
    setDateFilter({ start: startDate, end: endDate });
  };

  let filteredContracts = mockContracts;

  // Apply date filter based on endDate
  if (dateFilter.start || dateFilter.end) {
    filteredContracts = filteredContracts.filter(con => {
      const conDate = parseISO(con.endDate);
      if (dateFilter.start && dateFilter.end) {
        return isWithinInterval(conDate, {
          start: parseISO(dateFilter.start),
          end: parseISO(dateFilter.end),
        });
      } else if (dateFilter.start) {
        return conDate >= parseISO(dateFilter.start);
      } else if (dateFilter.end) {
        return conDate <= parseISO(dateFilter.end);
      }
      return true;
    });
  }

  const expiringContracts = filteredContracts.filter(c => c.status === 'expiring');
  const expiredContracts = filteredContracts.filter(c => c.status === 'expired');
  const activeContracts = filteredContracts.filter(c => c.status === 'active');

  const handleRenewContract = (contractId: string) => {
    toast.success('Contract renewal initiated');
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      active: 'bg-green-100 text-green-800 hover:bg-green-100',
      expiring: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
      expired: 'bg-red-100 text-red-800 hover:bg-red-100',
    };
    return variants[status] || 'bg-gray-100 text-gray-800 hover:bg-gray-100';
  };

  const getDaysUntilExpiry = (endDate: string) => {
    return differenceInDays(new Date(endDate), new Date());
  };

  const contractsPagination = usePagination(filteredContracts, 10);

  useEffect(() => {
    contractsPagination.resetPage();
  }, [dateFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-gray-500">Manage employee contracts and HR information</p>
        </div>
        <div className="flex gap-2">
          <DateRangeFilter onFilterChange={handleDateFilterChange} />
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Contract
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Active Contracts</CardTitle>
            <FileText className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeContracts.length}</div>
            <p className="text-xs text-gray-500">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Expiring Soon</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{expiringContracts.length}</div>
            <p className="text-xs text-gray-500">Within 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Expired</CardTitle>
            <FileText className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{expiredContracts.length}</div>
            <p className="text-xs text-gray-500">Need renewal</p>
          </CardContent>
        </Card>
      </div>

      {expiringContracts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Expiring Contracts - Action Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {expiringContracts.map((contract) => {
                const employee = mockEmployees.find(e => e.id === contract.employeeId);
                const daysLeft = getDaysUntilExpiry(contract.endDate);
                return (
                  <div key={contract.id} className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{employee?.name}</p>
                      <p className="text-sm text-gray-600">
                        Expires on {format(new Date(contract.endDate), 'MMM dd, yyyy')} ({daysLeft} days left)
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {employee?.position} • {employee?.department}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => handleRenewContract(contract.id)}
                    >
                      Renew Contract
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Renewals</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contractsPagination.paginatedItems.map((contract) => {
                const employee = mockEmployees.find(e => e.id === contract.employeeId);
                const daysLeft = getDaysUntilExpiry(contract.endDate);
                const duration = differenceInDays(
                  new Date(contract.endDate),
                  new Date(contract.startDate)
                );
                return (
                  <TableRow key={contract.id}>
                    <TableCell>
                      <EmployeeCell employee={employee} />
                    </TableCell>
                    <TableCell>{employee?.position}</TableCell>
                    <TableCell>{format(new Date(contract.startDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{format(new Date(contract.endDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{Math.floor(duration / 365)} years</TableCell>
                    <TableCell>
                      <Badge className={getStatusBadge(contract.status)}>
                        {contract.status}
                        {contract.status === 'expiring' && ` (${daysLeft}d)`}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{contract.renewalHistory.length}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                        {contract.status === 'expiring' && (
                          <Button
                            size="sm"
                            onClick={() => handleRenewContract(contract.id)}
                          >
                            Renew
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={contractsPagination.currentPage}
            totalPages={contractsPagination.totalPages}
            onPageChange={contractsPagination.goToPage}
            startIndex={contractsPagination.startIndex}
            endIndex={contractsPagination.endIndex}
            totalItems={contractsPagination.totalItems}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contract Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredContracts
              .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
              .map((contract) => {
                const employee = mockEmployees.find(e => e.id === contract.employeeId);
                const daysLeft = getDaysUntilExpiry(contract.endDate);
                return (
                  <div key={contract.id} className="flex items-center gap-4">
                    <div className="w-32 text-sm text-gray-600">
                      {format(new Date(contract.endDate), 'MMM dd, yyyy')}
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{employee?.name}</p>
                          <p className="text-sm text-gray-600">{employee?.position}</p>
                        </div>
                        <Badge className={getStatusBadge(contract.status)}>
                          {daysLeft > 0 ? `${daysLeft} days left` : 'Expired'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
