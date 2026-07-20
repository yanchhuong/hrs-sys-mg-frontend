import { apiJson, apiVoid } from './client';

/**
 * Per-tenant catalogue of "what a plan is about" — Room / Utility /
 * Car for rentals, House / Condo / Flat for installments, etc.
 * Populated from the Payment Plans settings dialog; consumed by the
 * New-Plan form as a plan-type-filtered picker.
 */

export type PaymentPlanItemType = 'installment' | 'rental' | 'loan' | 'tuition' | 'custom';

export interface PaymentPlanItem {
  id: string;
  name: string;
  planType: PaymentPlanItemType;
  description?: string | null;
  /** Unit price (V262). Required by the FE for installment / rental
   *  items; nullable across the board on the BE. Picking an item on
   *  the New-Plan form auto-fills Total Amount from this value. */
  price?: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPaymentPlanItem {
  name: string;
  planType: PaymentPlanItemType;
  description?: string | null;
  price?: number | null;
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
