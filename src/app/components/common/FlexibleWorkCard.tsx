import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { UserCog, Plus, Pencil, Trash2, Search, X, RefreshCw, Info } from 'lucide-react';
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
import { SearchablePicker, type PickerOption } from './SearchablePicker';
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
    workDays: r.workDays ?? undefined,
    note: r.note ?? undefined,
    updatedAt: r.updatedAt ?? new Date().toISOString(),
  };
}

interface Props {
  scanRule: ScanRule;
  /**
   * The tenant's own week as a Mon..Sun mask ('1' full, '2' half,
   * '0' off). The day picker opens on this instead of on a guess, and
   * an override is only stored when the two differ — the same rule
   * the times and the scan mode follow.
   */
  companyWeek: string;
}

/**
 * Mon..Sun, matching the seven-character mask the API stores:
 * position = DayOfWeek.getValue(), so index 0 is Monday and index 6
 * is Sunday. Not locale-ordered on purpose — the server reads it
 * positionally and a Sunday-first UI would silently shift every day.
 */
const WEEK = [
  { i: 0, short: 'Mon' }, { i: 1, short: 'Tue' }, { i: 2, short: 'Wed' },
  { i: 3, short: 'Thu' }, { i: 4, short: 'Fri' }, { i: 5, short: 'Sat' },
  { i: 6, short: 'Sun' },
] as const;

/** '1' full day · '2' half day · '0' off — the three states the
 *  tenant week has carried since V169. */
type MaskDay = '0' | '1' | '2';

const dayAt = (mask: string, i: number): MaskDay =>
  (mask.length === 7 ? (mask[i] as MaskDay) : '1');

/**
 * Cycle one day full → half → off → full.
 *
 * The step that would clear the last remaining day is skipped rather
 * than taken: all-off is a lockout, not a schedule, and the server
 * coerces "0000000" to inherit anyway.
 */
const cycleDay = (mask: string, i: number): string => {
  const base = (mask.length === 7 ? mask : '1111111').split('');
  base[i] = base[i] === '1' ? '2' : base[i] === '2' ? '0' : '1';
  const next = base.join('');
  return next === '0000000' ? mask : next;
};

/** "5 days" · "5 days + 1 half" — a half day is not a whole one, so
 *  the summary must not round it away. */
const describeWeek = (mask: string): string => {
  const full = mask.split('').filter(c => c === '1').length;
  const half = mask.split('').filter(c => c === '2').length;
  const a = `${full} day${full === 1 ? '' : 's'}`;
  return half === 0 ? a : `${a} + ${half} half`;
};

type FormState = {
  id?: string;
  employeeId: string;
  /** Always a concrete mode. 'inherit' was removed with the
     *  dropdown row that offered it; the form starts on the company
     *  value and the save stores a mode only when it differs. */
  mode: ScanMode;
  morningIn: string;
  morningOut: string;
  afternoonIn: string;
  eveningOut: string;
  graceInMinutes: string;
  graceOutMinutes: string;
  /** On / Off only. Mobile dropped 'Inherit' here for the same
   *  reason the scan mode lost it — it sat beside the option it
   *  equalled. Starts on the company value, stored only when it
   *  differs. */
  halfDayOverride: 'on' | 'off';
  /** Seven-char Mon..Sun mask, or '' to inherit the tenant's week. */
  workDays: string;
  note: string;
};

function empty(rule: ScanRule): FormState {
  return {
    employeeId: '',
    mode: rule.mode,
    morningIn:   rule.morningIn,
    morningOut:  rule.morningOut,
    afternoonIn: rule.afternoonIn,
    eveningOut:  rule.eveningOut,
    graceInMinutes:  '',
    graceOutMinutes: '',
    halfDayOverride: rule.halfDayCountsAsHalfScan ? 'on' : 'off',
    workDays: '',
    note: '',
  };
}

