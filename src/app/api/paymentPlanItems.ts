import { apiJson, apiVoid } from './client';

/**
 * Per-tenant catalogue of "what a plan is about" — Room / Utility /
 * Car for rentals, House / Condo / Flat for installments, etc.
 * Populated from the Payment Plans settings dialog; consumed by the
 * New-Plan form as a plan-type-filtered picker.
 */

export type PaymentPlanItemType = 'installment' | 'rental' | 'loan' | 'tuition' | 'custom';

/** V286: coarse classifier surfaced as a Select on the Edit dialog
 *  and used for grouping on the New-Plan picker. Extending the union
 *  is a string add on the BE (CHECK constraint) — no schema change. */
export type PaymentPlanItemCategory =
  | 'vehicle' | 'house' | 'electronic' | 'compliance'
  | 'jewelry' | 'land' | 'accommodation' | 'entertainment'
  | 'transportation' | 'others';

/** V286: label + Lucide-icon lookup for each category. Ordered the
 *  way the Select renders them (heavy assets first, catch-all last). */
export const PAYMENT_PLAN_ITEM_CATEGORIES: {
  value: PaymentPlanItemCategory;
  label: string;
}[] = [
  { value: 'house',          label: 'House' },
  { value: 'land',           label: 'Land' },
  { value: 'accommodation',  label: 'Accommodation' },
  { value: 'vehicle',        label: 'Vehicle' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'entertainment',  label: 'Entertainment' },
  { value: 'electronic',     label: 'Electronic' },
  { value: 'jewelry',        label: 'Jewelry' },
  { value: 'compliance',     label: 'Compliance' },
  { value: 'others',         label: 'Others' },
];

/** V286: how a parent surfaces its child options on the picker. */
export type PaymentPlanItemSelectMode = 'single' | 'multi';

/** V286: leaf under a parent — Room 101 under House B2, Trim SE
 *  under Toyota Camry. Options carry their own price; Total on the
 *  New-Plan form sums picked options. */
export interface PaymentPlanItemOption {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  imageUrl?: string | null;
  active: boolean;
  sortOrder: number;
  /** V299 — 0-indexed grid position for the cinema seat-map editor.
   *  Both null means "unplaced" and the renderer falls back to
   *  name-parsing. Both non-null pins the seat to that cell. */
  gridRow?: number | null;
  gridCol?: number | null;
}

export interface UpsertPaymentPlanItemOption {
  /** Present on rows loaded from the BE; absent on newly-added
   *  rows so the BE inserts instead of matching. */
  id?: string;
  name: string;
  description?: string | null;
  price?: number | null;
  imageUrl?: string | null;
  active?: boolean;
  sortOrder?: number;
  /** V299 — grid position pair. Send both to place a seat, both null
   *  to leave it unplaced. */
  gridRow?: number | null;
  gridCol?: number | null;
}

/** V298 — optional group layer between a Property and its options.
 *  A property can hold many groups, each with its own child options.
 *  Options may also stay UNGROUPED (they render above the groups
 *  on the picker), so introducing groups is fully backward-compatible. */
export interface PaymentPlanItemOptionGroup {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  sortOrder: number;
  options: PaymentPlanItemOption[];
}

export interface UpsertPaymentPlanItemOptionGroup {
  id?: string;
  name: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
  /** Group's child options. The BE infers each nested option's
   *  groupId from its enclosing group, so callers don't set it. */
  options?: UpsertPaymentPlanItemOption[];
}

export interface PaymentPlanItem {
  id: string;
  name: string;
  planType: PaymentPlanItemType;
  description?: string | null;
  /** Unit price (V262). Required by the FE for installment / rental
   *  items; nullable across the board on the BE. Picking an item on
   *  the New-Plan form auto-fills Total Amount from this value. */
  price?: number | null;
  /** Optional cover image (V285). Compressed base64 data URL. */
  imageUrl?: string | null;
  /** V286: coarse classifier — see PAYMENT_PLAN_ITEM_CATEGORIES. */
  category: PaymentPlanItemCategory;
  /** V286: how child options are surfaced (radio vs checkbox). */
  selectMode: PaymentPlanItemSelectMode;
  /** UNGROUPED child options only (V286 + V298). Options that belong
   *  to a group ride inside {@link optionGroups}. Empty on both means
   *  the parent is a plain leaf. */
  options: PaymentPlanItemOption[];
  /** V298 — property groups, each with its own children. Empty when
   *  the property has no groups. */
  optionGroups: PaymentPlanItemOptionGroup[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPaymentPlanItem {
  name: string;
  planType: PaymentPlanItemType;
  description?: string | null;
  price?: number | null;
  /** Optional cover image (V285). Send a compressed base64 data URL
   *  to set/change, an empty string to clear, or omit to leave the
   *  existing value untouched on a PATCH. */
  imageUrl?: string | null;
  /** V286: defaults to 'others' server-side when omitted. */
  category?: PaymentPlanItemCategory;
  /** V286: defaults to 'single' server-side when omitted. */
  selectMode?: PaymentPlanItemSelectMode;
  /** V286: full replacement list of UNGROUPED options. Omit to leave
   *  ungrouped options unchanged on a PATCH; send an empty array to
   *  clear them. */
  options?: UpsertPaymentPlanItemOption[];
  /** V298: full replacement list of groups (each with its nested
   *  option children). Omit to leave groups unchanged on a PATCH;
   *  send an empty array to remove every group (their children are
   *  deleted unless re-listed under `options` as ungrouped). */
  optionGroups?: UpsertPaymentPlanItemOptionGroup[];
  active?: boolean;
}

/** All items for the tenant (optionally filtered by plan type). */
export function list(planType?: PaymentPlanItemType): Promise<PaymentPlanItem[]> {
  return apiJson<PaymentPlanItem[]>('/api/v1/payment-plan-items', {
    query: planType ? { planType } : {},
  });
}

export function create(req: UpsertPaymentPlanItem): Promise<PaymentPlanItem> {
  return apiJson<PaymentPlanItem>('/api/v1/payment-plan-items', {
    method: 'POST', json: req,
  });
}

export function update(id: string, req: UpsertPaymentPlanItem): Promise<PaymentPlanItem> {
  return apiJson<PaymentPlanItem>(`/api/v1/payment-plan-items/${id}`, {
    method: 'PATCH', json: req,
  });
}

export function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/payment-plan-items/${id}`, { method: 'DELETE' });
}
