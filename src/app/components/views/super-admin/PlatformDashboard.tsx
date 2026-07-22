import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import {
  Building2, UsersRound, DollarSign, Activity, AlertTriangle, CheckCircle,
  TrendingUp, HardDrive, Gauge, Eye, LogIn,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  mockCompanies, mockLocalInstalls, mockPlatformUsers, mockAuditTrail,
  PLAN_LIMITS, computeUsage, PlanTier,
  Company, LocalInstall as LegacyLocalInstall,
} from '../../../data/platformData';
import * as platformApi from '../../../api/platform';
import { USE_MOCKS } from '../../../api/client';
import { getMetricsSummary, PlatformMetricsSummary } from '../../../api/platformMetrics';

// Adapter: map a live PlatformTenant to the legacy Company shape so the JSX
// and computeUsage helper keep working without churn. Numeric fields not on
// the live shape default to 0; lastActiveAt falls back to createdAt.
function toLegacyCompany(t: platformApi.PlatformTenant): Company {
  const anyT = t as unknown as Partial<Company>;
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    contactEmail: t.contactEmail,
    contactPhone: t.contactPhone,
    country: t.country,
    planTier: t.planTier as PlanTier,
    status: t.status as Company['status'],
    userCount: anyT.userCount ?? 0,
    employeeCount: anyT.employeeCount ?? 0,
    storageMb: anyT.storageMb ?? 0,
    monthlyCostUsd: anyT.monthlyCostUsd ?? 0,
    createdAt: t.createdAt,
    lastActiveAt: anyT.lastActiveAt ?? t.createdAt,
    notes: t.notes,
  };
}

// Adapter: live LocalInstall has tenantId; legacy expects companyId. We only
// need the fields computeUsage and the sync-health stats touch.
function toLegacyInstall(i: platformApi.LocalInstall): LegacyLocalInstall {
  return {
    id: i.id,
    companyId: i.tenantId,
    siteName: i.siteName,
    apiKey: '',
    apiKeyLastFour: i.apiKeyLastFour,
    createdAt: i.createdAt,
    lastSyncAt: i.lastSyncAt ?? undefined,
    lastSyncStatus: (i.lastSyncStatus === 'ok' || i.lastSyncStatus === 'error')
      ? i.lastSyncStatus
      : undefined,
    lastSyncError: i.lastSyncError ?? undefined,
    syncHealth: i.syncHealth as LegacyLocalInstall['syncHealth'],
    agentVersion: i.agentVersion ?? '',
  };
}

