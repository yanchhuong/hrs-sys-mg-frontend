/**
 * Tenant-wide employee payout settings (V167). Drives the
 * Beneficiary section visibility on the Employee dialog + the
 * Payout-ready chip on the Payroll page.
 */
import { apiJson } from './client';

export interface EmployeePayoutSettings {
  tenantId:        string;
  paywayEnabled:   boolean;
  allowOtherBank:  boolean;
  updatedAt:       string | null;
  updatedById:     string | null;
}

export interface EmployeePayoutSettingsRequest {
  paywayEnabled:   boolean;
  allowOtherBank:  boolean;
}

export async function get(): Promise<EmployeePayoutSettings> {
  return apiJson('/api/v1/employee-payout-settings');
}

export async function save(req: EmployeePayoutSettingsRequest): Promise<EmployeePayoutSettings> {
  return apiJson('/api/v1/employee-payout-settings', { method: 'PUT', json: req });
}
