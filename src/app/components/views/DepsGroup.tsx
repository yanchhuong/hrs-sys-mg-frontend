import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { mockDepartments, mockEmployees } from '../../data/mockData';
import { Department, Employee } from '../../types/hrms';
import * as departmentsApi from '../../api/departments';
import * as employeesApi from '../../api/employees';
import { USE_MOCKS } from '../../api/client';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '../ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '../ui/command';
import { ChevronsUpDown, Check } from 'lucide-react';
import {
  Plus, Pencil, Trash2, Save, Search, Users, Building2, MoreHorizontal,
  FolderTree, UserCheck, Info, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { notify } from '../../utils/notify';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

type DeptGroupType = 'department' | 'group' | 'team';

interface DeptGroup extends Department {
  type: DeptGroupType;
  isActive: boolean;
  color: string;
  // parentId is inherited from Department (string | null | undefined).
}

/** UI labels — keep here so the JSX stays terse. */
const TYPE_LABEL: Record<DeptGroupType, string> = {
  department: 'Department',
  group: 'Group',
  team: 'Team',
};
const TYPE_SHORT: Record<DeptGroupType, string> = {
  department: 'Dept',
  group: 'Group',
  team: 'Team',
};

const COLORS = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'green', label: 'Green', class: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 'red', label: 'Red', class: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'teal', label: 'Teal', class: 'bg-teal-100 text-teal-800 border-teal-200' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-100 text-pink-800 border-pink-200' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
];

const getColorClass = (color: string) => COLORS.find(c => c.value === color)?.class || COLORS[0].class;


// Helper: turn a raw Department (from mocks or API) into the UI's DeptGroup shape.
// The backend persists {id, name, description, parentId, managerId, type}.
// employeeCount / isActive / color are presentation-only and get sensible
// defaults on each load.
const departmentToDeptGroup = (d: Department, index: number): DeptGroup => {
  const apiType = (d as { type?: string }).type;
  const type: DeptGroupType =
    apiType === 'group' || apiType === 'team' ? apiType : 'department';
  return {
    ...d,
    type,
    isActive: true,
    color: COLORS[index % COLORS.length].value,
  };
};

// Local-only groups — the backend currently does not track sub-team / shift
// groups, so these stay on mock data even when USE_MOCKS is false. managerId
// is intentionally blank in the seed so the picker doesn't get pre-loaded
// with empNos that don't exist in the live roster.
const localGroups: DeptGroup[] = [
  {
    id: 'GRP001',
    name: 'Team Alpha',
    managerId: '',
    employeeCount: 2,
    description: 'Cross-functional project team for product launch',
    type: 'group',
    isActive: true,
    color: 'purple',
  },
  {
    id: 'GRP002',
    name: 'Night Shift',
    managerId: '',
    employeeCount: 0,
    description: 'Night shift workers group',
    type: 'group',
    isActive: false,
    color: 'orange',
  },
];

const initialDepts: DeptGroup[] = [
  ...mockDepartments.map((d, i) => departmentToDeptGroup(d, i)),
  ...localGroups,
];

const emptyForm: Omit<DeptGroup, 'id'> = {
  name: '',
  managerId: '',
  parentId: '',
  employeeCount: 0,
  description: '',
  type: 'department',
  isActive: true,
  color: 'blue',
};

interface DepsGroupProps {
  /** When true, skip the page-level title/description header so the view can
      render inside an existing page (e.g. a tab). The Add button moves into
      the first card header instead. */
  embedded?: boolean;
}