export function PlatformDashboard() {
  const [companies, setCompanies] = useState<platformApi.PlatformTenant[]>(
    USE_MOCKS ? (mockCompanies as unknown as platformApi.PlatformTenant[]) : [],
  );
  const [installs, setInstalls] = useState<platformApi.LocalInstall[]>(
    USE_MOCKS ? (mockLocalInstalls as unknown as platformApi.LocalInstall[]) : [],
  );
  const [usersList, setUsersList] = useState<platformApi.PlatformUser[]>(
    USE_MOCKS ? (mockPlatformUsers as unknown as platformApi.PlatformUser[]) : [],
  );
  const [auditEvents, setAuditEvents] = useState<platformApi.PlatformAuditEntry[]>(
    USE_MOCKS ? (mockAuditTrail as unknown as platformApi.PlatformAuditEntry[]) : [],
  );
  const [metrics, setMetrics] = useState<PlatformMetricsSummary | null>(null);
  /** v-companies-live-plans — pull real plan prices so total MRR
   *  reflects SA edits in the Plans page rather than the hardcoded
   *  FE constant. */
  const [plansByTier, setPlansByTier] = useState<Record<string, platformApi.PlanLimits>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (USE_MOCKS) {
      // Mock fallback — initial state already seeded from the platformData
      // arrays cast to the API shape. Behaviour matches the pre-rewire view.
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [t, i, u, a, m, p] = await Promise.all([
          platformApi.tenants.list(),
          platformApi.installs.list(),
          platformApi.users.list(),
          platformApi.activity.list({ unacked: true }),
          getMetricsSummary().catch(() => null),
          platformApi.plans.list().catch(() => [] as platformApi.PlanLimits[]),
        ]);
        if (cancelled) return;
        setCompanies(t);
        setInstalls(i);
        setUsersList(u);
        setAuditEvents(a);
        setMetrics(m);
        const map: Record<string, platformApi.PlanLimits> = {};
        for (const row of p) map[row.planTier] = row;
        setPlansByTier(map);
      } catch { /* leave empty arrays */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const legacyCompanies = companies.map(toLegacyCompany);
    const legacyInstalls = installs.map(toLegacyInstall);
    const active = legacyCompanies.filter(c => c.status === 'active').length;
    const trial = legacyCompanies.filter(c => c.status === 'trial').length;
    const suspended = legacyCompanies.filter(c => c.status === 'suspended').length;
    const totalEmployees = legacyCompanies.reduce((s, c) => s + c.employeeCount, 0);
    // v-companies-live-plans — sum from the live BE plan prices so
    // SA edits in the Plans page flow through immediately. Falls back
    // to the FE PLAN_LIMITS constant when the tier isn't in the
    // fetched list (e.g. legacy tier not yet migrated).
    const priceOf = (tier: string): number => {
      const live = plansByTier[tier];
      if (live) return live.monthlyPriceCents / 100;
      return PLAN_LIMITS[tier as PlanTier]?.monthlyPriceUsd ?? 0;
    };
    const mrr = legacyCompanies
      .filter(c => c.status === 'active')
      .reduce((s, c) => s + priceOf(c.planTier), 0);
    const totalStorage = legacyCompanies.reduce((s, c) => s + c.storageMb, 0);
    const syncIssues = legacyInstalls.filter(l => l.syncHealth === 'degraded' || l.syncHealth === 'down').length;
    const never = legacyInstalls.filter(l => l.syncHealth === 'never').length;
    // Quota utilization
    const usageRows = legacyCompanies
      .filter(c => c.status !== 'cancelled')
      .map(c => ({ company: c, usage: computeUsage(c, legacyInstalls) }));
    const overQuotaCount = usageRows.filter(r => r.usage.storage.over || r.usage.employees.over || r.usage.installs.over).length;
    const totalStorageCap = usageRows.reduce((s, r) => s + r.usage.storage.cap, 0);
    const storagePct = totalStorageCap > 0 ? Math.round((totalStorage / totalStorageCap) * 100) : 0;
    // Industry-mix — count tenants by Business Base (V181 /
    // v-business-base-picker). Multi-base tenants (e.g. School + POS)
    // count under "Multi" only, not double-counted.
    const industryMix = { pos: 0, school: 0, hospital: 0, multi: 0, none: 0 };
    for (const t of companies) {
      const b = t.businessBases ?? [];
      if (b.length === 0) industryMix.none++;
      else if (b.length > 1) industryMix.multi++;
      else if (b[0] === 'pos') industryMix.pos++;
      else if (b[0] === 'school') industryMix.school++;
      else if (b[0] === 'hospital') industryMix.hospital++;
    }
    return { active, trial, suspended, totalEmployees, mrr, totalStorage, syncIssues, never, overQuotaCount, totalStorageCap, storagePct, usageRows, legacyCompanies, legacyInstalls, industryMix };
  }, [companies, installs, plansByTier]);

  // Plan tier breakdown
  const byPlan = useMemo(() => {
    const map: Record<string, number> = {};
    stats.legacyCompanies.forEach(c => { if (c.status !== 'cancelled') map[c.planTier] = (map[c.planTier] ?? 0) + 1; });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [stats.legacyCompanies]);

  return (
    <div className="space-y-6">
      {/* Headline stats */}
      <div className="stat-strip stat-cols-4">
        <StatCard
          label="Active Companies"
          value={stats.active}
          hint={`${stats.trial} trial · ${stats.suspended} suspended`}
          icon={Building2}
          tone="blue"
        />
        <StatCard
          label="Total Employees"
          value={stats.totalEmployees.toLocaleString()}
          hint={`${usersList.length} user accounts`}
          icon={UsersRound}
          tone="purple"
        />
        <StatCard
          label="Monthly Revenue"
          value={`$${stats.mrr.toLocaleString()}`}
          hint="Active paid tenants"
          icon={DollarSign}
          tone="green"
        />
        <StatCard
          label="Sync Issues"
          value={stats.syncIssues}
          hint={`${installs.length - stats.never} installs online`}
          icon={stats.syncIssues > 0 ? AlertTriangle : CheckCircle}
          tone={stats.syncIssues > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Industry mix — one tile per Business Base + a Multi tile for
          tenants running >1 Base. V181 / v-business-base-picker. */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-2">Industry Mix</div>
        <div className="stat-strip stat-cols-4">
          <StatCard
            label="POS"
            value={stats.industryMix.pos}
            hint="Retail / POS tenants"
            icon={Building2}
            tone="blue"
          />
          <StatCard
            label="School"
            value={stats.industryMix.school}
            hint="Education tenants"
            icon={Building2}
            tone="purple"
          />
          <StatCard
            label="Hospital"
            value={stats.industryMix.hospital}
            hint="Healthcare tenants"
            icon={Building2}
            tone="green"
          />
          <StatCard
            label="Multi-industry"
            value={stats.industryMix.multi}
            hint={`${stats.industryMix.none} with no Base`}
            icon={Building2}
            tone="purple"
          />
        </div>
      </div>

      {/* Engagement metrics — anonymous landing-page views + admin@demo.com logins.
          Backed by GET /platform/metrics (totals + today + 30-day daily series). */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 stat-strip stat-cols-4">
          <StatCard
            label="Landing Views"
            value={(metrics?.landingViewsTotal ?? 0).toLocaleString()}
            hint="All-time"
            icon={Eye}
            tone="blue"
          />
          <StatCard
            label="Views Today"
            value={(metrics?.landingViewsToday ?? 0).toLocaleString()}
            hint="UTC day so far"
            icon={Eye}
            tone="purple"
          />
          <StatCard
            label="Demo Logins"
            value={(metrics?.demoLoginsTotal ?? 0).toLocaleString()}
            hint="admin@demo.com"
            icon={LogIn}
            tone="green"
          />
          <StatCard
            label="Demo Today"
            value={(metrics?.demoLoginsToday ?? 0).toLocaleString()}
            hint="UTC day so far"
            icon={LogIn}
            tone="blue"
          />
        </div>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              30-Day Engagement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DailySeriesBars
              label="Landing Views"
              colorClass="bg-blue-500"
              series={metrics?.landingViewsDaily ?? []}
            />
            <div className="h-3" />
            <DailySeriesBars
              label="Demo Logins"
              colorClass="bg-green-500"
              series={metrics?.demoLoginsDaily ?? []}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plan breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              By Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {byPlan.map(([plan, count]) => {
              const pct = (count / byPlan.reduce((s, [, c]) => s + c, 0)) * 100;
              const colors: Record<string, string> = {
                free: 'bg-gray-400',
                starter: 'bg-blue-500',
                business: 'bg-indigo-500',
                enterprise: 'bg-amber-500',
              };
              return (
                <div key={plan}>
                  <div className="flex items-center justify-between mb-1 text-sm">
                    <span className="capitalize">{plan}</span>
                    <span className="text-gray-500">{count} tenant{count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${colors[plan] ?? 'bg-gray-400'} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Plan quota utilization */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Plan Quota
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2 mb-1">
              <div className="text-3xl font-bold">{stats.storagePct}%</div>
              <span className="text-xs text-gray-500">of {(stats.totalStorageCap / 1024).toFixed(0)} GB</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {(stats.totalStorage / 1024).toFixed(1)} GB used across active tenants
            </p>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
              <div
                className={`h-full rounded-full ${stats.storagePct >= 90 ? 'bg-red-500' : stats.storagePct >= 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.min(100, stats.storagePct)}%` }}
              />
            </div>
            {stats.overQuotaCount > 0 ? (
              <div className="flex items-start gap-2 p-2.5 rounded-md bg-red-50 border border-red-200">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div className="text-xs text-red-800">
                  <p className="font-medium">{stats.overQuotaCount} tenant{stats.overQuotaCount !== 1 ? 's' : ''} over quota</p>
                  <p>Upgrade their plan or writes stay blocked.</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-green-700 flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" />
                All tenants within plan limits
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent audit */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {auditEvents.slice(0, 5).map(a => {
                // Live entries expose targetType/targetId + createdAt; the
                // legacy mock shape uses target + at — accept either.
                const legacy = a as unknown as { target?: string; at?: string };
                const targetLabel = legacy.target
                  ?? [a.targetType, a.targetId].filter(Boolean).join(' ')
                  ?? '';
                const ts = legacy.at ?? a.createdAt;
                return (
                  <li key={a.id} className="text-xs">
                    <p className="font-medium">{a.action}</p>
                    <p className="text-gray-500 truncate">
                      {targetLabel} · {ts ? format(new Date(ts), 'MMM dd, HH:mm') : '—'}
                    </p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Tenants snapshot table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Tenants</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead>Last Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.legacyCompanies.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm">{c.country}</TableCell>
                  <TableCell className="capitalize text-sm">{c.planTier}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-right text-sm">{c.employeeCount}</TableCell>
                  <TableCell className="text-right text-sm">
                    {(() => {
                      const live = plansByTier[c.planTier];
                      const mrr = live
                        ? live.monthlyPriceCents / 100
                        : (PLAN_LIMITS[c.planTier as PlanTier]?.monthlyPriceUsd ?? 0);
                      return mrr > 0 ? `$${mrr.toLocaleString()}` : '—';
                    })()}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {c.lastActiveAt ? format(new Date(c.lastActiveAt), 'MMM dd, HH:mm') : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

const TONES: Record<string, { bg: string; text: string }> = {
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-700' },
  green:  { bg: 'bg-green-50',  text: 'text-green-700' },
  red:    { bg: 'bg-red-50',    text: 'text-red-700' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700' },
};

function StatCard({ label, value, hint, icon: Icon, tone }: {
  label: string; value: string | number; hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className={`p-2 rounded-lg ${t.bg}`}>
            <Icon className={`h-4 w-4 ${t.text}`} />
          </div>
          <span className={`text-2xl font-bold ${t.text}`}>{value}</span>
        </div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{hint}</p>
      </CardContent>
    </Card>
  );
}

/** Inline 30-day bar series. No chart lib — relative bar heights scaled to
 *  the local max so a quiet week still reads, and a zero-count day renders as
 *  a 1px floor so the time axis is visually continuous. */
function DailySeriesBars({ label, colorClass, series }: {
  label: string;
  colorClass: string;
  series: { day: string; count: number }[];
}) {
  const total = series.reduce((s, p) => s + p.count, 0);
  const max = series.reduce((m, p) => Math.max(m, p.count), 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="text-gray-500">{total.toLocaleString()} in 30d</span>
      </div>
      <div className="flex items-end gap-0.5 h-12">
        {series.length === 0 ? (
          <p className="text-xs text-gray-400 self-center">No data yet</p>
        ) : series.map(p => {
          const h = max > 0 ? Math.max(2, Math.round((p.count / max) * 100)) : 2;
          return (
            <div
              key={p.day}
              title={`${p.day}: ${p.count}`}
              className={`flex-1 ${p.count > 0 ? colorClass : 'bg-gray-200'} rounded-sm`}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:    'bg-green-100 text-green-800',
    trial:     'bg-blue-100 text-blue-800',
    suspended: 'bg-amber-100 text-amber-900',
    cancelled: 'bg-gray-100 text-gray-700',
  };
  return <Badge className={map[status] ?? 'bg-gray-100 text-gray-800'}>{status}</Badge>;
}
