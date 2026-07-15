import { apiJson } from './client';

/* ================================================================
 * Agency admin surfaces — /api/v1/agency/users + assignments
 *
 * v-agency-users-admin: CRUD for agency members (Partner-only writes)
 * v-agency-engagement-accept-deny: pending list + accept + decline
 * ================================================================ */

export type AgencyRole = 'partner' | 'manager' | 'senior' | 'staff';

export interface AgencyUserAdminDto {
  id: string;
  email: string;
  name: string | null;
  role: AgencyRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** v-agency-user-client-scopes — tenant IDs the user is restricted
   *  to. Empty = unrestricted (Partner OR default). */
  assignedTenantIds: string[];
}

export interface CreateAgencyUserRequest {
  email: string;
  name?: string | null;
  password: string;
  role?: AgencyRole;
}

export interface UpdateAgencyUserRequest {
  name?: string | null;
  role?: AgencyRole;
  isActive?: boolean;
  /** Only send when actually changing the password. */
  password?: string;
}

export const agencyUsers = {
  list: () => apiJson<AgencyUserAdminDto[]>('/api/v1/agency/users'),
  create: (req: CreateAgencyUserRequest) =>
    apiJson<AgencyUserAdminDto>('/api/v1/agency/users', { method: 'POST', json: req }),
  update: (id: string, req: UpdateAgencyUserRequest) =>
    apiJson<AgencyUserAdminDto>(`/api/v1/agency/users/${id}`, { method: 'PATCH', json: req }),
  deactivate: (id: string) =>
    apiJson<AgencyUserAdminDto>(`/api/v1/agency/users/${id}`, { method: 'DELETE' }),
  /** v-agency-user-client-scopes */
  getScopes: (id: string) =>
    apiJson<UserScopeDto>(`/api/v1/agency/users/${id}/scopes`),
  setScopes: (id: string, tenantIds: string[]) =>
    apiJson<UserScopeDto>(`/api/v1/agency/users/${id}/scopes`, {
      method: 'PUT', json: { tenantIds },
    }),
};

export interface UserScopeDto {
  agencyUserId: string;
  /** Partner role — the scope list is ignored by the resolver; UI
   *  can hide the picker when this is true. */
  isPartnerFullScope: boolean;
  /** Empty list = unrestricted (full portfolio). */
  tenantIds: string[];
}

/* -------------------- assignments (Accept/Deny) -------------------- */

export type AssignmentStatus =
  'pending' | 'active' | 'declined' | 'disengaged' | 'disconnect_pending';

export type AllowedDataType = 'invoice' | 'bill' | 'expense';

export interface AssignmentDto {
  id: string;
  agencyId: string;
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string | null;
  scope: 'full' | 'tax' | 'audit' | 'bookkeeping';
  isPrimary: boolean;
  status: AssignmentStatus;
  terms: string | null;
  declineReason: string | null;
  /** v-agency-engagement-allowed-data-types — subset of
   *  invoice / bill / expense the client has permitted this
   *  agency to see. Empty array = revoked. */
  allowedDataTypes: AllowedDataType[];
  /** v-tenant-request-agency — 'super_admin' | 'tenant' | 'agency'. */
  initiatedBy: 'super_admin' | 'tenant' | 'agency';
  decisionAt: string | null;
  engagedAt: string | null;
  createdAt: string;
}

export const assignments = {
  /** Every engagement for the caller's agency across every status.
   *  Feeds the merged Clients page. */
  list: () => apiJson<AssignmentDto[]>('/api/v1/agency/assignments'),
  pending: () => apiJson<AssignmentDto[]>('/api/v1/agency/assignments/pending'),
  accept: (id: string) =>
    apiJson<AssignmentDto>(`/api/v1/agency/assignments/${id}/accept`, { method: 'POST' }),
  decline: (id: string, reason: string) =>
    apiJson<AssignmentDto>(`/api/v1/agency/assignments/${id}/decline`, {
      method: 'POST', json: { reason },
    }),
  /** v-tenant-request-disconnect — Partner accepts a tenant-driven
   *  disconnect request; flips to disengaged + sets disengaged_at. */
  acceptDisconnect: (id: string) =>
    apiJson<AssignmentDto>(`/api/v1/agency/assignments/${id}/accept-disconnect`, { method: 'POST' }),
};
