/**
 * Fingerprint / attendance-terminal device registry.
 * Persisted in localStorage under `hrms:devices` so the list survives reloads
 * without a backend dependency. Status is updated in place by the "Test"
 * action in the Security tab.
 */

const STORAGE_KEY = 'hrms:devices';

export type DeviceStatus = 'connected' | 'disconnected' | 'unknown';

export type CommType = 'Ethernet' | 'RS-232' | 'RS-485' | 'USB';
export const COMM_TYPES: CommType[] = ['Ethernet', 'RS-232', 'RS-485', 'USB'];

export interface Device {
  id: string;
  name: string;
  ip: string;
  port: number;
  /** ZKTeco Comm Key / Communication Password. 0 when the device has none. */
  commKey?: number;
  /** Free-text (e.g. "We-Cafe", "4th Office"). */
  location?: string;
  /** Comm channel — Ethernet is by far the common case for ZKTeco SDK. */
  commType: CommType;
  /** Device's internal machine number (1-255). Matters on serial buses. */
  machineNo: number;
  /** Only meaningful for RS-232 / RS-485 serial links. */
  baudRate?: number;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  lastStatus: DeviceStatus;
  /** Timestamp of the last successful attendance pull from this device. */
  lastSyncAt?: string;
  /** Number of records returned by the last successful pull. */
  lastRecordCount?: number;
  /** Error text from the most recent failed pull; cleared on next success. */
  lastSyncError?: string;
}

export interface DeviceInput {
  name: string;
  ip: string;
  port: number;
  commKey?: number;
  location?: string;
  commType?: CommType;
  machineNo?: number;
  baudRate?: number;
}

function readAll(): Device[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(devices: Device[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
}

function genId() {
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Apply defaults to pre-existing rows that were saved before new fields landed. */
function withDefaults(d: Partial<Device>): Device {
  return {
    commType: 'Ethernet',
    machineNo: 1,
    ...d,
  } as Device;
}

export function listDevices(): Device[] {
  return readAll().map(withDefaults).sort((a, b) => a.name.localeCompare(b.name));
}

export function createDevice(input: DeviceInput): Device {
  const now = new Date().toISOString();
  const device: Device = {
    id: genId(),
    name: input.name.trim(),
    ip: input.ip.trim(),
    port: input.port,
    commKey: input.commKey,
    location: input.location?.trim() || undefined,
    commType: input.commType ?? 'Ethernet',
    machineNo: input.machineNo ?? 1,
    baudRate: input.baudRate,
    createdAt: now,
    updatedAt: now,
    lastStatus: 'unknown',
  };
  writeAll([...readAll(), device]);
  return device;
}

export function updateDevice(id: string, patch: Partial<DeviceInput>): Device | undefined {
  const all = readAll().map(withDefaults);
  const i = all.findIndex(d => d.id === id);
  if (i < 0) return undefined;
  const updated: Device = {
    ...all[i],
    ...('name' in patch ? { name: patch.name!.trim() } : {}),
    ...('ip' in patch ? { ip: patch.ip!.trim() } : {}),
    ...('port' in patch ? { port: patch.port! } : {}),
    ...('commKey' in patch ? { commKey: patch.commKey } : {}),
    ...('location' in patch ? { location: patch.location?.trim() || undefined } : {}),
    ...('commType' in patch ? { commType: patch.commType! } : {}),
    ...('machineNo' in patch ? { machineNo: patch.machineNo! } : {}),
    ...('baudRate' in patch ? { baudRate: patch.baudRate } : {}),
    updatedAt: new Date().toISOString(),
  };
  all[i] = updated;
  writeAll(all);
  return updated;
}

export function deleteDevice(id: string): void {
  writeAll(readAll().filter(d => d.id !== id));
}

export function recordSyncSuccess(id: string, recordCount: number): Device | undefined {
  const all = readAll();
  const i = all.findIndex(d => d.id === id);
  if (i < 0) return undefined;
  all[i] = {
    ...all[i],
    lastSyncAt: new Date().toISOString(),
    lastRecordCount: recordCount,
    lastSyncError: undefined,
    lastStatus: 'connected',
    lastTestedAt: new Date().toISOString(),
  };
  writeAll(all);
  return all[i];
}

export function recordSyncFailure(id: string, message: string): Device | undefined {
  const all = readAll();
  const i = all.findIndex(d => d.id === id);
  if (i < 0) return undefined;
  all[i] = {
    ...all[i],
    lastSyncError: message,
    lastStatus: 'disconnected',
    lastTestedAt: new Date().toISOString(),
  };
  writeAll(all);
  return all[i];
}

export function recordTestResult(id: string, status: DeviceStatus): Device | undefined {
  const all = readAll();
  const i = all.findIndex(d => d.id === id);
  if (i < 0) return undefined;
  all[i] = {
    ...all[i],
    lastStatus: status,
    lastTestedAt: new Date().toISOString(),
  };
  writeAll(all);
  return all[i];
}

/**
 * Cross-origin TCP reachability check. Browsers can't read the device's body
 * (no CORS), but a successful `fetch` in no-cors mode confirms a TCP response
 * reached us. Timeout is 3s — more than enough for a LAN device.
 */
export async function testDeviceReachable(ip: string, port: number): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    await fetch(`http://${ip}:${port}/`, { mode: 'no-cors', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
