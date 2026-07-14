import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { FileSpreadsheet, Loader2, Plus, RefreshCw, Search, Paperclip } from 'lucide-react';
import * as declApi from '../../../api/agencyTaxDecl';
import type { TaxDeclStatus, TaxDeclarationDto, TaxDeclCategory, TaxDeclFrequency } from '../../../api/agencyTaxDecl';
import { CATEGORY_LABELS, formatPeriodForDisplay } from '../../../api/agencyTaxDecl';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import { NewTaxDeclarationDialog } from './NewTaxDeclarationDialog';
import { TaxDeclarationDetailDialog } from './TaxDeclarationDetailDialog';

type FreqTab = 'monthly' | 'annual';
type CategoryFilter = 'all' | TaxDeclCategory;

const FREQ_TABS: Array<{ key: FreqTab; label: string; hint: string }> = [
  { key: 'monthly', label: 'Monthly', hint: 'MM-YYYY' },
  { key: 'annual',  label: 'Yearly',  hint: 'YYYY' },
];

const CATEGORY_FILTERS: Array<{ key: CategoryFilter; label: string }> = [
  { key: 'all',     label: 'All' },
  { key: 'income',  label: 'Income' },
  { key: 'expense', label: 'Expense' },
  { key: 'salary',  label: 'Salary' },
  { key: 'wht',     label: 'Withholding Tax' },
  { key: 'nssf',    label: 'NSSF' },
];

const STATUS_CLS: Record<TaxDeclStatus, string> = {
  draft:     'bg-slate-100 text-slate-700 border-slate-200',
  prepared:  'bg-blue-100 text-blue-700 border-blue-200',
  reviewed:  'bg-violet-100 text-violet-700 border-violet-200',
  approved:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  submitted: 'bg-teal-100 text-teal-700 border-teal-200',
  accepted:  'bg-lime-100 text-lime-700 border-lime-200',
  rejected:  'bg-rose-100 text-rose-700 border-rose-200',
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
  const [freq, setFreq] = useState<FreqTab>('monthly');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await declApi.agency.list(activeClientId ?? undefined);
      setRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load declarations');
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
      if (q && !r.obligationName.toLowerCase().includes(q)
           && !r.period.toLowerCase().includes(q)
           && !(r.tenantName ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, freq, category, search]);

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

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Tax Declarations
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeClient
              ? `Pipeline for ${activeClient.tenantName ?? activeClient.tenantSlug}. `
              : `Portfolio pipeline across ${portfolio.length} client${portfolio.length === 1 ? '' : 's'}. `}
            One declaration ↔ many Invoices / Bills / Expenses. Do the monthly
            filings first, and yearly aggregates fall out the bottom.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New declaration
          </Button>
        </div>
      </div>

      {/* Top-level Monthly / Yearly tabs. */}
      <div className="flex items-center gap-1 border-b">
        {FREQ_TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFreq(t.key)}
            className={`inline-flex items-center gap-1.5 px-3 h-9 text-sm border-b-2 -mb-px transition ${
              freq === t.key
                ? 'border-blue-500 text-blue-700 font-medium'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
            <span className="text-[10px] text-gray-400 tabular-nums">({t.hint})</span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {CATEGORY_FILTERS.map(f => (
              <button
                key={f.key}
                type="button"
                onClick={() => setCategory(f.key)}
                className={`px-3 h-8 rounded-md border text-xs font-medium transition ${
                  category === f.key
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                {f.label}
                <span className="ml-1 text-[10px] opacity-70">({categoryCounts[f.key]})</span>
              </button>
            ))}
            <div className="ml-auto relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search obligation / period / client…"
                className="pl-8 h-9 w-72 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500 inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              No {freq === 'monthly' ? 'monthly' : 'yearly'} declarations match this filter.
              {category === 'all'
                ? ' Click New declaration to start one.'
                : ` Try another category or switch to ${freq === 'monthly' ? 'Yearly' : 'Monthly'}.`}
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map(r => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setDetailId(r.id)}
                    className="w-full text-left py-3 px-1 hover:bg-gray-50 flex items-start gap-3"
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
                        <Badge className={`border ${STATUS_CLS[r.status]} text-[10px] px-1.5 py-0`}>
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
                        <span className="tabular-nums">{r.amountOwed} {r.currency}</span>
                        {r.preparerName && <span>Prepared by {r.preparerName}</span>}
                        {r.submittedAt && <span>Submitted {new Date(r.submittedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
