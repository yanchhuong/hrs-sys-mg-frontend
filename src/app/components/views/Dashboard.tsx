import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  mockEmployees, mockAttendance, mockOTRequests, mockContracts,
} from '../../data/mockData';
import * as employeesApi from '../../api/employees';
import * as attendanceApi from '../../api/attendance';
import * as overtimeApi from '../../api/overtime';
import * as contractsApi from '../../api/contracts';
import * as departmentsApi from '../../api/departments';
import * as leaveApi from '../../api/leave';
import * as dashboardsApi from '../../api/dashboards';
import { USE_MOCKS } from '../../api/client';
import { makeDeptName } from '../../utils/deptName';
import {
  Users, Clock, TimerIcon, FileText, AlertCircle, CheckCircle,
  RefreshCw, CalendarDays, LayoutDashboard, Wallet, Landmark,
  ShoppingCart, Gauge, Sparkles, Loader2, TrendingUp, TrendingDown,
  GraduationCap, Stethoscope,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { format, differenceInDays, parseISO } from 'date-fns';
import { useDateFormat } from '../../context/DateFormatContext';
import { toast } from 'sonner';

/* ============================================================== */
/* V316 — Dynamic multi-category Dashboard shell                   */
/* ============================================================== */

/**
 * Icon lookup keyed by the {@code dashboard_categories.icon} column
 * value (kebab-case Lucide name). Adding a new category on the BE
 * only requires an entry here on the FE. Falls back to a generic
 * dashboard glyph so an unknown icon renders as a shape rather than
 * an empty tile.
 */
const CATEGORY_ICON: Record<string, ComponentType<{ className?: string }>> = {
  users:             Users,
  wallet:            Wallet,
  landmark:          Landmark,
  'shopping-cart':   ShoppingCart,
  gauge:             Gauge,
  'graduation-cap':  GraduationCap,
  stethoscope:       Stethoscope,
};
function CategoryIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const Icon = (name && CATEGORY_ICON[name]) || LayoutDashboard;
  return <Icon className={className} />;
}

/** V316 — the exported Dashboard is the shell. It resolves the user's
 *  available categories, renders a tab strip, and mounts the widget
 *  bundle for the selected code. Legacy HR content lives on as
 *  {@link HrDashboardWidgets}; unimplemented categories render the
 *  shared {@link ComingSoonBundle} placeholder until real widgets
 *  ship. */
