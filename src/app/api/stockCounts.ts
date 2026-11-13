/**
 * Stock Count (v-stock-count-phase1) — see docs/apps/stock-count.md.
 *
 * A count never changes stock. Approve turns each non-zero variance
 * into a stock adjustment, and that is the only call here that moves a
 * balance.
 *
 * On permissions: this system has four actions, so approving needs
 * `stock_count:create` — whoever may start a count may authorise its
 * result. Counting staff hold view + update.
 */
import { apiJson } from './client';

/** requested = waiting for someone to take it; it starts counting
 *  the moment it has an assignee. */
export type StockCountStatus = 'requested' | 'counting' | 'review' | 'approved' | 'cancelled';
export type StockCountType   = 'full' | 'cycle' | 'spot';

export const COUNT_TYPES: { value: StockCountType; label: string; hint: string }[] = [
  { value: 'full',  label: 'Full',  hint: 'Every active item in the warehouse' },
  { value: 'cycle', label: 'Cycle', hint: 'Chosen categories only' },
  { value: 'spot',  label: 'Spot',  hint: 'Hand-picked items' },
];

/** Shared with the Adjustment page's vocabulary, plus the count's own. */
export const VARIANCE_REASONS: { value: string; label: string }[] = [
  { value: 'counting_error',  label: 'Counting error' },
  { value: 'damaged',         label: 'Damaged' },
  { value: 'lost',            label: 'Lost / theft' },
  { value: 'expired',         label: 'Expired' },
  { value: 'stock_count',     label: 'Stock count' },
];

