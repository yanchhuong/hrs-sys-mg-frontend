import { apiJson, apiVoid } from './client';

/**
 * Office locations carry the lat/lng + radius that the QR-attendance
 * scan validates against. Multi-office per tenant; each office gets
 * its own daily QR via the /api/v1/attendance/qr endpoints.
 */
export interface Office {
  id: string;
  name: string;
  /** WGS84 decimal degrees. Backend stores numeric(10,7) — preserve
   *  precision client-side by treating these as plain numbers. */
  latitude: number;
  longitude: number;
  /** Scan must fall within this many meters of (lat,lng). */
  radiusMeters: number;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type OfficeWriteRequest = Omit<Office, 'id' | 'createdAt' | 'updatedAt'>;

export async function list(): Promise<Office[]> {
  return apiJson('/api/v1/offices');
}

export async function get(id: string): Promise<Office> {
  return apiJson(`/api/v1/offices/${id}`);
}

export async function create(req: OfficeWriteRequest): Promise<Office> {
  return apiJson('/api/v1/offices', { method: 'POST', json: req });
}

export async function update(id: string, req: OfficeWriteRequest): Promise<Office> {
  return apiJson(`/api/v1/offices/${id}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/offices/${id}`, { method: 'DELETE' });
}
