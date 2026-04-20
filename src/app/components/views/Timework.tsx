import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
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
import { mockTimetables, mockShifts } from '../../data/timeworkData';
import { Clock, Plus, Calendar } from 'lucide-react';
import { toast } from 'sonner';

export function Timework() {
  const [timetables] = useState(mockTimetables);
  const [shifts] = useState(mockShifts);

  const timetablePagination = usePagination(timetables, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Time Work Management</h1>
        <p className="text-gray-500">Manage timetables, shifts, and schedules</p>
      </div>

      <Tabs defaultValue="timetable" className="space-y-6">
        <TabsList>
          <TabsTrigger value="timetable">
            <Clock className="mr-2 h-4 w-4" />
            Timetable Management
          </TabsTrigger>
          <TabsTrigger value="shift">
            <Calendar className="mr-2 h-4 w-4" />
            Shift Management
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timetable" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Timetables</CardTitle>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Timetable
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Start Time</TableHead>
                    <TableHead>End Time</TableHead>
                    <TableHead>Break</TableHead>
                    <TableHead>Working Hours</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timetablePagination.paginatedItems.map((tt) => (
                    <TableRow key={tt.id}>
                      <TableCell className="font-medium">{tt.name}</TableCell>
                      <TableCell>{tt.startTime}</TableCell>
                      <TableCell>{tt.endTime}</TableCell>
                      <TableCell>
                        {tt.breakStart && tt.breakEnd
                          ? `${tt.breakStart} - ${tt.breakEnd}`
                          : '-'}
                      </TableCell>
                      <TableCell>{tt.workingHours}h</TableCell>
                      <TableCell>
                        <Badge variant={tt.isActive ? 'default' : 'secondary'}>
                          {tt.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                currentPage={timetablePagination.currentPage}
                totalPages={timetablePagination.totalPages}
                onPageChange={timetablePagination.goToPage}
                startIndex={timetablePagination.startIndex}
                endIndex={timetablePagination.endIndex}
                totalItems={timetablePagination.totalItems}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shift" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Shifts</CardTitle>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Shift
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {shifts.map((shift) => {
                  const timetable = timetables.find((t) => t.id === shift.timetableId);
                  return (
                    <Card key={shift.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <div
                            className="w-12 h-12 rounded-lg"
                            style={{ backgroundColor: shift.color }}
                          />
                          <Badge variant={shift.isActive ? 'default' : 'secondary'}>
                            {shift.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-lg mb-2">{shift.name}</h3>
                        <div className="space-y-2 text-sm text-gray-600">
                          <p>Type: {shift.type}</p>
                          <p>Timetable: {timetable?.name}</p>
                          <p>
                            Hours: {timetable?.startTime} - {timetable?.endTime}
                          </p>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <Button variant="outline" size="sm" className="flex-1">
                            Edit
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1">
                            Assign
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
