import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Plus, RefreshCw, Search, Paperclip } from 'lucide-react';
import { Label } from '../../ui/label';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import * as declApi from '../../../api/agencyTaxDecl';
import type { TaxDeclStatus, TaxDeclarationDto, TaxDeclCategory, TaxDeclFrequency } from '../../../api/agencyTaxDecl';
import { CATEGORY_LABELS, formatPeriodForDisplay } from '../../../api/agencyTaxDecl';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import { NewTaxDeclarationDialog } from './NewTaxDeclarationDialog';
import { TaxDeclarationDetailDialog } from './TaxDeclarationDetailDialog';
import { PageTitleTooltip } from './PageTitleTooltip';
import { inRange } from '../../common/DateRangeFilter';
import { DateInput } from '../../common/DateInput';
import { TableRowsSkeleton } from '../../common/LoadingSkeletons';
import { ListEmpty, ListError } from '../../common/ListStates';
import { Pagination } from '../../common/Pagination';
import { usePagination } from '../../../hooks/usePagination';
import { formatMoneyForCurrency } from '../../../utils/format';
import { statusBadgeClass } from '../../../utils/statusTones';
import { useDateFormat } from '../../../context/DateFormatContext';

type FreqTab = 'monthly' | 'annual';
type CategoryFilter = 'all' | TaxDeclCategory;
type StatusFilter = 'all' | TaxDeclStatus;

const FREQ_TABS: Array<{ key: FreqTab; label: string; hint: string }> = [
  { key: 'monthly', label: 'Monthly', hint: 'MM-YYYY' },
  { key: 'annual',  label: 'Yearly',  hint: 'YYYY' },
];

const CATEGORY_FILTERS: Array<{ key: CategoryFilter; label: string }> = [
  { key: 'all',     label: 'All categories' },
  { key: 'income',  label: 'Income' },
  { key: 'expense', label: 'Expense' },
  { key: 'salary',  label: 'Salary' },
  { key: 'wht',     label: 'Withholding Tax' },
  { key: 'nssf',    label: 'NSSF' },
];

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all',       label: 'All statuses' },
  { key: 'draft',     label: 'Draft' },
  { key: 'prepared',  label: 'Prepared' },
  { key: 'reviewed',  label: 'Reviewed' },
  { key: 'approved',  label: 'Approved' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'accepted',  label: 'Accepted' },
  { key: 'rejected',  label: 'Rejected' },
];

// App-wide palette (utils/statusTones). Draft slate; prepared / submitted
// wait on someone (amber); reviewed is moving (blue); approved / accepted
// green; rejected red.
const STATUS_CLS: Record<TaxDeclStatus, string> = {
  draft:     statusBadgeClass('draft'),
  prepared:  statusBadgeClass('prepared'),
  reviewed:  statusBadgeClass('in_progress'),
  approved:  statusBadgeClass('approved'),
  submitted: statusBadgeClass('submitted'),
  accepted:  statusBadgeClass('accepted'),
  rejected:  statusBadgeClass('rejected'),
};

const CATEGORY_CLS: Record<TaxDeclCategory, string> = {
  income:  'bg-blue-50 text-blue-700 border-blue-200',
  expense: 'bg-orange-50 text-orange-700 border-orange-200',
  salary:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  wht:     'bg-purple-50 text-purple-700 border-purple-200',
  nssf:    'bg-amber-50 text-amber-700 border-amber-200',
};

/**
 * v-agency-fe-9 + v-tax-decl-category-and-docs — agency-side tax
 * declaration pipeline. Two top tabs (Monthly / Yearly), five
 * category chips within each. Monthly periods display as MM-YYYY,
 * yearly as YYYY. Every declaration can attach source Invoices /
 * Bills / Expenses (one Declaration → many docs).
 */
