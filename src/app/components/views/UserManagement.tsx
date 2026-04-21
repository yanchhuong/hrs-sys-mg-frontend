import { useState } from 'react';
import { mockUsers, mockEmployees, mockDepartments } from '../../data/mockData';
import { User, UserRole } from '../../types/hrms';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { EmployeeCell } from '../common/EmployeeCell';
import {
  Users, UserPlus, Edit, Trash2, Shield, UserCheck, UserX, Key, Lock,
  Save, AlertTriangle,
} from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { format } from 'date-fns';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Role + permission model
// ---------------------------------------------------------------------------
type Action = 'view' | 'create' | 'update' | 'delete';
const ACTIONS: Action[] = ['view', 'create', 'update', 'delete'];
const ACTION_LABELS: Record<Action, string> = {
  view: 'View',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
};
const ACTION_SHORT: Record<Action, string> = {
  view: 'V',
  create: 'C',
  update: 'U',
  delete: 'D',
};

interface ModuleDef {
  key: string;
  label: string;
  description: string;
}
const MODULES: ModuleDef[] = [
  { key: 'dashboard', label: 'Dashboard', description: 'Home overview and widgets' },
  { key: 'employees', label: 'Employees', description: 'Employee master data' },
  { key: 'attendance', label: 'Attendance', description: 'Daily and monthly attendance' },
  { key: 'exception', label: 'Exception', description: 'Attendance exceptions and approvals' },
  { key: 'overtime', label: 'Overtime', description: 'OT requests and approvals' },
  { key: 'deduction', label: 'Deduction', description: 'Salary deductions' },
  { key: 'increase', label: 'Increase', description: 'Salary increases and bonuses' },
  { key: 'payroll', label: 'Payroll', description: 'Payroll batches and payslips' },
  { key: 'reports', label: 'Reports', description: 'Attendance & payroll reporting' },
  { key: 'contracts', label: 'Contracts', description: 'Employment contracts' },
  { key: 'settings', label: 'Settings', description: 'System and policy settings' },
  { key: 'user-management', label: 'User Management', description: 'Users, roles, permissions' },
];

// Default permissions mirror the role-gating currently enforced in the views.
const defaultPermissionFor = (moduleKey: string, role: UserRole, action: Action): boolean => {
  const ADMIN_FULL = ['deduction', 'increase', 'settings', 'user-management'];
  const APPROVAL_MODULES = ['exception', 'overtime'];

  if (role === 'admin') return true;
  if (role === 'manager') {
    if (ADMIN_FULL.includes(moduleKey) && action !== 'view') return false;
    if (moduleKey === 'payroll' && action === 'delete') return false;
    return true;
  }
  // employee
  if (ADMIN_FULL.includes(moduleKey)) return false;
  if (moduleKey === 'reports') return false;
  if (moduleKey === 'contracts') return action === 'view';
  if (moduleKey === 'employees') return action === 'view';
  if (APPROVAL_MODULES.includes(moduleKey)) return action === 'view' || action === 'create';
  return action === 'view';
};

type PermissionMatrix = Record<string, Record<string, Record<Action, boolean>>>;
const buildDefaultMatrix = (): PermissionMatrix => {
  const m: PermissionMatrix = {};
  for (const mod of MODULES) {
    m[mod.key] = {};
    for (const role of ['admin', 'manager', 'employee'] as UserRole[]) {
      m[mod.key][role] = {} as Record<Action, boolean>;
      for (const action of ACTIONS) {
        m[mod.key][role][action] = defaultPermissionFor(mod.key, role, action);
      }
    }
  }
  return m;
};

interface RoleDef {
  key: string;
  name: string;
  description: string;
  icon: typeof Shield;
  badgeClass: string;
  iconColor: string;
  builtIn: boolean;
}
const BUILT_IN_ROLES: RoleDef[] = [
  { key: 'admin', name: 'Administrator', description: 'Full system access including settings, users, payroll generation, and compliance actions.', icon: Shield, badgeClass: 'bg-red-100 text-red-800', iconColor: 'text-red-600', builtIn: true },
  { key: 'manager', name: 'Manager', description: 'Approves exceptions and OT, views their team, runs reports, and processes payroll.', icon: UserCheck, badgeClass: 'bg-blue-100 text-blue-800', iconColor: 'text-blue-600', builtIn: true },
  { key: 'employee', name: 'Employee', description: 'Submits their own exceptions and OT requests, views personal payroll and attendance.', icon: Users, badgeClass: 'bg-gray-100 text-gray-800', iconColor: 'text-gray-600', builtIn: true },
];

