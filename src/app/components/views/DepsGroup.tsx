import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { StatCard } from '../common/StatCard';
import { TableBodySkeletonRows } from '../common/LoadingSkeletons';
import { ListEmpty, ListError } from '../common/ListStates';
import { useConfirm } from '../../context/ConfirmContext';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  ListTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
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
  Plus, Pencil, Trash2, Search, Users, Building2, MoreHorizontal,
  FolderTree, UserCheck, Info, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { notify } from '../../utils/notify';
import { selfManagerKey, nextManagerForDeptChange } from '../../utils/deptManager';
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

// Colour dot per row. Static class strings — Tailwind only generates
// classes it can see verbatim in source, so a template-built
// `bg-${c}-500` rendered no colour at all.
const COLOR_DOT_CLASS: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  teal: 'bg-teal-500',
  pink: 'bg-pink-500',
  yellow: 'bg-yellow-500',
};
const COLOR_KEYS = Object.keys(COLOR_DOT_CLASS);

// Helper: turn a raw Department (from mocks or API) into the UI's DeptGroup shape.
// The backend persists {id, name, description, parentId, managerId, type} only.
// There is no active flag or colour column, so `isActive` is always true and
// `color` is a display-only tag derived from the row's position. The old
// Active switch and Color Tag picker were dropped because nothing they set
// survived a reload.
const departmentToDeptGroup = (d: Department, index: number): DeptGroup => {
  const apiType = (d as { type?: string }).type;
  const type: DeptGroupType =
    apiType === 'group' || apiType === 'team' ? apiType : 'department';
  return {
    ...d,
    type,
    isActive: true,
    color: COLOR_KEYS[index % COLOR_KEYS.length],
  };
};

// Mock-mode-only sample groups. Live mode loads every department / group /
// team from the API (they share one table since V17) and never shows these.
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
    isActive: true,
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
  /** Called after a create / edit / delete / member move succeeds, so a
      host page (Employee Settings) can refresh its own KPIs. */
  onChanged?: () => void;
}

