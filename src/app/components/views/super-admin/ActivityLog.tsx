import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import {
  ListTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  AlertCircle, AlertTriangle, CheckCircle, Info, Search,
  Download, Bell, Eye, ListChecks,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { usePagination } from '../../../hooks/usePagination';
import { Pagination } from '../../common/Pagination';
import { StatCard } from '../../common/StatCard';
import { TableBodySkeletonRows } from '../../common/LoadingSkeletons';
import { ListEmpty, ListError } from '../../common/ListStates';
import { useDateFormat } from '../../../context/DateFormatContext';
import { TONE_CLASS } from '../../../utils/statusTones';
import { exportListToExcel } from '../../../utils/excelExport';
import { mockCompanies } from '../../../data/platformData';
import {
  ActivityEvent, EventCategory, Severity, buildActivityLog,
} from './activityLogData';
import { USE_MOCKS } from '../../../api/client';
import * as platformApi from '../../../api/platform';

// Adapter: map a live PlatformAuditEntry to the page's ActivityEvent shape so
// the existing JSX, filters and severity tabs keep working without churn.
function toActivityEvent(
  e: platformApi.PlatformAuditEntry,
  tenantNameById: Map<string, string>,
): ActivityEvent {
  const action = e.action ?? '';
  const lc = action.toLowerCase();
  const category: EventCategory =
      lc.includes('sync') || lc.includes('local.connect') ? 'sync'
    : lc.includes('login') || lc.includes('auth')      ? 'auth'
    : lc.includes('policy')                            ? 'policy'
    : lc.includes('backup') || lc.includes('system')   ? 'system'
    : lc.includes('tenant') || lc.includes('company')  ? 'tenant'
                                                       : 'admin';
  const severity: Severity =
      lc.includes('fail') || lc.includes('error')      ? 'error'
    : lc.includes('warn') || lc.includes('expired')
      || lc.includes('drift') || lc.includes('mismatch') ? 'warning'
                                                       : 'info';
  return {
    id: e.id,
    at: e.createdAt,
    severity,
    category,
    action,
    actor: e.actorEmail ?? e.actorUserId ?? 'system',
    target: e.targetId ?? e.targetType ?? '—',
    tenantId: e.tenantId ?? undefined,
    tenantName: e.tenantId ? tenantNameById.get(e.tenantId) : undefined,
    message: e.payload ? JSON.stringify(e.payload) : undefined,
    acknowledged: !!e.acknowledgedAt,
    ipAddress: e.ipAddress ?? undefined,
  };
}

// Count badges on the severity tabs — shared status palette.
const SEVERITIES: { key: 'all' | Severity; label: string; cls: string }[] = [
  { key: 'all',     label: 'All',     cls: TONE_CLASS.neutral },
  { key: 'error',   label: 'Errors',  cls: TONE_CLASS.danger },
  { key: 'warning', label: 'Warnings',cls: TONE_CLASS.attention },
  { key: 'info',    label: 'Info',    cls: TONE_CLASS.info },
];

const CATEGORIES: { key: 'all' | EventCategory; label: string }[] = [
  { key: 'all', label: 'Category : All' },
  { key: 'sync', label: 'Category : Sync' },
  { key: 'auth', label: 'Category : Auth' },
  { key: 'admin', label: 'Category : Admin' },
  { key: 'tenant', label: 'Category : Tenant' },
  { key: 'policy', label: 'Category : Policy' },
  { key: 'system', label: 'Category : System' },
];

const FILTER_SELECT_CLS =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0';

const SEVERITY_ICON: Record<Severity, React.ComponentType<{ className?: string }>> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
};
const SEVERITY_TONE: Record<Severity, string> = {
  info: 'text-blue-600',
  warning: 'text-amber-600',
  error: 'text-red-600',
};

