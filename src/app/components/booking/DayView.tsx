/**
 * v-booking-hourly — Day view: one property, one day, every unit.
 *
 * Rows are units (Room A, Room B…), columns are the day's hours. A unit
 * can be booked many times a day; each booking shows as a bar over its
 * hours — solid when confirmed, dashed when only requested (a draft /
 * hold, e.g. a guest request) — and maintenance blocks as grey. Click a
 * free hour to book that unit from that hour. Click a bar to open the
 * booking.
 *
 * The server re-checks every booking (overlaps, blocks), so what this view
 * shows is a guide, never the guard.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { SearchablePicker } from '../common/SearchablePicker';
import { DateInput } from '../common/DateInput';
import * as bookingsApi from '../../api/bookings';
import * as itemsApi from '../../api/paymentPlanItems';
import type * as customersApi from '../../api/customers';
import { formatMoney } from '../../utils/format';

const HOUR_W = 56;             // px per hour column
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
/** 'YYYY-MM-DDTHH:mm' for datetime-local, in the browser's zone. */
const local = (d: Date) => `${iso(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
/** Hours from the start of `day` (local) to `at`, clamped to the day. */
const hourOf = (day: string, at: string) => {
  const ms = new Date(at).getTime() - new Date(day + 'T00:00:00').getTime();
  return Math.max(0, Math.min(24, ms / 3600000));
};

export function DayView({ items, customers, canWrite, onOpenBooking, onChanged }: {
  items: itemsApi.PaymentPlanItem[];
  customers: customersApi.Customer[];
  canWrite: boolean;
  onOpenBooking: (bookingId: string) => void;
  onChanged: () => void;
}) {
  const bookable = useMemo(() => items.filter(i =>
    (i.options ?? []).length + (i.optionGroups ?? []).reduce((n, g) => n + (g.options ?? []).length, 0) > 0), [items]);
  const [itemId, setItemId] = useState('');
  useEffect(() => { if (!itemId && bookable[0]) setItemId(bookable[0].id); }, [bookable, itemId]);
  const [day, setDay] = useState(iso(new Date()));
  const [data, setData] = useState<bookingsApi.DaySchedule | null>(null);
  const [loading, setLoading] = useState(false);
  /** Open on the working day: scrolled to 07:00, not midnight. */
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (gridRef.current) gridRef.current.scrollLeft = 7 * HOUR_W; }, [itemId, !!data]);
  const [quick, setQuick] = useState<{ unit: bookingsApi.DayUnit; from: string; to: string } | null>(null);

  const load = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    try { setData(await bookingsApi.daySchedule(itemId, day)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not load the day'); }
    finally { setLoading(false); }
  }, [itemId, day]);
  useEffect(() => { void load(); }, [load]);

  const busyAt = (unitId: string, h: number) =>
    !!data && ([...data.entries, ...data.blocks] as { unitId: string; startAt: string; endAt: string }[])
      .some(x => x.unitId === unitId && hourOf(day, x.startAt) < h + 1 && hourOf(day, x.endAt) > h);

  const openQuick = (unit: bookingsApi.DayUnit, h: number) => {
    if (!canWrite) return;
    const start = new Date(day + 'T00:00:00'); start.setHours(h);
    const end = new Date(start);
    if (data?.priceUnit === 'night') { start.setHours(14); end.setDate(end.getDate() + 1); end.setHours(12); }
    else end.setHours(h + 1);
    setQuick({ unit, from: local(start), to: local(end) });
  };

  const unitLabel = data?.priceUnit === 'hour' ? '/ hour' : data?.priceUnit === 'booking' ? '/ booking' : '/ night';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger className="h-9 w-64"><SelectValue placeholder="Pick a property" /></SelectTrigger>
          <SelectContent>
            {bookable.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setDay(addDays(day, -1))} title="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="w-40"><DateInput value={day} onChange={v => v && setDay(v)} /></div>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setDay(addDays(day, 1))} title="Next day">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-9" onClick={() => setDay(iso(new Date()))}>Today</Button>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        <div className="ml-auto flex items-center gap-3 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded bg-indigo-500" /> Booked</span>
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded border-2 border-dashed border-amber-500 bg-amber-50" /> Requested</span>
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded bg-gray-300" /> Blocked</span>
        </div>
      </div>

      {!itemId ? (
        <div className="text-sm text-gray-500 py-10 text-center">No properties with units yet.</div>
      ) : (
        <div ref={gridRef} className="border rounded-lg overflow-x-auto bg-white">
          <div style={{ minWidth: 180 + HOUR_W * 24 }}>
            {/* hour ruler */}
            <div className="flex border-b bg-gray-50 sticky top-0">
              <div className="w-[180px] shrink-0 px-3 py-1.5 text-[11px] font-semibold text-gray-500 uppercase">Unit</div>
              {HOURS.map(h => (
                <div key={h} style={{ width: HOUR_W }} className="shrink-0 border-l text-[10px] text-gray-500 px-1 py-1.5 tabular-nums">
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>
            {(data?.units ?? []).map(u => (
              <div key={u.id} className="flex border-b last:border-b-0 h-12">
                <div className="w-[180px] shrink-0 px-3 py-1 flex flex-col justify-center border-r">
                  <div className="text-sm font-medium truncate">{u.name}</div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {[u.code, u.type, u.capacity ? `${u.capacity} ppl` : null, u.price != null ? `$${formatMoney(u.price)} ${unitLabel}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="relative" style={{ width: HOUR_W * 24 }}>
                  {/* free-hour cells */}
                  <div className="absolute inset-0 flex">
                    {HOURS.map(h => {
                      const busy = busyAt(u.id, h);
                      return (
                        <button key={h} type="button" disabled={busy || !canWrite}
                          onClick={() => openQuick(u, h)}
                          style={{ width: HOUR_W }}
                          className={`shrink-0 border-l h-full ${busy || !canWrite ? 'cursor-default' : 'hover:bg-indigo-50 cursor-pointer'}`}
                          title={busy ? undefined : `Book ${u.name} from ${String(h).padStart(2, '0')}:00`} />
                      );
                    })}
                  </div>
                  {/* blocks */}
                  {(data?.blocks ?? []).filter(b => b.unitId === u.id).map(b => (
                    <div key={b.id} className="absolute top-1.5 bottom-1.5 rounded bg-gray-300/80 text-[10px] text-gray-700 px-1.5 flex items-center overflow-hidden pointer-events-none"
                      style={{ left: hourOf(day, b.startAt) * HOUR_W, width: Math.max(4, (hourOf(day, b.endAt) - hourOf(day, b.startAt)) * HOUR_W) }}>
                      <span className="truncate">Blocked{b.reason ? ` · ${b.reason}` : ''}</span>
                    </div>
                  ))}
                  {/* bookings */}
                  {(data?.entries ?? []).filter(e => e.unitId === u.id).map(e => (
                    <button key={e.bookingId + e.startAt} type="button" onClick={() => onOpenBooking(e.bookingId)}
                      className={`absolute top-1.5 bottom-1.5 rounded text-[10px] px-1.5 flex items-center overflow-hidden text-left ${
                        e.requested ? 'border-2 border-dashed border-amber-500 bg-amber-50 text-amber-800' : 'bg-indigo-500 text-white'}`}
                      style={{ left: hourOf(day, e.startAt) * HOUR_W, width: Math.max(4, (hourOf(day, e.endAt) - hourOf(day, e.startAt)) * HOUR_W) }}
                      title={`${e.bookingNo} · ${e.customerName ?? ''}`}>
                      <span className="truncate">{e.customerName ?? e.bookingNo}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {quick && data && (
        <QuickBookDialog
          itemId={data.itemId}
          unit={quick.unit}
          priceUnit={data.priceUnit}
          from={quick.from}
          to={quick.to}
          customers={customers}
          onClose={() => setQuick(null)}
          onSaved={() => { setQuick(null); void load(); onChanged(); }}
        />
      )}
    </div>
  );
}

/** Book one unit for a period, from a free hour on the Day view. */
function QuickBookDialog({ itemId, unit, priceUnit, from, to, customers, onClose, onSaved }: {
  itemId: string;
  unit: bookingsApi.DayUnit;
  priceUnit: string;
  from: string;
  to: string;
  customers: customersApi.Customer[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [customerId, setCustomerId] = useState('');
  const [saving, setSaving] = useState(false);
  const timesOk = !!start && !!end && new Date(end) > new Date(start);
  const valid = !!customerId && timesOk;
  // The server's rule (BookingAllocator), shown before saving.
  const qty = !timesOk ? 0
    : priceUnit === 'hour' ? Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 3600000))
      : priceUnit === 'booking' ? 1
        : Math.max(1, bookingsApi.nightsBetween(start, end));
  const total = (Number(unit.price) || 0) * qty;
  const per = priceUnit === 'hour' ? 'hour' : priceUnit === 'booking' ? 'booking' : 'night';

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await bookingsApi.create({
        customerId, itemId, selectedOptionIds: [unit.id],
        startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(),
        bookingDate: start.slice(0, 10),
        amount: null,   // the server prices it
      });
      toast.success(`${unit.name} booked`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not book');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Book {unit.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Customer</Label>
            <SearchablePicker
              value={customerId}
              onChange={setCustomerId}
              options={customers.map(c => ({ value: c.id, label: c.name, secondary: c.phone ?? undefined }))}
              placeholder="Pick a customer"
              searchPlaceholder="Search customers…"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className="h-9" />
            </div>
          </div>
          {qty > 0 && (
            <div className="flex items-baseline justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
              <span className="text-gray-600">{qty} {per}{qty === 1 ? '' : 's'} × ${formatMoney(Number(unit.price) || 0)}</span>
              <span className="text-lg font-semibold tabular-nums">${formatMoney(total)}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={!valid || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
