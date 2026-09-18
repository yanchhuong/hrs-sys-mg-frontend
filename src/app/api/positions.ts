import { apiJson, apiVoid } from './client';

export interface Position {
  id: string;
  name: string;
  description?: string | null;
  /** Backend UUID of the owning department. null = unassigned / cross-dept. */
  departmentId?: string | null;
  /**
   * Org rank. 0 is the HIGHEST / most senior level; larger numbers are more
   * junior. null = "not ranked yet", which is NOT the same as 0 — unranked
   * positions sort to the bottom of the list, never the top.
   * Unrelated to `employees.level` (the Labour-Law skill classification).
   */
  level?: number | null;
  createdAt?: string;
}

export interface CreatePositionRequest {
  name: string;
  description?: string;
  /** Pass the department's UUID, or null for unassigned. */
  departmentId?: string | null;
  /**
   * Org rank, 0 = highest / most senior, valid range 0–99. Send null to clear
   * the rank ("not ranked yet"); sending 0 instead would declare the position
   * the most senior in the company, so the two must never be conflated.
   */
  level?: number | null;
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
