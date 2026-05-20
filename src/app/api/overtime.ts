import { apiJson, apiVoid } from './client';

export type OtStatus = 'pending' | 'approved' | 'rejected';

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

export async function create(req: CreateOtRequest): Promise<OtRequest> {
  return apiJson('/api/v1/ot-requests', { method: 'POST', json: req });
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
