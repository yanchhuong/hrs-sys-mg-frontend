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
  /** Display name resolved server-side via user→employee. Falls back to
   *  the user's email when the user has no linked employee profile. */
  uploadedByName?: string | null;
  uploadedAt: string;
  approvedById?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  completedById?: string | null;
  completedByName?: string | null;
  completedAt?: string | null;
  rejectedById?: string | null;
  rejectedByName?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  /** Author + modifier audit (separate from the workflow uploader/approver fields). */
  createdById?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
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
  /** Per-channel dispatch state. ISO timestamp = sent on that channel.
   *  Null/missing = not yet sent. Once stamped server-side the timestamp
   *  is preserved across re-dispatch attempts (idempotent). */
  mailSentAt?: string | null;
  smsSentAt?: string | null;
  bankSentAt?: string | null;
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

/**
 * All payroll items for a given month (YYYY-MM), optionally scoped to one
 * employee. Used by the Reports page — pulls together every item across
 * batches for the period, so the UI can produce its own aggregations.
 */
export async function listItemsByMonth(month: string, employeeId?: string): Promise<PayrollItem[]> {
  return apiJson<PayrollItem[]>('/api/v1/payroll/items', {
    query: { month, employeeId },
  });
}

export async function getBatchItems(id: string, params: { size?: number } = {}): Promise<PayrollItem[]> {
  // Backend wraps items in a paged envelope `{data, page, size, ...}`. Default
  // page size on the server is 25; bump to 500 so the batch detail page
  // shows every employee in one shot. (If a batch ever exceeds 500 we'll
  // need to add real pagination.)
  const size = params.size ?? 500;
  const res = await apiJson<PagedResponse<PayrollItem>>(`/api/v1/payroll/batches/${id}/items`, { query: { size } });
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

/** Mark batch items as dispatched on a channel. Idempotent — items already
 *  stamped on this channel are left alone. Returns counts so the caller
 *  can show "X queued, Y already sent and skipped". */
export interface DispatchResponse {
  channel: 'mail' | 'sms' | 'bank';
  requested: number;
  dispatched: number;
  skipped: number;
}

export async function dispatchBatchItems(
  batchId: string,
  channel: 'mail' | 'sms' | 'bank',
  itemIds: string[],
): Promise<DispatchResponse> {
  return apiJson<DispatchResponse>(`/api/v1/payroll/batches/${batchId}/dispatch`, {
    method: 'POST',
    json: { channel, itemIds },
  });
}
