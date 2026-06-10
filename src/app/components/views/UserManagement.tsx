import { useState, useEffect } from 'react';
import { mockUsers, mockEmployees, mockDepartments } from '../../data/mockData';
import { Employee, User, UserRole } from '../../types/hrms';
import * as usersApi from '../../api/users';
import * as employeesApi from '../../api/employees';
import * as departmentsApi from '../../api/departments';
import * as rolesApi from '../../api/roles';
import { USE_MOCKS } from '../../api/client';
import { makeDeptName } from '../../utils/deptName';
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
  Popover, PopoverContent, PopoverTrigger,
} from '../ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '../ui/command';
import {
  Users, UserPlus, Edit, Trash2, Shield, UserCheck, UserX, Key, Lock,
  Save, AlertTriangle, ChevronsUpDown, Check, Info,
} from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useI18n } from '../../i18n/I18nContext';
import { useDateFormat } from '../../context/DateFormatContext';

// ---------------------------------------------------------------------------
// Role + permission model
// ---------------------------------------------------------------------------
// Two axes share the role_permissions table:
//   Menu Access — V/C/U/D, what the role can DO on a module.
//   Data Access — O/M/A,   what RECORDS the role can see.
type MenuAction  = 'view' | 'create' | 'update' | 'delete';
type ScopeAction = 'scope_owner' | 'scope_member' | 'scope_all';
type Action      = MenuAction | ScopeAction;
const MENU_ACTIONS:  MenuAction[]  = ['view', 'create', 'update', 'delete'];
const SCOPE_ACTIONS: ScopeAction[] = ['scope_owner', 'scope_member', 'scope_all'];
const ACTIONS: Action[] = [...MENU_ACTIONS, ...SCOPE_ACTIONS];
const ACTION_LABELS: Record<Action, string> = {
  view: 'View',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  scope_owner:  'Data — Owner (own records)',
  scope_member: 'Data — Member (direct reports)',
  scope_all:    'Data — All (tenant-wide)',
};
const ACTION_SHORT: Record<Action, string> = {
  view: 'V',
  create: 'C',
  update: 'U',
  delete: 'D',
  scope_owner:  'O',
  scope_member: 'M',
  scope_all:    'A',
};

interface ModuleDef {
  key: string;
  label: string;
  description: string;
  /** Optional parent module key. When set, this row renders indented
   *  under its parent in the Permission Matrix so admins can see at
   *  a glance which rows are sub-menus (e.g. Attendance Report is a
   *  sub-tab of Reports). Cascading behaviour is intentionally NOT
   *  applied — independent permission per sub-module is the point. */
  parent?: string;
  /** Section divider — renders as a labelled separator spanning all
   *  role columns instead of a per-action checkbox row. Used for the
   *  sidebar groups (Time Tracking, Payroll Management, Settings)
   *  that organize children but aren't real permission gates
   *  themselves. */
  header?: boolean;
}
// Matrix order mirrors the sidebar (nav.ts NAV_GROUPS + NAV_LEAVES)
// so admins reading rows top-to-bottom see the same shape they see
// in the navigation. Header rows (`header: true`) are the sidebar
// group labels — Time Tracking / Payroll Management / Settings —
// and don't carry their own permissions (no backend gate). Reports
// is a real permission module so it keeps its checkbox row + indents
// its sub-tabs underneath, same as the other parents.
const MODULES: ModuleDef[] = [
  { key: 'dashboard',         label: 'Dashboard',         description: 'Home overview and widgets' },
  { key: 'employees',         label: 'Employees',         description: 'Employee master data' },

  { key: 'time-tracking',     label: 'Time Tracking',     description: '',                                                            header: true },
  { key: 'attendance',        label: 'Attendance',        description: 'Daily and monthly attendance',                                parent: 'time-tracking' },
  { key: 'overtime',          label: 'Overtime',          description: 'OT requests and approvals',                                   parent: 'time-tracking' },
  { key: 'all-leave',         label: 'All Leave',         description: 'Leave requests (Annual / Sick / Special / Maternity)',       parent: 'time-tracking' },
  { key: 'exception',         label: 'Exception',         description: 'Long-term opt-outs and day exceptions',                      parent: 'time-tracking' },

  { key: 'payroll-mgmt',      label: 'Payroll Management', description: '',                                                           header: true },
  { key: 'payroll',           label: 'Payroll',           description: 'Admin: all batches & payslips. Manager / Employee: own payslip only.', parent: 'payroll-mgmt' },
  { key: 'benefit-calculator',label: 'Benefit Calculator', description: 'Severance / NSSF / FdC simulators',                          parent: 'payroll-mgmt' },
  { key: 'increase',          label: 'Increase',          description: 'Salary increases and bonuses',                                parent: 'payroll-mgmt' },
  { key: 'deduction',         label: 'Deduction',         description: 'Salary deductions',                                           parent: 'payroll-mgmt' },

  { key: 'reports',           label: 'Reports',           description: 'Attendance & payroll reporting' },
  { key: 'attendance-report', label: 'Attendance Report', description: 'Per-employee hours + late + leave used',                      parent: 'reports' },
  { key: 'payroll-report',    label: 'Payroll Report',    description: 'Monthly payroll batches and earnings breakdown',              parent: 'reports' },
  { key: 'compliance',        label: 'Compliance',        description: 'NSSF / tax / labour-law compliance summary',                  parent: 'reports' },

  { key: 'accounting',        label: 'Accountant',        description: '',                                                            header: true },
  { key: 'customer',          label: 'Customers',         description: 'Individual + business customers (TIN, representative, site)', parent: 'accounting' },

  { key: 'settings-group',    label: 'Settings',          description: '',                                                            header: true },
  { key: 'settings',          label: 'General Settings',  description: 'System and policy settings',                                  parent: 'settings-group' },
  { key: 'user-management',   label: 'User Management',   description: 'Users, roles, permissions',                                   parent: 'settings-group' },
];

