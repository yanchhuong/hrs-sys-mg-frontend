import { apiJson, apiVoid } from './client';

export type PayrollBatchStatus = 'pending' | 'approved' | 'done' | 'rejected';

export interface PayrollBatch {
  id: string;
  batchDate: string;
  monthYear: string;
  type: string;
  subject: string;
  totalEmployees: number;
  currency: string;
  netSalaryTotal: number;
  totalEarnings: number;
  totalDeductions: number;
  remarks?: string;
  status: PayrollBatchStatus;
  uploadedById: string;
  uploadedAt: string;
  approvedById?: string | null;
  approvedAt?: string | null;
  completedById?: string | null;
  completedAt?: string | null;
  rejectedById?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  /** UUIDs of users the uploader nominated as approvers. Empty = any admin. */
  approverIds?: string[];
}

export interface PayrollItem {
  id: string;
  batchId: string;
  employeeId: string;
  employeeName?: string;
  month: string;
  baseSalary: number;
  otHours?: number;
  otPay?: number;
  totalEarnings: number;
  /** Total of all deductions on the row. Backend field name. */
  deductions: number;
  netSalary: number;
  currency?: string;
  earnings?: Record<string, number>;
  deductionsBreakdown?: Record<string, number>;
  payrollAccount?: string;
  generatedAt?: string;
}

export interface CreateBatchItem {
  employeeId: string;
  baseSalary?: number;
  otHours?: number;
  otPay?: number;
  earnings?: Record<string, number>;
  deductionsBreakdown?: Record<string, number>;
  payrollAccount?: string;
}

export interface CreateBatchRequest {
  batchDate: string;
  /** YYYY-MM */
  monthYear: string;
  type: string;
  subject: string;
  currency?: string;
  remarks?: string;
  /** Optional. Up to 3 user UUIDs the uploader has nominated as approvers.
   *  Empty / omitted = any admin (other than uploader) may approve. */
  approverIds?: string[];
  items: CreateBatchItem[];
}

export interface ListBatchesParams {
  status?: PayrollBatchStatus | '';
  month?: string;
  page?: number;
  size?: number;
}

export interface PagedResponse<T> {
  data: T[];
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

export async function listBatches(params: ListBatchesParams = {}): Promise<PagedResponse<PayrollBatch>> {
  return apiJson('/api/v1/payroll/batches', { query: { ...params } });
}

export async function getBatch(id: string): Promise<PayrollBatch> {
  return apiJson(`/api/v1/payroll/batches/${id}`);
}

export async function getBatchItems(id: string): Promise<PayrollItem[]> {
  // Backend wraps items in a paged envelope `{data, page, size, ...}`.
  const res = await apiJson<PagedResponse<PayrollItem>>(`/api/v1/payroll/batches/${id}/items`);
  return res.data;
}

export async function createBatch(req: CreateBatchRequest): Promise<PayrollBatch> {
  return apiJson('/api/v1/payroll/batches', { method: 'POST', json: req });
}

export async function approveBatch(id: string): Promise<PayrollBatch> {
  return apiJson(`/api/v1/payroll/batches/${id}/approve`, { method: 'POST' });
}

export async function rejectBatch(id: string, reason?: string): Promise<PayrollBatch> {
  return apiJson(`/api/v1/payroll/batches/${id}/reject`, {
    method: 'POST',
    json: { reason: reason ?? '' },
  });
}

export async function completeBatch(id: string): Promise<PayrollBatch> {
  return apiJson(`/api/v1/payroll/batches/${id}/complete`, { method: 'POST' });
}

export async function removeBatch(id: string): Promise<void> {
  return apiVoid(`/api/v1/payroll/batches/${id}`, { method: 'DELETE' });
}
