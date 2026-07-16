import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
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
import { DateInput } from '../common/DateInput';
import { Loader2, Plus, RefreshCw, Trash2, Eye, Wallet, ReceiptText, DollarSign } from 'lucide-react';
import { StatCard } from '../common/StatCard';
import { formatNumber, formatUSD } from '../../utils/format';
import {
  commissionSettlement,
} from '../../api/commissionSettlement';
import type {
  SettlementHeader, SettlementFull, Preview, PaymentMethod, SettlementStatus,
} from '../../api/commissionSettlement';
import * as usersApi from '../../api/users';

const STATUS_META: Record<SettlementStatus, { label: string; cls: string }> = {
  DRAFT:          { label: 'Draft',          cls: 'bg-gray-100 text-gray-700' },
  CONFIRMED:      { label: 'Confirmed',      cls: 'bg-blue-100 text-blue-800' },
  PARTIALLY_PAID: { label: 'Partially Paid', cls: 'bg-amber-100 text-amber-800' },
  PAID:           { label: 'Paid',           cls: 'bg-green-100 text-green-800' },
  CANCELLED:      { label: 'Cancelled',      cls: 'bg-red-100 text-red-700' },
};

const PM_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash', BANK: 'Bank Transfer', PAYROLL: 'Payroll',
  MOBILE: 'Mobile Payment', CHEQUE: 'Cheque',
};

/**
 * v-commission-settlement-mvp — the Settlement tab on the
 * Commission page. Lists all settlement records for the tenant
 * with per-status pills; the New Settlement dialog previews an
 * upcoming settlement (server-computed) then commits it.
 */
