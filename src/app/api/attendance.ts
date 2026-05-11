import { apiJson } from './client';

export interface AttendanceEntry {
  id: string;
  employeeId: string;
  employeeName?: string;
  date: string;
  /** Legacy single check-in / check-out fields. */
  checkIn?: string | null;
  checkOut?: string | null;
  /** 4-scan punches as written by the fingerprint sync (HH:mm). */
  morningIn?: string | null;
  morningOut?: string | null;
  noonIn?: string | null;
  noonOut?: string | null;
  status: 'present' | 'absent' | 'late' | 'leave' | string;
  /** Backend sends this as `workHours` (number, 2 decimals). Older code used `hoursWorked` — accept both. */
  workHours?: number | string | null;
  hoursWorked?: number;
  /** Backend sends this as `otHours`. */
  otHours?: number | string | null;
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
 *
 * Dates are formatted in LOCAL time on every iteration. Using `toISOString`
 * here shifts midnight back into the previous calendar day for any user east
 * of UTC (e.g. GMT+7 → asking for "2026-04-28" actually queries
 * "2026-04-27"), which silently dropped every row.
 */
export async function listRange(args: { from: string; to: string; size?: number }): Promise<AttendanceEntry[]> {
  const start = new Date(args.from + 'T00:00:00');
  const end = new Date(args.to + 'T00:00:00');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const out: AttendanceEntry[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
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

/** Bulk upsert from the Excel "Upload Attendance Records" flow. Each
 *  row carries a human-readable empNo; the backend resolves it to the
 *  underlying employee UUID. Per-row failures don't block the batch —
 *  the response carries counts + an error list. */
export interface AttendanceUploadRow {
  empNo: string;
  date: string;
  morningIn?: string;
  morningOut?: string;
  noonIn?: string;
  noonOut?: string;
  status?: string;
  notes?: string;
}
export interface AttendanceUploadResult {
  received: number;
  saved: number;
  failed: number;
  errors: string[];
  skippedEmpNos: string[];
}
export async function uploadBulk(rows: AttendanceUploadRow[]): Promise<AttendanceUploadResult> {
  return apiJson<AttendanceUploadResult>('/api/v1/attendance/upload', {
    method: 'POST',
    json: rows,
  });
}

export async function update(
  id: string,
  req: Partial<AttendanceEntry> & {
    /** Only honoured when status='leave'. Drives the auto-created LeaveRequest's type. */
    leaveType?: 'full' | 'half_morning' | 'half_noon';
  },
): Promise<AttendanceEntry> {
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
  /** Only honoured when status='leave'. Drives the auto-created LeaveRequest's type. */
  leaveType?: 'full' | 'half_morning' | 'half_noon';
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

/**
 * Latest snapshot of the Node device-integration worker's last push to this
 * tenant. Powers the "Fingerprint sync status" pill on the Attendance page.
 * {@code lastSyncAt} is null if the backend hasn't received a push since
 * its last restart (in-memory snapshot).
 */
export interface FingerprintSyncStatus {
  lastSyncAt: string | null;
  received: number;
  inserted: number;
  updated: number;
  unchanged: number;
  unmatchedUsers: number;
}

export async function getFingerprintSyncStatus(): Promise<FingerprintSyncStatus> {
  return apiJson<FingerprintSyncStatus>('/api/v1/attendance/devices/fingerprint/sync/status');
}
