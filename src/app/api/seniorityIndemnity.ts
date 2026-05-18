import { apiJson } from './client';
import type { PayrollBatch } from './payroll';

export interface SeniorityIndemnityPreviewItem {
  employeeId: string;
  empNo: string;
  name: string;
  contractType: string | null;
  joinDate: string;
  resignDate: string | null;
  monthlyWage: number;
  dailyWage: number;
  amount: number;
  eligible: boolean;
  /** One-line reason when `eligible` is false. Null when eligible. */
  reason: string | null;
  /** True iff `amount` is at or under the Circular 002 4,000,000 KHR ceiling. */
  taxExempt: boolean;
  /** How many months of net-salary history fed `monthlyWage`. 0 = fell back
   *  to base + allowance because no payroll batches covered the semester. */
  monthsFound: number;
  /** Human-readable provenance for `monthlyWage` — "Average net salary over
   *  6 months of payroll history" or "Base salary + allowance (no payroll
   *  history in semester)". */
  basis: string;
  /** Per-month gross earnings used to derive `monthlyWage`. Keys are
   *  YYYY-MM in the order the backend iterated the period (Jan→Jun for
   *  H1, Jul→Dec for H2). Each value is the gross used for that month —
   *  actual when a monthly_gross_earnings row existed, projected
   *  otherwise (base + position + evaluation + approved OT + bonus). */
  monthlyGross: Record<string, number>;
}

export interface SeniorityIndemnityPreview {
  startDate: string;
  endDate: string;
  daysPaid: number;
  daysDivisor: number;
  eligibleCount: number;
  rosterCount: number;
  totalAmount: number;
  items: SeniorityIndemnityPreviewItem[];
}

export interface CreateSeniorityBatchRequest {
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  /** Days of wages to pay per employee. Default 7.5 (half of the 15 days/year rule). */
  days: number;
  subject?: string;
  approverIds?: string[];
  /** Optional allow-list. Empty / omitted = include every eligible employee. */
  includeEmployeeIds?: string[];
}

export async function preview(startDate: string, endDate: string, days: number): Promise<SeniorityIndemnityPreview> {
  return apiJson('/api/v1/payroll/seniority-indemnity/preview', {
    query: { startDate, endDate, days },
  });
}

export async function createBatch(req: CreateSeniorityBatchRequest): Promise<PayrollBatch> {
  return apiJson('/api/v1/payroll/seniority-indemnity/batches', {
    method: 'POST',
    json: req,
  });
}
