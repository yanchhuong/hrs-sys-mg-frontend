import { apiJson } from './client';

/* ================================================================
 * Tax Declaration workflow — /api/v1/agency/tax-declarations
 *
 * Six-state machine (BE V230), tied to the (obligation, period)
 * of an existing tax_filings row. On {@code submit-to-gdt} the
 * paired tax_filings entry is auto-marked filed with the GDT ref.
 *
 * v-tax-decl-category-and-docs (V234) — every declaration carries
 * a `category` (one of Income / Expense / Salary / WHT / NSSF)
 * plus an optional set of {@link LinkedDoc}s pointing at source
 * Invoices / Bills / Expenses.
 * ================================================================ */

export type TaxDeclStatus =
  | 'draft' | 'prepared' | 'reviewed' | 'approved'
  | 'submitted' | 'accepted' | 'rejected';

export type TaxDeclCategory =
  | 'income' | 'expense' | 'salary' | 'wht' | 'nssf';

/** {@code monthly | annual} — server-hydrated from the obligation
 *  row so the FE can group into Monthly / Yearly tabs without a
 *  follow-up lookup. */
export type TaxDeclFrequency = 'monthly' | 'annual';

export type LinkedDocType = 'invoice' | 'bill' | 'expense';

export interface LinkedDoc {
  /** Server-set id for the join row. Null on suggest responses
   *  (nothing has been persisted yet). */
  id: string | null;
  docType: LinkedDocType;
  docId: string;
  docNo: string | null;
  docAmount: number | null;
  attachedAt: string | null;
  attachedByAgencyUserId: string | null;
}

export interface LinkedDocRequest {
  docType: LinkedDocType;
  docId: string;
}

export interface TaxDeclarationDto {
  id: string;
  agencyId: string | null;
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string | null;
  obligationCode: string;
  obligationName: string;
  frequency: TaxDeclFrequency | null;
  category: TaxDeclCategory;
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

  linkedDocs: LinkedDoc[];

  createdAt: string;
  updatedAt: string;
}

export interface CreateDeclarationRequest {
  tenantId: string;
  obligationCode: string;
  period: string;
  category?: TaxDeclCategory;
  amountOwed?: number;
  currency?: string;
  computation?: string | null;
  notes?: string | null;
  linkedDocs?: LinkedDocRequest[];
}

export interface UpdateDeclarationRequest {
  amountOwed?: number;
  currency?: string;
  computation?: string | null;
  notes?: string | null;
  /** Non-null → REPLACES the linked-docs set. Empty array detaches
   *  everything; leave undefined to keep the current set. */
  linkedDocs?: LinkedDocRequest[];
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

  /** v-tax-decl-category-and-docs — pre-select candidates for the
   *  New Declaration dialog. Empty list for salary/wht/nssf. */
  suggestDocs: (tenantId: string, category: TaxDeclCategory, period: string) =>
    apiJson<LinkedDoc[]>('/api/v1/agency/tax-declarations/suggest-docs', {
      query: { tenantId, category, period },
    }),
};

export const tenant = {
  list: () => apiJson<TaxDeclarationDto[]>('/api/v1/tax-declarations'),
};

/* -------------------- display helpers -------------------- */

/** Convert a period from storage shape (YYYY-MM / YYYY) to the
 *  user-facing display (MM-YYYY / YYYY) per the operator spec. */
export function formatPeriodForDisplay(period: string): string {
  if (!period) return '';
  if (period.length === 7 && period.charAt(4) === '-') {
    return period.substring(5) + '-' + period.substring(0, 4);
  }
  return period;
}

/** Standard mapping — matches BE's OBLIGATION_TO_CATEGORY. */
export const CATEGORY_LABELS: Record<TaxDeclCategory, string> = {
  income:  'Income',
  expense: 'Expense',
  salary:  'Salary',
  wht:     'Withholding Tax',
  nssf:    'NSSF',
};
