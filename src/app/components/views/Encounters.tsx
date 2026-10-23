import { useEffect, useMemo, useState } from 'react';
import {
  Card, CardContent, CardHeader,
} from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
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
import * as paymentsApi from '../../api/payments';
import { useAuth } from '../../context/AuthContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { TableBodySkeletonRows } from '../common/LoadingSkeletons';
import { ListEmpty, ListError } from '../common/ListStates';
import { AuditCell } from '../common/AuditCell';
import { DateInput } from '../common/DateInput';
import { useConfirm } from '../../context/ConfirmContext';
import { statusBadgeClass } from '../../utils/statusTones';
import { formatMoneyForCurrency } from '../../utils/format';

const FILTER_SELECT_CLS =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0';

const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '',          label: 'Status : All' },
  { value: 'draft',     label: 'Status : Draft' },
  { value: 'progress',  label: 'Status : Progress' },
  { value: 'partially', label: 'Status : Partially' },
  { value: 'paid',      label: 'Status : Paid' },
  { value: 'overdue',   label: 'Status : Overdue' },
  { value: 'void',      label: 'Status : Void' },
];

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
  const confirm = useConfirm();
  const canAdd    = canCreate('encounter');
  const canRemove = canDelete('encounter');

  const [rows, setRows] = useState<invoicesApi.Invoice[]>([]);
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  const [doctors, setDoctors]     = useState<employeesApi.Employee[]>([]);
  const [loading, setLoading]     = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Per-encounter payments totals, split by currency. Populated by a
  // single batched call after the encounter list lands so the Received
  // (USD) column can render without a per-row round-trip.
  const [receivedByCurrency, setReceivedByCurrency] = useState<Record<string, Partial<Record<paymentsApi.PaymentCurrency, number>>>>({});

  const [formOpen, setFormOpen]     = useState(false);
  const [formEditing, setFormEditing] = useState<invoicesApi.Invoice | null>(null);
  const [detailId, setDetailId]     = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
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
      // Inline error with Retry (below) instead of a toast that leaves
      // the table reading as "No encounters yet".
      setLoadError(e instanceof Error ? e.message : 'Failed to load encounters');
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

  const filtersActive = !!(search.trim() || statusFilter || dateFrom || dateTo);
  const clearFilters = () => {
    setSearch(''); setStatusFilter(''); setDateFrom(''); setDateTo('');
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter && r.status !== statusFilter) return false;
      // ISO yyyy-MM-dd compares correctly as strings; both ends inclusive.
      if (dateFrom && r.issueDate < dateFrom) return false;
      if (dateTo && r.issueDate > dateTo) return false;
      if (!q) return true;
      const pat = customerById.get(r.customerId)?.name?.toLowerCase() ?? '';
      const doc = r.doctorId ? doctorById.get(r.doctorId)?.name?.toLowerCase() ?? '' : '';
      return (
        r.invoiceNo.toLowerCase().includes(q)
        || pat.includes(q)
        || doc.includes(q)
        || (r.diagnosis ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter, dateFrom, dateTo, customerById, doctorById]);

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

  const deleteEncounter = async (target: invoicesApi.Invoice) => {
    const ok = await confirm({
      title: 'Delete this encounter?',
      message: `${target.invoiceNo} will be permanently removed. Only draft encounters can be deleted.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await invoicesApi.remove(target.id);
      toast.success(`Deleted ${target.invoiceNo}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete encounter');
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
          {/* One filter strip, same as Transactions / Invoices. */}
          <div className="filter-strip">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className={FILTER_SELECT_CLS}
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
            </select>
            <Label className="text-xs text-gray-500 shrink-0">From</Label>
            <div className="shrink-0"><DateInput value={dateFrom || null} onChange={v => setDateFrom(v ?? '')} max={dateTo || undefined} /></div>
            <Label className="text-xs text-gray-500 shrink-0">To</Label>
            <div className="shrink-0"><DateInput value={dateTo || null} onChange={v => setDateTo(v ?? '')} min={dateFrom || undefined} /></div>
            <div className="relative shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search encounter no, patient, doctor, diagnosis…"
                className="h-9 pl-7 w-64 text-sm"
              />
            </div>
            {filtersActive && (
              <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        {/* Default CardContent padding, not p-0 — the bordered scroller
            below needs the 24px side gutter to read as an inset panel.
            With p-0 it sits flush against the Card's own border, and
            CardContent's [&:last-child]:pb-6 survives twMerge, leaving
            a stray band under the table. Matches the Items page. */}
        <CardContent>
          {/* Header stays visible even on empty state so the column
              layout communicates schema at a glance. Empty-state /
              loading rows span every column via colSpan so the
              body still parses as a real table. */}
          <div className="border rounded-md overflow-auto max-h-[calc(100vh-280px)]">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10 shadow-[inset_0_-1px_0_0_rgb(229,231,235)]">
              <TableRow>
                <TableHead className="w-[140px]">Encounter No.</TableHead>
                <TableHead className="w-[110px]">Start date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead className="max-w-[240px]">Diagnosis</TableHead>
                <TableHead className="text-right w-[110px]">Total</TableHead>
                <TableHead className="text-right w-[130px]">Received</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead>Author</TableHead>
                <TableHead className="text-right w-[96px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 ? (
                <TableBodySkeletonRows rows={6} columns={10} />
              ) : loadError && rows.length === 0 ? (
                <ListError colSpan={10} message={loadError} onRetry={() => { void load(); }} />
              ) : filtered.length === 0 ? (
                <ListEmpty colSpan={10} noun="encounters" filtered={filtersActive} />
              ) : (
                pagination.paginatedItems.map(r => {
                  const patient = customerById.get(r.customerId);
                  const doctor  = r.doctorId ? doctorById.get(r.doctorId) : null;
                  return (
                    <TableRow key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetailId(r.id)}>
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
                        {r.currency} {formatMoneyForCurrency(r.total, r.currency)}
                      </TableCell>
                      {/* Received — net receipts per currency (credits
                          minus refund debits) from the batched totals.
                          USD and KHR each get their own line; they are
                          never added together. Blank on soft-fail or
                          when nothing has been paid yet. */}
                      <TableCell className="text-right tabular-nums text-sm text-emerald-700">
                        {(() => {
                          const parts = (['USD', 'KHR'] as const)
                            .map(c => [c, receivedByCurrency[r.id]?.[c] ?? 0] as const)
                            .filter(([, v]) => v > 0);
                          return parts.length > 0
                            ? parts.map(([c, v]) => <div key={c}>{c} {formatMoneyForCurrency(v, c)}</div>)
                            : <span className="text-gray-400">—</span>;
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${statusBadgeClass(r.status)}`}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {/* Server-resolved creator name, same as Invoices. */}
                        <AuditCell name={r.createdByName} at={r.createdAt} />
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
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
                              onClick={() => void deleteEncounter(r)}
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
          </div>
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

      <EncounterSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
