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

/** Per-employee severance preview — quarter-based installments locked
 *  to the contract's starting salary. Mirror of
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
  /** Salary at contract start — fixed for the whole contract life. */
  startSalary: number;
  /** Inclusive whole-month count between startDate and endDate. */
  contractMonths: number;
  /** floor(contractMonths / 3) — total quarters at natural expiry. */
  fullQuarters: number;
  /** startDate + 3 months — when the first installment matures. */
  matureDate: string | null;
  /** Quarters actually matured as of today, clamped to [0, fullQuarters]. */
  maturedQuarters: number;
  ratePercent: number;
  /** maturedQuarters × 3 × startSalary — the wage base actually payable. */
  totalWages: number;
  /** totalWages × ratePercent / 100. */
  severance: number;
  /** One row per quarter in the contract. */
  quarters: Array<{ number: number; monthRange: string; amount: number }>;
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

/** Bulk preview — every active FDC contract with quarter-based severance
 *  pre-computed. Mirror of {@code FdcSeveranceAllResponse}. */
export interface FdcSeveranceAllRow {
  employeeId: string;
  contractId: string;
  empNo?: string | null;
  name: string;
  startDate: string;
  endDate: string;
  contractType?: string | null;
  terminationReason?: string | null;
  startSalary: number;
  contractMonths: number;
  /** Total possible quarters at natural expiry. */
  fullQuarters: number;
  /** startDate + 3 months — first-installment maturity. */
  matureDate: string | null;
  /** Quarters matured to-date, clamped to [0, fullQuarters]. */
  maturedQuarters: number;
  totalWages: number;
  severance: number;
  eligible: boolean;
  reason?: string | null;
}

export interface FdcSeveranceAll {
  ratePercent: number;
  eligibleCount: number;
  rosterSize: number;
  totalSeverance: number;
  items: FdcSeveranceAllRow[];
}

export async function previewAll(ratePercent?: number): Promise<FdcSeveranceAll> {
  return apiJson<FdcSeveranceAll>('/api/v1/payroll/fdc-severance/preview-all', {
    query: { ...(ratePercent ? { ratePercent } : {}) },
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
