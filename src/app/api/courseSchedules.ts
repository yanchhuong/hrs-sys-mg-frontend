import { apiJson, apiVoid } from './client';
import type { PagedResponse } from './courses';

/**
 * V213 / v-course-schedule-model — the enrollable teaching session.
 * Combines a Course + Classroom + Teacher (Employee) + weekly
 * learn-time slots + date window + capacity + tuition fee.
 */
export interface LearnTime {
  /** Present on read; omit when the FE sends a replace-all list. */
  id?: string;
  /** ISO day-of-week: 1 = Mon .. 7 = Sun. */
  dayOfWeek: number;
  /** "HH:mm" or "HH:mm:ss" on the wire. */
  fromTime: string;
  toTime: string;
}

export interface CourseSchedule {
  id: string;
  courseId: string;
  classroomId: string;
  teacherId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  capacity?: number | null;
  unitPrice: number;
  name?: string | null;
  description?: string | null;
  active: boolean;
  learnTimes: LearnTime[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CourseScheduleRequest {
  courseId: string;
  classroomId: string;
  teacherId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  capacity?: number | null;
  unitPrice?: number;
  name?: string | null;
  description?: string | null;
  active?: boolean;
  /** Replace-all on non-null; leave existing alone on undefined. */
  learnTimes?: LearnTime[];
}

export interface ListParams {
  q?: string;
  page?: number;
  size?: number;
}

export async function list(params: ListParams = {}): Promise<PagedResponse<CourseSchedule>> {
  const q: Record<string, string | number> = {};
  if (params.q) q.q = params.q;
  if (params.page !== undefined) q.page = params.page;
  if (params.size !== undefined) q.size = params.size;
  return apiJson('/api/v1/course-schedules', { query: q });
}

export async function get(id: string): Promise<CourseSchedule> {
  return apiJson(`/api/v1/course-schedules/${id}`);
}

export async function create(req: CourseScheduleRequest): Promise<CourseSchedule> {
  return apiJson('/api/v1/course-schedules', { method: 'POST', json: req });
}

export async function update(id: string, req: CourseScheduleRequest): Promise<CourseSchedule> {
  return apiJson(`/api/v1/course-schedules/${id}`, { method: 'PUT', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/course-schedules/${id}`, { method: 'DELETE' });
}