export function DepsGroup({ embedded = false, onChanged }: DepsGroupProps = {}) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const { canCreate, canUpdate, canDelete } = useAuth();
  // Departments / Groups live under Settings → Employee Settings.
  const canCreateDept = canCreate('settings');
  const canUpdateDept = canUpdate('settings');
  const canDeleteDept = canDelete('settings');
  // Mock mode seeds the bundled mock departments + sample groups. Live mode
  // starts empty and loads everything from the API — it used to seed the
  // two fake mock groups, which flashed before the load and stayed on
  // screen if the load failed.
  const [items, setItems] = useState<DeptGroup[]>(USE_MOCKS ? initialDepts : []);
  const [loading, setLoading] = useState(!USE_MOCKS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  // Raw API rows keyed by employee UUID — the member-move PUT is a full
  // replace, so it round-trips the stored record rather than the trimmed
  // UI shape (which drops attendance-exception / TOS / status fields).
  const rawEmployeesRef = useRef(new Map<string, employeesApi.Employee>());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DeptGroup | null>(null);
  const [form, setForm] = useState<Omit<DeptGroup, 'id'>>(emptyForm);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'department' | 'group' | 'team'>('all');
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
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load departments');
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
      rawEmployeesRef.current = new Map(res.content.map(e => [e.id, e]));
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
        // Payroll-affecting columns this screen never shows, carried ONLY so the
        // full-replace PUTs below can round-trip them. EmployeeService coerces a
        // missing allowance to ZERO (not "leave alone") and assigns maritalStatus
        // unconditionally, so omitting them silently zeroed real money on every
        // save from here — the allowances feed the payslip, the AL-remain payout
        // and the seniority indemnity base.
        maritalStatus: (e.maritalStatus === 'single' || e.maritalStatus === 'married'
          || e.maritalStatus === 'divorced' || e.maritalStatus === 'widowed')
          ? e.maritalStatus : undefined,
        positionAllowance: e.positionAllowance ?? 0,
        evaluationAllowance: e.evaluationAllowance ?? 0,
        nffNo: e.nffNo ?? undefined,
        tid: e.tid ?? undefined,
        // Carried only so the move-department PUT can round-trip them —
        // see the body below. Nothing on this screen renders them.
        tidType: (e.tidType ?? undefined) as 'PA' | 'TID' | undefined,
        nationalityType: (e.nationalityType ?? undefined) as 'national_id' | 'passport' | undefined,
        visaExpireDate: e.visaExpireDate ?? undefined,
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
  const isFiltered = !!search.trim() || filterType !== 'all';
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
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save department');
    }
  };

  const handleDelete = async (item: DeptGroup) => {
    const ok = await confirm({
      title: `Delete this ${TYPE_LABEL[item.type].toLowerCase()}?`,
      message: `"${item.name}" will be deleted. This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;

    if (USE_MOCKS) {
      setItems(prev => prev.filter(i => i.id !== item.id));
      toast.success(`"${item.name}" deleted`);
      return;
    }

    try {
      await departmentsApi.remove(item.id);
      toast.success(`"${item.name}" deleted`);
      await loadDepartments();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete department');
    }
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

    // Same department → "Reports To" follow-through the Employees page
    // applies, so assigning someone here lands them exactly where
    // editing their Department on the employee record would. Without
    // it, the two routes to the same change produced different data.
    const oldDeptKey = emp.department && emp.department !== '-' ? emp.department : null;
    const oldDept = oldDeptKey
      ? items.find(i => (USE_MOCKS ? i.name === oldDeptKey : i.id === oldDeptKey))
      : undefined;
    const nextManager = nextManagerForDeptChange(
      selfManagerKey(emp),
      emp.managerId ?? null,
      oldDept?.managerId ?? null,
      targetDept?.managerId ?? null,
    );
    const managerId = nextManager !== undefined ? nextManager : (emp.managerId ?? null);

    if (!newDeptId) {
      const ok = await confirm({
        title: `Remove ${emp.name} from this ${addMemberFor ? TYPE_LABEL[addMemberFor.type].toLowerCase() : 'unit'}?`,
        message: `${emp.name} will no longer belong to "${addMemberFor?.name ?? ''}".`,
        confirmLabel: 'Remove',
        variant: 'destructive',
      });
      if (!ok) return;
    }

    setAddingMemberId(emp.id);
    try {
      if (USE_MOCKS) {
        setEmployees(prev => prev.map(e =>
          e.id === emp.id
            ? { ...e, department: newDeptId ?? '-', managerId: managerId ?? undefined }
            : e,
        ));
        toast.success(newDeptId
          ? `${emp.name} moved to "${targetDept?.name ?? newDeptId}"`
          : `${emp.name} removed`);
        return;
      }
      // Backend's PUT /employees/{id} overwrites every field, so round-trip
      // the stored record with only departmentId / managerId changed. Same
      // field list as Employees.tsx's quick-edit save. The body used to be
      // built from the trimmed UI shape, which never carried
      // attendanceYn / the Long-term Exception dates / decouple /
      // claimSpouse / resignDate and collapsed status to active|inactive,
      // so a department move wiped them.
      const raw = rawEmployeesRef.current.get(targetEmployeeId);
      if (!raw) {
        toast.error('Could not locate the employee record to update');
        return;
      }
      await employeesApi.update(raw.id, {
        empNo: raw.empNo,
        name: raw.name,
        khmerName: raw.khmerName ?? null,
        email: raw.email,
        position: raw.position,
        departmentId: newDeptId,
        joinDate: raw.joinDate,
        status: raw.status,
        contactNumber: raw.contactNumber ?? null,
        baseSalary: raw.baseSalary,
        managerId,
        gender: raw.gender ?? null,
        dateOfBirth: raw.dateOfBirth ?? null,
        placeOfBirth: raw.placeOfBirth ?? null,
        currentAddress: raw.currentAddress ?? null,
        nffNo: raw.nffNo ?? null,
        // Full-replace PUT: a missing allowance is coerced to ZERO server-side,
        // and maritalStatus is assigned unconditionally.
        positionAllowance: raw.positionAllowance ?? 0,
        evaluationAllowance: raw.evaluationAllowance ?? 0,
        maritalStatus: raw.maritalStatus ?? null,
        tid: raw.tid ?? null,
        // ID trio (V300/V301) round-tripped exactly as stored.
        tidType: raw.tidType ?? null,
        nationalityType: raw.nationalityType ?? null,
        visaExpireDate: raw.visaExpireDate ?? null,
        contractExpireDate: raw.contractExpireDate ?? null,
        resignDate: raw.resignDate ?? null,
        attendanceYn: raw.attendanceYn,
        attendanceExceptionStartDate: raw.attendanceExceptionStartDate ?? null,
        attendanceExceptionEndDate: raw.attendanceExceptionEndDate ?? null,
        attendanceExceptionRemark: raw.attendanceExceptionRemark ?? null,
        decouple: raw.decouple ?? false,
        claimSpouse: raw.claimSpouse ?? false,
      }).then(updated => {
        rawEmployeesRef.current.set(updated.id, updated);
      });
      // Optimistic update so the Members count refreshes immediately.
      setEmployees(prev => prev.map(e =>
        e.id === emp.id
          ? { ...e, department: newDeptId ?? '-', managerId: managerId ?? undefined }
          : e,
      ));
      toast.success(newDeptId
        ? `${emp.name} moved to "${targetDept?.name ?? newDeptId}"`
        : `${emp.name} removed`);
      onChanged?.();
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
        <div className="page-header-strip">
          <div>
            <h1 className="text-3xl font-bold">{t('page.depsgroup.title')}</h1>
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
          the Departments / Groups / Teams / Members breakdown. */}
      {!embedded && (
        <div className="stat-strip stat-cols-5">
          <StatCard label="Total" value={items.length} hint="Departments, groups & teams" icon={FolderTree} tone="blue" />
          <StatCard label="Departments" value={departments.length} hint="Organizational units" icon={Building2} tone="blue" />
          <StatCard label="Groups" value={groups.length} hint="Custom groups" icon={Users} tone="purple" />
          <StatCard label="Teams" value={teams.length} hint="Project / squad teams" icon={UserCheck} tone="green" />
          <StatCard label="Members" value={totalMembers} hint="Employees assigned to a department, group or team" icon={UserCheck} tone="amber" />
        </div>
      )}

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <div className="filter-strip">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="Search name or description…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 pl-7 w-64 text-sm"
              />
            </div>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as typeof filterType)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Filter by type"
            >
              <option value="all">Type : All</option>
              <option value="department">Type : Departments</option>
              <option value="group">Type : Groups</option>
              <option value="team">Type : Teams</option>
            </select>
            {isFiltered && (
              <Button
                size="sm" variant="ghost"
                className="h-9 shrink-0"
                onClick={() => { setSearch(''); setFilterType('all'); }}
              >
                Clear
              </Button>
            )}
            <span className="text-xs text-gray-500 shrink-0">{filtered.length} items</span>
          </div>
        </CardHeader>
        <CardContent>
          <ListTable>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead title="Person In Charge">PIC</TableHead>
                <TableHead className="text-center">Members</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && items.length === 0 ? (
                <TableBodySkeletonRows rows={6} columns={7} />
              ) : loadError && items.length === 0 ? (
                <ListError colSpan={7} message={loadError} onRetry={() => void loadDepartments()} />
              ) : filtered.length === 0 ? (
                <ListEmpty colSpan={7} noun="departments or groups" filtered={isFiltered} />
              ) : (
                depsPagination.paginatedItems.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        {/* Indent + branching arrow per nesting depth so the
                            parent → child relationship is obvious at a glance. */}
                        {item._depth > 0 && (
                          <span
                            className="text-gray-300 select-none tabular-nums text-xs"
                            style={{ paddingLeft: `${(item._depth - 1) * 18}px` }}
                            aria-hidden="true"
                          >
                            └─
                          </span>
                        )}
                        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          COLOR_DOT_CLASS[item.color] ?? 'bg-gray-500'
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
                                onClick={() => void handleDelete(item)}
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
          </ListTable>
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
              <Label className="text-sm">Name <span className="text-red-500">*</span></Label>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
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
  allowedTypes: DeptGroupType[];
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
