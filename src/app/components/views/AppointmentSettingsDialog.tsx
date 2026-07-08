import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Users, Loader2, Stethoscope, CircleDollarSign, User, Info, Plus, Trash2, X,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { SearchablePicker } from '../common/SearchablePicker';
import { toast } from 'sonner';
import * as employeesApi from '../../api/employees';

/**
 * Appointment / Healthcare Settings (V196 / v-healthcare-staff-roles).
 * Left-menu layout matching EncounterSettingsDialog. One panel today:
 * Staff Roles.
 *
 * <p>The Staff Roles panel lists ONLY employees who've been added to
 * a clinical role (tagged with {@code clinicalRole != null}). The
 * admin uses the "Add Staff" button to pick an untagged employee +
 * choose their role. Existing rows can be re-roled inline or removed
 * (untagged). The Doctor picker on Encounter + Appointment forms
 * filters to {@code clinicalRole === 'doctor'} — this dialog is
 * where the admin populates that set.</p>
 */

type Section = 'staff';

const MENU: ReadonlyArray<{ key: Section; label: string; icon: typeof Users; hint: string }> = [
  { key: 'staff', label: 'Staff Roles', icon: Users, hint: 'Tag Doctor / Cashier / Staff' },
];

/** Wire values (empty string = untag). Icons + hints are surfaced
 *  in the Add dialog so the admin knows what each role does. */
const ROLE_CHOICES: ReadonlyArray<{
  value: employeesApi.ClinicalRole;
  label: string;
  icon: typeof Stethoscope;
  hint: string;
}> = [
  { value: 'doctor',  label: 'Doctor',  icon: Stethoscope,      hint: 'Listed in the Doctor picker' },
  { value: 'cashier', label: 'Cashier', icon: CircleDollarSign, hint: 'Reception / billing side' },
  { value: 'staff',   label: 'Staff',   icon: User,             hint: 'Everyone else on the clinic payroll' },
];

