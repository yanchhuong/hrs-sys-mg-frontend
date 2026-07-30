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
}

export interface UpsertBooking {
  customerId: string;
  itemId?: string | null;
  scheduleId?: string | null;
  tripId?: string | null;
  selectedOptionIds?: string[];
  amount?: number;
  bookingDate?: string;
  notes?: string | null;
}

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
export function setStatus(id: string, status: BookingStatus): Promise<Booking> {
  return apiJson<Booking>(`/api/v1/bookings/${id}/status`, {
    method: 'PUT', json: { status },
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
  opts: { excludeId?: string; scheduleId?: string; tripId?: string } = {},
): Promise<{ itemId: string; occupiedOptionIds: string[] }> {
  const q: Record<string, string> = { itemId };
  if (opts.excludeId) q.excludeId = opts.excludeId;
  if (opts.scheduleId) q.scheduleId = opts.scheduleId;
  if (opts.tripId) q.tripId = opts.tripId;
  return apiJson('/api/v1/bookings/occupied-options', { query: q });
}
