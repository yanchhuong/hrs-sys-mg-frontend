import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Percent, Loader2, Plus, RefreshCw, Trash2, Edit3, X } from 'lucide-react';
import { commission } from '../../api/commission';
import type {
  CommissionProgram, CommissionType, CommissionStatus, CommissionMode,
  UpsertCommissionProgram,
} from '../../api/commission';
import * as usersApi from '../../api/users';
import { formatMoney, formatNumber } from '../../utils/format';

const TYPE_META: Record<CommissionType, { label: string; hint: string; cls: string }> = {
  PER_INVOICE: { label: 'Per Invoice', hint: 'Rate applied to the invoiced total (% or $).',                  cls: 'border-blue-200 bg-blue-50 text-blue-700' },
  PER_ITEM:    { label: 'Per Item',    hint: 'Rate applied per line item on the invoice.',                    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  TOTAL_PAID:  { label: 'Total Paid',  hint: 'Rate applied to money the customer has actually paid, not the invoiced total.', cls: 'border-purple-200 bg-purple-50 text-purple-700' },
};

const STATUS_META: Record<CommissionStatus, { label: string; cls: string }> = {
  ACTIVE:   { label: 'Active',   cls: 'bg-green-100 text-green-800' },
  INACTIVE: { label: 'Inactive', cls: 'bg-gray-100 text-gray-700' },
};

/**
 * v-commission-mvp — Sales-commission plan settings. Lives inside
 * the POS Settings drawer alongside Loyalty (both configure how a
 * sale downstream-triggers a payout: loyalty rewards customers,
 * commission rewards sellers).
 */
export function CommissionSettings() {
  const [rows, setRows] = useState<CommissionProgram[]>([]);
  const [users, setUsers] = useState<usersApi.User[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CommissionProgram | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plans, userPage] = await Promise.all([
        commission.list(),
        usersApi.list({ size: 200 }).catch(() => ({ data: [] as usersApi.User[] } as any)),
      ]);
      setRows(plans);
      setUsers((userPage?.data ?? []) as usersApi.User[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load commission plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const userName = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) m.set(u.id, u.name?.trim() || u.username?.trim() || u.email);
    return m;
  }, [users]);

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
              Applied to each seller's totals in the Sale → Commission report.
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
                  <TableHead>Rate</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => {
                  const t = TYPE_META[r.type];
                  const s = STATUS_META[r.status];
                  const applies = r.assignedUserIds.length === 0
                    ? 'All sellers'
                    : r.assignedUserIds
                        .map(id => userName.get(id) ?? id.slice(0, 8))
                        .join(', ');
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={t.cls}>{t.label}</Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.rate == null || r.mode == null
                          ? <span className="text-gray-400">—</span>
                          : r.mode === 'PERCENT'
                            ? `${formatNumber(r.rate)}%`
                            : `$${formatMoney(r.rate)}`}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.assignedUserIds.length === 0
                          ? <span className="text-gray-600 italic">All sellers</span>
                          : <span title={applies}>{applies}</span>}
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
        users={users}
        onSaved={() => { setDialogOpen(false); void load(); }}
      />
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Upsert dialog                                                  */
/* -------------------------------------------------------------- */

function CommissionDialog({
  open, onOpenChange, editing, users, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CommissionProgram | null;
  users: usersApi.User[];
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<CommissionType>('PER_INVOICE');
  const [status, setStatus] = useState<CommissionStatus>('ACTIVE');
  const [mode, setMode] = useState<CommissionMode>('PERCENT');
  const [rate, setRate] = useState<string>('');
  const [assigned, setAssigned] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setType(editing?.type ?? 'PER_INVOICE');
      setStatus(editing?.status ?? 'ACTIVE');
      setMode(editing?.mode ?? 'PERCENT');
      setRate(editing?.rate != null ? String(editing.rate) : '');
      setAssigned(editing?.assignedUserIds ?? []);
    }
  }, [open, editing]);

  const submit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    const parsedRate = rate.trim() === '' ? null : Number(rate);
    if (parsedRate != null && (Number.isNaN(parsedRate) || parsedRate < 0)) {
      toast.error('Rate must be a positive number');
      return;
    }
    setSaving(true);
    try {
      const body: UpsertCommissionProgram = {
        name: name.trim(), type, status,
        mode: parsedRate == null ? null : mode,
        rate: parsedRate,
        assignedUserIds: assigned,
      };
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

  const userName = (id: string) => {
    const u = users.find(x => x.id === id);
    return u?.name?.trim() || u?.username?.trim() || u?.email || id.slice(0, 8);
  };

  const availableUsers = users.filter(u => !assigned.includes(u.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={type} onValueChange={v => setType(v as CommissionType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_META) as CommissionType[]).map(k => (
                    <SelectItem key={k} value={k}>{TYPE_META[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-500">{TYPE_META[type].hint}</p>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={v => setMode(v as CommissionMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">% of sale</SelectItem>
                  <SelectItem value="FIXED">Fixed $</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rate {mode === 'PERCENT' ? '(%)' : '($)'}</Label>
              <Input
                type="number"
                min="0"
                step={mode === 'PERCENT' ? '0.1' : '0.01'}
                placeholder={mode === 'PERCENT' ? '2 = 2%' : '0.50'}
                value={rate}
                onChange={e => setRate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Applies to</Label>
            {assigned.length === 0 ? (
              <p className="text-xs text-gray-500 italic">
                No sellers picked — this plan applies to <b>all sellers</b>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {assigned.map(id => (
                  <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs">
                    {userName(id)}
                    <button
                      type="button"
                      onClick={() => setAssigned(a => a.filter(x => x !== id))}
                      className="hover:text-red-600"
                      aria-label="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {availableUsers.length > 0 && (
              <Select value="" onValueChange={id => id && setAssigned(a => [...a, id])}>
                <SelectTrigger>
                  <SelectValue placeholder="Add a seller…" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name?.trim() || u.username?.trim() || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
