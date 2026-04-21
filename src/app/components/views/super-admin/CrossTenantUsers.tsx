import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import { Search, KeyRound, UserX, UserCheck, Shield, UsersRound } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { mockCompanies, mockPlatformUsers, PlatformUser } from '../../../data/platformData';
import { usePagination } from '../../../hooks/usePagination';
import { Pagination } from '../../common/Pagination';

export function CrossTenantUsers() {
  const [users, setUsers] = useState<PlatformUser[]>(mockPlatformUsers);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [roleTab, setRoleTab] = useState<'all' | 'admin' | 'manager' | 'employee'>('all');
  const [resetTarget, setResetTarget] = useState<PlatformUser | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<PlatformUser | null>(null);

  const companyById = useMemo(() => new Map(mockCompanies.map(c => [c.id, c])), []);

  const counts = useMemo(() => ({
    all:      users.length,
    admin:    users.filter(u => u.role === 'admin').length,
    manager:  users.filter(u => u.role === 'manager').length,
    employee: users.filter(u => u.role === 'employee').length,
  }), [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      if (roleTab !== 'all' && u.role !== roleTab) return false;
      if (companyFilter !== 'all' && u.companyId !== companyFilter) return false;
      if (q) {
        const company = companyById.get(u.companyId);
        const hay = `${u.name} ${u.email} ${company?.name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, search, companyFilter, roleTab, companyById]);

  const pager = usePagination(filtered, 10);

  const roleBadge = (role: PlatformUser['role']) => {
    const map: Record<string, string> = {
      admin:    'bg-red-100 text-red-800',
      manager:  'bg-blue-100 text-blue-800',
      employee: 'bg-gray-100 text-gray-800',
    };
    const Icon = role === 'admin' ? Shield : role === 'manager' ? UserCheck : UsersRound;
    return (
      <Badge className={map[role]}>
        <Icon className="h-3 w-3 mr-1" />
        {role}
      </Badge>
    );
  };

  const handleResetPassword = () => {
    if (!resetTarget) return;
    toast.success(`Password reset email sent to ${resetTarget.email}`);
    setResetTarget(null);
  };

  const handleToggleActive = () => {
    if (!suspendTarget) return;
    setUsers(prev => prev.map(u => u.id === suspendTarget.id ? { ...u, isActive: !u.isActive } : u));
    toast.success(
      suspendTarget.isActive
        ? `Suspended ${suspendTarget.email}`
        : `Reactivated ${suspendTarget.email}`,
    );
    setSuspendTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { key: 'all',      label: 'Total Users', value: counts.all,      cls: 'text-gray-900',   Icon: UsersRound },
          { key: 'admin',    label: 'Admins',      value: counts.admin,    cls: 'text-red-700',    Icon: Shield },
          { key: 'manager',  label: 'Managers',    value: counts.manager,  cls: 'text-blue-700',   Icon: UserCheck },
          { key: 'employee', label: 'Employees',   value: counts.employee, cls: 'text-gray-700',   Icon: UsersRound },
        ] as const).map(s => {
          const Icon = s.Icon;
          return (
            <Card key={s.key}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
                <Icon className={`h-5 w-5 ${s.cls}`} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>All Users (across tenants)</CardTitle>
            <Tabs value={roleTab} onValueChange={(v) => setRoleTab(v as typeof roleTab)}>
              <TabsList>
                <TabsTrigger value="all">All <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{counts.all}</Badge></TabsTrigger>
                <TabsTrigger value="admin">Admin <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-red-100 text-red-800">{counts.admin}</Badge></TabsTrigger>
                <TabsTrigger value="manager">Manager <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-blue-100 text-blue-800">{counts.manager}</Badge></TabsTrigger>
                <TabsTrigger value="employee">Employee <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-gray-100 text-gray-700">{counts.employee}</Badge></TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, email, or company…"
                className="pl-8 h-9"
              />
            </div>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="h-9 px-3 border rounded-md text-sm min-w-[200px]"
            >
              <option value="all">All companies</option>
              {mockCompanies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.paginatedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-gray-400 py-10">
                    No users match these filters.
                  </TableCell>
                </TableRow>
              )}
              {pager.paginatedItems.map(u => {
                const company = companyById.get(u.companyId);
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </TableCell>
                    <TableCell className="text-sm">{company?.name ?? '—'}</TableCell>
                    <TableCell>{roleBadge(u.role)}</TableCell>
                    <TableCell>
                      {u.isActive
                        ? <Badge className="bg-green-100 text-green-800">Active</Badge>
                        : <Badge className="bg-gray-100 text-gray-700">Suspended</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {u.lastLogin ? format(new Date(u.lastLogin), 'MMM dd, HH:mm') : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {format(new Date(u.createdAt), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => setResetTarget(u)}
                          title="Reset password"
                        >
                          <KeyRound className="h-3.5 w-3.5 mr-1" />
                          Reset
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className={`h-7 text-xs ${u.isActive ? 'text-amber-700 hover:bg-amber-50' : 'text-green-700 hover:bg-green-50'}`}
                          onClick={() => setSuspendTarget(u)}
                          title={u.isActive ? 'Suspend' : 'Reactivate'}
                        >
                          {u.isActive
                            ? <><UserX className="h-3.5 w-3.5 mr-1" />Suspend</>
                            : <><UserCheck className="h-3.5 w-3.5 mr-1" />Reactivate</>}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={pager.currentPage}
            totalPages={pager.totalPages}
            onPageChange={pager.goToPage}
            startIndex={pager.startIndex}
            endIndex={pager.endIndex}
            totalItems={pager.totalItems}
          />
        </CardContent>
      </Card>

      {/* Reset password confirmation */}
      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset password for {resetTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              A one-time password-reset link will be emailed. The user's current password stops working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetPassword}>Send reset email</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Suspend / reactivate confirmation */}
      <AlertDialog open={!!suspendTarget} onOpenChange={(o) => !o && setSuspendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendTarget?.isActive ? 'Suspend' : 'Reactivate'} {suspendTarget?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendTarget?.isActive
                ? 'Active sessions are revoked and the user cannot sign in until reactivated.'
                : 'The user regains immediate access. Their role and permissions are unchanged.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleActive}>
              {suspendTarget?.isActive ? 'Suspend' : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