export function FlexibleWorkCard({ scanRule, companyWeek }: Props) {
  const [rows, setRows] = useState<FlexibleSchedule[]>(USE_MOCKS ? listFlexibleSchedules() : []);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [deptList, setDeptList] = useState<departmentsApi.Department[]>([]);
  const [loading, setLoading] = useState(!USE_MOCKS);
  const [q, setQ] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => empty(scanRule));
  const [deleteTarget, setDeleteTarget] = useState<FlexibleSchedule | null>(null);
  // Stored workDays per employee — the dialog doesn't edit it, but the
  // upsert replaces every field, so a save must carry it or wipe it.
  const [workDaysByEmp, setWorkDaysByEmp] = useState<Record<string, string | null>>({});

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
      setRows(list.map(adaptApiSchedule)); setWorkDaysByEmp(Object.fromEntries(list.map(r => [r.employeeId, r.workDays ?? null])));
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
        setRows(list.map(adaptApiSchedule)); setWorkDaysByEmp(Object.fromEntries(list.map(r => [r.employeeId, r.workDays ?? null])));
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

  /**
   * Options for the Add-override employee picker. Active only — an
   * override on a leaver has nothing to apply to.
   *
   * `value` is the API id so it round-trips to the backend, while
   * `searchKey` carries name + employee number + department so all
   * three still match what the user types. The old local picker put
   * that haystack in cmdk's `value`, which conflated identity with
   * search text.
   */
  // What the picker shows: the override's own mask when it has one,
  // otherwise the company week it would inherit.
  const days = form.workDays.length === 7 ? form.workDays : companyWeek;

  const employeeOptions = useMemo<PickerOption[]>(
    () => employees
      .filter(e => e.status === 'active')
      .map(e => {
        const dept = deptName(e.department);
        return {
          value: (e as any).apiId ?? e.id,
          label: e.name,
          secondary: `— ${e.id}${dept ? ` · ${dept}` : ''}`,
          searchKey: `${e.name} ${e.id} ${dept}`,
        };
      }),
    // deptName is rebuilt each render from deptList; depend on that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, deptList],
  );

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
      mode: row.mode ?? scanRule.mode,
      morningIn:   row.morningIn   ?? scanRule.morningIn,
      morningOut:  row.morningOut  ?? scanRule.morningOut,
      afternoonIn: row.afternoonIn ?? scanRule.afternoonIn,
      eveningOut:  row.eveningOut  ?? scanRule.eveningOut,
      graceInMinutes:  row.graceInMinutes  != null ? String(row.graceInMinutes)  : '',
      graceOutMinutes: row.graceOutMinutes != null ? String(row.graceOutMinutes) : '',
      halfDayOverride:
        row.halfDayCountsAsHalfScan == null
          ? (scanRule.halfDayCountsAsHalfScan ? 'on' : 'off')
          : row.halfDayCountsAsHalfScan ? 'on' : 'off',
      workDays: row.workDays ?? '',
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
    const effectiveMode = form.mode;
    const override = {
      employeeId: form.employeeId,
      mode: form.mode !== scanRule.mode ? form.mode : undefined,
      morningIn:   form.morningIn   !== scanRule.morningIn   ? form.morningIn   : undefined,
      morningOut:  effectiveMode === 'four' && form.morningOut  !== scanRule.morningOut  ? form.morningOut  : undefined,
      afternoonIn: effectiveMode === 'four' && form.afternoonIn !== scanRule.afternoonIn ? form.afternoonIn : undefined,
      eveningOut:  form.eveningOut  !== scanRule.eveningOut  ? form.eveningOut  : undefined,
      graceInMinutes:  form.graceInMinutes.trim()  !== '' ? Number(form.graceInMinutes)  : undefined,
      graceOutMinutes: form.graceOutMinutes.trim() !== '' ? Number(form.graceOutMinutes) : undefined,
      halfDayCountsAsHalfScan:
        form.halfDayOverride !== (scanRule.halfDayCountsAsHalfScan ? 'on' : 'off')
          ? form.halfDayOverride === 'on'
          : undefined,
      workDays: days !== companyWeek ? days : undefined,
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
        workDays: workDaysByEmp[form.employeeId] ?? null,
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

  const effectiveMode: ScanMode = form.mode;

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
              {/* The shared picker, not a local one. This dialog used
                  to carry its own cmdk combobox; it was the only
                  bespoke copy left against 28 files on
                  SearchablePicker, and the one where arrow-key
                  navigation did not keep the highlighted row in
                  view. */}
              <SearchablePicker
                options={employeeOptions}
                value={form.employeeId}
                onChange={v => setForm({ ...form, employeeId: v })}
                placeholder="Pick an employee"
                searchPlaceholder="Search name, ID, department…"
                emptyResultsLabel="No active employees match that."
                allowClear={false}
                disabled={!!form.id}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Scan mode</Label>
              <Select value={form.mode} onValueChange={v => setForm({ ...form, mode: v as FormState['mode'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {/* No "Inherit" row. It sat beside the option it
                      equals — "Inherit (2-scan)" and "2 scans" are one
                      choice wearing two hats — and read as a decision
                      when only one of them was. The select starts on
                      the company value and is stored only when it
                      differs, like the times below it. */}
                  <SelectItem value="two">2 scans per day</SelectItem>
                  <SelectItem value="four">4 scans per day</SelectItem>
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
                    Starts on the tenant Scan Rule's setting and is only stored as an
                    override once you change it — so leaving it alone keeps following
                    the rule.
                  </HelpHint>
                </p>
                <Select
                  value={form.halfDayOverride}
                  onValueChange={v => setForm({ ...form, halfDayOverride: v as FormState['halfDayOverride'] })}
                >
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on">On</SelectItem>
                    <SelectItem value="off">Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Working days. The override is the rule for this
                employee: a day switched on here is a day they can
                check in, including a weekend the rest of the company
                does not work. Left on Inherit, the tenant's ordinary
                week applies and nothing is restricted. */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">
                Working days
                <HelpHint>
                  Which days this employee is expected in. Tap a day to cycle it
                  full → half → off. Check-in is refused on the days that are off.
                  Switch a weekend on and they can check in then — the override is the
                  rule for this employee, not a filter on the standard week. It starts
                  on the company's week and is only stored once it differs.
                </HelpHint>
              </Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {WEEK.map(d => {
                  const state = dayAt(days, d.i);
                  return (
                    <button
                      key={d.i}
                      type="button"
                      onClick={() => setForm({ ...form, workDays: cycleDay(days, d.i) })}
                      aria-pressed={state !== '0'}
                      title={state === '1' ? 'Full day' : state === '2' ? 'Half day' : 'Not a working day'}
                      className={`relative h-8 w-12 rounded-md border text-xs font-medium transition ${
                        state === '1'
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : state === '2'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 text-gray-400 hover:border-gray-400'
                      }`}
                    >
                      {d.short}
                      {state === '2' && (
                        <span className="absolute top-0 right-1 text-[9px] font-bold text-blue-600">½</span>
                      )}
                    </button>
                  );
                })}
                {days !== companyWeek && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-gray-500"
                    onClick={() => setForm({ ...form, workDays: '' })}
                  >
                    Reset
                  </Button>
                )}
              </div>
              <p className={`text-[11px] ${days !== companyWeek ? 'text-blue-700' : 'text-gray-500'}`}>
                {days === companyWeek
                  ? `Company default · ${describeWeek(days)}`
                  : `Custom · ${describeWeek(days)}`}
              </p>
            </div>

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
