import { apiJson, apiVoid } from './client';

export interface Position {
  id: string;
  name: string;
  description?: string | null;
  /** Backend UUID of the owning department. null = unassigned / cross-dept. */
  departmentId?: string | null;
  createdAt?: string;
}

export interface CreatePositionRequest {
  name: string;
  description?: string;
  /** Pass the department's UUID, or null for unassigned. */
  departmentId?: string | null;
}

export async function list(): Promise<Position[]> {
  return apiJson<Position[]>('/api/v1/positions');
}

export async function create(req: CreatePositionRequest): Promise<Position> {
  return apiJson<Position>('/api/v1/positions', { method: 'POST', json: req });
}

export async function update(id: string, req: CreatePositionRequest): Promise<Position> {
  // Backend uses PATCH (partial update), not PUT.
  return apiJson<Position>(`/api/v1/positions/${id}`, { method: 'PATCH', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/positions/${id}`, { method: 'DELETE' });
}
