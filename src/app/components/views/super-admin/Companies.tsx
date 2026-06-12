import { useEffect, useMemo, useState } from 'react';
import { useDateFormat } from '../../../context/DateFormatContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import { Switch } from '../../ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '../../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import {
  Building2, Plus, Search, Pause, Play, Trash2, Edit, ArrowUpDown, HardDrive, UsersRound,
  AlertTriangle, Shield, Calendar, FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  mockCompanies, mockLocalInstalls, Company, PlanTier, CompanyStatus,
  PLAN_LIMITS, computeUsage,
} from '../../../data/platformData';
import { USE_MOCKS } from '../../../api/client';
import * as platformApi from '../../../api/platform';
import { StatusBadge } from './PlatformDashboard';
import { SyncStatusBadge } from './SyncStatusBadge';
import { usePagination } from '../../../hooks/usePagination';
import { Pagination } from '../../common/Pagination';

// Adapter: PlatformTenant lacks usage/cost fields the JSX consumes (employeeCount,
// storageMb, monthlyCostUsd, userCount, lastActiveAt). Fill with 0 / createdAt
// fallbacks so existing renderers and computeUsage() keep working unchanged.
function toLegacyCompany(t: platformApi.PlatformTenant): Company {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    contactEmail: t.contactEmail,
    contactPhone: t.contactPhone,
    country: t.country,
    planTier: t.planTier as PlanTier,
    status: t.status as CompanyStatus,
    // Live counts from the backend tenants list endpoint. Fall through
    // to 0 for create/update responses (those don't compute counts; the
    // next list refresh fills them in).
    userCount: t.userCount ?? 0,
    employeeCount: t.employeeCount ?? 0,
    attendanceCount: t.attendanceCount ?? 0,
    payrollItemCount: t.payrollItemCount ?? 0,
    storageMb: 0,
    monthlyCostUsd: PLAN_LIMITS[(t.planTier as PlanTier)]?.monthlyPriceUsd ?? 0,
    createdAt: t.createdAt,
    lastActiveAt: t.updatedAt ?? t.createdAt,
    notes: t.notes,
    // Backend defaults this to true; preserve undefined → true so the
    // edit dialog's switch defaults to "on" even if a legacy mock row
    // skips the field.
    appLauncherEnabled: t.appLauncherEnabled ?? true,
  };
}

// Inverse adapter for mock mode — keeps the in-memory mockCompanies seed usable
// as a PlatformTenant list when USE_MOCKS is on.
function toTenant(c: Company): platformApi.PlatformTenant {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    planTier: c.planTier,
    status: c.status,
    contactEmail: c.contactEmail,
    contactPhone: c.contactPhone ?? '',
    country: c.country,
    notes: c.notes ?? '',
    suspendedAt: c.status === 'suspended' ? c.lastActiveAt : null,
    cancelledAt: c.status === 'cancelled' ? c.lastActiveAt : null,
    createdAt: c.createdAt,
    updatedAt: c.lastActiveAt,
    appLauncherEnabled: c.appLauncherEnabled ?? true,
  };
}

