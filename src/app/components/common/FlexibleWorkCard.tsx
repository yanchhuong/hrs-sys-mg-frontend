import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '../ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '../ui/command';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { UserCog, Plus, Pencil, Trash2, Search, X, RefreshCw, ChevronsUpDown, Check, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { mockEmployees } from '../../data/mockData';
import { Employee } from '../../types/hrms';
import {
  FlexibleSchedule, listFlexibleSchedules, upsertFlexibleSchedule,
  deleteFlexibleSchedule,
} from '../../utils/flexibleSchedule';
import { ScanRule, ScanMode } from '../../utils/scanRule';
import { makeDeptName } from '../../utils/deptName';
import * as flexApi from '../../api/flexibleSchedules';
import * as employeesApi from '../../api/employees';
import * as departmentsApi from '../../api/departments';
import { USE_MOCKS } from '../../api/client';

// ---------------------------------------------------------------------------
// Adapters: backend wire shape ↔ local mock shape
// ---------------------------------------------------------------------------

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

/** Map backend FlexibleSchedule (UUID employeeId, nullable fields) to the
 * local mock shape — same field names, just normalises null → undefined and
 * fills in updatedAt as a string for the existing renderer. */
function adaptApiSchedule(r: flexApi.FlexibleSchedule): FlexibleSchedule {
  return {
    id: r.id,
    employeeId: r.employeeId,
    mode: r.mode === 'two' || r.mode === 'four' ? r.mode : undefined,
    morningIn: r.morningIn ?? undefined,
    morningOut: r.morningOut ?? undefined,
    afternoonIn: r.afternoonIn ?? undefined,
    eveningOut: r.eveningOut ?? undefined,
    graceInMinutes: r.graceInMinutes ?? undefined,
    graceOutMinutes: r.graceOutMinutes ?? undefined,
    halfDayCountsAsHalfScan: r.halfDayCountsAsHalfScan ?? undefined,
    note: r.note ?? undefined,
    updatedAt: r.updatedAt ?? new Date().toISOString(),
  };
}

interface Props {
  scanRule: ScanRule;
}

type FormState = {
  id?: string;
  employeeId: string;
  mode: ScanMode | 'inherit';
  morningIn: string;
  morningOut: string;
  afternoonIn: string;
  eveningOut: string;
  graceInMinutes: string;
  graceOutMinutes: string;
  halfDayOverride: 'inherit' | 'on' | 'off';
  note: string;
};

function empty(rule: ScanRule): FormState {
  return {
    employeeId: '',
    mode: 'inherit',
    morningIn:   rule.morningIn,
    morningOut:  rule.morningOut,
    afternoonIn: rule.afternoonIn,
    eveningOut:  rule.eveningOut,
    graceInMinutes:  '',
    graceOutMinutes: '',
    halfDayOverride: 'inherit',
    note: '',
  };
}