export function CommissionSettlementView() {
  const [rows, setRows] = useState<SettlementHeader[]>([]);
  const [users, setUsers] = useState<usersApi.User[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<SettlementFull | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ls, up] = await Promise.all([
        commissionSettlement.list(),
        usersApi.list({ size: 200 }).catch(() => ({ data: [] as usersApi.User[] } as any)),
      ]);
      setRows(ls);
      setUsers(((up?.data ?? []) as usersApi.User[]));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load settlements');
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

  const totals = useMemo(() => rows.reduce((a, r) => ({
    count:  a.count + 1,
    sales:  a.sales + (r.totalSales ?? 0),
    comm:   a.comm  + (r.totalCommission ?? 0),
    unpaid: a.unpaid + (r.balanceAmount ?? 0),
  }), { count: 0, sales: 0, comm: 0, unpaid: 0 }), [rows]);

  const doDelete = async (r: SettlementHeader) => {
    if (!confirm(`Delete settlement ${r.settlementNo}? Its invoices become available for settlement again.`)) return;
    try {
      await commissionSettlement.remove(r.id);
      toast.success('Settlement deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };
  const doView = async (r: SettlementHeader) => {
    try { setViewing(await commissionSettlement.get(r.id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Load failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Settlements"  value={formatNumber(totals.count)}  icon={ReceiptText} tone="blue" />
        <StatCard label="Total Sales"  value={formatUSD(totals.sales)}     icon={DollarSign}  tone="green" />
        <StatCard label="Total Commission" value={formatUSD(totals.comm)}  icon={Wallet}      tone="amber" />
        <StatCard label="Outstanding"  value={formatUSD(totals.unpaid)}    icon={Wallet}      tone="orange"
          hint="Sum of balance_amount on settlements not yet fully paid" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle>Commission Settlements</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> New settlement
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              No settlements yet. Click <b>New settlement</b> to settle a seller for a period.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Settlement No</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Total Sales</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => {
                  const s = STATUS_META[r.status];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.settlementNo}</TableCell>
                      <TableCell>{userName.get(r.sellerId) ?? r.sellerId.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs text-gray-600">
                        {r.periodStart} → {r.periodEnd}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(r.invoiceCount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatUSD(r.totalSales)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-emerald-700">
                        {formatUSD(r.totalCommission)}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${r.balanceAmount > 0 ? 'text-amber-700' : ''}`}>
                        {formatUSD(r.balanceAmount)}
                      </TableCell>
                      <TableCell><Badge className={s.cls}>{s.label}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => doView(r)} title="View details">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => doDelete(r)} title="Delete">
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

      <NewSettlementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        users={users}
        onCreated={() => { setDialogOpen(false); void load(); }}
      />

      <ViewSettlementDialog
        full={viewing}
        onOpenChange={o => { if (!o) setViewing(null); }}
        sellerName={viewing ? (userName.get(viewing.header.sellerId) ?? viewing.header.sellerId.slice(0, 8)) : ''}
      />
    </div>
  );
}

/* ------------------------------------------------------------ */
/* New settlement dialog — Seller + period → preview → confirm  */
/* ------------------------------------------------------------ */

function NewSettlementDialog({
  open, onOpenChange, users, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  users: usersApi.User[];
  onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + '01';
  const [sellerId, setSellerId] = useState<string>('');
  const [from, setFrom] = useState<string>(firstOfMonth);
  const [to,   setTo]   = useState<string>(today);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [referenceNo, setReferenceNo] = useState('');
  const [remark, setRemark] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]  = useState(false);

  useEffect(() => {
    if (open) {
      setSellerId(''); setFrom(firstOfMonth); setTo(today);
      setPaymentMethod(''); setReferenceNo(''); setRemark('');
      setPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Client-side guardrails so an obviously-broken period never
   *  hits the wire. Server enforces the same rules — this is
   *  belt-and-braces so the operator sees a fast, precise error. */
  const periodError = (() => {
    if (!from || !to) return 'Pick a period';
    if (from > to)    return `From (${from}) is after To (${to}). Swap the dates.`;
    if (to > today)   return `To (${to}) is in the future. Settlements can only cover past sales.`;
    return null;
  })();

  const doPreview = async () => {
    if (!sellerId) { toast.error('Pick a seller first'); return; }
    if (periodError) { toast.error(periodError); return; }
    setLoading(true);
    try {
      setPreview(await commissionSettlement.preview({
        sellerId, periodStart: from, periodEnd: to,
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Preview failed');
    } finally { setLoading(false); }
  };

  const doConfirm = async () => {
    if (!sellerId) { toast.error('Pick a seller first'); return; }
    if (periodError) { toast.error(periodError); return; }
    if (!preview || preview.invoiceCount === 0) {
      toast.error('Nothing to settle — preview first and check for unsettled invoices in this range.');
      return;
    }
    setSaving(true);
    try {
      await commissionSettlement.create({
        sellerId, periodStart: from, periodEnd: to,
        paymentMethod: paymentMethod || null,
        referenceNo: referenceNo || null,
        remark: remark || null,
      });
      toast.success('Settlement created');
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Commission Settlement</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Seller *</Label>
              <Select value={sellerId} onValueChange={setSellerId}>
                <SelectTrigger><SelectValue placeholder="Pick a seller" /></SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name?.trim() || u.username?.trim() || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={v => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PM_LABEL) as PaymentMethod[]).map(k => (
                    <SelectItem key={k} value={k}>{PM_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Period</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-gray-500">From</Label>
              <DateInput value={from} onChange={setFrom} max={to || today} className="h-9 w-40 text-sm" title="From date" />
              <Label className="text-xs text-gray-500">To</Label>
              <DateInput value={to}   onChange={setTo}   min={from || undefined} max={today} className="h-9 w-40 text-sm" title="To date" />
              <Button size="sm" variant="outline"
                onClick={doPreview}
                disabled={loading || !sellerId || !!periodError}
                className="h-9">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Preview'}
              </Button>
            </div>
            {periodError && (
              <p className="text-[11px] text-red-600 mt-1">{periodError}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Reference No</Label>
              <Input value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="TRX-…" maxLength={120} />
            </div>
            <div className="space-y-1">
              <Label>Remark</Label>
              <Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="optional" maxLength={500} />
            </div>
          </div>

          {preview && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                  <div>
                    <div className="text-xs text-gray-500">Invoices</div>
                    <div className="font-medium">{formatNumber(preview.invoiceCount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Total Sales</div>
                    <div className="font-medium">{formatUSD(preview.totalSales)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Total Commission</div>
                    <div className="font-medium text-emerald-700">{formatUSD(preview.totalCommission)}</div>
                  </div>
                </div>
                {preview.skippedAlreadySettled > 0 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-3">
                    {preview.skippedAlreadySettled}{' '}invoice{preview.skippedAlreadySettled === 1 ? '' : 's'} in this range {preview.skippedAlreadySettled === 1 ? 'was' : 'were'} already covered by another settlement and excluded.
                  </p>
                )}
                {preview.invoiceCount === 0 ? (
                  <div className="text-center py-4 text-xs text-gray-500">
                    No unsettled sale invoices for this seller in this period.
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Sale</TableHead>
                          <TableHead className="text-right">Commission</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.lines.map(l => (
                          <TableRow key={l.invoiceId}>
                            <TableCell className="text-xs font-medium">{l.invoiceNo ?? l.invoiceId.slice(0, 8)}</TableCell>
                            <TableCell className="text-xs text-gray-600">{l.issueDate}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{formatUSD(l.saleAmount)}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-emerald-700">
                              {formatUSD(l.commissionAmount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={doConfirm} disabled={saving || !preview || preview.invoiceCount === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Confirm settlement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ */
/* View settlement dialog — read-only details table             */
/* ------------------------------------------------------------ */

function ViewSettlementDialog({
  full, sellerName, onOpenChange,
}: {
  full: SettlementFull | null;
  sellerName: string;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={!!full} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {full ? full.header.settlementNo : 'Settlement'}
          </DialogTitle>
        </DialogHeader>
        {full && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div><div className="text-xs text-gray-500">Seller</div><div>{sellerName}</div></div>
              <div><div className="text-xs text-gray-500">Period</div><div>{full.header.periodStart} → {full.header.periodEnd}</div></div>
              <div><div className="text-xs text-gray-500">Status</div><div><Badge className={STATUS_META[full.header.status].cls}>{STATUS_META[full.header.status].label}</Badge></div></div>
              <div><div className="text-xs text-gray-500">Invoices</div><div>{formatNumber(full.header.invoiceCount)}</div></div>
              <div><div className="text-xs text-gray-500">Total Sales</div><div>{formatUSD(full.header.totalSales)}</div></div>
              <div><div className="text-xs text-gray-500">Commission</div><div className="text-emerald-700 font-medium">{formatUSD(full.header.totalCommission)}</div></div>
              <div><div className="text-xs text-gray-500">Payment Method</div><div>{full.header.paymentMethod ? PM_LABEL[full.header.paymentMethod] : '—'}</div></div>
              <div><div className="text-xs text-gray-500">Reference</div><div>{full.header.referenceNo || '—'}</div></div>
              <div><div className="text-xs text-gray-500">Balance</div><div>{formatUSD(full.header.balanceAmount)}</div></div>
            </div>
            {full.header.remark && (
              <div>
                <div className="text-xs text-gray-500">Remark</div>
                <div className="whitespace-pre-wrap">{full.header.remark}</div>
              </div>
            )}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Detail</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="text-right">Sale</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead>Plan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {full.lines.map(l => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs font-medium">{l.invoiceNo ?? l.invoiceId.slice(0, 8)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{formatUSD(l.saleAmount)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-emerald-700">{formatUSD(l.commissionAmount)}</TableCell>
                        <TableCell className="text-xs text-gray-500">{l.planSnapshot ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
