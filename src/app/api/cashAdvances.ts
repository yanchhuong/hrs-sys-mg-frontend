import { apiJson, apiVoid } from './client';

/**
 * Cash Advance HTTP client (V158 / Phase 2).
 *
 * <p>One advance carries the workflow envelope; expense receipts
 * are nested children submitted against a specific advance. Money
 * movements (disbursement / settlement) live in the Transactions
 * ledger — the FE doesn't write to {@code cash_transactions}
 * directly.</p>
 */

export type CashAdvanceStatus =
  | 'draft' | 'disbursed' | 'partially_settled' | 'settled' | 'cancelled';

export interface CashAdvanceExpense {
  id: string;
  cashAdvanceId: string;
  expenseCategory: string;
  receiptNo: string | null;
  amount: number;
  currency: string;
  expenseDate: string;
  attachmentUrl: string | null;
  notes: string | null;
  /** Where this row comes from:
   *  <ul>
   *    <li>{@code manual} — cash_advance_expenses row entered via the detail dialog</li>
   *    <li>{@code receipt} — receipt_payment funded from this advance</li>
   *    <li>{@code settlement} — synthesized once the advance is settled,
   *        captures the refund / reimbursement so the balance lands at 0</li>
   *  </ul>
   *  All non-{@code manual} sources are read-only on the FE. */
  source: 'manual' | 'receipt' | 'settlement';
}

export interface CashAdvance {
  id: string;
  advanceNo: string;
  employeeId: string;
  employeeName: string | null;
  departmentId: string | null;
  purpose: string;
  advanceAmount: number;
  currency: string;
  disbursedAt: string | null;
  settlementDate: string | null;
  status: CashAdvanceStatus;
  remarks: string | null;
  createdAt: string;
  createdByName: string | null;
  disbursementTxnId: string | null;
  settlementTxnId: string | null;
  expenses: CashAdvanceExpense[];
  /** Sum of real spend only (manual + receipt-funded). Settlement
   *  refund / reimbursement lives in {@link refundAmount}. */
  expenseTotal: number;
  /** Settlement amount. Positive = employee returned cash; negative
   *  = company reimbursed additional spend; zero = not settled (or
   *  clean settle). */
  refundAmount: number;
  /** advanceAmount − expenseTotal − refundAmount. Drops to 0 once
   *  the advance is settled. */
  balance: number;
}

export interface CreateRequest {
  employeeId: string;
  departmentId?: string | null;
  purpose: string;
  advanceAmount: number;
  currency?: string;
  remarks?: string;
  /** Ordered list of approver user IDs (up to 3). When set, the
   *  backend spawns an approval chain via
   *  ApprovalService.startChainWithApprovers. Empty / omitted means
   *  the operator chose not to gate this advance — the draft →
   *  disburse flow proceeds without approval. Only honored on
   *  create; ignored on update. */
  approverUserIds?: string[];
}

export interface CreateExpenseRequest {
  expenseCategory: string;
  receiptNo?: string;
  amount: number;
  currency?: string;
  expenseDate?: string;
  attachmentUrl?: string;
  notes?: string;
}

export interface PagedResponse<T> {
  content: T[];
  number: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

/* --------------------------- list / get --------------------------- */

export async function list(params: { status?: CashAdvanceStatus; page?: number; size?: number } = {}): Promise<PagedResponse<CashAdvance>> {
  const q: Record<string, string | number> = {};
  if (params.status) q.status = params.status;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  return apiJson('/api/v1/cash-advances', { query: q });
}

export async function get(id: string): Promise<CashAdvance> {
  return apiJson(`/api/v1/cash-advances/${encodeURIComponent(id)}`);
}

/* --------------------------- write ------------------------------ */

export async function create(req: CreateRequest): Promise<CashAdvance> {
  return apiJson('/api/v1/cash-advances', { method: 'POST', json: req });
}

export async function update(id: string, req: CreateRequest): Promise<CashAdvance> {
  return apiJson(`/api/v1/cash-advances/${encodeURIComponent(id)}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/cash-advances/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ----------------------- workflow actions ----------------------- */

export async function disburse(id: string): Promise<CashAdvance> {
  return apiJson(`/api/v1/cash-advances/${encodeURIComponent(id)}/disburse`, { method: 'POST' });
}

export async function settle(id: string): Promise<CashAdvance> {
  return apiJson(`/api/v1/cash-advances/${encodeURIComponent(id)}/settle`, { method: 'POST' });
}

export async function cancel(id: string): Promise<CashAdvance> {
  return apiJson(`/api/v1/cash-advances/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

/* --------------------------- expenses --------------------------- */

export async function addExpense(advanceId: string, req: CreateExpenseRequest): Promise<CashAdvanceExpense> {
  return apiJson(`/api/v1/cash-advances/${encodeURIComponent(advanceId)}/expenses`, { method: 'POST', json: req });
}

export async function deleteExpense(expenseId: string): Promise<void> {
  return apiVoid(`/api/v1/cash-advances/expenses/${encodeURIComponent(expenseId)}`, { method: 'DELETE' });
}
