import { apiJson } from './client';

/* ================================================================
 * v-tenant-request-agency — tenant-side Settings ▸ Agency tab.
 *
 * A Company Admin can browse the directory of active agencies,
 * read the agency's standing Terms & Agreement, and request an
 * engagement. The Partner then Accepts (or Declines) on their
 * Settings ▸ Clients page — same flow super-admin-initiated
 * proposals use.
 * ================================================================ */

export type EngagementStatus =
  'pending' | 'active' | 'declined' | 'disengaged' | 'disconnect_pending';
export type EngagementInitiatedBy = 'super_admin' | 'tenant' | 'agency';

export interface AgencyDirectoryItem {
  id: string;
  slug: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  country: string | null;
  /** Long-form T&C text. Null = the agency hasn't published one yet. */
  termsAndConditions: string | null;
  /** True when this tenant already has a pending / active row with
   *  this agency — FE greys out the Request button. */
  alreadyEngaged: boolean;
}

export interface MyRequestDto {
  id: string;
  agencyId: string;
  agencyName: string | null;
  agencySlug: string | null;
  status: EngagementStatus;
  initiatedBy: EngagementInitiatedBy;
  terms: string | null;
  declineReason: string | null;
  createdAt: string;
  decisionAt: string | null;
}

export interface SubmitRequest {
  agencyId: string;
  acceptedTerms: true;
  note?: string;
}

export const tenantAgencyRequests = {
  directory: () =>
    apiJson<AgencyDirectoryItem[]>('/api/v1/tenant/agency-requests/directory'),
  my: () =>
    apiJson<MyRequestDto[]>('/api/v1/tenant/agency-requests/my'),
  request: (req: SubmitRequest) =>
    apiJson<MyRequestDto>('/api/v1/tenant/agency-requests', {
      method: 'POST', json: req,
    }),
  /** v-tenant-request-disconnect — flip an active engagement to
   *  disconnect_pending. Agency Partner must accept for it to
   *  fully close. */
  requestDisconnect: (assignmentId: string, reason?: string) =>
    apiJson<MyRequestDto>(`/api/v1/tenant/agency-requests/${assignmentId}/disconnect`, {
      method: 'POST', json: { reason: reason ?? '' },
    }),
};
