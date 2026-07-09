import { apiJson, apiVoid } from './client';

/**
 * School enrollment (v-school-enrollment). Sale-side event that ties
 * a Student (customer.kind='student') to a Class (stock_item.type='class')
 * and can convert into a Tuition Bill (invoice.kind='tuition').
 */
export type EnrollmentStatus = 'enrolled' | 'active' | 'completed' | 'withdrawn';

export interface Enrollment {
  id: string;
  enrollmentNo: string;
  studentId: string;
  classId: string;
  enrollmentDate: string;      // ISO yyyy-mm-dd
  status: EnrollmentStatus;
  convertedInvoiceId?: string | null;
  currency: string;
  exchangeRate: number;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  subtotal: number;
  total: number;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface EnrollmentRequest {
  enrollmentNo?: string;
  studentId: string;
  classId: string;
  enrollmentDate?: string | null;
  currency?: string;
  exchangeRate?: number | null;
  unitPrice?: number | null;
  quantity?: number | null;
  notes?: string | null;
}

export interface ListParams {
  status?: EnrollmentStatus | '';
  studentId?: string;
  page?: number;
  size?: number;
}

export interface PagedResponse<T> {
  content: T[];
  number: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

export async function list(params: ListParams = {}): Promise<PagedResponse<Enrollment>> {
  const q: Record<string, string | number> = {};
  if (params.status) q.status = params.status;
  if (params.studentId) q.studentId = params.studentId;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  return apiJson('/api/v1/enrollments', { query: q });
}

export async function get(id: string): Promise<Enrollment> {
  return apiJson(`/api/v1/enrollments/${id}`);
}

export async function nextNumber(): Promise<{ enrollmentNo: string }> {
  return apiJson('/api/v1/enrollments/next-number');
}

export async function create(req: EnrollmentRequest): Promise<Enrollment> {
  return apiJson('/api/v1/enrollments', { method: 'POST', json: req });
}

export async function update(id: string, req: EnrollmentRequest): Promise<Enrollment> {
  return apiJson(`/api/v1/enrollments/${id}`, { method: 'PUT', json: req });
}

export async function transition(id: string, status: EnrollmentStatus): Promise<Enrollment> {
  return apiJson(`/api/v1/enrollments/${id}/status`, {
    method: 'PATCH',
    json: { status },
  });
}

/** Mint a Tuition invoice from this enrollment and stamp the id back. */
export async function convertToInvoice(id: string): Promise<{ id: string; invoiceNo: string }> {
  return apiJson(`/api/v1/enrollments/${id}/convert-to-invoice`, { method: 'POST' });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/enrollments/${id}`, { method: 'DELETE' });
}