export function AgencyTaxDeclarationsPage() {
  const { activeClient, activeClientId, portfolio } = useAgencyClient();
  const [rows, setRows] = useState<TaxDeclarationDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { formatDate } = useDateFormat();
  const [freq, setFreq] = useState<FreqTab>('monthly');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo,   setDateTo]   = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await declApi.agency.list(activeClientId ?? undefined);
      setRows(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load declarations');
    } finally {
      setLoading(false);
    }
  }, [activeClientId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      // Frequency tab — fall back to inferring from period length
      // when the server hydrated frequency is missing (defensive).
      const rowFreq: TaxDeclFrequency | null = r.frequency
        ?? (r.period && r.period.length === 4 ? 'annual'
            : r.period && r.period.length === 7 ? 'monthly'
            : null);
      if (freq !== rowFreq) return false;
      if (category !== 'all' && r.category !== category) return false;
      if (status !== 'all' && r.status !== status) return false;
      // Date-range filter — falls back to createdAt so declarations
      // still show up in "This month" etc. regardless of workflow
      // status. (Submitted-at date range would exclude drafts.)
      if ((dateFrom || dateTo) && !inRange(r.createdAt, dateFrom, dateTo)) return false;
      if (q && !r.obligationName.toLowerCase().includes(q)
           && !r.period.toLowerCase().includes(q)
           && !(r.tenantName ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, freq, category, status, search, dateFrom, dateTo]);

  // Count per category within the active frequency tab so the
  // chips are actionable — you see zeros before clicking.
  const categoryCounts = useMemo(() => {
    const c: Record<CategoryFilter, number> = { all: 0, income: 0, expense: 0, salary: 0, wht: 0, nssf: 0 };
    for (const r of rows) {
      const rowFreq: TaxDeclFrequency | null = r.frequency
        ?? (r.period && r.period.length === 4 ? 'annual'
            : r.period && r.period.length === 7 ? 'monthly'
            : null);
      if (freq !== rowFreq) continue;
      c.all += 1;
      c[r.category] += 1;
    }
    return c;
  }, [rows, freq]);

  const hasFilters = !!(search.trim() || category !== 'all' || status !== 'all' || dateFrom || dateTo);
  const clearFilters = () => {
    setSearch(''); setCategory('all'); setStatus('all'); setDateFrom(null); setDateTo(null);
  };
  const pager = usePagination(filtered, 25);
  useEffect(() => {
    pager.goToPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, status, dateFrom, dateTo, freq, activeClientId]);

  return (
    <div className="space-y-4">
      <div className="page-header-strip">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          Tax Declarations
          <PageTitleTooltip label="About Tax Declarations">
            {activeClient
              ? <>Pipeline for <b>{activeClient.tenantName ?? activeClient.tenantSlug}</b>. </>
              : <>Portfolio pipeline across {portfolio.length} client{portfolio.length === 1 ? '' : 's'}. </>}
            One declaration ↔ many Invoices / Bills / Expenses. Do the monthly
            filings first, and yearly aggregates fall out the bottom.
          </PageTitleTooltip>
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New declaration
          </Button>
        </div>
      </div>

      {/* Top-level Monthly / Yearly tabs. */}
      <Tabs value={freq} onValueChange={v => setFreq(v as FreqTab)}>
        <TabsList>
          {FREQ_TABS.map(t => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              <span className="text-[10px] text-gray-400 tabular-nums">({t.hint})</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-3">
          <div className="filter-strip">
            <div className="relative shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search obligation / period / client…"
                className="h-9 pl-7 w-64 text-sm"
              />
            </div>
            {/* Category counts stay inline so the operator sees which
                category has rows for the frequency tab. */}
            <select
              value={category}
              onChange={e => setCategory(e.target.value as CategoryFilter)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Filter by category"
            >
              {CATEGORY_FILTERS.map(f => (
                <option key={f.key} value={f.key}>
                  Category : {f.key === 'all' ? 'All' : f.label} ({categoryCounts[f.key]})
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as StatusFilter)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Filter by status"
            >
              {STATUS_FILTERS.map(f => (
                <option key={f.key} value={f.key}>Status : {f.key === 'all' ? 'All' : f.label}</option>
              ))}
            </select>
            <Label className="text-xs text-gray-500 shrink-0">From</Label>
            <div className="shrink-0"><DateInput value={dateFrom} onChange={setDateFrom} max={dateTo || undefined} /></div>
            <Label className="text-xs text-gray-500 shrink-0">To</Label>
            <div className="shrink-0"><DateInput value={dateTo} onChange={setDateTo} min={dateFrom || undefined} /></div>
            {hasFilters && (
              <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <TableRowsSkeleton rows={6} columns={6} />
          ) : loadError && rows.length === 0 ? (
            <ListError message={loadError} onRetry={() => void load()} />
          ) : filtered.length === 0 ? (
            <ListEmpty noun={`${freq === 'monthly' ? 'monthly' : 'yearly'} declarations`} filtered={hasFilters}>
              <p className="text-xs text-gray-400 mt-1">
                {category === 'all'
                  ? 'Click New declaration to start one.'
                  : `Try another category or switch to ${freq === 'monthly' ? 'Yearly' : 'Monthly'}.`}
              </p>
            </ListEmpty>
          ) : (<>
            <ul className="divide-y">
              {pager.paginatedItems.map(r => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setDetailId(r.id)}
                    className="w-full text-left py-3 px-1 hover:bg-gray-50 cursor-pointer flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {r.obligationName}
                        </span>
                        <span className="text-xs text-gray-500 tabular-nums font-medium">
                          {formatPeriodForDisplay(r.period)}
                        </span>
                        <Badge className={`border ${CATEGORY_CLS[r.category]} text-[10px] px-1.5 py-0`}>
                          {CATEGORY_LABELS[r.category]}
                        </Badge>
                        <Badge variant="outline" className={`${STATUS_CLS[r.status]} capitalize text-[10px] px-1.5 py-0`}>
                          {r.status}
                        </Badge>
                        {r.linkedDocs.length > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 inline-flex items-center gap-1">
                            <Paperclip className="h-2.5 w-2.5" />
                            {r.linkedDocs.length} doc{r.linkedDocs.length === 1 ? '' : 's'}
                          </Badge>
                        )}
                        {r.gdtReferenceNo && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            GDT: {r.gdtReferenceNo}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-3">
                        {r.tenantName && <span>{r.tenantName}</span>}
                        <span className="tabular-nums">{r.currency} {formatMoneyForCurrency(Number(r.amountOwed ?? 0), r.currency)}</span>
                        {r.preparerName && <span>Prepared by {r.preparerName}</span>}
                        {r.submittedAt && <span>Submitted {formatDate(r.submittedAt)}</span>}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t">
              <Pagination
                currentPage={pager.currentPage}
                totalPages={pager.totalPages}
                onPageChange={pager.goToPage}
                startIndex={pager.startIndex}
                endIndex={pager.endIndex}
                totalItems={pager.totalItems}
              />
            </div>
          </>)}
        </CardContent>
      </Card>

      <TaxDeclarationDetailDialog
        open={!!detailId}
        onOpenChange={o => { if (!o) setDetailId(null); }}
        declarationId={detailId}
        onChanged={() => void load()}
      />

      <NewTaxDeclarationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        defaultTenantId={activeClientId}
        defaultFrequency={freq}
        onCreated={() => void load()}
      />
    </div>
  );
}
