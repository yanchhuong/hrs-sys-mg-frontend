import { apiJson } from './client';

/* ================================================================
 * Agency + tenant case-workflow surface.
 *   Agency side  → /api/v1/agency/cases/**
 *   Tenant side  → /api/v1/cases/**
 * Both call sites share the DTO shapes.
 * ================================================================ */

export type CaseStatus =
  | 'open' | 'pending_client' | 'pending_agency' | 'escalated' | 'closed';

export type CasePriority = 'low' | 'normal' | 'high' | 'blocking';

export type CaseCategory =
  | 'clarification' | 'missing_doc' | 'correction'
  | 'classification' | 'reclassification' | 'recommendation';

export type CaseRelatedDocType = 'invoice' | 'bill' | 'receipt' | 'payroll_item' | 'other';

export interface CaseDto {
  id: string;
  agencyId: string | null;
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string | null;
  relatedDocType: CaseRelatedDocType;
  relatedDocId: string | null;
  title: string;
  description: string | null;
  status: CaseStatus;
  priority: CasePriority;
  category: CaseCategory;
  slaResponseHours: number;
  slaResponseDue: string;
  openedByAgencyUserId: string | null;
  openedByName: string | null;
  closedAt: string | null;
  closedByAgencyUserId: string | null;
  rootCauseTag: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseMessageDto {
  id: string;
  senderAgencyUserId: string | null;
  senderUserId: string | null;
  senderDisplayName: string;
  senderSide: 'agency' | 'client';
  body: string;
  attachmentUrl: string | null;
  createdAt: string;
}

export interface CaseActivityDto {
  id: string;
  actorAgencyUserId: string | null;
  actorUserId: string | null;
  actorDisplayName: string;
  actorSide: 'agency' | 'client' | 'system';
  action:
    | 'opened' | 'replied' | 'status_changed' | 'priority_changed'
    | 'category_changed' | 'reassigned' | 'closed' | 'reopened' | 'escalated';
  /** Raw JSON string; caller parses per action. */
  payload: string | null;
  createdAt: string;
}

export interface CaseDetail {
  header: CaseDto;
  messages: CaseMessageDto[];
  activities: CaseActivityDto[];
}

/* -------------------- agency side -------------------- */

export interface CreateCaseRequest {
  tenantId: string;
  relatedDocType: CaseRelatedDocType;
  relatedDocId?: string | null;
  title: string;
  description?: string | null;
  priority?: CasePriority;
  category?: CaseCategory;
  slaResponseHours?: number;
}

export interface PostMessageRequest {
  body: string;
  attachmentUrl?: string | null;
}

export interface UpdateCaseRequest {
  status?: CaseStatus;
  priority?: CasePriority;
  category?: CaseCategory;
}

export interface CloseCaseRequest {
  rootCauseTag?: string | null;
  closingNote?: string | null;
}

export const agency = {
  list: (clientTenantId?: string) =>
    apiJson<CaseDto[]>('/api/v1/agency/cases', { query: { clientTenantId } }),
  open: (req: CreateCaseRequest) =>
    apiJson<CaseDto>('/api/v1/agency/cases', { method: 'POST', json: req }),
  get: (id: string) =>
    apiJson<CaseDetail>(`/api/v1/agency/cases/${id}`),
  update: (id: string, req: UpdateCaseRequest) =>
    apiJson<CaseDto>(`/api/v1/agency/cases/${id}`, { method: 'PATCH', json: req }),
  postMessage: (id: string, req: PostMessageRequest) =>
    apiJson<CaseDetail>(`/api/v1/agency/cases/${id}/messages`, { method: 'POST', json: req }),
  close: (id: string, req: CloseCaseRequest) =>
    apiJson<CaseDto>(`/api/v1/agency/cases/${id}/close`, { method: 'POST', json: req }),
  reopen: (id: string) =>
    apiJson<CaseDto>(`/api/v1/agency/cases/${id}/reopen`, { method: 'POST' }),
};

/* -------------------- tenant side (admin) -------------------- */

export const tenant = {
  list: () => apiJson<CaseDto[]>('/api/v1/cases'),
  get: (id: string) => apiJson<CaseDetail>(`/api/v1/cases/${id}`),
  postMessage: (id: string, req: PostMessageRequest) =>
    apiJson<CaseDetail>(`/api/v1/cases/${id}/messages`, { method: 'POST', json: req }),
  close: (id: string, req: CloseCaseRequest) =>
    apiJson<CaseDto>(`/api/v1/cases/${id}/close`, { method: 'POST', json: req }),
};
