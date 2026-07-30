import { apiJson, apiVoid } from './client';

/**
 * BookingSchedule API client (v-booking-schedule-mvp, V289).
 * Time-anchored slots under a Property — vehicle departures,
 * cinema showtimes, meeting-room bookings. Bookings optionally
 * reference a schedule; the occupancy endpoint scopes seat
 * availability by schedule when set.
 */

/** v-booking-schedule-slots (V290) — one row in the weekly slot
 *  pattern under a BookingSchedule. `dayOfWeek` ISO 1..7 (1=Mon).
 *  `fromTime` on the wire is "HH:mm" or "HH:mm:ss". No `toTime`
 *  since bookings are one-time (contrast with Course LearnTimes). */
export interface BookingScheduleSlot {
  id?: string;
  dayOfWeek: number;
  fromTime: string;
  sortOrder?: number;
}

export interface BookingSchedule {
  id: string;
  itemId: string;
  name: string;
  /** Legacy datetime start for pre-V290 rows. New rows created via
   *  the redesigned dialog have this null and use `startDate` +
   *  `slots` instead. */
  startAt?: string | null;
  endAt?: string | null;
  /** v-booking-schedule-slots — optional anchor date the weekly
   *  slot pattern starts on. NULL = always available. */
  startDate?: string | null;
  slots: BookingScheduleSlot[];
  active: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertBookingSchedule {
  itemId?: string;
  name?: string;
  startAt?: string | null;
  endAt?: string | null;
  startDate?: string | null;
  /** Replace-all on non-null; absent leaves existing slots untouched. */
  slots?: BookingScheduleSlot[];
  active?: boolean;
  notes?: string | null;
}

export function list(itemId?: string): Promise<BookingSchedule[]> {
  return apiJson<BookingSchedule[]>('/api/v1/booking-schedules', {
    query: itemId ? { itemId } : {},
  });
}

export function create(req: UpsertBookingSchedule): Promise<BookingSchedule> {
  return apiJson<BookingSchedule>('/api/v1/booking-schedules', {
    method: 'POST', json: req,
  });
}

export function update(id: string, req: UpsertBookingSchedule): Promise<BookingSchedule> {
  return apiJson<BookingSchedule>(`/api/v1/booking-schedules/${id}`, {
    method: 'PATCH', json: req,
  });
}

export function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/booking-schedules/${id}`, { method: 'DELETE' });
}
