import { apiJson } from './client';
import type { PayrollBatch } from './payroll';

export interface AlRemainPreviewItem {
  employeeId: string;
  empNo?: string | null;
  name: string;
  /** Base allocation + seniority bonus, summed across years touched. */
  annualAllocatedDays: number;
  /** +1 day per 3 years of service (Cambodian Labour Law). */
  seniorityBonusDays: number;
  /** Decimal years of service at window end. */
  yearsOfService: number;
  /** Fractional months the employee actually worked inside the window
   *  (mid-month hire / resignation contributes a partial month). */
  monthsWorked: number;
  allocatedInWindow: number;
  usedDays: number;
  remainingDays: number;
  monthlyGross: number;
  /** YYYY-MM → gross earnings for that month. */
  monthlyBreakdown: Record<string, number>;
  dailyWage: number;
  amount: number;
  eligible: boolean;
  reason?: string | null;
}

export interface AlRemainPreview {
  fromMonth: string;
  toMonth: string;
  monthsInWindow: number;
  /** Ordered list of YYYY-MM strings in the window — drives the per-month
   *  columns on the dialog. */
  monthList: string[];
  daysDivisor: number;
  eligibleCount: number;
  rosterSize: number;
  totalAmount: number;
  items: AlRemainPreviewItem[];
}

export async function preview(fromMonth: string, toMonth: string): Promise<AlRemainPreview> {
  return apiJson<AlRemainPreview>('/api/v1/payroll/al-remain/preview', {
    query: { fromMonth, toMonth },
  });
}

export interface CreateBatchRequest {
  fromMonth: string;
  toMonth: string;
  includeEmployeeIds: string[];
  subject?: string;
  approverIds?: string[];
}

export async function createBatch(req: CreateBatchRequest): Promise<PayrollBatch> {
  return apiJson<PayrollBatch>('/api/v1/payroll/al-remain/batches', { method: 'POST', json: req });
}
