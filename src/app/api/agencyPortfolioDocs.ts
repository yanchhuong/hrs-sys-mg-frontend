import { apiJson } from './client';

/* ================================================================
 * Agency portfolio docs — cross-tenant read for the Cases page's
 * Invoices / Bills / Expenses tabs.
 *
 * Backend picks up the agency identity from the JWT and iterates
 * `agency_company_assignments` server-side, so the FE never has
 * to swap the X-Client-Tenant header per tenant.
 * ================================================================ */

export type PortfolioDocType = 'invoice' | 'bill' | 'expense';

export interface PortfolioDoc {
  type: PortfolioDocType;
  id: string;
  tenantId: string;
  tenantName: string;
  docNo: string;
  issueDate: string;       // ISO yyyy-MM-dd
  total: number;
  status: string;
  currency: string;
  /** v-agency-journal-columns — customer name (Sale) or vendor
   *  name (Bill / Expense). Null when the counterparty row has
   *  been hard-deleted. */
  counterpartyName: string | null;
  /** v-agency-journal-columns — VAT / tax portion of the total.
   *  Null when the row predates the tax-amount column. */
  taxAmount: number | null;
}

export interface PortfolioDocLine {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PortfolioDocDetail {
  type: PortfolioDocType;
  id: string;
  tenantId: string;
  tenantName: string;
  docNo: string;
  kind: string | null;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  exchangeRate: number | null;
  subtotal: number | null;
  taxAmount: number | null;
  discountAmount: number | null;
  total: number;
  paidAmount: number | null;
  status: string;
  notes: string | null;
  terms: string | null;
  counterpartyName: string | null;
  lines: PortfolioDocLine[];
}

export const portfolioDocs = {
  /** `type` narrows to one doc kind; `tenantId` narrows to one
   *  engaged Company. Both optional — omit both to get everything
   *  across the portfolio. */
  list: (params: { type?: PortfolioDocType; tenantId?: string } = {}) => {
    const query: Record<string, string> = {};
    if (params.type)     query.type = params.type;
    if (params.tenantId) query.tenantId = params.tenantId;
    return apiJson<PortfolioDoc[]>('/api/v1/agency/portfolio-docs', { query });
  },
  /** Full-fidelity read for the read-only Case View dialog. Server
   *  resolves the doc's tenant from the id + verifies the caller's
   *  engagement. */
  get: (type: PortfolioDocType, id: string) =>
    apiJson<PortfolioDocDetail>(`/api/v1/agency/portfolio-docs/${type}/${id}`),

  /** v-agency-case-tax-ref-col — bulk map docId → GDT ref for
   *  docs that have been included in a submitted/accepted tax
   *  declaration. Missing docIds mean "not yet declared". */
  taxRefs: (type: PortfolioDocType, ids: string[]) =>
    apiJson<Record<string, PortfolioDocTaxRef>>('/api/v1/agency/portfolio-docs/tax-refs', {
      query: { type, ids: ids.join(',') },
    }),
};

export interface PortfolioDocTaxRef {
  declarationId: string;
  gdtReferenceNo: string;
  status: 'submitted' | 'accepted';
  submittedAt: string | null;
  period: string;
}
