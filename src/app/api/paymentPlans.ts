import { apiJson, apiVoid } from './client';

export type PlanType = 'installment' | 'rental' | 'loan' | 'tuition' | 'custom';
export type PlanFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export type PlanStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type ScheduleStatus = 'pending' | 'partial' | 'paid' | 'overdue';
export type PaymentMethod = 'cash' | 'bank' | 'khqr' | 'card' | 'wing' | 'other';

export interface PaymentSchedule {
  id: string;
  paymentPlanId: string;
  installmentNo: number;
  dueDate: string;
  dueAmount: number;
  principal: number;
  interest: number;
  paidAmount: number;
  balance: number;
  status: ScheduleStatus;
  /** True when balance > 0 and dueDate < today. Server-computed so the
   *  FE renders red without owning the "today" comparison. */
  isOverdue: boolean;
}

export interface PaymentTransaction {
  id: string;
  scheduleId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNo?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface PaymentPlan {
  id: string;
  invoiceId?: string | null;
  invoiceNo?: string | null;
  customerId: string;
  customerName?: string | null;
  planNo: string;
  planType: PlanType;
  totalAmount: number;
  downPayment: number;
  financedAmount: number;
  numberOfTerms: number;
  interestRate: number;
  frequency: PlanFrequency;
  startDate: string;
  endDate?: string | null;
  status: PlanStatus;
  remarks?: string | null;
  totalPaid: number;
  outstanding: number;
  paidInstallments: number;
  overdueInstallments: number;
  nextDueDate?: string | null;
  nextDueAmount?: number | null;
  createdAt: string;
  updatedAt: string;
  /** Populated only on the detail endpoint. Undefined on list rows. */
  schedules?: PaymentSchedule[];
}

export interface PaymentPlanCreateRequest {
  invoiceId?: string | null;
  customerId: string;
  planType: PlanType;
  totalAmount: number;
  downPayment: number;
  numberOfTerms: number;
  /** Annual percentage. Zero for INSTALLMENT / RENTAL / TUITION. */
  interestRate: number;
  frequency: PlanFrequency;
  startDate: string;
  remarks?: string;
  /** Skip the draft state — save straight as 'active'. */
  activateImmediately?: boolean;
}

export interface PaymentTransactionCreateRequest {
  scheduleId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNo?: string;
  note?: string;
}

export interface ListParams {
  status?: PlanStatus | '';
  planType?: PlanType | '';
  customerId?: string;
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

/* ------------------------------------------------------------------ */

export async function list(params: ListParams = {}): Promise<PagedResponse<PaymentPlan>> {
  return apiJson('/api/v1/payment-plans', { query: { ...params } });
}

export async function get(id: string): Promise<PaymentPlan> {
  return apiJson(`/api/v1/payment-plans/${id}`);
}

export async function create(req: PaymentPlanCreateRequest): Promise<PaymentPlan> {
  return apiJson('/api/v1/payment-plans', { method: 'POST', json: req });
}

export async function activate(id: string): Promise<PaymentPlan> {
  return apiJson(`/api/v1/payment-plans/${id}/activate`, { method: 'POST' });
}

export async function cancel(id: string): Promise<PaymentPlan> {
  return apiJson(`/api/v1/payment-plans/${id}/cancel`, { method: 'POST' });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/payment-plans/${id}`, { method: 'DELETE' });
}

export async function searchSchedules(params: {
  status?: ScheduleStatus | '';
  from?: string;
  to?: string;
} = {}): Promise<PaymentSchedule[]> {
  return apiJson('/api/v1/payment-plans/schedules', { query: { ...params } });
}

export async function recordPayment(req: PaymentTransactionCreateRequest): Promise<PaymentTransaction> {
  return apiJson('/api/v1/payment-plans/transactions', { method: 'POST', json: req });
}

export async function transactionsForSchedule(scheduleId: string): Promise<PaymentTransaction[]> {
  return apiJson(`/api/v1/payment-plans/schedules/${scheduleId}/transactions`);
}

export async function aging(asOf?: string): Promise<PaymentSchedule[]> {
  return apiJson('/api/v1/payment-plans/aging', { query: asOf ? { asOf } : {} });
}

/* ------------------------------------------------------------------
 * FE-side helpers for label lookup.
 * ------------------------------------------------------------------ */

export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  installment: 'Installment',
  rental:      'Rental',
  loan:        'Loan',
  tuition:     'Tuition',
  custom:      'Custom',
};

export const FREQUENCY_LABELS: Record<PlanFrequency, string> = {
  weekly:    'Weekly',
  biweekly:  'Bi-weekly',
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  yearly:    'Yearly',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash:  'Cash',
  bank:  'Bank Transfer',
  khqr:  'KHQR',
  card:  'Card',
  wing:  'Wing',
  other: 'Other',
};
