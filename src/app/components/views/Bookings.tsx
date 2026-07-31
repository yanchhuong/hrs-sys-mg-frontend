import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { DateInput } from '../common/DateInput';
import { SearchablePicker } from '../common/SearchablePicker';
import {
  Plus, Search, Loader2, Ticket, CheckCircle2, DollarSign, Undo2, X,
  Ban, Trash2, Settings, CalendarClock, Info,
  Image as ImageIconLucide,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { SeatMapDisplay, CinemaSeatMap, parseSeatLayout, type SeatLayout } from '../common/SeatMap';
import { BookingSchedulesDialog } from '../common/BookingSchedulesDialog';
import * as bookingSchedulesApi from '../../api/bookingSchedules';
import * as bookingTripsApi from '../../api/bookingTrips';
import { format as fmtDate, parseISO } from 'date-fns';

/** ISO day-of-week labels — 1=Mon..7=Sun. Matches
 *  BookingScheduleSlot.dayOfWeek numbering. */
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** v-property-desc-strip — property descriptions typed before the
 *  Schedule entity commonly baked schedule info into the free
 *  text field (e.g. "plate-PP-2333 - Schedule - 7:00 AM Departure").
 *  Now that Schedule is a real entity picked separately, strip
 *  the trailing `- Schedule - …` suffix at render time so the
 *  right-side card just shows the plate/id. */
function stripScheduleSuffix(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/\s*[-–—]\s*Schedule\s*[-–—].*$/i, '').trim();
}
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { formatMoney } from '../../utils/format';
import * as bookingsApi from '../../api/bookings';
import { useDateFormat } from '../../context/DateFormatContext';
import { Pagination } from '../common/Pagination';
import { usePagination } from '../../hooks/usePagination';
import * as customersApi from '../../api/customers';
import * as paymentPlanItemsApi from '../../api/paymentPlanItems';

/**
 * Booking module (v-booking-mvp, V288). Under Receivables → Booking.
 * One-time purchases against the Property catalogue: buy a ticket,
 * book a room, reserve a seat.
 *
 * <p>Distinct from Payment Plans in that there's no schedule / no
 * terms / no interest — one lump-sum amount and a status
 * lifecycle: draft → confirmed → paid → refunded, plus cancelled.
 * The catalogue reader is the same as Plans (paymentPlanItemsApi),
 * so the operator picks a parent Property + one-or-more options
 * (respecting the parent's selectMode).</p>
 */
