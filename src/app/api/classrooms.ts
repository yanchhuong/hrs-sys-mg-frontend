import { apiJson, apiVoid } from './client';
import type { PagedResponse } from './courses';

/**
 * V213 / v-course-schedule-model — Classroom = physical room. Lives
 * in its own `classrooms` table.
 */
export interface Classroom {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClassroomRequest {
  name: string;
  description?: string | null;
  active?: boolean;
}

export interface ListParams {
  q?: string;
  page?: number;
  size?: number;
}

export async function list(params: ListParams = {}): Promise<PagedResponse<Classroom>> {
  const q: Record<string, string | number> = {};
  if (params.q) q.q = params.q;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  return apiJson('/api/v1/classrooms', { query: q });
}

export async function get(id: string): Promise<Classroom> {
  return apiJson(`/api/v1/classrooms/${id}`);
}

export async function create(req: ClassroomRequest): Promise<Classroom> {
  return apiJson('/api/v1/classrooms', { method: 'POST', json: req });
}

export async function update(id: string, req: ClassroomRequest): Promise<Classroom> {
  return apiJson(`/api/v1/classrooms/${id}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/classrooms/${id}`, { method: 'DELETE' });
}
