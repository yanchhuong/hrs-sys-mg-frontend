import { apiJson, apiVoid } from './client';

export type PayrollBatchStatus = 'pending' | 'approved' | 'done' | 'rejected';

export interface PayrollBatch {
  id: string;
  date: string;
  monthYear: string;
  type: string;
  subject: string;
  totalEmployees: number;
  currency: string;
  netSalary: number;
  totalEarnings: number;
  deductions: number;
  remarks?: string;
  uploadedBy: string;
  uploadedAt: string;
  status: PayrollBatchStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  completedBy?: string | null;
  completedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
}

export interface PayrollItem {
  id: string;
  batchId: string;
  employeeId: string;
  employeeName: string;
  month: string;
  basicSalary: number;
  totalEarnings: number;
  totalDeductions: number;
  netSalary: number;
  extras?: Record<string, number>;
}

export interface CreateBatchRequest {
  date: string;
  monthYear: string;
  type: string;
  subject: string;
  currency: string;
  remarks?: string;
  items: Omit<PayrollItem, 'id' | 'batchId'>[];
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
  return apiJson(`/api/v1/payroll/batches/${id}/items`);
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
