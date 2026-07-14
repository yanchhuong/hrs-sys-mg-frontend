import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Loader2, Plus, RefreshCw, Search, Briefcase } from 'lucide-react';
import * as casesApi from '../../../api/agencyCases';
import type { CaseDto, CasePriority, CaseStatus } from '../../../api/agencyCases';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import { CaseDetailDialog } from './CaseDetailDialog';
import { NewCaseDialog } from './NewCaseDialog';

const STATUS_TABS: Array<{ key: 'all' | 'open' | 'pending' | 'closed'; label: string }> = [
  { key: 'all',     label: 'All' },
  { key: 'open',    label: 'Open' },
  { key: 'pending', label: 'Pending' },
  { key: 'closed',  label: 'Closed' },
];

const STATUS_CLS: Record<CaseStatus, string> = {
  open:            'bg-blue-100 text-blue-700 border-blue-200',
  pending_client:  'bg-amber-100 text-amber-700 border-amber-200',
  pending_agency:  'bg-violet-100 text-violet-700 border-violet-200',
  escalated:       'bg-rose-100 text-rose-700 border-rose-200',
  closed:          'bg-gray-100 text-gray-600 border-gray-200',
};

const PRIORITY_CLS: Record<CasePriority, string> = {
  low:      'bg-slate-50 text-slate-700 border-slate-200',
  normal:   'bg-gray-100 text-gray-700 border-gray-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  blocking: 'bg-rose-100 text-rose-700 border-rose-200',
};

/**
 * v-agency-fe-2 — agency case inbox.
 *
 * Lists every case the agency has open across the current client
 * (or the whole portfolio if no client is picked). Filters on
 * status tab + free-text search. Clicking a row opens the shared
 * {@link CaseDetailDialog}; "New case" opens {@link NewCaseDialog}.
 */
export function AgencyCasesPage() {
  const { activeClient, activeClientId, portfolio } = useAgencyClient();
  const [rows, setRows] = useState<CaseDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'all' | 'open' | 'pending' | 'closed'>('open');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await casesApi.agency.list(activeClientId ?? undefined);
      setRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  }, [activeClientId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      // status tab
      if (tab === 'open'    && r.status !== 'open' && r.status !== 'escalated') return false;
      if (tab === 'pending' && r.status !== 'pending_client' && r.status !== 'pending_agency') return false;
      if (tab === 'closed'  && r.status !== 'closed') return false;
      // search
      if (q && !r.title.toLowerCase().includes(q)
           && !(r.tenantName ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, search]);

  const counts = useMemo(() => ({
    all:     rows.length,
    open:    rows.filter(r => r.status === 'open' || r.status === 'escalated').length,
    pending: rows.filter(r => r.status === 'pending_client' || r.status === 'pending_agency').length,
    closed:  rows.filter(r => r.status === 'closed').length,
  }), [rows]);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-blue-600" />
            Cases
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeClient
              ? `${rows.length} case${rows.length === 1 ? '' : 's'} on ${activeClient.tenantName ?? activeClient.tenantSlug}`
              : `${rows.length} case${rows.length === 1 ? '' : 's'} across ${portfolio.length} client${portfolio.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setNewOpen(true)}
            disabled={!activeClientId}
            title={activeClientId ? undefined : 'Pick a client on the Portfolio page first'}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New case
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_TABS.map(t => (
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
                placeholder="Search cases…"
                className="pl-8 h-9 w-64 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500 inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading cases…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              No cases match this filter.
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
                        <span className="text-sm font-medium text-gray-900 truncate">{r.title}</span>
                        <Badge className={`border ${STATUS_CLS[r.status]} text-[10px] px-1.5 py-0`}>
                          {r.status.replace('_', ' ')}
                        </Badge>
                        <Badge className={`border ${PRIORITY_CLS[r.priority]} text-[10px] px-1.5 py-0`}>
                          {r.priority}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {r.tenantName ?? r.tenantSlug ?? '—'}
                        {' · '}
                        {r.relatedDocType}
                        {' · '}
                        opened {new Date(r.createdAt).toLocaleString()}
                        {r.openedByName && ` by ${r.openedByName}`}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CaseDetailDialog
        open={!!detailId}
        onOpenChange={o => { if (!o) setDetailId(null); }}
        caseId={detailId}
        side="agency"
        onChanged={() => void load()}
      />

      {activeClientId && (
        <NewCaseDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          clientTenantId={activeClientId}
          clientName={activeClient?.tenantName ?? null}
          onCreated={() => void load()}
        />
      )}
    </div>
  );
}
