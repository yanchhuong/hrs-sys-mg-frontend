import { apiJson } from './client';

/* ================================================================
 * Document Center — /api/v1/agency/document-requests + /document-requests
 *
 * State machine (BE V229):
 *   pending → uploaded → reviewed
 *      ▲          │
 *      └─────── rejected (tenant re-uploads back to uploaded)
 * ================================================================ */

export type DocStatus = 'pending' | 'uploaded' | 'reviewed' | 'rejected';

export type DocCategory =
  | 'bank_statement' | 'invoice' | 'bill' | 'receipt' | 'contract'
  | 'payroll_slip' | 'tax_notice' | 'patent_cert' | 'kyc_doc' | 'other';

/** v-agency-doc-request-related-doc — hard link to the financial
 *  doc a request concerns. Kept polymorphic across three tables
 *  (sale_invoices / bills / receipts) via {@link RelatedDocType}. */
export type RelatedDocType = 'invoice' | 'bill' | 'expense';

export interface DocumentRequestDto {
  id: string;
  agencyId: string | null;
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string | null;
  title: string;
  description: string | null;
  category: DocCategory;
  period: string | null;
  dueDate: string | null;
  status: DocStatus;
  requestedByAgencyUserId: string | null;
  requestedByName: string | null;
  uploadedAt: string | null;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  attachmentUrl: string | null;
  filename: string | null;
  reviewedAt: string | null;
  reviewedByAgencyUserId: string | null;
  reviewedByName: string | null;
  rejectionNotes: string | null;
  /** Hard-link fields. All three are populated together (or all
   *  null). {@link #relatedDocNo} is server-hydrated so the FE can
   *  render "INV-2025-001" without a follow-up lookup. */
  relatedDocType: RelatedDocType | null;
  relatedDocId: string | null;
  relatedDocNo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocRequestRequest {
  tenantId: string;
  title: string;
  description?: string | null;
  category?: DocCategory;
  period?: string | null;
  dueDate?: string | null;
  /** Optional hard link to the financial doc this request concerns.
   *  Both fields together, or omit both. Server rejects a cross-
   *  tenant link (relatedDocId must live in `tenantId`). */
  relatedDocType?: RelatedDocType | null;
  relatedDocId?: string | null;
}

export interface UploadDocRequest {
  attachmentUrl: string;
  filename: string;
}

/* -------------------- agency side -------------------- */

export const agency = {
  list: (clientTenantId?: string) =>
    apiJson<DocumentRequestDto[]>('/api/v1/agency/document-requests', {
      query: clientTenantId ? { clientTenantId } : {},
    }),
  create: (req: CreateDocRequestRequest) =>
    apiJson<DocumentRequestDto>('/api/v1/agency/document-requests', { method: 'POST', json: req }),
  get: (id: string) =>
    apiJson<DocumentRequestDto>(`/api/v1/agency/document-requests/${id}`),
  update: (id: string, req: CreateDocRequestRequest) =>
    apiJson<DocumentRequestDto>(`/api/v1/agency/document-requests/${id}`, { method: 'PATCH', json: req }),
  review: (id: string) =>
    apiJson<DocumentRequestDto>(`/api/v1/agency/document-requests/${id}/review`, { method: 'POST' }),
  reject: (id: string, notes: string) =>
    apiJson<DocumentRequestDto>(`/api/v1/agency/document-requests/${id}/reject`, {
      method: 'POST', json: { notes },
    }),
  del: (id: string) =>
    apiJson<void>(`/api/v1/agency/document-requests/${id}`, { method: 'DELETE' }),
};

/* -------------------- tenant side -------------------- */

export const tenant = {
  list: () => apiJson<DocumentRequestDto[]>('/api/v1/document-requests'),
  get:  (id: string) => apiJson<DocumentRequestDto>(`/api/v1/document-requests/${id}`),
  upload: (id: string, req: UploadDocRequest) =>
    apiJson<DocumentRequestDto>(`/api/v1/document-requests/${id}/upload`, {
      method: 'POST', json: req,
    }),
};
