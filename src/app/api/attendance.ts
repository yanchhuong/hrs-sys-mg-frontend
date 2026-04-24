import { apiJson } from './client';

export interface AttendanceEntry {
  id: string;
  employeeId: string;
  employeeName?: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status: 'present' | 'absent' | 'late' | 'leave' | string;
  hoursWorked?: number;
  overtimeHours?: number;
  notes?: string;
  source?: string;
}

export interface ListParams {
  /** Required by the backend — single day, YYYY-MM-DD. */
  date: string;
  employeeId?: string;
  scope?: 'all' | 'mine' | 'team';
  q?: string;
  page?: number;
  size?: number;
}

export interface PagedResponse<T> {
  data: T[];
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

export async function list(params: ListParams): Promise<PagedResponse<AttendanceEntry>> {
  return apiJson('/api/v1/attendance', { query: { ...params } });
}

/**
 * Hits the backend's single-day endpoint once per day in [from, to], then
 * concatenates. Useful for UIs that expose a date range — back-end itself
 * only serves per-day lists.
 */
export async function listRange(args: { from: string; to: string; size?: number }): Promise<AttendanceEntry[]> {
  const start = new Date(args.from + 'T00:00:00');
  const end = new Date(args.to + 'T00:00:00');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const out: AttendanceEntry[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    try {
      const res = await list({ date: iso, size: args.size ?? 500 });
      out.push(...res.data);
    } catch {
      // Partial failure of one day shouldn't take out the whole range.
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export async function get(id: string): Promise<AttendanceEntry> {
  return apiJson(`/api/v1/attendance/${id}`);
}

export async function monthly(params: { month: string; employeeId?: string }): Promise<AttendanceEntry[]> {
  return apiJson('/api/v1/attendance/monthly', { query: { ...params } });
}

export async function update(id: string, req: Partial<AttendanceEntry>): Promise<AttendanceEntry> {
  return apiJson(`/api/v1/attendance/${id}`, { method: 'PATCH', json: req });
}

/**
 * Creates or updates the attendance row keyed by (employeeId, date).
 * Used when editing a "synthetic" row the UI conjured for an employee
 * with no record on that day — first save creates it, subsequent saves
 * update it.
 */
export async function upsert(req: {
  employeeId: string;
  date: string;
  morningIn?: string | null;
  morningOut?: string | null;
  noonIn?: string | null;
  noonOut?: string | null;
  status?: string;
  notes?: string | null;
}): Promise<AttendanceEntry> {
  return apiJson('/api/v1/attendance', { method: 'POST', json: req });
}

export async function submitPunches(
  records: { employeeId: string; timestamp: string; punchState: number }[],
): Promise<{ accepted: number }> {
  return apiJson('/api/v1/attendance/punches', { method: 'POST', json: { records } });
}

export interface FingerprintImportResult {
  host: string;
  port: number;
  recordCount: number;
  fetchedAt: string;
  records: {
    userId: string;
    timestamp: string;
    punchState: number;
    verifyMode: number;
  }[];
  /** What happened when the pulled punches were upserted into the attendance table. */
  persisted?: {
    inserted: number;
    updated: number;
    unchanged: number;
    unmatchedUsers: number;
    unmatchedUserIds: string[];
  };
}

export async function importFingerprint(args: {
  ip: string;
  port: number;
  commKey?: number;
  timeoutMs?: number;
}): Promise<FingerprintImportResult> {
  return apiJson<FingerprintImportResult>('/api/v1/attendance/import/fingerprint', {
    method: 'POST',
    json: {
      ip: args.ip,
      port: args.port,
      commKey: args.commKey ?? 0,
      timeoutMs: args.timeoutMs ?? 10000,
    },
  });
}
