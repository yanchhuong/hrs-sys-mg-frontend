import { apiJson } from './client';

/* ================================================================
 * Super Admin — Agencies control plane.
 *   Every call under /api/v1/platform/agencies/** is gated by
 *   @PreAuthorize("hasRole('SUPER_ADMIN')") on the backend.
 * ================================================================ */

export interface PlatformAgency {
  id: string;
  slug: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  country: string | null;
  patentNo: string | null;
  vatTin: string | null;
  status: 'active' | 'suspended' | 'cancelled';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  suspendedAt: string | null;
  cancelledAt: string | null;
  userCount: number;
  clientCount: number;
}

export interface CreateAgencyRequest {
  slug: string;
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  country?: string | null;
  patentNo?: string | null;
  vatTin?: string | null;
  notes?: string | null;
}

export interface UpdateAgencyRequest {
  name?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  country?: string | null;
  patentNo?: string | null;
  vatTin?: string | null;
  notes?: string | null;
}

export interface AgencyAssignment {
  id: string;
  agencyId: string;
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string | null;
  scope: 'full' | 'tax' | 'audit' | 'bookkeeping';
  isPrimary: boolean;
  engagedAt: string;
  disengagedAt: string | null;
  engagementLetterUrl: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateAssignmentRequest {
  tenantId: string;
  scope?: 'full' | 'tax' | 'audit' | 'bookkeeping' | null;
  isPrimary?: boolean | null;
  engagementLetterUrl?: string | null;
  notes?: string | null;
}

export interface AgencyUser {
  id: string;
  userId: string | null;
  agencyId: string;
  email: string | null;
  userName: string | null;
  role: 'partner' | 'manager' | 'senior' | 'staff';
  isActive: boolean;
  createdAt: string;
}

export interface CreateAgencyUserRequest {
  email: string;
  password: string;
  name: string;
  role: 'partner' | 'manager' | 'senior' | 'staff';
}

/* -------------------- agencies -------------------- */

export const agencies = {
  list:       ()                                    => apiJson<PlatformAgency[]>('/api/v1/platform/agencies'),
  get:        (id: string)                          => apiJson<PlatformAgency>(`/api/v1/platform/agencies/${id}`),
  create:     (req: CreateAgencyRequest)            => apiJson<PlatformAgency>('/api/v1/platform/agencies', { method: 'POST', json: req }),
  update:     (id: string, req: UpdateAgencyRequest)=> apiJson<PlatformAgency>(`/api/v1/platform/agencies/${id}`, { method: 'PATCH', json: req }),
  suspend:    (id: string)                          => apiJson<PlatformAgency>(`/api/v1/platform/agencies/${id}/suspend`, { method: 'POST' }),
  reactivate: (id: string)                          => apiJson<PlatformAgency>(`/api/v1/platform/agencies/${id}/reactivate`, { method: 'POST' }),
};

export const assignments = {
  list:      (agencyId: string) =>
    apiJson<AgencyAssignment[]>(`/api/v1/platform/agencies/${agencyId}/assignments`),
  create:    (agencyId: string, req: CreateAssignmentRequest) =>
    apiJson<AgencyAssignment>(`/api/v1/platform/agencies/${agencyId}/assignments`, { method: 'POST', json: req }),
  disengage: (assignmentId: string) =>
    apiJson<void>(`/api/v1/platform/agencies/assignments/${assignmentId}/disengage`, { method: 'POST' }),
};

export const agencyUsers = {
  list:       (agencyId: string) =>
    apiJson<AgencyUser[]>(`/api/v1/platform/agencies/${agencyId}/users`),
  create:     (agencyId: string, req: CreateAgencyUserRequest) =>
    apiJson<AgencyUser>(`/api/v1/platform/agencies/${agencyId}/users`, { method: 'POST', json: req }),
  activate:   (id: string) =>
    apiJson<AgencyUser>(`/api/v1/platform/agencies/users/${id}/activate`, { method: 'POST' }),
  deactivate: (id: string) =>
    apiJson<AgencyUser>(`/api/v1/platform/agencies/users/${id}/deactivate`, { method: 'POST' }),
};
