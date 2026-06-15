import { apiJson } from './client';

export interface LedgerEntry {
  id: string;
  date: string;       // ISO yyyy-mm-dd
  docNo: string;
  docType: string;    // "Invoice" | "Tax Invoice" | "Credit Note" | "Debit Note" | "Bill" | "Tax Bill"
  /** Signed contribution to the Total column. +invoice/+DN, −CN. */
  amount: number;
  /** Currency-blind sum of payments-in on this doc (USD + KHR added
   *  as raw numbers). Kept for chain math; the UI's per-currency
   *  columns use {@link receivedUsd} / {@link receivedKhr} instead. */
  received: number;
  refund: number;
  /** Per-chain balance, set only on the parent (Invoice / Bill) row.
   *  Null on Credit Note / Debit Note children — the UI hides the
   *  cell so the table reads one Balance line per invoice chain
   *  (same principle as the Invoice list page). */
  balance: number | null;
  currency: string;
  /** USD-only portion of received. */
  receivedUsd: number;
  /** KHR-only portion of received. */
  receivedKhr: number;
  refundUsd: number;
  refundKhr: number;
  reference: string;
}

export interface LedgerGroup {
  partyId: string;
  partyName: string;
  partyType: string;    // "individual" | "business"
  openingBalance: number;
  totalAmount: number;
  totalReceived: number;
  totalRefund: number;
  closingBalance: number;
  currency: string;
  entries: LedgerEntry[];
}

export interface LedgerReportResponse {
  from: string | null;
  to: string | null;
  grandTotalAmount: number;
  grandTotalReceived: number;
  grandTotalRefund: number;
  grandTotalBalance: number;
  groups: LedgerGroup[];
}

export interface LedgerQuery {
  from?: string;
  to?: string;
}

/** Sales Ledger — grouped per customer, debit = AR up, credit = AR down. */
export async function saleLedger(q: LedgerQuery = {}): Promise<LedgerReportResponse> {
  const query: Record<string, string> = {};
  if (q.from) query.from = q.from;
  if (q.to)   query.to   = q.to;
  return apiJson('/api/v1/invoices/ledger', { query });
}

/** Purchase Ledger — grouped per vendor, credit = AP up, debit = AP down. */
export async function purchaseLedger(q: LedgerQuery = {}): Promise<LedgerReportResponse> {
  const query: Record<string, string> = {};
  if (q.from) query.from = q.from;
  if (q.to)   query.to   = q.to;
  return apiJson('/api/v1/bills/ledger', { query });
}
