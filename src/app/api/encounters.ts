import { apiJson, apiVoid } from './client';
import type { Invoice } from './invoices';

/** Encounter statuses — server-side V182 CHECK constraint:
 *  - pending:  chain approvers assigned, waiting on their decision
 *  - progress: editable, awaiting billing
 *  - done:     converted to Medical Bill (read-only)
 *  - close:    manually closed without conversion (read-only)
 *  - void:     retracted visit (read-only) */
export type EncounterStatus = 'pending' | 'progress' | 'done' | 'close' | 'void';

export interface EncounterItem {
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

export interface Encounter {
  id: string;
  encounterNo: string;
  /** Patient = filtered Customer; this ID FKs to customers(id). */
  patientId: string;
  doctorId?: string | null;
  encounterDate: string;
  status: EncounterStatus;
  /** Set when the encounter has been converted to a Medical Bill —
   *  the UI uses this to swap the Convert button for a "Billed →
   *  MED-XXX" link and lock the row read-only. */
  convertedInvoiceId?: string | null;
  currency: string;
  exchangeRate: number;
  subtotal: number;
  total: number;
  notes?: string | null;
  reason?: string | null;
  items: EncounterItem[];
  createdAt?: string;
  updatedAt?: string;
  /** Creator's user id — resolves to an email/name via the users list
   *  on the FE. Powers the Author column on the Encounters list. */
  createdById?: string | null;
}

export interface EncounterItemRequest {
  stockItemId?: string | null;
  name: string;
  description?: string | null;
  unit?: string | null;
  quantity?: number;
  unitPrice?: number;
}

export interface EncounterRequest {
  encounterNo?: string;
  patientId: string;
  doctorId?: string | null;
  encounterDate?: string;
  currency?: string;
  exchangeRate?: number;
  notes?: string | null;
  reason?: string | null;
  items: EncounterItemRequest[];
  /** Ordered list of chain-approver user IDs — optional. When set,
   *  the backend spawns a chain via ApprovalService.startChainWithApprovers.
   *  Empty / omitted means no gating. Only honored on create;
   *  ignored on update. */
  approverUserIds?: string[];
}

export interface ListParams {
  status?: EncounterStatus;
  patientId?: string;
  page?: number;
  size?: number;
}

export interface PagedResponse<T> {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export async function list(params: ListParams = {}): Promise<PagedResponse<Encounter>> {
  const query: Record<string, string> = {};
  if (params.status)    query.status    = params.status;
  if (params.patientId) query.patientId = params.patientId;
  if (params.page != null) query.page = String(params.page);
  if (params.size != null) query.size = String(params.size);
  return apiJson('/api/v1/encounters', { query });
}

export async function get(id: string): Promise<Encounter> {
  return apiJson(`/api/v1/encounters/${id}`);
}

export async function nextNumber(): Promise<{ encounterNo: string }> {
  return apiJson('/api/v1/encounters/next-number');
}

export async function create(req: EncounterRequest): Promise<Encounter> {
  return apiJson('/api/v1/encounters', { method: 'POST', json: req });
}

export async function update(id: string, req: EncounterRequest): Promise<Encounter> {
  return apiJson(`/api/v1/encounters/${id}`, { method: 'PUT', json: req });
}

export async function close(id: string): Promise<Encounter> {
  return apiJson(`/api/v1/encounters/${id}/close`, { method: 'POST' });
}

/** Spawns a Medical Bill (sale_invoices row with kind='medical') from
 *  the encounter. Returns the new invoice; the source encounter
 *  transitions to {@code done}. */
export async function convertToInvoice(id: string): Promise<Invoice> {
  return apiJson(`/api/v1/encounters/${id}/convert-to-invoice`, { method: 'POST' });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/encounters/${id}`, { method: 'DELETE' });
}
