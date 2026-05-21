import { apiJson } from './client';
import type { PayrollBatch } from './payroll';

/** One row of the NSSF preview — mirror of NssfPreviewItem in the API. */
export interface NssfPreviewItem {
  employeeId: string;
  empNo?: string | null;
  name: string;
  baseSalaryUsd: number;
  grossKhr: number;
  contributoryKhr: number;
  employeePensionKhr: number;
  employeePensionUsd: number;
  employerOccupationalKhr: number;
  employerHealthcareKhr: number;
  employerPensionKhr: number;
  employerTotalKhr: number;
  totalKhr: number;
  eligible: boolean;
  reason?: string | null;
}

export interface NssfPreview {
  month: string;
  khrPerUsd: number;
  wageCapKhr: number;
  employeePensionRatePercent: number;
  employerOccupationalRatePercent: number;
  employerHealthcareRatePercent: number;
  employerPensionRatePercent: number;
  items: NssfPreviewItem[];
  eligibleCount: number;
  employeeTotalKhr: number;
  employerTotalKhr: number;
  grandTotalKhr: number;
}

export async function preview(month: string, fx?: number): Promise<NssfPreview> {
  return apiJson<NssfPreview>('/api/v1/payroll/nssf/preview', {
    query: { month, ...(fx && fx > 0 ? { fx } : {}) },
  });
}

export interface CreateBatchRequest {
  month: string;
  employeeIds: string[];
  subject?: string;
  remarks?: string;
  approverIds?: string[];
}

export async function createBatch(req: CreateBatchRequest): Promise<PayrollBatch> {
  return apiJson<PayrollBatch>('/api/v1/payroll/nssf/batches', {
    method: 'POST',
    json: req,
  });
}
