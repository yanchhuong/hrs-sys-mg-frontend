/**
 * Super Admin cross-tenant settings — Payroll Categories and Holidays.
 * Mirrors the regular {@code payrollCategories.ts} and a slim Holiday
 * API, but with a {@code tenantId} prefixed into every path so the
 * backend's {@link com.hrms.common.tenant.TenantContext} override
 * routes the call to the right tenant.
 */
import { apiJson, apiVoid } from './client';

// ---- Payroll Categories ----------------------------------------------------
export interface PayrollCategory {
  id: string;
  code: string;
  label: string;
  kind: 'earning' | 'deduction' | string;
  valueType: 'flat' | 'percentage' | 'day' | string;
  defaultAmount: number;
  displayOrder: number;
  enabled: boolean;
  system: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PayrollCategoryCreate {
  code: string;
  label: string;
  kind: 'earning' | 'deduction';
  valueType: 'flat' | 'percentage' | 'day';
  defaultAmount?: number;
}

export interface PayrollCategoryUpdate {
  label?: string;
  valueType?: 'flat' | 'percentage' | 'day';
  defaultAmount?: number;
  enabled?: boolean;
  displayOrder?: number;
}

export const platformPayrollCategories = {
  list: (tenantId: string): Promise<PayrollCategory[]> =>
    apiJson(`/api/v1/platform/tenants/${tenantId}/payroll-categories`),
  create: (tenantId: string, req: PayrollCategoryCreate): Promise<PayrollCategory> =>
    apiJson(`/api/v1/platform/tenants/${tenantId}/payroll-categories`, { method: 'POST', json: req }),
  update: (tenantId: string, id: string, req: PayrollCategoryUpdate): Promise<PayrollCategory> =>
    apiJson(`/api/v1/platform/tenants/${tenantId}/payroll-categories/${id}`, { method: 'PATCH', json: req }),
  remove: (tenantId: string, id: string): Promise<void> =>
    apiVoid(`/api/v1/platform/tenants/${tenantId}/payroll-categories/${id}`, { method: 'DELETE' }),
  restoreDefaults: (tenantId: string): Promise<PayrollCategory[]> =>
    apiJson(`/api/v1/platform/tenants/${tenantId}/payroll-categories/restore-defaults`, { method: 'POST' }),
};

// ---- Holidays --------------------------------------------------------------
export interface Holiday {
  id: string;
  name: string;
  date: string;        // YYYY-MM-DD
  type: 'public' | 'company' | string;
  paid: boolean;
  description?: string | null;
  createdAt?: string;
}

export interface HolidayRequest {
  name: string;
  date: string;
  type: 'public' | 'company';
  paid?: boolean;
  description?: string | null;
}

export const platformHolidays = {
  list: (tenantId: string, year?: number): Promise<Holiday[]> =>
    apiJson(`/api/v1/platform/tenants/${tenantId}/holidays`, {
      query: year ? { year } : undefined,
    }),
  create: (tenantId: string, req: HolidayRequest): Promise<Holiday> =>
    apiJson(`/api/v1/platform/tenants/${tenantId}/holidays`, { method: 'POST', json: req }),
  update: (tenantId: string, id: string, req: HolidayRequest): Promise<Holiday> =>
    apiJson(`/api/v1/platform/tenants/${tenantId}/holidays/${id}`, { method: 'PATCH', json: req }),
  remove: (tenantId: string, id: string): Promise<void> =>
    apiVoid(`/api/v1/platform/tenants/${tenantId}/holidays/${id}`, { method: 'DELETE' }),
};
