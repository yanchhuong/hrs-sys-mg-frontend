import { apiJson } from './client';

/**
 * Cash-Flow Transactions ledger (V156, Phase 1).
 *
 * <p>Backed by the {@code cash_transactions} table — one row per
 * sale_payment / purchase_payment / receipt_payment. Source pages
 * (Invoice / Bill / Receipt) write rows here on save; this API
 * reads them back.</p>
 */
export interface Transaction {
  id: string;
  /** Per-tenant doc number (TX-0001). Null until minted. */
  transactionNo: string | null;
  /** {@code IN} | {@code OUT}. */
  type: 'IN' | 'OUT';
  /** {@code in} | {@code out} — same info as {@link type}, lowercased
   *  for FE colour-coding. */
  direction: 'in' | 'out';
  category: string;
  paymentMethod: string;
  accountLabel: string | null;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  amount: number;
  currency: string;
  /** {@code invoice} | {@code bill} | {@code receipt} | {@code cash_advance}
   *  | {@code internal_transfer} | null. */
  referenceType: string | null;
  referenceId: string | null;
  referenceNo: string | null;
  partyName: string | null;
  /** {@code posted} | {@code draft} | {@code approved} | {@code void}. */
  status: 'posted' | 'draft' | 'approved' | 'void';
  notes: string | null;
  /** Display name of the user who created the row — hydrated server-
   *  side (User.name → email fallback). Null when the source row had
   *  no created_by (older backfilled rows). */
  createdByName: string | null;
  /** When this row is funded from a Cash Advance (e.g. Receipt paid
   *  with Method=Cash Advance) — points at the advance whose
   *  disbursement is the parent. FE uses it to indent the row + skip
   *  it from the per-currency totals so the cash outflow isn't
   *  double-counted. */
  parentAdvanceId: string | null;
}

export interface ListParams {
  from?: string;
  to?: string;
  /** Pass either {@link type} (IN/OUT) or {@link direction} (in/out). */
  type?: 'IN' | 'OUT';
  direction?: 'in' | 'out';
  refType?: 'invoice' | 'bill' | 'receipt' | 'cash_advance' | 'internal_transfer';
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

export async function list(params: ListParams = {}): Promise<PagedResponse<Transaction>> {
  const q: Record<string, string | number> = {};
  if (params.from) q.from = params.from;
  if (params.to) q.to = params.to;
  if (params.type) q.type = params.type;
  if (params.direction) q.direction = params.direction;
  if (params.refType) q.refType = params.refType;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  return apiJson('/api/v1/cashflow/transactions', { query: q });
}
