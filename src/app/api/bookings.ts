import { apiJson, apiVoid } from './client';

/**
 * Booking API client (v-booking-mvp / V288). One-time purchase
 * against the Property catalogue — buy a ticket, book a room,
 * reserve a seat. Distinct from Payment Plans in that there's no
 * schedule / no terms / no interest — just one lump-sum amount and
 * a status lifecycle.
 *
 * Lifecycle: draft → confirmed → paid → refunded, with cancelled
 * reachable from draft/confirmed. Transitions run through the
 * dedicated PUT /status endpoint; the PATCH endpoint edits
 * mutable fields (locked once paid).
 */

export type BookingStatus =
  | 'draft' | 'confirmed' | 'paid' | 'refunded' | 'cancelled';

/** UI label + Tailwind badge classes for each status. Ordered the
 *  way the filter tabs render them; used by the table too. */
export const BOOKING_STATUS_META: Record<BookingStatus, { label: string; badge: string }> = {
  draft:     { label: 'Draft',     badge: 'bg-gray-100 text-gray-700' },
  confirmed: { label: 'Confirmed', badge: 'bg-blue-100 text-blue-800' },
  paid:      { label: 'Paid',      badge: 'bg-emerald-100 text-emerald-700' },
  refunded:  { label: 'Refunded',  badge: 'bg-amber-100 text-amber-700' },
  cancelled: { label: 'Cancelled', badge: 'bg-red-100 text-red-700' },
};

export interface Booking {
  id: string;
  bookingNo: string;
  customerId: string;
  itemId?: string | null;
  /** v-booking-schedule-mvp — optional time-anchored slot under the
   *  Property (see booking-schedules API). Occupancy scopes to
   *  this schedule when the booking has one. */
  scheduleId?: string | null;
  /** v-booking-trip-mvp — optional concrete date-instance. Finer
   *  than scheduleId; when set, occupancy scopes to THIS trip. */
  tripId?: string | null;
  selectedOptionIds: string[];
  amount: number;
  status: BookingStatus;
  bookingDate: string;   // ISO date
  paidDate?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  /** v-booking-phase1 — cash / bank / khqr / card / wing / other. */
  paymentMethod?: string | null;
  paidAt?: string | null;
  refundedAt?: string | null;
  /** v-booking-phase4 — the booked period, when it has one. */
  startAt?: string | null;
  endAt?: string | null;
}

/** v-booking-phase4 — nights between two local datetimes (0 = same day),
 *  the server's pricing rule until the pricing engine: per night when ≥ 1. */
export function nightsBetween(from: string, to: string): number {
  const a = new Date(from), b = new Date(to);
  const d = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  return Math.max(0, Math.round((d(b) - d(a)) / 86400000));
}

/** v-booking-phase1 — how a booking was paid; same keys as plan payments. */
export const PAYMENT_METHODS: { key: string; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'khqr', label: 'KHQR' },
  { key: 'bank', label: 'Bank' },
  { key: 'card', label: 'Card' },
  { key: 'wing', label: 'Wing' },
  { key: 'other', label: 'Other' },
];
export const paymentMethodLabel = (k?: string | null) =>
  PAYMENT_METHODS.find(m => m.key === k)?.label ?? (k ?? '');

export interface UpsertBooking {
  customerId: string;
  itemId?: string | null;
  scheduleId?: string | null;
  tripId?: string | null;
  selectedOptionIds?: string[];
  amount?: number | null;
  bookingDate?: string;
  notes?: string | null;
  /** v-booking-phase4 — a period [startAt, endAt), ISO instants. Both or neither. */
  startAt?: string | null;
  endAt?: string | null;
  /** v-booking-phase3 — this many seats without picking (or places, with no seat map). */
  seats?: number;
  /** v-booking-phase3 — seat id → passenger name. */
  passengers?: Record<string, string>;
}

/** v-booking-phase3 — how full one session is. */
export interface SessionAvailability {
  tripId: string; capacity: number; booked: number; held: number; blocked: number; available: number;
  /** No seat map: book by number of places. */
  capacityOnly: boolean;
}
export const sessionAvailability = (tripId: string): Promise<SessionAvailability> =>
  apiJson('/api/v1/bookings/session-availability', { query: { tripId } });

