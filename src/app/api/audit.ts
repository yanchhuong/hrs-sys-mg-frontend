import { apiJson } from './client';

export interface AuditEntry {
  id: string;
  action: string;
  actorUserId?: string;
  actorEmail?: string;
  targetId?: string;
  targetType?: string;
  payload?: unknown;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface ListParams {
  action?: string;
  actorId?: string;
  targetId?: string;
  from?: string;
  to?: string;
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

export async function list(params: ListParams = {}): Promise<PagedResponse<AuditEntry>> {
  return apiJson('/api/v1/audit', { query: { ...params } });
}
