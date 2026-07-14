import { apiJson } from './client';
import type { PortfolioDocType } from './agencyPortfolioDocs';

/* ================================================================
 * Comment thread per Invoice / Bill / Expense.
 *
 * Two surfaces off the same table:
 *   /api/v1/agency/doc-comments  — agency read + write; posting a
 *                                  comment pings the tenant admins.
 *   /api/v1/doc-comments         — tenant read + write; resolves
 *                                  the doc's tenant against the
 *                                  caller's TenantContext.
 * ================================================================ */

export type CommentSide = 'agency' | 'tenant';

export interface DocCommentDto {
  id: string;
  tenantId: string;
  agencyId: string | null;
  relatedDocType: PortfolioDocType;
  relatedDocId: string;
  authorSide: CommentSide;
  authorAgencyUserId: string | null;
  authorUserId: string | null;
  authorDisplayName: string | null;
  body: string;
  createdAt: string;
}

export const agencyDocComments = {
  list: (type: PortfolioDocType, id: string) =>
    apiJson<DocCommentDto[]>('/api/v1/agency/doc-comments', {
      query: { type, id },
    }),
  post: (type: PortfolioDocType, id: string, body: string) =>
    apiJson<DocCommentDto>('/api/v1/agency/doc-comments', {
      method: 'POST',
      json: { type, id, body },
    }),
};

export const tenantDocComments = {
  list: (type: PortfolioDocType, id: string) =>
    apiJson<DocCommentDto[]>('/api/v1/doc-comments', {
      query: { type, id },
    }),
  post: (type: PortfolioDocType, id: string, body: string) =>
    apiJson<DocCommentDto>('/api/v1/doc-comments', {
      method: 'POST',
      json: { type, id, body },
    }),
};
