import { useEffect, useMemo, useState } from 'react';
import {
  Card, CardContent, CardHeader,
} from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Plus, RefreshCw, Eye, Trash2, Stethoscope, Search, Settings,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { toast } from 'sonner';
import { EncounterFormDialog } from './EncounterFormDialog';
import { EncounterDetailDialog } from './EncounterDetailDialog';
import { EncounterSettingsDialog } from './EncounterSettingsDialog';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import * as invoicesApi from '../../api/invoices';
import * as customersApi from '../../api/customers';
import * as employeesApi from '../../api/employees';
import * as usersApi from '../../api/users';
import * as paymentsApi from '../../api/payments';
import { useAuth } from '../../context/AuthContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { TableBodySkeletonRows } from '../common/LoadingSkeletons';

/**
 * Healthcare > Encounters — first-class page (as of
 * v-encounters-first-class). Storage still lives on the shared
 * {@code sale_invoices} table under {@code kind='medical'}, but the
 * UI here diverges from Sale > Invoice: no reminder / CN-DN / notes /
 * terms / auto-issue toggle / auto-send — the doctor-facing flow is
 * different enough that a shared lens ended up misleading.
 *
 * <p>What's shared with Sale > Invoice: the payment mechanism
 * (invoice_payments), the attachments table (polymorphic), the
 * numbering / prefix (V183 hospital scope). Everything else is
 * bespoke here.</p>
 */
