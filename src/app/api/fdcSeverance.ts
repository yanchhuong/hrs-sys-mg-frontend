import { apiJson } from './client';
import type { PayrollBatch } from './payroll';

/** One row of the FDC-severance preview — see backend's
 *  {@code FdcSeverancePreviewItem} for the canonical shape. */
export interface FdcSeverancePreviewItem {
  contractId: string;
  employeeId: string;
  empNo?: string | null;
  name: string;
  startDate: string;
  endDate: string;
  monthsActive: number;
  totalWages: number;
  ratePercent: number;
  severance: number;
  /** Why the contract ended — null = active / treat as natural.
   *  'misconduct' forfeits severance per Cambodian Labour Law (V66). */
  terminationReason?: string | null;
  eligible: boolean;
  reason?: string | null;
}

export interface FdcSeverancePreview {
  from: string;
  to: string;
  ratePercent: number;
  items: FdcSeverancePreviewItem[];
  eligibleCount: number;
  totalSeverance: number;
}

export async function preview(
  from: string,
  to: string,
  ratePercent?: number,
): Promise<FdcSeverancePreview> {
  return apiJson<FdcSeverancePreview>('/api/v1/payroll/fdc-severance/preview', {
    query: { from, to, ...(ratePercent ? { ratePercent } : {}) },
  });
}

/** Per-employee severance preview — one FDC contract's worth of monthly
 *  earnings + the resulting 5% wage base. Mirror of
 *  {@code FdcSeveranceEmployeePreviewResponse} on the backend. */
export interface FdcSeveranceEmployeePreview {
  employeeId: string;
  contractId: string | null;
  empNo?: string | null;
  name: string;
  startDate: string | null;
  endDate: string | null;
  contractType?: string | null;
  terminationReason?: string | null;
  ratePercent: number;
  totalWages: number;
  severance: number;
  months: Array<{ month: string; totalEarnings: number }>;
  eligible: boolean;
  reason?: string | null;
}

export async function previewByEmployee(
  employeeId: string,
  ratePercent?: number,
): Promise<FdcSeveranceEmployeePreview> {
  return apiJson<FdcSeveranceEmployeePreview>('/api/v1/payroll/fdc-severance/preview-by-employee', {
    query: { employeeId, ...(ratePercent ? { ratePercent } : {}) },
  });
}

export interface CreateBatchRequest {
  from: string;
  to: string;
  ratePercent?: number;
  contractIds: string[];
  monthYear?: string;
  subject?: string;
  remarks?: string;
  approverIds?: string[];
}

export async function createBatch(req: CreateBatchRequest): Promise<PayrollBatch> {
  return apiJson<PayrollBatch>('/api/v1/payroll/fdc-severance/batches', {
    method: 'POST',
    json: req,
  });
}
