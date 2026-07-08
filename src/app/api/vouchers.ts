import { apiJson, apiVoid } from './client';

/** Voucher statuses — V104 + V105 CHECK constraint:
 *  - progress: default on create, editable
 *  - done:     no-approval finalisation (read-only)
 *  - approved: assigned-approver path finalisation (read-only)
 *  - rejected: assigned-approver rejected (read-only)
 *  - void:     cancelled (read-only, audit retained)
 *  - issued:   legacy V104 state — treat as read-only equivalent of done. */
export type VoucherStatus =
  // Chain-gated intermediate — set on create when manual approvers
  // are assigned; flipped to progress on approval, rejected on
  // chain rejection. V176.
  | 'pending'
  | 'progress'
  | 'done'
  | 'approved'
  | 'rejected'
  | 'void'
  | 'issued';

/** Purpose values — V104 CHECK constraint. Frontend picker hands the
 *  user a fixed list and renders these via {@link PURPOSE_LABELS}. */
export type VoucherPurpose =
  | 'free_service'
  | 'charity'
  | 'donation'
  | 'sponsorship'
  | 'promo'
  | 'warranty';

export const PURPOSE_LABELS: Record<VoucherPurpose, string> = {
  free_service: 'Free service',
  charity:      'Charity',
  donation:     'Donation',
  sponsorship:  'Sponsorship',
  promo:        'Promotional giveaway',
  warranty:     'Warranty replacement',
};

export interface VoucherItem {
  id: string;
  stockItemId?: string | null;
  name: string;
  description?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
}

export interface Voucher {
  id: string;
  voucherNo: string;
  customerId: string;
  issueDate: string;
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  currency: string;
  exchangeRate: number;
  purpose: VoucherPurpose;
  taxType?: string | null;
  subtotal: number;
  taxAmount: number;
  /** Always "percent" on a voucher (server-locked at 100%). */
  discountType: string;
  /** Always 100 on a voucher. */
  discountValue: number;
  /** Equals subtotal — 100% off the fair value. */
  discountAmount: number;
  /** Always 0 on a voucher. */
  total: number;
  status: VoucherStatus;
  /** Assigned approver — when set, the voucher leaves progress via
   *  Approve / Reject only (no Mark Done). When null, the operator
   *  marks Done directly. */
  approverId?: string | null;
  approvedAt?: string | null;
  approvedById?: string | null;
  rejectedAt?: string | null;
  rejectedById?: string | null;
  rejectedReason?: string | null;
  notes?: string | null;
  terms?: string | null;
  items: VoucherItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface VoucherItemRequest {
  stockItemId?: string | null;
  name: string;
  description?: string | null;
  unit?: string | null;
  quantity?: number;
  unitPrice?: number;
}

export interface VoucherRequest {
  voucherNo?: string;
  customerId: string;
  issueDate?: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  currency?: string;
  exchangeRate?: number;
  purpose: VoucherPurpose;
  taxType?: string;
  taxAmount?: number;
  /** Optional approver — pick a tenant user. Backend only allows the
   *  picked user to later Approve / Reject. */
  approverId?: string | null;
  notes?: string;
  terms?: string;
  items: VoucherItemRequest[];
  /** Ordered list of chain-approver user IDs (up to 3). Distinct from
   *  the legacy per-voucher {@link approverId} — this drives the
   *  unified approval inbox (V172, Phase 3b) via
   *  {@code ApprovalService.startChainWithApprovers}. Empty / omitted
   *  means the operator chose not to route the voucher through the
   *  chain; the existing progress → done flow proceeds unchanged.
   *  Only honored on create; ignored on update. */
  approverUserIds?: string[];
}

export interface ListParams {
  status?: VoucherStatus;
  customerId?: string;
  page?: number;
  size?: number;
}

/** Spring-page response — same shape as the rest of the sale-side APIs. */
export interface PagedResponse<T> {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export async function list(params: ListParams = {}): Promise<PagedResponse<Voucher>> {
  const query: Record<string, string> = {};
  if (params.status)     query.status     = params.status;
  if (params.customerId) query.customerId = params.customerId;
  if (params.page != null) query.page = String(params.page);
  if (params.size != null) query.size = String(params.size);
  return apiJson('/api/v1/vouchers', { query });
}

export async function get(id: string): Promise<Voucher> {
  return apiJson(`/api/v1/vouchers/${id}`);
}

export async function nextNumber(): Promise<{ voucherNo: string }> {
  return apiJson('/api/v1/vouchers/next-number');
}

export async function create(req: VoucherRequest): Promise<Voucher> {
  return apiJson('/api/v1/vouchers', { method: 'POST', json: req });
}

export async function update(id: string, req: VoucherRequest): Promise<Voucher> {
  return apiJson(`/api/v1/vouchers/${id}`, { method: 'PUT', json: req });
}

export async function markDone(id: string): Promise<Voucher> {
  return apiJson(`/api/v1/vouchers/${id}/done`, { method: 'POST' });
}

export async function approve(id: string): Promise<Voucher> {
  return apiJson(`/api/v1/vouchers/${id}/approve`, { method: 'POST' });
}

export async function reject(id: string, reason?: string): Promise<Voucher> {
  return apiJson(`/api/v1/vouchers/${id}/reject`, {
    method: 'POST',
    json: { reason: reason ?? null },
  });
}

export async function voidVoucher(id: string): Promise<Voucher> {
  return apiJson(`/api/v1/vouchers/${id}/void`, { method: 'POST' });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/vouchers/${id}`, { method: 'DELETE' });
}
