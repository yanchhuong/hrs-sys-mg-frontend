import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { FileSpreadsheet, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import * as declApi from '../../../api/agencyTaxDecl';
import type { TaxDeclStatus, TaxDeclarationDto } from '../../../api/agencyTaxDecl';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import { NewTaxDeclarationDialog } from './NewTaxDeclarationDialog';
import { TaxDeclarationDetailDialog } from './TaxDeclarationDetailDialog';

type Tab = 'all' | 'draft' | 'prepared' | 'reviewed' | 'approved' | 'submitted' | 'accepted';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'all',       label: 'All' },
  { key: 'draft',     label: 'Draft' },
  { key: 'prepared',  label: 'Prepared' },
  { key: 'reviewed',  label: 'Reviewed' },
  { key: 'approved',  label: 'Approved' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'accepted',  label: 'Accepted' },
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

/**
 * v-agency-fe-9 — agency-side tax declaration pipeline. Layered
 * on top of the Tax Calendar (V225): each declaration targets one
 * (obligation, period) tuple; reaching status='submitted' auto-
 * updates that tuple in tax_filings so the calendar shows filed.
 */
export function AgencyTaxDeclarationsPage() {
  const { activeClient, activeClientId, portfolio } = useAgencyClient();
  const [rows, setRows] = useState<TaxDeclarationDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
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
      if (tab !== 'all' && r.status !== tab) return false;
      if (q && !r.obligationName.toLowerCase().includes(q)
           && !r.period.toLowerCase().includes(q)
           && !(r.tenantName ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, search]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = {
      all: rows.length, draft: 0, prepared: 0, reviewed: 0, approved: 0, submitted: 0, accepted: 0,
    };
    for (const r of rows) if (r.status !== 'rejected') c[r.status as Tab] += 1;
    return c;
  }, [rows]);

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
            Draft → prepared → reviewed → approved → submitted → accepted. Four-eyes
            on every sign-off; submit-to-GDT auto-marks the Tax Calendar.
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

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-3 h-8 rounded-md border text-xs font-medium transition ${
                  tab === t.key
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                {t.label}
                <span className="ml-1 text-[10px] opacity-70">({counts[t.key]})</span>
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
              No declarations match this filter.
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
                        <span className="text-xs text-gray-500 tabular-nums">{r.period}</span>
                        <Badge className={`border ${STATUS_CLS[r.status]} text-[10px] px-1.5 py-0`}>
                          {r.status}
                        </Badge>
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
        onCreated={() => void load()}
      />
    </div>
  );
}