export interface StockCount {
  id: string;
  countNo: string;
  name: string;
  warehouseId: string | null;
  countType: StockCountType;
  categories: string[];
  status: StockCountStatus;
  blind: boolean;
  countDate: string;
  snapshotAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  /** Who counts. Empty = any counter. */
  assignees: Assignee[];
  /** The signed-in user is one of the assignees. */
  assignedToMe: boolean;
  createdById?: string | null;
  createdByName?: string | null;
  /** Caller created it (or is admin): assign, review, approve, cancel. */
  canManage: boolean;
  /** Caller may enter quantities and submit now. */
  canCount: boolean;
  /** Nobody has it yet and the caller may take it. */
  canClaim: boolean;
  /** One reviewer: sees the numbers, sets reasons, asks for recounts, never counts. */
  reviewerId?: string | null;
  reviewerName?: string | null;
  reviewedByMe: boolean;
  /** Caller may set reasons and ask for recounts (creator or reviewer). */
  canReview: boolean;
  /** Caller may approve: creator, or a reviewer whose role holds create. */
  canApprove: boolean;
  /** The reviewer slot is empty and the caller may take it. */
  canClaimReview: boolean;
  totalLines: number;
  countedLines: number;
  /** Lines with a variance and no reason yet. Approve refuses until 0. */
  needReason?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One line. `snapshotQty`, `expectedQty` and `variance` are **null for
 * counting staff on a blind count** — the server drops them, so the
 * screen cannot leak what it was never sent.
 */
/**
 * NOTE ON NULLS. The API runs with Jackson
 * default-property-inclusion: non_null, so a null field is omitted
 * from the JSON entirely and arrives here as undefined, not null.
 * Compare these with `== null` / `!= null`, never `===`. The types
 * below say `| null | undefined` to make that the obvious reading.
 */
export interface StockCountLine {
  id: string;
  itemId: string;
  itemName: string;
  sku: string | null;
  barcode: string | null;
  unit: string | null;
  imageUrl: string | null;
  snapshotQty?: number | null;
  /** Absent until someone counts it. 0 is a real answer: none found. */
  countedQty?: number | null;
  countedAt?: string | null;
  expectedQty?: number | null;
  variance?: number | null;
  reason: string | null;
  note: string | null;
  adjustmentId: string | null;
  /** 1 = original count, 2+ = being recounted. */
  round: number;
  /** Why a reviewer sent it back. */
  recountNote: string | null;
  /** e.g. ADJ-0007. Null until approved — the number to search for
   *  on the Movements page, which is what closes the audit loop. */
  adjustmentNo: string | null;
  /** Counter notes on this item — read them in its history. */
  notes?: number;
}

export interface Assignee { id: string; name: string; }

export interface Page<T> { content: T[]; totalElements: number; }

export const list = (params: { status?: string; warehouseId?: string; page?: number; size?: number } = {}) =>
  apiJson<Page<StockCount>>('/api/v1/stock-counts', { query: params });

export const get = (id: string) =>
  apiJson<StockCount>(`/api/v1/stock-counts/${id}`);

/** @param filter shortage | surplus | matched | counted | uncounted */
export const lines = (id: string, filter?: string) =>
  apiJson<StockCountLine[]>(`/api/v1/stock-counts/${id}/lines`, { query: { filter } });

export interface UpsertStockCount {
  name?: string;
  warehouseId?: string | null;
  countType?: StockCountType;
  categories?: string[];
  blind?: boolean;
  countDate?: string;
  notes?: string | null;
  /** On create, omitted = the warehouse's users; [] = nobody yet. */
  assigneeIds?: string[];
  /** Spot counts: the items to count. */
  itemIds?: string[];
  /** Create only: who reviews. */
  reviewerId?: string | null;
}

/** Active users whose role can count. Needs stock_count:create. */
export const assignableUsers = () =>
  apiJson<Assignee[]>('/api/v1/stock-counts/assignable-users');

/** Active users whose role can view counts. Needs stock_count:create. */
export const assignableReviewers = () =>
  apiJson<Assignee[]>('/api/v1/stock-counts/assignable-reviewers');

/** Take the empty reviewer slot. */
export const claimReview = (id: string) =>
  apiJson<StockCount>(`/api/v1/stock-counts/${id}/claim-review`, { method: 'POST' });

/** Set or clear the reviewer. Creator only. */
export const setReviewer = (id: string, userId: string | null) =>
  apiJson<StockCount>(`/api/v1/stock-counts/${id}/reviewer`, { method: 'PUT', json: { userId } });

/** Take a count nobody has yet. It starts counting at once. */
export const claim = (id: string) =>
  apiJson<StockCount>(`/api/v1/stock-counts/${id}/claim`, { method: 'POST' });

/** Change who counts. Any time before approve / cancel. */
export const assign = (id: string, userIds: string[]) =>
  apiJson<StockCount>(`/api/v1/stock-counts/${id}/assignees`, { method: 'PUT', json: { userIds } });

export const create = (body: UpsertStockCount) =>
  apiJson<StockCount>('/api/v1/stock-counts', { method: 'POST', json: body });

export const update = (id: string, body: UpsertStockCount) =>
  apiJson<StockCount>(`/api/v1/stock-counts/${id}`, { method: 'PUT', json: body });

/** Freezes the scope and takes the snapshot. `itemIds` for spot counts. */
export const start = (id: string, itemIds?: string[]) =>
  apiJson<StockCount>(`/api/v1/stock-counts/${id}/start`, { method: 'POST', json: { itemIds } });

/** Set the quantity outright, or add to it — a scan sends `{ add: 1 }`. */
export const countLine = (id: string, lineId: string, body: { qty?: number; add?: number }) =>
  apiJson<StockCountLine>(`/api/v1/stock-counts/${id}/lines/${lineId}/count`, { method: 'POST', json: body });

/** A counter's note on one item. Shows in the item's history. */
export const addNote = (id: string, lineId: string, note: string) =>
  apiJson<StockCountLine>(`/api/v1/stock-counts/${id}/lines/${lineId}/note`, { method: 'POST', json: { note } });

export const scan = (id: string, barcode: string) =>
  apiJson<StockCountLine>(`/api/v1/stock-counts/${id}/scan`, { method: 'POST', json: { barcode } });

export const submit = (id: string) =>
  apiJson<StockCount>(`/api/v1/stock-counts/${id}/submit`, { method: 'POST' });

export const setReason = (id: string, lineId: string, reason: string | null, note?: string | null) =>
  apiJson<StockCountLine>(`/api/v1/stock-counts/${id}/lines/${lineId}/reason`, {
    method: 'PUT', json: { reason, note },
  });

/** The only call here that moves stock. */
/** One entry in a line's history. Append-only on the server. */
export interface StockCountEntry {
  id: string;
  qty: number;
  resultingQty: number;
  /** 'note' = a counter's note on its own, no quantity change. */
  method: 'scan' | 'manual' | 'import' | 'note';
  round: number;
  countedById: string | null;
  countedByName: string | null;
  createdAt: string;
  note?: string | null;
}

/** Who entered what, how, and in which round. Oldest first. */
export const entries = (id: string, lineId: string) =>
  apiJson<StockCountEntry[]>(`/api/v1/stock-counts/${id}/lines/${lineId}/entries`);

/**
 * Send one line back to be counted again. The earlier answer stays in
 * the entries log — comparing the two is the point of a recount.
 */
export const recount = (id: string, lineId: string, note?: string) =>
  apiJson<StockCountLine>(`/api/v1/stock-counts/${id}/lines/${lineId}/recount`, {
    method: 'POST', json: { note },
  });

export const approve = (id: string) =>
  apiJson<StockCount>(`/api/v1/stock-counts/${id}/approve`, { method: 'POST' });

export const cancel = (id: string, reason?: string) =>
  apiJson<StockCount>(`/api/v1/stock-counts/${id}/cancel`, { method: 'POST', json: { reason } });

export const remove = (id: string) =>
  apiJson<void>(`/api/v1/stock-counts/${id}`, { method: 'DELETE' });
