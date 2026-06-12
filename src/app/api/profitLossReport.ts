import { apiJson } from './client';

export interface ProfitLossLine {
  id: string;
  date: string;
  docNo: string;
  docType: string;     // Invoice / Tax Invoice / Credit Note / Debit Note / Bill / Tax Bill / Receipt
  partyName: string;
  /** Signed amount. CN rows are negative so summing the list reproduces
   *  the server's total exactly. */
  amount: number;
  currency: string;
}

export interface ProfitLossMonth {
  month: string;       // "YYYY-MM"
  income: number;
  expense: number;
  net: number;
}

export interface ProfitLossReportResponse {
  from: string | null;
  to: string | null;
  totalIncome: number;
  totalExpense: number;
  totalBillExpense: number;
  totalReceiptExpense: number;
  netProfit: number;
  monthly: ProfitLossMonth[];
  incomeLines: ProfitLossLine[];
  expenseLines: ProfitLossLine[];
}

export interface ProfitLossQuery {
  from?: string;
  to?: string;
}

export async function profitLoss(q: ProfitLossQuery = {}): Promise<ProfitLossReportResponse> {
  const query: Record<string, string> = {};
  if (q.from) query.from = q.from;
  if (q.to)   query.to   = q.to;
  return apiJson('/api/v1/invoices/profit-loss', { query });
}
