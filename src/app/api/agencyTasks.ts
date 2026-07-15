import { apiJson } from './client';

/* ================================================================
 * Agency task list — /api/v1/agency/tasks/**
 *
 * Distinct from cases:
 *   • cases    — attached to a client document, thread + activity
 *   • tasks    — agency's own internal todo. No thread. Optional
 *                client scope via nullable tenantId.
 * ================================================================ */

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface TaskDto {
  id: string;
  agencyId: string;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeAgencyUserId: string | null;
  assigneeName: string | null;
  createdByAgencyUserId: string | null;
  createdByName: string | null;
  completedAt: string | null;
  completedByAgencyUserId: string | null;
  completedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string | null;
  tenantId?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  assigneeAgencyUserId?: string | null;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  tenantId?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  assigneeAgencyUserId?: string | null;
}

export interface SetStatusRequest {
  status: TaskStatus;
}

export const tasks = {
  list: (opts: { clientTenantId?: string | null; assigneeId?: string | null } = {}) => {
    const query: Record<string, string> = {};
    if (opts.clientTenantId) query.clientTenantId = opts.clientTenantId;
    if (opts.assigneeId)     query.assigneeId     = opts.assigneeId;
    return apiJson<TaskDto[]>('/api/v1/agency/tasks', { query });
  },
  get:       (id: string) => apiJson<TaskDto>(`/api/v1/agency/tasks/${id}`),
  create:    (req: CreateTaskRequest) => apiJson<TaskDto>('/api/v1/agency/tasks', { method: 'POST', json: req }),
  update:    (id: string, req: UpdateTaskRequest) =>
    apiJson<TaskDto>(`/api/v1/agency/tasks/${id}`, { method: 'PATCH', json: req }),
  setStatus: (id: string, status: TaskStatus) =>
    apiJson<TaskDto>(`/api/v1/agency/tasks/${id}/status`, { method: 'POST', json: { status } }),
  del:       (id: string) => apiJson<void>(`/api/v1/agency/tasks/${id}`, { method: 'DELETE' }),
};

/* -------------------- agency members (assignee picker) -------------------- */

export interface AgencyMember {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export const members = {
  list: () => apiJson<AgencyMember[]>('/api/v1/agency/members'),
};
