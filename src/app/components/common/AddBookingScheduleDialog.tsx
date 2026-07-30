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
import { Plus, Trash2, CalendarClock, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { SearchablePicker } from './SearchablePicker';
import * as bookingSchedulesApi from '../../api/bookingSchedules';
import * as paymentPlanItemsApi from '../../api/paymentPlanItems';

/**
 * v-booking-schedule-popup — standalone "New / Edit schedule"
 * popup mirroring {@link AddCourseScheduleDialog}. Same shape:
 * two-column field grid + weekly-slots menu at the bottom. Adapts
 * the fields to the Booking domain — Property (not Course),
 * optional Start Date (no End Date), Notes.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: bookingSchedulesApi.BookingSchedule | null;
  items: paymentPlanItemsApi.PaymentPlanItem[];
  onSaved: () => void;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface SlotRow { id?: string; dayOfWeek: number; fromTime: string; }

interface FormState {
  itemId: string;
  name: string;
  notes: string;
  active: boolean;
  slots: SlotRow[];
}

const blank: FormState = {
  itemId: '', name: '', notes: '', active: true, slots: [],
};

export function AddBookingScheduleDialog({ open, onOpenChange, editing, items, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        itemId: editing.itemId,
        name: editing.name,
        notes: editing.notes ?? '',
        active: editing.active,
        slots: (editing.slots ?? []).map(s => ({
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          // Trim any trailing seconds from HH:mm:ss so <input type=time>
          // renders the value cleanly.
          fromTime: s.fromTime.slice(0, 5),
        })),
      });
    } else {
      setForm({ ...blank, itemId: items[0]?.id ?? '' });
    }
  }, [open, editing, items]);

  const addRow = () => setForm(f => ({
    ...f,
    // Default: Mon 07:00 (typical van morning departure). Operators
    // adjust the time; day-of-week alternates as they go.
    slots: [...f.slots, { dayOfWeek: 1, fromTime: '07:00' }],
  }));
  const removeRow = (i: number) => setForm(f => ({
    ...f, slots: f.slots.filter((_, j) => j !== i),
  }));
  const setRow = (i: number, patch: Partial<SlotRow>) => setForm(f => ({
    ...f, slots: f.slots.map((s, j) => j === i ? { ...s, ...patch } : s),
  }));

  const submit = async () => {
    if (!form.itemId) { toast.error('Pick a property'); return; }
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    for (const [i, s] of form.slots.entries()) {
      if (!s.fromTime) { toast.error(`Slot #${i + 1}: start time is required`); return; }
      if (s.dayOfWeek < 1 || s.dayOfWeek > 7) { toast.error(`Slot #${i + 1}: day is out of range`); return; }
    }
    setSaving(true);
    try {
      const payload: bookingSchedulesApi.UpsertBookingSchedule = {
        itemId: form.itemId,
        name: form.name.trim(),
        slots: form.slots.map((s, idx) => ({
          dayOfWeek: s.dayOfWeek,
          fromTime: s.fromTime,
          sortOrder: idx,
        })),
        active: form.active,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await bookingSchedulesApi.update(editing.id, payload);
        toast.success('Schedule updated');
      } else {
        await bookingSchedulesApi.create(payload);
        toast.success('Schedule created');
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            {editing ? 'Edit schedule' : 'New schedule'}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="What is a schedule?"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  A Schedule is the recurring template under a Property — Van
                  departures, cinema showtimes, meeting-room slots. Bookings
                  attach to a Schedule (or a specific Trip under it) so
                  occupancy is scoped per slot.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
          <DialogDescription className="sr-only">
            A Schedule ties a Property to a name + optional Start Date + weekly slots.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Property<span className="text-red-500"> *</span>
              </Label>
              <SearchablePicker
                options={items.map(i => ({
                  value: i.id,
                  label: i.name,
                  secondary: i.category ? String(i.category) : undefined,
                  searchKey: i.name,
                }))}
                value={form.itemId}
                onChange={v => setForm(f => ({ ...f, itemId: v }))}
                placeholder="Pick a property"
                searchPlaceholder="Search properties…"
                allowClear={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Name<span className="text-red-500"> *</span>
              </Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Morning Departure · Batman Ep. 1 · Board Meeting"
                maxLength={200}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer col-span-2">
              <Switch
                checked={form.active}
                onCheckedChange={v => setForm(f => ({ ...f, active: v }))}
              />
              Active
            </label>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional — plate number, driver name, reference, etc."
              maxLength={2000}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-indigo-600" />
                Weekly slots
                <span className="text-[10px] font-normal text-gray-500 ml-1">
                  day-of-week + start time · no end (bookings are one-time)
                </span>
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addRow} className="h-7">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add slot
              </Button>
            </div>
            {form.slots.length === 0 ? (
              <p className="text-[11px] text-gray-500 text-center py-3 border rounded bg-gray-50/40">
                No weekly slots yet. Add at least one so bookings know when.
              </p>
            ) : (
              <div className="space-y-2">
                {form.slots.map((r, i) => (
                  <div key={r.id ?? `new-${i}`} className="grid grid-cols-[120px_1fr_auto] gap-2 items-center">
                    <select
                      className="h-9 px-2 border rounded-md text-sm bg-white"
                      value={r.dayOfWeek}
                      onChange={e => setRow(i, { dayOfWeek: Number(e.target.value) })}
                    >
                      {DAY_LABELS.map((d, idx) => (
                        <option key={idx} value={idx + 1}>{d}</option>
                      ))}
                    </select>
                    <Input
                      type="time"
                      value={r.fromTime}
                      onChange={e => setRow(i, { fromTime: e.target.value })}
                      className="tabular-nums"
                    />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600"
                      onClick={() => removeRow(i)} title="Remove slot">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
