import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { DateInput } from '../common/DateInput';
import * as customersApi from '../../api/customers';
import * as telegramApi from '../../api/telegram';
import * as invoicesApi from '../../api/invoices';
import { Plus, Pencil, Trash2, Search, User, Building2, RefreshCw, Send, Copy, Check, Link2Off, CheckCircle2, Settings, Upload, Download, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { BulkUploadCustomersDialog } from '../common/BulkUploadCustomersDialog';
import { exportListToExcel } from '../../utils/excelExport';
import { CustomerTelegramBotSettingsDialog } from '../common/CustomerTelegramBotSettingsDialog';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const TYPE_FILTERS: ReadonlyArray<{ value: 'all' | customersApi.CustomerType; label: string }> = [
  { value: 'all',         label: 'All' },
  { value: 'individual',  label: 'Individuals' },
  { value: 'business',    label: 'Businesses' },
];

const emptyForm: customersApi.CustomerRequest = {
  type: 'individual',
  name: '',
  phone: '',
  address: '',
  cid: '',
  email: '',
  tin: '',
  representative: '',
  site: '',
  // Default new business rows to "taxable" since that's the historic
  // default — older V79 rows backfilled to taxable in V109. The
  // operator can pick another sub-type before saving.
  businessType: undefined,
  birthDate: null,
  sex: null,
  insurance: '',
  heightCm: null,
  weightKg: null,
  studentNo: '',
  guardianName: '',
  guardianPhone: '',
  guardianEmail: '',
};

/** Compute integer years between a birth date (YYYY-MM-DD) and today.
 *  Returns null when the date is missing / unparseable — the caller
 *  renders "—" in that case. Handles the "birthday not yet this year"
 *  edge so someone born in December this year doesn't show as 1yo in
 *  January. */
function ageInYears(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const parts = birthDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  const dayDiff = today.getDate() - d;
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age >= 0 && age < 200 ? age : null;
}

/** Display labels for the Business sub-type dropdown. */
const BUSINESS_TYPE_OPTIONS: ReadonlyArray<{ value: customersApi.BusinessSubType; label: string; hint: string }> = [
  { value: 'taxable',     label: 'Taxable',     hint: 'Registered for VAT — TIN required' },
  { value: 'non_taxable', label: 'Non-taxable', hint: 'Local business outside the VAT net — no TIN' },
  { value: 'oversee',     label: 'Oversee',     hint: 'Overseas / cross-border customer — no TIN' },
];

/**
 * Accountant → Customers. Two shapes:
 *   - Individual: name, phone, address
 *   - Business:   company name, TIN, representative, phone, address, site
 *
 * Backend enforces type-specific required fields (Business needs TIN +
 * representative); the form mirrors that with conditional inputs and
 * the same client-side validation, so the user sees the message before
 * the round-trip.
 *
 * <p>When mounted with {@code presentAs="patient"}, top-level labels
 * swap to Hospital terminology (Patients page under Healthcare group).
 * The underlying data lives in the same {@code customers} table —
 * Patient/Student/Customer are all Customer rows per
 * [[erp-core-engine-vision]]. Deep-in-form labels (Individual vs
 * Business, TIN, representative) stay unchanged since those are
 * cross-vertical accounting concepts.</p>
 */
export function Customers({ presentAs = 'customer' }: { presentAs?: 'customer' | 'patient' | 'student' } = {}) {
  const isPatient = presentAs === 'patient';
  const isStudent = presentAs === 'student';
  // Terms — only top-level, user-visible strings. Deep form labels
  // (TIN, representative, business type, address) stay as-is.
  const T = isStudent ? {
    pageTitle:     'Students',
    addButton:     'Add Student',
    newDialog:     'New student',
    bulkTooltip:   'Bulk upload students from an Excel workbook',
    editTooltip:   'Edit student',
    deleteTooltip: 'Delete student',
    toastCreated:  'Student created',
    toastUpdated:  'Student updated',
    toastSaveFail: 'Failed to save student',
    toastLoadFail: 'Failed to load students',
    exportFilename: 'Students',
    exportSheet:    'Students',
  } : isPatient ? {
    pageTitle:     'Patients',
    addButton:     'Add Patient',
    newDialog:     'New patient',
    bulkTooltip:   'Bulk upload patients from an Excel workbook',
    editTooltip:   'Edit patient',
    deleteTooltip: 'Delete patient',
    toastCreated:  'Patient created',
    toastUpdated:  'Patient updated',
    toastSaveFail: 'Failed to save patient',
    toastLoadFail: 'Failed to load patients',
    exportFilename: 'Patients',
    exportSheet:    'Patients',
  } : {
    pageTitle:     null,          // fall through to t('nav.customers')
    addButton:     'Add Customer',
    newDialog:     'New customer',
    bulkTooltip:   'Bulk upload customers from an Excel workbook',
    editTooltip:   'Edit customer',
    deleteTooltip: 'Delete customer',
    toastCreated:  'Customer created',
    toastUpdated:  'Customer updated',
    toastSaveFail: 'Failed to save customer',
    toastLoadFail: 'Failed to load customers',
    exportFilename: 'Customers',
    exportSheet:    'Customers',
  };
  const { t } = useI18n();
  const { canCreate, canUpdate, canDelete, canView } = useAuth();
  // Gate CRUD on the entity that OWNS the current lens, not on the
  // shared 'customer' entity. Patients is a Hospital-branded lens
  // over the same rows, but the tenant may have the Customer module
  // uninstalled while Hospital is on — in that case the Patients
  // page must still show its Add / Edit / Delete actions. Sidebar
  // visibility for Patients is already gated on 'encounter' in
  // {@link config/nav.ts}, so keying actions off the same entity
  // keeps the two layers consistent.
  const permEntity = isStudent ? 'enrollment' : isPatient ? 'encounter' : 'customer';
  const canAdd = canCreate(permEntity);
  const canEdit = canUpdate(permEntity);
  const canRemove = canDelete(permEntity);
  // Telegram column visibility + permissions. Hidden entirely when
  // the tenant lacks telegram.view so non-telegram users see the
  // original table shape.
  // v-hide-telegram-from-clinical-school — the Telegram customer-bot
  // surfaces (Link column + bot-config gear) are Sale-side affordances;
  // Patient / Student lenses hide them entirely so a hospital's roster
  // page doesn't advertise a customer-touchpoint that isn't part of
  // the clinical / school workflow. Role permissions unchanged — this
  // is a per-lens display gate only.
  const telegramInLens    = !isPatient && !isStudent;
  const canViewTelegram   = telegramInLens && canView('telegram');
  const canShareTelegram  = telegramInLens && canCreate('telegram');
  const canUnlinkTelegram = telegramInLens && canDelete('telegram');
  const canManageTelegramBot = telegramInLens && canUpdate('telegram');

  // Bot-settings dialog open state. Moved here from the now-removed
  // Settings → Telegram tab so admins find the config next to the
  // customer rows that use it.
  const [botSettingsOpen, setBotSettingsOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  const [rows, setRows] = useState<customersApi.Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | customersApi.CustomerType>('all');
  // Student lens: date range on createdAt (registration date).
  // Matches [[feedback-filter-strip-consistency]] From/To pattern.
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');
  // Per-customer Telegram linkage. Keyed by customerId so the row
  // cell can look up its own status in O(1). Loaded alongside the
  // customer list when the tenant has telegram.view.
  const [linkedById, setLinkedById] = useState<Map<string, telegramApi.TelegramCustomer>>(new Map());
  // Encounter-count per patient — only populated in the Patients lens.
  // Sale > Customer keeps this empty and never renders the column, so
  // there's no wasted round-trip.
  const [visitCountById, setVisitCountById] = useState<Map<string, number>>(new Map());

  // Edit-dialog state. `editing` null = closed.
  const [editing, setEditing] = useState<customersApi.Customer | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<customersApi.CustomerRequest>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<customersApi.Customer | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      // Server-side pagination would matter at the 5k-row scale; for now
      // we pull a generous page and paginate client-side so the search +
      // filter stay snappy without round-trips per keystroke.
      // v-customers-kind-separation — each lens filters the list to
       // its own kind so Sale > Customers, Healthcare > Patients, and
       // Education > Students never leak rows into each other.
      const res = await customersApi.list({
        q: search.trim() || undefined,
        type: typeFilter === 'all' ? undefined : typeFilter,
        kind: isStudent ? 'student' : isPatient ? 'patient' : 'customer',
        size: 200,
      });
      setRows(res.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : T.toastLoadFail);
    } finally {
      setLoading(false);
    }
    // Telegram linkage runs as a side-fetch so a 403 on the
    // telegram module (or the FE running pre-telegram-deploy) never
    // breaks the customer list itself. Soft-fail → empty map.
    if (canViewTelegram) {
      try {
        const links = await telegramApi.listLinkedCustomers();
        const m = new Map<string, telegramApi.TelegramCustomer>();
        for (const l of links) m.set(l.customerId, l);
        setLinkedById(m);
      } catch {
        setLinkedById(new Map());
      }
    }
    // Visit-count side-fetch — Patients lens only. Counts medical
    // invoices per customer so the "Visit" column can render the
    // number of encounters. Soft-fail: a 403 (encounter module off)
    // or empty response just leaves the column blank.
    if (isPatient) {
      try {
        const res = await invoicesApi.list({ kind: 'medical', size: 500 });
        const counts = new Map<string, number>();
        for (const inv of res.content ?? []) {
          counts.set(inv.customerId, (counts.get(inv.customerId) ?? 0) + 1);
        }
        setVisitCountById(counts);
      } catch {
        setVisitCountById(new Map());
      }
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [typeFilter]);

  // Debounce-light: search refetch fires on submit / blur rather than
  // per keystroke. Keeps the UI calm and the network quiet.
  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void load();
  };

  const filtered = useMemo(() => {
    // Server already filtered by type+q on the last fetch; this is just
    // a defensive re-filter so a stale prop doesn't show through.
    return rows.filter(r => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      // Student-lens date range on createdAt. ISO yyyy-mm-dd lex
      // ordering matches chronological ordering; slicing the ISO
      // timestamp to its date component sidesteps the `T` suffix.
      if (isStudent && (fromDate || toDate)) {
        const d = (r.createdAt ?? '').slice(0, 10);
        if (fromDate && d < fromDate) return false;
        if (toDate   && d > toDate)   return false;
      }
      return true;
    });
  }, [rows, typeFilter, isStudent, fromDate, toDate]);

  const pagination = usePagination(filtered, 25);

  const openAdd = (defaultType: customersApi.CustomerType = 'individual') => {
    setEditing(null);
    // Patients lens forces every new row to
    // {type: 'business', businessType: 'non_taxable'} so the shared
    // customers table gets a consistent shape and the TIN-required
    // validation (taxable business) never fires. Sale > Customer
    // keeps the caller-supplied defaultType.
    if (isPatient) {
      setForm({ ...emptyForm, type: 'business', businessType: 'non_taxable' });
    } else {
      setForm({ ...emptyForm, type: defaultType });
    }
    setDialogOpen(true);
  };
  const openEdit = (c: customersApi.Customer) => {
    setEditing(c);
    setForm({
      type: c.type,
      name: c.name,
      phone: c.phone ?? '',
      address: c.address ?? '',
      cid: c.cid ?? '',
      email: c.email ?? '',
      tin: c.tin ?? '',
      representative: c.representative ?? '',
      site: c.site ?? '',
      businessType: c.businessType ?? undefined,
      birthDate: c.birthDate ?? null,
      sex: c.sex ?? null,
      insurance: c.insurance ?? '',
      heightCm: c.heightCm ?? null,
      weightKg: c.weightKg ?? null,
      studentNo: c.studentNo ?? '',
      guardianName: c.guardianName ?? '',
      guardianPhone: c.guardianPhone ?? '',
      guardianEmail: c.guardianEmail ?? '',
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error(form.type === 'business' && !isPatient ? 'Company name is required' : 'Name is required');
      return;
    }
    // Patients: the Business Type / Representative inputs are hidden
    // (see the form JSX), but the backend still enforces "business
    // customer requires representative". Seed the field with the
    // patient's own name so the row saves without an extra prompt —
    // the value is just a placeholder; the Representative table
    // column reads it back if we ever surface it.
    // v-school-students — Student lens forces {type: 'individual'}
    // so the backend's business-only constraints (TIN required for
    // taxable, representative required for business) don't fire.
    // Students are natural people; no business fields apply.
    // v-customers-kind-separation — stamp the lens on outbound so
    // the server drops the row into the right dataset. `kind` is
    // immutable on the FE (dialog never re-lenses); each lens's
    // load/save are self-consistent.
    const kindOverride: customersApi.CustomerKind =
      isStudent ? 'student' : isPatient ? 'patient' : 'customer';
    const outboundForm = isPatient
      ? {
          ...form,
          type: 'business' as const,
          businessType: 'non_taxable' as const,
          representative: form.representative?.trim() || form.name.trim(),
          kind: kindOverride,
        }
      : isStudent
      ? {
          ...form,
          type: 'individual' as const,
          businessType: undefined,
          kind: kindOverride,
        }
      : { ...form, kind: kindOverride };
    if (!isPatient && !isStudent && form.type === 'business') {
      if (!form.businessType) {
        toast.error('Pick a business sub-type (Taxable / Non-taxable / Oversee).');
        return;
      }
      // TIN only required when the business is taxable; non-taxable
      // + oversee customers never carry one.
      if (form.businessType === 'taxable' && !form.tin?.trim()) {
        toast.error('TIN is required for taxable businesses.');
        return;
      }
      if (!form.representative?.trim()) { toast.error('Representative is required for a business customer'); return; }
    }
    setSaving(true);
    try {
      if (editing) {
        await customersApi.update(editing.id, outboundForm);
        toast.success(T.toastUpdated);
      } else {
        await customersApi.create(outboundForm);
        toast.success(T.toastCreated);
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : T.toastSaveFail);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await customersApi.remove(deleteTarget.id);
      toast.success(`Deleted '${deleteTarget.name}'`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{T.pageTitle ?? t('nav.customers')}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canManageTelegramBot && (
            <Button
              variant="outline"
              size="icon"
              title="Telegram bot settings"
              aria-label="Telegram bot settings"
              onClick={() => setBotSettingsOpen(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => exportListToExcel({
              filename: T.exportFilename,
              sheetName: T.exportSheet,
              columns: isStudent ? [
                { header: 'Name',            value: c => c.name },
                { header: 'Student No',      value: c => c.studentNo ?? '' },
                { header: 'Phone',           value: c => c.phone ?? '' },
                { header: 'Birth date',      value: c => c.birthDate ?? '' },
                { header: 'Age',             value: c => {
                    const y = ageInYears(c.birthDate);
                    return y == null ? '' : y;
                  } },
                { header: 'Sex',             value: c => c.sex ?? '' },
                { header: 'Guardian',        value: c => c.guardianName ?? '' },
                { header: 'Guardian Phone',  value: c => c.guardianPhone ?? '' },
                { header: 'Guardian Email',  value: c => c.guardianEmail ?? '' },
                { header: 'Address',         value: c => c.address ?? '' },
                { header: 'Remark',          value: c => c.remark ?? '' },
                { header: 'Enroll Count',    value: c => c.enrollmentCount ?? 0 },
                { header: 'Registered',      value: c => c.createdAt ? c.createdAt.slice(0, 10) : '' },
              ] : isPatient ? [
                { header: 'Name',       value: c => c.name },
                { header: 'Phone',      value: c => c.phone ?? '' },
                { header: 'Birth date', value: c => c.birthDate ?? '' },
                { header: 'Sex',        value: c => c.sex ?? '' },
                { header: 'Height cm',  value: c => c.heightCm ?? '' },
                { header: 'Weight kg',  value: c => c.weightKg ?? '' },
                { header: 'Insurance',  value: c => c.insurance ?? '' },
                { header: 'Address',    value: c => c.address ?? '' },
              ] : [
                { header: 'Type',           value: c => c.type },
                { header: 'Name',           value: c => c.name },
                { header: 'Phone',          value: c => c.phone ?? '' },
                { header: 'Email',          value: c => c.email ?? '' },
                { header: 'CID',            value: c => c.cid ?? '' },
                { header: 'TIN',            value: c => c.tin ?? '' },
                { header: 'Representative', value: c => c.representative ?? '' },
                { header: 'Site',           value: c => c.site ?? '' },
                { header: 'Address',        value: c => c.address ?? '' },
              ],
              rows: filtered,
            })}
            disabled={filtered.length === 0}
            title={filtered.length === 0 ? 'Nothing to export' : 'Download the visible rows as Excel'}
          >
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
          {canAdd && (
            <Button
              variant="outline"
              onClick={() => setBulkUploadOpen(true)}
              title={T.bulkTooltip}
            >
              <Upload className="h-4 w-4 mr-1.5" /> Bulk Upload
            </Button>
          )}
          {canAdd && (
            <Button onClick={() => openAdd('individual')}>
              <Plus className="h-4 w-4 mr-1.5" /> {T.addButton}
            </Button>
          )}
        </div>
      </div>

      {/* Bulk upload from Excel — mirrors the pattern used for
          Invoice / Bill / Item imports. Feeds the parser the current
          roster so Name / TIN dupes surface at parse time.
          v-bulk-upload-lens: pass presentAs so the dialog swaps
          Customers / Patients / Students labels AND stamps the right
          kind on every imported row. */}
      <BulkUploadCustomersDialog
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        existingCustomers={rows}
        presentAs={isStudent ? 'student' : isPatient ? 'patient' : 'customer'}
        onImported={() => { void load(); }}
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Type filter tabs — Individual / Business / All. Hidden
                on the Patients + Students lenses: those lenses each
                pin to a single stored shape so the operator has no
                reason to filter by shape. */}
            {!isPatient && !isStudent ? (
              <div className="flex items-center gap-1.5">
                {TYPE_FILTERS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setTypeFilter(f.value)}
                    className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                      typeFilter === f.value
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Student lens: From/To range on createdAt, matching
                  [[feedback-filter-strip-consistency]]. */}
              {isStudent && (
                <>
                  <Label className="text-xs text-gray-500">From</Label>
                  <DateInput value={fromDate || null} onChange={v => setFromDate(v ?? '')} max={toDate || undefined} placeholder="From" />
                  <Label className="text-xs text-gray-500">To</Label>
                  <DateInput value={toDate || null} onChange={v => setToDate(v ?? '')} min={fromDate || undefined} placeholder="To" />
                  {(fromDate || toDate) && (
                    <Button
                      size="sm" variant="ghost" className="h-9"
                      onClick={() => { setFromDate(''); setToDate(''); }}
                    >
                      Clear
                    </Button>
                  )}
                </>
              )}
              <form onSubmit={onSearchSubmit} className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={() => void load()}
                    placeholder="Search name, phone, TIN…"
                    className="h-8 pl-7 w-64 text-sm"
                  />
                </div>
              </form>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No customers yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Type + Name merged — the leading icon (B for
                        business / person for individual) carries the
                        type, the text carries the name. Saves a
                        column without losing the distinction. */}
                    <TableHead>Name</TableHead>
                    {/* v-student-column-merge — Students lens hides
                        the Phone column: the student's own phone is
                        stacked under the Name cell, and the Contact
                        column consolidates guardian name + phone. */}
                    {!isStudent && <TableHead>Phone</TableHead>}
                    {/* Patients page swaps the accounting-oriented TIN /
                        Representative / Site columns for clinical
                        columns. Representative gets auto-seeded to the
                        patient's own name on save (backend enforces
                        non-null on business customers) but never
                        surfaces on the Patients lens. */}
                    {!isPatient && !isStudent && <TableHead>TIN</TableHead>}
                    {!isPatient && !isStudent && <TableHead>Representative</TableHead>}
                    {!isPatient && !isStudent && <TableHead>Site</TableHead>}
                    {isStudent && <TableHead className="w-[120px]">Birth date</TableHead>}
                    {isStudent && <TableHead className="w-[70px] text-right">Age</TableHead>}
                    {isStudent && <TableHead className="w-[80px]">Sex</TableHead>}
                    {isStudent && <TableHead className="w-[200px]">Contact</TableHead>}
                    {isStudent && <TableHead className="w-[90px] text-right">Enroll Count</TableHead>}
                    {isStudent && <TableHead className="w-[160px]">Remark</TableHead>}
                    {isStudent && <TableHead className="w-[110px]">Date</TableHead>}
                    {isPatient && <TableHead className="w-[120px]">Birth date</TableHead>}
                    {isPatient && <TableHead className="w-[70px] text-right">Age</TableHead>}
                    {isPatient && <TableHead className="w-[80px]">Sex</TableHead>}
                    {isPatient && <TableHead className="w-[80px] text-right">Height</TableHead>}
                    {isPatient && <TableHead className="w-[80px] text-right">Weight</TableHead>}
                    {isPatient && <TableHead className="w-[160px]">Insurance</TableHead>}
                    {isPatient && <TableHead className="w-[80px] text-right">Visits</TableHead>}
                    {canViewTelegram && (
                      <TableHead className="w-[160px]">Link</TableHead>
                    )}
                    <TableHead className="text-right w-[88px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {/* Patients lens forces every row to business+non_taxable
                              underneath, but visually a hospital tenant thinks of
                              a patient as a person — use the individual icon here
                              regardless of the stored type. */}
                          {isPatient ? (
                            <span
                              className="inline-flex items-center justify-center w-5 h-5 rounded bg-teal-100 text-teal-700 shrink-0"
                              title="Patient"
                            >
                              <User className="h-3 w-3" />
                            </span>
                          ) : c.type === 'business' ? (
                            <span
                              className="inline-flex items-center justify-center w-5 h-5 rounded bg-violet-100 text-violet-700 shrink-0"
                              title="Business"
                            >
                              <Building2 className="h-3 w-3" />
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center justify-center w-5 h-5 rounded bg-emerald-100 text-emerald-700 shrink-0"
                              title="Individual"
                            >
                              <User className="h-3 w-3" />
                            </span>
                          )}
                          {/* v-student-column-merge — Students lens
                              stacks Student No + own phone under the
                              name so the merged "Student" column is
                              the single go-to for identity. */}
                          {isStudent ? (
                            <span className="flex flex-col leading-tight">
                              <span>{c.name}</span>
                              <span className="text-[11px] text-gray-500 tabular-nums">
                                {c.studentNo || '—'}
                                {c.phone ? ` · ${c.phone}` : ''}
                              </span>
                            </span>
                          ) : (
                            <span>{c.name}</span>
                          )}
                        </div>
                      </TableCell>
                      {!isStudent && (
                        <TableCell className="text-sm text-gray-600">{c.phone || '—'}</TableCell>
                      )}
                      {!isPatient && !isStudent && (
                        <TableCell className="text-sm text-gray-600">{c.tin || '—'}</TableCell>
                      )}
                      {!isPatient && !isStudent && (
                        <TableCell className="text-sm text-gray-600">{c.representative || '—'}</TableCell>
                      )}
                      {!isPatient && !isStudent && (
                        <TableCell className="text-sm text-gray-600 max-w-[200px] truncate" title={c.site || ''}>
                          {c.site || '—'}
                        </TableCell>
                      )}
                      {isStudent && (
                        <TableCell className="text-sm text-gray-600 tabular-nums">
                          {c.birthDate || '—'}
                        </TableCell>
                      )}
                      {isStudent && (
                        <TableCell className="text-sm text-right tabular-nums text-gray-600">
                          {(() => {
                            const y = ageInYears(c.birthDate);
                            return y == null ? '—' : `${y}y`;
                          })()}
                        </TableCell>
                      )}
                      {isStudent && (
                        <TableCell className="text-sm text-gray-600 capitalize">
                          {c.sex ?? '—'}
                        </TableCell>
                      )}
                      {isStudent && (
                        <TableCell className="text-sm text-gray-600 max-w-[200px]" title={c.guardianName || ''}>
                          {c.guardianName || c.guardianPhone ? (
                            <span className="flex flex-col leading-tight">
                              <span className="truncate">{c.guardianName || '—'}</span>
                              <span className="text-[11px] text-gray-500 tabular-nums">
                                {c.guardianPhone || '—'}
                              </span>
                            </span>
                          ) : '—'}
                        </TableCell>
                      )}
                      {isStudent && (
                        <TableCell className="text-sm text-right tabular-nums text-gray-600"
                          title="Lifetime enrollments (all statuses)">
                          {c.enrollmentCount ?? 0}
                        </TableCell>
                      )}
                      {isStudent && (
                        <TableCell className="text-sm text-gray-600 max-w-[160px] truncate" title={c.remark || ''}>
                          {c.remark || '—'}
                        </TableCell>
                      )}
                      {isStudent && (
                        <TableCell className="text-sm text-gray-600 tabular-nums">
                          {c.createdAt ? c.createdAt.slice(0, 10) : '—'}
                        </TableCell>
                      )}
                      {isPatient && (
                        <TableCell className="text-sm text-gray-600 tabular-nums">
                          {c.birthDate || '—'}
                        </TableCell>
                      )}
                      {isPatient && (
                        <TableCell className="text-sm text-right tabular-nums text-gray-600">
                          {(() => {
                            const y = ageInYears(c.birthDate);
                            return y == null ? '—' : `${y}y`;
                          })()}
                        </TableCell>
                      )}
                      {isPatient && (
                        <TableCell className="text-sm text-gray-600 capitalize">
                          {c.sex ?? '—'}
                        </TableCell>
                      )}
                      {isPatient && (
                        <TableCell className="text-sm text-right tabular-nums text-gray-600">
                          {c.heightCm != null ? `${c.heightCm} cm` : '—'}
                        </TableCell>
                      )}
                      {isPatient && (
                        <TableCell className="text-sm text-right tabular-nums text-gray-600">
                          {c.weightKg != null ? `${c.weightKg} kg` : '—'}
                        </TableCell>
                      )}
                      {isPatient && (
                        <TableCell className="text-sm text-gray-600 max-w-[160px] truncate" title={c.insurance || ''}>
                          {c.insurance || '—'}
                        </TableCell>
                      )}
                      {isPatient && (
                        <TableCell className="text-sm text-right tabular-nums">
                          {visitCountById.get(c.id) ?? 0}
                        </TableCell>
                      )}
                      {canViewTelegram && (
                        <TableCell>
                          <TelegramCell
                            customer={c}
                            linked={linkedById.get(c.id) ?? null}
                            canShare={canShareTelegram}
                            canUnlink={canUnlinkTelegram}
                            onChanged={() => { void load(); }}
                          />
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          {canEdit && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => openEdit(c)}
                              title={T.editTooltip}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canRemove && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteTarget(c)}
                              title={T.deleteTooltip}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pagination.totalPages > 1 && (
                <div className="mt-4">
                  <Pagination
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    onPageChange={pagination.goToPage}
                    startIndex={(pagination.currentPage - 1) * 25}
                    endIndex={Math.min(pagination.currentPage * 25, filtered.length)}
                    totalItems={filtered.length}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit dialog. Column-flex + max-h on the content keeps
          the dialog from overflowing a 14"-class laptop screen where
          the form (esp. business with all conditional fields open) is
          taller than the viewport. Header + footer stay pinned; the
          middle scrolls. */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
            {/* Description text used to sit under the title. On the
                Patients lens the wording is short enough to fit a
                tooltip, keeping the header compact — same pattern as
                InvoiceFormDialog. Sale > Customer keeps the visible
                description because the type-branched hint is
                genuinely useful mid-form. */}
            <DialogTitle className="flex items-center gap-1.5">
              {editing ? `Edit ${editing.name}` : T.newDialog}
              {isPatient && (
                <TooltipProvider delayDuration={120}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-gray-400 hover:text-gray-600"
                        aria-label="Patient form description"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      Only the patient name is required. Add contact + clinical fields as available.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </DialogTitle>
            {/* Keep an SR-only description for a11y — the tooltip on
                the Info button surfaces the same copy visually. */}
            <DialogDescription className={isPatient || isStudent ? 'sr-only' : ''}>
              {isStudent
                ? 'Only the student name is required. Add contact + guardian details as available.'
                : isPatient
                  ? 'Only the patient name is required. Add contact + clinical fields as available.'
                  : form.type === 'business'
                    ? 'Business customer — TIN and representative are required.'
                    : 'Individual customer — only name is required.'}
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable form body — overflow-y-auto here, not on the
              root, so the footer remains visible no matter how tall
              the body gets. */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 space-y-4">

          {/* Type picker — segmented control, disabled when editing so a
              row can't silently switch shape and orphan business-only
              fields. Edits stay within a type; create a new row to switch.
              Hidden on Patients + Students lenses: those force the
              underlying type / businessType (see submit()) so the
              business validation never fires and the clinical /
              guardian form stays uncluttered by accounting concepts. */}
          {!isPatient && !isStudent && (
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!!editing}
                  onClick={() => setForm(f => ({ ...f, type: 'individual' }))}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
                    form.type === 'individual'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  } ${editing ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <User className="h-4 w-4" /> Individual
                </button>
                <button
                  type="button"
                  disabled={!!editing}
                  onClick={() => setForm(f => ({ ...f, type: 'business' }))}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
                    form.type === 'business'
                      ? 'bg-violet-50 border-violet-300 text-violet-700'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  } ${editing ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <Building2 className="h-4 w-4" /> Business
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cust-name" className="text-xs">
                {isStudent ? 'Student name' : isPatient ? 'Patient name' : form.type === 'business' ? 'Company name' : 'Name'}
                <span className="text-red-500"> *</span>
              </Label>
              <Input
                id="cust-name"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={isStudent ? 'Sopheaktra Pich' : isPatient ? 'Sopheaktra Pich' : form.type === 'business' ? 'ACME Co., Ltd.' : 'Sopheaktra Pich'}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-phone" className="text-xs">Phone</Label>
                <Input
                  id="cust-phone"
                  value={form.phone ?? ''}
                  onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+855 12 345 678"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-email" className="text-xs">Email</Label>
                <Input
                  id="cust-email"
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="name@example.com"
                />
              </div>
            </div>

            {/* V214 / v-student-remark-swap — CID is a Sale / Patient
                lens concept (matches your bookkeeping references).
                Students don't use it; hide the field on that lens so
                the popup stays focused. */}
            {!isStudent && (
              <div className="space-y-1.5">
                <Label htmlFor="cust-cid" className="text-xs">Customer ID (CID)</Label>
                <Input
                  id="cust-cid"
                  value={form.cid ?? ''}
                  onChange={(e) => setForm(f => ({ ...f, cid: e.target.value }))}
                  placeholder="CID-001"
                />
                <div className="text-[10px] text-gray-500">
                  Your internal reference (e.g. <code>CID-001</code>, <code>CUS-014</code>). Free-form text.
                </div>
              </div>
            )}

            {/* Patients lens — clinical block: DoB (→ derived age),
                Height, Weight, Insurance. Sale > Customer skips
                everything in here. */}
            {/* v-school-students — Student-only fields. Mirrors the
                Patient block except Height + Weight (see
                v-school-students-patient-parity). Layout:
                  row 1: Student No + DoB (with derived age)
                  row 2: Sex + Insurance
                  row 3: Guardian trio (name / phone / email)
                Business + Height/Weight are entirely skipped. */}
            {isStudent && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cust-student-no" className="text-xs">Student No</Label>
                    <Input
                      id="cust-student-no"
                      value={form.studentNo ?? ''}
                      onChange={(e) => setForm(f => ({ ...f, studentNo: e.target.value }))}
                      placeholder="e.g. STU-001"
                      maxLength={32}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cust-student-dob" className="text-xs">
                      Date of birth
                      {(() => {
                        const y = ageInYears(form.birthDate);
                        return y == null ? null : (
                          <span className="text-gray-500 font-normal"> · {y} years</span>
                        );
                      })()}
                    </Label>
                    <Input
                      id="cust-student-dob"
                      type="date"
                      value={form.birthDate ?? ''}
                      onChange={(e) => setForm(f => ({ ...f, birthDate: e.target.value || null }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cust-student-sex" className="text-xs">Sex</Label>
                    <select
                      id="cust-student-sex"
                      className="w-full h-9 px-3 border rounded-md text-sm bg-white capitalize"
                      value={form.sex ?? ''}
                      onChange={(e) => setForm(f => ({
                        ...f,
                        sex: (e.target.value || null) as customersApi.PatientSex | null,
                      }))}
                    >
                      <option value="">—</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  {/* V214 / v-student-remark-swap — Insurance
                      dropped for students (belongs to Patients).
                      Remark takes its slot for a free-text note. */}
                  <div className="space-y-1.5">
                    <Label htmlFor="cust-student-remark" className="text-xs">Remark</Label>
                    <Input
                      id="cust-student-remark"
                      value={form.remark ?? ''}
                      onChange={(e) => setForm(f => ({ ...f, remark: e.target.value }))}
                      placeholder="Optional note"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600 uppercase tracking-wide">Contact</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <Input
                      value={form.guardianName ?? ''}
                      onChange={(e) => setForm(f => ({ ...f, guardianName: e.target.value }))}
                      placeholder="Full name"
                      maxLength={255}
                    />
                    <Input
                      value={form.guardianPhone ?? ''}
                      onChange={(e) => setForm(f => ({ ...f, guardianPhone: e.target.value }))}
                      placeholder="+855 12 345 678"
                      maxLength={64}
                    />
                    <Input
                      type="email"
                      value={form.guardianEmail ?? ''}
                      onChange={(e) => setForm(f => ({ ...f, guardianEmail: e.target.value }))}
                      placeholder="guardian@example.com"
                      maxLength={255}
                    />
                  </div>
                </div>
              </div>
            )}

            {isPatient && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="cust-birth-date" className="text-xs">
                      Date of birth
                      {(() => {
                        const y = ageInYears(form.birthDate);
                        return y == null ? null : (
                          <span className="text-gray-500 font-normal"> · {y} years</span>
                        );
                      })()}
                    </Label>
                    <Input
                      id="cust-birth-date"
                      type="date"
                      value={form.birthDate ?? ''}
                      onChange={(e) => setForm(f => ({ ...f, birthDate: e.target.value || null }))}
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="cust-sex" className="text-xs">Sex</Label>
                    <select
                      id="cust-sex"
                      className="w-full h-9 px-3 border rounded-md text-sm bg-white capitalize"
                      value={form.sex ?? ''}
                      onChange={(e) => setForm(f => ({
                        ...f,
                        sex: (e.target.value || null) as customersApi.PatientSex | null,
                      }))}
                    >
                      <option value="">—</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cust-height" className="text-xs">Height (cm)</Label>
                    <Input
                      id="cust-height"
                      type="number" step="0.1" min="0" max="999.9"
                      className="tabular-nums"
                      value={form.heightCm == null ? '' : String(form.heightCm)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm(f => ({ ...f, heightCm: v === '' ? null : Number(v) }));
                      }}
                      placeholder="e.g. 168"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cust-weight" className="text-xs">Weight (kg)</Label>
                    <Input
                      id="cust-weight"
                      type="number" step="0.1" min="0" max="999.9"
                      className="tabular-nums"
                      value={form.weightKg == null ? '' : String(form.weightKg)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm(f => ({ ...f, weightKg: v === '' ? null : Number(v) }));
                      }}
                      placeholder="e.g. 62"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cust-insurance" className="text-xs">Insurance</Label>
                  <Input
                    id="cust-insurance"
                    value={form.insurance ?? ''}
                    onChange={(e) => setForm(f => ({ ...f, insurance: e.target.value }))}
                    placeholder="Provider / policy number"
                    maxLength={255}
                  />
                </div>
              </div>
            )}

            {form.type === 'business' && !isPatient && !isStudent && (
              <>
                {/* Business sub-type — drives TIN visibility. The
                    operator must pick one before saving (validation
                    above + backend CHECK). Hidden on the Patients
                    lens because we force businessType='non_taxable'
                    for every patient (see emptyForm + openCreate). */}
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Business type<span className="text-red-500"> *</span>
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {BUSINESS_TYPE_OPTIONS.map((opt) => {
                      const active = form.businessType === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setForm(f => ({
                            ...f,
                            businessType: opt.value,
                            // Drop a stale TIN when the operator
                            // switches AWAY from taxable so the
                            // hidden field doesn't carry leftover
                            // value into the save.
                            tin: opt.value === 'taxable' ? f.tin : '',
                          }))}
                          className={`text-left rounded-md border px-3 py-2 transition-colors ${
                            active
                              ? 'bg-violet-50 border-violet-300 text-violet-700'
                              : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                          }`}
                          title={opt.hint}
                        >
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div className="text-[10px] text-gray-500 leading-tight">{opt.hint}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {form.businessType === 'taxable' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="cust-tin" className="text-xs">
                      TIN<span className="text-red-500"> *</span>
                    </Label>
                    <Input
                      id="cust-tin"
                      value={form.tin ?? ''}
                      onChange={(e) => setForm(f => ({ ...f, tin: e.target.value }))}
                      placeholder="K001-1234567"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="cust-rep" className="text-xs">
                    Representative<span className="text-red-500"> *</span>
                  </Label>
                  <Input
                    id="cust-rep"
                    value={form.representative ?? ''}
                    onChange={(e) => setForm(f => ({ ...f, representative: e.target.value }))}
                    placeholder="Name of the contact person"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cust-site" className="text-xs">Site</Label>
                  <Input
                    id="cust-site"
                    value={form.site ?? ''}
                    onChange={(e) => setForm(f => ({ ...f, site: e.target.value }))}
                    placeholder="https://example.com or @social-handle"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="cust-addr" className="text-xs">Address</Label>
              <Textarea
                id="cust-addr"
                value={form.address ?? ''}
                onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Street, sangkat, khan, province"
                rows={2}
              />
            </div>
          </div>

          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete '{deleteTarget?.name}'?</AlertDialogTitle>
            <AlertDialogDescription>
              The customer record will be removed. References from future modules
              (invoices, receipts) won't backfill — delete only when you're sure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {canManageTelegramBot && (
        <CustomerTelegramBotSettingsDialog
          open={botSettingsOpen}
          onOpenChange={setBotSettingsOpen}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Telegram column cell                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Renders the Telegram linkage state for one customer row.
 *
 *   • Not linked yet → "Share link" button. Click mints a 24-hour
 *     deep-link URL and pops a dialog with a Copy button so the
 *     operator can paste it to the customer.
 *   • Linked         → "@username" pill + a quiet "Unlink" action
 *     that drops the chat binding (the customer can be re-shared
 *     afterwards with a fresh link).
 *
 * Permissions: parent gates {@code canShare} on telegram.create and
 * {@code canUnlink} on telegram.delete; we just respect them.
 */
function TelegramCell({
  customer, linked, canShare, canUnlink, onChanged,
}: {
  customer: customersApi.Customer;
  linked: telegramApi.TelegramCustomer | null;
  canShare: boolean;
  canUnlink: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Unlink is destructive (chat binding goes away — the customer
  // would need a fresh deep-link to reconnect), so the click opens
  // a confirmation prompt before firing the API.
  const [confirmUnlinkOpen, setConfirmUnlinkOpen] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const res = await telegramApi.generateLink(customer.id);
      setLinkUrl(res.url);
      setExpiresAt(res.expiresAt);
      setCopied(false);
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generate link failed');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      await telegramApi.unlinkCustomer(customer.id);
      toast.success(`${customer.name} unlinked from Telegram`);
      setConfirmUnlinkOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unlink failed');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      toast.success('Link copied');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  // Connected — show the actual person who clicked /start. Display
  // name is what Telegram returned for first_name+last_name, falling
  // back to @username; we keep both visible so the operator can tell
  // "Mr Dara (@dara_tg)" from a different Dara with a different chat.
  if (linked) {
    const display =
      linked.displayName?.trim()
      || (linked.telegramUsername ? `@${linked.telegramUsername}` : `Chat #${linked.chatId}`);
    const handle = linked.telegramUsername && linked.displayName
      ? `@${linked.telegramUsername}`
      : null;
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex flex-col leading-tight">
          <div className="inline-flex items-center gap-1 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="font-medium text-emerald-700">{display}</span>
          </div>
          {handle && (
            <span className="tabular-nums text-[10px] text-gray-500">{handle}</span>
          )}
        </div>
        {canUnlink && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => setConfirmUnlinkOpen(true)}
            disabled={busy}
            title="Unlink this Telegram chat"
          >
            <Link2Off className="h-3 w-3 mr-1" /> Unlink
          </Button>
        )}
        {/* Confirm-before-destructive — the chat binding is per-bot,
            so re-linking later means generating a fresh deep-link
            and the customer clicking /start again. Worth a 1-click
            "are you sure?" interstitial. */}
        <AlertDialog open={confirmUnlinkOpen} onOpenChange={setConfirmUnlinkOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Unlink {customer.name} from Telegram?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {linked?.telegramUsername
                  ? <>The chat <span className="tabular-nums">@{linked.telegramUsername}</span> will no longer receive invoices from this customer.</>
                  : <>This chat will no longer receive invoices from this customer.</>}
                {' '}You can re-share a fresh link later — the customer will need to click <strong>Start</strong> on Telegram again to reconnect.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={unlink}
                className="bg-red-600 hover:bg-red-700"
                disabled={busy}
              >
                Unlink
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          {canShare ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={share}
              disabled={busy}
            >
              <Send className="h-3 w-3 mr-1" />
              {busy ? 'Generating…' : 'Share'}
            </Button>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
          {/* Recheck — useful right after sharing a link so the
              operator can poll for the customer's /start click
              without refreshing the whole page. */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700"
            onClick={() => onChanged()}
            disabled={busy}
            title="Check if the customer has connected"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Generated-link dialog. Pops once the API returns; the
          operator copies the URL and pastes it to the customer.
          On close we refresh the parent so a customer who clicks
          /start while the dialog is open shows up as connected
          without a manual page refresh. */}
      <Dialog open={open} onOpenChange={(next) => {
        setOpen(next);
        if (!next) onChanged();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Telegram link</DialogTitle>
            <DialogDescription>
              Send this link to <span className="font-medium">{customer.name}</span>.
              After they click <strong>Start</strong> on Telegram, their chat
              will be bound to this customer record.
            </DialogDescription>
          </DialogHeader>
          {linkUrl && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input value={linkUrl} readOnly className="tabular-nums text-xs" />
                <Button variant="outline" size="sm" onClick={copyLink}>
                  {copied
                    ? <><Check className="h-3.5 w-3.5 mr-1" /> Copied</>
                    : <><Copy className="h-3.5 w-3.5 mr-1" /> Copy</>}
                </Button>
              </div>
              {expiresAt && (
                <div className="text-[11px] text-gray-500">
                  Expires {new Date(expiresAt).toLocaleString()}. Generate a fresh one if it lapses.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { onChanged(); toast.success('Checked'); }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Check connection
            </Button>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
