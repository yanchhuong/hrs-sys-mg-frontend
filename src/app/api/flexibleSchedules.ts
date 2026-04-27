import { apiJson, apiVoid } from './client';

/**
 * Per-employee override on top of the tenant scan rule. Any field left blank
 * inherits — server stores it as NULL and the evaluator falls back to the
 * tenant rule at attendance time.
 */
export interface FlexibleSchedule {
  id: string;
  employeeId: string;
  mode?: 'two' | 'four' | null;
  morningIn?: string | null;
  morningOut?: string | null;
  afternoonIn?: string | null;
  eveningOut?: string | null;
  graceInMinutes?: number | null;
  graceOutMinutes?: number | null;
  halfDayCountsAsHalfScan?: boolean | null;
  note?: string | null;
  updatedAt?: string;
}

/** Body sent to POST/PATCH — id and updatedAt are server-managed. */
export type FlexibleScheduleInput = Omit<FlexibleSchedule, 'id' | 'updatedAt'>;

export async function list(): Promise<FlexibleSchedule[]> {
  return apiJson('/api/v1/settings/flexible-schedules');
}

/**
 * Backend POST is upsert-by-(tenant, employee) — re-posting for an employee
 * already on file updates the existing row in place.
 */
export async function upsert(req: FlexibleScheduleInput): Promise<FlexibleSchedule> {
  return apiJson('/api/v1/settings/flexible-schedules', { method: 'POST', json: req });
}

export async function update(id: string, req: FlexibleScheduleInput): Promise<FlexibleSchedule> {
  return apiJson(`/api/v1/settings/flexible-schedules/${id}`, { method: 'PATCH', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/settings/flexible-schedules/${id}`, { method: 'DELETE' });
}