/**
 * Backend modules the matrix doesn't surface but {@code @perm.allow} still
 * checks at the API level (Contracts is the canonical example — it was
 * removed from the visible matrix to keep the grid compact, but the
 * Contracts endpoints still gate on it). Custom roles created from the
 * Admin base seed full grants on these so they don't silently 403.
 */
const HIDDEN_MODULES_FOR_ADMIN_SEED = ['contracts'] as const;

// Default permissions per role. The Permission Matrix UI calls this for
// every (module, role, action) combo so "Reset to Defaults" produces a
// stable baseline. Admin always returns true — they're the company
// owner and not configurable here.
//
// Data Access (O/M/A) is its own axis:
//   admin   → All
//   manager → Owner + Member (own + direct reports)
//   employee → Owner only
const defaultPermissionFor = (moduleKey: string, role: UserRole, action: Action): boolean => {
  // Data Access defaults first — they're orthogonal to the per-module
  // Menu Access table below.
  if (action === 'scope_owner' || action === 'scope_member' || action === 'scope_all') {
    if (role === 'admin')   return action === 'scope_all';
    if (role === 'manager') return action === 'scope_owner' || action === 'scope_member';
    return action === 'scope_owner';
  }

  if (role === 'admin') return true;

  // Sub-modules inherit the default of their parent — Attendance
  // Report defaults to whatever Reports defaults to, Benefit
  // Calculator defaults to Payroll's defaults, etc. Skip when the
  // parent is a header (Time Tracking, Payroll Mgmt, Settings) —
  // those exist only for visual grouping and have no real defaults
  // of their own; the child should fall through to its own switch
  // case below instead of inheriting deny.
  const parentKey = MODULES.find(m => m.key === moduleKey)?.parent;
  if (parentKey) {
    const parentDef = MODULES.find(m => m.key === parentKey);
    if (parentDef && !parentDef.header) {
      return defaultPermissionFor(parentKey, role, action);
    }
  }

  // Per-module Menu Access defaults. Anything not listed → no grant
  // (Dashboard, Employees, Deduction, Increase, Reports, Contracts,
  // Settings, User Management — admin-only by default).
  if (role === 'manager') {
    switch (moduleKey) {
      case 'attendance': return action === 'view';
      case 'all-leave':  return action === 'view' || action === 'create' || action === 'update';
      case 'exception':  return true;                     // V / C / U / D
      case 'overtime':   return true;                     // V / C / U / D
      case 'payroll':    return action === 'view';        // own payslip only
      default:           return false;
    }
  }

  // Employee — file own leave / OT, view own payslip + attendance.
  switch (moduleKey) {
    case 'attendance': return action === 'view';
    case 'all-leave':  return action === 'view' || action === 'create';
    case 'exception':  return action === 'view' || action === 'create';
    case 'overtime':   return action === 'view' || action === 'create';
    case 'payroll':    return action === 'view';
    default:           return false;
  }
};

