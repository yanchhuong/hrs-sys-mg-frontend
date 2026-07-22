import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { DateInput } from '../common/DateInput';
import * as txApi from '../../api/transactions';
import * as currencyApi from '../../api/currencySettings';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, Info, RefreshCw, Wallet } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useDateFormat } from '../../context/DateFormatContext';
import { useI18n } from '../../i18n/I18nContext';
import { toast } from 'sonner';

const REF_TYPE_OPTIONS: { value: '' | NonNullable<txApi.ListParams['refType']>; label: string }[] = [
  { value: '',         label: 'All sources' },
  { value: 'invoice',  label: 'Invoice payments' },
  { value: 'bill',     label: 'Bill payments' },
  { value: 'receipt',  label: 'Expense payments' },
];

const DIRECTION_OPTIONS: { value: '' | NonNullable<txApi.ListParams['direction']>; label: string }[] = [
  { value: '',    label: 'All' },
  { value: 'in',  label: 'Incomes' },
  { value: 'out', label: 'Expenses' },
];

/** Map the snake-case category key the backend writes ('customer_payment',
 *  'supplier_payment', etc.) to a human label for the table. Unknown
 *  values fall through to a Title-Case'd version of the key. */
function categoryLabel(c: string): string {
  switch (c) {
    case 'customer_payment':             return 'Customer payment';
    case 'supplier_payment':             return 'Supplier payment';
    case 'refund':                       return 'Customer refund';
    case 'vendor_refund':                return 'Vendor refund';
    case 'cash_advance_disbursement':    return 'Disbursement';
    case 'cash_advance_refund':          return 'Refund (employee returns)';
    case 'cash_advance_reimbursement':   return 'Reimbursement (company pays)';
    default:                             return c.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  }
}

/**
 * Cash Flow → Transactions. Authoritative ledger backed by the
 * {@code cash_transactions} table (V156). One row per source-side
 * payment — Invoice / Bill / Receipt.
 */
