import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import * as salaryRulesApi from '../../api/salaryRules';
import { USE_MOCKS } from '../../api/client';
import {
  Plus, Pencil, Trash2, Search, DollarSign, MoreHorizontal, Info, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { notify } from '../../utils/notify';
import { useAuth } from '../../context/AuthContext';

interface SalaryRule {
  id: string;
  name: string;
  minYears: number;
  maxYears?: number | null;
  baseSalary: number;
  currency: string;
  description?: string;
}

const SEED_RULES: Omit<SalaryRule, 'id'>[] = [
  { name: 'Junior',  minYears: 0,  maxYears: 2,    baseSalary: 500,  currency: 'USD', description: 'Entry-level (0–2 yrs)' },
  { name: 'Mid',     minYears: 2,  maxYears: 5,    baseSalary: 800,  currency: 'USD', description: 'Mid-level (2–5 yrs)' },
  { name: 'Senior',  minYears: 5,  maxYears: 10,   baseSalary: 1500, currency: 'USD', description: 'Senior (5–10 yrs)' },
  { name: 'Lead',    minYears: 10, maxYears: null, baseSalary: 2500, currency: 'USD', description: 'Lead / 10+ yrs' },
];

const buildMockSeed = (): SalaryRule[] => SEED_RULES.map((r, i) => ({
  id: `RULE${String(i + 1).padStart(3, '0')}`,
  ...r,
}));

const emptyForm: Omit<SalaryRule, 'id'> = {
  name: '',
  minYears: 0,
  maxYears: null,
  baseSalary: 0,
  currency: 'USD',
  description: '',
};

interface Props {
  /** When true, skip the page-level title/description header. */
  embedded?: boolean;
}

export function SalaryRules({ embedded = false }: Props = {}) {
  const { canCreate, canUpdate, canDelete } = useAuth();
  // Salary rules are managed under Settings → Employee Settings.
  const canCreateRule = canCreate('settings');
  const canUpdateRule = canUpdate('settings');
  const canDeleteRule = canDelete('settings');
  const [rules, setRules] = useState<SalaryRule[]>(USE_MOCKS ? buildMockSeed() : []);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryRule | null>(null);
  const [form, setForm] = useState<Omit<SalaryRule, 'id'>>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<SalaryRule | null>(null);

  const loadRules = async () => {
    if (USE_MOCKS) return;
    setLoading(true);
    try {
      const list = await salaryRulesApi.list();
      setRules(list.map(r => ({
        id: r.id,
        name: r.name,
        minYears: r.minYears,
        maxYears: r.maxYears ?? null,
        baseSalary: r.baseSalary,
        currency: r.currency || 'USD',
        description: r.description || '',
      })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load salary rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadRules(); }, []);

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.minYears - b.minYears),
    [rules],
  );

  const filtered = sortedRules.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const pagination = usePagination(filtered, 10);
  useEffect(() => { pagination.resetPage(); }, [search]);

  // Surface overlapping ranges as a soft warning. Sorted ascending by
  // minYears, so any rule whose minYears < previous maxYears overlaps.
  const overlaps = useMemo(() => {
    const issues: string[] = [];
    for (let i = 1; i < sortedRules.length; i++) {
      const prev = sortedRules[i - 1];
      const cur = sortedRules[i];
      if (prev.maxYears != null && cur.minYears < prev.maxYears) {
        issues.push(`"${prev.name}" and "${cur.name}" overlap around ${cur.minYears} yr`);
      }
    }
    return issues;
  }, [sortedRules]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (r: SalaryRule) => {
    setEditing(r);
    setForm({
      name: r.name,
      minYears: r.minYears,
      maxYears: r.maxYears ?? null,
      baseSalary: r.baseSalary,
      currency: r.currency,
      description: r.description || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) { notify.validate('Please enter a rule name'); return; }
    if (form.minYears < 0) { notify.validate('Min years cannot be negative'); return; }
    if (form.maxYears != null && form.maxYears <= form.minYears) {
      notify.validate('Max years must be greater than min years');
      return;
    }
    if (!Number.isFinite(form.baseSalary) || form.baseSalary <= 0) {
      notify.validate('Base salary must be greater than 0');
      return;
    }

    if (USE_MOCKS) {
      if (editing) {
        setRules(rules.map(r => r.id === editing.id ? { ...editing, ...form, name } : r));
        toast.success(`"${name}" updated`);
      } else {
        const id = `RULE${String(rules.length + 1).padStart(3, '0')}`;
        setRules([...rules, { id, ...form, name }]);
        toast.success(`"${name}" created`);
      }
      setDialogOpen(false);
      return;
    }

    setSaving(true);
    try {
      const payload: salaryRulesApi.CreateSalaryRuleRequest = {
        name,
        minYears: form.minYears,
        maxYears: form.maxYears ?? null,
        baseSalary: form.baseSalary,
        currency: form.currency || 'USD',
        description: form.description || undefined,
      };
      if (editing) {
        await salaryRulesApi.update(editing.id, payload);
        toast.success(`"${name}" updated`);
      } else {
        await salaryRulesApi.create(payload);
        toast.success(`"${name}" created`);
      }
      await loadRules();
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save salary rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: SalaryRule) => {
    if (USE_MOCKS) {
      setRules(rules.filter(x => x.id !== r.id));
      setDeleteConfirm(null);
      toast.success(`"${r.name}" deleted`);
      return;
    }
    try {
      await salaryRulesApi.remove(r.id);
      toast.success(`"${r.name}" deleted`);
      setDeleteConfirm(null);
      await loadRules();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete salary rule');
    }
  };

  const formatRange = (r: SalaryRule) => {
    const min = Number.isInteger(r.minYears) ? `${r.minYears}` : r.minYears.toFixed(1);
    if (r.maxYears == null) return `${min}+ yrs`;
    const max = Number.isInteger(r.maxYears) ? `${r.maxYears}` : r.maxYears.toFixed(1);
    return `${min}–${max} yrs`;
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Salary Rules</h1>
            <p className="text-gray-500">Set base salary tiers based on years of experience.</p>
          </div>
          {canCreateRule && (
            <Button onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Rule
            </Button>
          )}
        </div>
      )}
      {embedded && canCreateRule && (
        <div className="flex justify-end">
          <Button onClick={openAdd} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Rule
          </Button>
        </div>
      )}

      {/* Help banner — explains how the rule resolves at hire time */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">How rules resolve</p>
              <p className="text-xs text-blue-700">
                A rule applies when an employee's experience falls in <code className="bg-white/60 px-1 rounded">[Min, Max)</code>.
                Leave <strong>Max</strong> blank for an open-ended upper bound (e.g. <em>10+ years</em>). Ranges should not
                overlap; any overlaps are flagged below.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {overlaps.length > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 text-sm text-amber-900">
            <p className="font-medium mb-1">Overlapping ranges</p>
            <ul className="text-xs space-y-0.5">
              {overlaps.map((msg, i) => <li key={i}>• {msg}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Summary cards — hidden when embedded in Employee Settings, which
          renders its own KPI strip above the tabs. */}
      {!embedded && (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <span className="text-2xl font-bold text-blue-600">{rules.length}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Total Tiers</p>
            <p className="text-[11px] text-gray-500 truncate">Defined experience brackets</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <span className="text-2xl font-bold text-green-600">
                {rules.length === 0 ? '—' : `$${Math.min(...rules.map(r => r.baseSalary)).toLocaleString()}`}
              </span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Lowest Base</p>
            <p className="text-[11px] text-gray-500 truncate">Minimum tier salary</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="h-5 w-5 text-purple-600" />
              <span className="text-2xl font-bold text-purple-600">
                {rules.length === 0 ? '—' : `$${Math.max(...rules.map(r => r.baseSalary)).toLocaleString()}`}
              </span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Highest Base</p>
            <p className="text-[11px] text-gray-500 truncate">Maximum tier salary</p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">All Salary Rules</CardTitle>
              <CardDescription>
                {loading ? 'Loading…' : `${filtered.length} of ${rules.length}`}
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 w-56"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Experience</TableHead>
                <TableHead className="text-right">Base Salary</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-gray-400">
                    <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{loading ? 'Loading…' : 'No salary rules yet'}</p>
                  </TableCell>
                </TableRow>
              ) : pagination.paginatedItems.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-sm">{r.name}</TableCell>
                  <TableCell className="text-sm">{formatRange(r)}</TableCell>
                  <TableCell className="text-right text-sm font-mono">
                    ${r.baseSalary.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-xs text-gray-400 ml-1">{r.currency}</span>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600 max-w-md">
                    <span className="truncate inline-block max-w-full">
                      {r.description || <span className="text-gray-300">—</span>}
                    </span>
                  </TableCell>
                  <TableCell>
                    {(canUpdateRule || canDeleteRule) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canUpdateRule && (
                            <DropdownMenuItem onClick={() => openEdit(r)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {canDeleteRule && (
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => setDeleteConfirm(r)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filtered.length > 10 && (
            <div className="mt-4">
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                onPageChange={pagination.goToPage}
                startIndex={pagination.startIndex}
                endIndex={pagination.endIndex}
                totalItems={pagination.totalItems}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Salary Rule' : 'Add Salary Rule'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update the tier details below.' : 'Define a new base-salary tier for an experience range.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tier Name <span className="text-red-500">*</span></Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Senior, Mid, Junior"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Min Years <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.minYears}
                  onChange={e => setForm({ ...form, minYears: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Years <span className="text-xs text-gray-400">(blank = open)</span></Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.maxYears ?? ''}
                  onChange={e => setForm({
                    ...form,
                    maxYears: e.target.value === '' ? null : parseFloat(e.target.value),
                  })}
                  placeholder="e.g. 5"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label>Base Salary <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.baseSalary}
                  onChange={e => setForm({ ...form, baseSalary: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input
                  value={form.currency}
                  onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase().slice(0, 8) })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description || ''}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Optional notes about when this tier applies"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
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
            <AlertDialogTitle>Delete salary rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm && (
                <>This will remove <span className="font-semibold">{deleteConfirm.name}</span> from the rule list. Existing employees keep their stored salary — only future hires are affected.</>
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
