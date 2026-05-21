import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';

import * as platformApi from '../../../api/platform';
import {
  platformPayrollCategories,
  type PayrollCategory,
  type PayrollCategoryCreate,
} from '../../../api/platformSettings';
import { Card, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import { Switch } from '../../ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';

/**
 * Super Admin · Payroll Categories — pick a tenant from the top
 * dropdown, edit its earning + deduction rows. Wraps the same
 * service the tenant operators use; the platform endpoint just
 * overrides {@link com.hrms.common.tenant.TenantContext} to the
 * picked tenant before delegating.
 */
export function PlatformPayrollCategories() {
  const [tenants, setTenants] = useState<platformApi.PlatformTenant[]>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const [rows, setRows] = useState<PayrollCategory[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingTenants(true);
      try {
        const ts = await platformApi.tenants.list();
        setTenants(ts);
        if (ts.length > 0 && !tenantId) setTenantId(ts[0].id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load tenants');
      } finally {
        setLoadingTenants(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoadingRows(true);
      try {
        const list = await platformPayrollCategories.list(tenantId);
        if (!cancelled) setRows(list);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load categories');
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const earnings   = useMemo(() => rows.filter(r => r.kind === 'earning'),   [rows]);
  const deductions = useMemo(() => rows.filter(r => r.kind === 'deduction'), [rows]);

  const handleToggle = async (row: PayrollCategory, enabled: boolean) => {
    const prev = rows;
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, enabled } : r));
    try {
      await platformPayrollCategories.update(tenantId, row.id, { enabled });
    } catch (err) {
      setRows(prev);
      toast.error(err instanceof Error ? err.message : 'Failed to toggle category');
    }
  };

  const handleDelete = async (row: PayrollCategory) => {
    if (row.system) {
      toast.error('System categories cannot be deleted, only disabled.');
      return;
    }
    if (!confirm(`Delete category "${row.label}"? This is permanent.`)) return;
    const prev = rows;
    setRows(rs => rs.filter(r => r.id !== row.id));
    try {
      await platformPayrollCategories.remove(tenantId, row.id);
    } catch (err) {
      setRows(prev);
      toast.error(err instanceof Error ? err.message : 'Failed to delete category');
    }
  };

  const handleRestoreDefaults = async () => {
    if (!confirm('Restore default categories? User-added rows on this tenant will be removed; system rows reset to canonical labels.')) return;
    setLoadingRows(true);
    try {
      const fresh = await platformPayrollCategories.restoreDefaults(tenantId);
      setRows(fresh);
      toast.success('Defaults restored');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore defaults');
    } finally {
      setLoadingRows(false);
    }
  };

  const handleCreated = (created: PayrollCategory) => {
    setRows(rs => [...rs, created]);
    setAddOpen(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Tenant</Label>
              <Select value={tenantId} onValueChange={setTenantId} disabled={loadingTenants || tenants.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingTenants ? 'Loading…' : 'Select a tenant'} />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} <span className="text-xs text-gray-500">· {t.slug}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleRestoreDefaults} disabled={!tenantId || loadingRows}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Restore Defaults
            </Button>
            <Button onClick={() => setAddOpen(true)} disabled={!tenantId}>
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            Pick a tenant to view and edit its earning + deduction lines. Changes go straight to that tenant's <code>payroll_categories</code> table.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CategoryTable title="Earnings" rows={earnings}   loading={loadingRows} onToggle={handleToggle} onDelete={handleDelete} />
        <CategoryTable title="Deductions" rows={deductions} loading={loadingRows} onToggle={handleToggle} onDelete={handleDelete} />
      </div>

      {tenantId && (
        <AddCategoryDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onCreated={handleCreated}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}

function CategoryTable({
  title, rows, loading, onToggle, onDelete,
}: {
  title: string;
  rows: PayrollCategory[];
  loading: boolean;
  onToggle: (row: PayrollCategory, enabled: boolean) => void;
  onDelete: (row: PayrollCategory) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 text-sm font-medium flex items-center justify-between">
          <span>{title}</span>
          <Badge variant="outline" className="text-[11px]">{rows.length}</Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Default</TableHead>
              <TableHead className="text-center w-16">Enabled</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-6">
                  <Loader2 className="inline h-4 w-4 animate-spin mr-1" /> Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-6">
                  No {title.toLowerCase()} for this tenant.
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.map(r => (
              <TableRow key={r.id}>
                <TableCell>
                  <span className="font-medium">{r.label}</span>
                  {r.system && <Badge variant="outline" className="ml-2 text-[10px]">built-in</Badge>}
                </TableCell>
                <TableCell><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.code}</code></TableCell>
                <TableCell className="text-sm text-gray-600 capitalize">{r.valueType}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {r.valueType === 'percentage' ? `${r.defaultAmount}%` :
                   r.valueType === 'day'        ? `${r.defaultAmount} days` :
                                                  r.defaultAmount.toLocaleString()}
                </TableCell>
                <TableCell className="text-center">
                  <Switch checked={r.enabled} onCheckedChange={(v) => onToggle(r, v)} />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={r.system}
                    title={r.system ? 'System categories cannot be deleted' : 'Delete'}
                    onClick={() => onDelete(r)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AddCategoryDialog({
  open, onOpenChange, onCreated, tenantId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: PayrollCategory) => void;
  tenantId: string;
}) {
  const [form, setForm] = useState<PayrollCategoryCreate>({
    code: '', label: '', kind: 'earning', valueType: 'flat', defaultAmount: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ code: '', label: '', kind: 'earning', valueType: 'flat', defaultAmount: 0 });
  }, [open]);

  const handleSave = async () => {
    if (!form.code.trim() || !form.label.trim()) {
      toast.error('Code and label are required');
      return;
    }
    setSaving(true);
    try {
      const created = await platformPayrollCategories.create(tenantId, {
        ...form,
        code: form.code.trim().toLowerCase().replace(/\s+/g, '_'),
        label: form.label.trim(),
      });
      toast.success(`Created ${created.label}`);
      onCreated(created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Payroll Category</DialogTitle>
          <DialogDescription>For the currently picked tenant only. Code must be unique within its kind.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Label</Label>
            <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Health Insurance" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Code</Label>
            <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="health_insurance" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Kind</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as 'earning' | 'deduction' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="earning">Earning</SelectItem>
                  <SelectItem value="deduction">Deduction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={form.valueType} onValueChange={(v) => setForm({ ...form, valueType: v as 'flat' | 'percentage' | 'day' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Fixed amount</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="day">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default amount</Label>
            <Input type="number" min={0} step="0.01" value={form.defaultAmount ?? 0}
                   onChange={e => setForm({ ...form, defaultAmount: parseFloat(e.target.value) || 0 })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
