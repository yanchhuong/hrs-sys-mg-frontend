import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Percent, Loader2, Plus, RefreshCw, Trash2, Edit3 } from 'lucide-react';
import { commission } from '../../api/commission';
import type {
  CommissionProgram, CommissionType, CommissionStatus, UpsertCommissionProgram,
} from '../../api/commission';

const TYPE_META: Record<CommissionType, { label: string; hint: string; cls: string }> = {
  PER_INVOICE: { label: 'Per Invoice', hint: 'One payout per invoice (% or $ of the total).',          cls: 'border-blue-200 bg-blue-50 text-blue-700' },
  PER_ITEM:    { label: 'Per Item',    hint: 'Payout calculated per line item on the invoice.',        cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  TIERED:      { label: 'Tiered',      hint: 'Different rates based on invoice total or seller tier.', cls: 'border-purple-200 bg-purple-50 text-purple-700' },
};

const STATUS_META: Record<CommissionStatus, { label: string; cls: string }> = {
  ACTIVE:   { label: 'Active',   cls: 'bg-green-100 text-green-800' },
  INACTIVE: { label: 'Inactive', cls: 'bg-gray-100 text-gray-700' },
};

/**
 * v-commission-mvp — Sales-commission plans. MVP shape matches the
 * loyalty settings page: one flat list, per-row Edit / Delete, an
 * Upsert dialog behind the New button. Rate + tier tables land in
 * a follow-up once the UX proves out here.
 */
export function Commission() {
  const [rows, setRows] = useState<CommissionProgram[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CommissionProgram | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await commission.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load commission plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openNew  = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (r: CommissionProgram) => { setEditing(r); setDialogOpen(true); };
  const doDelete = async (r: CommissionProgram) => {
    if (!confirm(`Delete "${r.name}"? Existing payouts stay in reports; new commissions stop accruing.`)) return;
    try {
      await commission.remove(r.id);
      toast.success('Plan deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-emerald-600" />
            <CardTitle>Commission Plans</CardTitle>
            <span className="text-xs text-gray-500">
              Sales-commission rules per tenant. Applied to invoices at posting time.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1.5" /> New plan
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              No commission plans yet. Click <b>New plan</b> to create one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => {
                  const t = TYPE_META[r.type];
                  const s = STATUS_META[r.status];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={t.cls}>{t.label}</Badge>
                        <div className="text-[11px] text-gray-500 mt-1">{t.hint}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={s.cls}>{s.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => doDelete(r)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CommissionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => { setDialogOpen(false); void load(); }}
      />
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Upsert dialog                                                  */
/* -------------------------------------------------------------- */

function CommissionDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CommissionProgram | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<CommissionType>('PER_INVOICE');
  const [status, setStatus] = useState<CommissionStatus>('ACTIVE');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setType(editing?.type ?? 'PER_INVOICE');
      setStatus(editing?.status ?? 'ACTIVE');
    }
  }, [open, editing]);

  const submit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const body: UpsertCommissionProgram = { name: name.trim(), type, status };
      if (editing) {
        await commission.update(editing.id, body);
        toast.success('Plan updated');
      } else {
        await commission.create(body);
        toast.success('Plan created');
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Commission Plan' : 'New Commission Plan'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="e.g. Cashier — 2% of sale"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label>Type *</Label>
            <Select value={type} onValueChange={v => setType(v as CommissionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_META) as CommissionType[]).map(k => (
                  <SelectItem key={k} value={k}>
                    <div className="flex flex-col">
                      <span>{TYPE_META[k].label}</span>
                      <span className="text-[11px] text-gray-500">{TYPE_META[k].hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={v => setStatus(v as CommissionStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_META) as CommissionStatus[]).map(k => (
                  <SelectItem key={k} value={k}>{STATUS_META[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {editing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
