import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { mockDepartments, mockEmployees } from '../../data/mockData';
import { Department, Employee } from '../../types/hrms';
import * as departmentsApi from '../../api/departments';
import * as employeesApi from '../../api/employees';
import * as positionsApi from '../../api/positions';
import { USE_MOCKS } from '../../api/client';
import {
  Plus, Pencil, Trash2, Search, Briefcase, MoreHorizontal, Users,
} from 'lucide-react';
import { toast } from 'sonner';

interface Position {
  id: string;
  name: string;
  /** Empty string = unassigned / cross-departmental. */
  departmentId: string;
  description?: string;
}

// Mock-mode seed — keeps the page useful in `USE_MOCKS` runs that have no
// backend. Live mode loads from /api/v1/positions.
const SEED_POSITIONS: Omit<Position, 'id'>[] = [
  { name: 'Senior Developer',        departmentId: 'DEPT001' },
  { name: 'Frontend Developer',      departmentId: 'DEPT001' },
  { name: 'Backend Developer',       departmentId: 'DEPT001' },
  { name: 'QA Engineer',             departmentId: 'DEPT001' },
  { name: 'DevOps Engineer',         departmentId: 'DEPT001' },
  { name: 'Engineering Manager',     departmentId: 'DEPT001' },
  { name: 'HR Specialist',           departmentId: 'DEPT002' },
  { name: 'Recruiter',               departmentId: 'DEPT002' },
  { name: 'HR Manager',              departmentId: 'DEPT002' },
  { name: 'Sales Representative',    departmentId: 'DEPT003' },
  { name: 'Account Manager',         departmentId: 'DEPT003' },
  { name: 'Sales Manager',           departmentId: 'DEPT003' },
  { name: 'Marketing Specialist',    departmentId: 'DEPT004' },
  { name: 'Marketing Manager',       departmentId: 'DEPT004' },
  { name: 'Accountant',              departmentId: 'DEPT005' },
  { name: 'Finance Manager',         departmentId: 'DEPT005' },
];

const buildMockSeed = (): Position[] => SEED_POSITIONS.map((p, i) => ({
  id: `POS${String(i + 1).padStart(3, '0')}`,
  ...p,
}));

const emptyForm: Omit<Position, 'id'> = {
  name: '',
  departmentId: '',
  description: '',
};

interface PositionsProps {
  /** When true, skip the page-level title/description header. */
  embedded?: boolean;
}