export function ActivityLog() {
  const { formatDateTime } = useDateFormat();
  const [events, setEvents] = useState<ActivityEvent[]>(
    USE_MOCKS ? buildActivityLog() : [],
  );
  const [tenantOptions, setTenantOptions] = useState<{ id: string; name: string }[]>(
    USE_MOCKS ? mockCompanies.map(c => ({ id: c.id, name: c.name })) : [],
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [severityTab, setSeverityTab] = useState<'all' | Severity>('all');
  const [category, setCategory] = useState<'all' | EventCategory>('all');
  const [tenant, setTenant] = useState<string>('all');
  const [onlyUnack, setOnlyUnack] = useState(false);
  const [detail, setDetail] = useState<ActivityEvent | null>(null);

  // Tenant name index used by the audit-entry adapter.
  const tenantNameById = useMemo(
    () => new Map(tenantOptions.map(t => [t.id, t.name])),
    [tenantOptions],
  );

  // Load events from the platform API. Re-runs whenever a server-side filter
  // changes (tenant + onlyUnack); search/severity/category are still applied
  // in-memory below so the existing UX stays snappy.
  const loadEvents = async () => {
    if (USE_MOCKS) {
      setEvents(buildActivityLog());
      return;
    }
    setLoading(true);
    try {
      const list = await platformApi.activity.list({
        tenantId: tenant !== 'all' ? tenant : undefined,
        unacked: onlyUnack || undefined,
      });
      setEvents(list.map(e => toActivityEvent(e, tenantNameById)));
      setLoadError(null);
    } catch (err: unknown) {
      // Keep the previous events in place, but say the refresh failed
      // instead of letting a failed first load read as "no events".
      setLoadError(err instanceof Error ? err.message : 'Could not load platform events.');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch — tenants for the dropdown + first events page.
  useEffect(() => {
    if (USE_MOCKS) return;
    let cancelled = false;
    (async () => {
      try {
        const ts = await platformApi.tenants.list();
        if (cancelled) return;
        setTenantOptions(ts.map(t => ({ id: t.id, name: t.name })));
      } catch { /* fall back to whatever is already in state */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-load whenever the server-side filters change.
  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, onlyUnack, tenantNameById]);

  const counts = useMemo(() => ({
    all:     events.length,
    error:   events.filter(e => e.severity === 'error').length,
    warning: events.filter(e => e.severity === 'warning').length,
    info:    events.filter(e => e.severity === 'info').length,
    unack:   events.filter(e => !e.acknowledged).length,
    syncErrors: events.filter(e => e.category === 'sync' && e.severity === 'error').length,
  }), [events]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter(e => {
      if (severityTab !== 'all' && e.severity !== severityTab) return false;
      if (category !== 'all' && e.category !== category) return false;
      if (tenant !== 'all' && e.tenantId !== tenant) return false;
      if (onlyUnack && e.acknowledged) return false;
      if (q) {
        const hay = `${e.action} ${e.actor} ${e.target} ${e.message ?? ''} ${e.tenantName ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, search, severityTab, category, tenant, onlyUnack]);

  const pager = usePagination(filtered, 15);

  const hasFilters =
    !!search.trim() || severityTab !== 'all' || category !== 'all' || tenant !== 'all' || onlyUnack;

  const clearFilters = () => {
    setSearch('');
    setSeverityTab('all');
    setCategory('all');
    setTenant('all');
    setOnlyUnack(false);
  };

  const handleAcknowledge = async (ev: ActivityEvent) => {
    if (USE_MOCKS) {
      setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, acknowledged: true } : e));
      toast.success('Event acknowledged');
      return;
    }
    try {
      await platformApi.activity.acknowledge(ev.id);
      toast.success('Event acknowledged');
      await loadEvents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Acknowledge failed';
      toast.error(msg);
    }
  };
  const handleAcknowledgeAllVisible = async () => {
    const ids = filtered.filter(e => !e.acknowledged).map(e => e.id);
    if (ids.length === 0) {
      toast.info('Nothing to acknowledge');
      return;
    }
    if (USE_MOCKS) {
      const set = new Set(ids);
      setEvents(prev => prev.map(e => set.has(e.id) ? { ...e, acknowledged: true } : e));
      toast.success(`Acknowledged ${ids.length} event${ids.length !== 1 ? 's' : ''}`);
      return;
    }
    try {
      await Promise.all(ids.map(id => platformApi.activity.acknowledge(id)));
      toast.success(`Acknowledged ${ids.length} event${ids.length !== 1 ? 's' : ''}`);
      await loadEvents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Acknowledge failed';
      toast.error(msg);
    }
  };
  // Real export of exactly the rows the filters currently show. (The old
  // button only toasted "Exported …" without producing a file.) The per-event
  // "Retry sync" button was removed for the same reason: there is no
  // platform API to re-queue an install's sync push.
  const handleExport = () => {
    exportListToExcel<ActivityEvent>({
      filename: 'platform-activity',
      sheetName: 'Activity',
      rows: filtered,
      columns: [
        { header: 'When', value: e => formatDateTime(e.at), width: 20 },
        { header: 'Severity', value: e => e.severity },
        { header: 'Category', value: e => e.category },
        { header: 'Event', value: e => e.action, width: 32 },
        { header: 'Tenant', value: e => e.tenantName ?? '' , width: 24 },
        { header: 'Actor', value: e => e.actor, width: 28 },
        { header: 'Target', value: e => e.target, width: 24 },
        { header: 'IP', value: e => e.ipAddress ?? '', width: 16 },
        { header: 'Acknowledged', value: e => (e.acknowledged ? 'Yes' : 'No') },
        { header: 'Message', value: e => e.message ?? '', width: 60 },
      ],
    });
  };

  return (
    <div className="space-y-6">
      {/* Top-level stats */}
      <div className="stat-strip stat-cols-4">
        <StatCard label="Sync errors" value={counts.syncErrors} icon={AlertCircle} tone="red" />
        <StatCard label="Warnings" value={counts.warning} icon={AlertTriangle} tone="amber" />
        <StatCard label="Unacknowledged" value={counts.unack} icon={Bell} tone="blue" />
        <StatCard label="Total events" value={counts.all} icon={ListChecks} tone="purple" />
      </div>

      {/* Table card */}
      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>Platform Events</CardTitle>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleAcknowledgeAllVisible} disabled={counts.unack === 0}>
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                Acknowledge all
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export Excel
              </Button>
            </div>
          </div>

          <Tabs value={severityTab} onValueChange={(v) => setSeverityTab(v as typeof severityTab)}>
            <TabsList>
              {SEVERITIES.map(s => (
                <TabsTrigger key={s.key} value={s.key}>
                  {s.label}
                  <Badge variant="outline" className={`ml-1.5 h-5 px-1.5 text-[10px] ${s.cls}`}>
                    {s.key === 'all' ? counts.all : counts[s.key]}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="filter-strip">
            <div className="relative shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search action, actor, target, message…"
                className="h-9 pl-7 w-64 text-sm"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              className={FILTER_SELECT_CLS}
              aria-label="Filter by category"
            >
              {CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <select
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              className={FILTER_SELECT_CLS}
              aria-label="Filter by tenant"
            >
              <option value="all">Tenant : All</option>
              {tenantOptions.map(c => (
                <option key={c.id} value={c.id}>Tenant : {c.name}</option>
              ))}
            </select>
            <select
              value={onlyUnack ? 'unack' : 'all'}
              onChange={(e) => setOnlyUnack(e.target.value === 'unack')}
              className={FILTER_SELECT_CLS}
              aria-label="Filter by acknowledgement"
            >
              <option value="all">Acknowledged : All</option>
              <option value="unack">Acknowledged : No</option>
            </select>
            {hasFilters && (
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
                <TableHead className="w-[60px]">Severity</TableHead>
                <TableHead className="w-[160px]">When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead className="w-[130px]">IP</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && events.length === 0 ? (
                <TableBodySkeletonRows rows={6} columns={7} />
              ) : loadError && events.length === 0 ? (
                <ListError message={loadError} onRetry={() => { void loadEvents(); }} colSpan={7} />
              ) : pager.paginatedItems.length === 0 ? (
                <ListEmpty noun="events" filtered={hasFilters} colSpan={7} />
              ) : null}
              {pager.paginatedItems.map(ev => {
                const Icon = SEVERITY_ICON[ev.severity];
                const unack = !ev.acknowledged;
                return (
                  <TableRow
                    key={ev.id}
                    onClick={() => setDetail(ev)}
                    className={`hover:bg-gray-50 cursor-pointer ${ev.severity === 'error' ? 'bg-red-50/40' : ev.severity === 'warning' ? 'bg-amber-50/40' : ''}`}
                  >
                    <TableCell>
                      <Icon className={`h-4 w-4 ${SEVERITY_TONE[ev.severity]}`} />
                    </TableCell>
                    <TableCell className="text-xs">
                      <p>{formatDistanceToNow(new Date(ev.at), { addSuffix: true })}</p>
                      <p className="text-gray-400">{formatDateTime(ev.at)}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{ev.action}</p>
                        <Badge variant="outline" className="text-[10px] capitalize">{ev.category}</Badge>
                        {unack && <Badge variant="outline" className={`text-[10px] ${TONE_CLASS.info}`}>New</Badge>}
                      </div>
                      {ev.message && (
                        <p className={`text-xs truncate max-w-md ${ev.severity === 'error' ? 'text-red-700' : 'text-gray-500'}`} title={ev.message}>
                          {ev.message}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {ev.tenantName ?? <span className="text-gray-400">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-gray-600 truncate max-w-[160px]" title={ev.actor}>
                      {ev.actor}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-gray-600">
                      {ev.ipAddress ?? <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setDetail(ev)}
                          title="Details"
                          aria-label="Details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {unack && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-700 hover:bg-green-50"
                            onClick={() => handleAcknowledge(ev)}
                            title="Acknowledge"
                            aria-label="Acknowledge"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </ListTable>
          <Pagination
            currentPage={pager.currentPage}
            totalPages={pager.totalPages}
            onPageChange={pager.goToPage}
            startIndex={pager.startIndex}
            endIndex={pager.endIndex}
            totalItems={pager.totalItems}
          />
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail && (() => { const I = SEVERITY_ICON[detail.severity]; return <I className={`h-5 w-5 ${SEVERITY_TONE[detail.severity]}`} />; })()}
              {detail?.action}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-3 gap-y-2">
                <dt className="text-gray-500">When</dt>
                <dd className="col-span-2">{formatDateTime(detail.at)}</dd>
                <dt className="text-gray-500">Severity</dt>
                <dd className="col-span-2 capitalize">{detail.severity}</dd>
                <dt className="text-gray-500">Category</dt>
                <dd className="col-span-2 capitalize">{detail.category}</dd>
                <dt className="text-gray-500">Actor</dt>
                <dd className="col-span-2 tabular-nums text-xs">{detail.actor}</dd>
                <dt className="text-gray-500">Target</dt>
                <dd className="col-span-2">{detail.target}</dd>
                {detail.tenantName && (
                  <>
                    <dt className="text-gray-500">Tenant</dt>
                    <dd className="col-span-2">{detail.tenantName}</dd>
                  </>
                )}
                {detail.installId && (
                  <>
                    <dt className="text-gray-500">Install</dt>
                    <dd className="col-span-2 tabular-nums text-xs">{detail.installId}</dd>
                  </>
                )}
              </dl>
              {detail.message && (
                <div className="rounded-md bg-gray-50 border p-3 text-xs tabular-nums whitespace-pre-wrap">
                  {detail.message}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
            {detail && !detail.acknowledged && (
              <Button onClick={() => { handleAcknowledge(detail); setDetail(null); }}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Acknowledge
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
