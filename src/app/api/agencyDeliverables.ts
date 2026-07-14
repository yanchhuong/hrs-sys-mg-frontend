import { apiJson } from './client';

/* ================================================================
 * Deliverable pipeline (MVP #6).
 *   Agency side  → /api/v1/agency/deliverables/**
 *   Tenant side  → /api/v1/deliverables/**
 *
 * Six-state machine: draft → submitted → reviewed → approved →
 * delivered. Rejection at any pre-delivered stage returns the row
 * to draft with a note.
 * ================================================================ */

export type DeliverableStatus =
  | 'draft' | 'submitted' | 'reviewed' | 'approved' | 'delivered' | 'rejected';

export type DeliverableKind =
  | 'management_accounts' | 'tax_filing_package' | 'bank_recon' | 'ar_ap_aging'
  | 'vat_reconciliation' | 'wht_reconciliation' | 'ptoi_vs_actual'
  | 'statutory_financials' | 'cit_return' | 'patent_renewal' | 'disclosure_notes'
  | 'other';

export interface DeliverableDto {
  id: string;
  agencyId: string | null;
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string | null;
  kind: DeliverableKind;
  period: string;
  title: string;
  description: string | null;
  status: DeliverableStatus;

  preparerAgencyUserId: string | null;
  preparerName: string | null;
  preparedAt: string | null;

  reviewerAgencyUserId: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;

  approverAgencyUserId: string | null;
  approverName: string | null;
  approvedAt: string | null;
  approvalNotes: string | null;

  deliveredAt: string | null;
  deliveredAttachmentUrl: string | null;
  deliveredFilename: string | null;

  rejectionNotes: string | null;
  rejectedAt: string | null;
  rejectedByAgencyUserId: string | null;
  rejectedByName: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface CreateDeliverableRequest {
  tenantId: string;
  kind: DeliverableKind;
  period: string;
  title: string;
  description?: string | null;
}

export interface UpdateDeliverableRequest {
  title?: string;
  description?: string | null;
}

export interface SignOffRequest {
  notes?: string | null;
}

export interface DeliverRequest {
  attachmentUrl: string;
  filename: string;
}

export interface RejectRequest {
  notes: string;
}

/* -------------------- agency side -------------------- */

export const agency = {
  list: (clientTenantId?: string) =>
    apiJson<DeliverableDto[]>('/api/v1/agency/deliverables', {
      query: clientTenantId ? { clientTenantId } : {},
    }),
  create: (req: CreateDeliverableRequest) =>
    apiJson<DeliverableDto>('/api/v1/agency/deliverables', { method: 'POST', json: req }),
  get: (id: string) =>
    apiJson<DeliverableDto>(`/api/v1/agency/deliverables/${id}`),
  update: (id: string, req: UpdateDeliverableRequest) =>
    apiJson<DeliverableDto>(`/api/v1/agency/deliverables/${id}`, { method: 'PATCH', json: req }),
  submit: (id: string, req?: SignOffRequest) =>
    apiJson<DeliverableDto>(`/api/v1/agency/deliverables/${id}/submit`, {
      method: 'POST', json: req ?? {},
    }),
  review: (id: string, req?: SignOffRequest) =>
    apiJson<DeliverableDto>(`/api/v1/agency/deliverables/${id}/review`, {
      method: 'POST', json: req ?? {},
    }),
  approve: (id: string, req?: SignOffRequest) =>
    apiJson<DeliverableDto>(`/api/v1/agency/deliverables/${id}/approve`, {
      method: 'POST', json: req ?? {},
    }),
  deliver: (id: string, req: DeliverRequest) =>
    apiJson<DeliverableDto>(`/api/v1/agency/deliverables/${id}/deliver`, {
      method: 'POST', json: req,
    }),
  reject: (id: string, req: RejectRequest) =>
    apiJson<DeliverableDto>(`/api/v1/agency/deliverables/${id}/reject`, {
      method: 'POST', json: req,
    }),
};

/* -------------------- tenant side (admin) — delivered vault -------------------- */

export const tenant = {
  list: () => apiJson<DeliverableDto[]>('/api/v1/deliverables'),
  get: (id: string) => apiJson<DeliverableDto>(`/api/v1/deliverables/${id}`),
};
