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
  employeeId?: string;
  from?: string;
  to?: string;
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

export async function list(params: ListParams = {}): Promise<PagedResponse<AttendanceEntry>> {
  return apiJson('/api/v1/attendance', { query: { ...params } });
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
