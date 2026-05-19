import { apiJson, apiVoid } from './client';

export type LeaveStatus = 'pending' | 'approved' | 'rejected';
export type LeaveType = string;
/**
 * Leave category — what *kind* of leave the row represents. Independent
 * from the `type` field (which is now duration only — full / half_morning
 * / half_noon). V47 introduced this column.
 *   annual    – deducts from annual leave balance
 *   sick      – deducts from sick leave balance
 *   special   – pulls from annual leave first (marriage, bereavement, …)
 *   maternity – 90-day paid leave, does NOT deduct from annual
 *   exception – work-related / on-site / mission, does NOT deduct
 */
export type LeaveCategory = 'annual' | 'sick' | 'special' | 'maternity' | 'exception';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  date: string;
  /** Inclusive end date — equals `date` for single-day leaves. V49. */
  endDate?: string;
  days: number;
  halfDay?: boolean;
  type: LeaveType;
  category?: LeaveCategory;
  status: LeaveStatus;
  reason?: string;
  correctedCheckIn?: string | null;
  correctedCheckOut?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  submittedAt: string;
  /** Legacy flag — kept for backwards compatibility with V46 rows.
   *  Equivalent to category in ('maternity', 'exception'). */
  isException?: boolean;
  /** Author + modifier audit. Display names resolved server-side. */
  createdById?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
}

export interface CreateLeaveRequest {
  /** Optional — backend UUID of the target employee. Omit to file for
   *  the authenticated caller (the original self-submit flow); set to
   *  file on behalf of someone else (admin / leader / Attendance →
   *  Add Day Exception flow). */
  employeeId?: string;
  date: string;
  /** Inclusive end date for multi-day leaves (Maternity 90d, custom).
   *  Omit / null → server treats it as a single-day row (end_date = date). */
  endDate?: string;
  days: number;
  halfDay?: boolean;
  type: LeaveType;
  /** New (V47). Falls back to 'annual' server-side when omitted. */
  category?: LeaveCategory;
  reason?: string;
  correctedCheckIn?: string;
  correctedCheckOut?: string;
  /** Legacy flag — only sent for backwards compatibility with the
   *  V46 backend on the off-chance a stale server is deployed. New
   *  code should set {@link #category} instead. */
  isException?: boolean;
}

export interface ListParams {
  status?: LeaveStatus | '';
  type?: string;
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

export async function list(params: ListParams = {}): Promise<PagedResponse<LeaveRequest>> {
  return apiJson('/api/v1/leave-requests', { query: { ...params } });
}

export async function mine(): Promise<LeaveRequest[]> {
  return apiJson('/api/v1/leave-requests/mine');
}

export async function create(req: CreateLeaveRequest): Promise<LeaveRequest> {
  return apiJson('/api/v1/leave-requests', { method: 'POST', json: req });
}

export async function approve(id: string): Promise<LeaveRequest> {
  return apiJson(`/api/v1/leave-requests/${id}/approve`, { method: 'POST' });
}

export async function reject(id: string, reason?: string): Promise<LeaveRequest> {
  return apiJson(`/api/v1/leave-requests/${id}/reject`, {
    method: 'POST',
    json: { reason: reason ?? '' },
  });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/leave-requests/${id}`, { method: 'DELETE' });
}
