import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { mockEmployees, mockAttendance, mockOTRequests, mockContracts } from '../../data/mockData';
import { Users, Clock, TimerIcon, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { format } from 'date-fns';

export function Dashboard() {
  const { currentUser, currentEmployee } = useAuth();

  const todayAttendance = mockAttendance.filter(
    att => att.date === format(new Date(), 'yyyy-MM-dd')
  );

  const pendingOT = mockOTRequests.filter(req => req.status === 'pending');
  const expiringContracts = mockContracts.filter(c => c.status === 'expiring');

  const myAttendance = currentUser?.role === 'employee'
    ? todayAttendance.find(att => att.employeeId === currentUser.employeeId)
    : null;

  const myPendingOT = currentUser?.role === 'employee'
    ? pendingOT.filter(req => req.employeeId === currentUser.employeeId)
    : pendingOT;

  if (currentUser?.role === 'admin') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Home Dashboard</h1>
          <p className="text-gray-500">Welcome back, {currentEmployee?.name}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mockEmployees.length}</div>
              <p className="text-xs text-gray-500">
                {mockEmployees.filter(e => e.status === 'active').length} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Today's Attendance</CardTitle>
              <Clock className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{todayAttendance.length}</div>
              <p className="text-xs text-gray-500">
                {todayAttendance.filter(a => a.status === 'late').length} late arrivals
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Pending OT Requests</CardTitle>
              <TimerIcon className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingOT.length}</div>
              <p className="text-xs text-gray-500">Require approval</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Expiring Contracts</CardTitle>
              <FileText className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{expiringContracts.length}</div>
              <p className="text-xs text-gray-500">Within 30 days</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {expiringContracts.map(contract => {
                  const employee = mockEmployees.find(e => e.id === contract.employeeId);
                  return (
                    <div key={contract.id} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Contract Expiring Soon</p>
                        <p className="text-sm text-gray-600">
                          {employee?.name}'s contract expires on {format(new Date(contract.endDate), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {pendingOT.slice(0, 2).map(ot => {
                  const employee = mockEmployees.find(e => e.id === ot.employeeId);
                  return (
                    <div key={ot.id} className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                      <TimerIcon className="h-5 w-5 text-orange-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Pending OT Approval</p>
                        <p className="text-sm text-gray-600">
                          {employee?.name} - {ot.hours} hours on {format(new Date(ot.date), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Department Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {['Engineering', 'Human Resources', 'Sales'].map(dept => {
                  const count = mockEmployees.filter(e => e.department === dept).length;
                  return (
                    <div key={dept} className="flex items-center justify-between">
                      <span className="text-sm">{dept}</span>
                      <Badge variant="secondary">{count} employees</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (currentUser?.role === 'manager') {
    const teamMembers = mockEmployees.filter(e => e.managerId === currentUser.employeeId);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Home Dashboard</h1>
          <p className="text-gray-500">Welcome back, {currentEmployee?.name}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Team Members</CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{teamMembers.length}</div>
              <p className="text-xs text-gray-500">Under your management</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Pending Approvals</CardTitle>
              <TimerIcon className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingOT.length}</div>
              <p className="text-xs text-gray-500">OT requests</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Team Attendance</CardTitle>
              <Clock className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {todayAttendance.filter(a => teamMembers.some(t => t.id === a.employeeId)).length}
              </div>
              <p className="text-xs text-gray-500">Present today</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pending OT Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {myPendingOT.map(ot => {
                const employee = mockEmployees.find(e => e.id === ot.employeeId);
                return (
                  <div key={ot.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{employee?.name}</p>
                      <p className="text-sm text-gray-600">
                        {ot.hours} hours on {format(new Date(ot.date), 'MMM dd, yyyy')} - {ot.reason}
                      </p>
                    </div>
                    <Badge variant="secondary">Pending</Badge>
                  </div>
                );
              })}
              {myPendingOT.length === 0 && (
                <p className="text-center text-gray-500 py-4">No pending approvals</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Home Dashboard</h1>
        <p className="text-gray-500">Welcome back, {currentEmployee?.name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Today's Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            {myAttendance ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Check In</span>
                  <span className="font-medium">{myAttendance.checkIn}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Check Out</span>
                  <span className="font-medium">{myAttendance.checkOut || 'Not yet'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Status</span>
                  <Badge variant={myAttendance.status === 'present' ? 'default' : 'secondary'}>
                    {myAttendance.status.replace('_', ' ')}
                  </Badge>
                </div>
                {myAttendance.workHours && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Work Hours</span>
                    <span className="font-medium">{myAttendance.workHours}h</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No attendance record today</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My OT Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {myPendingOT.map(ot => (
                <div key={ot.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{format(new Date(ot.date), 'MMM dd, yyyy')}</p>
                    <p className="text-sm text-gray-600">{ot.hours} hours - {ot.reason}</p>
                  </div>
                  <Badge variant="secondary">{ot.status}</Badge>
                </div>
              ))}
              {myPendingOT.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No pending OT requests</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Position</p>
              <p className="font-medium">{currentEmployee?.position}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Department</p>
              <p className="font-medium">{currentEmployee?.department}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Join Date</p>
              <p className="font-medium">
                {currentEmployee && format(new Date(currentEmployee.joinDate), 'MMM dd, yyyy')}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <Badge variant="default">{currentEmployee?.status}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