export function Dashboard() {
  const [categories, setCategories] = useState<dashboardsApi.DashboardCategory[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await dashboardsApi.listCategories();
        if (cancelled) return;
        setCategories(list);
        // Default selection order: last-picked (localStorage), then
        // the first category in server-sorted order. This gives us
        // per-user preference for free without needing a DB row.
        const stored = typeof window !== 'undefined'
          ? window.localStorage.getItem('dashboard.lastCategory')
          : null;
        const initial = list.find(c => c.code === stored)?.code ?? list[0]?.code ?? '';
        setSelected(initial);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboards');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pick = (code: string) => {
    setSelected(code);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('dashboard.lastCategory', code);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboards…
      </div>
    );
  }
  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }
  if (categories.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-gray-500 space-y-1">
        <div className="text-gray-700 font-medium">No dashboards available.</div>
        <div>Ask an admin to grant a dashboard permission on your role.</div>
      </div>
    );
  }

  const active = categories.find(c => c.code === selected) ?? categories[0];

  return (
    <div className="space-y-4">
      {/* Category tab strip. Hidden entirely when the user has access
          to just one category — no signal there, keeps the page clean
          (a Cashier with only POS shouldn't see a "POS" tab as their
          only option). */}
      {categories.length > 1 && (
        <div className="filter-strip">
          {categories.map(c => {
            const on = c.code === active.code;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => pick(c.code)}
                className={`h-9 px-3 rounded-md text-sm font-medium border transition-colors inline-flex items-center gap-1.5 ${
                  on
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-transparent bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
                title={c.description ?? c.name}
              >
                <CategoryIcon name={c.icon} className="h-3.5 w-3.5" />
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Widget bundle for the active category. HR + POS +
          Accounting have real content; other categories land on the
          shared placeholder until their bundle ships. */}
      {active.code === 'hr'             ? <HrDashboardWidgets />
        : active.code === 'pos'         ? <PosDashboardBundle />
        : active.code === 'accounting'  ? <AccountingDashboardBundle />
        : active.code === 'payroll'     ? <PayrollDashboardBundle />
        : active.code === 'management'  ? <ManagementDashboardBundle />
        : active.code === 'school'      ? <SchoolDashboardBundle />
        : active.code === 'hospital'    ? <HospitalDashboardBundle />
        : <ComingSoonBundle category={active} />}
    </div>
  );
}

/* ============================================================== */
/* POS dashboard bundle                                            */
/* ============================================================== */

/** V316 — POS category widgets. KPI row (today's sales / orders /
 *  AOV / customers / discount), a 7-day sales trend, and the most
 *  recent 10 checked-out tickets. Reads the batched payload from
 *  {@code /api/v1/dashboard/pos} so widgets don't fan out into per-
 *  widget HTTP calls. */
function PosDashboardBundle() {
  const { formatDate } = useDateFormat();
  const [data, setData] = useState<dashboardsApi.DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardsApi.getCategorySummary('pos')
      .then(s => { if (!cancelled) setData(s); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const usd = (v: number | string | undefined) => {
    const n = typeof v === 'string' ? Number(v) : (v ?? 0);
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const num = (v: number | string | undefined) => {
    const n = typeof v === 'string' ? Number(v) : (v ?? 0);
    return n.toLocaleString();
  };

  const trend = data?.trend ?? [];
  // Y-scale for the mini bar chart — normalize to the peak so a
  // typical mid-week bar reads as ~half-height even on a flat week.
  const maxSales = useMemo(() => trend.reduce(
    (m, p) => Math.max(m, Number(p.sales) || 0), 0
  ), [trend]);

  const recent = data?.recentOrders ?? [];

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading POS dashboard…
      </div>
    );
  }
  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-4">
      {/* KPI strip — five tiles, wraps on small screens. Same
          rhythm the other pages' stat-strip uses. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <PosKpiTile label="Today's Sales"   value={usd(data?.kpi?.todaySales)}     icon={ShoppingCart} tone="emerald" />
        <PosKpiTile label="Orders"          value={num(data?.kpi?.todayOrders)}    icon={FileText}     tone="blue" />
        <PosKpiTile label="Avg. Order"      value={usd(data?.kpi?.avgOrderValue)}  icon={Wallet}       tone="amber" />
        <PosKpiTile label="Customers"       value={num(data?.kpi?.todayCustomers)} icon={Users}        tone="violet" />
        <PosKpiTile label="Discounts"       value={usd(data?.kpi?.todayDiscount)}  icon={Landmark}     tone="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 7-day trend — inline SVG bar chart; no chart lib to keep
            the FE bundle lean. Bars are ~normalized so a slow day
            still shows as a visible sliver. */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Sales — last 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length === 0 || maxSales === 0 ? (
              <div className="text-sm text-gray-400 py-8 text-center">
                No sales in the last 7 days yet.
              </div>
            ) : (
              <div className="flex items-end gap-2 h-40 pt-2">
                {trend.map(p => {
                  const v = Number(p.sales) || 0;
                  const h = Math.max(4, Math.round((v / maxSales) * 140));
                  const d = new Date(p.date + 'T00:00:00');
                  const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });
                  return (
                    <div key={p.date} className="flex-1 flex flex-col items-center gap-1" title={`${p.date}: ${usd(v)} · ${p.orders} orders`}>
                      <div className="w-full rounded-t bg-blue-500/80 hover:bg-blue-600 transition-colors" style={{ height: `${h}px` }} />
                      <div className="text-[10px] text-gray-500 tabular-nums">{dayLabel}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent orders — narrow card next to the trend chart. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent orders</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="text-sm text-gray-400 py-4 text-center">No orders yet.</div>
            ) : (
              <ul className="space-y-1.5">
                {recent.map(r => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium tabular-nums text-xs">{r.queueNo}</div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {r.customerName?.trim() || 'Walk-in'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-medium tabular-nums text-xs text-emerald-700">{usd(r.total)}</div>
                      <div className="text-[10px] text-gray-400">
                        {r.checkedOutAt ? formatDate(r.checkedOutAt) : '—'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type PosKpiTone = 'emerald' | 'blue' | 'amber' | 'violet' | 'rose';
const POS_KPI_TONE_CLASS: Record<PosKpiTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blue:    'bg-blue-50 text-blue-700 border-blue-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  violet:  'bg-violet-50 text-violet-700 border-violet-200',
  rose:    'bg-rose-50 text-rose-700 border-rose-200',
};

function PosKpiTile({ label, value, icon: Icon, tone }: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  tone: PosKpiTone;
}) {
  return (
    <div className="rounded-md border bg-white px-3 py-2.5 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
        <div className="text-lg font-semibold tabular-nums mt-0.5 truncate" title={value}>{value}</div>
      </div>
      <div className={`h-8 w-8 rounded-md border flex items-center justify-center ${POS_KPI_TONE_CLASS[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );
}

/* ============================================================== */
/* Accounting dashboard bundle                                     */
/* ============================================================== */

/** V316 — Accounting category widgets. MTD KPI row (revenue,
 *  expense, profit, AR, AP), a 6-month revenue-vs-expense trend,
 *  and an activity feed of the last 10 non-void invoices + bills.
 *  All money figures come from the BE already USD-normalized using
 *  each row's captured exchange rate. */
function AccountingDashboardBundle() {
  const { formatDate } = useDateFormat();
  const [data, setData] = useState<dashboardsApi.DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardsApi.getCategorySummary('accounting')
      .then(s => { if (!cancelled) setData(s); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const usd = (v: number | string | undefined) => {
    const n = typeof v === 'string' ? Number(v) : (v ?? 0);
    const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? `-$${abs}` : `$${abs}`;
  };

  const kpi = data?.kpi ?? {};
  const trend = (data?.trend ?? []) as { month: string; revenue: number | string; expense: number | string; profit: number | string }[];
  // Peak-normalize both series against the same y-axis so a strong
  // revenue month doesn't dwarf a small expense month by comparison.
  const peak = useMemo(() => trend.reduce(
    (m, p) => Math.max(m, Number(p.revenue) || 0, Number(p.expense) || 0), 0
  ), [trend]);
  const recent = data?.recentTransactions ?? [];

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Accounting dashboard…
      </div>
    );
  }
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      {/* KPI strip — 5 tiles. Profit tone shifts to rose when
          negative so an operator sees the sign at a glance. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <PosKpiTile label="Revenue (MTD)" value={usd(kpi.revenueMtd)} icon={TrendingUp} tone="emerald" />
        <PosKpiTile label="Expense (MTD)" value={usd(kpi.expenseMtd)} icon={TrendingDown} tone="rose" />
        <PosKpiTile label="Profit (MTD)"  value={usd(kpi.profitMtd)}
          icon={Wallet}
          tone={Number(kpi.profitMtd ?? 0) >= 0 ? 'emerald' : 'rose'} />
        <PosKpiTile label="AR (open)"     value={usd(kpi.arOpen)} icon={FileText} tone="blue" />
        <PosKpiTile label="AP (open)"     value={usd(kpi.apOpen)} icon={Landmark}  tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 6-month trend — two bars per month (revenue + expense).
            Same shared-peak normalization so bars are comparable
            across months and series. */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Revenue vs Expense — last 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length === 0 || peak === 0 ? (
              <div className="text-sm text-gray-400 py-8 text-center">
                No activity in the last 6 months.
              </div>
            ) : (
              <div className="flex items-end gap-3 h-48 pt-2">
                {trend.map(p => {
                  const rv = Number(p.revenue) || 0;
                  const ex = Number(p.expense) || 0;
                  const rh = Math.max(2, Math.round((rv / peak) * 170));
                  const eh = Math.max(2, Math.round((ex / peak) * 170));
                  const [y, m] = p.month.split('-');
                  const label = new Date(Number(y), Number(m) - 1, 1)
                    .toLocaleDateString(undefined, { month: 'short' });
                  return (
                    <div key={p.month} className="flex-1 flex flex-col items-center gap-1"
                      title={`${p.month} · Revenue ${usd(rv)} · Expense ${usd(ex)} · Profit ${usd(Number(p.profit))}`}>
                      <div className="flex items-end gap-0.5 w-full h-[172px]">
                        <div className="flex-1 rounded-t bg-emerald-500/80" style={{ height: `${rh}px` }} />
                        <div className="flex-1 rounded-t bg-rose-500/80"    style={{ height: `${eh}px` }} />
                      </div>
                      <div className="text-[10px] text-gray-500 tabular-nums">{label}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-2 flex items-center gap-4 text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500/80" /> Revenue</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-500/80" /> Expense</span>
            </div>
          </CardContent>
        </Card>

        {/* Recent transactions — activity feed. Revenue rows show
            emerald + no sign; expense rows show rose + a "−" prefix
            (server sends negative amountUsd on bills). */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="text-sm text-gray-400 py-4 text-center">No transactions.</div>
            ) : (
              <ul className="space-y-1.5">
                {recent.map(r => {
                  const amt = Number(r.amountUsd) || 0;
                  const positive = amt >= 0;
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium tabular-nums text-xs truncate">{r.docNo}</div>
                        <div className="text-[11px] text-gray-500 capitalize">{r.kind} · {r.status}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-medium tabular-nums text-xs ${
                          positive ? 'text-emerald-700' : 'text-rose-700'
                        }`}>{usd(amt)}</div>
                        <div className="text-[10px] text-gray-400">{formatDate(r.issueDate)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ============================================================== */
/* Payroll dashboard bundle                                        */
/* ============================================================== */

const PAYROLL_STATUS_TONE: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  done:     'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
};

/** V316 — Payroll category widgets. MTD KPI row + 6-month payroll-
 *  cost trend + recent batches log. All money figures come from
 *  payroll_batches directly so the numbers match the Payroll page's
 *  own aggregations. */
function PayrollDashboardBundle() {
  const [data, setData] = useState<dashboardsApi.DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardsApi.getCategorySummary('payroll')
      .then(s => { if (!cancelled) setData(s); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const usd = (v: number | string | undefined) => {
    const n = typeof v === 'string' ? Number(v) : (v ?? 0);
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const num = (v: number | string | undefined) => {
    const n = typeof v === 'string' ? Number(v) : (v ?? 0);
    return n.toLocaleString();
  };

  const kpi = data?.kpi ?? {};
  const trend = (data?.trend ?? []) as {
    month: string; net: number | string; earnings: number | string; deductions: number | string;
  }[];
  // Peak-normalize across the earnings + deductions series so
  // proportional heights read across bars.
  const peak = useMemo(() => trend.reduce(
    (m, p) => Math.max(m, Number(p.earnings) || 0, Number(p.deductions) || 0), 0
  ), [trend]);
  const recent = data?.recentBatches ?? [];

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Payroll dashboard…
      </div>
    );
  }
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      {/* KPI strip. Net stays the headline number; earnings +
          deductions live on the trend chart so operators can eye the
          gross-to-net gap without a second row of tiles. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <PosKpiTile label="Net (MTD)"    value={usd(kpi.netMtd)}       icon={Wallet}    tone="emerald" />
        <PosKpiTile label="Employees"    value={num(kpi.employeesMtd)} icon={Users}     tone="blue" />
        <PosKpiTile label="Avg. Salary"  value={usd(kpi.avgSalary)}    icon={FileText}  tone="violet" />
        <PosKpiTile label="Paid batches" value={num(kpi.paidBatchesMtd)} icon={CheckCircle} tone="emerald" />
        <PosKpiTile label="Pending"      value={num(kpi.pendingBatches)} icon={AlertCircle} tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 6-month trend — earnings + deductions per month. Two bars
            per month, same peak-normalization as the accounting chart. */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Payroll cost — last 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length === 0 || peak === 0 ? (
              <div className="text-sm text-gray-400 py-8 text-center">
                No payroll runs in the last 6 months.
              </div>
            ) : (
              <div className="flex items-end gap-3 h-48 pt-2">
                {trend.map(p => {
                  const e = Number(p.earnings) || 0;
                  const d = Number(p.deductions) || 0;
                  const eh = Math.max(2, Math.round((e / peak) * 170));
                  const dh = Math.max(2, Math.round((d / peak) * 170));
                  const [y, m] = p.month.split('-');
                  const label = new Date(Number(y), Number(m) - 1, 1)
                    .toLocaleDateString(undefined, { month: 'short' });
                  return (
                    <div key={p.month} className="flex-1 flex flex-col items-center gap-1"
                      title={`${p.month} · Earnings ${usd(e)} · Deductions ${usd(d)} · Net ${usd(Number(p.net))}`}>
                      <div className="flex items-end gap-0.5 w-full h-[172px]">
                        <div className="flex-1 rounded-t bg-emerald-500/80" style={{ height: `${eh}px` }} />
                        <div className="flex-1 rounded-t bg-slate-400/80"   style={{ height: `${dh}px` }} />
                      </div>
                      <div className="text-[10px] text-gray-500 tabular-nums">{label}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-2 flex items-center gap-4 text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500/80" /> Earnings</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-400/80" /> Deductions</span>
            </div>
          </CardContent>
        </Card>

        {/* Recent batches — status-coloured badges so a Rejected /
            Pending row jumps out of the log. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent batches</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="text-sm text-gray-400 py-4 text-center">No batches yet.</div>
            ) : (
              <ul className="space-y-1.5">
                {recent.map(r => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-xs truncate" title={r.subject}>{r.subject || r.type}</div>
                      <div className="text-[11px] text-gray-500 tabular-nums">
                        {r.monthYear} · {r.employees} emp.
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <div className="text-xs font-medium tabular-nums text-emerald-700">
                        {usd(r.netSalaryTotal)}
                      </div>
                      <Badge className={`text-[10px] px-1.5 py-0 capitalize ${PAYROLL_STATUS_TONE[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {r.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ============================================================== */
/* Management dashboard bundle                                     */
/* ============================================================== */

const ACTIVITY_SOURCE_TONE: Record<string, string> = {
  accounting: 'text-blue-600 bg-blue-50',
  payroll:    'text-violet-600 bg-violet-50',
  pos:        'text-emerald-600 bg-emerald-50',
};

/** V316 — Management category widgets. A cross-category roll-up
 *  composed from the accounting + payroll + POS services (all on
 *  the BE — this bundle just renders). Eight KPI tiles, the shared
 *  revenue-vs-expense trend, and a merged activity feed so an
 *  owner scans one page. */
function ManagementDashboardBundle() {
  const [data, setData] = useState<dashboardsApi.DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardsApi.getCategorySummary('management')
      .then(s => { if (!cancelled) setData(s); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const usd = (v: number | string | undefined) => {
    const n = typeof v === 'string' ? Number(v) : (v ?? 0);
    const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? `-$${abs}` : `$${abs}`;
  };
  const num = (v: number | string | undefined) => {
    const n = typeof v === 'string' ? Number(v) : (v ?? 0);
    return n.toLocaleString();
  };

  const kpi = data?.kpi ?? {};
  const trend = (data?.trend ?? []) as { month: string; revenue: number | string; expense: number | string; profit: number | string }[];
  const peak = useMemo(() => trend.reduce(
    (m, p) => Math.max(m, Number(p.revenue) || 0, Number(p.expense) || 0), 0
  ), [trend]);
  const activity = data?.activity ?? [];

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Management dashboard…
      </div>
    );
  }
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      {/* 8 KPI tiles laid out on two rows at md+ so an owner reads
          the whole business status without scrolling. Profit tone
          flips rose when negative — same rule the Accounting bundle
          uses so the two dashboards read consistently. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PosKpiTile label="Revenue (MTD)"  value={usd(kpi.revenueMtd)} icon={TrendingUp}   tone="emerald" />
        <PosKpiTile label="Expense (MTD)"  value={usd(kpi.expenseMtd)} icon={TrendingDown} tone="rose" />
        <PosKpiTile label="Profit (MTD)"   value={usd(kpi.profitMtd)}
          icon={Wallet}
          tone={Number(kpi.profitMtd ?? 0) >= 0 ? 'emerald' : 'rose'} />
        <PosKpiTile label="Payroll (MTD)"  value={usd(kpi.payrollNetMtd)} icon={Landmark} tone="violet" />
        <PosKpiTile label="POS today"      value={usd(kpi.todaySales)}    icon={ShoppingCart} tone="emerald" />
        <PosKpiTile label="Employees"      value={num(kpi.employees)}     icon={Users} tone="blue" />
        <PosKpiTile label="AR (open)"      value={usd(kpi.arOpen)}        icon={FileText} tone="blue" />
        <PosKpiTile label="AP (open)"      value={usd(kpi.apOpen)}        icon={Gauge} tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Same revenue-vs-expense chart the Accounting bundle
            uses, rendered from the shared trend payload — one
            source of truth for the 6-month revenue picture. */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Revenue vs Expense — last 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length === 0 || peak === 0 ? (
              <div className="text-sm text-gray-400 py-8 text-center">
                No activity in the last 6 months.
              </div>
            ) : (
              <div className="flex items-end gap-3 h-48 pt-2">
                {trend.map(p => {
                  const rv = Number(p.revenue) || 0;
                  const ex = Number(p.expense) || 0;
                  const rh = Math.max(2, Math.round((rv / peak) * 170));
                  const eh = Math.max(2, Math.round((ex / peak) * 170));
                  const [y, m] = p.month.split('-');
                  const label = new Date(Number(y), Number(m) - 1, 1)
                    .toLocaleDateString(undefined, { month: 'short' });
                  return (
                    <div key={p.month} className="flex-1 flex flex-col items-center gap-1"
                      title={`${p.month} · Revenue ${usd(rv)} · Expense ${usd(ex)} · Profit ${usd(Number(p.profit))}`}>
                      <div className="flex items-end gap-0.5 w-full h-[172px]">
                        <div className="flex-1 rounded-t bg-emerald-500/80" style={{ height: `${rh}px` }} />
                        <div className="flex-1 rounded-t bg-rose-500/80"    style={{ height: `${eh}px` }} />
                      </div>
                      <div className="text-[10px] text-gray-500 tabular-nums">{label}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-2 flex items-center gap-4 text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500/80" /> Revenue</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-500/80" /> Expense</span>
            </div>
          </CardContent>
        </Card>

        {/* Merged activity feed — rows tinted per source so an
            owner spots what kind of event landed at a glance. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Business activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <div className="text-sm text-gray-400 py-4 text-center">No recent activity.</div>
            ) : (
              <ul className="space-y-1.5">
                {activity.map(r => {
                  const amt = Number(r.amountUsd) || 0;
                  const positive = amt >= 0;
                  return (
                    <li key={`${r.source}-${r.id}`} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0 flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${
                          ACTIVITY_SOURCE_TONE[r.source] ?? 'text-gray-600 bg-gray-100'
                        }`}>
                          {r.source}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium tabular-nums text-xs truncate">{r.docNo}</div>
                          <div className="text-[11px] text-gray-500 capitalize">{r.status}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-medium tabular-nums text-xs ${
                          positive ? 'text-emerald-700' : 'text-rose-700'
                        }`}>{usd(amt)}</div>
                        <div className="text-[10px] text-gray-400">
                          {r.date ? String(r.date).slice(0, 10) : '—'}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ============================================================== */
/* School dashboard bundle                                         */
/* ============================================================== */

const ENROLLMENT_STATUS_TONE: Record<string, string> = {
  enrolled:  'bg-blue-100 text-blue-800',
  active:    'bg-emerald-100 text-emerald-800',
  completed: 'bg-slate-100 text-slate-700',
  withdrawn: 'bg-rose-100 text-rose-800',
};

/** V319 — School category widgets. KPI strip + 6-month enrollment
 *  trend + a recent enrollments log. Same recipe every operational
 *  bundle uses. */
function SchoolDashboardBundle() {
  const [data, setData] = useState<dashboardsApi.DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardsApi.getCategorySummary('school')
      .then(s => { if (!cancelled) setData(s); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const num = (v: number | string | undefined) => {
    const n = typeof v === 'string' ? Number(v) : (v ?? 0);
    return n.toLocaleString();
  };

  const kpi = data?.kpi ?? {};
  const trend = (data?.trend ?? []) as { month: string; enrollments: number }[];
  const peak = useMemo(() => trend.reduce(
    (m, p) => Math.max(m, Number(p.enrollments) || 0), 0
  ), [trend]);
  const recent = data?.recentEnrollments ?? [];

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading School dashboard…
      </div>
    );
  }
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <PosKpiTile label="Active students"    value={num(kpi.activeStudents)}    icon={GraduationCap} tone="emerald" />
        <PosKpiTile label="Total students"     value={num(kpi.totalStudents)}     icon={Users} tone="blue" />
        <PosKpiTile label="New (MTD)"          value={num(kpi.newEnrollmentsMtd)} icon={FileText} tone="violet" />
        <PosKpiTile label="Completed"          value={num(kpi.completed)}         icon={CheckCircle} tone="emerald" />
        <PosKpiTile label="Withdrawn"          value={num(kpi.withdrawn)}         icon={AlertCircle} tone="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Enrollments — last 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length === 0 || peak === 0 ? (
              <div className="text-sm text-gray-400 py-8 text-center">
                No enrollments in the last 6 months.
              </div>
            ) : (
              <div className="flex items-end gap-2 h-40 pt-2">
                {trend.map(p => {
                  const v = Number(p.enrollments) || 0;
                  const h = Math.max(4, Math.round((v / peak) * 140));
                  const [y, m] = p.month.split('-');
                  const label = new Date(Number(y), Number(m) - 1, 1)
                    .toLocaleDateString(undefined, { month: 'short' });
                  return (
                    <div key={p.month} className="flex-1 flex flex-col items-center gap-1"
                      title={`${p.month}: ${v} enrollments`}>
                      <div className="w-full rounded-t bg-blue-500/80" style={{ height: `${h}px` }} />
                      <div className="text-[10px] text-gray-500 tabular-nums">{label}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent enrollments</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="text-sm text-gray-400 py-4 text-center">No enrollments.</div>
            ) : (
              <ul className="space-y-1.5">
                {recent.map(r => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium tabular-nums text-xs truncate">{r.enrollmentNo}</div>
                      <div className="text-[10px] text-gray-400">
                        {r.enrollmentDate ?? '—'}
                      </div>
                    </div>
                    <Badge className={`text-[10px] px-1.5 py-0 capitalize ${
                      ENROLLMENT_STATUS_TONE[r.status] ?? 'bg-gray-100 text-gray-700'
                    }`}>{r.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ============================================================== */
/* Hospital dashboard bundle                                       */
/* ============================================================== */

const ENCOUNTER_STATUS_TONE: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-800',
  progress: 'bg-blue-100 text-blue-800',
  done:     'bg-emerald-100 text-emerald-800',
  close:    'bg-slate-100 text-slate-700',
  void:     'bg-rose-100 text-rose-800',
};

/** V319 — Hospital category widgets. KPI strip + 6-month encounter
 *  trend + a recent encounters log. Same recipe every operational
 *  bundle uses. */
function HospitalDashboardBundle() {
  const [data, setData] = useState<dashboardsApi.DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardsApi.getCategorySummary('hospital')
      .then(s => { if (!cancelled) setData(s); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const num = (v: number | string | undefined) => {
    const n = typeof v === 'string' ? Number(v) : (v ?? 0);
    return n.toLocaleString();
  };

  const kpi = data?.kpi ?? {};
  const trend = (data?.trend ?? []) as { month: string; encounters: number }[];
  const peak = useMemo(() => trend.reduce(
    (m, p) => Math.max(m, Number(p.encounters) || 0), 0
  ), [trend]);
  const recent = data?.recentEncounters ?? [];

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Hospital dashboard…
      </div>
    );
  }
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PosKpiTile label="Encounters today"    value={num(kpi.encountersToday)}   icon={Stethoscope} tone="emerald" />
        <PosKpiTile label="Encounters (MTD)"    value={num(kpi.encountersMtd)}     icon={FileText}    tone="blue" />
        <PosKpiTile label="Appointments today"  value={num(kpi.appointmentsToday)} icon={CalendarDays} tone="violet" />
        <PosKpiTile label="Pending"             value={num(kpi.pending)}           icon={AlertCircle}  tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Encounters — last 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length === 0 || peak === 0 ? (
              <div className="text-sm text-gray-400 py-8 text-center">
                No encounters in the last 6 months.
              </div>
            ) : (
              <div className="flex items-end gap-2 h-40 pt-2">
                {trend.map(p => {
                  const v = Number(p.encounters) || 0;
                  const h = Math.max(4, Math.round((v / peak) * 140));
                  const [y, m] = p.month.split('-');
                  const label = new Date(Number(y), Number(m) - 1, 1)
                    .toLocaleDateString(undefined, { month: 'short' });
                  return (
                    <div key={p.month} className="flex-1 flex flex-col items-center gap-1"
                      title={`${p.month}: ${v} encounters`}>
                      <div className="w-full rounded-t bg-teal-500/80" style={{ height: `${h}px` }} />
                      <div className="text-[10px] text-gray-500 tabular-nums">{label}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent encounters</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="text-sm text-gray-400 py-4 text-center">No encounters.</div>
            ) : (
              <ul className="space-y-1.5">
                {recent.map(r => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium tabular-nums text-xs truncate">{r.encounterNo}</div>
                      <div className="text-[10px] text-gray-400">
                        {r.encounterDate ?? '—'}
                      </div>
                    </div>
                    <Badge className={`text-[10px] px-1.5 py-0 capitalize ${
                      ENCOUNTER_STATUS_TONE[r.status] ?? 'bg-gray-100 text-gray-700'
                    }`}>{r.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Shared placeholder for every category whose widgets haven't landed
 *  yet. Reads the server's "coming_soon" stub so we can still show a
 *  friendly message without a per-category component. */
function ComingSoonBundle({ category }: { category: dashboardsApi.DashboardCategory }) {
  const [summary, setSummary] = useState<dashboardsApi.DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardsApi.getCategorySummary(category.code)
      .then(s => { if (!cancelled) setSummary(s); })
      .catch(() => { if (!cancelled) setSummary(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [category.code]);
  return (
    <Card>
      <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
        <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
          <CategoryIcon name={category.icon} className="h-6 w-6 text-blue-600" />
        </div>
        <div className="space-y-1">
          <div className="text-lg font-semibold flex items-center justify-center gap-2">
            {category.name} Dashboard
            <Sparkles className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-sm text-gray-500 max-w-md">
            {loading
              ? 'Loading…'
              : (summary?.message
                  ?? 'Widgets for this dashboard are on the roadmap.')}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** ISO YYYY-MM-DD for today, used for "today's attendance" lookups. */
const todayISO = () => format(new Date(), 'yyyy-MM-dd');

/** A contract is "expiring soon" when it's still active and ends within 30 days. */
function isExpiringSoon(endDate?: string | null, today = new Date()): boolean {
  if (!endDate) return false;
  const days = differenceInDays(parseISO(endDate), today);
  return days >= 0 && days <= 30;
}

/** V316 — the HR-specific widget bundle. Renamed from the previous
 *  top-level {@code Dashboard} export; the shell at the top of this
 *  file now mounts one of the category bundles based on the
 *  selected tab. Content is unchanged from the pre-multi-category
 *  version — this remains the reference "real widgets" bundle until
 *  Payroll / Accounting / POS / Management catch up. */
function HrDashboardWidgets() {
  const { formatDate } = useDateFormat();
  const { currentUser, currentEmployee, isModuleAvailable } = useAuth();

  // ---------- State (mock-seeded in mock mode, refetched from API otherwise)
  const [employees, setEmployees] = useState(USE_MOCKS ? mockEmployees : []);
  const [attendance, setAttendance] = useState(USE_MOCKS ? mockAttendance : []);
  const [otRequests, setOtRequests] = useState(USE_MOCKS ? mockOTRequests : []);
  const [contracts, setContracts] = useState(USE_MOCKS ? mockContracts : []);
  const [deptList, setDeptList] = useState<departmentsApi.Department[]>([]);
  // Pending leave requests — surfaces alongside OT in Recent Alerts so
  // tenant-wide roles (admin + custom) can act on them at a glance.
  const [pendingLeaves, setPendingLeaves] = useState<leaveApi.LeaveRequest[]>([]);
  const [loading, setLoading] = useState(!USE_MOCKS);

  useEffect(() => {
    if (USE_MOCKS) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // v-dashboard-module-preflight — skip fetches for modules the
        // tenant doesn't have (e.g. a School tenant has no attendance /
        // overtime / all-leave). Without this we still get the right
        // UX (per-fetch catch swallows the 403), but the browser
        // Network tab shows 3-5 red 403 rows on every Dashboard load,
        // which reads as breakage to anyone watching DevTools. Each
        // fetch is still wrapped in its own catch so a role-level 403
        // (e.g. an employee-role user hitting an admin-only endpoint)
        // still collapses to an empty panel rather than a page toast.
        const attCall = isModuleAvailable('attendance')
          ? attendanceApi.list({ date: todayISO(), size: 500 }).catch(() => ({ data: [] as any[] } as any))
          : Promise.resolve({ data: [] as any[] } as any);
        const otCall = isModuleAvailable('overtime')
          ? overtimeApi.list({ status: 'pending', size: 200 }).catch(() => ({ data: [] as any[] } as any))
          : Promise.resolve({ data: [] as any[] } as any);
        const contractsCall = isModuleAvailable('contracts')
          ? contractsApi.list({ status: 'active', size: 500 }).catch(() => ({ data: [] as any[] } as any))
          : Promise.resolve({ data: [] as any[] } as any);
        const leaveCall = isModuleAvailable('all-leave')
          ? leaveApi.list({ status: 'pending', size: 200 }).catch(() => ({ data: [] as any[] } as any))
          : Promise.resolve({ data: [] as any[] } as any);

        const [empRes, attRes, otRes, contractsRes, deps, leaveRes] = await Promise.all([
          employeesApi.list({ size: 500 }).catch(() => ({ content: [] as any[] } as any)),
          attCall,
          otCall,
          contractsCall,
          departmentsApi.list().catch(() => [] as departmentsApi.Department[]),
          leaveCall,
        ]);
        if (cancelled) return;
        setEmployees((empRes.content ?? []) as any);
        setAttendance((attRes.data ?? []) as any);
        setOtRequests((otRes.data ?? []) as any);
        setContracts((contractsRes.data ?? []) as any);
        setDeptList(deps ?? []);
        setPendingLeaves((leaveRes.data ?? []) as any);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Derived values
  // Employee lookup by either empNo or backend UUID — the current user's
  // employeeId comes from the JWT (UUID in live mode, mock id in mock mode).
  const findEmployee = (id?: string | null) => {
    if (!id) return undefined;
    return employees.find((e: any) => e.id === id || e.apiId === id || e.empNo === id);
  };

  const todayStr = todayISO();
  const todayAttendance = useMemo(
    () => attendance.filter((a: any) => a.date === todayStr),
    [attendance, todayStr],
  );

  const pendingOT = useMemo(
    () => otRequests.filter((r: any) => r.status === 'pending'),
    [otRequests],
  );

  const expiringContracts = useMemo(
    () =>
      contracts.filter((c: any) =>
        USE_MOCKS ? c.status === 'expiring' : isExpiringSoon(c.endDate),
      ),
    [contracts],
  );

  const activeEmployeeCount = useMemo(
    () => employees.filter((e: any) => (e.status ?? 'active') === 'active').length,
    [employees],
  );

  const myEmployeeKey = currentUser?.employeeId ?? null;
  const myAttendance = currentUser?.role === 'employee'
    ? todayAttendance.find((a: any) => a.employeeId === myEmployeeKey)
    : null;
  const myPendingOT = currentUser?.role === 'employee'
    ? pendingOT.filter((r: any) => r.employeeId === myEmployeeKey)
    : pendingOT;

  // Department list for the admin card — prefers the real roster when present.
  const departmentBreakdown = useMemo(() => {
    if (USE_MOCKS) {
      return ['Engineering', 'Human Resources', 'Sales'].map(name => ({
        name,
        count: employees.filter((e: any) => e.department === name).length,
      }));
    }
    return deptList.map(dep => ({
      name: dep.name,
      count: employees.filter((e: any) => e.departmentId === dep.id).length,
    }));
  }, [deptList, employees]);

  // ---------- Loading screen
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
        </div>
        <div className="rounded-md border border-blue-200 bg-blue-50 p-6 flex items-center gap-3">
          <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
          <span className="text-sm text-blue-900">Loading your dashboard…</span>
        </div>
      </div>
    );
  }

  // ---------- Admin view (also drives custom roles, since they're seeded
  // from the Admin base and expect tenant-wide visibility).
  if (currentUser?.role === 'admin'
      || (currentUser?.role
          && currentUser.role !== 'manager'
          && currentUser.role !== 'employee')) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Users className="h-5 w-5 text-blue-600" />
                <span className="text-2xl font-bold text-blue-600">{employees.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Total Employees</p>
              <p className="text-[11px] text-gray-500 truncate">{activeEmployeeCount} active</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Clock className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold text-green-600">{todayAttendance.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Today&apos;s Attendance</p>
              <p className="text-[11px] text-gray-500 truncate">
                {todayAttendance.filter((a: any) => a.status === 'late').length} late arrivals
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <TimerIcon className="h-5 w-5 text-orange-600" />
                <span className="text-2xl font-bold text-orange-600">{pendingOT.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Pending OT</p>
              <p className="text-[11px] text-gray-500 truncate">Require approval</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <CalendarDays className="h-5 w-5 text-purple-600" />
                <span className="text-2xl font-bold text-purple-600">{pendingLeaves.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Pending Leave</p>
              <p className="text-[11px] text-gray-500 truncate">Awaiting approval</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <FileText className="h-5 w-5 text-red-600" />
                <span className="text-2xl font-bold text-red-600">{expiringContracts.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Expiring Contracts</p>
              <p className="text-[11px] text-gray-500 truncate">Within 30 days</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {expiringContracts.map((contract: any) => {
                  const employee = findEmployee(contract.employeeId);
                  return (
                    <div key={contract.id} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Contract Expiring Soon</p>
                        <p className="text-sm text-gray-600">
                          {employee?.name ?? '—'}&apos;s contract expires on {formatDate(contract.endDate)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {pendingOT.slice(0, 2).map((ot: any) => {
                  const employee = findEmployee(ot.employeeId);
                  return (
                    <div key={ot.id} className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                      <TimerIcon className="h-5 w-5 text-orange-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Pending OT Approval</p>
                        <p className="text-sm text-gray-600">
                          {employee?.name ?? '—'} – {ot.hours} hours on {formatDate(ot.date)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {pendingLeaves.slice(0, 3).map((lr) => {
                  const employee = findEmployee(lr.employeeId);
                  return (
                    <div key={lr.id} className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                      <CalendarDays className="h-5 w-5 text-purple-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Pending Leave Approval</p>
                        <p className="text-sm text-gray-600">
                          {(employee?.name ?? lr.employeeName) ?? '—'} – {lr.type.replace('_', ' ')} on {formatDate(lr.date)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {expiringContracts.length === 0 && pendingOT.length === 0 && pendingLeaves.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-6">Nothing needs your attention right now.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Department Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {departmentBreakdown.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">No departments configured yet.</p>
                )}
                {departmentBreakdown.map(dept => (
                  <div key={dept.name} className="flex items-center justify-between">
                    <span className="text-sm">{dept.name}</span>
                    <Badge variant="secondary">{dept.count} employees</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ---------- Manager view
  if (currentUser?.role === 'manager') {
    const teamMembers = employees.filter((e: any) =>
      e.managerId === myEmployeeKey || e.managerId === currentEmployee?.apiId,
    );
    const teamIds = new Set<string>(
      teamMembers.map((t: any) => t.apiId ?? t.id).filter(Boolean),
    );
    const teamPresentToday = todayAttendance.filter((a: any) => teamIds.has(a.employeeId)).length;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Users className="h-5 w-5 text-blue-600" />
                <span className="text-2xl font-bold text-blue-600">{teamMembers.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Team Members</p>
              <p className="text-[11px] text-gray-500 truncate">Under your management</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <TimerIcon className="h-5 w-5 text-orange-600" />
                <span className="text-2xl font-bold text-orange-600">{pendingOT.length}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Pending Approvals</p>
              <p className="text-[11px] text-gray-500 truncate">OT requests</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Clock className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold text-green-600">{teamPresentToday}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Team Attendance</p>
              <p className="text-[11px] text-gray-500 truncate">Present today</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pending OT Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {myPendingOT.map((ot: any) => {
                const employee = findEmployee(ot.employeeId);
                return (
                  <div key={ot.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{employee?.name ?? '—'}</p>
                      <p className="text-sm text-gray-600">
                        {ot.hours} hours on {formatDate(ot.date)} – {ot.reason ?? 'no reason provided'}
                      </p>
                    </div>
                    <Badge variant="secondary">Pending</Badge>
                  </div>
                );
              })}
              {myPendingOT.length === 0 && (
                <p className="text-center text-gray-500 py-4">No pending approvals</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- Employee view (self)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            {myAttendance ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Check In</span>
                  <span className="font-medium">{(myAttendance as any).checkIn ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Check Out</span>
                  <span className="font-medium">{(myAttendance as any).checkOut ?? 'Not yet'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Status</span>
                  <Badge variant={(myAttendance as any).status === 'present' ? 'default' : 'secondary'}>
                    {String((myAttendance as any).status).replace('_', ' ')}
                  </Badge>
                </div>
                {(myAttendance as any).hoursWorked != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Work Hours</span>
                    <span className="font-medium">{(myAttendance as any).hoursWorked}h</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No attendance record today</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My OT Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {myPendingOT.map((ot: any) => (
                <div key={ot.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{formatDate(ot.date)}</p>
                    <p className="text-sm text-gray-600">{ot.hours} hours – {ot.reason ?? '—'}</p>
                  </div>
                  <Badge variant="secondary">{ot.status}</Badge>
                </div>
              ))}
              {myPendingOT.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No pending OT requests</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
            <div>
              <p className="text-sm text-gray-600">Position</p>
              <p className="font-medium">{currentEmployee?.position ?? '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Department</p>
              <p className="font-medium">
                {/* employee.department carries the department UUID in
                    live mode; resolve to its human-readable name from
                    the departments list. Mock mode already stores the
                    name, so makeDeptName falls through cleanly. */}
                {(() => {
                  const id = currentEmployee?.department;
                  if (!id || id === '-') return '—';
                  const name = makeDeptName(deptList, '')(id);
                  return name || id;
                })()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Join Date</p>
              <p className="font-medium">
                {currentEmployee && formatDate(currentEmployee.joinDate)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <Badge variant="default">{currentEmployee?.status ?? 'active'}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
