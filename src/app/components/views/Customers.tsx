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
import * as customersApi from '../../api/customers';
import * as telegramApi from '../../api/telegram';
import { Plus, Pencil, Trash2, Search, User, Building2, RefreshCw, Send, Copy, Check, Link2Off, CheckCircle2, Settings, Upload } from 'lucide-react';
import { BulkUploadCustomersDialog } from '../common/BulkUploadCustomersDialog';
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
};

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
 */
export function Customers() {
  const { t } = useI18n();
  const { canCreate, canUpdate, canDelete, canView } = useAuth();
  const canAdd = canCreate('customer');
  const canEdit = canUpdate('customer');
  const canRemove = canDelete('customer');
  // Telegram column visibility + permissions. Hidden entirely when
  // the tenant lacks telegram.view so non-telegram users see the
  // original table shape.
  const canViewTelegram   = canView('telegram');
  const canShareTelegram  = canCreate('telegram');
  const canUnlinkTelegram = canDelete('telegram');
  // Surface the bot-config gear only to admins who can actually change
  // it. Update covers register+toggle+rotate-token; delete is wrapped
  // inside the dialog with its own confirm.
  const canManageTelegramBot = canUpdate('telegram');

  // Bot-settings dialog open state. Moved here from the now-removed
  // Settings → Telegram tab so admins find the config next to the
  // customer rows that use it.
  const [botSettingsOpen, setBotSettingsOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  const [rows, setRows] = useState<customersApi.Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | customersApi.CustomerType>('all');
  // Per-customer Telegram linkage. Keyed by customerId so the row
  // cell can look up its own status in O(1). Loaded alongside the
  // customer list when the tenant has telegram.view.
  const [linkedById, setLinkedById] = useState<Map<string, telegramApi.TelegramCustomer>>(new Map());

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
      const res = await customersApi.list({
        q: search.trim() || undefined,
        type: typeFilter === 'all' ? undefined : typeFilter,
        size: 200,
      });
      setRows(res.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load customers');
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
    if (typeFilter === 'all') return rows;
    return rows.filter(r => r.type === typeFilter);
  }, [rows, typeFilter]);

  const pagination = usePagination(filtered, 25);

  const openAdd = (defaultType: customersApi.CustomerType = 'individual') => {
    setEditing(null);
    setForm({ ...emptyForm, type: defaultType });
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
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error(form.type === 'business' ? 'Company name is required' : 'Name is required');
      return;
    }
    if (form.type === 'business') {
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
        await customersApi.update(editing.id, form);
        toast.success('Customer updated');
      } else {
        await customersApi.create(form);
        toast.success('Customer created');
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save customer');
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
          <h1 className="text-3xl font-bold">{t('nav.customers')}</h1>
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
          {canAdd && (
            <Button
              variant="outline"
              onClick={() => setBulkUploadOpen(true)}
              title="Bulk upload customers from an Excel workbook"
            >
              <Upload className="h-4 w-4 mr-1.5" /> Bulk Upload
            </Button>
          )}
          {canAdd && (
            <Button onClick={() => openAdd('individual')}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Customer
            </Button>
          )}
        </div>
      </div>

      {/* Bulk upload from Excel — mirrors the pattern used for
          Invoice / Bill / Item imports. Feeds the parser the current
          roster so Name / TIN dupes surface at parse time. */}
      <BulkUploadCustomersDialog
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        existingCustomers={rows}
        onImported={() => { void load(); }}
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
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
                    <TableHead>Phone</TableHead>
                    <TableHead>TIN</TableHead>
                    <TableHead>Representative</TableHead>
                    <TableHead>Site</TableHead>
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
                          {c.type === 'business' ? (
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
                          <span>{c.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{c.phone || '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600">{c.tin || '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600">{c.representative || '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600 max-w-[200px] truncate" title={c.site || ''}>
                        {c.site || '—'}
                      </TableCell>
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
                              title="Edit customer"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canRemove && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteTarget(c)}
                              title="Delete customer"
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
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'New customer'}</DialogTitle>
            <DialogDescription>
              {form.type === 'business'
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
              fields. Edits stay within a type; create a new row to switch. */}
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

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cust-name" className="text-xs">
                {form.type === 'business' ? 'Company name' : 'Name'}
                <span className="text-red-500"> *</span>
              </Label>
              <Input
                id="cust-name"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={form.type === 'business' ? 'ACME Co., Ltd.' : 'Sopheaktra Pich'}
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

            {form.type === 'business' && (
              <>
                {/* Business sub-type — drives TIN visibility. The
                    operator must pick one before saving (validation
                    above + backend CHECK). */}
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
