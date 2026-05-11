import { apiJson, apiVoid } from './client';

/**
 * Fingerprint device user-ids the sync worker pushed but couldn't match
 * to any employee's empNo in the tenant. Surfaced for admin resolution
 * (bind to an existing employee, or dismiss).
 */
export interface UnmatchedDeviceUser {
  id: string;
  deviceUserId: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastRecordTime?: string | null;
  lastIp?: string | null;
  dismissedAt?: string | null;
  // Populated only on the bind() response.
  boundEmployeeId?: string | null;
  boundEmpNo?: string | null;
  boundEmployeeName?: string | null;
}

export async function list(includeDismissed = false): Promise<UnmatchedDeviceUser[]> {
  return apiJson<UnmatchedDeviceUser[]>('/api/v1/attendance/devices/unmatched', {
    query: { includeDismissed: String(includeDismissed) },
  });
}

/** Bind an unmatched device id to an existing employee (renames empNo). */
export async function bind(id: string, employeeId: string): Promise<UnmatchedDeviceUser> {
  return apiJson<UnmatchedDeviceUser>(`/api/v1/attendance/devices/unmatched/${id}/bind`, {
    method: 'POST',
    json: { employeeId },
  });
}

export async function dismiss(id: string): Promise<UnmatchedDeviceUser> {
  return apiJson<UnmatchedDeviceUser>(`/api/v1/attendance/devices/unmatched/${id}/dismiss`, {
    method: 'POST',
  });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/attendance/devices/unmatched/${id}`, { method: 'DELETE' });
}
