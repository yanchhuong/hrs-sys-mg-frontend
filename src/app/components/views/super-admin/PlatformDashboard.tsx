import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import {
  Building2, UsersRound, DollarSign, Activity, AlertTriangle, CheckCircle,
  TrendingUp, HardDrive, Gauge,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  mockCompanies, mockLocalInstalls, mockPlatformUsers, mockAuditTrail,
  PLAN_LIMITS, computeUsage, PlanTier,
} from '../../../data/platformData';

export function PlatformDashboard() {
  const stats = useMemo(() => {
    const active = mockCompanies.filter(c => c.status === 'active').length;
    const trial = mockCompanies.filter(c => c.status === 'trial').length;
    const suspended = mockCompanies.filter(c => c.status === 'suspended').length;
    const totalEmployees = mockCompanies.reduce((s, c) => s + c.employeeCount, 0);
    const mrr = mockCompanies.filter(c => c.status === 'active').reduce((s, c) => s + c.monthlyCostUsd, 0);
    const totalStorage = mockCompanies.reduce((s, c) => s + c.storageMb, 0);
    const syncIssues = mockLocalInstalls.filter(l => l.syncHealth === 'degraded' || l.syncHealth === 'down').length;
    const never = mockLocalInstalls.filter(l => l.syncHealth === 'never').length;
    // Quota utilization
    const usageRows = mockCompanies
      .filter(c => c.status !== 'cancelled')
      .map(c => ({ company: c, usage: computeUsage(c, mockLocalInstalls) }));
    const overQuotaCount = usageRows.filter(r => r.usage.storage.over || r.usage.employees.over || r.usage.installs.over).length;
    const totalStorageCap = usageRows.reduce((s, r) => s + r.usage.storage.cap, 0);
    const storagePct = totalStorageCap > 0 ? Math.round((totalStorage / totalStorageCap) * 100) : 0;
    return { active, trial, suspended, totalEmployees, mrr, totalStorage, syncIssues, never, overQuotaCount, totalStorageCap, storagePct, usageRows };
  }, []);

  // Plan tier breakdown
  const byPlan = useMemo(() => {
    const map: Record<string, number> = {};
    mockCompanies.forEach(c => { if (c.status !== 'cancelled') map[c.planTier] = (map[c.planTier] ?? 0) + 1; });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, []);

  return (
    <div className="space-y-6">
      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
          hint={`${mockPlatformUsers.length} user accounts`}
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
          hint={`${mockLocalInstalls.length - stats.never} installs online`}
          icon={stats.syncIssues > 0 ? AlertTriangle : CheckCircle}
          tone={stats.syncIssues > 0 ? 'red' : 'green'}
        />
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
              {mockAuditTrail.slice(0, 5).map(a => (
                <li key={a.id} className="text-xs">
                  <p className="font-medium">{a.action}</p>
                  <p className="text-gray-500 truncate">
                    {a.target} · {format(new Date(a.at), 'MMM dd, HH:mm')}
                  </p>
                </li>
              ))}
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
              {mockCompanies.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm">{c.country}</TableCell>
                  <TableCell className="capitalize text-sm">{c.planTier}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-right text-sm">{c.employeeCount}</TableCell>
                  <TableCell className="text-right text-sm">
                    {c.monthlyCostUsd > 0 ? `$${c.monthlyCostUsd.toLocaleString()}` : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {format(new Date(c.lastActiveAt), 'MMM dd, HH:mm')}
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

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:    'bg-green-100 text-green-800',
    trial:     'bg-blue-100 text-blue-800',
    suspended: 'bg-amber-100 text-amber-900',
    cancelled: 'bg-gray-100 text-gray-700',
  };
  return <Badge className={map[status] ?? 'bg-gray-100 text-gray-800'}>{status}</Badge>;
}
