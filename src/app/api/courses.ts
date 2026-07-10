import { apiJson, apiVoid } from './client';

/**
 * V213 / v-course-schedule-model — Course = curriculum. Lives in
 * its own `courses` table, separate from stock_items. The enrollable
 * unit is a Course Schedule (see courseSchedules.ts).
 */
export interface Course {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CourseRequest {
  name: string;
  code?: string | null;
  description?: string | null;
  active?: boolean;
}

export interface ListParams {
  q?: string;
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

export async function list(params: ListParams = {}): Promise<PagedResponse<Course>> {
  const q: Record<string, string | number> = {};
  if (params.q) q.q = params.q;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  return apiJson('/api/v1/courses', { query: q });
}

export async function get(id: string): Promise<Course> {
  return apiJson(`/api/v1/courses/${id}`);
}

export async function create(req: CourseRequest): Promise<Course> {
  return apiJson('/api/v1/courses', { method: 'POST', json: req });
}

export async function update(id: string, req: CourseRequest): Promise<Course> {
  return apiJson(`/api/v1/courses/${id}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/courses/${id}`, { method: 'DELETE' });
}
