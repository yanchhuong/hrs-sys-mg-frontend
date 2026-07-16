import { apiJson } from './client';

/* ================================================================
 * v-commission-mvp — settings CRUD for sales-commission plans.
 * Mirrors the loyalty settings shape so the FE can share the same
 * list + upsert-dialog pattern.
 * ================================================================ */

export type CommissionType   = 'PER_INVOICE' | 'PER_ITEM' | 'TIERED';
export type CommissionStatus = 'ACTIVE' | 'INACTIVE';
export type CommissionMode   = 'PERCENT' | 'FIXED';

export interface CommissionProgram {
  id: string;
  name: string;
  type: CommissionType;
  status: CommissionStatus;
  /** V244 — percent (5 = 5%) or fixed amount, depending on `mode`. */
  rate: number | null;
  mode: CommissionMode | null;
  /** V244 — user UUIDs the plan applies to. Empty = plan is global
   *  (applies to every seller on the tenant). */
  assignedUserIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCommissionProgram {
  name: string;
  type: CommissionType;
  status?: CommissionStatus;
  rate?: number | null;
  mode?: CommissionMode | null;
  assignedUserIds?: string[] | null;
}

export const commission = {
  list:   () => apiJson<CommissionProgram[]>('/api/v1/commission/programs'),
  get:    (id: string) => apiJson<CommissionProgram>(`/api/v1/commission/programs/${id}`),
  create: (req: UpsertCommissionProgram) =>
    apiJson<CommissionProgram>('/api/v1/commission/programs', { method: 'POST', json: req }),
  update: (id: string, req: UpsertCommissionProgram) =>
    apiJson<CommissionProgram>(`/api/v1/commission/programs/${id}`, { method: 'PATCH', json: req }),
  remove: (id: string) =>
    apiJson<void>(`/api/v1/commission/programs/${id}`, { method: 'DELETE' }),
};

/**
 * Compute the commission earned by a seller against a running
 * sales total. Returns 0 when no plan applies.
 *
 * v-commission-mvp math (kept simple until the follow-up):
 *  - PERCENT + PER_INVOICE / PER_ITEM: rate% × totalSales
 *  - FIXED   + PER_INVOICE: rate × invoiceCount
 *  - FIXED   + PER_ITEM:    rate × itemCount (falls back to invoiceCount
 *                                             when itemCount is unknown)
 *  - TIERED: not yet supported (returns 0)
 *
 * A plan applies to a seller when either its `assignedUserIds` is
 * empty (global) or contains the seller's user id.
 */
export function commissionFor(
  sellerId: string,
  totalSales: number,
  invoiceCount: number,
  plans: CommissionProgram[],
  itemCount?: number,
): { amount: number; plan: CommissionProgram | null } {
  const active = plans.filter(
    p => p.status === 'ACTIVE'
      && (p.assignedUserIds.length === 0 || p.assignedUserIds.includes(sellerId)),
  );
  if (active.length === 0) return { amount: 0, plan: null };
  let best: { amount: number; plan: CommissionProgram } | null = null;
  for (const p of active) {
    const rate = p.rate ?? 0;
    if (!rate) continue;
    let amount = 0;
    if (p.mode === 'PERCENT' && (p.type === 'PER_INVOICE' || p.type === 'PER_ITEM')) {
      amount = totalSales * (rate / 100);
    } else if (p.mode === 'FIXED' && p.type === 'PER_INVOICE') {
      amount = rate * invoiceCount;
    } else if (p.mode === 'FIXED' && p.type === 'PER_ITEM') {
      amount = rate * (itemCount ?? invoiceCount);
    }
    if (!best || amount > best.amount) best = { amount, plan: p };
  }
  return best ?? { amount: 0, plan: active[0] };
}
