import { apiJson } from './client';

/**
 * v-collections-income — unified feed of real cash received across
 * two income sources: Payment Plan payments (payment_transactions)
 * + Booking payments (bookings.status='paid'). Feeds the redesigned
 * Collections page which reads like the Transactions ledger but
 * scoped to receivables-side income only.
 */

export type IncomeSource = 'plan' | 'booking';

/** v-collections-type-filter — plan variant for `sourceType='plan'`;
 *  the literal 'booking' when `sourceType='booking'`. Drives the
 *  Type dropdown on the Collections page. */
export type IncomeSubType = 'installment' | 'rental' | 'loan' | 'tuition' | 'custom' | 'booking';

export interface IncomeItem {
  id: string;
  sourceType: IncomeSource;
  subType?: IncomeSubType | null;
  date: string;               // ISO yyyy-MM-dd
  /** v-collections-datetime — input-into-system timestamp. Plan
   *  payments use `payment_transactions.created_at`; booking
   *  payments use `bookings.updated_at`. Rendered as
   *  "yyyy-MM-dd HH:mm" when present; falls back to `date`. */
  paidAt?: string | null;
  amount: number;
  referenceNo?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  /** Payment method — populated for Plan payments; null for Bookings
   *  (Bookings don't carry a method column today). */
  method?: string | null;
  note?: string | null;
}

/** Label + badge tone for each type value. Used by both the filter
 *  dropdown and the row-level Source badge. */
export const INCOME_TYPE_META: Record<IncomeSubType, { label: string; source: IncomeSource; badge: string }> = {
  installment: { label: 'Installment', source: 'plan',    badge: 'bg-indigo-100 text-indigo-700' },
  rental:      { label: 'Rental',      source: 'plan',    badge: 'bg-blue-100 text-blue-700' },
  loan:        { label: 'Loan',        source: 'plan',    badge: 'bg-purple-100 text-purple-700' },
  tuition:     { label: 'Tuition',     source: 'plan',    badge: 'bg-cyan-100 text-cyan-700' },
  custom:      { label: 'Custom',      source: 'plan',    badge: 'bg-slate-100 text-slate-700' },
  booking:     { label: 'Booking',     source: 'booking', badge: 'bg-emerald-100 text-emerald-700' },
};

export interface IncomeListParams {
  from?: string;
  to?: string;
}

export function income(params: IncomeListParams = {}): Promise<IncomeItem[]> {
  const q: Record<string, string> = {};
  if (params.from) q.from = params.from;
  if (params.to)   q.to   = params.to;
  return apiJson<IncomeItem[]>('/api/v1/collections/income', { query: q });
}