export function Transactions() {
  const { formatDate } = useDateFormat();
  const { t } = useI18n();
  const [rows, setRows] = useState<txApi.Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [refTypeFilter, setRefTypeFilter] = useState<'' | NonNullable<txApi.ListParams['refType']>>('');
  const [dirFilter, setDirFilter] = useState<'' | NonNullable<txApi.ListParams['direction']>>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  /** Currency tab — '' (all) or one of the tenant's enabled codes.
   *  Applied client-side against the already-loaded {@link rows} so
   *  switching tabs is instant (no re-fetch). The server doesn't
   *  currency-filter. */
  const [currencyFilter, setCurrencyFilter] = useState<string>('');
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  useEffect(() => {
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, []);
  const enabledCurrencies = currencyApi.enabledCurrencies(currencySettings);

  const load = async () => {
    setLoading(true);
    try {
      const res = await txApi.list({
        refType: refTypeFilter || undefined,
        direction: dirFilter || undefined,
        from: from || undefined,
        to: to || undefined,
        size: 500,
      });
      setRows(res.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [refTypeFilter, dirFilter, from, to]);

  /** Rows after the currency tab is applied — what the table actually
   *  renders. Pagination + footer totals both derive from this so
   *  switching tabs updates both in lock-step. */
  const visibleRows = useMemo(
    () => currencyFilter ? rows.filter(r => r.currency === currencyFilter) : rows,
    [rows, currencyFilter],
  );

  /** A row belongs UNDER a disbursement parent when it shares the
   *  parent's advance id AND isn't the disbursement itself. This
   *  covers BOTH receipt/bill spends (children that don't count in
   *  totals) AND the settlement refund/reimbursement (a real cash
   *  movement that DOES count). */
  const isAdvanceChild = (r: txApi.Transaction) =>
    !!r.parentAdvanceId && r.category !== 'cash_advance_disbursement';

  /** Narrower predicate used only for totals: skip child spends
   *  that are already implicit in the disbursement (receipt / bill
   *  funded by the advance). Settlement rows are NOT skipped —
   *  they're an independent real-money event (employee returns
   *  unused cash, or company reimburses extra). */
  const isChildSpend = (r: txApi.Transaction) =>
    !!r.parentAdvanceId && r.referenceType !== 'cash_advance';

  /** Per-currency totals — skip the receipt/bill children so we
   *  don't double-count cash that already left at disbursement. */
  const totals = useMemo(() => {
    const acc = new Map<string, { in: number; out: number }>();
    for (const r of visibleRows) {
      if (isChildSpend(r)) continue;
      const bucket = acc.get(r.currency) ?? { in: 0, out: 0 };
      if (r.direction === 'in') bucket.in += Number(r.amount) || 0;
      else bucket.out += Number(r.amount) || 0;
      acc.set(r.currency, bucket);
    }
    return Array.from(acc.entries()).map(([ccy, b]) => ({
      currency: ccy, in: b.in, out: b.out, net: b.in - b.out,
    }));
  }, [visibleRows]);

  /** Build a render plan: each advance gets its parent row first,
   *  then its child spends right after (when expanded). Rows that
   *  don't belong to any advance render at the top level in their
   *  original order. */
  const [expandedAdvances, setExpandedAdvances] = useState<Set<string>>(new Set());
  const renderPlan = useMemo(() => {
    // Which disbursement parents are actually present in the
    // filtered slice. When the operator filters by Direction=In,
    // the disbursement (OUT) row drops out, and we MUST render
    // its child refund (IN) at top level instead — otherwise it
    // disappears from the page entirely.
    const disbursementAdvanceIds = new Set<string>();
    for (const r of visibleRows) {
      if (r.parentAdvanceId
          && r.referenceType === 'cash_advance'
          && r.category === 'cash_advance_disbursement') {
        disbursementAdvanceIds.add(r.parentAdvanceId);
      }
    }

    // Group children ONLY under a disbursement that's currently
    // visible. Orphaned children (parent filtered out) render at
    // top level via the fall-through below.
    const childrenByAdvance = new Map<string, txApi.Transaction[]>();
    for (const r of visibleRows) {
      if (isAdvanceChild(r) && r.parentAdvanceId
          && disbursementAdvanceIds.has(r.parentAdvanceId)) {
        const arr = childrenByAdvance.get(r.parentAdvanceId) ?? [];
        arr.push(r);
        childrenByAdvance.set(r.parentAdvanceId, arr);
      }
    }
    // Walk the visible rows once. Skip any row that's already
    // attached as a child of a disbursement parent.
    const attached = new Set<string>();
    for (const arr of childrenByAdvance.values()) for (const c of arr) attached.add(c.id);

    const out: { row: txApi.Transaction; depth: number; childCount: number; advanceId: string | null }[] = [];
    for (const r of visibleRows) {
      if (attached.has(r.id)) continue;       // emitted later as a child
      const isDisbursement = r.referenceType === 'cash_advance'
        && r.category === 'cash_advance_disbursement';
      const advanceId = isDisbursement ? r.parentAdvanceId : null;
      const kids = advanceId ? (childrenByAdvance.get(advanceId) ?? []) : [];
      out.push({ row: r, depth: 0, childCount: kids.length, advanceId });
      if (advanceId && expandedAdvances.has(advanceId)) {
        for (const k of kids) out.push({ row: k, depth: 1, childCount: 0, advanceId });
      }
    }
    return out;
  }, [visibleRows, expandedAdvances]);

  const toggleAdvance = (advanceId: string) => {
    setExpandedAdvances(prev => {
      const next = new Set(prev);
      if (next.has(advanceId)) next.delete(advanceId); else next.add(advanceId);
      return next;
    });
  };

  const pagination = usePagination(renderPlan, 10);

  const sourceBadge = (refType: string | null) => {
    if (refType === 'invoice')           return <Badge className="bg-sky-100 text-sky-700 border-sky-200">Invoice</Badge>;
    if (refType === 'bill')              return <Badge className="bg-violet-100 text-violet-700 border-violet-200">Bill</Badge>;
    if (refType === 'receipt')           return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Expense</Badge>;
    if (refType === 'cash_advance')      return <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">Advance</Badge>;
    if (refType === 'internal_transfer') return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Transfer</Badge>;
    return <Badge variant="outline">—</Badge>;
  };

  const fmtMoney = (amt: number, ccy: string) => {
    const sym = currencyApi.currencySymbol(ccy);
    // KHR / KRW render without decimals; everything else uses 2dp.
    if (ccy === 'KHR' || ccy === 'KRW') {
      return `${sym} ${amt.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
    if (sym !== ccy) {
      return `${sym}${amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${ccy} ${amt.toLocaleString('en-US')}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Wallet className="h-7 w-7 text-slate-600" />
          {t('nav.cashflow.transactions')}
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                  aria-label="What are Transactions?"
                >
                  <Info className="h-4 w-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                Unified ledger of cash in (invoice payments) and cash out (bill + receipt payments).
                Read-only — edits live on the source pages.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </h1>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 flex-wrap">
          {/* Currency tabs replace the "Ledger" title — All + one
              tab per enabled currency from tenant settings. Single-
              currency tenants get just an "All" tab (no split rails
              to switch between). Filtering is client-side against
              the already-loaded rows so the switch is instant. */}
          {enabledCurrencies.length > 1 ? (
            <Tabs value={currencyFilter} onValueChange={setCurrencyFilter}>
              <TabsList>
                <TabsTrigger value="">All</TabsTrigger>
                {enabledCurrencies.map(c => (
                  <TabsTrigger key={c} value={c}>{c}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : <div />}
          {/* Inline filter strip — matches the Bills + StockMovements
              pattern: compact, right-aligned, no stacked labels. The
              Clear button appears only when at least one filter is
              active so the row stays tidy in the default view. */}
          <div className="filter-strip">
            <select
              value={refTypeFilter}
              onChange={e => setRefTypeFilter(e.target.value as typeof refTypeFilter)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Filter by source"
            >
              {REF_TYPE_OPTIONS.map(o => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={dirFilter}
              onChange={e => setDirFilter(e.target.value as typeof dirFilter)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Filter by direction"
            >
              {DIRECTION_OPTIONS.map(o => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
            </select>
            <Label className="text-xs text-gray-500">From</Label>
            <DateInput value={from || null} onChange={v => setFrom(v ?? '')} max={to || undefined} />
            <Label className="text-xs text-gray-500">To</Label>
            <DateInput value={to || null} onChange={v => setTo(v ?? '')} min={from || undefined} />
            {(from || to || refTypeFilter || dirFilter) && (
              <Button
                size="sm" variant="ghost"
                className="h-9"
                onClick={() => { setFrom(''); setTo(''); setRefTypeFilter(''); setDirFilter(''); }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Table scroller — {@code max-h} so the card shrinks to
              fit its content when rows are few (no whitespace below
              the footer), and engages inner scroll only when rows
              would overflow. Header + footer stay sticky inside this
              container. */}
          <div className="overflow-auto max-h-[calc(100vh-22rem)]">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
                <TableRow>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead className="w-[110px]">Source</TableHead>
                  <TableHead className="w-[140px]">Reference</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[160px]">Category</TableHead>
                  <TableHead className="w-[100px]">Method</TableHead>
                  <TableHead className="w-[160px]">Author</TableHead>
                  <TableHead className="w-[80px]">Currency</TableHead>
                  <TableHead className="text-right w-[160px]">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-gray-500 py-8">
                      {loading ? 'Loading…' : 'No transactions match these filters.'}
                    </TableCell>
                  </TableRow>
                ) : pagination.paginatedItems.map(entry => {
                  const r = entry.row;
                  const isChild = entry.depth > 0;
                  const isExpandable = !isChild && entry.childCount > 0 && !!entry.advanceId;
                  const isExpanded = isExpandable && expandedAdvances.has(entry.advanceId!);
                  return (
                  <TableRow
                    key={r.id}
                    className={`${isChild ? 'bg-slate-50/50' : ''} ${isExpandable ? 'cursor-pointer' : ''}`}
                    onClick={() => { if (isExpandable && entry.advanceId) toggleAdvance(entry.advanceId); }}
                  >
                    <TableCell className="text-xs">
                      {isExpandable && (
                        <span className="inline-flex items-center mr-1 text-gray-500">
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </span>
                      )}
                      {formatDate(r.date)}
                    </TableCell>
                    <TableCell>{sourceBadge(r.referenceType)}</TableCell>
                    <TableCell className="tabular-nums text-xs">
                      {isChild && <span className="text-gray-400 mr-1 ml-3">↳</span>}
                      {r.referenceNo ?? '—'}
                      {isExpandable && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">
                          {entry.childCount} item{entry.childCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="truncate max-w-[240px]" title={r.partyName ?? ''}>{r.partyName ?? '—'}</TableCell>
                    <TableCell className="text-xs text-gray-600">{categoryLabel(r.category)}</TableCell>
                    <TableCell className="text-xs uppercase text-gray-500">{r.paymentMethod?.replace(/_/g, ' ') ?? '—'}</TableCell>
                    <TableCell className="text-xs text-gray-600 truncate max-w-[160px]" title={r.createdByName ?? ''}>
                      {r.createdByName ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs uppercase text-gray-500">{r.currency}</TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${
                      isChildSpend(r)
                        ? 'text-gray-400 italic'
                        : (r.direction === 'in' ? 'text-emerald-700' : 'text-rose-700')
                    }`} title={isChildSpend(r) ? 'Funded from a Cash Advance — already counted at disbursement' : undefined}>
                      {r.direction === 'out' ? '− ' : ''}{fmtMoney(Number(r.amount), r.currency)}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
              {totals.length > 0 && (
                <TableFooter className="sticky bottom-0 bg-slate-50 z-10 shadow-[0_-1px_0_rgba(0,0,0,0.08)]">
                  {/* One footer row per currency — keeps the sum
                      column-aligned with the Amount column even when
                      multiple currencies appear in the filtered set. */}
                  {totals.map(t => (
                    <TableRow key={t.currency} className="bg-slate-50">
                      <TableCell colSpan={4} className="text-xs uppercase tracking-wide text-gray-500">
                        Total
                      </TableCell>
                      <TableCell className="text-xs text-emerald-700 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <ArrowDownLeft className="h-3 w-3" />
                          {fmtMoney(t.in, t.currency)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-rose-700 tabular-nums" colSpan={2}>
                        <span className="inline-flex items-center gap-1">
                          <ArrowUpRight className="h-3 w-3" />
                          {fmtMoney(t.out, t.currency)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs uppercase text-gray-500">{t.currency}</TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${t.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        Net: {fmtMoney(t.net, t.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableFooter>
              )}
            </Table>
          </div>

          {/* Match Bills + StockMovements: pagination lives in its
              own padded chrome row at the bottom of the card. */}
          {visibleRows.length > 0 && (
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
    </div>
  );
}