export function DepsGroup({ embedded = false }: DepsGroupProps = {}) {
  const { t } = useI18n();
  const { canCreate, canUpdate, canDelete } = useAuth();
  // Departments / Groups live under Settings → Employee Settings.
  const canCreateDept = canCreate('settings');
  const canUpdateDept = canUpdate('settings');
  const canDeleteDept = canDelete('settings');
  // When USE_MOCKS, seed with the bundled mock departments + local groups.
  // Otherwise start with just the local-only groups; departments are loaded
  // from the API in `loadDepartments` below.
  const [items, setItems] = useState<DeptGroup[]>(USE_MOCKS ? initialDepts : [...localGroups]);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DeptGroup | null>(null);
  const [form, setForm] = useState<Omit<DeptGroup, 'id'>>(emptyForm);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'department' | 'group' | 'team'>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  // Add-member dialog state. When set, opens a picker that lists every
  // employee not already in this dept/group/team and assigns the picked one.
  const [addMemberFor, setAddMemberFor] = useState<DeptGroup | null>(null);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null);

  // Load (or refresh) all items — departments, groups, and teams now share
  // the same backend table (V17). Mock mode falls back to the static seed
  // because no API is available.
  const loadDepartments = async () => {
    if (USE_MOCKS) {
      setItems([
        ...mockDepartments.map((d, i) => departmentToDeptGroup(d, i)),
        ...localGroups,
      ]);
      return;
    }
    setLoading(true);
    try {
      const apiDepts = await departmentsApi.list();
      setItems(apiDepts.map((d, i) => departmentToDeptGroup(d, i)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  // Employees populate the Manager / Lead picker. Loaded once on mount —
  // department managers don't change so frequently that a refetch per save
  // would be worth it.
  const loadEmployees = async () => {
    if (USE_MOCKS) { setEmployees([...mockEmployees]); return; }
    try {
      const res = await employeesApi.list({ size: 500 });
      setEmployees(res.content.map(e => ({
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
      })));
    } catch (err) {
      // Non-fatal — Manager picker just stays empty.
      console.warn('Could not load employees for Manager picker', err);
    }
  };

  useEffect(() => {
    void loadDepartments();
    void loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = items.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || item.type === filterType;
    return matchSearch && matchType;
  });

  const departments = items.filter(i => i.type === 'department');
  const groups = items.filter(i => i.type === 'group');
  const teams = items.filter(i => i.type === 'team');
  const activeCount = items.filter(i => i.isActive).length;
  // Live count of employees per department/group/team — drives the Members
  // column and the "X total members" headline. Employees attached to a
  // department that no longer exists (orphaned by a delete with SET NULL)
  // are silently ignored. In live mode `e.department` carries the UUID;
  // in mock mode it's the dept name and the ids are slugs, so the keys
  // happen to match the way mock data was authored.
  const memberCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of employees) {
      if (!e.department || e.department === '-') continue;
      map.set(e.department, (map.get(e.department) ?? 0) + 1);
    }
    return map;
  }, [employees]);

  /**
   * Rolled-up member count per node: own employees + every descendant's
   * own employees, walked recursively through the parentId tree.
   * Lets the Members column on a Department show "direct leaders + all
   * sub-team/group totals" so the org chart actually adds up to the
   * headline number.
   */
  const memberCountIncludingDescendantsById = useMemo(() => {
    const childrenOf = new Map<string, string[]>();
    for (const i of items) {
      if (!i.parentId) continue;
      const bucket = childrenOf.get(i.parentId) ?? [];
      bucket.push(i.id);
      childrenOf.set(i.parentId, bucket);
    }
    // Memoised DFS — handles deep trees in O(N) and tolerates accidental
    // cycles in user data by short-circuiting on revisit.
    const totals = new Map<string, number>();
    const visiting = new Set<string>();
    const walk = (id: string): number => {
      if (totals.has(id)) return totals.get(id)!;
      if (visiting.has(id)) return memberCountById.get(id) ?? 0;
      visiting.add(id);
      let sum = memberCountById.get(id) ?? 0;
      for (const child of childrenOf.get(id) ?? []) sum += walk(child);
      visiting.delete(id);
      totals.set(id, sum);
      return sum;
    };
    for (const i of items) walk(i.id);
    return totals;
  }, [items, memberCountById]);

  // Total members across the org = sum of direct counts (NOT the rolled-up
  // map, which would double-count anyone whose dept is itself a child).
  const totalMembers = items.reduce(
    (sum, i) => sum + (memberCountById.get(i.id) ?? 0), 0,
  );

  // Hierarchical ordering: each parent followed by its children, with the
  // depth captured so the table cell can render an indent + arrow prefix.
  // Items whose parent is filtered out (or has none) sort at depth 0
  // alongside genuine top-level rows. Within a level, sort by name.
  const sortedFiltered = useMemo<(DeptGroup & { _depth: number })[]>(() => {
    const visibleIds = new Set(filtered.map(i => i.id));
    const sortByName = (a: DeptGroup, b: DeptGroup) => a.name.localeCompare(b.name);
    const childrenByParent = new Map<string | null, DeptGroup[]>();
    for (const item of filtered) {
      const key = item.parentId && visibleIds.has(item.parentId) ? item.parentId : null;
      const bucket = childrenByParent.get(key) ?? [];
      bucket.push(item);
      childrenByParent.set(key, bucket);
    }
    for (const bucket of childrenByParent.values()) bucket.sort(sortByName);

    const out: (DeptGroup & { _depth: number })[] = [];
    const walk = (parentKey: string | null, depth: number) => {
      const kids = childrenByParent.get(parentKey) ?? [];
      for (const k of kids) {
        out.push({ ...k, _depth: depth });
        walk(k.id, depth + 1);
      }
    };
    walk(null, 0);
    // Safety: if some items got skipped (cycle / unreachable), append them at depth 0.
    const present = new Set(out.map(o => o.id));
    for (const item of filtered) if (!present.has(item.id)) out.push({ ...item, _depth: 0 });
    return out;
  }, [filtered]);

  const depsPagination = usePagination(sortedFiltered, 10);

  useEffect(() => {
    depsPagination.resetPage();
  }, [search, filterType]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: DeptGroup) => {
    setEditing(item);
    setForm({
      name: item.name,
      managerId: item.managerId || '',
      parentId: item.parentId || '',
      employeeCount: item.employeeCount || 0,
      description: item.description || '',
      type: item.type,
      isActive: item.isActive,
      color: item.color,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      notify.validate('Please enter a name');
      return;
    }

    // Mock mode: still local-only since no API to call.
    if (USE_MOCKS) {
      if (editing) {
        setItems(items.map(i => i.id === editing.id ? { ...editing, ...form } : i));
        toast.success(`"${form.name}" updated`);
      } else {
        const prefix = form.type === 'department' ? 'DEPT' : form.type === 'group' ? 'GRP' : 'TEAM';
        const count = items.filter(i => i.type === form.type).length + 1;
        const id = `${prefix}${String(count).padStart(3, '0')}`;
        setItems([...items, { id, ...form }]);
        toast.success(`"${form.name}" created`);
      }
      setDialogOpen(false);
      return;
    }

    // Live mode: every type lives in the same `departments` table now.
    try {
      if (editing) {
        await departmentsApi.update(editing.id, {
          name: form.name,
          description: form.description || undefined,
          managerId: form.managerId || null,
          parentId: form.parentId || null,
          type: form.type,
        });
        toast.success(`"${form.name}" updated`);
      } else {
        await departmentsApi.create({
          name: form.name,
          description: form.description || undefined,
          managerId: form.managerId || null,
          parentId: form.parentId || null,
          type: form.type,
        });
        toast.success(`"${form.name}" created`);
      }
      await loadDepartments();
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save department');
    }
  };

  const handleDelete = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) {
      setDeleteConfirm(null);
      return;
    }

    if (USE_MOCKS) {
      setItems(items.filter(i => i.id !== id));
      setDeleteConfirm(null);
      toast.success(`"${item.name}" deleted`);
      return;
    }

    try {
      await departmentsApi.remove(id);
      toast.success(`"${item.name}" deleted`);
      await loadDepartments();
      setDeleteConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete department');
    }
  };

  const toggleActive = (id: string) => {
    setItems(items.map(i => i.id === id ? { ...i, isActive: !i.isActive } : i));
  };

  /**
   * Move the picked employee in or out of {@code addMemberFor} by PATCHing
   * their employee record. Pass {@code null} as {@code newDeptId} to remove
   * the employee from any department/group/team. Two-way sync — the
   * Members count refreshes next render, and the Employees page picks up
   * the new departmentId immediately. Mocks just mutate local state.
   */
  const handleMoveMember = async (emp: Employee, newDeptId: string | null) => {
    const targetEmployeeId = (emp as { apiId?: string }).apiId ?? emp.id;
    const targetDept = newDeptId ? items.find(i => i.id === newDeptId) : null;
    setAddingMemberId(emp.id);
    try {
      if (USE_MOCKS) {
        setEmployees(prev => prev.map(e =>
          e.id === emp.id ? { ...e, department: newDeptId ?? '-' } : e,
        ));
        toast.success(newDeptId
          ? `${emp.name} moved to "${targetDept?.name ?? newDeptId}"`
          : `${emp.name} removed`);
        return;
      }
      // Backend's PUT /employees/{id} overwrites every field, so round-trip
      // the existing record with only departmentId changed.
      await employeesApi.update(targetEmployeeId, {
        empNo: emp.id,
        name: emp.name,
        khmerName: emp.khmerName,
        email: emp.email,
        position: emp.position,
        departmentId: newDeptId,
        joinDate: emp.joinDate,
        baseSalary: emp.baseSalary,
        managerId: emp.managerId ?? null,
        gender: emp.gender,
        dateOfBirth: emp.dateOfBirth,
        placeOfBirth: emp.placeOfBirth,
        contactNumber: emp.contactNumber,
        currentAddress: emp.currentAddress,
        nffNo: emp.nffNo,
        tid: emp.tid,
        contractExpireDate: emp.contractExpireDate,
        resignDate: emp.resignDate,
        status: emp.status,
      });
      // Optimistic update so the Members count refreshes immediately.
      setEmployees(prev => prev.map(e =>
        e.id === emp.id ? { ...e, department: newDeptId ?? '-' } : e,
      ));
      toast.success(newDeptId
        ? `${emp.name} moved to "${targetDept?.name ?? newDeptId}"`
        : `${emp.name} removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update member');
    } finally {
      setAddingMemberId(null);
    }
  };

  const getManagerName = (managerId?: string) => {
    if (!managerId) return '-';
    // managerId can be either empNo (mock-mode) or backend UUID (live-mode).
    const emp = employees.find(e => e.id === managerId || (e as any).apiId === managerId);
    return emp?.name || '-';
  };

  const getParentName = (parentId?: string | null) => {
    if (!parentId) return '-';
    return items.find(i => i.id === parentId)?.name ?? '-';
  };

  /**
   * Set of ids that descend from `rootId` (direct + transitive children).
   * Used to keep the Parent picker from offering self or a descendant, which
   * would create a cycle. Walks the items list iteratively to avoid recursion
   * stack issues when cycles already exist (defensive).
   */
  const descendantIds = (rootId: string): Set<string> => {
    const out = new Set<string>();
    const queue = [rootId];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const child of items) {
        if (child.parentId === cur && !out.has(child.id)) {
          out.add(child.id);
          queue.push(child.id);
        }
      }
    }
    return out;
  };

  // Heuristic: hide an id subtitle that looks like a raw UUID (8-4-4-4-12).
  // Backend departments expose UUIDs as ids; surfacing them would violate
  // the project's "no UUIDs in user-facing fields" rule.
  const isUuid = (s?: string) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  return (
    <div className="space-y-6">
      {/* Page header — hidden when embedded in another page's tab */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t('page.depsgroup.title')}</h1>
            <p className="text-gray-500">{t('page.depsgroup.description')}</p>
          </div>
          {canCreateDept && (
            <Button onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add New
            </Button>
          )}
        </div>
      )}
      {embedded && canCreateDept && (
        <div className="flex justify-end">
          <Button onClick={openAdd} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add New
          </Button>
        </div>
      )}

      {/* Summary Cards — hidden when embedded in Employee Settings, which
          renders its own KPI strip above the tabs. Standalone page keeps
          the detailed Departments / Groups / Teams / Active breakdown. */}
      {!embedded && (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <FolderTree className="h-5 w-5 text-gray-500" />
              <span className="text-2xl font-bold text-gray-700">{items.length}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Total</p>
            <p className="text-[11px] text-gray-500 truncate">Departments & groups</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              <span className="text-2xl font-bold text-blue-600">{departments.length}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Departments</p>
            <p className="text-[11px] text-gray-500 truncate">Organizational units</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Users className="h-5 w-5 text-purple-600" />
              <span className="text-2xl font-bold text-purple-600">{groups.length}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Groups</p>
            <p className="text-[11px] text-gray-500 truncate">Custom groups</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <UserCheck className="h-5 w-5 text-teal-600" />
              <span className="text-2xl font-bold text-teal-600">{teams.length}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Teams</p>
            <p className="text-[11px] text-gray-500 truncate">Project / squad teams</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <UserCheck className="h-5 w-5 text-green-600" />
              <span className="text-2xl font-bold text-green-600">{activeCount}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Active</p>
            <p className="text-[11px] text-gray-500 truncate">{totalMembers} total members</p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">All Departments & Groups</CardTitle>
              <CardDescription>{filtered.length} items</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-9 w-56"
                />
              </div>
              <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg">
                {(['all', 'department', 'group', 'team'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                      filterType === t ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t === 'all' ? 'All' : t === 'department' ? 'Departments' : t === 'group' ? 'Groups' : 'Teams'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead title="Person In Charge">PIC</TableHead>
                <TableHead className="text-center">Members</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-gray-400">
                    <FolderTree className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No departments or groups found</p>
                  </TableCell>
                </TableRow>
              ) : (
                depsPagination.paginatedItems.map(item => (
                  <TableRow key={item.id} className={!item.isActive ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        {/* Indent + branching arrow per nesting depth so the
                            parent → child relationship is obvious at a glance. */}
                        {item._depth > 0 && (
                          <span
                            className="text-gray-300 select-none font-mono text-xs"
                            style={{ paddingLeft: `${(item._depth - 1) * 18}px` }}
                            aria-hidden="true"
                          >
                            └─
                          </span>
                        )}
                        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          item.color === 'blue' ? 'bg-blue-500' :
                          item.color === 'green' ? 'bg-green-500' :
                          item.color === 'purple' ? 'bg-purple-500' :
                          item.color === 'orange' ? 'bg-orange-500' :
                          item.color === 'red' ? 'bg-red-500' :
                          item.color === 'teal' ? 'bg-teal-500' :
                          item.color === 'pink' ? 'bg-pink-500' :
                          item.color === 'yellow' ? 'bg-yellow-500' : 'bg-gray-500'
                        }`} />
                        <div>
                          <p className="font-medium text-sm">{item.name}</p>
                          {!isUuid(item.id) && (
                            <p className="text-xs text-gray-400">{item.id}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${
                        item.type === 'department' ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : item.type === 'group'    ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-teal-50 text-teal-700 border-teal-200'
                      }`}>
                        {TYPE_LABEL[item.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.parentId
                        ? <span className="text-gray-700">{getParentName(item.parentId)}</span>
                        : <span className="text-xs text-gray-400">Top-level</span>}
                    </TableCell>
                    <TableCell className="text-sm">{getManagerName(item.managerId)}</TableCell>
                    <TableCell className="text-center">
                      {/* Clickable count opens the same Manage Members dialog
                          so admins can adjust membership without going
                          through the kebab menu.
                          Shows the rolled-up total (own + descendants) so a
                          Department's number reflects its sub-teams; tooltip
                          breaks down the math when they differ. */}
                      {(() => {
                        const direct = memberCountById.get(item.id) ?? 0;
                        const rolled = memberCountIncludingDescendantsById.get(item.id) ?? direct;
                        const hasChildren = rolled !== direct;
                        return (
                          <button
                            onClick={() => { setAddMemberFor(item); setAddMemberSearch(''); }}
                            className="inline-flex items-center justify-center min-w-[28px] h-7 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 hover:ring-2 hover:ring-blue-200 text-sm font-medium transition-all"
                            title={hasChildren
                              ? `${direct} direct + ${rolled - direct} in sub-units = ${rolled} total. Click to manage direct members.`
                              : 'Click to manage members'}
                          >
                            {rolled}
                          </button>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={item.isActive}
                        onCheckedChange={() => toggleActive(item.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-gray-500 max-w-[200px] truncate">{item.description || '-'}</p>
                    </TableCell>
                    <TableCell>
                      {(canUpdateDept || canDeleteDept) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canUpdateDept && (
                              <DropdownMenuItem onClick={() => openEdit(item)}>
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {canUpdateDept && (
                              <DropdownMenuItem onClick={() => { setAddMemberFor(item); setAddMemberSearch(''); }}>
                                <UserPlus className="mr-2 h-3.5 w-3.5" />
                                Manage Members
                              </DropdownMenuItem>
                            )}
                            {canDeleteDept && (
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => setDeleteConfirm(item.id)}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <Pagination
            currentPage={depsPagination.currentPage}
            totalPages={depsPagination.totalPages}
            onPageChange={depsPagination.goToPage}
            startIndex={depsPagination.startIndex}
            endIndex={depsPagination.endIndex}
            totalItems={depsPagination.totalItems}
          />
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Departments vs Groups</p>
              <ul className="space-y-1 text-xs text-blue-700">
                <li><strong>Departments</strong> are formal organizational units (e.g., HR, Engineering, Sales). Each employee belongs to one department.</li>
                <li><strong>Groups</strong> are flexible collections of employees across departments (e.g., project teams, shift groups). Used for scheduling, OT rules, or reporting.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${TYPE_LABEL[form.type]}` : 'Add New Department / Group / Team'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update the details below' : 'Create a new department or group for your organization'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {/* Type Selection — also editable when updating an existing entry. */}
            <div className="space-y-2">
              <Label className="text-sm">Type</Label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setForm({ ...form, type: 'department' })}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    form.type === 'department' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className={`h-4 w-4 ${form.type === 'department' ? 'text-blue-600' : 'text-gray-400'}`} />
                    <p className="font-medium text-sm">Department</p>
                  </div>
                  <p className="text-xs text-gray-500">Formal org unit</p>
                </button>
                <button
                  onClick={() => setForm({ ...form, type: 'group' })}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    form.type === 'group' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Users className={`h-4 w-4 ${form.type === 'group' ? 'text-purple-600' : 'text-gray-400'}`} />
                    <p className="font-medium text-sm">Group</p>
                  </div>
                  <p className="text-xs text-gray-500">Cross-dept / shift</p>
                </button>
                <button
                  onClick={() => setForm({ ...form, type: 'team' })}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    form.type === 'team' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <UserCheck className={`h-4 w-4 ${form.type === 'team' ? 'text-teal-600' : 'text-gray-400'}`} />
                    <p className="font-medium text-sm">Team</p>
                  </div>
                  <p className="text-xs text-gray-500">Project / squad</p>
                </button>
              </div>
              {editing && editing.type !== form.type && (
                <p className="text-xs text-amber-600">
                  Changing type from <b>{TYPE_LABEL[editing.type]}</b> to <b>{TYPE_LABEL[form.type]}</b>.
                </p>
              )}
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label className="text-sm">Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder={
                  form.type === 'department' ? 'e.g., Engineering'
                  : form.type === 'group'    ? 'e.g., Night Shift Group'
                  : 'e.g., Mobile App Team'
                }
                className="h-9"
              />
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label className="text-sm">Color Tag</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setForm({ ...form, color: c.value })}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      `bg-${c.value}-500`
                    } ${
                      form.color === c.value ? 'scale-125 border-gray-800' : 'border-transparent hover:scale-110'
                    }`}
                    style={{
                      backgroundColor:
                        c.value === 'blue' ? '#3b82f6' :
                        c.value === 'green' ? '#22c55e' :
                        c.value === 'purple' ? '#a855f7' :
                        c.value === 'orange' ? '#f97316' :
                        c.value === 'red' ? '#ef4444' :
                        c.value === 'teal' ? '#14b8a6' :
                        c.value === 'pink' ? '#ec4899' :
                        '#eab308'
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Manager/Lead */}
            <div className="space-y-2">
              <Label className="text-sm">{
                form.type === 'department' ? 'Department Manager'
                : form.type === 'group'    ? 'Group Lead'
                : 'Team Lead'
              }</Label>
              <ManagerPicker
                employees={employees}
                value={form.managerId || ''}
                onChange={v => setForm({ ...form, managerId: v })}
              />
            </div>

            {/* Parent */}
            <div className="space-y-2">
              <Label className="text-sm">Parent</Label>
              <ParentPicker
                items={items}
                value={form.parentId || ''}
                onChange={v => setForm({ ...form, parentId: v })}
                excludeIds={
                  // Forbid self + descendants when editing — would cycle.
                  // Departments must have a department parent (backend FK).
                  // Groups can nest under anything (local-only).
                  editing
                    ? new Set<string>([editing.id, ...descendantIds(editing.id)])
                    : new Set<string>()
                }
                allowedTypes={form.type === 'department' ? ['department'] : ['department', 'group', 'team']}
              />
              <p className="text-xs text-gray-400">
                Leave blank for a top-level {TYPE_LABEL[form.type].toLowerCase()}.
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-sm">Description</Label>
              <Input
                value={form.description || ''}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description..."
                className="h-9"
              />
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between border-t pt-4">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-gray-400">Inactive items are hidden from dropdowns</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} />
            </div>

            {/* Save */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>
                <Save className="mr-1.5 h-4 w-4" />
                {editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Confirmation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{items.find(i => i.id === deleteConfirm)?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Members Dialog — side-by-side: current members on the left,
          everyone else on the right. PATCHes employee.departmentId on each
          action, two-way syncing with the Employees page. */}
      <Dialog
        open={!!addMemberFor}
        onOpenChange={(open) => { if (!open) { setAddMemberFor(null); setAddMemberSearch(''); } }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Manage Members · "{addMemberFor?.name}"
            </DialogTitle>
            <DialogDescription>
              Move employees in or out of this {addMemberFor ? TYPE_LABEL[addMemberFor.type].toLowerCase() : 'unit'}.
              The single search filters both sides.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={addMemberSearch}
                onChange={(e) => setAddMemberSearch(e.target.value)}
                placeholder="Search by name, ID, or position…"
                className="pl-10 h-9"
                autoFocus
              />
            </div>
            {(() => {
              if (!addMemberFor) return null;
              const tokens = addMemberSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
              const matches = (e: Employee) => {
                if (tokens.length === 0) return true;
                const hay = [
                  e.name, e.khmerName, e.id, (e as { empNo?: string }).empNo,
                  e.position, e.contactNumber,
                ].filter(Boolean).join(' ').toLowerCase();
                return tokens.every(t => hay.includes(t));
              };
              const inHere = employees
                .filter(e => e.status === 'active' && e.department === addMemberFor.id && matches(e));
              const elsewhere = employees
                .filter(e => e.status === 'active' && e.department !== addMemberFor.id && matches(e))
                .slice(0, 200);

              const renderRow = (emp: Employee, action: 'add' | 'remove') => {
                const currentDept = emp.department && emp.department !== '-'
                  ? items.find(i => i.id === emp.department)?.name
                  : null;
                const isBusy = addingMemberId === emp.id;
                const isAdd = action === 'add';
                // "Add" when the employee has no department yet, "Move"
                // when reassigning from another one. The arrow on the
                // right pane points left (toward the Members pane) since
                // the action drags them in that direction.
                const inLabel = currentDept ? 'Move' : 'Add';
                const action_node = (
                  <span className={`text-xs shrink-0 ${
                    isAdd ? 'text-blue-600' : 'text-red-600'
                  }`}>
                    {isBusy ? '…' : isAdd ? `← ${inLabel}` : 'Remove →'}
                  </span>
                );
                const info_node = (
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{emp.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {emp.id} · {emp.position}
                      {isAdd && currentDept && (
                        <span className="text-gray-400"> · currently {currentDept}</span>
                      )}
                    </p>
                  </div>
                );
                return (
                  <button
                    key={emp.id}
                    onClick={() => handleMoveMember(emp, isAdd ? addMemberFor.id : null)}
                    disabled={!!addingMemberId}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {/* Left pane: Members → action on the RIGHT, info on the LEFT.
                        Right pane: Other Employees → action on the LEFT, info on the RIGHT
                        so the arrow visually points toward the Members pane. */}
                    {isAdd ? (
                      <>
                        {action_node}
                        {info_node}
                      </>
                    ) : (
                      <>
                        {info_node}
                        {action_node}
                      </>
                    )}
                  </button>
                );
              };

              return (
                <div className="grid grid-cols-2 gap-3">
                  {/* Left — current members */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <Label className="text-xs uppercase tracking-wide text-gray-500">
                        Members of {addMemberFor.name}
                      </Label>
                      <Badge variant="outline" className="text-xs">
                        {inHere.length}
                      </Badge>
                    </div>
                    <div className="h-80 overflow-y-auto border rounded-md divide-y bg-blue-50/30">
                      {inHere.length === 0 ? (
                        <div className="px-3 py-8 text-center text-sm text-gray-400">
                          {employees.length === 0 ? 'Loading…' : 'No members yet'}
                        </div>
                      ) : (
                        inHere.map(e => renderRow(e, 'remove'))
                      )}
                    </div>
                  </div>

                  {/* Right — everyone else */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <Label className="text-xs uppercase tracking-wide text-gray-500">
                        Other employees
                      </Label>
                      <Badge variant="outline" className="text-xs">
                        {elsewhere.length}
                      </Badge>
                    </div>
                    <div className="h-80 overflow-y-auto border rounded-md divide-y">
                      {elsewhere.length === 0 ? (
                        <div className="px-3 py-8 text-center text-sm text-gray-400">
                          No matching employees
                        </div>
                      ) : (
                        elsewhere.map(e => renderRow(e, 'add'))
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddMemberFor(null); setAddMemberSearch(''); }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Searchable employee picker for the Manager / Lead field. Filters to active
 * employees, lets the admin type to narrow against name + empNo + position,
 * and emits whatever identifier the backend stores (UUID in live mode,
 * empNo in mock mode) via `e.apiId ?? e.id`. Empty value = "None".
 */
function ManagerPicker({
  employees, value, onChange,
}: {
  employees: Employee[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = employees.filter(e => e.status === 'active');
  // Match either field independently so the picker recognises a value
  // regardless of whether it came from the empNo path (mock) or the UUID
  // path (live). Mirrors getManagerName().
  const selected = employees.find(
    e => e.id === value || (e as any).apiId === value,
  );
  const label = selected ? `${selected.name} (${selected.position ?? '—'})` : 'None';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between font-normal"
        >
          <span className={selected ? '' : 'text-gray-400'}>{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search name, ID, position…" />
          <CommandList>
            <CommandEmpty>No active employees match that.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => { onChange(''); setOpen(false); }}
              >
                <Check className={`mr-2 h-4 w-4 ${!value ? 'opacity-100' : 'opacity-0'}`} />
                <span className="text-gray-500 italic">None</span>
              </CommandItem>
              {active.map(e => {
                const val = (e as any).apiId ?? e.id;
                const haystack = `${e.name} ${e.id} ${e.position ?? ''}`;
                return (
                  <CommandItem
                    key={val}
                    value={haystack}
                    onSelect={() => { onChange(val); setOpen(false); }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${value === val ? 'opacity-100' : 'opacity-0'}`} />
                    <span className="flex-1 truncate">
                      {e.name}
                      <span className="text-gray-400"> — {e.id}</span>
                      {e.position ? <span className="text-gray-400"> · {e.position}</span> : null}
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

