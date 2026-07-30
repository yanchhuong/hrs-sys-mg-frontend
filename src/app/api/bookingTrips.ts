import { apiJson, apiVoid } from './client';

/**
 * BookingTrip API client (v-booking-trip-mvp, V292). A Trip is a
 * concrete date-instance of a BookingSchedule — schedule + specific
 * date + specific departure time. Bookings attach to a Trip so
 * occupancy scopes per-departure (Jul 30 08:00 has its own inventory
 * from Jul 31 08:00 even on the same schedule).
 */

/** v-session-type — the flavour of a session/trip. Extendable via
 *  a follow-up DB migration + this union. */
export type SessionType = 'trip' | 'screening' | 'meeting' | 'other';

/** Label + icon key for each session type — surfaced on the Add
 *  popup dropdown and the Session list. Order = dropdown order. */
export const SESSION_TYPE_LABELS: { value: SessionType; label: string }[] = [
  { value: 'trip',      label: 'Trip' },
  { value: 'screening', label: 'Screening' },
  { value: 'meeting',   label: 'Meeting' },
  { value: 'other',     label: 'Other' },
];

export interface BookingTrip {
  id: string;
  scheduleId: string;
  tripDate: string;        // ISO yyyy-MM-dd
  departureTime: string;   // HH:mm[:ss]
  /** v-trip-end-time — optional trip end. Nullable for pure-
   *  departure trips (Van); when set, renders as 07:00–13:00. */
  endTime?: string | null;
  /** v-session-type — trip / screening / meeting / other. */
  sessionType: SessionType;
  active: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertBookingTrip {
  scheduleId?: string;
  tripDate?: string;
  departureTime?: string;
  endTime?: string | null;
  sessionType?: SessionType;
  active?: boolean;
  notes?: string | null;
}

export function list(scheduleId?: string): Promise<BookingTrip[]> {
  return apiJson<BookingTrip[]>('/api/v1/booking-trips', {
    query: scheduleId ? { scheduleId } : {},
  });
}

export function create(req: UpsertBookingTrip): Promise<BookingTrip> {
  return apiJson<BookingTrip>('/api/v1/booking-trips', {
    method: 'POST', json: req,
  });
}

export function update(id: string, req: UpsertBookingTrip): Promise<BookingTrip> {
  return apiJson<BookingTrip>(`/api/v1/booking-trips/${id}`, {
    method: 'PATCH', json: req,
  });
}

export function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/booking-trips/${id}`, { method: 'DELETE' });
}