export function Companies() {
  const { formatDate } = useDateFormat();
  const [companies, setCompanies] = useState<platformApi.PlatformTenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<'all' | CompanyStatus>('all');
  const [planFilter, setPlanFilter] = useState<'all' | PlanTier>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<Partial<Company>>({});
  const [suspendTarget, setSuspendTarget] = useState<Company | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [planChangeTarget, setPlanChangeTarget] = useState<Company | null>(null);
  const [newPlan, setNewPlan] = useState<PlanTier>('starter');

  // Project the tenant list down to the legacy Company shape the JSX consumes.
  const companiesView: Company[] = useMemo(
    () => companies.map(toLegacyCompany),
    [companies],
  );

  // Loader — backend filters server-side; mock mode reuses the seed array and
  // applies the same filters client-side via the existing `filtered` memo.
  const loadCompanies = async () => {
    if (USE_MOCKS) {
      setCompanies(mockCompanies.map(toTenant));
      return;
    }
    setLoading(true);
    try {
      const list = await platformApi.tenants.list({
        q: search.trim() || undefined,
        status: statusTab !== 'all' ? statusTab : undefined,
        planTier: planFilter !== 'all' ? planFilter : undefined,
      });
      setCompanies(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load companies';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Reload on mount and whenever filters change. Server-side filtering is the
  // source of truth in API mode; the client-side `filtered` memo below is kept
  // so mock mode and search-as-you-type still narrow without a round-trip.
  useEffect(() => {
    loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusTab, planFilter]);

  const counts = useMemo(() => ({
    all:       companiesView.length,
    active:    companiesView.filter(c => c.status === 'active').length,
    trial:     companiesView.filter(c => c.status === 'trial').length,
    suspended: companiesView.filter(c => c.status === 'suspended').length,
    cancelled: companiesView.filter(c => c.status === 'cancelled').length,
  }), [companiesView]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companiesView.filter(c => {
      if (statusTab !== 'all' && c.status !== statusTab) return false;
      if (planFilter !== 'all' && c.planTier !== planFilter) return false;
      if (q && !`${c.name} ${c.slug} ${c.contactEmail} ${c.country}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [companiesView, search, statusTab, planFilter]);

  const pager = usePagination(filtered, 10);

  // CRUD
  const handleOpenCreate = () => {
    setEditing(null);
    setForm({ planTier: 'starter', status: 'trial', country: 'Cambodia' });
    setDialogOpen(true);
  };
  const handleOpenEdit = (c: Company) => {
    setEditing(c);
    setForm({ ...c });
    setDialogOpen(true);
  };
  const handleSave = async () => {
    if (!form.name || !form.slug || !form.contactEmail) {
      toast.error('Name, slug, and contact email are required');
      return;
    }

    if (USE_MOCKS) {
      // Preserve the original in-memory mock mutation behavior.
      if (editing) {
        setCompanies(prev => prev.map(t =>
          t.id === editing.id ? toTenant({ ...toLegacyCompany(t), ...form } as Company) : t
        ));
        toast.success(`Updated ${form.name}`);
      } else {
        const newId = `T${String(companies.length + 1).padStart(3, '0')}`;
        const now = new Date().toISOString();
        const seed: Company = {
          id: newId,
          name: form.name!,
          slug: form.slug!,
          contactEmail: form.contactEmail!,
          contactPhone: form.contactPhone,
          country: form.country ?? '',
          planTier: (form.planTier as PlanTier) ?? 'free',
          status: (form.status as CompanyStatus) ?? 'trial',
          userCount: 0,
          employeeCount: 0,
          storageMb: 0,
          monthlyCostUsd: 0,
          createdAt: now,
          lastActiveAt: now,
          notes: form.notes,
        };
        setCompanies(prev => [...prev, toTenant(seed)]);
        toast.success(`Created ${form.name}`);
      }
      setDialogOpen(false);
      return;
    }

    setSubmitting(true);
    try {
      if (editing) {
        await platformApi.tenants.update(editing.id, {
          name: form.name,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone ?? undefined,
          country: form.country ?? undefined,
          notes: form.notes ?? undefined,
          planTier: form.planTier ?? undefined,
          // Round-trip the Apps-launcher toggle from the edit form. Send
          // undefined when the user never opened the dialog (form is
          // freshly seeded from `editing`) so we don't accidentally
          // overwrite the stored value with the form's default.
          appLauncherEnabled: form.appLauncherEnabled,
        });
        toast.success(`Updated ${form.name}`);
      } else {
        await platformApi.tenants.create({
          name: form.name!,
          slug: form.slug!,
          planTier: (form.planTier as PlanTier) ?? 'starter',
          contactEmail: form.contactEmail!,
          contactPhone: form.contactPhone ?? null,
          country: form.country ?? null,
          notes: form.notes ?? null,
        });
        toast.success('Company created');
      }
      setDialogOpen(false);
      await loadCompanies();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };
  const handleSuspendToggle = async () => {
    if (!suspendTarget) return;
    const willSuspend = suspendTarget.status !== 'suspended';

    if (USE_MOCKS) {
      const next: CompanyStatus = willSuspend ? 'suspended' : 'active';
      setCompanies(prev => prev.map(t =>
        t.id === suspendTarget.id ? { ...t, status: next } : t
      ));
      toast.success(willSuspend ? `Suspended ${suspendTarget.name}` : `Reactivated ${suspendTarget.name}`);
      setSuspendTarget(null);
      return;
    }

    setSubmitting(true);
    try {
      if (willSuspend) {
        await platformApi.tenants.suspend(suspendTarget.id);
        toast.success(`Suspended ${suspendTarget.name}`);
      } else {
        await platformApi.tenants.reactivate(suspendTarget.id);
        toast.success(`Reactivated ${suspendTarget.name}`);
      }
      setSuspendTarget(null);
      await loadCompanies();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Action failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;

    if (USE_MOCKS) {
      setCompanies(prev => prev.filter(t => t.id !== deleteTarget.id));
      toast.success(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);
      return;
    }

    setSubmitting(true);
    try {
      await platformApi.tenants.remove(deleteTarget.id);
      toast.success(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);
      await loadCompanies();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };
  const handleConfirmPlanChange = async () => {
    if (!planChangeTarget) return;

    if (USE_MOCKS) {
      const limits = PLAN_LIMITS[newPlan];
      setCompanies(prev => prev.map(t =>
        t.id === planChangeTarget.id
          ? { ...t, planTier: newPlan, monthlyCostUsd: limits.monthlyPriceUsd } as platformApi.PlatformTenant
          : t
      ));
      toast.success(`${planChangeTarget.name} moved to ${newPlan}`);
      setPlanChangeTarget(null);
      return;
    }

    setSubmitting(true);
    try {
      await platformApi.tenants.changePlan(planChangeTarget.id, newPlan);
      toast.success(`${planChangeTarget.name} moved to ${newPlan}`);
      setPlanChangeTarget(null);
      await loadCompanies();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Plan change failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, slug, contact, country…"
              className="pl-8 h-9 w-[320px]"
            />
          </div>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value as typeof planFilter)}
            className="h-9 px-3 border rounded-md text-sm"
          >
            <option value="all">All plans</option>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="business">Business</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New Company
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {editing ? `Edit ${editing.name}` : 'Create Company'}
              </DialogTitle>
              <DialogDescription>
                Super Admin provisions a new tenant. The first Admin user is created automatically and emailed an invite.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="c-name">Name *</Label>
                  <Input id="c-name" value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-slug">Slug *</Label>
                  <Input id="c-slug" placeholder="acme" value={form.slug ?? ''} onChange={e => setForm({ ...form, slug: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="c-email">Contact Email *</Label>
                  <Input id="c-email" type="email" value={form.contactEmail ?? ''} onChange={e => setForm({ ...form, contactEmail: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-phone">Contact Phone</Label>
                  <Input id="c-phone" value={form.contactPhone ?? ''} onChange={e => setForm({ ...form, contactPhone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="c-country">Country</Label>
                  <Input id="c-country" value={form.country ?? ''} onChange={e => setForm({ ...form, country: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Plan</Label>
                  <select
                    value={form.planTier ?? 'starter'}
                    onChange={e => setForm({ ...form, planTier: e.target.value as PlanTier })}
                    className="w-full h-9 px-3 border rounded-md text-sm"
                  >
                    <option value="free">Free</option>
                    <option value="starter">Starter</option>
                    <option value="business">Business</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <select
                    value={form.status ?? 'trial'}
                    onChange={e => setForm({ ...form, status: e.target.value as CompanyStatus })}
                    className="w-full h-9 px-3 border rounded-md text-sm"
                  >
                    <option value="trial">Trial</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-notes">Notes</Label>
                <Input id="c-notes" value={form.notes ?? ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              {/* Feature toggles — Super Admin controls visibility of
                  tenant-side surfaces that don't fit the per-module
                  catalog (single-flag features, not a whole sub-app).
                  Apps launcher is the first; more can stack here later. */}
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Features</div>
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="c-app-launcher" className="cursor-pointer">Apps launcher</Label>
                    <p className="text-xs text-gray-500">
                      Show the 3x3 dots icon next to the language picker. Only Admin-role users see it.
                    </p>
                  </div>
                  <Switch
                    id="c-app-launcher"
                    checked={form.appLauncherEnabled ?? true}
                    onCheckedChange={(v) => setForm({ ...form, appLauncherEnabled: v })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={handleSave} disabled={submitting}>{editing ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status tabs */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>All Companies</CardTitle>
            <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as typeof statusTab)}>
              <TabsList>
                {([
                  { key: 'all',       label: 'All',       cls: 'bg-gray-100 text-gray-700' },
                  { key: 'active',    label: 'Active',    cls: 'bg-green-100 text-green-800' },
                  { key: 'trial',     label: 'Trial',     cls: 'bg-blue-100 text-blue-800' },
                  { key: 'suspended', label: 'Suspended', cls: 'bg-amber-100 text-amber-900' },
                  { key: 'cancelled', label: 'Cancelled', cls: 'bg-gray-100 text-gray-700' },
                ] as const).map(chip => (
                  <TabsTrigger key={chip.key} value={chip.key}>
                    {chip.label}
                    <Badge className={`ml-1.5 h-5 px-1.5 text-[10px] ${chip.cls}`}>
                      {counts[chip.key]}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-[220px]">Usage</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.paginatedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-gray-400 py-10">
                    {loading ? 'Loading companies…' : 'No companies match these filters.'}
                  </TableCell>
                </TableRow>
              )}
              {pager.paginatedItems.map(c => {
                const usage = computeUsage(c, mockLocalInstalls);
                const overQuota = usage.employees.over || usage.storage.over || usage.installs.over;
                return (
                <TableRow key={c.id} className={overQuota ? 'bg-red-50/30' : ''}>
                  <TableCell>
                    <p className="font-medium text-sm">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.slug} · {c.country}</p>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => { setPlanChangeTarget(c); setNewPlan(c.planTier); }}
                      className="inline-flex items-center gap-1.5 text-sm capitalize hover:underline"
                      title="Change plan"
                    >
                      {c.planTier}
                      <ArrowUpDown className="h-3 w-3 text-gray-400" />
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge status={c.status} />
                      <SyncStatusBadge tenantId={c.id} />
                      {overQuota && (
                        <Badge className="bg-red-100 text-red-800 gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Over quota
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {/* Live counts from the backend, replacing the
                        previously-mocked Storage / Employees rows.
                        Employees still uses the plan-limit comparison
                        (UsageRow) so over-quota stays visible; the
                        other three are absolute numbers since plan
                        caps don't apply to them today. */}
                    <div className="space-y-1.5 text-xs">
                      <UsageRow icon={UsersRound} label="Employees" used={usage.employees.used} cap={usage.employees.cap} pct={usage.employees.pct} over={usage.employees.over} format={formatNumber} />
                      <div className="flex items-center gap-3 text-gray-600">
                        <span className="inline-flex items-center gap-1">
                          <Shield className="h-3 w-3 text-blue-500" />
                          <span className="font-medium">{(c.userCount ?? 0).toLocaleString()}</span>
                          <span className="text-gray-400">users</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-emerald-500" />
                          <span className="font-medium">{(c.attendanceCount ?? 0).toLocaleString()}</span>
                          <span className="text-gray-400">attendance</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3 w-3 text-amber-500" />
                          <span className="font-medium">{(c.payrollItemCount ?? 0).toLocaleString()}</span>
                          <span className="text-gray-400">payroll</span>
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {c.monthlyCostUsd > 0 ? `$${c.monthlyCostUsd.toLocaleString()}` : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {formatDate(c.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenEdit(c)} title="Edit">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 w-7 p-0 ${c.status === 'suspended' ? 'text-green-700 hover:bg-green-50' : 'text-amber-700 hover:bg-amber-50'}`}
                        onClick={() => setSuspendTarget(c)}
                        title={c.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                      >
                        {c.status === 'suspended' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteTarget(c)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
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

      {/* Suspend toggle confirmation */}
      <AlertDialog open={!!suspendTarget} onOpenChange={(o) => !o && setSuspendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendTarget?.status === 'suspended' ? 'Reactivate' : 'Suspend'} {suspendTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendTarget?.status === 'suspended'
                ? 'Users will regain access and sync will resume.'
                : 'All users in this tenant lose access immediately. Data is retained and can be re-enabled later.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSuspendToggle}>
              {suspendTarget?.status === 'suspended' ? 'Reactivate' : 'Suspend'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Plan change */}
      <Dialog open={!!planChangeTarget} onOpenChange={(o) => !o && setPlanChangeTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Change plan for {planChangeTarget?.name}</DialogTitle>
            <DialogDescription>
              Plan limits are enforced immediately. Usage above the new plan's cap shows as over-quota and blocks writes until resolved.
            </DialogDescription>
          </DialogHeader>
          {planChangeTarget && (() => {
            const usage = computeUsage(planChangeTarget, mockLocalInstalls);
            const newLimits = PLAN_LIMITS[newPlan];
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {(['free', 'starter', 'business', 'enterprise'] as PlanTier[]).map(tier => (
                    <button
                      key={tier}
                      onClick={() => setNewPlan(tier)}
                      className={`p-3 rounded-md border text-left transition-colors ${
                        newPlan === tier ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="capitalize font-medium text-sm">{tier}</p>
                        <p className="text-xs text-gray-500">
                          {PLAN_LIMITS[tier].monthlyPriceUsd === 0 ? 'Free' : `$${PLAN_LIMITS[tier].monthlyPriceUsd}/mo`}
                        </p>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1 space-y-0.5">
                        <p>{PLAN_LIMITS[tier].maxEmployees.toLocaleString()} employees</p>
                        <p>{formatMb(PLAN_LIMITS[tier].maxStorageMb)} storage</p>
                        <p>{PLAN_LIMITS[tier].maxLocalInstalls} local install{PLAN_LIMITS[tier].maxLocalInstalls !== 1 ? 's' : ''}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="rounded-md border p-3 bg-gray-50/50 space-y-2">
                  <p className="text-xs font-medium text-gray-700">Impact on current usage</p>
                  <ImpactRow label="Employees" used={usage.employees.used} oldCap={usage.employees.cap} newCap={newLimits.maxEmployees} format={formatNumber} />
                  <ImpactRow label="Storage"   used={usage.storage.used}   oldCap={usage.storage.cap}   newCap={newLimits.maxStorageMb} format={formatMb} />
                  <ImpactRow label="Local installs" used={usage.installs.used} oldCap={usage.installs.cap} newCap={newLimits.maxLocalInstalls} format={formatNumber} />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanChangeTarget(null)} disabled={submitting}>Cancel</Button>
            <Button
              onClick={handleConfirmPlanChange}
              disabled={planChangeTarget?.planTier === newPlan || submitting}
            >
              Apply plan change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the tenant and all its data including users, employees, payroll, and attendance history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}
function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function UsageRow({ icon: Icon, label, used, cap, pct, over, format }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  used: number;
  cap: number;
  pct: number;
  over: boolean;
  format: (n: number) => string;
}) {
  const barColor = over ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-blue-500';
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <Icon className="h-3 w-3 text-gray-400 shrink-0" />
      <span className="text-gray-500 w-16 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`tabular-nums w-20 text-right ${over ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
        {format(used)} / {format(cap)}
      </span>
    </div>
  );
}

function ImpactRow({ label, used, oldCap, newCap, format }: {
  label: string; used: number; oldCap: number; newCap: number; format: (n: number) => string;
}) {
  const willExceed = used > newCap;
  const changed = oldCap !== newCap;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-28 text-gray-600">{label}</span>
      <span className="font-mono">{format(used)}</span>
      <span className="text-gray-400">/</span>
      <span className={`font-mono ${willExceed ? 'text-red-700 font-semibold' : changed ? 'text-green-700' : 'text-gray-600'}`}>
        {format(newCap)}
      </span>
      {willExceed && (
        <Badge className="bg-red-100 text-red-800 text-[10px]">
          Exceeds new cap
        </Badge>
      )}
    </div>
  );
}