/**
 * Searchable picker for the optional Parent (Department or Group). Empty
 * value = top-level. Items in `excludeIds` (self + descendants) are filtered
 * out to prevent cycles. `allowedTypes` lets a Department restrict to other
 * Departments only — Groups are local-only and can't be backend parents.
 */
function ParentPicker({
  items, value, onChange, excludeIds, allowedTypes,
}: {
  items: DeptGroup[];
  value: string;
  onChange: (v: string) => void;
  excludeIds: Set<string>;
  allowedTypes: ('department' | 'group')[];
}) {
  const [open, setOpen] = useState(false);
  const eligible = items.filter(i =>
    allowedTypes.includes(i.type) && !excludeIds.has(i.id) && i.isActive
  );
  const selected = items.find(i => i.id === value);
  const label = selected ? selected.name : 'None (top-level)';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between font-normal"
        >
          <span className={selected ? '' : 'text-gray-400'}>{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search parent…" />
          <CommandList>
            <CommandEmpty>No eligible parent found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => { onChange(''); setOpen(false); }}
              >
                <Check className={`mr-2 h-4 w-4 ${!value ? 'opacity-100' : 'opacity-0'}`} />
                <span className="text-gray-500 italic">None (top-level)</span>
              </CommandItem>
              {eligible.map(p => {
                const haystack = `${p.name} ${p.description ?? ''}`;
                return (
                  <CommandItem
                    key={p.id}
                    value={haystack}
                    onSelect={() => { onChange(p.id); setOpen(false); }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${value === p.id ? 'opacity-100' : 'opacity-0'}`} />
                    <span className="flex-1 truncate">
                      {p.name}
                      <span className="text-gray-400"> · {TYPE_SHORT[p.type]}</span>
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
