import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';

import * as platformApi from '../../../api/platform';
import { platformHolidays, type Holiday, type HolidayRequest } from '../../../api/platformSettings';
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
 * Super Admin · Holidays — pick a tenant from the top dropdown, manage
 * its public + company holiday list. Year filter defaults to current
 * year so HR doesn't drown in historical entries from long-running
 * tenants.
 */
export function PlatformHolidays() {
  const currentYear = new Date().getFullYear();
  const [tenants, setTenants] = useState<platformApi.PlatformTenant[]>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const [year, setYear] = useState<number>(currentYear);
  const [rows, setRows] = useState<Holiday[]>([]);
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
        const list = await platformHolidays.list(tenantId, year);
        if (!cancelled) setRows(list);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load holidays');
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId, year]);

  const handleDelete = async (row: Holiday) => {
    if (!confirm(`Delete "${row.name}" (${row.date})?`)) return;
    const prev = rows;
    setRows(rs => rs.filter(r => r.id !== row.id));
    try {
      await platformHolidays.remove(tenantId, row.id);
    } catch (err) {
      setRows(prev);
      toast.error(err instanceof Error ? err.message : 'Failed to delete holiday');
    }
  };

  const handleTogglePaid = async (row: Holiday, paid: boolean) => {
    const prev = rows;
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, paid } : r));
    try {
      await platformHolidays.update(tenantId, row.id, {
        name: row.name,
        date: row.date,
        type: row.type as 'public' | 'company',
        paid,
        description: row.description ?? undefined,
      });
    } catch (err) {
      setRows(prev);
      toast.error(err instanceof Error ? err.message : 'Failed to toggle paid');
    }
  };

  const handleCreated = (created: Holiday) => {
    setRows(rs => [...rs, created].sort((a, b) => a.date.localeCompare(b.date)));
    setAddOpen(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_auto] gap-3 items-end">
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
            <div className="space-y-1">
              <Label className="text-xs">Year</Label>
              <Input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={e => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) setYear(n);
                }}
              />
            </div>
            <Button onClick={() => setAddOpen(true)} disabled={!tenantId}>
              <Plus className="h-4 w-4 mr-2" />
              Add Holiday
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 text-sm font-medium flex items-center justify-between">
            <span>Holidays {year}</span>
            <Badge variant="outline" className="text-[11px]">{rows.length}</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center w-16">Paid</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingRows && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-6">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-1" /> Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loadingRows && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-6">
                    No holidays for {year}.
                  </TableCell>
                </TableRow>
              )}
              {!loadingRows && rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.date}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-[11px]">{r.type}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={r.paid} onCheckedChange={(v) => handleTogglePaid(r, v)} />
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">{r.description ?? '—'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(r)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {tenantId && (
        <AddHolidayDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onCreated={handleCreated}
          tenantId={tenantId}
          defaultYear={year}
        />
      )}
    </div>
  );
}

function AddHolidayDialog({
  open, onOpenChange, onCreated, tenantId, defaultYear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: Holiday) => void;
  tenantId: string;
  defaultYear: number;
}) {
  const [form, setForm] = useState<HolidayRequest>({
    name: '', date: `${defaultYear}-01-01`, type: 'public', paid: true, description: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ name: '', date: `${defaultYear}-01-01`, type: 'public', paid: true, description: '' });
  }, [open, defaultYear]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.date) {
      toast.error('Name and date are required');
      return;
    }
    setSaving(true);
    try {
      const created = await platformHolidays.create(tenantId, {
        ...form,
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
      });
      toast.success(`Added ${created.name}`);
      onCreated(created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create holiday');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Holiday</DialogTitle>
          <DialogDescription>For the currently picked tenant.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="King's Birthday" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as 'public' | 'company' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="paid" checked={form.paid ?? true} onCheckedChange={(v) => setForm({ ...form, paid: v })} />
            <Label htmlFor="paid" className="text-xs">Paid holiday</Label>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description (optional)</Label>
            <Input value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Annual public holiday…" />
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