export function Bookings() {
  const { canCreate, canUpdate, canDelete } = useAuth();
  // v-session-picker-date-format — user-preferred date format for
  // the Session column in the Bookings table (matches the Date
  // input on the New Booking dialog).
  const { formatDate } = useDateFormat();
  const canWrite  = canCreate('booking') || canUpdate('booking');
  const canRemove = canDelete('booking');
  // v-page-title-i18n — header follows the sidebar leaf label.
  const { t } = useI18n();

  const [rows, setRows] = useState<bookingsApi.Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<bookingsApi.BookingStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  const [items, setItems] = useState<paymentPlanItemsApi.PaymentPlanItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  /** v-booking-schedule-mvp — gear-icon Settings dialog manages
   *  time-anchored slots (Van departures, cinema showtimes). */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [schedules, setSchedules] = useState<bookingSchedulesApi.BookingSchedule[]>([]);
  /** v-booking-trip-mvp — concrete date-instances per schedule.
   *  Fetched once on load; the Create Booking picker filters by
   *  the chosen schedule at render time. */
  const [trips, setTrips] = useState<bookingTripsApi.BookingTrip[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bs, cs, its, ss, ts] = await Promise.all([
        bookingsApi.list(statusFilter === 'all' ? undefined : statusFilter),
        // v-customers-kind-separation — Booking flow only ever
        // targets real customers (not patients / students), so
        // pin the kind filter so the picker doesn't leak
        // healthcare / school lens rows into a sales surface.
        customersApi.list({ kind: 'customer', size: 1000 }),
        paymentPlanItemsApi.list(),
        bookingSchedulesApi.list(),
        bookingTripsApi.list(),
      ]);
      setRows(bs);
      setCustomers(cs.content ?? []);
      setItems(its.filter(i => i.active));
      setSchedules(ss);
      setTrips(ts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load bookings');
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const customersById = useMemo(
    () => new Map(customers.map(c => [c.id, c])),
    [customers],
  );
  const itemsById = useMemo(
    () => new Map(items.map(i => [i.id, i])),
    [items],
  );
  /** v-booking-session-column — quick lookups for the Session cell
   *  on the list. Trip → schedule → property chain is resolved once
   *  per render for O(1) row rendering. */
  const tripById = useMemo(
    () => new Map(trips.map(t => [t.id, t])),
    [trips],
  );
  const scheduleById = useMemo(
    () => new Map(schedules.map(s => [s.id, s])),
    [schedules],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => {
      const cust = r.customerId ? customersById.get(r.customerId)?.name ?? '' : '';
      const item = r.itemId ? itemsById.get(r.itemId)?.name ?? '' : '';
      return (
        r.bookingNo.toLowerCase().includes(q) ||
        cust.toLowerCase().includes(q) ||
        item.toLowerCase().includes(q)
      );
    });
  }, [rows, search, customersById, itemsById]);

  const detail = useMemo(
    () => (detailId ? rows.find(r => r.id === detailId) ?? null : null),
    [detailId, rows],
  );

  // v-receivables-pagination-consistency — 15 rows/page matches Plans.
  const pagination = usePagination(filtered, 15);
  useEffect(() => { pagination.resetPage(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, statusFilter]);

  return (
    <div className="space-y-6">
      {/* v-receivables-header-consistency — aligned with Plans + Collections
          (page-header-strip + text-3xl h1 + icon inside h1) so all four
          Receivables leaves share one header shape. */}
      <div className="page-header-strip">
        <div>
          <h1 className="text-3xl font-bold inline-flex items-center gap-2">
            <Ticket className="h-7 w-7 text-indigo-600" />
            {t('nav.receivables.booking')}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  One-time purchases against the Property catalogue — buy a ticket, book a room, reserve a seat. Lifecycle: Draft → Confirmed → Paid → Refunded.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Gear — opens the Schedules settings dialog. Sits left of
              New booking so operators can curate departure /
              showtime slots BEFORE writing bookings against them. */}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            title="Manage schedules + sessions — departures, showtimes, slots"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
          {canWrite && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> New booking</Button>
            </DialogTrigger>
            <CreateBookingDialogContent
              customers={customers}
              items={items}
              schedules={schedules}
              trips={trips}
              onSaved={() => { setCreateOpen(false); void load(); }}
            />
          </Dialog>
          )}
        </div>
      </div>

      <BookingSchedulesDialog open={settingsOpen} onOpenChange={o => { setSettingsOpen(o); if (!o) void load(); }} />

      <Card>
        <CardHeader className="pb-3">
          <div className="filter-strip">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search booking #, customer, item"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as bookingsApi.BookingStatus | 'all')}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                {(Object.entries(bookingsApi.BOOKING_STATUS_META) as [bookingsApi.BookingStatus, { label: string }][])
                  .map(([k, m]) => <TabsTrigger key={k} value={k}>{m.label}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {/* v-receivables-table-consistency — bare Table (no inner
              border, no shaded header row) matches Plans + Collections
              so the four Receivables tables render identically. */}
          <Table>
            <TableHeader>
              <TableRow>
                  <TableHead className="w-32">Booking #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Item / Options</TableHead>
                  <TableHead className="w-44">Session</TableHead>
                  <TableHead className="w-32">Date</TableHead>
                  <TableHead className="w-28 text-right">Amount</TableHead>
                  <TableHead className="w-28 text-center">Status</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-xs text-gray-500 py-6">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-xs text-gray-500 py-8">
                      No bookings yet. Click <b>+ New booking</b> to get started.
                    </TableCell>
                  </TableRow>
                ) : pagination.paginatedItems.map(r => {
                  const item = r.itemId ? itemsById.get(r.itemId) : null;
                  const picks = item?.options?.filter(o => r.selectedOptionIds.includes(o.id)) ?? [];
                  // v-booking-session-column — resolve Session cell via
                  // trip → schedule chain. Falls back to schedule-only
                  // when the booking is schedule-scoped but not trip-
                  // scoped (legacy path). Missing tripId + scheduleId
                  // → `—` (walk-in / property-wide booking).
                  const trip = r.tripId ? tripById.get(r.tripId) : null;
                  const sch = trip ? scheduleById.get(trip.scheduleId)
                    : r.scheduleId ? scheduleById.get(r.scheduleId) : null;
                  const typeLabel = trip ? (
                    bookingTripsApi.SESSION_TYPE_LABELS.find(o => o.value === (trip.sessionType ?? 'trip'))?.label ?? 'Trip'
                  ) : null;
                  return (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setDetailId(r.id)}>
                      <TableCell className="font-medium tabular-nums">{r.bookingNo}</TableCell>
                      <TableCell>{customersById.get(r.customerId)?.name ?? <span className="text-gray-400">—</span>}</TableCell>
                      <TableCell className="text-sm">
                        <div>{item?.name ?? <span className="text-gray-400">—</span>}</div>
                        {picks.length > 0 && (
                          <div className="text-[11px] text-gray-500 truncate max-w-xs" title={picks.map(o => o.name).join(', ')}>
                            {picks.map(o => o.name).join(', ')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {trip ? (
                          <>
                            <div className="tabular-nums">
                              {formatDate(trip.tripDate)} · {trip.departureTime.slice(0, 5)}
                              {trip.endTime ? `–${trip.endTime.slice(0, 5)}` : ''}
                            </div>
                            {(sch || typeLabel) && (
                              <div className="text-[10px] text-gray-500 truncate max-w-[10rem]" title={`${typeLabel ?? ''}${sch ? ' · ' + sch.name : ''}`}>
                                {typeLabel}{sch ? ` · ${sch.name}` : ''}
                              </div>
                            )}
                          </>
                        ) : sch ? (
                          <>
                            <div>{sch.name}</div>
                            <div className="text-[10px] text-gray-500 italic">schedule only</div>
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{r.bookingDate}</TableCell>
                      <TableCell className="text-right tabular-nums">${formatMoney(r.amount)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={bookingsApi.BOOKING_STATUS_META[r.status].badge}>
                          {bookingsApi.BOOKING_STATUS_META[r.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setDetailId(r.id)}>Open</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            onPageChange={pagination.goToPage}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            totalItems={pagination.totalItems}
          />
        </CardContent>
      </Card>

      {detail && (
        <BookingDetailDialog
          booking={detail}
          customer={detail.customerId ? customersById.get(detail.customerId) : undefined}
          item={detail.itemId ? itemsById.get(detail.itemId) : undefined}
          canWrite={canWrite}
          canRemove={canRemove}
          onClose={() => setDetailId(null)}
          onChanged={() => { void load(); }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Create dialog — property header + seat map on the left, booking summary    */
/* card on the right. Mirrors ViewPropertyDialog's shape so the two           */
/* booking-creation surfaces feel identical.                                  */
/* -------------------------------------------------------------------------- */

function CreateBookingDialogContent({
  customers, items, schedules, trips, onSaved,
}: {
  customers: customersApi.Customer[];
  items: paymentPlanItemsApi.PaymentPlanItem[];
  schedules: bookingSchedulesApi.BookingSchedule[];
  trips: bookingTripsApi.BookingTrip[];
  onSaved: () => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [itemId, setItemId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [tripId, setTripId] = useState('');
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState('');
  const [bookingDate, setBookingDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  /** v-new-booking-view-shape — the flat-form fallback for non-seat
   *  properties shows Amount + Date + Notes as before; the seat-
   *  map layout embeds them into the right-side summary card. */

  /** Schedules under the currently-picked property. Filtered
   *  client-side from the pre-fetched list so the picker responds
   *  instantly when the operator changes item. */
  const schedulesForItem = useMemo(
    () => (itemId ? schedules.filter(s => s.itemId === itemId && s.active) : []),
    [itemId, schedules],
  );

  /** v-new-booking-default-schedule — auto-pick the first active
   *  schedule when the dialog mounts so the operator lands on a
   *  usable state instead of an empty picker. Only fires while
   *  scheduleId is empty; won't overwrite operator changes. */
  useEffect(() => {
    if (scheduleId || schedules.length === 0) return;
    const first = schedules.find(s => s.active) ?? schedules[0];
    if (!first) return;
    setScheduleId(first.id);
    setItemId(first.itemId);
  }, [schedules, scheduleId]);
  /** Trips under the currently-picked schedule. Only surfaces when
   *  a schedule is chosen — trips aren't meaningful without one.
   *  v-session-picker-sort — sorted ascending by (tripDate, then
   *  departureTime) so the dropdown reads earliest-first regardless
   *  of the order the BE returned. */
  const tripsForSchedule = useMemo(
    () => (scheduleId
      ? trips
          .filter(t => t.scheduleId === scheduleId && t.active)
          .slice()
          .sort((a, b) => {
            if (a.tripDate !== b.tripDate) return a.tripDate < b.tripDate ? -1 : 1;
            return a.departureTime < b.departureTime ? -1 : a.departureTime > b.departureTime ? 1 : 0;
          })
      : []),
    [scheduleId, trips],
  );

  const pickedItem = useMemo(
    () => (itemId ? items.find(i => i.id === itemId) ?? null : null),
    [itemId, items],
  );
  // V298 — flat option list across ungrouped + all groups. Used for
  // occupancy set-lookup, selection state, seat layout parsing, and
  // Total calculation. Group structure is preserved separately in
  // `pickedItemOptionsByGroup` for the grouped render.
  const pickedItemOptions = useMemo(() => {
    if (!pickedItem) return [];
    const out = [...(pickedItem.options ?? [])];
    for (const g of pickedItem.optionGroups ?? []) {
      for (const o of g.options ?? []) out.push(o);
    }
    return out.filter(o => o.active);
  }, [pickedItem]);
  /** V298 — {@link pickedItemOptions} sliced into (ungrouped, groups)
   *  for the grouped picker render. Groups whose active options are
   *  all inactive are dropped from the list. */
  const pickedItemOptionsByGroup = useMemo(() => {
    if (!pickedItem) return { ungrouped: [] as itemsApi.PaymentPlanItemOption[], groups: [] as { group: itemsApi.PaymentPlanItemOptionGroup; options: itemsApi.PaymentPlanItemOption[] }[] };
    const ungrouped = (pickedItem.options ?? []).filter(o => o.active);
    const groups = (pickedItem.optionGroups ?? [])
      .filter(g => g.active)
      .map(g => ({ group: g, options: (g.options ?? []).filter(o => o.active) }))
      .filter(entry => entry.options.length > 0);
    return { ungrouped, groups };
  }, [pickedItem]);
  const pickedOptionsList = useMemo(
    () => pickedItemOptions.filter(o => selectedOptionIds.has(o.id)),
    [pickedItemOptions, selectedOptionIds],
  );

  /** v-booking-seat-map + v-booking-schedule-mvp — option ids
   *  currently taken by any active booking on this property.
   *  Scoped to the picked Schedule when set, so the same Van at
   *  7 AM and 5 PM have independent inventories. Refetched
   *  whenever either the Item or Schedule changes. */
  const [occupiedIds, setOccupiedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!itemId) { setOccupiedIds(new Set()); return; }
    let cancelled = false;
    // v-booking-trip-mvp — Trip scope wins over schedule scope for
    // occupancy. When the operator picks a specific trip, only
    // bookings on THAT trip paint seats grey.
    const opts = tripId ? { tripId } : (scheduleId ? { scheduleId } : undefined);
    bookingsApi.occupiedOptions(itemId, opts)
      .then(res => { if (!cancelled) setOccupiedIds(new Set(res.occupiedOptionIds ?? [])); })
      .catch(() => { if (!cancelled) setOccupiedIds(new Set()); });
    return () => { cancelled = true; };
  }, [itemId, scheduleId, tripId]);

  /** v-booking-seat-map — parse option names into (row, col) tuples.
   *  Delegated to the shared parser so the Property view popup can
   *  reuse the exact same layout rules. */
  const seatLayout = useMemo(
    () => parseSeatLayout(pickedItemOptions),
    [pickedItemOptions],
  );
  // v-property-cinema-map — mirrors the Property view popup: when the
  // picked property is category=entertainment AND has at least one
  // parseable seat, we render the cinema (SCREEN + group sections)
  // layout instead of the vehicle layout.
  const isCinema = pickedItem?.category === 'entertainment';
  const useSeatSurface = isCinema
    ? pickedItemOptions.some(o => /^[A-Za-z]+[\s\-_.]*\d+$/.test((o.name ?? '').trim()))
    : Boolean(seatLayout);

  /** Auto-fill Amount from the picks. Amount stays editable so the
   *  operator can apply a discount / surcharge — this only fires
   *  when the pick set changes.
   *  v-booking-total-zero-default — no picks = $0.00 (was: parent's
   *  price). The parent price was misleading when the property has
   *  option-priced seats — total would spike to the parent's fallback
   *  before any seat was picked. Total now reads cleanly as 0 until
   *  the operator actually picks something.
   */
  const applyPricing = (picks: paymentPlanItemsApi.PaymentPlanItemOption[], _parent: paymentPlanItemsApi.PaymentPlanItem | null) => {
    if (picks.length === 0) {
      setAmount('0');
    } else {
      const sum = picks.reduce((s, x) => s + (Number(x.price) || 0), 0);
      setAmount(String(sum));
    }
  };

  // v-session-picker-past — a past session may be SELECTED so the
  // operator can inspect its seat map / who booked what (history
  // view), but Continue to Payment stays disabled so no new
  // booking lands against a session that already happened.
  const isPastTripSelected = ((): boolean => {
    if (!tripId) return false;
    const t = trips.find(x => x.id === tripId);
    if (!t) return false;
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return t.tripDate < iso;
  })();
  const canSave = Boolean(customerId) && Number(amount) >= 0 && Boolean(bookingDate) && !isPastTripSelected;

  const handleSave = async () => {
    if (!canSave) return;
    // v-session-picker-past — refuse to save when the selected
    // session is in the past. The dropdown already disables past
    // rows; this covers the edge case of a stale tripId set before
    // it became past.
    if (tripId) {
      const t = trips.find(x => x.id === tripId);
      const todayIso = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();
      if (t && t.tripDate < todayIso) {
        toast.error('That session is in the past — pick a future one or clear the Session field.');
        return;
      }
    }
    setSaving(true);
    // Prepend picked option names to Notes so the booking record
    // carries them wherever notes render, matching the v-plan-
    // options-picker convention.
    const optionsLine = pickedOptionsList.length > 0
      ? `Options: ${pickedOptionsList.map(o => o.name).join(', ')}`
      : '';
    const notesToSave = [optionsLine, notes.trim()].filter(Boolean).join('\n') || null;
    try {
      await bookingsApi.create({
        customerId,
        itemId: itemId || null,
        scheduleId: scheduleId || null,
        tripId: tripId || null,
        selectedOptionIds: Array.from(selectedOptionIds),
        amount: Number(amount) || 0,
        bookingDate,
        notes: notesToSave,
      });
      toast.success('Booking created');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const toggleOption = (o: paymentPlanItemsApi.PaymentPlanItemOption) => {
    if (!pickedItem || occupiedIds.has(o.id)) return;
    const checked = selectedOptionIds.has(o.id);
    const next = new Set(selectedOptionIds);
    if (pickedItem.selectMode === 'single') {
      next.clear();
      if (!checked) next.add(o.id);
    } else if (checked) {
      next.delete(o.id);
    } else {
      next.add(o.id);
    }
    setSelectedOptionIds(next);
    applyPricing(pickedItemOptions.filter(x => next.has(x.id)), pickedItem);
  };

  return (
    <DialogContent className="max-w-6xl sm:max-w-6xl w-[97vw] min-h-[80vh] max-h-[92vh] overflow-y-auto">
      {/* Title stays constant at "New booking" so the header
       *  doesn't jump around when the operator picks a property
       *  (property image + badges surface in the right-side
       *  summary card once picked). */}
      <DialogHeader>
        <DialogTitle className="inline-flex items-center gap-2">
          <Ticket className="h-4 w-4 text-indigo-600" />
          New booking
        </DialogTitle>
      </DialogHeader>

      {/* v-new-booking-schedule-first — Schedule picker instead of
       *  Property picker. A Schedule already carries its Property
       *  (schedule.itemId), so picking one auto-derives the
       *  property + shows its seat map below. Removes a redundant
       *  click from the booking flow. */}
      <div className="mt-1 mb-2">
        <Label className="text-xs">Schedule <span className="text-red-500">*</span></Label>
        <SearchablePicker
          value={scheduleId}
          onChange={(id) => {
            setScheduleId(id);
            setTripId('');
            setSelectedOptionIds(new Set());
            // Derive the parent property from the picked schedule
            // so the seat map + right-side card + occupancy fetch
            // all key off the same itemId.
            const sched = id ? schedules.find(s => s.id === id) ?? null : null;
            const nextItemId = sched?.itemId ?? '';
            setItemId(nextItemId);
            const picked = nextItemId ? items.find(i => i.id === nextItemId) ?? null : null;
            applyPricing([], picked);
          }}
          options={schedules.filter(s => s.active).map(s => {
            const item = items.find(i => i.id === s.itemId);
            // v-schedule-picker-session-count — label reads
            // `<schedule> (<N> sessions)` where N counts the
            // active trips under this schedule. Slot preview
            // dropped from the label; if operators need to
            // disambiguate two schedules with the same name on
            // different properties, the property name lives on the
            // secondary line.
            const sessionCount = trips.filter(t => t.scheduleId === s.id && t.active).length;
            return {
              value: s.id,
              label: `${s.name} (${sessionCount} session${sessionCount === 1 ? '' : 's'})`,
              secondary: item?.name ?? undefined,
              searchKey: `${item?.name ?? ''} ${s.name}`,
            };
          })}
          placeholder={schedules.length === 0
            ? 'No schedules yet — add one via the ⚙ button.'
            : 'Pick a schedule'}
          searchPlaceholder="Search schedules…"
          allowClear
          disabled={schedules.length === 0}
        />
      </div>

      {!pickedItem ? (
        // v-new-booking-empty-shell — keep the dialog at full
        // size even before a property is picked so the layout
        // doesn't shrink then grow. Mirrors the two-column seat-
        // map / summary shape with placeholder content on both
        // sides.
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
          <div className="space-y-2">
            <div className="rounded-xl border bg-white px-4 py-3 flex items-center gap-4 flex-wrap text-[11px] tracking-wide uppercase text-gray-400 opacity-60">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-4 w-4 rounded bg-indigo-100 border border-indigo-200" /> Available
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-4 w-4 rounded bg-indigo-600" /> Selected
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-4 w-4 rounded bg-gray-300" /> Occupied
              </span>
            </div>
            <div className="rounded-2xl bg-indigo-50/40 py-16 flex items-center justify-center">
              <div className="text-center text-xs text-gray-500 italic max-w-xs px-4">
                Pick a property above to see its seat layout and start a booking.
              </div>
            </div>
          </div>
          <div className="space-y-3 opacity-70">
            <div className="rounded-xl border bg-white p-3 flex items-start gap-3">
              <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                <ImageIconLucide className="h-5 w-5 text-gray-300" />
              </div>
              <div className="min-w-0">
                <div className="text-sm text-gray-400 italic">No property yet</div>
              </div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-[10px] font-semibold tracking-wide uppercase text-gray-500 mb-2">Selected Seats</div>
              <div className="text-xs italic text-gray-400 py-2 text-center">Pick a property first</div>
              <div className="border-t pt-2 mt-2 flex items-center justify-between text-xs">
                <span className="text-gray-500">Total Amount</span>
                <span className="tabular-nums font-semibold text-2xl text-gray-300">$0.00</span>
              </div>
              <Button className="w-full mt-3 h-11 bg-indigo-600 hover:bg-indigo-700" disabled>
                Continue to Payment
              </Button>
            </div>
          </div>
        </div>
      ) : pickedItemOptions.length === 0 ? (
        // Plain single-line property (no options at all). Simple
        // form fallback with Amount + Date + Notes + Customer.
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Customer <span className="text-red-500">*</span></Label>
            <SearchablePicker
              value={customerId}
              onChange={setCustomerId}
              options={customers.map(c => ({ value: c.id, label: c.name, secondary: c.phone ?? undefined }))}
              placeholder="Pick a customer"
              searchPlaceholder="Search customers…"
              allowClear={false}
            />
          </div>
          <div className="space-y-1">
            <Label>Amount <span className="text-red-500">*</span></Label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)}
              className="text-right tabular-nums" placeholder="0.00" />
          </div>
          <div className="space-y-1">
            <Label>Booking Date <span className="text-red-500">*</span></Label>
            <DateInput value={bookingDate} onChange={setBookingDate} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={4000}
              placeholder="Optional — any special conditions or a reference." />
          </div>
        </div>
      ) : useSeatSurface ? (
        // Seat-mapped property — full view-property-style layout.
        // Van variant uses the parsed layout; cinema variant reads
        // groups directly and renders the SCREEN-shape map.
        <SeatMapPanel
          layout={seatLayout}
          isCinema={isCinema}
          property={pickedItem}
          selectedIds={selectedOptionIds}
          occupiedIds={occupiedIds}
          pickedList={pickedOptionsList}
          amount={amount}
          bookingDate={bookingDate}
          onDateChange={setBookingDate}
          schedules={schedulesForItem}
          tripsForSchedule={tripsForSchedule}
          scheduleId={scheduleId}
          onScheduleChange={(v) => { setScheduleId(v); setTripId(''); }}
          tripId={tripId}
          onTripChange={setTripId}
          customers={customers}
          customerId={customerId}
          onCustomerChange={setCustomerId}
          onToggle={toggleOption}
          onSubmit={handleSave}
          saving={saving}
          canSave={Boolean(canSave)}
          isPastTripSelected={isPastTripSelected}
        />
      ) : (
        // Non-seat property with options (Rooms/Trims): keep the
        // flat card grid but wrap in a two-column with summary on
        // the right so the shape still mirrors View Property.
        // V298 — options render as ungrouped grid first, then each
        // group as a titled section. Selection + occupancy still
        // work off the flat `pickedItemOptions` set.
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Options for {pickedItem.name}
              <span className="ml-1 text-[10px] font-normal text-gray-500 normal-case tracking-normal">
                ({pickedItem.selectMode === 'multi' ? 'pick one or more' : 'pick one'})
              </span>
            </Label>
            {pickedItemOptionsByGroup.ungrouped.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {pickedItemOptionsByGroup.ungrouped.map(o => (
                  <OptionPickRow
                    key={o.id}
                    o={o}
                    checked={selectedOptionIds.has(o.id)}
                    disabled={occupiedIds.has(o.id)}
                    mode={pickedItem.selectMode}
                    itemId={pickedItem.id}
                    onToggle={() => toggleOption(o)}
                  />
                ))}
              </div>
            )}
            {pickedItemOptionsByGroup.groups.map(({ group, options }) => (
              <div key={group.id} className="space-y-1.5">
                <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                  {group.name}
                  {group.description && (
                    <span className="ml-1 text-[10px] font-normal text-gray-500 normal-case tracking-normal">
                      — {group.description}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {options.map(o => (
                    <OptionPickRow
                      key={o.id}
                      o={o}
                      checked={selectedOptionIds.has(o.id)}
                      disabled={occupiedIds.has(o.id)}
                      mode={pickedItem.selectMode}
                      itemId={pickedItem.id}
                      onToggle={() => toggleOption(o)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border bg-white p-3 space-y-3">
              <div className="border-t-0 pt-0 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-[10px] font-semibold tracking-wide uppercase text-gray-500 min-w-[64px]">Date</Label>
                  <div className="flex-1"><DateInput value={bookingDate} onChange={setBookingDate} /></div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-[10px] font-semibold tracking-wide uppercase text-gray-500 mb-2">Selected</div>
              {pickedOptionsList.length === 0 ? (
                <div className="text-xs italic text-gray-400 py-2 text-center">No options selected yet</div>
              ) : (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {pickedOptionsList.map(o => (
                    <span key={o.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs font-medium">
                      {o.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="border-t pt-2 mt-2 flex items-center justify-between text-xs">
                <span className="text-gray-500">Total Amount</span>
                <span className="tabular-nums font-semibold text-2xl text-indigo-700">
                  ${Number(amount || 0).toFixed(2)}
                </span>
              </div>
              <div className="space-y-2 mt-3 border-t pt-3">
                <Label className="text-[10px] font-semibold tracking-wide uppercase text-gray-500">Customer <span className="text-red-500">*</span></Label>
                <SearchablePicker
                  value={customerId}
                  onChange={setCustomerId}
                  options={customers.map(c => ({ value: c.id, label: c.name, secondary: c.phone ?? undefined }))}
                  placeholder="Pick a customer"
                  searchPlaceholder="Search customers…"
                  allowClear={false}
                />
              </div>
              <Button
                className="w-full mt-3 h-11 bg-indigo-600 hover:bg-indigo-700"
                disabled={saving || !canSave}
                onClick={handleSave}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Continue to Payment
              </Button>
            </div>
          </div>
        </div>
      )}

      <DialogFooter className="mt-3">
        <Button variant="outline" onClick={onSaved} disabled={saving}>
          <X className="h-3.5 w-3.5 mr-1" /> Cancel
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* -------------------------------------------------------------------------- */
/* SeatMapPanel — Booking Create surface wrapper around the shared            */
/* SeatMapDisplay, adding the right-side summary card (property image,        */
/* selected seat pills, total). The seat grid + legend are entirely in the    */
/* shared component so the Property View popup can reuse them read-only.     */
/* -------------------------------------------------------------------------- */

function SeatMapPanel({
  layout, isCinema, property, selectedIds, occupiedIds, pickedList, amount,
  bookingDate, onDateChange,
  schedules, tripsForSchedule, scheduleId, onScheduleChange, tripId, onTripChange,
  customers, customerId, onCustomerChange,
  onToggle,
  onSubmit, saving, canSave, isPastTripSelected,
}: {
  /** v-property-cinema-map — parsed van layout. May be null when the
   *  property is a cinema and options don't fit the van parser but
   *  still parse row+col in CinemaSeatMap's own regex. */
  layout: SeatLayout | null;
  /** True when the property's category is `entertainment` — swaps
   *  the seat renderer for the SCREEN-shape variant. */
  isCinema: boolean;
  property: paymentPlanItemsApi.PaymentPlanItem;
  selectedIds: Set<string>;
  occupiedIds: Set<string>;
  pickedList: paymentPlanItemsApi.PaymentPlanItemOption[];
  amount: string;
  bookingDate: string;
  onDateChange: (v: string) => void;
  schedules: bookingSchedulesApi.BookingSchedule[];
  tripsForSchedule: bookingTripsApi.BookingTrip[];
  scheduleId: string;
  onScheduleChange: (v: string) => void;
  tripId: string;
  onTripChange: (v: string) => void;
  customers: customersApi.Customer[];
  customerId: string;
  onCustomerChange: (v: string) => void;
  onToggle: (o: paymentPlanItemsApi.PaymentPlanItemOption) => void;
  onSubmit: () => void;
  saving: boolean;
  canSave: boolean;
  /** v-session-picker-past — true when the picked session is
   *  historical (view-only). Renders the "not bookable" hint
   *  above Continue to Payment. */
  isPastTripSelected: boolean;
}) {
  // v-session-picker-date-format — Session dropdown formats trip
  // dates using the app-wide user format (matches the Date field
  // above it) instead of the raw ISO string.
  const { formatDate } = useDateFormat();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
      {isCinema ? (
        <CinemaSeatMap
          property={property}
          selectedIds={selectedIds}
          occupiedIds={occupiedIds}
          onToggle={onToggle}
        />
      ) : (
        <SeatMapDisplay
          layout={layout!}
          selectedIds={selectedIds}
          occupiedIds={occupiedIds}
          onToggle={onToggle}
        />
      )}

      {/* Right column — property card + date + session + selected
       *  seats + total + customer + submit. Mirrors the layout of
       *  ViewPropertyDialog so the two booking surfaces feel
       *  identical (this dialog just adds the Customer picker up
       *  front since it's a create surface). */}
      <div className="space-y-3">
        <div className="rounded-xl border bg-white p-3 space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
              {property.imageUrl ? (
                <img src={property.imageUrl} alt={property.name} className="h-full w-full object-cover" />
              ) : (
                <ImageIconLucide className="h-5 w-5 text-gray-300" />
              )}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-gray-800 truncate">{property.name}</div>
              {(() => {
                const desc = stripScheduleSuffix(property.description);
                return desc ? (
                  <div className="text-[11px] text-gray-500 line-clamp-2" title={property.description ?? ''}>
                    {desc}
                  </div>
                ) : null;
              })()}
            </div>
          </div>
          <div className="border-t pt-2 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-[10px] font-semibold tracking-wide uppercase text-gray-500 min-w-[64px]">Date</Label>
              <div className="flex-1"><DateInput value={bookingDate} onChange={onDateChange} /></div>
            </div>
            {/* Schedule row removed — the top-level picker on the
                dialog already carries this. Session picker below
                still surfaces here since it's schedule-scoped. */}
            {scheduleId && tripsForSchedule.length > 0 && (() => {
              // v-session-picker-past — annotate + block past
              // sessions. Split future vs past so the operator sees
              // both but can only pick future. Past rows carry a
              // small badge so they remain traceable without hiding.
              const todayIso = (() => {
                const d = new Date();
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              })();
              const future = tripsForSchedule.filter(t => t.tripDate >= todayIso);
              const past   = tripsForSchedule.filter(t => t.tripDate <  todayIso);
              return (
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-[10px] font-semibold tracking-wide uppercase text-gray-500 min-w-[64px]">Session</Label>
                  <div className="flex-1">
                    <Select value={tripId || 'none'} onValueChange={v => onTripChange(v === 'none' ? '' : v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="— Any —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Any session —</SelectItem>
                        {future.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            <span className="tabular-nums">{formatDate(t.tripDate)} · {t.departureTime.slice(0, 5)}</span>
                            <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5">
                              Active
                            </span>
                          </SelectItem>
                        ))}
                        {past.length > 0 && (
                          <div className="mt-1 pt-1 border-t border-gray-100">
                            <div className="px-2 py-1 text-[10px] text-gray-400 uppercase tracking-wider">
                              Past — view only, cannot book
                            </div>
                            {/* v-session-picker-past — selectable so
                                the operator can inspect who booked
                                what (seat map still hydrates for a
                                past tripId). Continue to Payment is
                                gated separately via canSave. */}
                            {past.map(t => (
                              <SelectItem key={t.id} value={t.id}>
                                <span className="tabular-nums">{formatDate(t.tripDate)} · {t.departureTime.slice(0, 5)}</span>
                                <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 text-gray-500 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5">
                                  Past
                                </span>
                              </SelectItem>
                            ))}
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-3">
          <div className="text-[10px] font-semibold tracking-wide uppercase text-gray-500 mb-2">Selected Seats</div>
          {pickedList.length === 0 ? (
            <div className="text-xs italic text-gray-400 py-2 text-center">No seats selected yet</div>
          ) : (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {pickedList.map(o => (
                <span key={o.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs font-medium tabular-nums">
                  {o.name}
                </span>
              ))}
            </div>
          )}
          <div className="border-t pt-2 mt-2 flex items-center justify-between text-xs">
            <span className="text-gray-500">Total Amount</span>
            <span className="tabular-nums font-semibold text-2xl text-indigo-700">
              ${Number(amount || 0).toFixed(2)}
            </span>
          </div>
          <div className="space-y-2 mt-3 border-t pt-3">
            <Label className="text-[10px] font-semibold tracking-wide uppercase text-gray-500">Customer <span className="text-red-500">*</span></Label>
            <SearchablePicker
              value={customerId}
              onChange={onCustomerChange}
              options={customers.map(c => ({
                value: c.id,
                label: c.name,
                secondary: c.phone ?? undefined,
              }))}
              placeholder="Pick a customer"
              searchPlaceholder="Search customers…"
              allowClear={false}
            />
          </div>
          {isPastTripSelected && (
            <div className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              This session is in the past — view-only. Pick a future session (or clear it) to book.
            </div>
          )}
          <Button
            className="w-full mt-3 h-11 bg-indigo-600 hover:bg-indigo-700"
            disabled={saving || !canSave}
            onClick={onSubmit}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Continue to Payment
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail dialog — view + status transition buttons + hard delete on draft.   */
/* -------------------------------------------------------------------------- */

function BookingDetailDialog({
  booking, customer, item, canWrite, canRemove, onClose, onChanged,
}: {
  booking: bookingsApi.Booking;
  customer?: customersApi.Customer;
  item?: paymentPlanItemsApi.PaymentPlanItem;
  canWrite: boolean;
  canRemove: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const picks = (item?.options ?? []).filter(o => booking.selectedOptionIds.includes(o.id));

  const doTransition = async (target: bookingsApi.BookingStatus, verb: string) => {
    if (!confirm(`${verb} booking ${booking.bookingNo}?`)) return;
    setBusy(true);
    try {
      await bookingsApi.setStatus(booking.id, target);
      toast.success(`Booking ${target}`);
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transition failed');
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!confirm(`Delete booking ${booking.bookingNo}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await bookingsApi.remove(booking.id);
      toast.success('Booking deleted');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally { setBusy(false); }
  };

  const meta = bookingsApi.BOOKING_STATUS_META[booking.status];
  // Legal next-steps mirror BookingController's transition guard.
  const canConfirm = booking.status === 'draft';
  const canPay     = booking.status === 'confirmed';
  const canRefund  = booking.status === 'paid';
  const canCancel  = booking.status === 'draft' || booking.status === 'confirmed';
  const canDelete  = booking.status === 'draft' || booking.status === 'cancelled';

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl w-[95vw]">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Ticket className="h-4 w-4 text-indigo-600" />
            Booking {booking.bookingNo}
            <Badge className={`ml-2 ${meta.badge}`}>{meta.label}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><Label className="text-xs">Customer</Label><div>{customer?.name ?? <span className="text-gray-400">—</span>}</div></div>
          <div><Label className="text-xs">Booking Date</Label><div>{booking.bookingDate}</div></div>
          <div className="col-span-2"><Label className="text-xs">Property</Label><div>{item?.name ?? <span className="text-gray-400">—</span>}</div></div>
          {picks.length > 0 && (
            <div className="col-span-2">
              <Label className="text-xs">Options</Label>
              <div className="text-xs text-gray-700">{picks.map(o => o.name).join(', ')}</div>
            </div>
          )}
          <div><Label className="text-xs">Amount</Label><div className="tabular-nums font-semibold">${formatMoney(booking.amount)}</div></div>
          <div><Label className="text-xs">Paid Date</Label><div>{booking.paidDate ?? <span className="text-gray-400">—</span>}</div></div>
          {booking.notes && (
            <div className="col-span-2"><Label className="text-xs">Notes</Label><div className="text-xs text-gray-700 whitespace-pre-wrap">{booking.notes}</div></div>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-1.5">
          {canWrite && canConfirm && (
            <Button variant="outline" onClick={() => doTransition('confirmed', 'Confirm')} disabled={busy}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-blue-600" /> Confirm
            </Button>
          )}
          {canWrite && canPay && (
            <Button onClick={() => doTransition('paid', 'Mark paid on')} disabled={busy}>
              <DollarSign className="h-3.5 w-3.5 mr-1.5" /> Mark as Paid
            </Button>
          )}
          {canWrite && canRefund && (
            <Button variant="outline" onClick={() => doTransition('refunded', 'Refund')} disabled={busy}>
              <Undo2 className="h-3.5 w-3.5 mr-1.5 text-amber-600" /> Refund
            </Button>
          )}
          {canWrite && canCancel && (
            <Button variant="outline" onClick={() => doTransition('cancelled', 'Cancel')} disabled={busy}>
              <Ban className="h-3.5 w-3.5 mr-1.5 text-red-600" /> Cancel
            </Button>
          )}
          {canRemove && canDelete && (
            <Button variant="outline" onClick={doDelete} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5 text-red-600" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** V298 — one row inside the non-seat picker. Shared by the
 *  ungrouped grid and each group's grid so the two rendering paths
 *  stay pixel-identical (single-select radio vs multi checkbox,
 *  occupied styling, price alignment). */
function OptionPickRow({
  o, checked, disabled, mode, itemId, onToggle,
}: {
  o: itemsApi.PaymentPlanItemOption;
  checked: boolean;
  disabled: boolean;
  mode: itemsApi.PaymentPlanItemSelectMode;
  itemId: string;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded border transition ${
        disabled ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed'
          : checked ? 'bg-blue-50 border-blue-300 cursor-pointer'
            : 'bg-white hover:bg-gray-50 cursor-pointer'
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <input
          type={mode === 'multi' ? 'checkbox' : 'radio'}
          name={`opts-${itemId}`}
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="shrink-0"
        />
        <span className={`truncate ${disabled ? 'line-through text-gray-400' : ''}`}>{o.name}</span>
      </span>
      <span className="tabular-nums text-gray-700 shrink-0">
        {o.price == null ? '—' : `$${Number(o.price).toFixed(2)}`}
      </span>
    </label>
  );
}
