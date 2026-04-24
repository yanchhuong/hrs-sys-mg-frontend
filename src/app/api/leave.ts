import { apiJson, apiVoid } from './client';

export type LeaveStatus = 'pending' | 'approved' | 'rejected';
export type LeaveType = string;

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  date: string;
  days: number;
  halfDay?: boolean;
  type: LeaveType;
  status: LeaveStatus;
  reason?: string;
  correctedCheckIn?: string | null;
  correctedCheckOut?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  submittedAt: string;
}

export interface CreateLeaveRequest {
  date: string;
  days: number;
  halfDay?: boolean;
  type: LeaveType;
  reason?: string;
  correctedCheckIn?: string;
  correctedCheckOut?: string;
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
