import { apiJson, apiVoid } from './client';

/**
 * Per-tenant fingerprint terminal registry.
 *
 * Backed by the {@code attendance_devices} table — replaces the older
 * localStorage-only registry in {@code utils/devices.ts}. The Node
 * Device Integration Service consumes the same endpoints to know what
 * to poll and to report status (so the table cells "Last synced" and
 * the Connected/Disconnected pills update without an admin clicking Test).
 */
export interface AttendanceDevice {
  id: string;
  name: string;
  location?: string | null;
  machineNo: number;
  commType: 'Ethernet' | 'RS-232' | 'RS-485' | 'USB' | string;
  ip: string;
  port: number;
  commKey?: number | null;
  baudRate?: number | null;
  /** Per-device API key the worker uses to authenticate sync POSTs.
   *  Returned in plaintext so the admin can copy it to the worker config.
   *  Rotate via {@link regenerateSecret}. */
  secretKey?: string;
  lastStatus: 'connected' | 'disconnected' | 'unknown' | string;
  lastTestedAt?: string | null;
  lastSyncedAt?: string | null;
  lastRecordCount?: number | null;
  lastSyncError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceRequest {
  name?: string;
  location?: string | null;
  machineNo?: number;
  commType?: string;
  ip?: string;
  port?: number;
  commKey?: number | null;
  baudRate?: number | null;
  // Status fields — used by the Node worker (and by the Test/Sync buttons
  // in the UI) to report outcomes back. Empty string clears lastSyncError.
  lastStatus?: string;
  lastTestedAt?: string;
  lastSyncedAt?: string;
  lastRecordCount?: number;
  lastSyncError?: string;
}

export async function list(): Promise<AttendanceDevice[]> {
  return apiJson<AttendanceDevice[]>('/api/v1/attendance/devices');
}

export async function create(req: DeviceRequest): Promise<AttendanceDevice> {
  return apiJson<AttendanceDevice>('/api/v1/attendance/devices', {
    method: 'POST',
    json: req,
  });
}

export async function update(id: string, req: DeviceRequest): Promise<AttendanceDevice> {
  return apiJson<AttendanceDevice>(`/api/v1/attendance/devices/${id}`, {
    method: 'PUT',
    json: req,
  });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/attendance/devices/${id}`, { method: 'DELETE' });
}

/** Replace the device's secret key with a freshly-generated 32-char hex. */
export async function regenerateSecret(id: string): Promise<AttendanceDevice> {
  return apiJson<AttendanceDevice>(`/api/v1/attendance/devices/${id}/regenerate-secret`, {
    method: 'POST',
  });
}