type PermissionMatrix = Record<string, Record<string, Record<Action, boolean>>>;
const buildDefaultMatrix = (): PermissionMatrix => {
  const m: PermissionMatrix = {};
  for (const mod of MODULES) {
    // Header rows are visual-only — they don't carry permission state.
    if (mod.header) continue;
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
// Adapters (live-mode → mock UI shape)
// ---------------------------------------------------------------------------
// Mirrors Employees.tsx: user-facing `id` holds the human empNo; backend UUID
// is kept on `apiId` and used only for mutating API calls.
function adaptApiEmployee(e: employeesApi.Employee): Employee {
  return {
    id: e.empNo,
    apiId: e.id,
    name: e.name,
    khmerName: e.khmerName ?? undefined,
    email: e.email,
    position: e.position,
    department: e.departmentId ?? '-',
    joinDate: e.joinDate,
    status: (e.status === 'active' ? 'active' : 'inactive') as Employee['status'],
    contactNumber: e.contactNumber ?? '',
    baseSalary: e.baseSalary,
    managerId: e.managerId ?? undefined,
    profileImage: e.profileImage ?? undefined,
    gender: (e.gender === 'male' || e.gender === 'female') ? e.gender : undefined,
    dateOfBirth: e.dateOfBirth ?? undefined,
    placeOfBirth: e.placeOfBirth ?? undefined,
    currentAddress: e.currentAddress ?? undefined,
    nffNo: e.nffNo ?? undefined,
    tid: e.tid ?? undefined,
    contractExpireDate: e.contractExpireDate ?? undefined,
  };
}

// Backend User → mock User shape. `password` and `permissions` aren't part of
// the backend DTO — keep placeholders so legacy UI continues to type-check.
function adaptApiUser(u: usersApi.User): User {
  return {
    id: u.id,
    email: u.email,
    password: '',
    role: u.role as User['role'],
    employeeId: u.employeeId ?? '',
    departmentId: u.departmentId ?? undefined,
    isActive: u.isActive,
    lastLogin: u.lastLogin ?? undefined,
    createdAt: u.createdAt ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function UserManagement() {
  const { t } = useI18n();
  const { formatDate } = useDateFormat();
  const [users, setUsers] = useState<User[]>(USE_MOCKS ? mockUsers : []);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [deptList, setDeptList] = useState<departmentsApi.Department[]>([]);
  const [, setLoading] = useState<boolean>(!USE_MOCKS);

  const deptName = makeDeptName(deptList, '');

  const loadUsers = async () => {
    if (USE_MOCKS) {
      setUsers([...mockUsers]);
      return;
    }
    try {
      const res = await usersApi.list({ size: 200 });
      setUsers(res.data.map(adaptApiUser));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load users');
    }
  };

  const loadEmployees = async () => {
    if (USE_MOCKS) {
      setEmployees([...mockEmployees]);
      return;
    }
    try {
      const res = await employeesApi.list({ size: 500 });
      setEmployees(res.content.map(adaptApiEmployee));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load employees');
    }
  };

  const loadDepartments = async () => {
    if (USE_MOCKS) {
      setDeptList(mockDepartments.map(d => ({ id: d.id, name: d.name })));
      return;
    }
    try {
      setDeptList(await departmentsApi.list());
    } catch (err) {
      console.warn('Could not load departments', err);
    }
  };

  const [customRoles, setCustomRoles] = useState<RoleDef[]>([]);
  const [permissions, setPermissions] = useState<PermissionMatrix>(() => buildDefaultMatrix());
  const [roleDescriptions, setRoleDescriptions] = useState<Record<string, string>>(() =>
    Object.fromEntries(BUILT_IN_ROLES.map(r => [r.key, r.description]))
  );

  /**
   * Load roles + their permission grids from the backend and merge into local
   * state. Custom roles (isBuiltin=false) become entries in `customRoles`.
   * Built-in roles only contribute their description and grid.
   */
  const loadRolesAndPermissions = async () => {
    if (USE_MOCKS) return;
    try {
      const apiRoles = await rolesApi.list();
      // Pull every grid in parallel; one failure shouldn't kill the others.
      const grids = await Promise.all(apiRoles.map(async r => {
        try { return [r.key, await rolesApi.getPermissions(r.key)] as const; }
        catch { return [r.key, [] as rolesApi.RolePermission[]] as const; }
      }));
      const gridMap = new Map(grids);

      // Custom roles → RoleDef list. Use the rotating colour palette so
      // each custom role gets a distinct icon tint.
      const customs: RoleDef[] = [];
      apiRoles.filter(r => !r.isBuiltin).forEach((r, i) => {
        const palette = CUSTOM_PALETTE[i % CUSTOM_PALETTE.length];
        customs.push({
          key: r.key,
          name: r.name,
          description: r.description ?? 'Custom role',
          icon: Key,
          badgeClass: palette.badgeClass,
          iconColor: palette.iconColor,
          builtIn: false,
        });
      });
      setCustomRoles(customs);

      // Merge grids into the permission matrix. Start from the default
      // built-in matrix so missing keys still resolve.
      setPermissions(() => {
        const next = buildDefaultMatrix();
        for (const r of apiRoles) {
          const grid = gridMap.get(r.key) ?? [];
          for (const mod of MODULES) {
            if (!next[mod.key]) next[mod.key] = {};
            if (!next[mod.key][r.key]) {
              next[mod.key][r.key] = { view: false, create: false, update: false, delete: false };
            }
          }
          for (const p of grid) {
            const m = next[p.module];
            if (!m) continue;
            if (!m[r.key]) m[r.key] = { view: false, create: false, update: false, delete: false };
            m[r.key][p.action as Action] = !!p.granted;
          }
        }
        return next;
      });

      // Description map covers built-in + custom roles.
      setRoleDescriptions(prev => {
        const next = { ...prev };
        apiRoles.forEach(r => { next[r.key] = r.description ?? next[r.key] ?? ''; });
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load roles');
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadUsers(), loadEmployees(), loadDepartments(), loadRolesAndPermissions()]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roles: RoleDef[] = [...BUILT_IN_ROLES, ...customRoles];

  // Custom role dialog state
  const [customRoleDialogOpen, setCustomRoleDialogOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  // Custom roles always start from Admin (full access). The admin then
  // refines the grid in the Permissions tab — that's the workflow per the
  // matrix screenshot, so the dialog no longer asks for a starting point.
  const [newRoleBase] = useState<'employee' | 'manager' | 'admin' | 'blank'>('admin');
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

  const handleSaveUser = async () => {
    if (!formData.email || !formData.employeeId || (!editingUser && !formData.password)) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (USE_MOCKS) {
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
      return;
    }

    try {
      if (editingUser) {
        // PATCH semantics — only send fields whose value diverges from the
        // current user record. Email change isn't supported by the backend
        // PATCH DTO, so we leave it out.
        const patch: usersApi.UpdateUserRequest = {};
        if (formData.role !== editingUser.role) patch.role = formData.role as usersApi.UserRole;
        if (formData.employeeId !== (editingUser.employeeId ?? '')) {
          patch.employeeId = formData.employeeId || null;
        }
        if ((formData.departmentId || '') !== (editingUser.departmentId ?? '')) {
          patch.departmentId = formData.departmentId || null;
        }
        // Password is only sent when the admin typed a new one. The
        // form's placeholder reads 'Leave blank to keep current' so
        // the empty-string case is the explicit no-op signal. Server
        // re-hashes via BCrypt and enforces the 8-char minimum; a
        // shorter value bounces back as a 400 with the policy
        // message which we surface in the catch toast below.
        if (formData.password) {
          patch.password = formData.password;
        }
        await usersApi.update(editingUser.id, patch);
        toast.success(
          formData.password
            ? 'User updated. New password is active immediately.'
            : 'User updated successfully',
        );
      } else {
        await usersApi.create({
          email: formData.email,
          role: formData.role as usersApi.UserRole,
          employeeId: formData.employeeId || undefined,
          departmentId: formData.departmentId || undefined,
          initialPassword: formData.password || undefined,
        });
        toast.success('User created successfully');
      }
      setDialogOpen(false);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save user');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    if (USE_MOCKS) {
      setUsers(users.filter(u => u.id !== userId));
      toast.success('User deleted successfully');
      return;
    }

    try {
      await usersApi.remove(userId);
      toast.success('User deleted successfully');
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleToggleStatus = async (userId: string) => {
    const target = users.find(u => u.id === userId);
    if (!target) return;

    if (USE_MOCKS) {
      setUsers(users.map(u =>
        u.id === userId ? { ...u, isActive: !u.isActive } : u
      ));
      toast.success('User status updated');
      return;
    }

    try {
      if (target.isActive) {
        await usersApi.suspend(userId);
      } else {
        await usersApi.reactivate(userId);
      }
      toast.success('User status updated');
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleResetPassword = async (user: User) => {
    if (USE_MOCKS) {
      toast.success(`Reset link sent to ${user.email}`);
      return;
    }
    try {
      await usersApi.resetPassword(user.id);
      toast.success(`Reset link sent to ${user.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password');
    }
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
    // "Grant all" / "Clear" only flips the Menu Access axis. Data Access
    // (O/M/A) is independent and stays as the admin set it so a quick
    // Clear doesn't wipe out a deliberate scope configuration.
    setPermissions(prev => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        [role]: {
          ...prev[moduleKey][role],
          ...MENU_ACTIONS.reduce((acc, a) => ({ ...acc, [a]: value }), {} as Record<MenuAction, boolean>),
        },
      },
    }));
  };

  const handleSavePermissions = async () => {
    if (USE_MOCKS) {
      toast.success('Permissions saved');
      return;
    }
    // PUT one grid per role (admin row is always full access — backend
    // rejects writes against admin, so skip it client-side too).
    const targets = roles.filter(r => r.key !== 'admin');
    try {
      await Promise.all(targets.map(role => {
        const grid: rolesApi.RolePermission[] = [];
        for (const mod of MODULES) {
          for (const action of ACTIONS) {
            grid.push({
              module: mod.key as rolesApi.PermissionModule,
              action: action as rolesApi.PermissionAction,
              granted: !!permissions[mod.key]?.[role.key]?.[action],
            });
          }
        }
        return rolesApi.replacePermissions(role.key, grid);
      }));
      toast.success(`Saved permissions for ${targets.length} role${targets.length === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save permissions');
    }
  };

  const handleResetPermissions = () => {
    // Local-only — re-fetch is the way to discard unsaved tweaks against
    // the backend; for live mode we re-pull the saved grids.
    if (USE_MOCKS) {
      setPermissions(buildDefaultMatrix());
      setCustomRoles([]);
      toast.info('Permissions reset to defaults');
      return;
    }
    void loadRolesAndPermissions();
    toast.info('Reverted to last saved permissions');
  };

  const userCountByRole = (role: string) => users.filter(u => u.role === role).length;

  const openCustomRoleDialog = () => {
    setNewRoleName('');
    setNewRoleDescription('');
    setNewRoleError(null);
    setCustomRoleDialogOpen(true);
  };

  const handleCreateCustomRole = async () => {
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
    const description = newRoleDescription.trim() || 'Custom role';
    // Backend supports baseRole=employee|manager. For "admin" (full perms)
    // and "blank" we send undefined and seed perms ourselves below.
    const baseRole: 'employee' | 'manager' | undefined =
      newRoleBase === 'employee' || newRoleBase === 'manager' ? newRoleBase : undefined;
    const fullAccess: Record<Action, boolean> =
      { view: true, create: true, update: true, delete: true };
    const noAccess: Record<Action, boolean> =
      { view: false, create: false, update: false, delete: false };

    if (USE_MOCKS) {
      const def: RoleDef = {
        key, name: trimmedName, description,
        icon: Key, badgeClass: palette.badgeClass, iconColor: palette.iconColor,
        builtIn: false,
      };
      // Seed permissions locally for the new role.
      setPermissions(prev => {
        const next = { ...prev };
        for (const mod of MODULES) {
          const seed: Record<Action, boolean> =
            newRoleBase === 'admin'  ? { ...fullAccess }
            : newRoleBase === 'blank' ? { ...noAccess }
            : { ...(prev[mod.key]?.[newRoleBase] ?? noAccess) };
          next[mod.key] = { ...(prev[mod.key] ?? {}), [key]: seed };
        }
        return next;
      });
      setCustomRoles([...customRoles, def]);
      setRoleDescriptions(prev => ({ ...prev, [key]: description }));
      setCustomRoleDialogOpen(false);
      toast.success(`Custom role "${trimmedName}" created`);
      return;
    }

    // Live mode — backend persists role + seeds permissions from baseRole
    // when it's employee/manager. For "admin" we create with no base, then
    // PUT the full V/C/U/D=true grid for every module.
    try {
      await rolesApi.create({ key, name: trimmedName, description, baseRole });
      if (newRoleBase === 'admin') {
        const fullGrid: rolesApi.RolePermission[] = [];
        // Visible modules from the matrix.
        for (const mod of MODULES) {
          for (const action of ACTIONS) {
            fullGrid.push({
              module: mod.key as rolesApi.PermissionModule,
              action: action as rolesApi.PermissionAction,
              granted: true,
            });
          }
        }
        // Backend gates on a few modules that aren't shown in the matrix
        // (e.g. contracts). Without these the role would silently 403 on
        // endpoints like /api/v1/contracts even though the user picked
        // "Admin base — full access". Seed them granted by default.
        for (const modKey of HIDDEN_MODULES_FOR_ADMIN_SEED) {
          for (const action of ACTIONS) {
            fullGrid.push({
              module: modKey as rolesApi.PermissionModule,
              action: action as rolesApi.PermissionAction,
              granted: true,
            });
          }
        }
        await rolesApi.replacePermissions(key, fullGrid);
      }
      await loadRolesAndPermissions();
      setCustomRoleDialogOpen(false);
      toast.success(`Custom role "${trimmedName}" created`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create role';
      setNewRoleError(msg);
      toast.error(msg);
    }
  };

  const handleDeleteCustomRole = async () => {
    if (!deleteRoleTarget || deleteRoleTarget.builtIn) return;
    const key = deleteRoleTarget.key;
    const name = deleteRoleTarget.name;

    if (USE_MOCKS) {
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
      toast.success(`Custom role "${name}" deleted`);
      setDeleteRoleTarget(null);
      return;
    }

    try {
      await rolesApi.remove(key);
      await loadRolesAndPermissions();
      toast.success(`Custom role "${name}" deleted`);
      setDeleteRoleTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete role');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('page.usermgmt.title')}</h1>
          <p className="text-gray-500">{t('page.usermgmt.description')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Users className="h-5 w-5 text-gray-600" />
              <span className="text-2xl font-bold text-gray-700">{users.length}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Total Users</p>
            <p className="text-[11px] text-gray-500 truncate">System accounts</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <UserCheck className="h-5 w-5 text-green-600" />
              <span className="text-2xl font-bold text-green-600">{users.filter(u => u.isActive).length}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Active Users</p>
            <p className="text-[11px] text-gray-500 truncate">Currently active</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Shield className="h-5 w-5 text-red-600" />
              <span className="text-2xl font-bold text-red-600">{users.filter(u => u.role === 'admin').length}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Administrators</p>
            <p className="text-[11px] text-gray-500 truncate">Admin accounts</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <UserX className="h-5 w-5 text-gray-600" />
              <span className="text-2xl font-bold text-gray-500">{users.filter(u => !u.isActive).length}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Inactive Users</p>
            <p className="text-[11px] text-gray-500 truncate">Deactivated</p>
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
                          <UserEmployeePicker
                            employees={employees}
                            deptName={deptName}
                            value={formData.employeeId}
                            onChange={v => {
                              // Selecting an employee pulls their email + dept
                              // onto the form — those values already live on
                              // the Employee row, so the admin doesn't retype.
                              // Email overwrites whatever was there (HR's
                              // expectation: pick employee → see their email),
                              // since a deliberate manual edit happens after
                              // picking, not before.
                              const picked = employees.find(
                                e => e.id === v || (e as Employee).apiId === v,
                              );
                              setFormData(prev => ({
                                ...prev,
                                employeeId: v,
                                departmentId: picked?.department && picked.department !== '-'
                                  ? picked.department
                                  : prev.departmentId,
                                email: picked?.email || prev.email,
                              }));
                            }}
                          />
                          {formData.employeeId && (() => {
                            const picked = employees.find(
                              e => e.id === formData.employeeId || (e as Employee).apiId === formData.employeeId,
                            );
                            if (!picked) return null;
                            return (
                              <p className="text-xs text-gray-500">
                                {picked.position}
                                {picked.department && picked.department !== '-' && ` · ${deptName(picked.department)}`}
                                {picked.contactNumber && ` · ${picked.contactNumber}`}
                              </p>
                            );
                          })()}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="departmentId">Department / Group / Team</Label>
                          <select
                            id="departmentId"
                            value={formData.departmentId}
                            onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                            className="w-full pl-3 pr-8 py-2 border rounded-md truncate bg-white"
                          >
                            <option value="">Select…</option>
                            {/* Group by type so admins see Departments, Groups,
                                and Teams in tidy stacks. The optgroup label
                                disambiguates rows that share a name across
                                types (e.g. a "Local Outsourcing" Team vs Dept). */}
                            {(['department', 'group', 'team'] as const).map(t => {
                              const bucket = deptList
                                .filter(d => ((d as { type?: string }).type ?? 'department') === t)
                                .sort((a, b) => a.name.localeCompare(b.name));
                              if (bucket.length === 0) return null;
                              const label = t === 'department' ? 'Departments'
                                : t === 'group' ? 'Groups' : 'Teams';
                              return (
                                <optgroup key={t} label={label}>
                                  {bucket.map(dept => (
                                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                                  ))}
                                </optgroup>
                              );
                            })}
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
                            {/* Built-in + custom roles, sorted with built-ins first. */}
                            {roles
                              .slice()
                              .sort((a, b) => Number(b.builtIn) - Number(a.builtIn))
                              .map(role => (
                                <option key={role.key} value={role.key}>
                                  {role.name}
                                  {role.builtIn ? '' : ' (custom)'}
                                </option>
                              ))}
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
                    const employee = employees.find(
                      e => e.id === user.employeeId || (e as Employee).apiId === user.employeeId
                    );
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell>
                          {employee ? (
                            <EmployeeCell employee={employee} subtitle={employee.id} />
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>{deptName(user.departmentId) || '—'}</TableCell>
                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                        <TableCell>
                          {user.isActive ? (
                            <Badge className="bg-green-100 text-green-800">Active</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-800">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(user.createdAt)}</TableCell>
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
                              title={user.isActive ? 'Suspend' : 'Reactivate'}
                            >
                              {user.isActive ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResetPassword(user)}
                              title="Send password reset link"
                            >
                              <Key className="h-3 w-3" />
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
              // Headers are visual-only — exclude from both the
              // "modules with a grant" count and the total so the
              // X / Y summary reflects real permissions, not section
              // dividers.
              const permModules = MODULES.filter(m => !m.header);
              const grants = permModules.filter(m =>
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
                      <span>Access to <strong className="text-gray-900">{grants}</strong> / {permModules.length} modules</span>
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
                    Configure what each role can do per module.
                    <br />
                    <span className="font-medium text-gray-700">Menu Access</span> — V=View, C=Create, U=Update, D=Delete.
                    {' '}<span className="font-medium text-gray-700">Data Access</span> — O=Owner (own records), M=Member (direct reports), A=All (tenant-wide).
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
                          {/* Two grouped header rows. The 4 menu cells +
                              3 gaps below total 9rem; the 3 data cells +
                              2 gaps total 6.5rem. Fixed widths on the
                              labels (matching those numbers) keep the
                              divider stroke vertically aligned with the
                              border between D and O in the row below. */}
                          <div className="mt-1.5 flex justify-center gap-4 text-[9px] font-medium text-gray-500 uppercase tracking-wide">
                            <div className="text-center" style={{ width: '9rem' }}>Menu Access</div>
                            <div className="text-center pl-2 ml-1 border-l border-gray-300" style={{ width: '6.5rem' }}>Data Access</div>
                          </div>
                          <div className="flex justify-center gap-4 mt-1 text-[10px] font-normal text-gray-400 uppercase tracking-wide">
                            {MENU_ACTIONS.map(a => (
                              <span key={a} className="w-6 text-center" title={ACTION_LABELS[a]}>{ACTION_SHORT[a]}</span>
                            ))}
                            <span className="w-6 text-center border-l pl-2 ml-1" title={ACTION_LABELS.scope_owner}>O</span>
                            <span className="w-6 text-center" title={ACTION_LABELS.scope_member}>M</span>
                            <span className="w-6 text-center" title={ACTION_LABELS.scope_all}>A</span>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MODULES.map((mod) => {
                      // Section headers (Time Tracking, Payroll Management,
                      // Settings) span every column — they're sidebar group
                      // labels, not permission gates. Children render
                      // indented underneath with the regular checkbox row.
                      if (mod.header) {
                        // 1 label cell + N role cells, computed dynamically
                        // so adding a new role doesn't break the colSpan.
                        const cols = 1 + roles.filter(r => r.key !== 'admin').length;
                        return (
                          <TableRow key={mod.key} className="bg-gray-50 hover:bg-gray-50">
                            <TableCell colSpan={cols} className="py-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                {mod.label}
                              </p>
                            </TableCell>
                          </TableRow>
                        );
                      }
                      return (
                      <TableRow key={mod.key}>
                        <TableCell>
                          {/* Sub-modules render with a left pad + tree
                              prefix so the admin can see at a glance
                              that 'Attendance Report' belongs under
                              'Reports'. Cascading isn't applied —
                              independent permission per sub-module
                              is the whole point of splitting them. */}
                          <div style={mod.parent ? { paddingLeft: 20 } : undefined}>
                            <p className="font-medium text-sm">
                              {mod.parent && <span className="text-gray-300 mr-1">└</span>}
                              {mod.label}
                            </p>
                            <p className="text-xs text-gray-400">{mod.description}</p>
                          </div>
                        </TableCell>
                        {roles.filter(r => r.key !== 'admin').map(role => {
                          const roleState = permissions[mod.key]?.[role.key];
                          // "All" for the Grant all / Clear toggle is now only
                          // about Menu Access — Data Access has its own axis
                          // that the admin configures per module / role.
                          const allMenuOn = MENU_ACTIONS.every(a => roleState?.[a]);
                          const hasAnyMenuAccess = MENU_ACTIONS.some(a => roleState?.[a]);
                          return (
                            <TableCell key={role.key} className="border-l">
                              <div className="flex items-center justify-center gap-4">
                                {MENU_ACTIONS.map(action => (
                                  <div key={action} className="w-6 flex justify-center" title={`${role.name}: ${ACTION_LABELS[action]}`}>
                                    <Checkbox
                                      checked={!!roleState?.[action]}
                                      onCheckedChange={() => togglePermission(mod.key, role.key, action)}
                                      aria-label={`${mod.label} ${role.name} ${ACTION_LABELS[action]}`}
                                    />
                                  </div>
                                ))}
                                {/* Data Access checkboxes — editable. Visible
                                    only when the role has at least one menu
                                    grant on this module (scope without
                                    access is meaningless). Width is reserved
                                    when hidden so the column stays aligned. */}
                                {hasAnyMenuAccess ? (
                                  SCOPE_ACTIONS.map((action, idx) => (
                                    <div
                                      key={action}
                                      className={`w-6 flex justify-center ${idx === 0 ? 'border-l pl-2 ml-1' : ''}`}
                                      title={`${role.name}: ${ACTION_LABELS[action]}`}
                                    >
                                      <Checkbox
                                        checked={!!roleState?.[action]}
                                        onCheckedChange={() => togglePermission(mod.key, role.key, action)}
                                        aria-label={`${mod.label} ${role.name} ${ACTION_LABELS[action]}`}
                                      />
                                    </div>
                                  ))
                                ) : (
                                  <>
                                    <div className="w-6 border-l ml-1" />
                                    <div className="w-6" />
                                    <div className="w-6" />
                                  </>
                                )}
                              </div>
                              <div className="flex justify-center mt-2">
                                <button
                                  type="button"
                                  onClick={() => toggleAllForRoleModule(mod.key, role.key, !allMenuOn)}
                                  className="text-[10px] text-blue-600 hover:underline"
                                >
                                  {allMenuOn ? 'Clear' : 'Grant all'}
                                </button>
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                      );
                    })}
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

            <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-200">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800">
                The role starts with <span className="font-medium">full access</span>.
                Switch to the <span className="font-medium">Permissions</span> tab
                after creating to revoke specific menus or actions.
              </p>
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

/**
 * Searchable employee picker for the Create/Edit User dialog. Mirrors the
 * ApproverPicker / FlexibleWorkCard patterns: cmdk-powered fuzzy match
 * across name + empNo + department, active employees only, and the value
 * emitted is whatever the backend stores (UUID in live mode, empNo in
 * mock mode) via `e.apiId ?? e.id`.
 */
function UserEmployeePicker({
  employees, deptName, value, onChange,
}: {
  employees: Employee[];
  deptName: (id?: string) => string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = employees.filter(e => e.status === 'active');
  const selected = employees.find(e => ((e as any).apiId ?? e.id) === value);
  const selectedDept = deptName(selected?.department) || (selected?.department === '-' ? '' : selected?.department ?? '');
  const selectedLabel = selected
    ? `${selected.name} — ${selected.id}${selectedDept ? ` · ${selectedDept}` : ''}`
    : 'Select Employee';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={selected ? '' : 'text-gray-400'}>{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search name, ID, department…" />
          <CommandList>
            <CommandEmpty>No active employees match that.</CommandEmpty>
            <CommandGroup>
              {active.map(e => {
                const val = (e as any).apiId ?? e.id;
                const dept = deptName(e.department) || (e.department === '-' ? '' : e.department);
                const haystack = `${e.name} ${e.id} ${dept}`;
                return (
                  <CommandItem
                    key={val}
                    value={haystack}
                    onSelect={() => { onChange(val); setOpen(false); }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${value === val ? 'opacity-100' : 'opacity-0'}`} />
                    <span className="flex-1 truncate">
                      {e.name} <span className="text-gray-400">— {e.id}</span>
                      {dept ? <span className="text-gray-400"> · {dept}</span> : null}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
