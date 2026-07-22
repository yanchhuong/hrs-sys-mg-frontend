import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog';
import {
  Plus, RefreshCw, CalendarClock, Search, Play, Check, Ban, Trash2, Undo2, Pencil, Settings, Info,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { AppointmentSettingsDialog } from './AppointmentSettingsDialog';
import { toast } from 'sonner';
import { SearchablePicker } from '../common/SearchablePicker';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import * as appointmentsApi from '../../api/appointments';
import * as invoicesApi from '../../api/invoices';
import * as customersApi from '../../api/customers';
import * as employeesApi from '../../api/employees';
import { useAuth } from '../../context/AuthContext';
import { useDateFormat } from '../../context/DateFormatContext';

/**
 * Healthcare > Appointment — the waiting-room queue (V194 /
 * v-hospital-appointments). Cashier books a slot against an
 * existing Encounter; the queue then drives the doctor's day:
 *
 *   waiting → Start → in_progress → Complete → completed
 *                             │
 *                             └─ Cancel → cancelled (terminal)
 *
 * <p>Payments / billing don't happen here — they stay on the
 * Encounter detail dialog. This view is purely about routing
 * patients to the right doctor at the right time.</p>
 */
export function Appointments() {
  const { canCreate, canUpdate, canDelete } = useAuth();
  const { formatDateTime } = useDateFormat();
  const canAdd    = canCreate('appointment');
  const canEdit   = canUpdate('appointment');
  const canRemove = canDelete('appointment');

  const [rows, setRows]           = useState<appointmentsApi.Appointment[]>([]);
  const [encounters, setEncounters] = useState<invoicesApi.Invoice[]>([]);
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  const [doctors, setDoctors]     = useState<employeesApi.Employee[]>([]);
  const [loading, setLoading]     = useState(false);

  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | appointmentsApi.AppointmentStatus>('all');
  const [doctorFilter, setDoctorFilter] = useState<'all' | string>('all');

  const [formOpen, setFormOpen]     = useState(false);
  const [editing, setEditing]       = useState<appointmentsApi.Appointment | null>(null);
  const [busyId, setBusyId]         = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [appts, encs, custs, emps] = await Promise.all([
        appointmentsApi.list(),
        // Only medical invoices can be booked — filter here so the
        // Book Appointment dropdown only shows valid options.
        invoicesApi.list({ kind: 'medical', size: 500 }),
        customersApi.list({ size: 500 }),
        employeesApi.list({ size: 500, status: 'active' }),
      ]);
      setRows(appts);
      setEncounters(encs.content ?? []);
      setCustomers(custs.content ?? []);
      setDoctors(emps.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const encById   = useMemo(() => new Map(encounters.map(e => [e.id, e])), [encounters]);
  const custById  = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);
  const docById   = useMemo(() => new Map(doctors.map(d => [d.id, d])), [doctors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (doctorFilter !== 'all' && a.doctorId !== doctorFilter) return false;
      if (!q) return true;
      const patient = a.patientId ? custById.get(a.patientId)?.name?.toLowerCase() ?? '' : '';
      const doctor  = a.doctorId  ? docById.get(a.doctorId)?.name?.toLowerCase() ?? '' : '';
      const enc     = encById.get(a.encounterId)?.invoiceNo?.toLowerCase() ?? '';
      return String(a.queueNo).includes(q)
          || enc.includes(q)
          || patient.includes(q)
          || doctor.includes(q);
    });
  }, [rows, search, statusFilter, doctorFilter, custById, docById, encById]);

  // 10 rows per page — same rhythm as the Encounter + Invoice lists.
  const pagination = usePagination(filtered, 10);

  const doTransition = async (a: appointmentsApi.Appointment, next: appointmentsApi.AppointmentStatus) => {
    setBusyId(a.id);
    try {
      await appointmentsApi.transition(a.id, next);
      toast.success(`Appointment #${a.queueNo} → ${next}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async (a: appointmentsApi.Appointment) => {
    if (!confirm(`Delete appointment #${a.queueNo}?`)) return;
    setBusyId(a.id);
    try {
      await appointmentsApi.remove(a.id);
      toast.success(`Appointment #${a.queueNo} deleted`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete appointment');
    } finally {
      setBusyId(null);
    }
  };

  const statusBadge = (s: appointmentsApi.AppointmentStatus): string => {
    switch (s) {
      case 'waiting':     return 'border-amber-300 text-amber-700 bg-amber-50';
      case 'in_progress': return 'border-blue-300 text-blue-700 bg-blue-50';
      case 'completed':   return 'border-emerald-300 text-emerald-700 bg-emerald-50';
      case 'cancelled':   return 'border-gray-300 text-gray-500 bg-gray-50';
      default:            return 'border-gray-200 text-gray-700 bg-gray-50';
    }
  };

  const statusFilters: ReadonlyArray<{ value: 'all' | appointmentsApi.AppointmentStatus; label: string }> = [
    { value: 'all',         label: 'All' },
    { value: 'waiting',     label: 'Waiting' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed',   label: 'Completed' },
    { value: 'cancelled',   label: 'Cancelled' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-6 w-6 text-teal-600" />
          <h1 className="text-3xl font-bold">Appointments</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Toolbar order mirrors Encounters + Sale > Invoice:
              Refresh → Settings gear → primary action. Gear opens
              the Staff Roles dialog so admins can tag Doctor /
              Cashier / Staff. */}
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Appointment settings">
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Appointment settings — tag Doctor / Cashier / Staff</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {canAdd && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Book Appointment
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="filter-strip">
            <div className="flex items-center gap-1.5">
              {statusFilters.map(f => {
                const active = statusFilter === f.value;
                return (
                  <button
                    key={f.value}
                    onClick={() => setStatusFilter(f.value)}
                    className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                      active
                        ? 'bg-teal-50 border-teal-300 text-teal-800'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-[220px]">
                <SearchablePicker
                  options={[
                    { value: 'all', label: 'All doctors' },
                    // Filter to clinical-role=doctor (V196). If the
                    // admin hasn't tagged anyone yet, only "All
                    // doctors" appears — same signal as an empty
                    // Doctor picker on the form: go tag them via
                    // Settings > Staff Roles.
                    ...doctors.filter(d => d.clinicalRole === 'doctor').map(d => ({
                      value: d.id,
                      label: d.name,
                      secondary: d.position || undefined,
                      searchKey: `${d.name} ${d.position ?? ''}`,
                    })),
                  ]}
                  value={doctorFilter}
                  onChange={v => setDoctorFilter(v)}
                  placeholder="All doctors"
                  searchPlaceholder="Search doctor…"
                  allowClear={false}
                />
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search queue no, encounter, patient, doctor…"
                  className="pl-7 w-[280px]"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70px]">Queue #</TableHead>
                <TableHead className="w-[150px]">Scheduled</TableHead>
                <TableHead className="w-[140px]">Encounter</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead className="w-[130px]">Status</TableHead>
                <TableHead className="text-right w-[260px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-gray-500">
                    Loading appointments…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-gray-500">
                    {search || statusFilter !== 'all' || doctorFilter !== 'all'
                      ? 'No appointments match your filter.'
                      : 'No appointments yet — click Book Appointment to add the first one.'}
                  </TableCell>
                </TableRow>
              ) : (
                pagination.paginatedItems.map(a => {
                  const enc     = encById.get(a.encounterId);
                  const patient = a.patientId ? custById.get(a.patientId) : null;
                  const doctor  = a.doctorId  ? docById.get(a.doctorId)  : null;
                  const busy    = busyId === a.id;
                  const terminal = a.status === 'completed' || a.status === 'cancelled';
                  return (
                    <TableRow key={a.id} className="hover:bg-gray-50">
                      <TableCell className="text-lg font-semibold tabular-nums text-teal-700">
                        #{a.queueNo}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {a.scheduledAt
                          ? formatDateTime(a.scheduledAt)
                          : <span className="text-gray-400">Walk-in</span>}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {enc?.invoiceNo ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{patient?.name ?? '—'}</div>
                        {patient?.phone && (
                          <div className="text-xs text-gray-500">{patient.phone}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {doctor ? (
                          <>
                            <div className="font-medium">{doctor.name}</div>
                            {doctor.position && (
                              <div className="text-xs text-gray-500">{doctor.position}</div>
                            )}
                          </>
                        ) : <span className="text-gray-400">Unassigned</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${statusBadge(a.status)}`}>
                          {a.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {/* Actions vary by current status. Waiting →
                            Start / Cancel. In-progress → Complete /
                            Cancel. Terminal states → Reopen (returns
                            to waiting) so an accidental Complete can
                            be undone. */}
                        <div className="inline-flex gap-1 justify-end">
                          {canEdit && a.status === 'waiting' && (
                            <Button
                              size="sm" variant="ghost" className="h-7 text-blue-700"
                              onClick={() => doTransition(a, 'in_progress')}
                              disabled={busy}
                              title="Start consultation"
                            >
                              <Play className="h-3 w-3 mr-1" /> Start
                            </Button>
                          )}
                          {canEdit && a.status === 'in_progress' && (
                            <Button
                              size="sm" variant="ghost" className="h-7 text-emerald-700"
                              onClick={() => doTransition(a, 'completed')}
                              disabled={busy}
                              title="Complete consultation"
                            >
                              <Check className="h-3 w-3 mr-1" /> Complete
                            </Button>
                          )}
                          {canEdit && !terminal && (
                            <Button
                              size="sm" variant="ghost" className="h-7 text-gray-600"
                              onClick={() => doTransition(a, 'cancelled')}
                              disabled={busy}
                              title="Cancel appointment"
                            >
                              <Ban className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                          )}
                          {canEdit && terminal && (
                            <Button
                              size="sm" variant="ghost" className="h-7"
                              onClick={() => doTransition(a, 'waiting')}
                              disabled={busy}
                              title="Reopen — back to waiting"
                            >
                              <Undo2 className="h-3 w-3 mr-1" /> Reopen
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              size="sm" variant="ghost" className="h-7"
                              onClick={() => setEditing(a)}
                              disabled={busy}
                              title="Edit appointment — doctor fills diagnosis here"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                          {canRemove && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => doDelete(a)}
                              disabled={busy}
                              title="Delete appointment"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          {filtered.length > 0 && (
            <div className="px-1 py-0 border-t">
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

      <BookAppointmentDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        encounters={encounters}
        customers={customers}
        doctors={doctors}
        onCreated={async () => {
          setFormOpen(false);
          await load();
        }}
      />

      <AppointmentSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onChanged={() => { void load(); }}
      />

      {editing && (
        <EditAppointmentDialog
          open={!!editing}
          onOpenChange={(o) => { if (!o) setEditing(null); }}
          appointment={editing}
          encounters={encounters}
          customers={customers}
          doctors={doctors}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

/** Book form — the reception picks a Patient + Doctor and either
 *  a scheduled time or leaves it blank for a walk-in (V194).
 *  Encounter is OPTIONAL as of V195 — an advance appointment can
 *  be booked before the encounter exists. When an encounter IS
 *  picked, the patient / doctor default from it in one click.
 *  Cashier Note is the pre-visit context the doctor sees. */
function BookAppointmentDialog({ open, onOpenChange, encounters, customers, doctors, onCreated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  encounters: invoicesApi.Invoice[];
  customers: customersApi.Customer[];
  doctors: employeesApi.Employee[];
  onCreated: () => Promise<void> | void;
}) {
  const [encounterId, setEncounterId] = useState('');
  const [patientId, setPatientId]     = useState('');
  const [doctorId, setDoctorId]       = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [cashierNote, setCashierNote] = useState('');
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (!open) return;
    setEncounterId('');
    setPatientId('');
    setDoctorId('');
    setScheduledAt('');
    setCashierNote('');
  }, [open]);

  // When the operator picks an encounter, prefill the patient +
  // doctor from that encounter so the common case is one click.
  // Blank encounter → operator picks the patient directly.
  useEffect(() => {
    if (!encounterId) return;
    const enc = encounters.find(e => e.id === encounterId);
    if (enc) {
      setPatientId(enc.customerId);
      if (enc.doctorId) setDoctorId(enc.doctorId);
    }
  }, [encounterId, encounters]);

  const custById = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);

  const encounterOptions = useMemo(
    () => encounters
      .filter(e => e.status !== 'void')
      .map(e => {
        const patient = custById.get(e.customerId);
        return {
          value: e.id,
          label: `${e.invoiceNo}${patient ? ' · ' + patient.name : ''}`,
          secondary: e.issueDate,
          searchKey: `${e.invoiceNo} ${patient?.name ?? ''} ${e.issueDate}`,
        };
      }),
    [encounters, custById],
  );

  const patientOptions = useMemo(
    () => customers.map(c => ({
      value: c.id,
      label: c.name,
      secondary: c.phone ?? undefined,
      searchKey: `${c.name} ${c.phone ?? ''}`,
    })),
    [customers],
  );

  // Doctor options — filtered to clinical-role='doctor' (V196).
  // Empty picker signals the admin hasn't tagged doctors yet →
  // Appointment Settings > Staff Roles is where they do it.
  const doctorOptions = useMemo(
    () => doctors
      .filter(d => d.clinicalRole === 'doctor')
      .map(d => ({
        value: d.id,
        label: d.name,
        secondary: d.position || d.empNo || undefined,
        searchKey: `${d.name} ${d.position ?? ''} ${d.empNo ?? ''} ${d.email ?? ''}`,
      })),
    [doctors],
  );

  const canSave = !!patientId && !saving;

  const save = async () => {
    if (!patientId) { toast.error('Pick a patient first'); return; }
    setSaving(true);
    try {
      await appointmentsApi.create({
        encounterId: encounterId || null,
        patientId,
        doctorId: doctorId || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        cashierNote: cashierNote.trim() || null,
      });
      toast.success('Appointment booked');
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to book appointment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] w-[92vw]">
        <DialogHeader>
          {/* Description text moved to a hover tooltip so the
              header stays compact. Kept sr-only for Radix's a11y
              contract (Dialog requires a description). */}
          <DialogTitle className="flex items-center gap-1.5">
            Book Appointment
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Book Appointment guidance"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Pick a patient + doctor. Encounter is optional; leave the time blank for a walk-in.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Pick a patient + doctor. Encounter is optional; leave the time blank for a walk-in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Patient *</Label>
              <SearchablePicker
                options={patientOptions}
                value={patientId}
                onChange={setPatientId}
                placeholder="Select patient"
                searchPlaceholder="Search patient by name or phone…"
                allowClear={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Encounter (optional)</Label>
              <SearchablePicker
                options={encounterOptions}
                value={encounterId}
                onChange={setEncounterId}
                placeholder="No encounter linked"
                searchPlaceholder="Search by encounter no or patient…"
                emptyLabel="No encounter"
              />
              <p className="text-[10px] text-gray-500 leading-tight">
                Pick an existing medical encounter to auto-fill patient + doctor.
                Leave blank for an advance booking.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Doctor</Label>
              <SearchablePicker
                options={doctorOptions}
                value={doctorId}
                onChange={setDoctorId}
                placeholder="Assign doctor"
                searchPlaceholder="Search doctor…"
                emptyLabel="Unassigned"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appt-time" className="text-xs">Scheduled time (leave blank for walk-in)</Label>
              <Input
                id="appt-time"
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="appt-cashier-note" className="text-xs">Cashier note (visible to doctor)</Label>
            <Textarea
              id="appt-cashier-note"
              value={cashierNote}
              onChange={e => setCashierNote(e.target.value)}
              placeholder="Fever 39°C · 3rd visit this month · pre-existing hypertension"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>
            {saving ? 'Booking…' : 'Book Appointment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Full editor — the doctor's home for an appointment. Same fields as
 *  the Book dialog PLUS the doctor's Diagnosis field. Saving pushes
 *  a PATCH-style update (nulls = leave alone); marking the row
 *  completed via the row's Complete button will sync the diagnosis
 *  to the linked encounter on the backend. */
function EditAppointmentDialog({ open, onOpenChange, appointment, encounters, customers, doctors, onSaved }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  appointment: appointmentsApi.Appointment;
  encounters: invoicesApi.Invoice[];
  customers: customersApi.Customer[];
  doctors: employeesApi.Employee[];
  onSaved: () => Promise<void> | void;
}) {
  // V196 — Diagnosis is the doctor's field. Only admins (tenant
  // owner) and users whose linked employee is tagged as a doctor
  // may edit it; the backend rejects a stale-client attempt too.
  // Reception can still edit the rest of the row (patient / doctor
  // / cashier note / schedule) — only the Diagnosis textarea locks.
  const { currentUser } = useAuth();
  const canEditDiagnosis =
       currentUser?.role === 'admin'
    || currentUser?.role === 'super_admin'
    || currentUser?.clinicalRole === 'doctor';

  const [encounterId, setEncounterId] = useState('');
  const [patientId, setPatientId]     = useState('');
  const [doctorId, setDoctorId]       = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [cashierNote, setCashierNote] = useState('');
  const [diagnosis, setDiagnosis]     = useState('');
  const [saving, setSaving]           = useState(false);

  // V197 — Prescription + Lab Order lines documented by the doctor.
  // Stored as strings while editing so partial inputs like "1." don't
  // fight the parser. Server persists as NUMERIC(14,2) qty.
  const [prescription, setPrescription] = useState<DraftItem[]>([]);
  const [labOrders, setLabOrders]       = useState<DraftItem[]>([]);

  useEffect(() => {
    if (!open) return;
    setEncounterId(appointment.encounterId ?? '');
    setPatientId(appointment.patientId ?? '');
    setDoctorId(appointment.doctorId ?? '');
    // Local datetime string for <input type="datetime-local">.
    setScheduledAt(appointment.scheduledAt
      ? new Date(appointment.scheduledAt).toISOString().slice(0, 16)
      : '');
    setCashierNote(appointment.cashierNote ?? '');
    setDiagnosis(appointment.diagnosis ?? '');
    // Split existing items by category. Untagged rows drop into the
    // Prescription bucket as a safe default; the doctor can re-file.
    const meds: DraftItem[] = [];
    const labs: DraftItem[] = [];
    let seq = 0;
    const draftId = () => `row-${Date.now().toString(36)}-${(++seq).toString(36)}`;
    for (const it of appointment.items ?? []) {
      const row: DraftItem = {
        rowId: draftId(),
        name: it.name,
        description: it.description ?? '',
        quantity: String(it.quantity ?? 1),
      };
      if (it.category === 'lab') labs.push(row); else meds.push(row);
    }
    setPrescription(meds);
    setLabOrders(labs);
  }, [open, appointment]);

  /** Client-only row-id for the React key. */
  const rowIdSeqRef = React.useRef(0);
  const newDraftId = () => `row-${Date.now().toString(36)}-${(++rowIdSeqRef.current).toString(36)}`;
  const addRow = (setter: React.Dispatch<React.SetStateAction<DraftItem[]>>) => {
    setter(rows => [...rows, { rowId: newDraftId(), name: '', description: '', quantity: '1' }]);
  };
  const removeRow = (setter: React.Dispatch<React.SetStateAction<DraftItem[]>>, rowId: string) => {
    setter(rows => rows.filter(r => r.rowId !== rowId));
  };
  const updateRow = (
    setter: React.Dispatch<React.SetStateAction<DraftItem[]>>,
    rowId: string,
    patch: Partial<DraftItem>,
  ) => {
    setter(rows => rows.map(r => r.rowId === rowId ? { ...r, ...patch } : r));
  };

  const custById = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);

  const encounterOptions = useMemo(
    () => encounters
      .filter(e => e.status !== 'void')
      .map(e => {
        const patient = custById.get(e.customerId);
        return {
          value: e.id,
          label: `${e.invoiceNo}${patient ? ' · ' + patient.name : ''}`,
          secondary: e.issueDate,
          searchKey: `${e.invoiceNo} ${patient?.name ?? ''} ${e.issueDate}`,
        };
      }),
    [encounters, custById],
  );

  const patientOptions = useMemo(
    () => customers.map(c => ({
      value: c.id, label: c.name, secondary: c.phone ?? undefined,
      searchKey: `${c.name} ${c.phone ?? ''}`,
    })),
    [customers],
  );

  const doctorOptions = useMemo(
    () => doctors
      .filter(d => d.clinicalRole === 'doctor')
      .map(d => ({
        value: d.id, label: d.name,
        secondary: d.position || d.empNo || undefined,
        searchKey: `${d.name} ${d.position ?? ''} ${d.empNo ?? ''} ${d.email ?? ''}`,
      })),
    [doctors],
  );

  const save = async () => {
    setSaving(true);
    try {
      // Flatten both Prescription + Lab Orders into the single
      // items[] payload. Drop rows the doctor left with no name
      // (typing scratchpad). Only send items when the caller is
      // allowed to write clinical data — reception editing the
      // schedule mustn't accidentally replace the doctor's list.
      const items: appointmentsApi.AppointmentItemRequest[] = [];
      const collect = (rows: DraftItem[], cat: appointmentsApi.AppointmentItemCategory) => {
        for (const r of rows) {
          if (!r.name.trim()) continue;
          items.push({
            category: cat,
            name: r.name.trim(),
            description: r.description.trim() || null,
            quantity: parseFloat(r.quantity) || 0,
          });
        }
      };
      if (canEditDiagnosis) {
        collect(prescription, 'medicine');
        collect(labOrders, 'lab');
      }

      await appointmentsApi.update(appointment.id, {
        encounterId: encounterId || null,
        patientId: patientId || null,
        doctorId: doctorId || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        cashierNote: cashierNote,   // empty string → server nulls
        // Only send diagnosis when the caller is allowed to write it.
        // A read-only caller submitting the form (e.g. reception
        // editing the schedule) would otherwise trip the backend
        // ForbiddenException guard. Omitting the field means "leave
        // alone" server-side.
        ...(canEditDiagnosis ? { diagnosis, items } : {}),
      });
      toast.success('Appointment updated');
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update appointment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] w-[92vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          {/* Description moved to a hover tooltip so the header
              stays compact. sr-only description kept for Radix's
              a11y contract. Copy also refreshed for the
              sync-on-any-update behaviour introduced in
              v-appointment-diagnosis-guard-sync. */}
          <DialogTitle className="flex items-center gap-1.5">
            Edit Appointment #{appointment.queueNo}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Edit Appointment guidance"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Reception edits patient / encounter / cashier note.
                  Doctor fills the Diagnosis — it syncs to the encounter
                  as soon as you save (and again on Complete).
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Reception edits patient / encounter / cashier note.
            Doctor fills the Diagnosis — it syncs to the encounter
            as soon as you save.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Patient</Label>
              <SearchablePicker
                options={patientOptions}
                value={patientId}
                onChange={setPatientId}
                placeholder="Select patient"
                searchPlaceholder="Search patient…"
                emptyLabel="No patient"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Encounter (optional)</Label>
              <SearchablePicker
                options={encounterOptions}
                value={encounterId}
                onChange={setEncounterId}
                placeholder="No encounter linked"
                searchPlaceholder="Search encounter…"
                emptyLabel="No encounter"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Doctor</Label>
              <SearchablePicker
                options={doctorOptions}
                value={doctorId}
                onChange={setDoctorId}
                placeholder="Assign doctor"
                searchPlaceholder="Search doctor…"
                emptyLabel="Unassigned"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-time" className="text-xs">Scheduled time</Label>
              <Input
                id="edit-time"
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-cashier-note" className="text-xs">Cashier note (from reception to doctor)</Label>
            <Textarea
              id="edit-cashier-note"
              value={cashierNote}
              onChange={e => setCashierNote(e.target.value)}
              placeholder="Pre-visit context, symptoms reported at reception, allergies…"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-diagnosis" className="text-xs text-teal-700 font-medium flex items-center gap-1.5">
              Diagnosis (doctor)
              {!canEditDiagnosis && (
                <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 border rounded px-1.5 py-0.5 font-normal">
                  Doctor / Admin only
                </span>
              )}
            </Label>
            <Textarea
              id="edit-diagnosis"
              value={diagnosis}
              onChange={e => setDiagnosis(e.target.value)}
              placeholder={canEditDiagnosis
                ? "Doctor's assessment. Syncs to the linked encounter as soon as you save."
                : "Only the assigned doctor or an admin can edit this field."}
              rows={4}
              readOnly={!canEditDiagnosis}
              disabled={!canEditDiagnosis}
              className={`border-teal-200 focus-visible:ring-teal-300 ${
                !canEditDiagnosis ? 'bg-gray-50 cursor-not-allowed' : ''
              }`}
            />
          </div>

          {/* V197 — Prescription + Lab Orders sections. Item / Note
              / Qty only — no unit price, no line total (appointment
              is clinical, not billing). Autofilled from these lines
              onto the Encounter when the cashier picks Existing
              Appointment on the New Encounter form. Same doctor /
              admin gate as the Diagnosis field above. */}
          <ClinicalSectionCard
            title="Prescription"
            placeholder="Medicine name"
            rows={prescription}
            onAdd={() => addRow(setPrescription)}
            onRemove={id => removeRow(setPrescription, id)}
            onUpdate={(id, patch) => updateRow(setPrescription, id, patch)}
            canEdit={canEditDiagnosis}
          />
          <ClinicalSectionCard
            title="Lab Orders"
            placeholder="Lab test"
            rows={labOrders}
            onAdd={() => addRow(setLabOrders)}
            onRemove={id => removeRow(setLabOrders, id)}
            onUpdate={(id, patch) => updateRow(setLabOrders, id, patch)}
            canEdit={canEditDiagnosis}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** V197 — appointment-side clinical line editor. Same visual
 *  language as the EncounterFormDialog sections but with a
 *  narrower column set: Item / Note / Qty ONLY. No unit price
 *  and no line total — the appointment doesn't set fees, only
 *  the encounter does. Read-only when {@code canEdit} is false
 *  (reception opening the dialog). */
interface DraftItem { rowId: string; name: string; description: string; quantity: string; }

function ClinicalSectionCard({ title, placeholder, rows, onAdd, onRemove, onUpdate, canEdit }: {
  title: string;
  placeholder: string;
  rows: DraftItem[];
  onAdd: () => void;
  onRemove: (rowId: string) => void;
  onUpdate: (rowId: string, patch: Partial<DraftItem>) => void;
  canEdit: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            {title}
            {!canEdit && (
              <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 border rounded px-1.5 py-0.5 font-normal">
                Doctor / Admin only
              </span>
            )}
          </Label>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={onAdd}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="py-3 text-xs text-gray-500">No lines yet.</div>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-[minmax(0,1fr)_180px_90px_36px] gap-2 text-xs text-gray-500 px-1">
              <div>Item</div>
              <div>Note</div>
              <div className="text-right">Qty</div>
              <div />
            </div>
            {rows.map(r => (
              <div
                key={r.rowId}
                className="grid grid-cols-[minmax(0,1fr)_180px_90px_36px] gap-2 items-center"
              >
                <Input
                  value={r.name}
                  placeholder={placeholder}
                  onChange={e => onUpdate(r.rowId, { name: e.target.value })}
                  disabled={!canEdit}
                />
                <Input
                  value={r.description}
                  placeholder="Note"
                  onChange={e => onUpdate(r.rowId, { description: e.target.value })}
                  disabled={!canEdit}
                />
                <Input
                  type="number" step="0.01" min="0"
                  className="text-right tabular-nums"
                  value={r.quantity}
                  onChange={e => onUpdate(r.rowId, { quantity: e.target.value })}
                  disabled={!canEdit}
                />
                {canEdit ? (
                  <Button
                    size="sm" variant="ghost"
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => onRemove(r.rowId)}
                    title="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <div />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