const CUSTOM_PALETTE = [
  { badgeClass: 'bg-purple-100 text-purple-800', iconColor: 'text-purple-600' },
  { badgeClass: 'bg-amber-100 text-amber-800', iconColor: 'text-amber-600' },
  { badgeClass: 'bg-teal-100 text-teal-800', iconColor: 'text-teal-600' },
  { badgeClass: 'bg-pink-100 text-pink-800', iconColor: 'text-pink-600' },
  { badgeClass: 'bg-indigo-100 text-indigo-800', iconColor: 'text-indigo-600' },
];

const slugifyRoleKey = (name: string, existing: string[]) => {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'role';
  let key = `custom-${base}`;
  let i = 2;
  while (existing.includes(key)) {
    key = `custom-${base}-${i++}`;
  }
  return key;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function UserManagement() {
  const [users, setUsers] = useState(mockUsers);
  const [customRoles, setCustomRoles] = useState<RoleDef[]>([]);
  const [permissions, setPermissions] = useState<PermissionMatrix>(() => buildDefaultMatrix());
  const [roleDescriptions, setRoleDescriptions] = useState<Record<string, string>>(() =>
    Object.fromEntries(BUILT_IN_ROLES.map(r => [r.key, r.description]))
  );

  const roles: RoleDef[] = [...BUILT_IN_ROLES, ...customRoles];

  // Custom role dialog state
  const [customRoleDialogOpen, setCustomRoleDialogOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [newRoleBase, setNewRoleBase] = useState<'employee' | 'manager' | 'blank'>('employee');
  const [newRoleError, setNewRoleError] = useState<string | null>(null);

  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleDef | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'employee' as User['role'],
    employeeId: '',
    departmentId: '',
    isActive: true,
  });

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        email: user.email,
        password: '',
        role: user.role,
        employeeId: user.employeeId,
        departmentId: user.departmentId || '',
        isActive: user.isActive,
      });
    } else {
      setEditingUser(null);
      setFormData({
        email: '',
        password: '',
        role: 'employee',
        employeeId: '',
        departmentId: '',
        isActive: true,
      });
    }
    setDialogOpen(true);
  };

  const handleSaveUser = () => {
    if (!formData.email || !formData.employeeId || (!editingUser && !formData.password)) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (editingUser) {
      setUsers(users.map(u =>
        u.id === editingUser.id
          ? {
              ...u,
              email: formData.email,
              role: formData.role,
              employeeId: formData.employeeId,
              departmentId: formData.departmentId,
              isActive: formData.isActive,
              ...(formData.password ? { password: formData.password } : {}),
            }
          : u
      ));
      toast.success('User updated successfully');
    } else {
      const newUser: User = {
        id: String(users.length + 1),
        email: formData.email,
        password: formData.password,
        role: formData.role,
        employeeId: formData.employeeId,
        departmentId: formData.departmentId,
        createdAt: new Date().toISOString(),
        isActive: formData.isActive,
      };
      setUsers([...users, newUser]);
      toast.success('User created successfully');
    }

    setDialogOpen(false);
  };

  const handleDeleteUser = (userId: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      setUsers(users.filter(u => u.id !== userId));
      toast.success('User deleted successfully');
    }
  };

  const handleToggleStatus = (userId: string) => {
    setUsers(users.map(u =>
      u.id === userId ? { ...u, isActive: !u.isActive } : u
    ));
    toast.success('User status updated');
  };

  const usersPagination = usePagination(users, 10);

  const getRoleBadge = (role: User['role']) => {
    const def = roles.find(r => r.key === role) || BUILT_IN_ROLES[2];
    const Icon = def.icon;
    return (
      <Badge className={def.badgeClass}>
        <Icon className="h-3 w-3 mr-1" />
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Badge>
    );
  };

  const togglePermission = (moduleKey: string, role: UserRole, action: Action) => {
    setPermissions(prev => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        [role]: {
          ...prev[moduleKey][role],
          [action]: !prev[moduleKey][role][action],
        },
      },
    }));
  };

  const toggleAllForRoleModule = (moduleKey: string, role: UserRole, value: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        [role]: ACTIONS.reduce((acc, a) => ({ ...acc, [a]: value }), {} as Record<Action, boolean>),
      },
    }));
  };

  const handleSavePermissions = () => {
    toast.success('Permissions saved');
  };

  const handleResetPermissions = () => {
    setPermissions(buildDefaultMatrix());
    setCustomRoles([]);
    toast.info('Permissions reset to defaults');
  };

  const userCountByRole = (role: string) => users.filter(u => u.role === role).length;

  const openCustomRoleDialog = () => {
    setNewRoleName('');
    setNewRoleDescription('');
    setNewRoleBase('employee');
    setNewRoleError(null);
    setCustomRoleDialogOpen(true);
  };

  const handleCreateCustomRole = () => {
    const trimmedName = newRoleName.trim();
    if (!trimmedName) {
      setNewRoleError('Role name is required');
      return;
    }
    if (roles.some(r => r.name.toLowerCase() === trimmedName.toLowerCase())) {
      setNewRoleError('A role with this name already exists');
      return;
    }

    const existingKeys = roles.map(r => r.key);
    const key = slugifyRoleKey(trimmedName, existingKeys);
    const palette = CUSTOM_PALETTE[customRoles.length % CUSTOM_PALETTE.length];
    const def: RoleDef = {
      key,
      name: trimmedName,
      description: newRoleDescription.trim() || 'Custom role',
      icon: Key,
      badgeClass: palette.badgeClass,
      iconColor: palette.iconColor,
      builtIn: false,
    };

    // Seed permissions for the new role
    setPermissions(prev => {
      const next = { ...prev };
      for (const mod of MODULES) {
        const seed: Record<Action, boolean> =
          newRoleBase === 'blank'
            ? { view: false, create: false, update: false, delete: false }
            : { ...(prev[mod.key]?.[newRoleBase] ?? { view: false, create: false, update: false, delete: false }) };
        next[mod.key] = { ...(prev[mod.key] ?? {}), [key]: seed };
      }
      return next;
    });

    setCustomRoles([...customRoles, def]);
    setRoleDescriptions(prev => ({ ...prev, [key]: def.description }));
    setCustomRoleDialogOpen(false);
    toast.success(`Custom role "${trimmedName}" created`);
  };

  const handleDeleteCustomRole = () => {
    if (!deleteRoleTarget || deleteRoleTarget.builtIn) return;
    const key = deleteRoleTarget.key;
    setCustomRoles(customRoles.filter(r => r.key !== key));
    setPermissions(prev => {
      const next: PermissionMatrix = {};
      for (const [modKey, roleMap] of Object.entries(prev)) {
        const { [key]: _removed, ...rest } = roleMap;
        next[modKey] = rest;
      }
      return next;
    });
    setRoleDescriptions(prev => {
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
    toast.success(`Custom role "${deleteRoleTarget.name}" deleted`);
    setDeleteRoleTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-gray-500">Manage users, roles, and access permissions</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Total Users</CardTitle>
            <Users className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-xs text-gray-500">System accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.filter(u => u.isActive).length}</div>
            <p className="text-xs text-gray-500">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Administrators</CardTitle>
            <Shield className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.filter(u => u.role === 'admin').length}</div>
            <p className="text-xs text-gray-500">Admin accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Inactive Users</CardTitle>
            <UserX className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.filter(u => !u.isActive).length}</div>
            <p className="text-xs text-gray-500">Deactivated</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList>
          <TabsTrigger value="users">
            <Users className="mr-2 h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Key className="mr-2 h-4 w-4" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="permissions">
            <Lock className="mr-2 h-4 w-4" />
            Permissions
          </TabsTrigger>
        </TabsList>

        {/* Users tab */}
        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>All Users</CardTitle>
                  <CardDescription>{users.length} system accounts</CardDescription>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => handleOpenDialog()}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{editingUser ? 'Edit User' : 'Create New User'}</DialogTitle>
                      <DialogDescription>
                        {editingUser ? 'Update user information and permissions' : 'Create a new user account with access permissions'}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="email">Email *</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="user@company.com"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="password">Password {!editingUser && '*'}</Label>
                          <Input
                            id="password"
                            type="password"
                            placeholder={editingUser ? 'Leave blank to keep current' : 'Enter password'}
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="employeeId">Employee *</Label>
                          <select
                            id="employeeId"
                            value={formData.employeeId}
                            onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md"
                          >
                            <option value="">Select Employee</option>
                            {mockEmployees.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.id} - {emp.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="departmentId">Department</Label>
                          <select
                            id="departmentId"
                            value={formData.departmentId}
                            onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md"
                          >
                            <option value="">Select Department</option>
                            {mockDepartments.map((dept) => (
                              <option key={dept.id} value={dept.id}>
                                {dept.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="role">Role *</Label>
                          <select
                            id="role"
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value as User['role'] })}
                            className="w-full px-3 py-2 border rounded-md"
                          >
                            <option value="employee">Employee</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="isActive">Status</Label>
                          <select
                            id="isActive"
                            value={formData.isActive ? 'active' : 'inactive'}
                            onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'active' })}
                            className="w-full px-3 py-2 border rounded-md"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleSaveUser}>
                          {editingUser ? 'Update User' : 'Create User'}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersPagination.paginatedItems.map((user) => {
                    const employee = mockEmployees.find(e => e.id === user.employeeId);
                    const department = mockDepartments.find(d => d.id === user.departmentId);
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell>
                          {employee ? (
                            <EmployeeCell employee={employee} subtitle={user.employeeId} />
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>{department?.name || '-'}</TableCell>
                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                        <TableCell>
                          {user.isActive ? (
                            <Badge className="bg-green-100 text-green-800">Active</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-800">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{format(new Date(user.createdAt), 'MMM dd, yyyy')}</TableCell>
                        <TableCell className="text-sm">
                          {user.lastLogin ? format(new Date(user.lastLogin), 'MMM dd, HH:mm') : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDialog(user)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleStatus(user.id)}
                            >
                              {user.isActive ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteUser(user.id)}
                            >
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination
                currentPage={usersPagination.currentPage}
                totalPages={usersPagination.totalPages}
                onPageChange={usersPagination.goToPage}
                startIndex={usersPagination.startIndex}
                endIndex={usersPagination.endIndex}
                totalItems={usersPagination.totalItems}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Roles tab */}
        <TabsContent value="roles" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {roles.map((role) => {
              const Icon = role.icon;
              const userCount = userCountByRole(role.key);
              const grants = MODULES.filter(m =>
                ACTIONS.some(a => permissions[m.key]?.[role.key]?.[a])
              ).length;
              return (
                <Card key={role.key}>
                  <CardHeader className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center`}>
                          <Icon className={`h-5 w-5 ${role.iconColor}`} />
                        </div>
                        <CardTitle className="text-lg">{role.name}</CardTitle>
                      </div>
                      <Badge className={role.badgeClass}>{userCount} user{userCount !== 1 ? 's' : ''}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-500">Description</Label>
                      <textarea
                        value={roleDescriptions[role.key] ?? ''}
                        onChange={(e) => setRoleDescriptions(prev => ({ ...prev, [role.key]: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 border rounded-md text-sm resize-none"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 border-t pt-3">
                      <span>Access to <strong className="text-gray-900">{grants}</strong> / {MODULES.length} modules</span>
                      {role.builtIn ? (
                        <Badge variant="outline" className="text-[10px]">Built-in</Badge>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">Custom</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteRoleTarget(role)}
                            title="Delete role"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="text-sm">
                <p className="font-medium">Need a custom role?</p>
                <p className="text-xs text-gray-500">
                  Create a role with its own tailored permission set. Start from an existing role or blank.
                </p>
              </div>
              <Button variant="outline" onClick={openCustomRoleDialog}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Custom Role
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Permissions tab */}
        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>Permission Matrix</CardTitle>
                  <CardDescription>
                    Configure what each role can do per module. V = View, C = Create, U = Update, D = Delete.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleResetPermissions}>
                    Reset to Defaults
                  </Button>
                  <Button onClick={handleSavePermissions}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-200 text-sm text-blue-900">
                <Shield className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Administrator</strong> is the company owner role and always has full access to every module — not configurable here.
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Module</TableHead>
                      {roles.filter(r => r.key !== 'admin').map(role => (
                        <TableHead key={role.key} className="text-center border-l">
                          <div className="flex items-center justify-center gap-1.5">
                            <role.icon className={`h-3.5 w-3.5 ${role.iconColor}`} />
                            {role.name}
                          </div>
                          <div className="flex justify-center gap-4 mt-1.5 text-[10px] font-normal text-gray-400 uppercase tracking-wide">
                            {ACTIONS.map(a => (
                              <span key={a} className="w-6 text-center">{ACTION_SHORT[a]}</span>
                            ))}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MODULES.map((mod) => (
                      <TableRow key={mod.key}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{mod.label}</p>
                            <p className="text-xs text-gray-400">{mod.description}</p>
                          </div>
                        </TableCell>
                        {roles.filter(r => r.key !== 'admin').map(role => {
                          const roleState = permissions[mod.key]?.[role.key];
                          const allOn = ACTIONS.every(a => roleState?.[a]);
                          return (
                            <TableCell key={role.key} className="border-l">
                              <div className="flex items-center justify-center gap-4">
                                {ACTIONS.map(action => (
                                  <div key={action} className="w-6 flex justify-center" title={`${role.name}: ${ACTION_LABELS[action]}`}>
                                    <Checkbox
                                      checked={!!roleState?.[action]}
                                      onCheckedChange={() => togglePermission(mod.key, role.key, action)}
                                      aria-label={`${mod.label} ${role.name} ${ACTION_LABELS[action]}`}
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-center mt-2">
                                <button
                                  type="button"
                                  onClick={() => toggleAllForRoleModule(mod.key, role.key, !allOn)}
                                  className="text-[10px] text-blue-600 hover:underline"
                                >
                                  {allOn ? 'Clear' : 'Grant all'}
                                </button>
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Custom Role dialog */}
      <Dialog open={customRoleDialogOpen} onOpenChange={setCustomRoleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Create Custom Role
            </DialogTitle>
            <DialogDescription>
              Add a role with its own tailored permission set. You can refine permissions in the Permissions tab.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom-role-name">
                Role Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="custom-role-name"
                value={newRoleName}
                onChange={(e) => { setNewRoleName(e.target.value); setNewRoleError(null); }}
                placeholder="e.g. HR Assistant, Auditor, Team Lead"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-role-description">Description</Label>
              <Textarea
                id="custom-role-description"
                value={newRoleDescription}
                onChange={(e) => setNewRoleDescription(e.target.value)}
                placeholder="What does this role do?"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Start from</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'employee', label: 'Employee', hint: 'Copy Employee perms' },
                  { key: 'manager', label: 'Manager', hint: 'Copy Manager perms' },
                  { key: 'blank', label: 'Blank', hint: 'Nothing allowed yet' },
                ] as const).map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setNewRoleBase(opt.key)}
                    className={`p-2.5 border rounded-md text-left transition-colors ${
                      newRoleBase === opt.key
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-[10px] text-gray-500">{opt.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            {newRoleError && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{newRoleError}</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setCustomRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCustomRole}>
              <UserPlus className="h-4 w-4 mr-2" />
              Create Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete custom role confirmation */}
      <AlertDialog open={!!deleteRoleTarget} onOpenChange={(o) => !o && setDeleteRoleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete custom role?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteRoleTarget?.name}" and its permission entries will be removed. Users still referencing this role will fall back to the Employee role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCustomRole} className="bg-red-600 hover:bg-red-700">
              Delete Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
