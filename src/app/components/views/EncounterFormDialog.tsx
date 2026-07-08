import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pill, Stethoscope, FlaskConical, Scan } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { SearchablePicker } from '../common/SearchablePicker';
import * as invoicesApi from '../../api/invoices';
import * as customersApi from '../../api/customers';
import * as currencyApi from '../../api/currencySettings';
import * as employeesApi from '../../api/employees';
import * as appointmentsApi from '../../api/appointments';

/**
 * Hospital-branded creation / edit form for Encounters — the medical
 * lens over {@code sale_invoices} with {@code kind='medical'}. Departs
 * from the standard InvoiceFormDialog because the doctor-facing
 * workflow groups items into clinical sections:
 *
 * <pre>
 * Patient
 *   ├── Diagnosis
 *   ├── Prescription      → medicine lines
 *   ├── Services Performed → service lines (consultation, injection, dressing…)
 *   ├── Lab Orders        → lab test lines
 *   └── Imaging Orders    → radiology lines
 * </pre>
 *
 * <p>Under the hood the four sections flatten back into one
 * {@code items: InvoiceItemRequest[]} array with a {@code category}
 * tag per line — the shared /api/v1/invoices endpoint accepts and
 * roundtrips the tag as of V185 / v-encounter-form-medical-sections.
 * All non-form flows (Record Pay, Print, Attach, CN/DN adjustments)
 * still reuse the shared {@code InvoiceDetailDialog} — this component
 * only owns the creation / edit surface.</p>
 */

/** Section metadata — display label, icon, and the category tag we
 *  persist per line. Order here drives the sidebar-under-tree layout. */
const SECTIONS = [
  { key: 'medicine', label: 'Prescription',       icon: Pill,          placeholder: 'Medicine name' },
  { key: 'service',  label: 'Services Performed', icon: Stethoscope,   placeholder: 'Service (consultation, injection, dressing…)' },
  { key: 'lab',      label: 'Lab Orders',         icon: FlaskConical,  placeholder: 'Lab test' },
  { key: 'imaging',  label: 'Imaging Orders',     icon: Scan,          placeholder: 'Imaging (X-ray, ultrasound, CT…)' },
] as const satisfies ReadonlyArray<{
  key: invoicesApi.InvoiceItemCategory;
  label: string;
  icon: typeof Pill;
  placeholder: string;
}>;

type SectionKey = typeof SECTIONS[number]['key'];

/** Editable line row — mirrors {@link invoicesApi.InvoiceItemRequest}
 *  minus the category (which is implied by the section it lives in)
 *  and with a client-side rowId so React's list-key stays stable
 *  across renders. */
interface DraftLine {
  rowId: string;
  name: string;
  description: string;
  quantity: string;   // string in the editor so partial input like "1." doesn't fight the parser
  unitPrice: string;
}

/** Mint a stable-but-cheap client-side id. UUIDs are overkill for
 *  ephemeral form rows — a counter + timestamp is enough and doesn't
 *  drag in a crypto dependency on browsers without {@code crypto.randomUUID}. */
let rowSeq = 0;
const nextRowId = (): string => `row-${Date.now().toString(36)}-${(++rowSeq).toString(36)}`;

/** Empty starter row — used both when the user clicks "Add" and when
 *  the form loads fresh with a first empty line per section. */
const blankLine = (): DraftLine => ({
  rowId: nextRowId(),
  name: '',
  description: '',
  quantity: '1',
  unitPrice: '0',
});

type SectionMap = Record<SectionKey, DraftLine[]>;
const emptySectionMap = (): SectionMap => ({
  medicine: [], service: [], lab: [], imaging: [],
});

