/**
 * v-booking-phase2 — Units & blocks for one Property.
 *
 * A Property's options ARE its bookable units (Room 101, Seat A3) and
 * its option groups are their categories (Deluxe, Standard). This dialog
 * lists every unit with its resource fields (code, capacity, location —
 * edited on the Property form) and manages BLOCKS: periods a unit can't
 * be booked (maintenance, cleaning, owner use). A block greys the unit
 * out on New booking and the server refuses it.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Ban, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ListTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { useConfirm } from '../../context/ConfirmContext';
import { useDateFormat } from '../../context/DateFormatContext';
import * as itemsApi from '../../api/paymentPlanItems';
import * as bookingsApi from '../../api/bookings';

interface Unit extends itemsApi.PaymentPlanItemOption { category: string | null }

/** 'YYYY-MM-DDTHH:mm' (datetime-local) in the browser's zone → ISO instant. */
const toIso = (local: string) => new Date(local).toISOString();

export function ResourcesDialog({ item, canWrite, canRemove = canWrite, onClose }: {
  item: itemsApi.PaymentPlanItem;
  /** Shows the new-block form (POST /booking-resource-blocks → booking:create). */
  canWrite: boolean;
  /** Shows Remove block (DELETE → booking:delete). Defaults to canWrite. */
  canRemove?: boolean;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const { formatDateTime } = useDateFormat();
  const units: Unit[] = useMemo(() => [
    ...(item.options ?? []).map(o => ({ ...o, category: null })),
    ...(item.optionGroups ?? []).flatMap(g => (g.options ?? []).map(o => ({ ...o, category: g.name }))),
  ], [item]);
  const unitById = useMemo(() => new Map(units.map(u => [u.id, u])), [units]);

  const [blocks, setBlocks] = useState<bookingsApi.ResourceBlock[] | null>(null);
  const load = () => bookingsApi.listBlocks(item.id)
    .then(setBlocks)
    .catch(e => { setBlocks([]); toast.error(e instanceof Error ? e.message : 'Could not load blocks'); });
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [item.id]);

  const now = Date.now();
  const upcoming = (blocks ?? []).filter(b => new Date(b.endAt).getTime() > now);
  const activeNow = new Set(upcoming.filter(b => new Date(b.startAt).getTime() <= now).map(b => b.optionId));

  // New block form
  const [optionId, setOptionId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const canAdd = optionId && from && to && new Date(to) > new Date(from);

  const add = async () => {
    if (!canAdd) return;
    setSaving(true);
    try {
      await bookingsApi.createBlock({ optionId, startAt: toIso(from), endAt: toIso(to), reason: reason.trim() || undefined });
      toast.success(`${unitById.get(optionId)?.name ?? 'Unit'} blocked`);
      setFrom(''); setTo(''); setReason('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not block');
    } finally { setSaving(false); }
  };

  const remove = async (b: bookingsApi.ResourceBlock) => {
    if (!(await confirm({
      title: `Remove this block on ${unitById.get(b.optionId)?.name ?? 'the unit'}?`,
      message: 'It can be booked for that time again.',
      confirmLabel: 'Remove block',
      variant: 'destructive',
    }))) return;
    try {
      await bookingsApi.removeBlock(b.id);
      toast.success('Block removed');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove');
    }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Units &amp; blocks · {item.name}</DialogTitle>
        </DialogHeader>

        <div className="border rounded-md overflow-auto max-h-72">
          <ListTable>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="w-32">Category</TableHead>
                <TableHead className="w-20 text-right">Capacity</TableHead>
                <TableHead className="w-32">Location</TableHead>
                <TableHead className="w-28 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-gray-500 py-6">
                  No units yet. Add options on the Property form.
                </TableCell></TableRow>
              ) : units.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-xs">{u.code || <span className="text-gray-300">—</span>}</TableCell>
                  <TableCell className="text-sm">{u.name}</TableCell>
                  <TableCell className="text-xs text-gray-600">{u.category ?? <span className="text-gray-300">—</span>}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{u.capacity ?? <span className="text-gray-300">—</span>}</TableCell>
                  <TableCell className="text-xs text-gray-600">{u.location || <span className="text-gray-300">—</span>}</TableCell>
                  <TableCell className="text-center">
                    {!u.active
                      ? <Badge variant="outline" className="text-gray-500">Inactive</Badge>
                      : activeNow.has(u.id)
                        ? <Badge className="bg-amber-100 text-amber-700">Blocked now</Badge>
                        : <Badge className="bg-emerald-100 text-emerald-700">Available</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ListTable>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold inline-flex items-center gap-1.5">
            <Ban className="h-4 w-4 text-amber-600" /> Blocks
          </div>
          {canWrite && units.length > 0 && (
            <div className="flex flex-wrap items-end gap-2 rounded-md border p-2">
              <div className="space-y-1">
                <Label className="text-xs">Unit</Label>
                <Select value={optionId} onValueChange={setOptionId}>
                  <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Pick a unit" /></SelectTrigger>
                  <SelectContent>
                    {units.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.code ? `${u.code} · ` : ''}{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} className="h-8 w-48" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="datetime-local" value={to} onChange={e => setTo(e.target.value)} className="h-8 w-48" />
              </div>
              <div className="space-y-1 flex-1 min-w-32">
                <Label className="text-xs">Reason</Label>
                <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Maintenance" maxLength={200} className="h-8" />
              </div>
              <Button size="sm" className="h-8" onClick={() => void add()} disabled={!canAdd || saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Block
              </Button>
            </div>
          )}
          {blocks == null ? (
            <div className="text-xs text-gray-500"><Loader2 className="inline h-3 w-3 animate-spin mr-1" />Loading…</div>
          ) : upcoming.length === 0 ? (
            <div className="text-xs text-gray-500">No blocks ahead.</div>
          ) : (
            <div className="divide-y rounded-md border">
              {upcoming.map(b => (
                <div key={b.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-medium w-36 truncate">{unitById.get(b.optionId)?.name ?? 'Removed unit'}</span>
                  <span className="text-gray-600 tabular-nums">{formatDateTime(b.startAt)} → {formatDateTime(b.endAt)}</span>
                  <span className="text-gray-500 truncate flex-1">{b.reason}</span>
                  {canRemove && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => void remove(b)} title="Remove block">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
