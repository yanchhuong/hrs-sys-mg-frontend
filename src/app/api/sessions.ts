import { apiJson } from './client';

/**
 * V215 / v-attendance-module — concrete daily instances of a
 * Course Schedule. Materialised lazily by the backend on list;
 * teachers just fetch by date range.
 */
export type SessionStatus = 'upcoming' | 'in_progress' | 'completed' | 'cancelled';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'sick' | 'left_early';

export interface AttendanceRow {
  /** Null when the row hasn't been saved yet (roster placeholder). */
  id: string | null;
  sessionId: string;
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  remark: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Session {
  id: string;
  courseScheduleId: string;
  sessionDate: string;      // yyyy-mm-dd
  fromTime: string;         // HH:mm[:ss]
  toTime: string;
  topic: string | null;
  status: SessionStatus;
  courseName: string | null;
  classroomName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  rosterSize: number;
  markedCount: number;
  /** v-creator-column — Registror (display name of the user who
   *  materialised / added the session). Hydrated on list only. */
  createdByName?: string | null;
  /** Populated on GET /{id}; empty on list. */
  attendances: AttendanceRow[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AttendanceEntry {
  studentId: string;
  status: AttendanceStatus;
  checkIn?: string | null;
  checkOut?: string | null;
  remark?: string | null;
}

export interface ListParams {
  /** yyyy-mm-dd. Defaults to today when omitted. */
  from?: string;
  /** yyyy-mm-dd. Defaults to from. */
  to?: string;
}

export async function list(params: ListParams = {}): Promise<Session[]> {
  const q: Record<string, string> = {};
  if (params.from) q.from = params.from;
  if (params.to)   q.to   = params.to;
  return apiJson('/api/v1/sessions', { query: q });
}

export async function get(id: string): Promise<Session> {
  return apiJson(`/api/v1/sessions/${id}`);
}

export async function updateTopic(id: string, topic: string | null): Promise<Session> {
  return apiJson(`/api/v1/sessions/${id}`, { method: 'PUT', json: { topic } });
}

export async function saveAttendance(id: string, entries: AttendanceEntry[]): Promise<Session> {
  return apiJson(`/api/v1/sessions/${id}/attendance`, { method: 'PUT', json: entries });
}

export async function complete(id: string): Promise<Session> {
  return apiJson(`/api/v1/sessions/${id}/complete`, { method: 'POST' });
}

export interface BulkAddRequest {
  courseScheduleId: string;
  fromDate: string;   // yyyy-mm-dd
  toDate: string;     // yyyy-mm-dd
  fromTime: string;   // HH:mm
  toTime: string;     // HH:mm
  topic?: string | null;
}

/** v-attendance-add-session — materialise one session per day in
 *  [fromDate, toDate] on the given schedule at the given time.
 *  Idempotent per (schedule, date, from, to) — re-running for the
 *  same tuple returns the existing rows. */
export async function bulkAdd(req: BulkAddRequest): Promise<Session[]> {
  return apiJson('/api/v1/sessions/bulk-add', { method: 'POST', json: req });
}
