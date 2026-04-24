import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
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
import { UserCog, Plus, Pencil, Trash2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { mockEmployees } from '../../data/mockData';
import {
  FlexibleSchedule, listFlexibleSchedules, upsertFlexibleSchedule,
  deleteFlexibleSchedule,
} from '../../utils/flexibleSchedule';
import { ScanRule, ScanMode } from '../../utils/scanRule';

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
  const [rows, setRows] = useState<FlexibleSchedule[]>(() => listFlexibleSchedules());
  const [q, setQ] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => empty(scanRule));
  const [deleteTarget, setDeleteTarget] = useState<FlexibleSchedule | null>(null);

  const refresh = () => setRows(listFlexibleSchedules());

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter(r => {
      const e = mockEmployees.find(x => x.id === r.employeeId);
      const hay = `${e?.name ?? ''} ${e?.id ?? ''} ${e?.department ?? ''}`.toLowerCase();
      return hay.includes(kw);
    });
  }, [rows, q]);

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

  const handleSubmit = () => {
    if (!form.employeeId) {
      toast.error('Pick an employee');
      return;
    }
    // Only persist fields that actually differ from the default — this keeps
    // the override minimal and makes "inherit" truly inherit on later edits.
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

    upsertFlexibleSchedule(override);
    const emp = mockEmployees.find(e => e.id === form.employeeId);
    toast.success(form.id
      ? `Override updated for ${emp?.name ?? form.employeeId}`
      : `Override saved for ${emp?.name ?? form.employeeId}`);
    setDialogOpen(false);
    refresh();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteFlexibleSchedule(deleteTarget.id);
    const emp = mockEmployees.find(e => e.id === deleteTarget.employeeId);
    toast.success(`Override removed for ${emp?.name ?? deleteTarget.employeeId}`);
    setDeleteTarget(null);
    refresh();
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
            </CardTitle>
            <CardDescription>
              Per-employee overrides on top of the tenant Scan Rule. Leave a field unchanged
              to inherit from the default.
            </CardDescription>
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
        {filtered.length === 0 ? (
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
                const emp = mockEmployees.find(e => e.id === row.employeeId);
                const rowMode = row.mode ?? scanRule.mode;
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{emp?.name ?? row.employeeId}</span>
                        <span className="text-[11px] text-gray-500">
                          {emp?.id ?? ''}{emp?.department ? ` · ${emp.department}` : ''}
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
            </DialogTitle>
            <DialogDescription>
              Fields prefilled from the tenant Scan Rule. Change only the ones that differ
              for this employee; the rest stay inherited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Employee <span className="text-red-500">*</span></Label>
              <Select
                value={form.employeeId}
                onValueChange={v => setForm({ ...form, employeeId: v })}
                disabled={!!form.id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick an employee" />
                </SelectTrigger>
                <SelectContent>
                  {mockEmployees.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} — {e.id}{e.department ? ` · ${e.department}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <div className="flex items-start justify-between gap-4 p-3 rounded-md border bg-gray-50">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Half-day leave counts as half-scan</p>
                  <p className="text-[11px] text-gray-500">
                    Inherit = follows the tenant Scan Rule. Override only if this employee has
                    a different half-day policy.
                  </p>
                </div>
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
      <Label className="text-sm flex items-center gap-1.5">
        {label}
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
      <p className="text-[11px] text-gray-400">Default {def}</p>
    </div>
  );
}
