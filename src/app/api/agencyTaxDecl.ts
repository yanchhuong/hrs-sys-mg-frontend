import { apiJson } from './client';

/* ================================================================
 * Tax Declaration workflow — /api/v1/agency/tax-declarations
 *
 * Six-state machine (BE V230), tied to the (obligation, period)
 * of an existing tax_filings row. On {@code submit-to-gdt} the
 * paired tax_filings entry is auto-marked filed with the GDT ref.
 * ================================================================ */

export type TaxDeclStatus =
  | 'draft' | 'prepared' | 'reviewed' | 'approved'
  | 'submitted' | 'accepted' | 'rejected';

export interface TaxDeclarationDto {
  id: string;
  agencyId: string | null;
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string | null;
  obligationCode: string;
  obligationName: string;
  period: string;
  status: TaxDeclStatus;
  amountOwed: number;
  currency: string;
  computation: string | null;
  notes: string | null;

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

  submittedAt: string | null;
  submittedByAgencyUserId: string | null;
  submittedByName: string | null;
  gdtReferenceNo: string | null;

  acceptedAt: string | null;
  acceptedByAgencyUserId: string | null;
  acceptedByName: string | null;

  rejectionNotes: string | null;
  rejectedAt: string | null;
  rejectedByAgencyUserId: string | null;
  rejectedByName: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface CreateDeclarationRequest {
  tenantId: string;
  obligationCode: string;
  period: string;
  amountOwed?: number;
  currency?: string;
  computation?: string | null;
  notes?: string | null;
}

export interface UpdateDeclarationRequest {
  amountOwed?: number;
  currency?: string;
  computation?: string | null;
  notes?: string | null;
}

export interface SignOffRequest { notes?: string | null }
export interface SubmitToGdtRequest {
  gdtReferenceNo: string;
  attachmentUrl?: string | null;
  notes?: string | null;
}
export interface RejectRequest { notes: string }

export const agency = {
  list: (clientTenantId?: string) =>
    apiJson<TaxDeclarationDto[]>('/api/v1/agency/tax-declarations', {
      query: clientTenantId ? { clientTenantId } : {},
    }),
  create: (req: CreateDeclarationRequest) =>
    apiJson<TaxDeclarationDto>('/api/v1/agency/tax-declarations', { method: 'POST', json: req }),
  get: (id: string) => apiJson<TaxDeclarationDto>(`/api/v1/agency/tax-declarations/${id}`),
  update: (id: string, req: UpdateDeclarationRequest) =>
    apiJson<TaxDeclarationDto>(`/api/v1/agency/tax-declarations/${id}`, { method: 'PATCH', json: req }),
  prepare: (id: string, req?: SignOffRequest) =>
    apiJson<TaxDeclarationDto>(`/api/v1/agency/tax-declarations/${id}/prepare`, { method: 'POST', json: req ?? {} }),
  review: (id: string, req?: SignOffRequest) =>
    apiJson<TaxDeclarationDto>(`/api/v1/agency/tax-declarations/${id}/review`, { method: 'POST', json: req ?? {} }),
  approve: (id: string, req?: SignOffRequest) =>
    apiJson<TaxDeclarationDto>(`/api/v1/agency/tax-declarations/${id}/approve`, { method: 'POST', json: req ?? {} }),
  submitToGdt: (id: string, req: SubmitToGdtRequest) =>
    apiJson<TaxDeclarationDto>(`/api/v1/agency/tax-declarations/${id}/submit-to-gdt`, { method: 'POST', json: req }),
  markAccepted: (id: string) =>
    apiJson<TaxDeclarationDto>(`/api/v1/agency/tax-declarations/${id}/mark-accepted`, { method: 'POST' }),
  reject: (id: string, req: RejectRequest) =>
    apiJson<TaxDeclarationDto>(`/api/v1/agency/tax-declarations/${id}/reject`, { method: 'POST', json: req }),
};

export const tenant = {
  list: () => apiJson<TaxDeclarationDto[]>('/api/v1/tax-declarations'),
};
