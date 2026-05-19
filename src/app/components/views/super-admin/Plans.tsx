import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
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

/** Cents → $X.XX. Server stores prices in cents to avoid float drift; UI
 *  shows dollars for the admin. Free plans render as "Free". */
const fmtUsd = (cents: number) =>
  cents === 0 ? 'Free' : `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

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
};

const EMPTY: FormState = {
  planTier: '', maxEmployees: '', maxStorageMb: '', maxLocalInstalls: '', priceDollars: '',
};

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);

export function Plans() {
  const [plans, setPlans] = useState<platformApi.PlanLimits[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<platformApi.PlanLimits | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await platformApi.plans.list();
      // Sort by price ASC so Free → Enterprise reads top to bottom.
      setPlans([...list].sort((a, b) => a.monthlyPriceCents - b.monthlyPriceCents));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load plans');
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
    if (![maxEmployees, maxStorageMb, maxLocalInstalls, dollars].every(n => Number.isFinite(n) && n >= 0)) {
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Plans" value={String(plans.length)} Icon={Layers} tone="text-blue-700" />
        <StatCard label="Tenants on a plan" value={String(totalTenants)} Icon={Users} tone="text-emerald-700" />
        <StatCard
          label="Highest price"
          value={fmtUsd(plans.reduce((m, p) => Math.max(m, p.monthlyPriceCents), 0))}
          Icon={DollarSign} tone="text-violet-700"
        />
        <StatCard
          label="Largest storage cap"
          value={fmtStorage(plans.reduce((m, p) => Math.max(m, p.maxStorageMb), 0))}
          Icon={HardDrive} tone="text-amber-700"
        />
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-600" />
              Price Plans
            </CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Manage the catalogue tenants choose from on signup or plan change.
              Limits are enforced at usage time; the price column drives the
              tenant's monthly subscription line.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Plan
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Price / month</TableHead>
                <TableHead className="text-right">Max employees</TableHead>
                <TableHead className="text-right">Storage</TableHead>
                <TableHead className="text-right">Local installs</TableHead>
                <TableHead className="text-center">Adoption</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && plans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-gray-400 py-10">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && plans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-gray-400 py-10">
                    No plans yet. Click <span className="font-medium">New Plan</span> to add one.
                  </TableCell>
                </TableRow>
              )}
              {plans.map(p => {
                const inUse = p.tenantsOnPlan ?? 0;
                return (
                  <TableRow key={p.planTier}>
                    <TableCell className="font-medium font-mono text-sm">{p.planTier}</TableCell>
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
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(p)}
                        disabled={inUse > 0}
                        title={inUse > 0 ? `Used by ${inUse} tenant${inUse === 1 ? '' : 's'} — reassign before deleting` : 'Delete'}
                        className={inUse > 0 ? '' : 'text-red-600 hover:text-red-700'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-gray-500">Lowercase a–z, 0–9, dashes. 2–32 chars.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-price">Price per month (USD)</Label>
              <Input
                id="plan-price"
                type="number"
                step="0.01"
                min="0"
                value={form.priceDollars}
                onChange={e => setForm({ ...form, priceDollars: e.target.value })}
                placeholder="29.00"
              />
              <p className="text-[11px] text-gray-500">Enter <code>0</code> for a free tier.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="plan-employees">Max employees</Label>
                <Input
                  id="plan-employees"
                  type="number"
                  min="0"
                  value={form.maxEmployees}
                  onChange={e => setForm({ ...form, maxEmployees: e.target.value })}
                  placeholder="50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-installs">Max local installs</Label>
                <Input
                  id="plan-installs"
                  type="number"
                  min="0"
                  value={form.maxLocalInstalls}
                  onChange={e => setForm({ ...form, maxLocalInstalls: e.target.value })}
                  placeholder="1"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-storage">Max storage (MB)</Label>
              <Input
                id="plan-storage"
                type="number"
                min="0"
                value={form.maxStorageMb}
                onChange={e => setForm({ ...form, maxStorageMb: e.target.value })}
                placeholder="1024"
              />
              <p className="text-[11px] text-gray-500">
                e.g. <code>1024</code> = 1 GB · <code>10240</code> = 10 GB.
              </p>
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

function StatCard({ label, value, Icon, tone }: { label: string; value: string; Icon: typeof Layers; tone: string }) {
  return (
    <Card className="border-gray-200">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Icon className={`h-5 w-5 ${tone}`} />
          <span className={`text-2xl font-bold ${tone}`}>{value}</span>
        </div>
        <p className="text-xs font-medium text-gray-700 truncate">{label}</p>
      </CardContent>
    </Card>
  );
}
