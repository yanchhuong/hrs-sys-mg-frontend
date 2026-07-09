import { apiJson, apiVoid } from './client';

export type CustomerType = 'individual' | 'business';

/** Business sub-classification (V109). Only meaningful when
 *  type='business'; drives TIN visibility / required-ness. */
export type BusinessSubType = 'non_taxable' | 'taxable' | 'oversee';

/** V202 / v-patients-sex — patient sex enum. */
export type PatientSex = 'male' | 'female' | 'other';

export interface Customer {
  id: string;
  type: CustomerType;
  /** Individual: person name. Business: company name. */
  name: string;
  phone?: string | null;
  address?: string | null;
  /** National ID (individuals) or business reg id (businesses). */
  cid?: string | null;
  email?: string | null;
  /** Tax Identification Number — present only on taxable businesses. */
  tin?: string | null;
  representative?: string | null;
  site?: string | null;
  /** Business sub-type. Null for individuals. */
  businessType?: BusinessSubType | null;
  /** V187 — patient birth date (ISO yyyy-mm-dd). Only the Patients
   *  lens populates this; Sale > Customer leaves it null. */
  birthDate?: string | null;
  /** V202 / v-patients-sex — male / female / other. Null on
   *  non-clinical rows. */
  sex?: PatientSex | null;
  /** V187 — free-text insurance provider / policy. */
  insurance?: string | null;
  /** V188 — height in centimetres (server returns as decimal number
   *  via JSON; e.g. 173.5). */
  heightCm?: number | null;
  /** V188 — weight in kilograms. Age is derived on the FE from
   *  {@link #birthDate}, so no separate field. */
  weightKg?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerRequest {
  type: CustomerType;
  name: string;
  phone?: string;
  address?: string;
  cid?: string;
  email?: string;
  /** Required when type='business' AND businessType='taxable'. */
  tin?: string;
  representative?: string;
  site?: string;
  /** Required when type='business'. */
  businessType?: BusinessSubType;
  /** V187 — patient DOB, ISO yyyy-mm-dd. */
  birthDate?: string | null;
  /** V202 / v-patients-sex — patient sex. */
  sex?: PatientSex | null;
  /** V187 — free-text insurance info. */
  insurance?: string | null;
  /** V188 — height in cm. */
  heightCm?: number | null;
  /** V188 — weight in kg. */
  weightKg?: number | null;
}

export interface ListParams {
  q?: string;
  type?: CustomerType | '';
  page?: number;
  size?: number;
}

export interface PagedResponse<T> {
  /** Spring-page response uses `content` for the rows. */
  content: T[];
  number: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

export async function list(params: ListParams = {}): Promise<PagedResponse<Customer>> {
  const q: Record<string, string | number> = {};
  if (params.q) q.q = params.q;
  if (params.type) q.type = params.type;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  return apiJson('/api/v1/customers', { query: q });
}

export async function get(id: string): Promise<Customer> {
  return apiJson(`/api/v1/customers/${id}`);
}

export async function create(req: CustomerRequest): Promise<Customer> {
  return apiJson('/api/v1/customers', { method: 'POST', json: req });
}

export async function update(id: string, req: CustomerRequest): Promise<Customer> {
  return apiJson(`/api/v1/customers/${id}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/customers/${id}`, { method: 'DELETE' });
}
