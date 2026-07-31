import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Plus, Pencil, Trash2, Loader2, CalendarClock, Route } from 'lucide-react';
import * as bookingSchedulesApi from '../../api/bookingSchedules';
import * as bookingTripsApi from '../../api/bookingTrips';
import * as bookingsApi from '../../api/bookings';
import * as paymentPlanItemsApi from '../../api/paymentPlanItems';
import { useAuth } from '../../context/AuthContext';
import { AddBookingScheduleDialog } from './AddBookingScheduleDialog';
import { AddBookingTripDialog } from './AddBookingTripDialog';

/**
 * BookingSchedulesDialog (v-booking-schedule-slots + v-booking-trip-
 * mvp). Settings dialog opened from the gear icon on the Booking
 * page.
 *
 * <p>Two-column shell with a left-nav — Schedule (recurring
 * template) and Trip (concrete date-instance). Each pane is a
 * table of rows + a `+ Add` button that opens a dedicated popup:
 * {@link AddBookingScheduleDialog} and {@link AddBookingTripDialog}.
 * The popups match the "New course schedule" popup shape so the
 * two schedule surfaces feel identical to the operator.</p>
 */
export function BookingSchedulesDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { canCreate, canUpdate, canDelete } = useAuth();
  const canWrite  = canCreate('booking') || canUpdate('booking');
  const canRemove = canDelete('booking');

  const [topTab, setTopTab] = useState<'schedule' | 'trip'>('schedule');

  const [rows, setRows] = useState<bookingSchedulesApi.BookingSchedule[]>([]);
  const [items, setItems] = useState<paymentPlanItemsApi.PaymentPlanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterItemId, setFilterItemId] = useState<string>('all');
  const [schedulePopupOpen, setSchedulePopupOpen] = useState(false);
  const [scheduleEditing, setScheduleEditing] = useState<bookingSchedulesApi.BookingSchedule | null>(null);

  const [trips, setTrips] = useState<bookingTripsApi.BookingTrip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripFilterScheduleId, setTripFilterScheduleId] = useState<string>('all');
  const [tripPopupOpen, setTripPopupOpen] = useState(false);
  const [tripEditing, setTripEditing] = useState<bookingTripsApi.BookingTrip | null>(null);
  /** v-session-booked-count — active bookings loaded once when the
   *  dialog opens so the Session list can render Booked / Max
   *  seats without a per-row round-trip. Refreshed on any booking
   *  mutation from within the dialog (currently none, but the
   *  hook is in place for later). */
  const [bookings, setBookings] = useState<bookingsApi.Booking[]>([]);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const [ss, its] = await Promise.all([
        bookingSchedulesApi.list(),
        paymentPlanItemsApi.list(),
      ]);
      setRows(ss);
      setItems(its.filter(i => i.active));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load schedules');
    } finally { setLoading(false); }
  }, [open]);

  const loadTrips = useCallback(async () => {
    if (!open) return;
    setTripsLoading(true);
    try {
      const [ts, bs] = await Promise.all([
        bookingTripsApi.list(),
        // Booked-seats count on the Session row is a derived
        // metric — pull the booking list once alongside trips so
        // we don't add an aggregation endpoint just for the UI.
        // Filters cancelled/refunded client-side when computing.
        bookingsApi.list(),
      ]);
      setTrips(ts);
      setBookings(bs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load sessions');
    } finally { setTripsLoading(false); }
  }, [open]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadTrips(); }, [loadTrips]);

  const itemsById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const scheduleById = useMemo(() => new Map(rows.map(s => [s.id, s])), [rows]);
  const filtered = useMemo(
    () => (filterItemId === 'all' ? rows : rows.filter(r => r.itemId === filterItemId)),
    [rows, filterItemId],
  );
  const filteredTrips = useMemo(
    () => (tripFilterScheduleId === 'all' ? trips : trips.filter(t => t.scheduleId === tripFilterScheduleId)),
    [trips, tripFilterScheduleId],
  );

  /** Booked-seat count per trip — sum of `selectedOptionIds` across
   *  all active (non-cancelled/refunded) bookings on that trip.
   *  Precomputed as a map so each row's cell renders in O(1). */
  const bookedByTrip = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bookings) {
      if (!b.tripId) continue;
      if (b.status === 'cancelled' || b.status === 'refunded') continue;
      m.set(b.tripId, (m.get(b.tripId) ?? 0) + (b.selectedOptionIds?.length ?? 0));
    }
    return m;
  }, [bookings]);

  /** Max seats for a schedule's parent property — count of active
   *  options that match the seat-name pattern. Falls back to the
   *  total active-option count for non-seat properties. */
  const maxSeatsForSchedule = (scheduleId: string): number => {
    const sch = scheduleById.get(scheduleId);
    if (!sch) return 0;
    const item = itemsById.get(sch.itemId);
    if (!item) return 0;
    const active = (item.options ?? []).filter(o => o.active);
    // Seat-shaped names count as capacity; if none match the
    // pattern the property is a plain-option row (rooms of a
    // house) so total active count still stands.
    const seatShape = active.filter(o => /^[A-Za-z]+[\s\-_.]*\d+$/.test((o.name ?? '').trim()));
    return seatShape.length > 0 ? seatShape.length : active.length;
  };

  const openAddSchedule = () => { setScheduleEditing(null); setSchedulePopupOpen(true); };
  const openEditSchedule = (r: bookingSchedulesApi.BookingSchedule) => { setScheduleEditing(r); setSchedulePopupOpen(true); };

  const openAddTrip = () => { setTripEditing(null); setTripPopupOpen(true); };
  const openEditTrip = (r: bookingTripsApi.BookingTrip) => { setTripEditing(r); setTripPopupOpen(true); };

  const handleDelete = async (r: bookingSchedulesApi.BookingSchedule) => {
    if (!confirm(`Delete schedule "${r.name}"? Bookings that reference it will detach but stay in place.`)) return;
    try {
      await bookingSchedulesApi.remove(r.id);
      toast.success('Schedule deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };
  const handleTripDelete = async (r: bookingTripsApi.BookingTrip) => {
    const sch = scheduleById.get(r.scheduleId);
    if (!confirm(`Delete session on ${r.tripDate} ${r.departureTime}${sch ? ` (${sch.name})` : ''}? Bookings that reference it will detach but stay in place.`)) return;
    try {
      await bookingTripsApi.remove(r.id);
      toast.success('Session deleted');
      await loadTrips();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl sm:max-w-5xl w-[97vw] max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="inline-flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-indigo-600" />
            Booking Settings
          </DialogTitle>
          <p className="text-xs text-gray-500 mt-1">
            Schedules are recurring templates ("every Mon 08:00"). Sessions are the concrete date-instances of a Schedule ("July 30 08:00"). Bookings attach to a Session for per-departure inventory.
          </p>
        </DialogHeader>

        {/* Two-column shell — left-nav (Schedule | Trip) + content pane. */}
        <div className="flex-1 min-h-0 grid grid-cols-[180px_1fr] overflow-hidden">
          <nav
            role="tablist"
            aria-label="Booking settings section"
            className="flex flex-col gap-1 p-3 border-r bg-gray-50/60 overflow-y-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={topTab === 'schedule'}
              onClick={() => setTopTab('schedule')}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm text-left transition ${
                topTab === 'schedule'
                  ? 'bg-indigo-50 text-indigo-700 font-medium border border-indigo-200'
                  : 'text-gray-800 font-medium hover:bg-white'
              }`}
            >
              <CalendarClock className="h-4 w-4" />
              Schedule
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={topTab === 'trip'}
              onClick={() => setTopTab('trip')}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm text-left transition ${
                topTab === 'trip'
                  ? 'bg-indigo-50 text-indigo-700 font-medium border border-indigo-200'
                  : 'text-gray-800 font-medium hover:bg-white'
              }`}
            >
              <Route className="h-4 w-4" />
              Session
            </button>
          </nav>

          <div className="px-6 py-4 min-w-0 overflow-y-auto space-y-4">
            {topTab === 'schedule' && (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Property:</Label>
                    <Select value={filterItemId} onValueChange={setFilterItemId}>
                      <SelectTrigger className="h-8 w-64 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All properties</SelectItem>
                        {items.map(i => (
                          <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-[11px] text-gray-500">
                      {filtered.length} schedule{filtered.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {canWrite && (
                    <Button size="sm" onClick={openAddSchedule}>
                      <Plus className="h-4 w-4 mr-1" /> Add schedule
                    </Button>
                  )}
                </div>

                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead>Property</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-32">Start Date</TableHead>
                        <TableHead>Slots</TableHead>
                        <TableHead className="w-20 text-center">Status</TableHead>
                        <TableHead className="w-24 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={6} className="text-center text-xs text-gray-500 py-6">
                          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                        </TableCell></TableRow>
                      ) : filtered.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center text-xs text-gray-500 py-8">
                          No schedules yet. Click <b>+ Add schedule</b> to create one.
                        </TableCell></TableRow>
                      ) : filtered.map(r => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm">{itemsById.get(r.itemId)?.name ?? <span className="text-gray-400 italic">—</span>}</TableCell>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {r.startDate ?? <span className="text-gray-400">— open —</span>}
                          </TableCell>
                          <TableCell className="text-xs text-gray-700">
                            {(r.slots?.length ?? 0) === 0 ? (
                              <span className="text-gray-400 italic">no slots</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {r.slots.map(s => (
                                  <span key={s.id ?? `${s.dayOfWeek}-${s.fromTime}`} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] tabular-nums">
                                    {DAY_LABELS[s.dayOfWeek - 1]} {s.fromTime.slice(0, 5)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.active
                              ? <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                              : <Badge variant="outline" className="text-gray-500">Off</Badge>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex gap-1">
                              {canWrite && (
                                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => openEditSchedule(r)} title="Edit">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {canRemove && (
                                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleDelete(r)} title="Delete">
                                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {topTab === 'trip' && (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Schedule:</Label>
                    <Select value={tripFilterScheduleId} onValueChange={setTripFilterScheduleId}>
                      <SelectTrigger className="h-8 w-72 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All schedules</SelectItem>
                        {rows.map(s => {
                          const item = itemsById.get(s.itemId);
                          return (
                            <SelectItem key={s.id} value={s.id}>
                              {item?.name ? `${item.name} · ` : ''}{s.name}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <span className="text-[11px] text-gray-500">
                      {filteredTrips.length} session{filteredTrips.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {canWrite && (
                    <Button size="sm" onClick={openAddTrip} disabled={rows.length === 0}>
                      <Plus className="h-4 w-4 mr-1" /> Add session
                    </Button>
                  )}
                </div>

                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead>Schedule</TableHead>
                        <TableHead className="w-24">Type</TableHead>
                        <TableHead className="w-32">Date</TableHead>
                        <TableHead className="w-24">Departure</TableHead>
                        <TableHead className="w-24">End</TableHead>
                        <TableHead className="w-28 text-center">Booked / Max</TableHead>
                        <TableHead className="w-20 text-center">Status</TableHead>
                        <TableHead className="w-24 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tripsLoading ? (
                        <TableRow><TableCell colSpan={8} className="text-center text-xs text-gray-500 py-6">
                          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                        </TableCell></TableRow>
                      ) : filteredTrips.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center text-xs text-gray-500 py-8">
                          No sessions yet. Click <b>+ Add session</b> to create one{rows.length === 0 ? ' (add a schedule first)' : ''}.
                        </TableCell></TableRow>
                      ) : filteredTrips.map(r => {
                        const sch = scheduleById.get(r.scheduleId);
                        const item = sch ? itemsById.get(sch.itemId) : null;
                        const booked = bookedByTrip.get(r.id) ?? 0;
                        const max = maxSeatsForSchedule(r.scheduleId);
                        const typeLabel = bookingTripsApi.SESSION_TYPE_LABELS.find(
                          o => o.value === (r.sessionType ?? 'trip'),
                        )?.label ?? 'Trip';
                        // v-session-derived-status — Once a session's
                        // date is in the past, "Active" is misleading.
                        // Derive:
                        //   • past + booked > 0 → Done   (indigo)
                        //   • past + booked = 0 → Missed (amber)
                        //   • future/today     → Active  (emerald)
                        //   • r.active = false → Off     (gray)
                        // Purely display-side; the DB active flag
                        // stays untouched. When ops flip the toggle
                        // off manually, "Off" wins over Done/Missed.
                        const todayIso = (() => {
                          const d = new Date();
                          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        })();
                        const isPast = r.tripDate < todayIso;
                        const derived: 'active' | 'off' | 'done' | 'missed' =
                          !r.active ? 'off'
                          : isPast ? (booked > 0 ? 'done' : 'missed')
                          : 'active';
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm">
                              {sch ? (
                                <>
                                  <div>{sch.name}</div>
                                  {item && <div className="text-[11px] text-gray-500">{item.name}</div>}
                                </>
                              ) : <span className="text-gray-400 italic">missing</span>}
                            </TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline" className="text-gray-700">{typeLabel}</Badge>
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">{r.tripDate}</TableCell>
                            <TableCell className="text-xs tabular-nums">{r.departureTime.slice(0, 5)}</TableCell>
                            <TableCell className="text-xs tabular-nums">
                              {r.endTime ? r.endTime.slice(0, 5) : <span className="text-gray-400">—</span>}
                            </TableCell>
                            <TableCell className="text-center text-xs tabular-nums">
                              {max > 0 ? (
                                <span className={booked >= max ? 'text-red-600 font-medium' : 'text-gray-700'}>
                                  {booked} / {max}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {derived === 'active'
                                ? <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                                : derived === 'done'
                                  ? <Badge className="bg-indigo-100 text-indigo-700" title="Session date is past and had at least one booking.">Done</Badge>
                                  : derived === 'missed'
                                    ? <Badge className="bg-amber-100 text-amber-700" title="Session date is past with zero bookings.">Missed</Badge>
                                    : <Badge variant="outline" className="text-gray-500">Off</Badge>}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex gap-1">
                                {canWrite && (
                                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => openEditTrip(r)} title="Edit">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {canRemove && (
                                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleTripDelete(r)} title="Delete">
                                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>

      {/* Popups — mounted alongside the main dialog so they can
       *  stack on top. Closing either popup refreshes the list
       *  behind so the table always mirrors the DB. */}
      <AddBookingScheduleDialog
        open={schedulePopupOpen}
        onOpenChange={setSchedulePopupOpen}
        editing={scheduleEditing}
        items={items}
        onSaved={() => { void load(); }}
      />
      <AddBookingTripDialog
        open={tripPopupOpen}
        onOpenChange={setTripPopupOpen}
        editing={tripEditing}
        schedules={rows}
        items={items}
        onSaved={() => { void loadTrips(); }}
      />
    </Dialog>
  );
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
