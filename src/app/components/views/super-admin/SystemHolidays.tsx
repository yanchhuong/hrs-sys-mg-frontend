import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Globe, Info } from 'lucide-react';

import * as api from '../../../api/systemHolidays';
import { useConfirm } from '../../../context/ConfirmContext';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';

/**
 * Super Admin · System Holidays — single shared catalog visible to
 * every tenant (read-only on the tenant side, with a "Copy" action
 * per row that clones into their own holidays table). Seeding here
 * means a freshly-provisioned tenant immediately has a usable
 * calendar without manual setup.
 */
export function SystemHolidays() {
  const confirm = useConfirm();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [rows, setRows] = useState<api.SystemHoliday[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await api.adminList(year));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load system holidays');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [year]);

  const togglePaid = async (r: api.SystemHoliday, next: boolean) => {
    try {
      const updated = await api.adminUpdate(r.id, {
        name: r.name, date: r.date, type: r.type, isPaid: next, description: r.description ?? undefined,
      });
      setRows(prev => prev.map(x => x.id === r.id ? updated : x));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleDelete = async (r: api.SystemHoliday) => {
    if (!(await confirm({
      title: `Remove "${r.name}" (${r.date}) from the system catalog?`,
      message: 'Tenants who already copied it keep their copy.',
      variant: 'destructive',
      confirmLabel: 'Remove',
    }))) return;
    try {
      await api.adminDelete(r.id);
      setRows(prev => prev.filter(x => x.id !== r.id));
      toast.success('Removed from catalog');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <div className="flex items-start gap-3">
          <div className="bg-blue-50 p-2 rounded-md">
            <Globe className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              System Holidays
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" tabIndex={-1}
                      className="text-gray-400 hover:text-gray-600" aria-label="About system holidays">
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-sm">
                    Shared, system-wide holiday catalog. Every tenant —
                    including freshly created ones — sees these
                    automatically and can one-click <strong>Copy</strong>
                    any of them into their own holidays table to
                    customise (change paid flag, add notes, …).
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </h1>
            <p className="text-sm text-gray-500">
              Single source of truth. Edits here don't touch a tenant's
              already-copied rows; deletes leave existing copies alone.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Year</Label>
              <Input type="number" min={2000} max={2100} value={year}
                onChange={e => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) setYear(n);
                }} className="w-28" />
            </div>
            <div className="flex-1" />
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Holiday
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 text-sm font-medium flex items-center justify-between">
            <span>Catalog · {year}</span>
            <Badge variant="outline" className="text-[11px]">{rows.length}</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px]">Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead className="w-[100px] text-center">Status</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-gray-500 py-6">
                  <Loader2 className="inline h-4 w-4 animate-spin mr-1" /> Loading…
                </TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-gray-500 py-6">
                  No system holidays for {year}. Click <strong>Add Holiday</strong> to seed the first one.
                </TableCell></TableRow>
              )}
              {!loading && rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums text-xs">{r.date}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-[11px]">{r.type}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <button type="button" onClick={() => togglePaid(r, !r.isPaid)}
                      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded border transition ${
                        r.isPaid
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                      }`} title="Click to toggle">
                      {r.isPaid ? 'Paid' : 'Unpaid'}
                    </button>
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

      <AddDialog open={addOpen} onOpenChange={setAddOpen} defaultYear={year}
        onCreated={(c) => { setRows(prev => [...prev, c].sort((a, b) => a.date.localeCompare(b.date))); }} />
    </div>
  );
}

function AddDialog({
  open, onOpenChange, onCreated, defaultYear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: api.SystemHoliday) => void;
  defaultYear: number;
}) {
  const [form, setForm] = useState<api.SystemHolidayRequest>({
    name: '', date: `${defaultYear}-01-01`, type: 'public', isPaid: true, description: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ name: '', date: `${defaultYear}-01-01`, type: 'public', isPaid: true, description: '' });
  }, [open, defaultYear]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.date) {
      toast.error('Name and date are required');
      return;
    }
    setSaving(true);
    try {
      const created = await api.adminCreate({
        ...form,
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
      });
      toast.success(`Added ${created.name} to the catalog`);
      onCreated(created);
      onOpenChange(false);
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
          <DialogTitle>Add to System Catalog</DialogTitle>
          <DialogDescription>Visible to every tenant on save.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Khmer New Year" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={form.type ?? 'public'} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="paid" checked={form.isPaid ?? true} onCheckedChange={(v) => setForm({ ...form, isPaid: v })} />
            <Label htmlFor="paid" className="text-xs">Paid holiday</Label>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description (optional)</Label>
            <Input value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Annual public holiday…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