export function AppointmentSettingsDialog({ open, onOpenChange, onChanged }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged?: () => void;
}) {
  const [section, setSection] = useState<Section>('staff');
  const [employees, setEmployees] = useState<employeesApi.Employee[]>([]);
  const [loading, setLoading]     = useState(false);
  const [busyId, setBusyId]       = useState<string | null>(null);
  const [addOpen, setAddOpen]     = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await employeesApi.list({ size: 500, status: 'active' });
      setEmployees(r.content ?? []);
    } catch {
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (open) void reload(); }, [open]);

  const tagged   = useMemo(() => employees.filter(e => !!e.clinicalRole), [employees]);
  const untagged = useMemo(() => employees.filter(e => !e.clinicalRole), [employees]);

  const patchRole = async (emp: employeesApi.Employee, next: employeesApi.ClinicalRole | null) => {
    setBusyId(emp.id);
    try {
      const saved = await employeesApi.update(emp.id, {
        ...(emp as unknown as employeesApi.CreateEmployeeRequest),
        clinicalRole: next,
      });
      setEmployees(list => list.map(e => e.id === emp.id ? saved : e));
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update role');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (emp: employeesApi.Employee) => {
    if (!confirm(`Remove ${emp.name} from clinical roles?`)) return;
    await patchRole(emp, null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[960px] w-[94vw] max-h-[92vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-teal-600" />
            Appointment Settings
          </DialogTitle>
          <DialogDescription className="sr-only">
            Tag employees with their healthcare role. Only Doctor-tagged rows appear in the Doctor picker.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-[500px]">
          <nav className="w-48 shrink-0 border-r bg-gray-50/50 py-2">
            <ul className="space-y-0.5 px-2">
              {MENU.map(m => {
                const active = section === m.key;
                const Icon = m.icon;
                return (
                  <li key={m.key}>
                    <button
                      type="button"
                      onClick={() => setSection(m.key)}
                      className={`w-full flex items-start gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                        active
                          ? 'bg-teal-50 text-teal-800 border border-teal-200'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${active ? 'text-teal-600' : 'text-gray-500'}`} />
                      <span>
                        <span className="font-medium block">{m.label}</span>
                        <span className={`text-[10px] leading-tight block ${active ? 'text-teal-700/70' : 'text-gray-500'}`}>
                          {m.hint}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex-1 min-w-0 overflow-y-auto px-6 py-4 space-y-3">
            {section === 'staff' && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-sm font-medium">Clinical staff</Label>
                      <TooltipProvider delayDuration={120}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-gray-400 hover:text-gray-600"
                              aria-label="Clinical role guidance"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                            Tag an employee as Doctor to make them selectable in
                            the Encounter + Appointment Doctor pickers. Cashier
                            and Staff are informational for now — no filter
                            fires off them yet.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setAddOpen(true)}
                      disabled={loading || untagged.length === 0}
                      title={untagged.length === 0 ? 'Every active employee is already tagged' : 'Add an employee to a clinical role'}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Staff
                    </Button>
                  </div>

                  {loading ? (
                    <div className="py-10 text-center text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 inline mr-1 animate-spin" /> Loading employees…
                    </div>
                  ) : tagged.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-500">
                      No clinical staff yet — click <b>Add Staff</b> to tag your first doctor.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Emp No</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Position</TableHead>
                          <TableHead className="w-[180px]">Role</TableHead>
                          <TableHead className="text-right w-[80px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tagged.map(e => {
                          const busy = busyId === e.id;
                          return (
                            <TableRow key={e.id} className="hover:bg-gray-50">
                              <TableCell className="tabular-nums text-sm">{e.empNo}</TableCell>
                              <TableCell className="text-sm font-medium">{e.name}</TableCell>
                              <TableCell className="text-sm text-gray-600">{e.position || '—'}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <select
                                    className="h-8 border rounded-md px-2 text-sm bg-background w-full"
                                    value={e.clinicalRole ?? ''}
                                    onChange={ev => patchRole(e, ev.target.value as employeesApi.ClinicalRole)}
                                    disabled={busy}
                                  >
                                    {ROLE_CHOICES.map(c => (
                                      <option key={c.value} value={c.value}>{c.label}</option>
                                    ))}
                                  </select>
                                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => remove(e)}
                                  disabled={busy}
                                  title="Remove from clinical roles"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>

      <AddStaffDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        candidates={untagged}
        onAdded={async (emp, role) => {
          setAddOpen(false);
          await patchRole(emp, role);
        }}
      />
    </Dialog>
  );
}

/** Compact add dialog — pick an untagged employee, pick a role,
 *  save. Employees whose {@code clinicalRole} is already set don't
 *  appear (they're managed via the main table's inline role dropdown
 *  and Remove action). */
function AddStaffDialog({ open, onOpenChange, candidates, onAdded }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidates: employeesApi.Employee[];
  onAdded: (emp: employeesApi.Employee, role: employeesApi.ClinicalRole) => Promise<void> | void;
}) {
  const [empId, setEmpId] = useState('');
  const [role, setRole]   = useState<employeesApi.ClinicalRole>('doctor');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmpId('');
    setRole('doctor');
  }, [open]);

  const options = useMemo(
    () => candidates.map(e => ({
      value: e.id,
      label: e.name,
      secondary: e.position || e.empNo || undefined,
      searchKey: `${e.name} ${e.position ?? ''} ${e.empNo ?? ''} ${e.email ?? ''}`,
    })),
    [candidates],
  );

  const save = async () => {
    const emp = candidates.find(e => e.id === empId);
    if (!emp) { toast.error('Pick an employee'); return; }
    setSaving(true);
    try {
      await onAdded(emp, role);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] w-[92vw]">
        <DialogHeader>
          <DialogTitle>Add clinical staff</DialogTitle>
          <DialogDescription className="sr-only">
            Pick an untagged employee and assign a clinical role.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Employee *</Label>
            <SearchablePicker
              options={options}
              value={empId}
              onChange={setEmpId}
              placeholder="Pick an employee"
              searchPlaceholder="Search name, position, empNo, email…"
              allowClear={false}
              emptyResultsLabel="No untagged employees left."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Role *</Label>
            <div className="grid grid-cols-3 gap-2">
              {ROLE_CHOICES.map(c => {
                const active = role === c.value;
                const Icon = c.icon;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setRole(c.value)}
                    className={`flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-teal-300 bg-teal-50 text-teal-800'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Icon className={`h-3.5 w-3.5 ${active ? 'text-teal-600' : 'text-gray-500'}`} />
                      {c.label}
                    </span>
                    <span className="text-[10px] leading-tight text-gray-500">{c.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="h-4 w-4 mr-1.5" /> Cancel
          </Button>
          <Button onClick={save} disabled={saving || !empId}>
            <Plus className="h-4 w-4 mr-1.5" /> {saving ? 'Adding…' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
