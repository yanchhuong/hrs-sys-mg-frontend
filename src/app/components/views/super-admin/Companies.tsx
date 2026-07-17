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
  AlertTriangle, Shield, Calendar, FileText, Info, Snowflake, Sun,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
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
    // v-tenant-freeze-schedule — carry through so the Companies
    // table can render the Schedule column for frozen tenants.
    frozenUntil:  t.frozenUntil  ?? null,
    frozenReason: t.frozenReason ?? null,
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
  /** v-tenant-freeze — target of the Freeze / Unfreeze dialog. */
  const [freezeTarget, setFreezeTarget] = useState<Company | null>(null);
  const [freezeReason, setFreezeReason] = useState<string>('');
  const [freezing, setFreezing] = useState<boolean>(false);
  /** v-tenant-freeze-schedule — duration preset ('indefinite' / '1m'
   *  / '3m' / '6m' / '1y' / 'custom'). 'custom' surfaces an inline
   *  date input so an SA can pick any deadline. */
  const [freezeDuration, setFreezeDuration] = useState<
    'indefinite' | '1m' | '3m' | '6m' | '1y' | 'custom'
  >('indefinite');
  const [freezeCustomDate, setFreezeCustomDate] = useState<string>('');
  // Business Base multi-select for the create/edit dialog (V181 +
  // v-business-base-picker). Empty array = "no industry"; on create
  // it defaults to ['pos'] to match the legacy MVP behaviour so a
  // Super Admin doesn't accidentally create a bare tenant. On edit
  // it's seeded from the tenant's current Base derived from
  // tenant_modules via a GET.
  const [bases, setBases] = useState<platformApi.BusinessBase[]>([]);
  // Per-tenant Business Base cache, keyed by tenant id. Populated on
  // list load so the industry chip on each row renders without an
  // N+1 fetch. Freshened after every create/edit/setBusinessBase.
  const [basesByTenant, setBasesByTenant] = useState<Record<string, platformApi.BusinessBase[]>>({});
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
      // Cache each tenant's Business Base(s) so the industry chip on
      // the row + the edit-dialog picker seed without an N+1 fetch.
      // The DTO now includes businessBases directly (V181).
      const next: Record<string, platformApi.BusinessBase[]> = {};
      for (const t of list) next[t.id] = t.businessBases ?? [];
      setBasesByTenant(next);
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
    // Fresh create — default to POS Base to match the legacy MVP so
    // the tenant admin's first-login sidebar is populated. Super
    // Admin can uncheck it in the dialog if they want a
    // no-industry tenant.
    setBases(['pos']);
    setDialogOpen(true);
  };
  const handleOpenEdit = (c: Company) => {
    setEditing(c);
    setForm({ ...c });
    // Seed the picker with the tenant's current Base(s). Falls back
    // to the cached derivation from the list load; refetches on
    // demand if the cache doesn't have it yet.
    setBases(basesByTenant[c.id] ?? []);
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
        // Business Base — separate endpoint (V181) with atomic
        // toggle + audit entry. Only fire when the picker changed;
        // sorted-JSON compare handles multi-base equality reliably.
        const before = [...(basesByTenant[editing.id] ?? [])].sort().join(',');
        const after  = [...bases].sort().join(',');
        if (before !== after) {
          await platformApi.tenants.setBusinessBase(editing.id, bases);
        }
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
          // Business Base — the backend seeds tenant_modules from
          // this list. Empty array = "no industry" (rare but legal).
          businessBases: bases,
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
  /** Translate the duration preset into an ISO timestamp for the
   *  BE. 'indefinite' → null; 'custom' → the datepicker value; the
   *  rest are today + N months. Anchored to now() so freezing "1m"
   *  at 3pm gives a deadline of the same wall time next month. */
  const computeFreezeUntil = (): string | null => {
    if (freezeDuration === 'indefinite') return null;
    if (freezeDuration === 'custom') {
      return freezeCustomDate ? new Date(freezeCustomDate).toISOString() : null;
    }
    const d = new Date();
    if      (freezeDuration === '1m') d.setMonth(d.getMonth() + 1);
    else if (freezeDuration === '3m') d.setMonth(d.getMonth() + 3);
    else if (freezeDuration === '6m') d.setMonth(d.getMonth() + 6);
    else if (freezeDuration === '1y') d.setFullYear(d.getFullYear() + 1);
    return d.toISOString();
  };

  const handleFreezeToggle = async () => {
    if (!freezeTarget) return;
    const willFreeze = freezeTarget.status !== 'frozen';
    const frozenUntil = willFreeze ? computeFreezeUntil() : null;
    if (willFreeze && freezeDuration === 'custom' && !frozenUntil) {
      toast.error('Pick a custom unfreeze date, or choose Indefinite.');
      return;
    }
    if (USE_MOCKS) {
      const next: CompanyStatus = willFreeze ? ('frozen' as CompanyStatus) : 'active';
      setCompanies(prev => prev.map(t =>
        t.id === freezeTarget.id ? { ...t, status: next } : t
      ));
      toast.success(willFreeze ? `Froze ${freezeTarget.name}` : `Unfroze ${freezeTarget.name}`);
      setFreezeTarget(null); setFreezeReason('');
      setFreezeDuration('indefinite'); setFreezeCustomDate('');
      return;
    }
    setFreezing(true);
    try {
      if (willFreeze) {
        await platformApi.tenants.freeze(freezeTarget.id, {
          reason: freezeReason.trim() || null,
          frozenUntil,
        });
        toast.success(frozenUntil
          ? `Froze ${freezeTarget.name} — auto-unfreeze ${new Date(frozenUntil).toLocaleDateString()}`
          : `Froze ${freezeTarget.name} — writes now blocked`);
      } else {
        await platformApi.tenants.unfreeze(freezeTarget.id);
        toast.success(`Unfroze ${freezeTarget.name}`);
      }
      setFreezeTarget(null); setFreezeReason('');
      setFreezeDuration('indefinite'); setFreezeCustomDate('');
      await loadCompanies();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally { setFreezing(false); }
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
              {/* Business Base — industry preset. Multi-select: a
                  School with a canteen picks [school, pos]. Common
                  modules (User / Employee / Payment / Invoice /
                  Expense) stay on regardless — only industry
                  sidebar groups are Base-gated. V181. */}
              <div className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Business Base</div>
                    <TooltipProvider delayDuration={120}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-gray-400 hover:text-gray-600"
                            aria-label="Business Base help"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          Which industry sidebar groups this tenant sees. Pick one or
                          more. Turning a Base OFF later hides the UI but keeps the
                          underlying data.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {([
                    { key: 'pos'      as const, label: 'POS (Sale)', hint: 'Customers · Invoices · POS · Quotations · Vouchers' },
                    { key: 'school'   as const, label: 'School',     hint: 'Students · Classes · Enrollments · Tuition Bills' },
                    { key: 'hospital' as const, label: 'Hospital',   hint: 'Patients · Encounters · Medical Services · Medical Bills' },
                  ]).map(t => {
                    const on = bases.includes(t.key);
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => {
                          setBases(prev =>
                            prev.includes(t.key)
                              ? prev.filter(b => b !== t.key)
                              : [...prev, t.key]);
                        }}
                        className={`text-left rounded-md border px-3 py-2 transition-colors ${
                          on
                            ? 'border-blue-400 bg-blue-50 text-blue-900 ring-1 ring-blue-200'
                            : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        <div className="text-sm font-medium">{t.label}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{t.hint}</div>
                      </button>
                    );
                  })}
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
                <TableHead>Industry</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead className="min-w-[220px]">Usage</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.paginatedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-gray-400 py-10">
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
                    {(() => {
                      // Industry chip derived from Business Base(s) —
                      // V181 / v-business-base-picker. Multi-base tenants
                      // (POS + School, etc.) show the "Multi" chip; a
                      // tenant with no Base shows "—".
                      const b = basesByTenant[c.id] ?? [];
                      if (b.length === 0) return <span className="text-xs text-gray-400">—</span>;
                      if (b.length > 1) {
                        return (
                          <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-700 bg-purple-50 capitalize" title={b.join(' + ')}>
                            Multi
                          </Badge>
                        );
                      }
                      const one = b[0];
                      const cls =
                        one === 'pos'      ? 'border-blue-300 text-blue-700 bg-blue-50'   :
                        one === 'school'   ? 'border-indigo-300 text-indigo-700 bg-indigo-50' :
                                             'border-teal-300 text-teal-700 bg-teal-50';
                      const label = one === 'pos' ? 'POS' : one.charAt(0).toUpperCase() + one.slice(1);
                      return <Badge variant="outline" className={`text-[10px] capitalize ${cls}`}>{label}</Badge>;
                    })()}
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
                  {/* v-tenant-freeze-schedule — Schedule column. Only
                      populated for frozen tenants; the date shown is
                      the nightly-auto-unfreeze deadline. Indefinite
                      freezes read "Indefinite" so the SA can tell
                      apart "set for a date" vs "manual lift only".
                      Non-frozen tenants keep the cell empty (em-dash)
                      so the column doesn't disappear on data reshape. */}
                  <TableCell className="text-xs">
                    {c.status === 'frozen'
                      ? (c.frozenUntil
                          ? (
                            <span className="inline-flex items-center gap-1 text-amber-800">
                              <Snowflake className="h-3 w-3" />
                              {new Date(c.frozenUntil).toLocaleDateString()}
                            </span>
                          )
                          : <span className="text-gray-500 italic">Indefinite</span>)
                      : <span className="text-gray-300">—</span>}
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
                      {/* v-tenant-freeze — read-only lockout. Distinct
                          from Suspend (which blocks login entirely). */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 w-7 p-0 ${c.status === 'frozen' ? 'text-yellow-600 hover:bg-yellow-50' : 'text-sky-700 hover:bg-sky-50'}`}
                        onClick={() => { setFreezeTarget(c); setFreezeReason(''); }}
                        title={c.status === 'frozen' ? 'Unfreeze (restore write access)' : 'Freeze (read-only)'}
                        disabled={c.status === 'cancelled' || c.status === 'suspended'}
                      >
                        {c.status === 'frozen' ? <Sun className="h-3.5 w-3.5" /> : <Snowflake className="h-3.5 w-3.5" />}
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

      {/* v-tenant-freeze — Freeze / Unfreeze confirmation */}
      <AlertDialog open={!!freezeTarget} onOpenChange={(o) => { if (!o) { setFreezeTarget(null); setFreezeReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {freezeTarget?.status === 'frozen' ? 'Unfreeze' : 'Freeze'} {freezeTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {freezeTarget?.status === 'frozen'
                ? 'Users regain full write access — creates, updates, and deletes work again.'
                : 'Every write (create / update / delete) will be blocked with 423 across the whole tenant until you unfreeze. Users can still log in and view.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {freezeTarget?.status !== 'frozen' && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="freeze-duration" className="text-xs">Freeze for</Label>
                {/* v-tenant-freeze-schedule — a nightly job on the
                    BE auto-unfreezes the tenant at this deadline.
                    Indefinite keeps the original manual-unfreeze
                    behaviour. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {([
                    ['indefinite', 'Indefinite'],
                    ['1m',         '1 month'],
                    ['3m',         '3 months'],
                    ['6m',         '6 months'],
                    ['1y',         '1 year'],
                    ['custom',     'Custom date'],
                  ] as const).map(([key, label]) => (
                    <Button
                      key={key} type="button" size="sm"
                      variant={freezeDuration === key ? 'default' : 'outline'}
                      onClick={() => setFreezeDuration(key)}
                      className="h-7 px-2 text-[11px]"
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {freezeDuration === 'custom' ? (
                  <Input
                    type="date"
                    value={freezeCustomDate}
                    onChange={e => setFreezeCustomDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className="h-8 w-40 text-sm mt-1"
                  />
                ) : freezeDuration === 'indefinite' ? (
                  <p className="text-[11px] text-gray-500 mt-1">
                    Stays frozen until you unfreeze it manually.
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-500 mt-1">
                    Auto-unfreezes on {(() => {
                      const d = new Date();
                      if      (freezeDuration === '1m') d.setMonth(d.getMonth() + 1);
                      else if (freezeDuration === '3m') d.setMonth(d.getMonth() + 3);
                      else if (freezeDuration === '6m') d.setMonth(d.getMonth() + 6);
                      else if (freezeDuration === '1y') d.setFullYear(d.getFullYear() + 1);
                      return d.toLocaleDateString();
                    })()}
                    .
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="freeze-reason" className="text-xs">Reason (optional — audit note)</Label>
                <Input
                  id="freeze-reason"
                  placeholder="e.g. Non-payment / compliance hold / migration"
                  value={freezeReason}
                  onChange={e => setFreezeReason(e.target.value)}
                  maxLength={500}
                />
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={freezing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFreezeToggle} disabled={freezing}>
              {freezeTarget?.status === 'frozen' ? 'Unfreeze' : 'Freeze'}
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
      <span className="tabular-nums">{format(used)}</span>
      <span className="text-gray-400">/</span>
      <span className={`tabular-nums ${willExceed ? 'text-red-700 font-semibold' : changed ? 'text-green-700' : 'text-gray-600'}`}>
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
