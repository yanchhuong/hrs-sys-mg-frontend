import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import {
  ListTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../ui/alert-dialog';
import { Plus, Pencil, Trash2, Layers, Users, HardDrive, Server, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import * as platformApi from '../../../api/platform';
import { TableBodySkeletonRows } from '../../common/LoadingSkeletons';
import { StatCard } from '../../common/StatCard';
import { NumericInput } from '../../common/NumericInput';
import { ListEmpty, ListError } from '../../common/ListStates';

/** Cents → $X.XX. Server stores prices in cents to avoid float drift; UI
 *  shows dollars for the admin. Free plans render as "Free". */
const fmtUsd = (cents: number) =>
  cents === 0 ? 'Free' : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

/** Bytes-aware formatting for the storage cap. */
const fmtStorage = (mb: number) => {
  if (mb >= 1024 * 1024) return `${(mb / (1024 * 1024)).toFixed(1)} TB`;
  if (mb >= 1024)        return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
};

type FormState = {
  /** Empty when editing — the slug is taken from `editingTier` and the
   *  field is disabled in the dialog. */
  planTier: string;
  maxEmployees: string;
  maxStorageMb: string;
  maxLocalInstalls: string;
  /** Edited as dollars in the UI; converted to cents on submit. */
  priceDollars: string;
  /** V305 — user (login) cap for this plan tier. Blank / 0 = unlimited. */
  maxUsers: string;
  /** V305 — stock-item catalogue cap. Blank / 0 = unlimited. */
  maxItems: string;
};

const EMPTY: FormState = {
  planTier: '', maxEmployees: '', maxStorageMb: '', maxLocalInstalls: '', priceDollars: '',
  maxUsers: '', maxItems: '',
};

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);

export function Plans() {
  const [plans, setPlans] = useState<platformApi.PlanLimits[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<platformApi.PlanLimits | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await platformApi.plans.list();
      // Sort by price ASC so Free → Enterprise reads top to bottom.
      setPlans([...list].sort((a, b) => a.monthlyPriceCents - b.monthlyPriceCents));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const totalTenants = useMemo(
    () => plans.reduce((sum, p) => sum + (p.tenantsOnPlan ?? 0), 0),
    [plans],
  );

  const openCreate = () => {
    setEditingTier(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (p: platformApi.PlanLimits) => {
    setEditingTier(p.planTier);
    setForm({
      planTier: p.planTier,
      maxEmployees: String(p.maxEmployees),
      maxStorageMb: String(p.maxStorageMb),
      maxLocalInstalls: String(p.maxLocalInstalls),
      priceDollars: (p.monthlyPriceCents / 100).toFixed(2),
      maxUsers: String(p.maxUsers ?? 0),
      maxItems: String(p.maxItems ?? 0),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const slug = editingTier ?? slugify(form.planTier);
    if (!editingTier) {
      if (!slug || !/^[a-z][a-z0-9-]{1,31}$/.test(slug)) {
        toast.error('Plan slug must start with a lowercase letter, 2–32 chars (a–z, 0–9, -)');
        return;
      }
    }
    const maxEmployees     = parseInt(form.maxEmployees, 10);
    const maxStorageMb     = parseInt(form.maxStorageMb, 10);
    const maxLocalInstalls = parseInt(form.maxLocalInstalls, 10);
    const dollars          = parseFloat(form.priceDollars);
    // V305 — blank field on the two new caps means "unlimited"; the
    // BE stores that as 0 (matches the other quota columns). Old
    // plans that predate V305 also come back as 0, keeping their
    // behaviour unchanged.
    const maxUsers = form.maxUsers.trim() === '' ? 0 : parseInt(form.maxUsers, 10);
    const maxItems = form.maxItems.trim() === '' ? 0 : parseInt(form.maxItems, 10);
    if (![maxEmployees, maxStorageMb, maxLocalInstalls, dollars, maxUsers, maxItems]
          .every(n => Number.isFinite(n) && n >= 0)) {
      toast.error('All numeric fields must be ≥ 0');
      return;
    }
    const req: platformApi.PlanRequest = {
      planTier: slug,
      maxEmployees,
      maxStorageMb,
      maxLocalInstalls,
      // Round to whole cents — JS float math otherwise produces 4999.999…
      monthlyPriceCents: Math.round(dollars * 100),
      maxUsers,
      maxItems,
    };
    setSubmitting(true);
    try {
      if (editingTier) {
        await platformApi.plans.update(editingTier, req);
        toast.success(`Updated plan "${editingTier}"`);
      } else {
        await platformApi.plans.create(req);
        toast.success(`Created plan "${slug}"`);
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await platformApi.plans.remove(target.planTier);
      toast.success(`Deleted plan "${target.planTier}"`);
      await load();
    } catch (err) {
      // Backend returns 409 with the in-use message — show it verbatim
      // so the admin knows exactly how many tenants are blocking.
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="stat-strip">
        <StatCard label="Plans" value={plans.length} icon={Layers} tone="blue" />
        <StatCard label="Tenants on a plan" value={totalTenants} icon={Users} tone="green" />
        <StatCard
          label="Highest price"
          value={fmtUsd(plans.reduce((m, p) => Math.max(m, p.monthlyPriceCents), 0))}
          icon={DollarSign} tone="purple"
        />
        <StatCard
          label="Largest storage cap"
          value={fmtStorage(plans.reduce((m, p) => Math.max(m, p.maxStorageMb), 0))}
          icon={HardDrive} tone="amber"
        />
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-600" />
              Price Plans
            </CardTitle>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Plan
          </Button>
        </CardHeader>
        <CardContent>
          <ListTable>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Price / month</TableHead>
                <TableHead className="text-right">Max employees</TableHead>
                <TableHead className="text-right">Storage</TableHead>
                <TableHead className="text-right">Local installs</TableHead>
                <TableHead className="text-right">Max users</TableHead>
                <TableHead className="text-right">Max items</TableHead>
                <TableHead className="text-center">Adoption</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && plans.length === 0 && (
                <TableBodySkeletonRows rows={5} columns={9} />
              )}
              {!loading && loadError && plans.length === 0 && (
                <ListError message={loadError} onRetry={() => void load()} colSpan={9} />
              )}
              {!loading && !loadError && plans.length === 0 && (
                <ListEmpty noun="plans" colSpan={9} />
              )}
              {plans.map(p => {
                const inUse = p.tenantsOnPlan ?? 0;
                return (
                  <TableRow key={p.planTier}>
                    <TableCell className="font-medium tabular-nums text-sm">{p.planTier}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {fmtUsd(p.monthlyPriceCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <Users className="h-3.5 w-3.5 text-gray-400" />
                        {p.maxEmployees.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <HardDrive className="h-3.5 w-3.5 text-gray-400" />
                        {fmtStorage(p.maxStorageMb)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <Server className="h-3.5 w-3.5 text-gray-400" />
                        {p.maxLocalInstalls}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {(p.maxUsers ?? 0) > 0
                        ? (p.maxUsers ?? 0).toLocaleString()
                        : <span className="text-gray-400">Unlimited</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {(p.maxItems ?? 0) > 0
                        ? (p.maxItems ?? 0).toLocaleString()
                        : <span className="text-gray-400">Unlimited</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {inUse === 0 ? (
                        <span className="text-xs text-gray-400">unused</span>
                      ) : (
                        <Badge className="bg-emerald-50 text-emerald-700 border-0">
                          {inUse} tenant{inUse === 1 ? '' : 's'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(p)}
                        disabled={inUse > 0}
                        title={inUse > 0 ? `Used by ${inUse} tenant${inUse === 1 ? '' : 's'} — reassign before deleting` : 'Delete'}
                        className={inUse > 0 ? 'h-7 w-7' : 'h-7 w-7 text-red-600 hover:text-red-700'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </ListTable>
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTier ? `Edit "${editingTier}"` : 'New Price Plan'}</DialogTitle>
            <DialogDescription>
              {editingTier
                ? "Limits and price update immediately. The plan slug is the primary key and can't change — create a new plan if you need a different slug."
                : 'Define a tier tenants can subscribe to. Limits are enforced at usage time; price shows on monthly invoices.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="plan-slug">Slug {editingTier && <span className="text-xs text-gray-400">(immutable)</span>}</Label>
              <Input
                id="plan-slug"
                value={form.planTier}
                onChange={e => setForm({ ...form, planTier: slugify(e.target.value) })}
                placeholder="e.g. business"
                disabled={!!editingTier}
                className="tabular-nums text-sm"
              />
              <p className="text-[11px] text-gray-500">Lowercase a–z, 0–9, dashes. 2–32 chars.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-price">Price per month (USD)</Label>
              <NumericInput
                id="plan-price"
                decimals={2}
                value={form.priceDollars}
                onChange={v => setForm({ ...form, priceDollars: v })}
                placeholder="29.00"
              />
              <p className="text-[11px] text-gray-500">Enter <code>0</code> for a free tier.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="plan-employees">Max employees</Label>
                <NumericInput
                  id="plan-employees"
                  decimals={0}
                  value={form.maxEmployees}
                  onChange={v => setForm({ ...form, maxEmployees: v })}
                  placeholder="50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-installs">Max local installs</Label>
                <NumericInput
                  id="plan-installs"
                  decimals={0}
                  value={form.maxLocalInstalls}
                  onChange={v => setForm({ ...form, maxLocalInstalls: v })}
                  placeholder="1"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-storage">Max storage (MB)</Label>
              <NumericInput
                id="plan-storage"
                decimals={0}
                value={form.maxStorageMb}
                onChange={v => setForm({ ...form, maxStorageMb: v })}
                placeholder="1024"
              />
              <p className="text-[11px] text-gray-500">
                e.g. <code>1024</code> = 1 GB · <code>10240</code> = 10 GB.
              </p>
            </div>

            {/* V305 — user + item caps. Same zero-as-unlimited
                convention as Max employees; blank field is treated
                as zero on submit for a friendlier "leave it open"
                UX than requiring "0". */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="plan-users">Max users</Label>
                <NumericInput
                  id="plan-users"
                  decimals={0}
                  value={form.maxUsers}
                  onChange={v => setForm({ ...form, maxUsers: v })}
                  placeholder="25"
                />
                <p className="text-[11px] text-gray-500">
                  Login accounts on this tenant. <code>0</code> or blank = unlimited.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-items">Max items</Label>
                <NumericInput
                  id="plan-items"
                  decimals={0}
                  value={form.maxItems}
                  onChange={v => setForm({ ...form, maxItems: v })}
                  placeholder="1000"
                />
                <p className="text-[11px] text-gray-500">
                  Stock-item catalogue rows. <code>0</code> or blank = unlimited.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving…' : editingTier ? 'Save changes' : 'Create plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete plan "{deleteTarget?.planTier}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The plan disappears from the catalogue. New tenants can't pick it,
              but existing tenants on this plan would break — so the delete is
              blocked server-side until no tenant references it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
