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
import * as vendorsApi from '../../api/vendors';
import { Plus, Pencil, Trash2, Search, User, Building2, RefreshCw, Upload } from 'lucide-react';
import { BulkUploadVendorsDialog } from '../common/BulkUploadVendorsDialog';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

const TYPE_FILTERS: ReadonlyArray<{ value: 'all' | vendorsApi.VendorType; label: string }> = [
  { value: 'all',         label: 'All' },
  { value: 'individual',  label: 'Individuals' },
  { value: 'business',    label: 'Businesses' },
];

const emptyForm: vendorsApi.VendorRequest = {
  type: 'individual',
  name: '',
  phone: '',
  address: '',
  tin: '',
  representative: '',
  site: '',
};

/**
 * Accountant → Vendors. Two shapes:
 *   - Individual: name, phone, address
 *   - Business:   company name, TIN, representative, phone, address, site
 *
 * Backend enforces type-specific required fields (Business needs TIN +
 * representative); the form mirrors that with conditional inputs and
 * the same client-side validation, so the user sees the message before
 * the round-trip.
 */
export function Vendors() {
  const { t } = useI18n();
  const { canCreate, canUpdate, canDelete } = useAuth();
  const canAdd = canCreate('vendor');
  const canEdit = canUpdate('vendor');
  const canRemove = canDelete('vendor');

  const [rows, setRows] = useState<vendorsApi.Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | vendorsApi.VendorType>('all');

  // Edit-dialog state. `editing` null = closed.
  const [editing, setEditing] = useState<vendorsApi.Vendor | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<vendorsApi.VendorRequest>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<vendorsApi.Vendor | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      // Server-side pagination would matter at the 5k-row scale; for now
      // we pull a generous page and paginate client-side so the search +
      // filter stay snappy without round-trips per keystroke.
      const res = await vendorsApi.list({
        q: search.trim() || undefined,
        type: typeFilter === 'all' ? undefined : typeFilter,
        size: 200,
      });
      setRows(res.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load vendors');
    } finally {
      setLoading(false);
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

  const openAdd = (defaultType: vendorsApi.VendorType = 'individual') => {
    setEditing(null);
    setForm({ ...emptyForm, type: defaultType });
    setDialogOpen(true);
  };
  const openEdit = (c: vendorsApi.Vendor) => {
    setEditing(c);
    setForm({
      type: c.type,
      name: c.name,
      phone: c.phone ?? '',
      address: c.address ?? '',
      tin: c.tin ?? '',
      representative: c.representative ?? '',
      site: c.site ?? '',
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error(form.type === 'business' ? 'Company name is required' : 'Name is required');
      return;
    }
    if (form.type === 'business') {
      if (!form.tin?.trim()) { toast.error('TIN is required for a business vendor'); return; }
      if (!form.representative?.trim()) { toast.error('Representative is required for a business vendor'); return; }
    }
    setSaving(true);
    try {
      if (editing) {
        await vendorsApi.update(editing.id, form);
        toast.success('Vendor updated');
      } else {
        await vendorsApi.create(form);
        toast.success('Vendor created');
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await vendorsApi.remove(deleteTarget.id);
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
      <div className="page-header-strip">
        <div>
          <h1 className="text-3xl font-bold">{t('nav.vendors')}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canAdd && (
            <Button
              variant="outline"
              onClick={() => setBulkUploadOpen(true)}
              title="Bulk upload vendors from an Excel workbook"
            >
              <Upload className="h-4 w-4 mr-1.5" /> Bulk Upload
            </Button>
          )}
          {canAdd && (
            <Button onClick={() => openAdd('individual')}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Vendor
            </Button>
          )}
        </div>
      </div>

      {/* Bulk upload from Excel — mirrors the Customer / Item /
          Invoice / Bill imports. Feeds the parser the current roster
          so Name / TIN dupes surface at parse time. */}
      <BulkUploadVendorsDialog
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        existingVendors={rows}
        onImported={() => { void load(); }}
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="filter-strip">
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
            <p className="text-sm text-gray-500 py-6 text-center">No vendors yet.</p>
          ) : (
            <>
              {/* v-list-table-invoice-shape — border+scroll wrapper +
                  sticky header, same shell as Invoices / Quotations. */}
              <div className="border rounded-md overflow-auto max-h-[calc(100vh-280px)]">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10 shadow-[inset_0_-1px_0_0_rgb(229,231,235)]">
                  <TableRow>
                    <TableHead className="w-[150px]">Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>TIN</TableHead>
                    <TableHead>Representative</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>
                        {c.type === 'business' ? (
                          <Badge variant="outline" className="border-violet-300 text-violet-700 bg-violet-50 gap-1">
                            <Building2 className="h-3 w-3" /> Business
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50 gap-1">
                            <User className="h-3 w-3" /> Individual
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-sm text-gray-600">{c.phone || '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600">{c.tin || '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600">{c.representative || '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600 max-w-[200px] truncate" title={c.site || ''}>
                        {c.site || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          {canEdit && (
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => openEdit(c)}>
                              <Pencil className="h-3 w-3 mr-1" /> Edit
                            </Button>
                          )}
                          {canRemove && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteTarget(c)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              {pagination.totalPages > 1 && (
                <div className="px-1 py-0 border-t">
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

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'New vendor'}</DialogTitle>
            <DialogDescription>
              {form.type === 'business'
                ? 'Business vendor — TIN and representative are required.'
                : 'Individual vendor — only name is required.'}
            </DialogDescription>
          </DialogHeader>

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

            <div className="space-y-1.5">
              <Label htmlFor="cust-phone" className="text-xs">Phone</Label>
              <Input
                id="cust-phone"
                value={form.phone ?? ''}
                onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+855 12 345 678"
              />
            </div>

            {form.type === 'business' && (
              <>
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

          <DialogFooter>
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
              The vendor record will be removed. References from future modules
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
    </div>
  );
}