export function FlexibleWorkCard({ scanRule }: Props) {
  const [rows, setRows] = useState<FlexibleSchedule[]>(USE_MOCKS ? listFlexibleSchedules() : []);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [deptList, setDeptList] = useState<departmentsApi.Department[]>([]);
  const [loading, setLoading] = useState(!USE_MOCKS);
  const [q, setQ] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => empty(scanRule));
  const [deleteTarget, setDeleteTarget] = useState<FlexibleSchedule | null>(null);

  // Resolve departmentId → name. The adapter stores the UUID on
  // `employee.department`; we never want to leak that into the UI.
  // Stale UUIDs (dept deleted) collapse to '' rather than show through.
  const deptName = makeDeptName(deptList, '');

  const refresh = async () => {
    if (USE_MOCKS) {
      setRows(listFlexibleSchedules());
      return;
    }
    try {
      const list = await flexApi.list();
      setRows(list.map(adaptApiSchedule));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load overrides');
    }
  };

  // Initial load — overrides + employee roster + departments. The roster
  // and departments unlock the "Pick an employee" dropdown and the
  // table's name + dept resolution.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (USE_MOCKS) {
          setRows(listFlexibleSchedules());
          return;
        }
        const [list, emps, deps] = await Promise.all([
          flexApi.list(),
          employeesApi.list({ size: 500 }),
          departmentsApi.list(),
        ]);
        if (cancelled) return;
        setRows(list.map(adaptApiSchedule));
        setEmployees(emps.content.map(adaptApiEmployee));
        setDeptList(deps);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load flexible work');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findEmp = (id: string | undefined): Employee | undefined =>
    id ? employees.find(e => e.id === id || (e as any).apiId === id) : undefined;

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter(r => {
      const e = findEmp(r.employeeId);
      const hay = `${e?.name ?? ''} ${e?.id ?? ''} ${deptName(e?.department)}`.toLowerCase();
      return hay.includes(kw);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, employees, deptList]);

  const openCreate = () => {
    setForm(empty(scanRule));
    setDialogOpen(true);
  };

  const openEdit = (row: FlexibleSchedule) => {
    setForm({
      id: row.id,
      employeeId: row.employeeId,
      mode: row.mode ?? 'inherit',
      morningIn:   row.morningIn   ?? scanRule.morningIn,
      morningOut:  row.morningOut  ?? scanRule.morningOut,
      afternoonIn: row.afternoonIn ?? scanRule.afternoonIn,
      eveningOut:  row.eveningOut  ?? scanRule.eveningOut,
      graceInMinutes:  row.graceInMinutes  != null ? String(row.graceInMinutes)  : '',
      graceOutMinutes: row.graceOutMinutes != null ? String(row.graceOutMinutes) : '',
      halfDayOverride:
        row.halfDayCountsAsHalfScan === undefined ? 'inherit'
        : row.halfDayCountsAsHalfScan ? 'on' : 'off',
      note: row.note ?? '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.employeeId) {
      toast.error('Pick an employee');
      return;
    }
    // Only persist fields that actually differ from the default — keeps the
    // override minimal so "inherit" truly inherits on later edits.
    const effectiveMode = form.mode === 'inherit' ? scanRule.mode : form.mode;
    const override = {
      employeeId: form.employeeId,
      mode: form.mode === 'inherit' ? undefined : form.mode,
      morningIn:   form.morningIn   !== scanRule.morningIn   ? form.morningIn   : undefined,
      morningOut:  effectiveMode === 'four' && form.morningOut  !== scanRule.morningOut  ? form.morningOut  : undefined,
      afternoonIn: effectiveMode === 'four' && form.afternoonIn !== scanRule.afternoonIn ? form.afternoonIn : undefined,
      eveningOut:  form.eveningOut  !== scanRule.eveningOut  ? form.eveningOut  : undefined,
      graceInMinutes:  form.graceInMinutes.trim()  !== '' ? Number(form.graceInMinutes)  : undefined,
      graceOutMinutes: form.graceOutMinutes.trim() !== '' ? Number(form.graceOutMinutes) : undefined,
      halfDayCountsAsHalfScan:
        form.halfDayOverride === 'inherit' ? undefined : form.halfDayOverride === 'on',
      note: form.note.trim() || undefined,
    };

    const emp = findEmp(form.employeeId);
    const empLabel = emp?.name ?? form.employeeId;

    if (USE_MOCKS) {
      upsertFlexibleSchedule(override);
      toast.success(form.id
        ? `Override updated for ${empLabel}`
        : `Override saved for ${empLabel}`);
      setDialogOpen(false);
      void refresh();
      return;
    }

    // Live mode: backend POST is upsert-by-(tenant, employee), so we always
    // POST regardless of whether the dialog is "create" or "edit". Backend
    // expects empty strings for blank fields, not undefined.
    try {
      await flexApi.upsert({
        employeeId: form.employeeId,
        mode: override.mode ?? '' as any,
        morningIn: override.morningIn ?? '',
        morningOut: override.morningOut ?? '',
        afternoonIn: override.afternoonIn ?? '',
        eveningOut: override.eveningOut ?? '',
        graceInMinutes: override.graceInMinutes ?? null,
        graceOutMinutes: override.graceOutMinutes ?? null,
        halfDayCountsAsHalfScan: override.halfDayCountsAsHalfScan ?? null,
        note: override.note ?? '',
      });
      toast.success(form.id
        ? `Override updated for ${empLabel}`
        : `Override saved for ${empLabel}`);
      setDialogOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save override');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const emp = findEmp(deleteTarget.employeeId);
    const empLabel = emp?.name ?? deleteTarget.employeeId;
    if (USE_MOCKS) {
      deleteFlexibleSchedule(deleteTarget.id);
      toast.success(`Override removed for ${empLabel}`);
      setDeleteTarget(null);
      void refresh();
      return;
    }
    try {
      await flexApi.remove(deleteTarget.id);
      toast.success(`Override removed for ${empLabel}`);
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete override');
    }
  };

  const effectiveMode: ScanMode = form.mode === 'inherit' ? scanRule.mode : form.mode;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-blue-600" />
              Flexible Work
              <HelpHint>
                Per-employee overrides on top of the tenant Scan Rule. Leave a field
                unchanged to inherit from the default.
              </HelpHint>
            </CardTitle>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add override
          </Button>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search name, ID, department…"
            className="h-8 pl-8 pr-8 text-sm"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 justify-center py-10 text-sm text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading overrides…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">
            {rows.length === 0
              ? 'No overrides yet. Click "Add override" to set custom hours for a specific employee.'
              : 'No overrides match that search.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-center">Morning In</TableHead>
                <TableHead className="text-center">Morning Out</TableHead>
                <TableHead className="text-center">Afternoon In</TableHead>
                <TableHead className="text-center">Evening Out</TableHead>
                <TableHead className="text-center">Grace In/Out</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(row => {
                const emp = findEmp(row.employeeId);
                const rowMode = row.mode ?? scanRule.mode;
                const dept = deptName(emp?.department);
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{emp?.name ?? '—'}</span>
                        <span className="text-[11px] text-gray-500">
                          {emp?.id ?? ''}{dept ? ` · ${dept}` : ''}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.mode ? 'default' : 'outline'} className="text-[10px]">
                        {rowMode === 'four' ? '4-scan' : '2-scan'}
                        {!row.mode && ' · inherit'}
                      </Badge>
                    </TableCell>
                    <OverrideCell value={row.morningIn}   fallback={scanRule.morningIn} />
                    <OverrideCell value={row.morningOut}  fallback={scanRule.morningOut}  visible={rowMode === 'four'} />
                    <OverrideCell value={row.afternoonIn} fallback={scanRule.afternoonIn} visible={rowMode === 'four'} />
                    <OverrideCell value={row.eveningOut}  fallback={scanRule.eveningOut} />
                    <TableCell className="text-center text-xs">
                      <span className={row.graceInMinutes != null ? 'text-blue-700 font-medium' : 'text-gray-400'}>
                        {row.graceInMinutes ?? scanRule.graceInMinutes}
                      </span>
                      <span className="text-gray-400"> / </span>
                      <span className={row.graceOutMinutes != null ? 'text-blue-700 font-medium' : 'text-gray-400'}>
                        {row.graceOutMinutes ?? scanRule.graceOutMinutes}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-gray-600 max-w-[180px] truncate" title={row.note ?? ''}>
                      {row.note ?? <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {format(new Date(row.updatedAt), 'MMM dd, HH:mm')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(row)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          onClick={() => setDeleteTarget(row)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-blue-600" />
              {form.id ? 'Edit override' : 'Add override'}
              <HelpHint>
                Fields prefilled from the tenant Scan Rule. Change only the ones that
                differ for this employee; the rest stay inherited.
              </HelpHint>
            </DialogTitle>
            {/* DialogDescription kept (sr-only) for Radix
                accessibility — the tooltip beside the title carries
                the hint visually. */}
            <DialogDescription className="sr-only">
              Fields prefilled from the tenant Scan Rule. Change only the ones that differ
              for this employee; the rest stay inherited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Employee <span className="text-red-500">*</span></Label>
              <EmployeePicker
                employees={employees}
                deptName={deptName}
                value={form.employeeId}
                onChange={v => setForm({ ...form, employeeId: v })}
                disabled={!!form.id}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Scan mode</Label>
              <Select value={form.mode} onValueChange={v => setForm({ ...form, mode: v as FormState['mode'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Inherit from Scan Rule ({scanRule.mode === 'four' ? '4-scan' : '2-scan'})</SelectItem>
                  <SelectItem value="two">Force 2 scans per day</SelectItem>
                  <SelectItem value="four">Force 4 scans per day</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Target times</Label>
              {effectiveMode === 'four' ? (
                <div className="grid grid-cols-2 gap-3">
                  <TimeField label="Morning check-in"   value={form.morningIn}   default={scanRule.morningIn}
                             onChange={v => setForm({ ...form, morningIn: v })} />
                  <TimeField label="Morning check-out"  value={form.morningOut}  default={scanRule.morningOut}
                             onChange={v => setForm({ ...form, morningOut: v })} />
                  <TimeField label="Afternoon check-in" value={form.afternoonIn} default={scanRule.afternoonIn}
                             onChange={v => setForm({ ...form, afternoonIn: v })} />
                  <TimeField label="Evening check-out"  value={form.eveningOut}  default={scanRule.eveningOut}
                             onChange={v => setForm({ ...form, eveningOut: v })} />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <TimeField label="Morning check-in"   value={form.morningIn}  default={scanRule.morningIn}
                             onChange={v => setForm({ ...form, morningIn: v })} />
                  <TimeField label="Evening check-out"  value={form.eveningOut} default={scanRule.eveningOut}
                             onChange={v => setForm({ ...form, eveningOut: v })} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Grace min after IN</Label>
                <Input
                  type="number" min={0} max={60}
                  value={form.graceInMinutes}
                  onChange={e => setForm({ ...form, graceInMinutes: e.target.value })}
                  placeholder={`${scanRule.graceInMinutes} (inherit)`}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Grace min before OUT</Label>
                <Input
                  type="number" min={0} max={60}
                  value={form.graceOutMinutes}
                  onChange={e => setForm({ ...form, graceOutMinutes: e.target.value })}
                  placeholder={`${scanRule.graceOutMinutes} (inherit)`}
                />
              </div>
            </div>

            {effectiveMode === 'two' && (
              <div className="flex items-center justify-between gap-4 p-3 rounded-md border bg-gray-50">
                <p className="text-sm font-medium inline-flex items-center gap-1.5">
                  Half-day leave counts as half-scan
                  <HelpHint>
                    Inherit = follows the tenant Scan Rule. Override only if this employee
                    has a different half-day policy.
                  </HelpHint>
                </p>
                <Select
                  value={form.halfDayOverride}
                  onValueChange={v => setForm({ ...form, halfDayOverride: v as FormState['halfDayOverride'] })}
                >
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">Inherit</SelectItem>
                    <SelectItem value="on">On</SelectItem>
                    <SelectItem value="off">Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Note</Label>
              <Input
                value={form.note}
                onChange={e => setForm({ ...form, note: e.target.value })}
                placeholder="e.g. Remote Fridays, flex-start for parents"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{form.id ? 'Save changes' : 'Add override'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this override?</AlertDialogTitle>
            <AlertDialogDescription>
              The employee will fall back to the tenant Scan Rule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={confirmDelete}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Small helpers (private)
// ---------------------------------------------------------------------------

/**
 * Searchable employee picker. Filters to active employees only and lets the
 * admin type to narrow the list — name, empNo, and department are all matched
 * by cmdk's fuzzy filter.
 *
 * `value` is whatever the backend stores on `employeeId` (UUID in live mode,
 * empNo in mock mode), so `e.apiId ?? e.id` is what we emit.
 */
function EmployeePicker({
  employees, deptName, value, onChange, disabled,
}: {
  employees: Employee[];
  deptName: (d: string | undefined) => string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = employees.filter(e => e.status === 'active');

  const selected = employees.find(e => ((e as any).apiId ?? e.id) === value);
  const selectedLabel = selected
    ? `${selected.name} — ${selected.id}${deptName(selected.department) ? ` · ${deptName(selected.department)}` : ''}`
    : 'Pick an employee';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
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
                const dept = deptName(e.department);
                // `value` for cmdk is what gets matched against the search
                // string — concatenate name + empNo + dept so all three match.
                const haystack = `${e.name} ${e.id} ${dept}`;
                return (
                  <CommandItem
                    key={val}
                    value={haystack}
                    onSelect={() => {
                      onChange(val);
                      setOpen(false);
                    }}
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

function OverrideCell({
  value, fallback, visible = true,
}: { value?: string; fallback: string; visible?: boolean }) {
  if (!visible) {
    return <TableCell className="text-center text-xs text-gray-300">—</TableCell>;
  }
  if (value != null) {
    return (
      <TableCell className="text-center text-xs text-blue-700 font-medium">
        {value}
      </TableCell>
    );
  }
  return (
    <TableCell className="text-center text-xs text-gray-400" title={`Inherits ${fallback}`}>
      {fallback}
    </TableCell>
  );
}

function TimeField({
  label, value, onChange, default: def,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  default: string;
}) {
  const overridden = value !== def;
  return (
    <div className="space-y-1.5">
      <Label className="text-sm inline-flex items-center gap-1.5">
        {label}
        <HelpHint>Default {def}.</HelpHint>
        {overridden && (
          <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px] h-4 px-1.5">override</Badge>
        )}
      </Label>
      <Input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={overridden ? 'ring-1 ring-blue-300' : ''}
      />
    </div>
  );
}

/** Small (i) icon + tooltip used to demote inline helper text into a
 *  hover-only hint. Same pattern as the AttendanceSettings + Accounting
 *  Settings dialogs so the visual language stays consistent. */
function HelpHint({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
            <Info className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
