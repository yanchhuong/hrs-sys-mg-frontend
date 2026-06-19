import { apiJson } from './client';

/** Authenticated employee self-service: check-in / check-out from
 *  inside the app. Geofence enforced server-side against the tenant's
 *  enabled offices — same offices the QR scan flow uses. */

export interface CheckStatus {
  /** 'checked_in'   — morning_in set, ready to check out
   *  'checked_out'  — both set, done for the day
   *  'pending'      — not yet checked in, in range
   *  'out_of_range' — not within any office's radius
   *  'no_offices'   — tenant hasn't configured any offices yet */
  phase: 'checked_in' | 'checked_out' | 'pending' | 'out_of_range' | 'no_offices';
  message: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  officeName?: string | null;
  distanceMeters?: number | null;
}

export async function checkStatus(lat?: number, lng?: number): Promise<CheckStatus> {
  const query: Record<string, unknown> = {};
  if (lat != null && lng != null) {
    query.lat = lat;
    query.lng = lng;
  }
  return apiJson('/api/v1/attendance/me/check-status', { query });
}

export async function checkIn(latitude: number, longitude: number): Promise<CheckStatus> {
  return apiJson('/api/v1/attendance/me/check-in', {
    method: 'POST',
    json: { latitude, longitude },
  });
}

export async function checkOut(latitude: number, longitude: number): Promise<CheckStatus> {
  return apiJson('/api/v1/attendance/me/check-out', {
    method: 'POST',
    json: { latitude, longitude },
  });
}
