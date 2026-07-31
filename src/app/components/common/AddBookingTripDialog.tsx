import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { Info, Route } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { SearchablePicker } from './SearchablePicker';
import * as bookingTripsApi from '../../api/bookingTrips';
import * as bookingSchedulesApi from '../../api/bookingSchedules';
import * as paymentPlanItemsApi from '../../api/paymentPlanItems';

/**
 * v-booking-trip-popup — standalone "New / Edit trip" popup. Same
 * two-column shape as the Course-schedule popup, but scoped to
 * Trip fields: Schedule, Date, Departure time, Notes, Active.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: bookingTripsApi.BookingTrip | null;
  schedules: bookingSchedulesApi.BookingSchedule[];
  items: paymentPlanItemsApi.PaymentPlanItem[];
  onSaved: () => void;
}

interface FormState {
  scheduleId: string;
  tripDate: string;
  departureTime: string;
  endTime: string;
  sessionType: bookingTripsApi.SessionType;
  active: boolean;
  notes: string;
  /** v-session-frequency — false = one-off session on a specific
   *  date (current behaviour). true = repeat across the schedule's
   *  slots between `tripDate` (Start) and `endDate` (End). */
  frequency: boolean;
  /** End date, used only when frequency = true. */
  endDate: string;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** yyyy-MM-dd for today (local calendar). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Add N days to an ISO date string (yyyy-MM-dd). */
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Enumerate ISO dates inclusive between two yyyy-MM-dd strings.
 *  Returns empty if end < start. Capped at 1 year of dates to keep
 *  runaway ranges from freezing the UI. */
function enumerateDatesIso(startIso: string, endIso: string): string[] {
  if (endIso < startIso) return [];
  const out: string[] = [];
  let cur = startIso;
  let guard = 0;
  while (cur <= endIso && guard < 400) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
    guard++;
  }
  return out;
}

/** JS day-of-week (0=Sun..6=Sat) → ISO day-of-week (1=Mon..7=Sun). */
function isoDayOfWeek(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const js = new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
  return js === 0 ? 7 : js;
}

