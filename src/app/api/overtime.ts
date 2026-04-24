import { apiJson, apiVoid } from './client';

export type OtStatus = 'pending' | 'approved' | 'rejected';

export interface OtRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  date: string;
  startHour: string;
  endHour: string;
  hours: number;
  reason?: string;
  status: OtStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  submittedAt: string;
}

export interface CreateOtRequest {
  date: string;
  startHour: string;
  endHour: string;
  reason?: string;
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