export function list(status?: BookingStatus): Promise<Booking[]> {
  return apiJson<Booking[]>('/api/v1/bookings', {
    query: status ? { status } : {},
  });
}

export function get(id: string): Promise<Booking> {
  return apiJson<Booking>(`/api/v1/bookings/${id}`);
}

export function create(req: UpsertBooking): Promise<Booking> {
  return apiJson<Booking>('/api/v1/bookings', {
    method: 'POST', json: req,
  });
}

export function update(id: string, req: UpsertBooking): Promise<Booking> {
  return apiJson<Booking>(`/api/v1/bookings/${id}`, {
    method: 'PATCH', json: req,
  });
}

/** Transition status via the dedicated endpoint — the BE enforces
 *  which moves are legal (see BookingController javadoc). */
export function setStatus(id: string, status: BookingStatus, paymentMethod?: string): Promise<Booking> {
  return apiJson<Booking>(`/api/v1/bookings/${id}/status`, {
    method: 'PUT', json: paymentMethod ? { status, paymentMethod } : { status },
  });
}

export function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/bookings/${id}`, { method: 'DELETE' });
}

/** v-booking-seat-map — option ids currently taken by any active
 *  booking for the given parent property. Active = status NOT IN
 *  (cancelled, refunded). Pass `excludeId` when editing so the
 *  booking being edited doesn't paint its own picks grey. Pass
 *  `scheduleId` to scope occupancy to a specific time slot — same
 *  Van at 7 AM and 5 PM have independent inventories. */
export function occupiedOptions(
  itemId: string,
  opts: { excludeId?: string; scheduleId?: string; tripId?: string; date?: string; startAt?: string; endAt?: string } = {},
): Promise<{ itemId: string; occupiedOptionIds: string[]; blockedOptionIds?: string[] }> {
  const q: Record<string, string> = { itemId };
  if (opts.excludeId) q.excludeId = opts.excludeId;
  if (opts.scheduleId) q.scheduleId = opts.scheduleId;
  if (opts.tripId) q.tripId = opts.tripId;
  // v-booking-phase2 — the booking date, so blocks apply without a session.
  if (opts.date) q.date = opts.date;
  // v-booking-phase4 — a period wins over trip / date on the server.
  if (opts.startAt && opts.endAt) { q.startAt = opts.startAt; q.endAt = opts.endAt; }
  return apiJson('/api/v1/bookings/occupied-options', { query: q });
}

/** v-booking-hourly — one property's day (Day view). */
export interface DayUnit { id: string; name: string; code?: string | null; capacity?: number | null; type?: string | null; price?: number | null }
export interface DayEntry {
  bookingId: string; bookingNo: string; customerName?: string | null; status: BookingStatus;
  /** A draft / hold — not confirmed yet. */
  requested: boolean;
  unitId: string;
  /** Clipped to the day. */
  startAt: string; endAt: string;
  /** The whole booking. */
  periodStart: string; periodEnd: string;
}
export interface DayBlock { id: string; unitId: string; startAt: string; endAt: string; reason?: string | null }
export interface DaySchedule {
  itemId: string; itemName: string; priceUnit: 'night' | 'hour' | 'booking'; date: string;
  units: DayUnit[]; entries: DayEntry[]; blocks: DayBlock[];
}
export const daySchedule = (itemId: string, date: string): Promise<DaySchedule> =>
  apiJson('/api/v1/bookings/day-schedule', { query: { itemId, date } });

/** v-booking-phase2 — a period one unit can't be booked (maintenance…). */
export interface ResourceBlock {
  id: string;
  itemId: string;
  optionId: string;
  startAt: string;
  endAt: string;
  reason?: string | null;
  createdAt?: string;
}
export const listBlocks = (itemId?: string): Promise<ResourceBlock[]> =>
  apiJson('/api/v1/booking-resource-blocks', { query: itemId ? { itemId } : {} });
export const createBlock = (req: { optionId: string; startAt: string; endAt: string; reason?: string }): Promise<ResourceBlock> =>
  apiJson('/api/v1/booking-resource-blocks', { method: 'POST', json: req });
export const removeBlock = (id: string): Promise<void> =>
  apiVoid(`/api/v1/booking-resource-blocks/${id}`, { method: 'DELETE' });
