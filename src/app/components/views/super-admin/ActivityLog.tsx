import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  AlertCircle, AlertTriangle, CheckCircle, Info, Search, RefreshCw,
  Filter, Download, X as XIcon, Bell,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { usePagination } from '../../../hooks/usePagination';
import { Pagination } from '../../common/Pagination';
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

const SEVERITIES: { key: 'all' | Severity; label: string; cls: string }[] = [
  { key: 'all',     label: 'All',     cls: 'bg-gray-100 text-gray-700' },
  { key: 'error',   label: 'Errors',  cls: 'bg-red-100 text-red-800' },
  { key: 'warning', label: 'Warnings',cls: 'bg-amber-100 text-amber-900' },
  { key: 'info',    label: 'Info',    cls: 'bg-blue-100 text-blue-800' },
];

const CATEGORIES: { key: 'all' | EventCategory; label: string }[] = [
  { key: 'all', label: 'All categories' },
  { key: 'sync', label: 'Sync' },
  { key: 'auth', label: 'Auth' },
  { key: 'admin', label: 'Admin' },
  { key: 'tenant', label: 'Tenant' },
  { key: 'policy', label: 'Policy' },
  { key: 'system', label: 'System' },
];

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
  const [events, setEvents] = useState<ActivityEvent[]>(
    USE_MOCKS ? buildActivityLog() : [],
  );
  const [tenantOptions, setTenantOptions] = useState<{ id: string; name: string }[]>(
    USE_MOCKS ? mockCompanies.map(c => ({ id: c.id, name: c.name })) : [],
  );
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
    try {
      const list = await platformApi.activity.list({
        tenantId: tenant !== 'all' ? tenant : undefined,
        unacked: onlyUnack || undefined,
      });
      setEvents(list.map(e => toActivityEvent(e, tenantNameById)));
    } catch { /* leave previous events in place */ }
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

  const activeFilters = [
    category !== 'all' && `category: ${category}`,
    tenant !== 'all' && `tenant: ${tenantOptions.find(c => c.id === tenant)?.name ?? tenant}`,
    onlyUnack && 'unacknowledged only',
  ].filter(Boolean);

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
  const handleRetry = (ev: ActivityEvent) => {
    toast.success(`Retrying sync for ${ev.actor}…`);
    // In real life this enqueues a /api/sync/push retry for that install.
  };
  const handleExport = () => {
    toast.success(`Exported ${filtered.length} events to CSV`);
  };

  return (
    <div className="space-y-6">
      {/* Top-level stats */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        <StatCard label="Sync errors" value={counts.syncErrors} icon={AlertCircle} tone="red" />
        <StatCard label="Warnings" value={counts.warning} icon={AlertTriangle} tone="amber" />
        <StatCard label="Unacknowledged" value={counts.unack} icon={Bell} tone="blue" />
        <StatCard label="Total events" value={counts.all} icon={CheckCircle} tone="gray" />
      </div>

      {/* Table card */}
      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>Platform Events</CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleAcknowledgeAllVisible} disabled={counts.unack === 0}>
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                Acknowledge all
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export CSV
              </Button>
            </div>
          </div>

          <Tabs value={severityTab} onValueChange={(v) => setSeverityTab(v as typeof severityTab)}>
            <TabsList>
              {SEVERITIES.map(s => (
                <TabsTrigger key={s.key} value={s.key}>
                  {s.label}
                  <Badge className={`ml-1.5 h-5 px-1.5 text-[10px] ${s.cls}`}>
                    {s.key === 'all' ? counts.all : counts[s.key]}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search action, actor, target, message…"
                className="pl-8 h-9"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              className="h-9 px-3 border rounded-md text-sm"
            >
              {CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <select
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              className="h-9 px-3 border rounded-md text-sm min-w-[180px]"
            >
              <option value="all">All tenants</option>
              {tenantOptions.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none px-2">
              <input
                type="checkbox"
                checked={onlyUnack}
                onChange={(e) => setOnlyUnack(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Unacknowledged only
            </label>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600">
              <Filter className="h-3.5 w-3.5" />
              {activeFilters.map((f, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">{f}</Badge>
              ))}
              <button onClick={clearFilters} className="text-blue-600 hover:underline inline-flex items-center gap-1">
                <XIcon className="h-3 w-3" />
                Clear
              </button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <Table>
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
              {pager.paginatedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-gray-400 py-10">
                    No events match these filters.
                  </TableCell>
                </TableRow>
              )}
              {pager.paginatedItems.map(ev => {
                const Icon = SEVERITY_ICON[ev.severity];
                const unack = !ev.acknowledged;
                return (
                  <TableRow
                    key={ev.id}
                    className={ev.severity === 'error' ? 'bg-red-50/40' : ev.severity === 'warning' ? 'bg-amber-50/40' : ''}
                  >
                    <TableCell>
                      <Icon className={`h-4 w-4 ${SEVERITY_TONE[ev.severity]}`} />
                    </TableCell>
                    <TableCell className="text-xs">
                      <p>{formatDistanceToNow(new Date(ev.at), { addSuffix: true })}</p>
                      <p className="text-gray-400">{format(new Date(ev.at), 'MMM dd, HH:mm')}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{ev.action}</p>
                        <Badge variant="outline" className="text-[10px] capitalize">{ev.category}</Badge>
                        {unack && <Badge className="bg-blue-100 text-blue-800 text-[10px]">New</Badge>}
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
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDetail(ev)}>
                          Details
                        </Button>
                        {ev.category === 'sync' && ev.severity === 'error' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-blue-700 hover:bg-blue-50"
                            onClick={() => handleRetry(ev)}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Retry
                          </Button>
                        )}
                        {unack && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-green-700 hover:bg-green-50"
                            onClick={() => handleAcknowledge(ev)}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Ack
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
                <dd className="col-span-2">{format(new Date(detail.at), 'MMM dd, yyyy HH:mm:ss')}</dd>
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
            {detail && detail.category === 'sync' && detail.severity === 'error' && (
              <Button variant="outline" onClick={() => { handleRetry(detail); setDetail(null); }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry sync
              </Button>
            )}
            {detail && !detail.acknowledged && (
              <Button variant="outline" onClick={() => { handleAcknowledge(detail); setDetail(null); }}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Acknowledge
              </Button>
            )}
            <Button onClick={() => setDetail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TONE: Record<string, string> = {
  red: 'text-red-700',
  amber: 'text-amber-700',
  blue: 'text-blue-700',
  gray: 'text-gray-700',
};
function StatCard({ label, value, icon: Icon, tone }: {
  label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone: keyof typeof TONE;
}) {
  return (
    <Card className="border-gray-200">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Icon className={`h-5 w-5 ${TONE[tone]}`} />
          <span className={`text-2xl font-bold ${TONE[tone]}`}>{value}</span>
        </div>
        <p className="text-xs font-medium text-gray-700 truncate">{label}</p>
      </CardContent>
    </Card>
  );
}
