import { apiJson } from './client';

/* ================================================================
 * Agency workspace — /api/v1/agency/**
 *
 * Called only from the agency-side UI (agency users after login).
 * Tenant users don't route here. All calls under /api/v1/agency/
 * bypass the X-Client-Tenant header requirement — scope resolves
 * from the JWT + agency_users membership.
 * ================================================================ */

export interface AgencyMeResponse {
  me: {
    id: string;
    email: string;
    name: string | null;
    /** {@code agency_partner} | {@code agency_manager} | {@code agency_senior} | {@code agency_staff} */
    role: string;
    isActive: boolean;
  };
  agency: {
    id: string;
    slug: string;
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
    status: string;
  };
  portfolio: AgencyClient[];
}

export interface AgencyClient {
  assignmentId: string;
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string | null;
  scope: 'full' | 'tax' | 'audit' | 'bookkeeping';
  isPrimary: boolean;
  /** v-tenant-request-disconnect — 'active' | 'disconnect_pending'.
   *  Workspace shows a read-only banner + disables write actions
   *  when this is disconnect_pending. */
  status: 'active' | 'disconnect_pending';
}

export async function me(): Promise<AgencyMeResponse> {
  return apiJson<AgencyMeResponse>('/api/v1/agency/me');
}
