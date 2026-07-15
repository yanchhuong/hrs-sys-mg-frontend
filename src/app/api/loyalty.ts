import { apiJson } from './client';

/* ================================================================
 * v-loyalty-mvp — settings CRUD + POS earn/redeem client.
 * ================================================================ */

export type LoyaltyType = 'POINT' | 'STAMP' | 'BIRTHDAY';
export type RewardType = 'FREE_ITEM' | 'DISCOUNT' | 'POINT' | 'COUPON';

export interface LoyaltyProgram {
  id: string;
  name: string;
  type: LoyaltyType;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  rewardType: RewardType | null;
  buyQuantity: number | null;
  rewardQuantity: number | null;
  /** v-loyalty-multi-reward-items — list of qualifying stock_items
   *  UUIDs. Any one earns a stamp (STAMP) or fulfils the free item
   *  (BIRTHDAY). Empty = rule off. */
  rewardItemIds: string[];
  earnPointPerAmount: number | null;
  earnPointPerItem: number | null;
  redeemPointCost: number | null;
  redeemDiscountAmount: number | null;
  minimumAmount: number | null;
  expireDays: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertLoyaltyProgram {
  name: string;
  type: LoyaltyType;
  active?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  rewardType?: RewardType | null;
  buyQuantity?: number | null;
  rewardQuantity?: number | null;
  rewardItemIds?: string[] | null;
  earnPointPerAmount?: number | null;
  earnPointPerItem?: number | null;
  redeemPointCost?: number | null;
  redeemDiscountAmount?: number | null;
  minimumAmount?: number | null;
  expireDays?: number | null;
}

export const loyalty = {
  list: () => apiJson<LoyaltyProgram[]>('/api/v1/loyalty/programs'),
  get:  (id: string) => apiJson<LoyaltyProgram>(`/api/v1/loyalty/programs/${id}`),
  create: (req: UpsertLoyaltyProgram) =>
    apiJson<LoyaltyProgram>('/api/v1/loyalty/programs', { method: 'POST', json: req }),
  update: (id: string, req: UpsertLoyaltyProgram) =>
    apiJson<LoyaltyProgram>(`/api/v1/loyalty/programs/${id}`, { method: 'PATCH', json: req }),
  remove: (id: string) =>
    apiJson<void>(`/api/v1/loyalty/programs/${id}`, { method: 'DELETE' }),
};

/* -------------------- POS earn / redeem -------------------- */

export interface EarnLine {
  programId: string;
  programName: string;
  programType: LoyaltyType;
  pointsEarned: number;
  stampsEarned: number;
  note: string | null;
}
export interface EarnSummary { lines: EarnLine[]; }

export interface LoyaltyReward {
  kind: 'discount' | 'free_item';
  pointCost: number | null;
  discountAmount: number | null;
  rewardItemIds: string[];
  label: string;
}

export interface ProgramState {
  programId: string;
  programName: string;
  programType: LoyaltyType;
  currentPoint: number;
  currentStamp: number;
  stampTarget: number | null;
  rewards: LoyaltyReward[];
}

export interface CustomerLoyaltyState {
  customerId: string;
  programs: ProgramState[];
}

export interface RedeemResult {
  programId: string;
  discountAmount: number;
  remainingPoint: number;
  remainingStamp: number;
}

/** Compact per-customer loyalty snapshot for the POS picker chip. */
export interface CustomerBalanceSummary {
  customerId: string;
  currentPoint: number;
  currentStamp: number;
}

export const loyaltyPos = {
  /** Fire-and-forget after a POS invoice save. Wrap the caller in
   *  try/catch so a loyalty hiccup never blocks a sale. */
  earn: (invoiceId: string) =>
    apiJson<EarnSummary>(`/api/v1/loyalty/pos/invoices/${invoiceId}/earn`, { method: 'POST' }),
  state: (customerId: string) =>
    apiJson<CustomerLoyaltyState>(`/api/v1/loyalty/pos/customers/${customerId}/state`),
  applyReward: (customerId: string, programId: string) =>
    apiJson<RedeemResult>(`/api/v1/loyalty/pos/customers/${customerId}/programs/${programId}/apply-reward`, {
      method: 'POST',
    }),
  /** Bulk snapshot — one row per customer with any balance. */
  balances: () =>
    apiJson<CustomerBalanceSummary[]>('/api/v1/loyalty/pos/balances'),
};