export function AddBookingTripDialog({ open, onOpenChange, editing, schedules, items, onSaved }: Props) {
  const [form, setForm] = useState<FormState>({
    scheduleId: '', tripDate: todayIso(), departureTime: '08:00', endTime: '',
    sessionType: 'trip', active: true, notes: '',
    frequency: false, endDate: '',
  });
  const [saving, setSaving] = useState(false);
  /** v-trip-departure-picker — when the operator picks a slot from
   *  the schedule's weekly list the Departure time snaps to it.
   *  Custom mode reveals a raw time input so schedule-less trips
   *  or one-off times are still doable. */
  const [customDeparture, setCustomDeparture] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        scheduleId: editing.scheduleId,
        tripDate: editing.tripDate,
        departureTime: editing.departureTime.slice(0, 5),
        endTime: editing.endTime ? editing.endTime.slice(0, 5) : '',
        sessionType: editing.sessionType ?? 'trip',
        active: editing.active,
        notes: editing.notes ?? '',
        // v-session-frequency — editing a session is always one-off
        // (each row is a specific date-instance). Bulk recurrence is
        // a create-time-only affordance.
        frequency: false,
        endDate: '',
      });
      // Editing a legacy row whose Departure doesn't match any slot
      // → start in custom mode so the raw time is visible/editable.
      const sched = schedules.find(s => s.id === editing.scheduleId);
      const editDep = editing.departureTime.slice(0, 5);
      setCustomDeparture(!sched?.slots?.some(x => x.fromTime.slice(0, 5) === editDep));
    } else {
      setForm({
        scheduleId: schedules[0]?.id ?? '',
        tripDate: todayIso(),
        departureTime: (schedules[0]?.slots?.[0]?.fromTime ?? '08:00').slice(0, 5),
        endTime: '',
        sessionType: 'trip',
        active: true,
        notes: '',
        frequency: false,
        endDate: '',
      });
      setCustomDeparture(false);
    }
  }, [open, editing, schedules]);

  // Slots available on the currently-picked schedule (dedup by
  // display key so `Mon 07:00 / Wed 07:00` render as separate
  // rows, but we treat them individually in the picker).
  const pickedSchedule = schedules.find(s => s.id === form.scheduleId);
  const slotOptions = (pickedSchedule?.slots ?? []).map(s => ({
    key: `${s.dayOfWeek}-${s.fromTime}`,
    day: s.dayOfWeek,
    time: s.fromTime.slice(0, 5),
  }));

  // v-session-frequency — projected list of sessions the "Save"
  // button will create when frequency=true. Empty when frequency is
  // off (single-session path handled separately) or when required
  // fields aren't set yet.
  const recurringSessions = ((): Array<{ date: string; departureTime: string }> => {
    if (!form.frequency || !form.scheduleId || !form.tripDate || !form.endDate) return [];
    const slots = pickedSchedule?.slots ?? [];
    if (slots.length === 0) return [];
    const dates = enumerateDatesIso(form.tripDate, form.endDate);
    const out: Array<{ date: string; departureTime: string }> = [];
    for (const d of dates) {
      const dow = isoDayOfWeek(d);
      for (const s of slots) {
        if (s.dayOfWeek === dow) {
          out.push({ date: d, departureTime: s.fromTime.slice(0, 5) });
        }
      }
    }
    return out;
  })();

  const submit = async () => {
    if (!form.scheduleId) { toast.error('Pick a schedule'); return; }
    // v-session-frequency — validation splits by mode.
    if (form.frequency) {
      if (!form.tripDate) { toast.error('Pick a start date'); return; }
      if (!form.endDate) { toast.error('Pick an end date'); return; }
      if (form.endDate < form.tripDate) { toast.error('End date must be on or after Start date'); return; }
      if ((pickedSchedule?.slots ?? []).length === 0) {
        toast.error('The picked schedule has no slots — add slots to it first, or turn Repeat off.');
        return;
      }
      if (recurringSessions.length === 0) {
        toast.error('No slot lands inside this date range.');
        return;
      }
      if (recurringSessions.length > 200) {
        toast.error(`Range would create ${recurringSessions.length} sessions — cap is 200. Shorten the range or split.`);
        return;
      }
    } else {
      if (!form.tripDate) { toast.error('Pick a date'); return; }
      if (!form.departureTime) { toast.error('Pick a departure time'); return; }
      if (form.endTime && form.endTime <= form.departureTime) {
        toast.error('End time must be after Departure time');
        return;
      }
    }
    setSaving(true);
    try {
      if (form.frequency) {
        // Sequential creates — safer than parallel because a duplicate
        // (date, time, schedule) would race. Sequential also gives us
        // an aborted-part-way error message pointing at the first
        // failure instead of "N failed".
        let created = 0;
        for (const s of recurringSessions) {
          await bookingTripsApi.create({
            scheduleId: form.scheduleId,
            tripDate: s.date,
            departureTime: s.departureTime,
            endTime: null,
            sessionType: form.sessionType,
            active: form.active,
            notes: form.notes.trim() || null,
          });
          created++;
        }
        toast.success(`Created ${created} session${created === 1 ? '' : 's'}`);
      } else {
        const payload: bookingTripsApi.UpsertBookingTrip = {
          scheduleId: form.scheduleId,
          tripDate: form.tripDate,
          departureTime: form.departureTime,
          endTime: form.endTime || null,
          sessionType: form.sessionType,
          active: form.active,
          notes: form.notes.trim() || null,
        };
        if (editing) {
          await bookingTripsApi.update(editing.id, payload);
          toast.success('Session updated');
        } else {
          await bookingTripsApi.create(payload);
          toast.success('Session created');
        }
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save session');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Route className="h-4 w-4 text-indigo-600" />
            {editing ? 'Edit session' : 'New session'}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="What is a session?"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  A Session is a concrete date-instance of a Schedule.
                  Schedule = recurring template ("every Mon 08:00");
                  Session = one specific run ("July 30 08:00"). Bookings
                  attach to a Session for per-departure inventory.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
          <DialogDescription className="sr-only">
            A Session is a concrete date-instance of a Schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">
                Schedule<span className="text-red-500"> *</span>
              </Label>
              <SearchablePicker
                options={schedules.map(s => {
                  const it = items.find(i => i.id === s.itemId);
                  return {
                    value: s.id,
                    label: s.name,
                    secondary: it?.name ?? undefined,
                    searchKey: `${s.name} ${it?.name ?? ''}`,
                  };
                })}
                value={form.scheduleId}
                onChange={v => setForm(f => {
                  const sched = schedules.find(s => s.id === v);
                  // Pre-fill Departure from the schedule's first slot
                  // so typical van-departure workflows are one-click.
                  const nextTime = sched?.slots?.[0]?.fromTime
                    ? sched.slots[0].fromTime.slice(0, 5)
                    : f.departureTime;
                  return { ...f, scheduleId: v, departureTime: nextTime };
                })}
                placeholder="Pick a schedule"
                searchPlaceholder="Search schedules…"
                allowClear={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Type<span className="text-red-500"> *</span>
              </Label>
              <select
                className="h-9 w-full px-2 border rounded-md text-sm bg-white"
                value={form.sessionType}
                onChange={e => setForm(f => ({ ...f, sessionType: e.target.value as bookingTripsApi.SessionType }))}
              >
                {bookingTripsApi.SESSION_TYPE_LABELS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {/* v-session-frequency — Repeats toggle. OFF (default) =
                single one-off session on a specific date; ON = fan
                out over the schedule's weekly slots between Start
                and End date. Hidden on edit — recurrence is a
                create-time affordance. */}
            {!editing && (
              <div className="space-y-1.5">
                <Label className="text-xs">Repeats</Label>
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer h-9">
                  <Switch
                    checked={form.frequency}
                    onCheckedChange={v => setForm(f => ({
                      ...f,
                      frequency: v,
                      // Seed End date at Start + 30 days on first
                      // toggle-on so the range isn't empty.
                      endDate: v && !f.endDate ? addDaysIso(f.tripDate, 30) : f.endDate,
                    }))}
                  />
                  {form.frequency
                    ? <span className="text-gray-800">On — repeats across schedule slots</span>
                    : <span className="text-gray-500">Off — single date</span>}
                </label>
              </div>
            )}
            {form.frequency ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Start date<span className="text-red-500"> *</span>
                  </Label>
                  <Input
                    type="date"
                    value={form.tripDate}
                    onChange={e => setForm(f => ({ ...f, tripDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    End date<span className="text-red-500"> *</span>
                  </Label>
                  <Input
                    type="date"
                    value={form.endDate}
                    min={form.tripDate || undefined}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
                {/* Preview — how many sessions this range + these
                    slots will produce. Guides the operator before
                    they hit Save (which caps at 200). */}
                <div className="col-span-2 rounded-md border border-dashed border-indigo-200 bg-indigo-50/40 px-3 py-2 text-[11px] text-gray-700">
                  {(pickedSchedule?.slots ?? []).length === 0 ? (
                    <span className="text-red-600">
                      Picked schedule has no slots — add slots on the schedule first, or turn Repeat off.
                    </span>
                  ) : recurringSessions.length === 0 ? (
                    <span className="text-gray-500">
                      No slot falls inside this date range yet.
                    </span>
                  ) : (
                    <>
                      Will create <b>{recurringSessions.length}</b> session
                      {recurringSessions.length === 1 ? '' : 's'} — one for each schedule slot
                      that falls between {form.tripDate} and {form.endDate}.
                      {recurringSessions.length > 200 && (
                        <span className="text-red-600 ml-1">Cap is 200; shorten the range.</span>
                      )}
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Date<span className="text-red-500"> *</span>
                  </Label>
                  <Input
                    type="date"
                    value={form.tripDate}
                    onChange={e => setForm(f => ({ ...f, tripDate: e.target.value }))}
                  />
                </div>
                {/* v-trip-departure-picker — Departure defaults to
                    picking one of the schedule's weekly slots. When
                    the schedule has no slots (or the operator wants a
                    one-off time), Custom reveals a raw time input. */}
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Departure time<span className="text-red-500"> *</span>
                  </Label>
                  {slotOptions.length > 0 && !customDeparture ? (
                    <select
                      className="h-9 w-full px-2 border rounded-md text-sm bg-white tabular-nums"
                      value={form.departureTime}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setCustomDeparture(true);
                        } else {
                          setForm(f => ({ ...f, departureTime: e.target.value }));
                        }
                      }}
                    >
                      {slotOptions.map(o => (
                        <option key={o.key} value={o.time}>
                          {DAY_LABELS[o.day - 1]} · {o.time}
                        </option>
                      ))}
                      <option value="__custom__">— Custom time…</option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        step={60}
                        value={form.departureTime}
                        onChange={e => setForm(f => ({ ...f, departureTime: e.target.value }))}
                        className="tabular-nums"
                      />
                      {slotOptions.length > 0 && (
                        <button
                          type="button"
                          className="text-[11px] text-indigo-600 hover:underline whitespace-nowrap"
                          onClick={() => setCustomDeparture(false)}
                        >
                          pick a slot
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    End time <span className="text-gray-400 font-normal">(optional)</span>
                  </Label>
                  <Input
                    type="time"
                    step={60}
                    value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    className="tabular-nums"
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional — plate, driver name, weather note, etc."
              maxLength={2000}
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <Switch
              checked={form.active}
              onCheckedChange={v => setForm(f => ({ ...f, active: v }))}
            />
            Active
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
