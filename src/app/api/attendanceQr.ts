import { apiJson } from './client';

/** Admin response from /attendance/qr/today/{officeId}. */
export interface TodayToken {
  officeId: string;
  officeName: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  tokenDate: string;   // ISO date 'YYYY-MM-DD'
  token: string;
  /** Full URL the QR encodes — already prefixed with the configured
   *  QR_SCAN_BASE_URL on the API side. The FE just renders this into
   *  the QR pixels; no further URL building needed. */
  scanUrl: string;
}

/** Outcome of POST /attendance/qr/scan. */
export interface ScanResult {
  status:
    | 'checked_in'
    | 'checked_out'
    | 'duplicate'
    | 'out_of_range'
    | 'token_expired'
    | 'employee_unknown';
  message: string;
  officeName?: string;
  distanceMeters?: number;
  employeeName?: string;
  timestamp: string;
}

export interface ScanRequest {
  token: string;
  latitude: number;
  longitude: number;
  /** Optional kiosk-fallback when no JWT is on the request. */
  empNo?: string;
  /** Optional metadata for the audit row. */
  accuracyMeters?: number;
  userAgent?: string;
}

export async function getToday(officeId: string): Promise<TodayToken> {
  return apiJson(`/api/v1/attendance/qr/today/${officeId}`);
}

export async function scan(req: ScanRequest): Promise<ScanResult> {
  return apiJson('/api/v1/attendance/qr/scan', { method: 'POST', json: req });
}