export function Positions({ embedded = false }: PositionsProps = {}) {
  const [positions, setPositions] = useState<Position[]>(USE_MOCKS ? buildMockSeed() : []);
  const [departments, setDepartments] = useState<Department[]>(USE_MOCKS ? mockDepartments : []);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [form, setForm] = useState<Omit<Position, 'id'>>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState<string>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<Position | null>(null);

  const loadPositions = async () => {
    if (USE_MOCKS) return;
    setLoading(true);
    try {
      const list = await positionsApi.list();
      setPositions(list.map(p => ({
        id: p.id,
        name: p.name,
        departmentId: p.departmentId ?? '',
        description: p.description ?? '',
      })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load positions');
    } finally {
      setLoading(false);
    }
  };

  // Departments + employees feed the picker and the per-row member count.
  useEffect(() => {
    if (USE_MOCKS) return;
    void loadPositions();
    (async () => {
      try {
        const [deps, emps] = await Promise.all([
          departmentsApi.list(),
          employeesApi.list({ size: 500 }),
        ]);
        setDepartments(deps);
        setEmployees(emps.content.map(e => ({
          id: e.empNo,
          name: e.name,
          email: e.email,
          position: e.position,
          department: e.departmentId ?? '-',
          joinDate: e.joinDate,
          status: (e.status === 'active' ? 'active' : 'inactive') as Employee['status'],
          contactNumber: e.contactNumber ?? '',
          baseSalary: e.baseSalary,
        })));
      } catch (err) {
        console.warn('Could not load departments/employees for Positions view', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deptName = (id?: string) => {
    if (!id) return 'Unassigned';
    return departments.find(d => d.id === id)?.name ?? id;
  };

  // Per-position headcount: match by exact name (case-insensitive). Position
  // is a free-text field on Employee today, so name is the only join key.
  const memberCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of employees) {
      const key = (e.position || '').trim().toLowerCase();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [employees]);

  const countFor = (p: Position) => memberCount.get(p.name.trim().toLowerCase()) ?? 0;

  const filtered = positions.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(search.toLowerCase());
    const matchDept = filterDept === 'all'
      || (filterDept === '__none' ? !p.departmentId : p.departmentId === filterDept);
    return matchSearch && matchDept;
  });

  const pagination = usePagination(filtered, 10);
  useEffect(() => { pagination.resetPage(); }, [search, filterDept]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (p: Position) => {
    setEditing(p);
    setForm({ name: p.name, departmentId: p.departmentId, description: p.description || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error('Please enter a position name');
      return;
    }

    if (USE_MOCKS) {
      // Local-only duplicate guard mirrors the server-side check.
      const dup = positions.some(p =>
        p.id !== editing?.id &&
        p.name.trim().toLowerCase() === name.toLowerCase() &&
        (p.departmentId || '') === (form.departmentId || '')
      );
      if (dup) {
        toast.error('A position with this name already exists in that department');
        return;
      }
      if (editing) {
        setPositions(positions.map(p => p.id === editing.id ? { ...editing, ...form, name } : p));
        toast.success(`"${name}" updated`);
      } else {
        const next = positions.length + 1;
        const id = `POS${String(next).padStart(3, '0')}`;
        setPositions([...positions, { id, ...form, name }]);
        toast.success(`"${name}" created`);
      }
      setDialogOpen(false);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        description: form.description || undefined,
        departmentId: form.departmentId || null,
      };
      if (editing) {
        await positionsApi.update(editing.id, payload);
        toast.success(`"${name}" updated`);
      } else {
        await positionsApi.create(payload);
        toast.success(`"${name}" created`);
      }
      await loadPositions();
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save position');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Position) => {
    if (USE_MOCKS) {
      setPositions(positions.filter(x => x.id !== p.id));
      setDeleteConfirm(null);
      toast.success(`"${p.name}" deleted`);
      return;
    }
    try {
      await positionsApi.remove(p.id);
      toast.success(`"${p.name}" deleted`);
      setDeleteConfirm(null);
      await loadPositions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete position');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header — hidden when embedded in another page's tab */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Positions</h1>
            <p className="text-gray-500">Manage job positions and titles used when assigning employees.</p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Position
          </Button>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end">
          <Button onClick={openAdd} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Position
          </Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Total Positions</CardTitle>
            <Briefcase className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{positions.length}</div>
            <p className="text-xs text-gray-500">Across {departments.length} departments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Assigned</CardTitle>
            <Users className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {positions.filter(p => countFor(p) > 0).length}
            </div>
            <p className="text-xs text-gray-500">Positions with employees</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Vacant</CardTitle>
            <Briefcase className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {positions.filter(p => countFor(p) === 0).length}
            </div>
            <p className="text-xs text-gray-500">No employees assigned</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">All Positions</CardTitle>
              <CardDescription>
                {loading ? 'Loading…' : `${filtered.length} of ${positions.length}`}
              </CardDescription>
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
              <Select value={filterDept} onValueChange={setFilterDept}>
                <SelectTrigger className="h-9 w-48">
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  <SelectItem value="__none">Unassigned</SelectItem>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Position</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-center">Members</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-gray-400">
                    <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{loading ? 'Loading…' : 'No positions found'}</p>
                  </TableCell>
                </TableRow>
              ) : (
                pagination.paginatedItems.map(p => {
                  const count = countFor(p);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{p.name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.departmentId ? (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            {deptName(p.departmentId)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm font-medium">{count}</span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 max-w-md">
                        <span className="truncate inline-block max-w-full">
                          {p.description || <span className="text-gray-300">—</span>}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(p)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => setDeleteConfirm(p)}
                              disabled={count > 0}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {filtered.length > 10 && (
            <div className="mt-4">
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                onPageChange={pagination.setPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Position' : 'Add Position'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update the position details below.' : 'Create a new job position.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Senior Developer"
              />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select
                value={form.departmentId || '__none'}
                onValueChange={v => setForm({ ...form, departmentId: v === '__none' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Unassigned</SelectItem>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description || ''}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Optional — short summary of the role"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete position?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm && (
                <>This will remove <span className="font-semibold">{deleteConfirm.name}</span> from the position list. Existing employees keep their stored title — only future assignments are affected.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
