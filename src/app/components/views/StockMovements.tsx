import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  ListTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { DateInput } from '../common/DateInput';
import { TableBodySkeletonRows } from '../common/LoadingSkeletons';
import * as movementsApi from '../../api/stockMovements';
import { History, RefreshCw, Info, Search } from 'lucide-react';
import { Label } from '../ui/label';
import { ListEmpty, ListError } from '../common/ListStates';
import { useDateFormat } from '../../context/DateFormatContext';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import { useI18n } from '../../i18n/I18nContext';

const TYPE_FILTERS: { value: '' | movementsApi.StockMovement['type']; label: string }[] = [
  { value: '',           label: 'All' },
  { value: 'IN',         label: 'IN' },
  { value: 'OUT',        label: 'OUT' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
  { value: 'TRANSFER',   label: 'Transfer' },
];

/**
 * Stock → Movement. Read-only history of every quantity change.
 * Rows land here as a side-effect of Invoice / Bill / Adjustment
 * saves — never typed by hand, so the audit story stays intact.
 */
export function StockMovements() {
  const { t } = useI18n();
  const [rows, setRows] = useState<movementsApi.StockMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'' | movementsApi.StockMovement['type']>('');
  // v-movement-search — keyword filter applied client-side over the
  // already-loaded rows so typing feels instant (no per-keystroke API
  // roundtrip). Matches itemName / referenceNo / note case-insensitively.
  const [search, setSearch] = useState('');
  // v-movement-default-range — Movement rows accumulate quickly (every
  // invoice, bill, adjustment, and receive-stock adds one), so an
  // unbounded landing view scrolls forever. Default to the current
  // calendar month so the page opens on something usable; the operator
  // can clear or widen the range with the Clear button or by picking
  // a From date.
  const monthStart = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  })();
  const todayIso = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(todayIso);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { formatDateTime } = useDateFormat();

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await movementsApi.list({
        type: typeFilter || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        size: 200,
      });
      setRows(res.content ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load movements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [typeFilter, dateFrom, dateTo]);

  // One Clear for every filter — search, type and the date range.
  const clearFilters = () => { setSearch(''); setTypeFilter(''); setDateFrom(''); setDateTo(''); };
  const hasFilter = !!(search || typeFilter || dateFrom || dateTo);

  // v-movement-search — narrow the loaded set by the search box
  // before paginating. Case-insensitive substring match across the
  // three human-readable columns; typing "invoice" finds every row
  // whose reference is an invoice number, "adjust" finds notes that
  // mention adjustments, and item name works for the common case.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(m =>
      (m.itemName    ?? '').toLowerCase().includes(q)
      || (m.referenceNo ?? '').toLowerCase().includes(q)
      || (m.note        ?? '').toLowerCase().includes(q)
    );
  }, [rows, search]);
  // v-pagesize-15 — match the Items page (v-items-pagesize-15). One
  // page-size across every list surface keeps the fold position and
  // scroll rhythm consistent across the app.
  const pagination = usePagination(filtered, 15);

  const typeBadge = (tpe: movementsApi.StockMovement['type']) => {
    switch (tpe) {
      case 'IN':         return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">IN</Badge>;
      case 'OUT':        return <Badge className="bg-rose-100 text-rose-700 border-rose-200">OUT</Badge>;
      case 'ADJUSTMENT': return <Badge className="bg-amber-100 text-amber-700 border-amber-200">ADJ</Badge>;
      case 'TRANSFER':   return <Badge className="bg-blue-100 text-blue-700 border-blue-200">XFER</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            {t('nav.stock.movement') || 'Stock Movement'}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                    aria-label="What is Stock Movement?"
                  >
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Append-only history of every IN / OUT / ADJUSTMENT / TRANSFER.
                  Rows are written automatically by Invoice / Bill / Adjustment
                  saves — this page is read-only.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-blue-600" />
            History
          </CardTitle>
          <div className="filter-strip">
            {/* v-movement-search — keyword input at the head of the
                filter strip, same visual weight the other list-pages
                use. Client-side substring match over itemName /
                referenceNo / note (see filtered useMemo). Width caps
                at 220 px so the range / type controls to the right
                stay reachable on a narrow viewport. */}
            <div className="relative shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="Search item, reference, note…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 pl-7 w-64 text-sm"
                aria-label="Search movements"
              />
            </div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Filter by type"
            >
              {TYPE_FILTERS.map(f => (
                <option key={f.value} value={f.value}>Type : {f.label}</option>
              ))}
            </select>
            {/* DateInput renders a popover trigger button (not a native
                <input>), so there's no id to hang a <label htmlFor> off. */}
            <Label className="text-xs text-gray-500 shrink-0">From</Label>
            <div className="shrink-0"><DateInput value={dateFrom || null} onChange={v => setDateFrom(v ?? '')} max={dateTo || undefined} /></div>
            <Label className="text-xs text-gray-500 shrink-0">To</Label>
            <div className="shrink-0"><DateInput value={dateTo || null} onChange={v => setDateTo(v ?? '')} min={dateFrom || undefined} /></div>
            {hasFilter && (
              <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        {/* Default CardContent padding — matches the Items page so
            the leftmost column doesn't butt against the card edge. */}
        <CardContent>
          <ListTable>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Date</TableHead>
                <TableHead className="w-[120px]">Reference</TableHead>
                <TableHead className="w-[90px] text-center">Type</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="w-[140px]">Warehouse</TableHead>
                <TableHead className="text-right w-[100px]">Quantity</TableHead>
                <TableHead className="text-right w-[100px]">Balance</TableHead>
                <TableHead className="w-[140px]">User</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Header stays mounted so column meaning is clear even
                  on the loading / empty paths. Match the Announcement
                  pattern. */}
              {loading && rows.length === 0 && (
                <TableBodySkeletonRows rows={6} columns={8} />
              )}
              {!loading && loadError && rows.length === 0 && (
                <ListError message={loadError} onRetry={() => void load()} colSpan={8} />
              )}
              {!loading && filtered.length === 0 && rows.length > 0 && (
                <ListEmpty noun="movements" filtered colSpan={8} />
              )}
              {!loading && !loadError && rows.length === 0 && (
                hasFilter
                  ? <ListEmpty noun="movements" filtered colSpan={8} />
                  : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-gray-500 py-8">
                    No movements yet. Save an Invoice or an Adjustment to record one.
                  </TableCell>
                </TableRow>
                  )
              )}
              {pagination.paginatedItems.map(m => {
                    const signed = Number(m.quantity ?? 0);
                    const isOut = signed < 0;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs text-gray-600 tabular-nums">
                          {formatDateTime(m.createdAt)}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {m.referenceNo || <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className="text-center">{typeBadge(m.type)}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{m.itemName || '—'}</div>
                          {m.itemSku && (
                            <div className="text-[11px] text-gray-500 tabular-nums">{m.itemSku}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-gray-700">
                          {m.warehouseName || <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${isOut ? 'text-rose-700' : 'text-emerald-700'} font-medium`}>
                          {signed > 0 ? '+' : ''}
                          {signed.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(m.balanceAfter ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-xs text-gray-700 truncate max-w-[140px]">
                          {m.createdByName || <span className="text-gray-300">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </ListTable>
          {/* p-0 Card body — pagination gets its own chrome row. */}
          {rows.length > 0 && (
            <div className="px-4 py-3 border-t">
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
    </div>
  );
}
