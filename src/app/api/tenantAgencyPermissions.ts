import { apiJson } from './client';

/* ================================================================
 * v-tenant-agency-data-access — Company Admin surface for what
 * their agency can list + view.
 * ================================================================ */

export type DataType = 'invoice' | 'bill' | 'expense' | 'payroll';

export interface AgencyPermissionRow {
  assignmentId: string;
  agencyId: string;
  agencyName: string | null;
  agencySlug: string | null;
  status: 'active' | 'disconnect_pending';
  allowedDataTypes: DataType[];
  allowedInvoiceStatuses: string[];
  allowedBillStatuses:    string[];
  allowedExpenseStatuses: string[];
  allowedPayrollStatuses: string[];
  /** Known statuses per type — FE renders these as the checkbox set. */
  knownInvoiceStatuses: string[];
  knownBillStatuses:    string[];
  knownExpenseStatuses: string[];
  knownPayrollStatuses: string[];
}

export interface UpdateAgencyPermissionsRequest {
  /** Send null to leave unchanged; empty list revokes ALL data. */
  allowedDataTypes?: DataType[] | null;
  /** null = no change; empty list = "all statuses". */
  allowedInvoiceStatuses?: string[] | null;
  allowedBillStatuses?:    string[] | null;
  allowedExpenseStatuses?: string[] | null;
  allowedPayrollStatuses?: string[] | null;
}

export const tenantAgencyPermissions = {
  list: () =>
    apiJson<AgencyPermissionRow[]>('/api/v1/tenant/agency-permissions'),
  update: (assignmentId: string, req: UpdateAgencyPermissionsRequest) =>
    apiJson<AgencyPermissionRow>(`/api/v1/tenant/agency-permissions/${assignmentId}`, {
      method: 'PATCH', json: req,
    }),
};
