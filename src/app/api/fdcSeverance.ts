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
