import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  ListTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Label } from '../ui/label';
import { DateInput } from '../common/DateInput';
import { StatCard } from '../common/StatCard';
import { ListEmpty, ListError } from '../common/ListStates';
import { TableBodySkeletonRows } from '../common/LoadingSkeletons';
import { Pagination } from '../common/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { toast } from 'sonner';
import { ArrowDownLeft, RefreshCw, Info, Search, Wallet, CalendarCheck, Layers } from 'lucide-react';
import { format as fmtDate, parseISO } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useDateFormat } from '../../context/DateFormatContext';
import { useI18n } from '../../i18n/I18nContext';
import { formatMoney } from '../../utils/format';
import * as collectionsApi from '../../api/collections';

/**
 * Collections — unified income report combining Payment Plan
 * payments (payment_transactions) with paid Bookings. Reads like
 * the Transactions ledger but scoped to receivables-side income
 * only. See CollectionsController for the BE aggregation.
 */
export function PaymentCollections() {
  const { formatDate } = useDateFormat();
  // v-collections-title-i18n — page header uses the same i18n key as
  // the sidebar leaf so the two labels stay in lockstep across
  // languages (EN "Collections" / KM "ការប្រមូល" / ZH "催收").
  const { t } = useI18n();
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');
  const [search, setSearch] = useState('');
  /** v-collections-type-filter — one dropdown filters across all
   *  plan variants + booking. `'all'` = no filter; anything else
   *  matches `IncomeItem.subType`. */
  const [typeFilter, setTypeFilter] = useState<'all' | collectionsApi.IncomeSubType>('all');
  const [rows, setRows] = useState<collectionsApi.IncomeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await collectionsApi.income({
        from: from || undefined,
        to:   to   || undefined,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load collections';
      setLoadError(msg);
      toast.error(msg);
    } finally { setLoading(false); }
  };
  const anyFilter = !!(search.trim() || typeFilter !== 'all' || from || to);
  const clearFilters = () => { setSearch(''); setTypeFilter('all'); setFrom(''); setTo(''); };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (typeFilter !== 'all' && r.subType !== typeFilter) return false;
      if (!q) return true;
      return (r.referenceNo?.toLowerCase().includes(q) ?? false)
          || (r.customerName?.toLowerCase().includes(q) ?? false);
    });
  }, [rows, search, typeFilter]);

  // v-receivables-pagination-consistency — 15 rows/page matches Plans.
  const pagination = usePagination(filtered, 15);
  useEffect(() => { pagination.resetPage(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, typeFilter, from, to]);

  // Tiles follow the current filter (search + type + dates), as the
  // header tooltip promises — they used to sum every loaded row.
  const counts = useMemo(() => ({
    all:     filtered.length,
    plan:    filtered.filter(r => r.sourceType === 'plan').length,
    booking: filtered.filter(r => r.sourceType === 'booking').length,
  }), [filtered]);

  const sums = useMemo(() => ({
    all:     filtered.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    plan:    filtered.filter(r => r.sourceType === 'plan').reduce((s, r) => s + Number(r.amount ?? 0), 0),
    booking: filtered.filter(r => r.sourceType === 'booking').reduce((s, r) => s + Number(r.amount ?? 0), 0),
  }), [filtered]);

  const filteredSum = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    [filtered],
  );

  /** Count per type value, used inside the dropdown to show
   *  `Installment (4)` etc. so operators can see distribution at
   *  a glance without opening the menu. */
  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) if (r.subType) m[r.subType] = (m[r.subType] ?? 0) + 1;
    return m;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <div>
          <h1 className="text-3xl font-bold inline-flex items-center gap-2">
            <ArrowDownLeft className="h-7 w-7 text-emerald-600" />
            {t('nav.receivables.collections')}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Cash received across Payment Plan payments + paid Bookings. Filter by date + source; totals adapt to the current filter.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="stat-strip stat-cols-3">
        <StatCard label={`Total Income (${counts.all})`}    value={`$${formatMoney(sums.all)}`}     icon={Wallet}        tone="green" />
        <StatCard label={`Plan Payments (${counts.plan})`}  value={`$${formatMoney(sums.plan)}`}    icon={Layers}        tone="purple" />
        <StatCard label={`Bookings (${counts.booking})`}    value={`$${formatMoney(sums.booking)}`} icon={CalendarCheck} tone="green" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="filter-strip">
            <div className="relative shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search reference #, customer"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 pl-7 w-64"
              />
            </div>
            {/* v-collections-type-filter — one dropdown across all
                Plan variants + Booking. Replaces the Plans / Bookings
                tabs so Installment / Rental / Loan / Tuition /
                Custom are pickable directly. */}
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Filter by type"
            >
              <option value="all">Type : All ({rows.length})</option>
              {(Object.entries(collectionsApi.INCOME_TYPE_META) as [collectionsApi.IncomeSubType, { label: string }][])
                .map(([k, m]) => (
                  <option key={k} value={k}>Type : {m.label} ({typeCounts[k] ?? 0})</option>
                ))}
            </select>
            <Label className="text-xs text-gray-500 shrink-0">From</Label>
            <div className="shrink-0"><DateInput value={from || null} onChange={v => setFrom(v ?? '')} max={to || undefined} /></div>
            <Label className="text-xs text-gray-500 shrink-0">To</Label>
            <div className="shrink-0"><DateInput value={to || null} onChange={v => setTo(v ?? '')} min={from || undefined} /></div>
            {anyFilter && (
              <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ListTable>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Date &amp; Time</TableHead>
                <TableHead className="w-44">Reference No.</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="w-32">Type</TableHead>
                <TableHead className="w-28">Method</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right w-32">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 && <TableBodySkeletonRows columns={7} />}
              {!loading && loadError && rows.length === 0 && (
                <ListError colSpan={7} message={loadError} onRetry={() => void load()} />
              )}
              {!loading && !(loadError && rows.length === 0) && filtered.length === 0 && (
                <ListEmpty colSpan={7} noun="collections" filtered={anyFilter} />
              )}
              {pagination.paginatedItems.map(r => {
                // Prefer subType (Installment / Rental / Booking) for
                // the badge; fall back to a generic label when the row
                // is missing a subType (shouldn't happen on new data
                // but keeps legacy rows renderable).
                const meta = r.subType ? collectionsApi.INCOME_TYPE_META[r.subType] : null;
                const label = meta?.label ?? (r.sourceType === 'plan' ? 'Plan' : 'Booking');
                const badge = meta?.badge ?? (r.sourceType === 'plan' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700');
                return (
                  <TableRow key={`${r.sourceType}-${r.id}`}>
                    <TableCell className="text-sm tabular-nums whitespace-nowrap">
                      {/* v-collections-datetime — single-row date + time.
                          Renders `yyyy-MM-dd HH:mm` when paidAt is
                          present; falls back to the accounting date
                          alone for legacy rows. */}
                      {formatDate(r.date)}
                      {r.paidAt && (
                        <span className="ml-2 text-xs text-gray-500">{fmtDate(parseISO(r.paidAt), 'HH:mm')}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {/* Prefix the raw code with a Plan # / Booking #
                          label so operators can tell what they're
                          looking at without cross-referencing the
                          Source column. */}
                      {r.referenceNo ? (
                        <>
                          <span className="text-gray-500 mr-1">
                            {r.sourceType === 'plan' ? 'Plan #' : 'Booking #'}
                          </span>
                          <span className="font-mono text-gray-800">{r.referenceNo}</span>
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.customerName ?? <span className="text-gray-400">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge className={badge}>{label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-gray-700 capitalize">
                      {r.method ?? <span className="text-gray-400">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-gray-600 max-w-xs">
                      {r.note ? (
                        <div className="line-clamp-2 whitespace-pre-wrap" title={r.note}>{r.note}</div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-emerald-700">
                      ${formatMoney(r.amount)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && filtered.length > 0 && (
                <TableRow className="bg-gray-50/70 font-semibold">
                  <TableCell colSpan={6} className="text-right text-xs uppercase tracking-wide text-gray-500">
                    Filtered total ({filtered.length} row{filtered.length === 1 ? '' : 's'})
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700 text-lg">
                    ${formatMoney(filteredSum)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </ListTable>
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            onPageChange={pagination.goToPage}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            totalItems={pagination.totalItems}
          />
        </CardContent>
      </Card>
    </div>
  );
}
