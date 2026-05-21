import { apiJson } from './client';
import type { PayrollBatch } from './payroll';

export interface AlRemainPreviewItem {
  employeeId: string;
  empNo?: string | null;
  name: string;
  annualAllocatedDays: number;
  allocatedInWindow: number;
  usedDays: number;
  remainingDays: number;
  monthlyGross: number;
  dailyWage: number;
  amount: number;
  eligible: boolean;
  reason?: string | null;
}

export interface AlRemainPreview {
  fromMonth: string;
  toMonth: string;
  monthsInWindow: number;
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