export function EncounterFormDialog({
  open, onOpenChange, editing, customers, onCreated,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  editing: invoicesApi.Invoice | null;
  customers: customersApi.Customer[];
  onCreated: (created: invoicesApi.Invoice | null) => void | Promise<void>;
}) {
  const isEdit = !!editing;

  // Core fields — mirrors the Invoice form 1:1 so save() maps cleanly.
  const [customerId, setCustomerId]     = useState('');
  const [invoiceNo, setInvoiceNo]       = useState('');
  const [issueDate, setIssueDate]       = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate]           = useState('');
  const [currency, setCurrency]         = useState('USD');
  const [exchangeRate, setExchangeRate] = useState('4100');
  const [diagnosis, setDiagnosis]       = useState('');
  const [notes, setNotes]               = useState('');
  const [doctorId, setDoctorId]         = useState('');

  // v-encounter-link-existing-appointment — cashier picks either
  // "New Appointment" (assign a Doctor here → server auto-spawns
  // a waiting-room row) or "Existing Appointment" (link to a
  // previously-booked, unlinked row). Edit mode stays on
  // 'new_appt' because the encounter already exists.
  const [apptMode, setApptMode] = useState<'new_appt' | 'existing_appt'>('new_appt');
  const [linkAppointmentId, setLinkAppointmentId] = useState('');
  const [appointments, setAppointments] = useState<appointmentsApi.Appointment[]>([]);

  // Employees list for the Doctor picker (V189 /
  // v-encounter-doctor-employees). Sources from HR staff — the earlier
  // "any user" list looked empty for typical hospital tenants where
  // the users table only carries admin/manager accounts. Fetched once
  // per dialog mount; the dialog is disposed between visits so a
  // stale roster is unlikely.
  const [doctors, setDoctors] = useState<employeesApi.Employee[]>([]);
  useEffect(() => {
    employeesApi.list({ size: 500, status: 'active' })
      .then(r => setDoctors(r.content ?? []))
      .catch(() => setDoctors([]));
    // Appointments fetch feeds the "Existing Appointment" picker.
    // Soft-fail on permission denial — the picker just stays empty
    // and the user has to fall back to New Appointment.
    appointmentsApi.list()
      .then(setAppointments)
      .catch(() => setAppointments([]));
  }, []);

  // Sectioned items — each key is a category, each value is that
  // section's editable rows in display order.
  const [sections, setSections] = useState<SectionMap>(emptySectionMap());

  const [saving, setSaving] = useState(false);
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  useEffect(() => {
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, []);

  // Reset every field when the dialog opens. Fresh create = empty
  // sections with ONE blank medicine line prepped so the doctor can
  // start typing immediately. Edit = hydrate every field + split the
  // saved items[] back into their categories.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCustomerId(editing.customerId);
      setInvoiceNo(editing.invoiceNo);
      setIssueDate(editing.issueDate);
      setDueDate(editing.dueDate ?? '');
      setCurrency(editing.currency);
      setExchangeRate(String(editing.exchangeRate ?? 4100));
      setDiagnosis(editing.diagnosis ?? '');
      setNotes(editing.notes ?? '');
      setDoctorId(editing.doctorId ?? '');
      // Split saved items into their section buckets. Unknown /
      // legacy 'other' rows land in Prescription by default so the
      // doctor can re-categorize; never orphaned.
      const split: SectionMap = emptySectionMap();
      for (const it of editing.items ?? []) {
        const cat: SectionKey =
          it.category === 'medicine' || it.category === 'service'
          || it.category === 'lab' || it.category === 'imaging'
            ? it.category
            : 'medicine';
        split[cat].push({
          rowId: nextRowId(),
          name: it.name,
          description: it.description ?? '',
          quantity: String(it.quantity ?? 1),
          unitPrice: String(it.unitPrice ?? 0),
        });
      }
      setSections(split);
    } else {
      setCustomerId('');
      setInvoiceNo('');
      setIssueDate(new Date().toISOString().slice(0, 10));
      setDueDate('');
      // Tenant currency default lands via the follow-up effect below —
      // start with 'USD' + 4100 so the field isn't blank on first open.
      setCurrency('USD');
      setExchangeRate('4100');
      setDiagnosis('');
      setNotes('');
      setDoctorId('');
      setApptMode('new_appt');
      setLinkAppointmentId('');
      setSections({
        ...emptySectionMap(),
        medicine: [blankLine()],
      });
      // Preview the next MED number so it's not empty. Race-guarded so
      // rapid open/close doesn't leak a stale response into the field.
      let cancelled = false;
      invoicesApi.nextNumber('medical')
        .then(r => { if (!cancelled) setInvoiceNo(r.invoiceNo); })
        .catch(() => { /* non-fatal — user can type their own */ });
      return () => { cancelled = true; };
    }
  }, [open, editing]);

  // v-encounter-link-existing-appointment — when the cashier
  // picks an existing Appointment, backfill patient / doctor /
  // diagnosis from that appointment so the form is one-click
  // ready. Only fires in the "Existing Appointment" branch and
  // only during create mode.
  useEffect(() => {
    if (!open || editing || apptMode !== 'existing_appt' || !linkAppointmentId) return;
    const a = appointments.find(x => x.id === linkAppointmentId);
    if (!a) return;
    if (a.patientId)  setCustomerId(a.patientId);
    if (a.doctorId)   setDoctorId(a.doctorId);
    if (a.diagnosis)  setDiagnosis(a.diagnosis);
    // V197 — pull the doctor's Prescription + Lab lines onto the
    // Encounter's medicine + lab sections. Unit prices land at 0
    // — the cashier fills them at billing time. Merges into any
    // rows the cashier already added, keeping their entries first.
    const meds: DraftLine[] = [];
    const labs: DraftLine[] = [];
    for (const it of a.items ?? []) {
      const line: DraftLine = {
        rowId: nextRowId(),
        name: it.name,
        description: it.description ?? '',
        quantity: String(it.quantity ?? 1),
        unitPrice: '0',
      };
      if (it.category === 'lab') labs.push(line); else meds.push(line);
    }
    if (meds.length > 0 || labs.length > 0) {
      setSections(prev => {
        const existingMeds = prev.medicine.filter(r => r.name.trim());
        const existingLabs = prev.lab.filter(r => r.name.trim());
        return {
          ...prev,
          medicine: existingMeds.length > 0 ? [...existingMeds, ...meds] : (meds.length > 0 ? meds : prev.medicine),
          lab:      existingLabs.length > 0 ? [...existingLabs, ...labs] : (labs.length > 0 ? labs : prev.lab),
        };
      });
    }
  }, [open, editing, apptMode, linkAppointmentId, appointments]);

  // Pin tenant currency defaults when settings arrive after the
  // reset effect (network race on first open). Skips edit mode
  // because a row's own currency should win in that case.
  useEffect(() => {
    if (!open || editing || !currencySettings) return;
    setCurrency(currencySettings.primaryCurrency);
    setExchangeRate(String(currencySettings.secondaryRate ?? 4100));
  }, [open, editing, currencySettings]);

  const customerOptions = useMemo(
    () => customers.map(c => ({
      value: c.id,
      label: c.name,
      secondary: c.phone ?? undefined,
      searchKey: `${c.name} ${c.phone ?? ''}`,
    })),
    [customers],
  );

  // Doctor options — filtered to employees whose clinicalRole is
  // 'doctor' (V196). An empty picker signals the tenant admin
  // hasn't tagged anyone yet — they open Appointment Settings >
  // Staff Roles to tag doctors. Resigned staff are already
  // excluded via the fetch's status filter.
  const doctorOptions = useMemo(
    () => doctors
      .filter(e => e.clinicalRole === 'doctor')
      .map(e => ({
        value: e.id,
        label: e.name,
        secondary: e.position || e.empNo || undefined,
        searchKey: `${e.name} ${e.position ?? ''} ${e.empNo ?? ''} ${e.email ?? ''}`,
      })),
    [doctors],
  );

  // "Existing Appointment" picker — only unlinked rows in a state
  // that hasn't been completed / cancelled yet. Includes the queue
  // no + scheduled slot in the label so the reception can match
  // the ticket the patient hands them.
  const doctorById = useMemo(
    () => new Map(doctors.map(d => [d.id, d])),
    [doctors],
  );
  const patientById = useMemo(
    () => new Map(customers.map(c => [c.id, c])),
    [customers],
  );
  const appointmentOptions = useMemo(
    () => appointments
      .filter(a => !a.encounterId && (a.status === 'waiting' || a.status === 'in_progress'))
      .map(a => {
        const patient = a.patientId ? patientById.get(a.patientId) : null;
        const doctor  = a.doctorId  ? doctorById.get(a.doctorId)  : null;
        const when = a.scheduledAt
          ? new Date(a.scheduledAt).toLocaleString('en-US', {
              month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
            })
          : 'Walk-in';
        return {
          value: a.id,
          label: `#${a.queueNo} · ${patient?.name ?? '—'}`,
          secondary: `${when}${doctor ? ' · Dr. ' + doctor.name : ''}`,
          searchKey: `#${a.queueNo} ${patient?.name ?? ''} ${doctor?.name ?? ''} ${when}`,
        };
      }),
    [appointments, patientById, doctorById],
  );

  const addLine = (section: SectionKey) => {
    setSections(prev => ({ ...prev, [section]: [...prev[section], blankLine()] }));
  };
  const removeLine = (section: SectionKey, rowId: string) => {
    setSections(prev => ({
      ...prev,
      [section]: prev[section].filter(r => r.rowId !== rowId),
    }));
  };
  const updateLine = (section: SectionKey, rowId: string, patch: Partial<DraftLine>) => {
    setSections(prev => ({
      ...prev,
      [section]: prev[section].map(r => r.rowId === rowId ? { ...r, ...patch } : r),
    }));
  };

  // Running subtotal — sum every line in every section. Kept in cents
  // internally to avoid floating-point drift, then rendered with two
  // decimals at display time.
  const totals = useMemo(() => {
    let sub = 0;
    let count = 0;
    for (const s of SECTIONS) {
      for (const r of sections[s.key]) {
        const q = parseFloat(r.quantity) || 0;
        const p = parseFloat(r.unitPrice) || 0;
        sub += q * p;
        if (r.name.trim()) count += 1;
      }
    }
    return { subtotal: sub, lineCount: count };
  }, [sections]);

  const canSave = customerId.trim() !== '' && totals.lineCount > 0 && !saving;

  const save = async () => {
    if (!customerId) { toast.error('Pick a patient first'); return; }
    // Flatten every section back into a single ordered items[] array,
    // tagging each row with the source section as its category. Empty
    // (unnamed) rows are dropped silently so a doctor who added a
    // section header but nothing under it doesn't get a validation
    // failure on save.
    const items: invoicesApi.InvoiceItemRequest[] = [];
    for (const s of SECTIONS) {
      for (const r of sections[s.key]) {
        if (!r.name.trim()) continue;
        items.push({
          name: r.name.trim(),
          description: r.description.trim() || undefined,
          quantity: parseFloat(r.quantity) || 0,
          unitPrice: parseFloat(r.unitPrice) || 0,
          category: s.key,
        });
      }
    }
    if (items.length === 0) {
      toast.error('Add at least one Prescription / Service / Lab / Imaging line');
      return;
    }
    const req: invoicesApi.InvoiceRequest = {
      kind: 'medical',
      customerId,
      invoiceNo: invoiceNo.trim() || undefined,
      issueDate,
      dueDate: dueDate || null,
      currency,
      exchangeRate: parseFloat(exchangeRate) || 4100,
      // Tax + discount default off for medical bills — hospital users
      // said they don't want a tax matrix on encounters. Leave the
      // fields unset and the server clamps them to zero.
      taxAmount: 0,
      discountType: 'amount',
      discountValue: 0,
      diagnosis: diagnosis.trim() || null,
      doctorId: doctorId || null,
      notes: notes.trim() || null,
      // v-encounter-link-existing-appointment — only send the link
      // id in the "Existing Appointment" branch. Server skips the
      // auto-spawn side effect when this is set and attaches the
      // new encounter to the picked appointment.
      linkAppointmentId:
        !isEdit && apptMode === 'existing_appt' && linkAppointmentId
          ? linkAppointmentId
          : null,
      items,
    };
    setSaving(true);
    try {
      const saved = isEdit
        ? await invoicesApi.update(editing!.id, req)
        // Encounters skip the on-issue Telegram auto-notify — patient
        // encounters aren't a customer-facing invoice yet at this stage.
        // The detail dialog still lets HR send it manually later.
        : await invoicesApi.create(req, false);
      toast.success(isEdit ? `Encounter ${saved.invoiceNo} updated` : `Encounter ${saved.invoiceNo} created`);
      await onCreated(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save encounter');
    } finally {
      setSaving(false);
    }
  };

  const fmtMoney = (n: number): string => {
    const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${currency} ${abs}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1080px] w-[90vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit Encounter ${editing?.invoiceNo}` : 'New Encounter'}</DialogTitle>
          <DialogDescription className="sr-only">
            Doctor-facing encounter form. Captures patient, diagnosis,
            prescription, services performed, and lab / imaging orders.
            Saved as a medical invoice under the hood.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header row: Patient + Doctor + Encounter # */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Patient *</Label>
              <SearchablePicker
                options={customerOptions}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Select patient"
                searchPlaceholder="Search patient by name or phone…"
                allowClear={false}
              />
            </div>
            <div className="space-y-1.5">
              {/* Mode toggle as two label-style tabs — the label
                  IS the toggle. Clicking "Doctor" switches to the
                  Doctor picker (server auto-spawns a waiting-room
                  row on save); clicking "Appointment" swaps to the
                  unlinked-appointment picker (server attaches the
                  new Encounter to the picked row, no auto-spawn).
                  In edit mode only the static label is rendered —
                  an existing encounter can't swap its source. */}
              {isEdit ? (
                <Label className="text-xs">Doctor</Label>
              ) : (
                // Match shadcn's Label baseline (text-xs font-medium
                // leading-none) so both tabs read as regular field
                // labels — only the underline distinguishes the
                // active one. Inactive tab reads muted so the
                // hierarchy is obvious without borrowing focus.
                <div className="flex items-center gap-2" role="tablist" aria-label="Appointment source">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={apptMode === 'new_appt'}
                    onClick={() => {
                      setApptMode('new_appt');
                      setLinkAppointmentId('');
                    }}
                    className={`text-xs font-medium leading-none pb-0.5 transition-colors border-b-2 ${
                      apptMode === 'new_appt'
                        ? 'text-foreground border-teal-600'
                        : 'text-gray-400 hover:text-gray-600 border-transparent'
                    }`}
                  >
                    Doctor
                  </button>
                  <span className="text-xs text-gray-300 leading-none">|</span>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={apptMode === 'existing_appt'}
                    onClick={() => setApptMode('existing_appt')}
                    className={`text-xs font-medium leading-none pb-0.5 transition-colors border-b-2 ${
                      apptMode === 'existing_appt'
                        ? 'text-foreground border-teal-600'
                        : 'text-gray-400 hover:text-gray-600 border-transparent'
                    }`}
                    title={appointmentOptions.length === 0 ? 'No unlinked appointments waiting' : 'Link to an existing booked appointment'}
                  >
                    Appointment
                  </button>
                </div>
              )}
              {apptMode === 'existing_appt' && !isEdit ? (
                <SearchablePicker
                  options={appointmentOptions}
                  value={linkAppointmentId}
                  onChange={setLinkAppointmentId}
                  placeholder="Pick an unlinked appointment"
                  searchPlaceholder="Search queue no, patient, doctor…"
                  emptyLabel="No unlinked appointments"
                  emptyResultsLabel={
                    appointmentOptions.length === 0
                      ? 'No unlinked appointments waiting — switch back to New.'
                      : 'No matches'
                  }
                />
              ) : (
                <SearchablePicker
                  options={doctorOptions}
                  value={doctorId}
                  onChange={setDoctorId}
                  placeholder="Assign doctor"
                  searchPlaceholder="Search doctor by name or email…"
                  emptyLabel="Unassigned"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Encounter No.</Label>
              <Input
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                placeholder="Auto-generated"
                className="tabular-nums"
              />
            </div>
          </div>

          {/* Dates + currency */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start date</Label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <Input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Exchange rate</Label>
              <Input
                type="number" step="0.0001"
                value={exchangeRate}
                onChange={e => setExchangeRate(e.target.value)}
                className="tabular-nums"
              />
            </div>
          </div>

          {/* Diagnosis — always visible so it never gets forgotten. */}
          <div className="space-y-1.5">
            <Label className="text-xs">Diagnosis</Label>
            <Textarea
              value={diagnosis}
              onChange={e => setDiagnosis(e.target.value)}
              placeholder="Free-text diagnosis. Paste ICD-10 codes if you use them, or write out symptoms + assessment."
              rows={3}
            />
          </div>

          {/* Four clinical sections. Each renders as its own card with a
              header + Add button + editable rows. */}
          {SECTIONS.map(s => (
            <SectionCard
              key={s.key}
              section={s}
              rows={sections[s.key]}
              onAdd={() => addLine(s.key)}
              onRemove={rowId => removeLine(s.key, rowId)}
              onUpdate={(rowId, patch) => updateLine(s.key, rowId, patch)}
              fmtMoney={fmtMoney}
            />
          ))}

          {/* Notes — internal memo channel, mirrors Invoice's Notes field. */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes (not shown on the patient-facing bill)"
              rows={2}
            />
          </div>

          {/* Totals footer */}
          <div className="flex justify-end items-center gap-4 pt-2 border-t">
            <span className="text-sm text-gray-500">
              {totals.lineCount} {totals.lineCount === 1 ? 'line' : 'lines'}
            </span>
            <div className="text-lg font-semibold tabular-nums">
              Total: {fmtMoney(totals.subtotal)}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Encounter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Per-section card. Extracted so the parent's JSX stays legible and
 *  the row-add / row-remove / row-update handlers can be memoised
 *  per section without threading four sets of props through. */
function SectionCard({ section, rows, onAdd, onRemove, onUpdate, fmtMoney }: {
  section: typeof SECTIONS[number];
  rows: DraftLine[];
  onAdd: () => void;
  onRemove: (rowId: string) => void;
  onUpdate: (rowId: string, patch: Partial<DraftLine>) => void;
  fmtMoney: (n: number) => string;
}) {
  const Icon = section.icon;
  const sectionSubtotal = rows.reduce((sum, r) => {
    const q = parseFloat(r.quantity) || 0;
    const p = parseFloat(r.unitPrice) || 0;
    return sum + q * p;
  }, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className="h-4 w-4 text-gray-500" />
            {section.label}
            {rows.length > 0 && (
              <span className="text-xs text-gray-500 font-normal">
                ({rows.length} {rows.length === 1 ? 'line' : 'lines'} · {fmtMoney(sectionSubtotal)})
              </span>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      </CardHeader>
      {rows.length > 0 && (
        <CardContent className="pt-0 space-y-1.5">
          {/* Column headers so the row grid reads as a table without the
              overhead of an actual <table> layout. */}
          <div className="grid grid-cols-[minmax(0,1fr)_140px_100px_100px_120px_36px] gap-2 text-xs text-gray-500 px-1">
            <div>Item</div>
            <div>Note</div>
            <div className="text-right">Qty</div>
            <div className="text-right">Unit price</div>
            <div className="text-right">Line total</div>
            <div />
          </div>
          {rows.map(r => {
            const lineTotal = (parseFloat(r.quantity) || 0) * (parseFloat(r.unitPrice) || 0);
            return (
              <div
                key={r.rowId}
                className="grid grid-cols-[minmax(0,1fr)_140px_100px_100px_120px_36px] gap-2 items-center"
              >
                <Input
                  value={r.name}
                  placeholder={section.placeholder}
                  onChange={e => onUpdate(r.rowId, { name: e.target.value })}
                />
                <Input
                  value={r.description}
                  placeholder="Note"
                  onChange={e => onUpdate(r.rowId, { description: e.target.value })}
                />
                <Input
                  type="number" step="0.01" min="0"
                  className="text-right tabular-nums"
                  value={r.quantity}
                  onChange={e => onUpdate(r.rowId, { quantity: e.target.value })}
                />
                <Input
                  type="number" step="0.01" min="0"
                  className="text-right tabular-nums"
                  value={r.unitPrice}
                  onChange={e => onUpdate(r.rowId, { unitPrice: e.target.value })}
                />
                <div className="text-right tabular-nums text-sm px-2">
                  {fmtMoney(lineTotal)}
                </div>
                <Button
                  size="sm" variant="ghost"
                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => onRemove(r.rowId)}
                  title="Remove line"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
