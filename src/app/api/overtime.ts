import { apiJson, apiVoid } from './client';

export type OtStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface OtRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  /** Calendar date the OT begins. */
  date: string;
  /** Calendar date the OT ends. Equal to {@link date} for same-day OT;
   *  one day later for cross-midnight night shifts (V59). */
  endDate?: string;
  /** Optional HH:mm labels persisted alongside {@link hours} (since V20). */
  startHour?: string;
  endHour?: string;
  hours: number;
  /** Backend-computed day-of-week flag (Saturday / Sunday from the row's
   *  start date). Used by the Payslip Details dialog to pick the
   *  weekend OT rate when building the per-rate breakdown. */
  isWeekend?: boolean;
  /** Backend-computed holiday flag (tenant calendar match on the row's
   *  start date). Same use as {@link isWeekend}. */
  isHoliday?: boolean;
  /** Admin-only manual rate override (V62). When non-null the rate
   *  calculator skips day-type + night composition and pays this
   *  multiplier directly. Numeric on the wire; null = use auto rate. */
  rateOverride?: number | null;
  /** When set, this OT row has been folded into a payroll batch and
   *  is locked from further edits (V63). status === 'paid' carries
   *  the same signal; the id is exposed so the UI can deep-link to
   *  the batch in future. */
  payrollBatchId?: string | null;
  /** Human-readable label of the owning payroll batch (its
   *  {@code subject}, e.g. "Salary of July 2026"). Populated only for
   *  rows in status='paid' so the OT table can render a "Paid ·
   *  <batch>" reference. Null for pending / approved / rejected. */
  payrollBatchSubject?: string | null;
  reason?: string;
  status: OtStatus;
  /** Backend sends submitter / approver as UUIDs. */
  submittedById?: string | null;
  /** Display name of the original filer — resolved server-side via
   *  user→employee. Lets the FE show "submitted by HR Admin" even for
   *  on-behalf rows that auto-approved without a separate approval click. */
  submittedByName?: string | null;
  approvedById?: string | null;
  /** Display name of the approver — resolved server-side from
   *  user→employee. Empty when the row is still pending or when the
   *  approver's user account has no linked employee profile. */
  approvedByName?: string | null;
  approvedAt?: string | null;
  /** ISO timestamp of when the request was filed. */
  requestedAt: string;
}

export interface CreateOtRequest {
  /** Backend UUID of the target employee. Omit to file for the
   *  authenticated caller (the original employee self-submit flow);
   *  set to file on behalf of someone else (admin / leader flow). */
  employeeId?: string;
  /** Start date — calendar day the OT begins. */
  date: string;
  /** End date — calendar day the OT ends. Optional; backend defaults to
   *  {@link date} when omitted. Must be on or after {@link date}. Set to
   *  date + 1 for a cross-midnight night shift so the rate calculator
   *  can apply per-day day-types to each side of the split. */
  endDate?: string;
  /** Total OT hours, e.g. 3 for 17:00 → 20:00. Backend persists this; the
      hour-range fields are FE-only labels and not part of the create body. */
  hours: number;
  reason?: string;
  /** Optional HH:mm labels surfaced in the OT Request History (since V20). */
  startHour?: string;
  endHour?: string;
  /** Admin-only override for the day-type rate bucket. When omitted the
   *  backend auto-derives from the start date's day-of-week + holiday
   *  calendar. Pass 'workday' | 'weekend' | 'holiday' to force a
   *  specific rate against the auto-detection (e.g. HR marks a
   *  special-cause weekday as holiday-rated). */
  dayType?: 'workday' | 'weekend' | 'holiday';
  /** Admin-only manual rate override (V62). When non-null bypasses the
   *  day-type + night composition entirely — pay = hourly × hours × this. */
  rateOverride?: number | null;
}

export interface ListParams {
  status?: OtStatus | '';
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

export async function list(params: ListParams = {}): Promise<PagedResponse<OtRequest>> {
  return apiJson('/api/v1/ot-requests', { query: { ...params } });
}

export async function mine(): Promise<OtRequest[]> {
  return apiJson('/api/v1/ot-requests/mine');
}

/** Paid OT rows folded into a specific payroll batch. Used by the
 *  Payslip Details dialog to render the per-rate breakdown under
 *  the "Overtime Pay" line. Pass `employeeId` to narrow to one payslip. */
export async function listByBatch(batchId: string, employeeId?: string): Promise<OtRequest[]> {
  return apiJson(`/api/v1/ot-requests/by-batch/${batchId}`, {
    query: employeeId ? { employeeId } : {},
  });
}

export async function create(req: CreateOtRequest): Promise<OtRequest> {
  return apiJson('/api/v1/ot-requests', { method: 'POST', json: req });
}

/**
 * Admin-only partial update for an existing OT row. Every field is
 * optional — null/undefined leaves the persisted value alone. Send
 * rateOverride: 0 to explicitly clear the custom rate and fall back to
 * the auto-detected one. UI gates this to admins.
 */
export interface UpdateOtRequest {
  date?: string;
  endDate?: string;
  hours?: number;
  startHour?: string;
  endHour?: string;
  reason?: string;
  dayType?: 'workday' | 'weekend' | 'holiday';
  rateOverride?: number | null;
}

export async function update(id: string, req: UpdateOtRequest): Promise<OtRequest> {
  return apiJson(`/api/v1/ot-requests/${id}`, { method: 'PATCH', json: req });
}

export async function approve(id: string): Promise<OtRequest> {
  return apiJson(`/api/v1/ot-requests/${id}/approve`, { method: 'POST' });
}

export async function reject(id: string, reason?: string): Promise<OtRequest> {
  return apiJson(`/api/v1/ot-requests/${id}/reject`, {
    method: 'POST',
    json: { reason: reason ?? '' },
  });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/ot-requests/${id}`, { method: 'DELETE' });
}
