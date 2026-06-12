import { apiJson, apiVoid } from './client';

/** V98 status set — Progress (outstanding) → Paid (fully settled),
 *  with Void as the cancellation terminal. The legacy 'draft' /
 *  'issued' values still appear in unmigrated test data and the
 *  frontend collapses them to 'progress' for display. */
export type ReceiptStatus = 'progress' | 'paid' | 'void' | 'draft' | 'issued';
export type SupplierType = 'taxable_person' | 'non_taxable' | 'non_resident';
/** Datakeys match the upstream WHT pattern reference HTML — easier
 *  to align with any external taxonomy that ships the same code
 *  catalogue. */
export type ReceiptTaxType = '11' | '15' | '16' | '20';

/** Hard-coded WHT pattern matrix — mirrors the backend
 *  {@code ReceiptService.TAX_RATES}. UI uses this for both the
 *  dropdown labels and the inline @rate% hint. */
export const RECEIPT_TAX_TYPES: ReadonlyArray<{
  key: ReceiptTaxType;
  label: string;
  rate: number;
}> = [
  { key: '11', label: 'WHT Tax on Service 15%',                                       rate: 15 },
  { key: '15', label: 'WHT Tax on Rental (Physical Person) 10%',                      rate: 10 },
  { key: '16', label: 'WHT Tax on Rental (Legal Person) 10%',                         rate: 10 },
  { key: '20', label: 'WHT on non-resident (Management fee, Technical Service) 14%',  rate: 14 },
];
export const RECEIPT_TAX_TYPE_BY_KEY: Record<string, typeof RECEIPT_TAX_TYPES[number]> =
  RECEIPT_TAX_TYPES.reduce((acc, t) => ({ ...acc, [t.key]: t }), {});

export const SUPPLIER_TYPES: ReadonlyArray<{ key: SupplierType; label: string }> = [
  { key: 'taxable_person', label: 'Taxable Person' },
  { key: 'non_taxable',    label: 'Non-Taxable Person' },
  { key: 'non_resident',   label: 'Non-Resident' },
];

export interface Receipt {
  id: string;
  receiptNo: string;
  vendorId: string;
  issueDate: string;
  supplierType: SupplierType;
  taxId?: string | null;
  currency: string;
  exchangeRate: number;
  amount: number;
  taxType?: ReceiptTaxType | null;
  taxAmount: number;
  /** Signed-sum of payments. UI displays as the Paid column on the
   *  ledger strip; Remain = amount − |paidAmount|. */
  paidAmount: number;
  notes?: string | null;
  status: ReceiptStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReceiptRequest {
  receiptNo?: string;
  vendorId: string;
  issueDate?: string;
  supplierType?: SupplierType;
  taxId?: string;
  currency?: string;
  exchangeRate?: number;
  amount?: number;
  taxType?: ReceiptTaxType | '';
  taxAmount?: number;
  notes?: string;
}

export interface ListParams {
  vendorId?: string;
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

export async function list(params: ListParams = {}): Promise<PagedResponse<Receipt>> {
  const q: Record<string, string | number> = {};
  if (params.vendorId) q.vendorId = params.vendorId;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  return apiJson('/api/v1/receipts', { query: q });
}

export async function get(id: string): Promise<Receipt> {
  return apiJson(`/api/v1/receipts/${id}`);
}

export async function nextNumber(): Promise<{ receiptNo: string }> {
  return apiJson('/api/v1/receipts/next-number');
}

export async function create(req: ReceiptRequest): Promise<Receipt> {
  return apiJson('/api/v1/receipts', { method: 'POST', json: req });
}

export async function update(id: string, req: ReceiptRequest): Promise<Receipt> {
  return apiJson(`/api/v1/receipts/${id}`, { method: 'PUT', json: req });
}

export async function issue(id: string): Promise<Receipt> {
  return apiJson(`/api/v1/receipts/${id}/issue`, { method: 'POST' });
}

export async function voidReceipt(id: string): Promise<Receipt> {
  return apiJson(`/api/v1/receipts/${id}/void`, { method: 'POST' });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/receipts/${id}`, { method: 'DELETE' });
}