export function Encounters() {
  const { canCreate, canDelete } = useAuth();
  const { formatDate } = useDateFormat();
  const canAdd    = canCreate('encounter');
  const canRemove = canDelete('encounter');

  const [rows, setRows] = useState<invoicesApi.Invoice[]>([]);
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  const [doctors, setDoctors]     = useState<employeesApi.Employee[]>([]);
  const [users, setUsers]         = useState<usersApi.User[]>([]);
  const [loading, setLoading]     = useState(false);
  // Per-encounter payments totals, split by currency. Populated by a
  // single batched call after the encounter list lands so the Received
  // (USD) column can render without a per-row round-trip.
  const [receivedByCurrency, setReceivedByCurrency] = useState<Record<string, Partial<Record<paymentsApi.PaymentCurrency, number>>>>({});

  const [formOpen, setFormOpen]     = useState(false);
  const [formEditing, setFormEditing] = useState<invoicesApi.Invoice | null>(null);
  const [detailId, setDetailId]     = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<invoicesApi.Invoice | null>(null);
  const [search, setSearch]         = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [encRes, custRes, empRes] = await Promise.all([
        invoicesApi.list({ kind: 'medical', size: 200 }),
        customersApi.list({ size: 500 }),
        employeesApi.list({ size: 500, status: 'active' }),
      ]);
      const encounters = encRes.content ?? [];
      setRows(encounters);
      setCustomers(custRes.content ?? []);
      setDoctors(empRes.content ?? []);
      // Author column: fetched separately so a 403 on user-management
      // doesn't blank the encounter list itself.
      usersApi.list({ size: 500 })
        .then(r => setUsers(r.content ?? []))
        .catch(() => setUsers([]));
      // Per-encounter payments totals, split by currency. Batched so
      // a page of encounters is one round-trip. Soft-fail: a 403 on
      // the payment module (or an empty response) just leaves the
      // Received (USD) column at zero across the board — the list
      // itself keeps rendering.
      if (encounters.length > 0) {
        paymentsApi.totalsByCurrency(encounters.map(e => e.id))
          .then(setReceivedByCurrency)
          .catch(() => setReceivedByCurrency({}));
      } else {
        setReceivedByCurrency({});
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load encounters');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const customerById = useMemo(() => {
    const m = new Map<string, customersApi.Customer>();
    customers.forEach(c => m.set(c.id, c));
    return m;
  }, [customers]);
  const doctorById = useMemo(() => {
    const m = new Map<string, employeesApi.Employee>();
    doctors.forEach(d => m.set(d.id, d));
    return m;
  }, [doctors]);
  const userById = useMemo(() => {
    const m = new Map<string, usersApi.User>();
    users.forEach(u => m.set(u.id, u));
    return m;
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => {
      const pat = customerById.get(r.customerId)?.name?.toLowerCase() ?? '';
      const doc = r.doctorId ? doctorById.get(r.doctorId)?.name?.toLowerCase() ?? '' : '';
      return (
        r.invoiceNo.toLowerCase().includes(q)
        || pat.includes(q)
        || doc.includes(q)
        || (r.diagnosis ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, customerById, doctorById]);

  // Cash-Advance-style paginator — 10 encounters per page. Bound to
  // the search-filtered array so paging tracks the current view, not
  // the full unfiltered dataset.
  const pagination = usePagination(filtered, 10);

  const openCreate = () => {
    setFormEditing(null);
    setFormOpen(true);
  };
  const openEdit = (inv: invoicesApi.Invoice) => {
    setFormEditing(inv);
    setDetailId(null);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await invoicesApi.remove(deleteTarget.id);
      toast.success(`Deleted ${deleteTarget.invoiceNo}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete encounter');
      setDeleteTarget(null);
    }
  };

  /** Small badge tint per status. Distinct from Sale > Invoice so a
   *  hospital user reads the row status independent of the sale
   *  accounting workflow. */
  const statusBadge = (s: invoicesApi.InvoiceStatus): string => {
    switch (s) {
      case 'draft':     return 'border-slate-300 text-slate-700 bg-slate-50';
      case 'progress':  return 'border-teal-300 text-teal-700 bg-teal-50';
      case 'partially': return 'border-amber-300 text-amber-700 bg-amber-50';
      case 'paid':      return 'border-emerald-300 text-emerald-700 bg-emerald-50';
      case 'overdue':   return 'border-orange-400 text-orange-800 bg-orange-50';
      case 'void':      return 'border-red-300 text-red-700 bg-red-50';
      default:          return 'border-gray-200 text-gray-700 bg-gray-50';
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-teal-600" />
          <h1 className="text-3xl font-bold">Encounters</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Toolbar order matches Sale > Invoice for cross-page
              consistency: Refresh → ⚙ Settings → primary action.
              Settings sits immediately to the left of the primary
              button so the gear reads as a modifier of that flow
              rather than a stray control on the far side. */}
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Encounter settings">
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Encounter settings — logo, branches, and numbering</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {canAdd && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" /> New Encounter
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-end">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search encounter no, patient, doctor, diagnosis…"
                className="pl-7 w-[320px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Header stays visible even on empty state so the column
              layout communicates schema at a glance. Empty-state /
              loading rows span every column via colSpan so the
              body still parses as a real table. */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Encounter No.</TableHead>
                <TableHead className="w-[110px]">Start date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead className="max-w-[240px]">Diagnosis</TableHead>
                <TableHead className="text-right w-[110px]">Total</TableHead>
                <TableHead className="text-right w-[130px]">Received (USD)</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead>Author</TableHead>
                <TableHead className="text-right w-[96px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeletonRows rows={6} columns={10} />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-sm text-gray-500">
                    {search
                      ? 'No encounters match your search.'
                      : 'No encounters yet — click New Encounter to create the first one.'}
                  </TableCell>
                </TableRow>
              ) : (
                pagination.paginatedItems.map(r => {
                  const patient = customerById.get(r.customerId);
                  const doctor  = r.doctorId ? doctorById.get(r.doctorId) : null;
                  return (
                    <TableRow key={r.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium tabular-nums">{r.invoiceNo}</TableCell>
                      <TableCell className="text-sm">{formatDate(r.issueDate)}</TableCell>
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
                      <TableCell className="text-sm text-gray-600 max-w-[240px] truncate" title={r.diagnosis ?? ''}>
                        {r.diagnosis || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {r.currency} {r.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      {/* Received (USD) — sum of credit payments in USD
                          minus refund debits, from the batched
                          per-currency totals. Blank on soft-fail or
                          when nothing has been paid yet. */}
                      <TableCell className="text-right tabular-nums text-sm text-emerald-700">
                        {(() => {
                          const usd = receivedByCurrency[r.id]?.USD ?? 0;
                          return usd > 0
                            ? `USD ${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : <span className="text-gray-400">—</span>;
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${statusBadge(r.status)}`}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {/* Show author's email if we have it. Author id
                            lives on the invoice row via @CreatedBy. */}
                        {(r as unknown as { createdById?: string }).createdById
                          ? userById.get((r as unknown as { createdById?: string }).createdById!)?.email ?? '—'
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {/* Row action bar — mirrors the Invoice list
                            row: View (ghost, h-7, icon + label) +
                            Delete (icon-only, red, drafts only) with
                            a hover tooltip. No CN/DN dropdown here —
                            Encounters don't spawn adjustments. */}
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => setDetailId(r.id)}>
                            <Eye className="h-3 w-3 mr-1" /> View
                          </Button>
                          {canRemove && r.status === 'draft' && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteTarget(r)}
                              title="Delete draft"
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

      <EncounterFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setFormEditing(null); }}
        customers={customers}
        editing={formEditing}
        onCreated={async () => {
          setFormOpen(false);
          setFormEditing(null);
          await load();
        }}
      />

      {detailId && (
        <EncounterDetailDialog
          encounterId={detailId}
          open={!!detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => { void load(); }}
          onEdit={openEdit}
          customerById={customerById}
          doctorById={doctorById}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          encounterNo={deleteTarget.invoiceNo}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      <EncounterSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}

/** Minimal confirm-delete overlay — the shared AlertDialog primitive
 *  would work but this page has no other alert-style flow, so a
 *  local inline card keeps the file self-contained. */
function ConfirmDeleteDialog({ encounterNo, onCancel, onConfirm }: {
  encounterNo: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <Card className="max-w-sm w-full">
        <CardHeader>
          <h2 className="text-lg font-semibold">Delete encounter?</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            <span className="tabular-nums">{encounterNo}</span> will be permanently removed. Only draft encounters can be deleted.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button variant="destructive" onClick={onConfirm}>Delete</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
