import { apiJson, apiVoid } from './client';

/**
 * Branch — a hospital tenant's physical clinic location (V192 /
 * v-encounter-branch-list). Multiple branches per tenant. Logo is
 * NOT stored on the branch yet — it stays tenant-global for now
 * (opted into per-branch in a future v-encounter-branch-logo).
 */
export interface Branch {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  /** V193 — exactly one branch per tenant carries this flag.
   *  Used by the Encounter print header to know which identity to
   *  render as the centered letterhead. */
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface BranchRequest {
  name: string;
  phone?: string | null;
  address?: string | null;
  isDefault?: boolean;
}

export async function list(): Promise<Branch[]> {
  return apiJson('/api/v1/branches');
}

export async function create(req: BranchRequest): Promise<Branch> {
  return apiJson('/api/v1/branches', { method: 'POST', json: req });
}

export async function update(id: string, req: BranchRequest): Promise<Branch> {
  return apiJson(`/api/v1/branches/${id}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/branches/${id}`, { method: 'DELETE' });
}
