import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import {
  LayoutDashboard, Briefcase, Calendar, AlertTriangle,
  Users, ClipboardCheck, RefreshCw, ArrowRight,
} from 'lucide-react';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import * as casesApi from '../../../api/agencyCases';
import * as taxApi from '../../../api/agencyTax';
import type { CaseDto } from '../../../api/agencyCases';
import type { CalendarEntry } from '../../../api/agencyTax';
import { PageTitleTooltip } from './PageTitleTooltip';

/**
 * v-agency-fe-5 — agency dashboard landing page.
 *
 * <p>Aggregates the three most-actionable numbers the agency needs
 * at a glance:</p>
 *
 * <ul>
 *   <li><b>Portfolio</b> — how many client Companies + their scopes</li>
 *   <li><b>Open cases</b> — total across portfolio, split by priority
 *       so blocking cases jump out</li>
 *   <li><b>Tax obligations</b> — overdue + due-soon counts across all
 *       clients (only meaningful when a client is picked)</li>
 * </ul>
 *
 * <p>All data pulled from live BE endpoints (no mocks). Refreshes
 * every ~60s (background poll) so the KPIs stay live without the
 * operator hitting a button.</p>
 */
export function AgencyDashboardPage() {
  const { portfolio, activeClient, activeClientId } = useAgencyClient();
  const [cases, setCases] = useState<CaseDto[]>([]);
  const [calendar, setCalendar] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Cases is fetched portfolio-wide (no clientTenantId) — the
      // agency-side endpoint scopes by the JWT's agencyId. Tax
      // calendar is client-scoped, so we skip it when no client is
      // picked.
      const [c, tax] = await Promise.all([
        casesApi.agency.list().catch(() => [] as CaseDto[]),
        activeClientId
          ? taxApi.agency.calendar(activeClientId).catch(() => [] as CalendarEntry[])
          : Promise.resolve([] as CalendarEntry[]),
      ]);
      setCases(c);
      setCalendar(tax);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [activeClientId]);

  useEffect(() => { void load(); }, [load]);

  // Background refresh every 60 s — the KPIs move on their own (new
  // cases arrive, deadlines pass), so a static number quickly gets
  // misleading. Bail on interval when the tab is backgrounded to
  // save the API.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const tick = () => { if (!document.hidden) void load(); };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const caseKpis = useMemo(() => {
    let open = 0, pending = 0, blocking = 0;
    for (const c of cases) {
      if (c.status === 'closed') continue;
      open++;
      if (c.status === 'pending_client' || c.status === 'pending_agency') pending++;
      if (c.priority === 'blocking' || c.priority === 'high') blocking++;
    }
    return { open, pending, blocking };
  }, [cases]);

  const taxKpis = useMemo(() => {
    let overdue = 0, dueSoon = 0, filed = 0;
    for (const e of calendar) {
      if (e.status === 'overdue') overdue++;
      else if (e.status === 'due') dueSoon++;
      else if (e.status === 'filed') filed++;
    }
    return { overdue, dueSoon, filed };
  }, [calendar]);

  const recentCases = useMemo(() => {
    return [...cases]
      .filter(c => c.status !== 'closed')
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 5);
  }, [cases]);

  const upcomingDeadlines = useMemo(() => {
    return [...calendar]
      .filter(e => e.status === 'due' || e.status === 'overdue')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);
  }, [calendar]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-blue-600" />
            Agency dashboard
            <PageTitleTooltip label="About Agency dashboard">
              {activeClient
                ? <>Live view for <b>{activeClient.tenantName ?? activeClient.tenantSlug}</b>. Refreshes every minute.</>
                : <>Portfolio overview across {portfolio.length} client{portfolio.length === 1 ? '' : 's'}. Pick a client to see tax-calendar counts here.</>}
            </PageTitleTooltip>
          </h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Top row — 3 KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiTile
          icon={<Users className="h-5 w-5 text-blue-600" />}
          label="Clients"
          value={portfolio.length}
          hint={`${portfolio.filter(c => c.isPrimary).length} primary`}
        />
        <KpiTile
          icon={<Briefcase className="h-5 w-5 text-amber-600" />}
          label="Open cases"
          value={caseKpis.open}
          hint={caseKpis.blocking > 0 ? `${caseKpis.blocking} high/blocking` : `${caseKpis.pending} pending reply`}
          tone={caseKpis.blocking > 0 ? 'warn' : 'default'}
        />
        <KpiTile
          icon={<AlertTriangle className="h-5 w-5 text-rose-600" />}
          label="Overdue filings"
          value={activeClientId ? taxKpis.overdue : null}
          hint={
            !activeClientId ? 'Pick a client'
              : taxKpis.overdue > 0 ? `${taxKpis.dueSoon} due this week`
              : `${taxKpis.dueSoon} due this week`
          }
          tone={taxKpis.overdue > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* Second row — two lists side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm">Recent open cases</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            {recentCases.length === 0 ? (
              <p className="text-sm text-gray-500 py-3 text-center">No open cases across your portfolio.</p>
            ) : (
              <ul className="divide-y">
                {recentCases.map(c => (
                  <li key={c.id} className="py-2 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.title}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {c.tenantName ?? c.tenantSlug ?? '—'} · {c.relatedDocType} · {c.status.replace('_', ' ')}
                      </div>
                    </div>
                    <PriorityBadge priority={c.priority} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm">
              Upcoming / overdue filings
              {activeClient && (
                <span className="text-xs text-gray-500 font-normal ml-2">
                  ({activeClient.tenantName ?? activeClient.tenantSlug})
                </span>
              )}
            </CardTitle>
            <Calendar className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            {!activeClientId ? (
              <p className="text-sm text-gray-500 py-3 text-center">
                Pick a client on the Portfolio page to see their tax deadlines.
              </p>
            ) : upcomingDeadlines.length === 0 ? (
              <p className="text-sm text-gray-500 py-3 text-center">
                Nothing overdue or due this week.
              </p>
            ) : (
              <ul className="divide-y">
                {upcomingDeadlines.map(e => (
                  <li key={`${e.obligationCode}|${e.period}`} className="py-2 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{e.obligationName}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Period {e.period} · due {e.dueDate}
                      </div>
                    </div>
                    <Badge className={`border text-[10px] px-1.5 py-0 ${
                      e.status === 'overdue'
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}>
                      {e.status === 'overdue'
                        ? (e.daysUntilDue != null ? `${-e.daysUntilDue}d late` : 'overdue')
                        : (e.daysUntilDue != null ? `${e.daysUntilDue}d` : 'due')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick nav hint */}
      <div className="text-center text-xs text-gray-400 pt-2">
        <span>Use the sidebar to open Tasks, Journals, Tax Declarations, or Settings</span>
        <ArrowRight className="inline h-3 w-3 ml-1" />
      </div>
    </div>
  );
}

/* -------------------- tile helper -------------------- */

function KpiTile({ icon, label, value, hint, tone }: {
  icon: React.ReactNode; label: string; value: number | null; hint?: string;
  tone?: 'default' | 'warn' | 'danger';
}) {
  const bg =
    tone === 'danger' ? 'bg-rose-50/50 border-rose-200'
    : tone === 'warn' ? 'bg-amber-50/40 border-amber-200'
    : 'bg-white border-gray-200';
  return (
    <Card className={bg}>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {icon}
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {value == null ? '—' : value}
        </div>
        {hint && <div className="text-[11px] text-gray-500 mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls =
    priority === 'blocking' ? 'border-rose-200 bg-rose-50 text-rose-700'
    : priority === 'high'    ? 'border-orange-200 bg-orange-50 text-orange-700'
    : priority === 'low'     ? 'border-slate-200 bg-slate-50 text-slate-700'
    :                          'border-gray-200 bg-gray-50 text-gray-700';
  return <Badge className={`border ${cls} text-[10px] px-1.5 py-0`}>{priority}</Badge>;
}
