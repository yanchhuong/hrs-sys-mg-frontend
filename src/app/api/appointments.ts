import { apiJson, apiVoid } from './client';

/** Waiting-room appointment (V194 / v-hospital-appointments).
 *  Sits between "Cashier creates Encounter" and "Doctor opens
 *  Encounter" — patient gets a queue-number ticket and waits until
 *  the doctor calls it. */
export type AppointmentStatus = 'waiting' | 'in_progress' | 'completed' | 'cancelled';

/** V197 — clinical line the doctor documents on the appointment.
 *  Two categories only: {@code medicine} (Prescription section) and
 *  {@code lab} (Lab Orders section). No unit price / line total —
 *  the appointment is clinical documentation, not billing. */
export type AppointmentItemCategory = 'medicine' | 'lab';

export interface AppointmentItem {
  id: string;
  category: AppointmentItemCategory;
  name: string;
  description?: string | null;
  quantity: number;
  sortOrder: number;
}

export interface AppointmentItemRequest {
  category: AppointmentItemCategory;
  name: string;
  description?: string | null;
  quantity: number;
}

export interface Appointment {
  id: string;
  /** V195 — nullable. An advance appointment can be booked before
   *  an encounter exists (e.g. reception schedules a follow-up
   *  without creating the encounter yet). */
  encounterId?: string | null;
  patientId?: string | null;
  doctorId?: string | null;
  scheduledAt?: string | null;
  queueNo: number;
  status: AppointmentStatus;
  notes?: string | null;
  /** V195 — reception's pre-visit note to the doctor. */
  cashierNote?: string | null;
  /** V195 — doctor's diagnosis on this visit. Copied to the
   *  linked encounter's diagnosis field on Complete. */
  diagnosis?: string | null;
  /** V197 — doctor's Prescription + Lab Order lines. Populated
   *  by the list/get read; empty array when the doctor hasn't
   *  documented anything yet. */
  items?: AppointmentItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AppointmentRequest {
  encounterId?: string | null;
  patientId?: string | null;
  doctorId?: string | null;
  scheduledAt?: string | null;
  notes?: string | null;
  cashierNote?: string | null;
  diagnosis?: string | null;
  /** V197 — supplying an explicit list REPLACES the current
   *  items (add / remove / reorder in one shot). Leave undefined
   *  to keep the existing set intact under patch semantics. */
  items?: AppointmentItemRequest[];
  status?: AppointmentStatus;
}

export async function list(): Promise<Appointment[]> {
  return apiJson('/api/v1/appointments');
}

export async function create(req: AppointmentRequest): Promise<Appointment> {
  return apiJson('/api/v1/appointments', { method: 'POST', json: req });
}

export async function update(id: string, req: AppointmentRequest): Promise<Appointment> {
  return apiJson(`/api/v1/appointments/${id}`, { method: 'PUT', json: req });
}

/** Minimal-payload status transition — used by Start / Complete /
 *  Cancel buttons on the queue view. */
export async function transition(id: string, status: AppointmentStatus): Promise<Appointment> {
  return apiJson(`/api/v1/appointments/${id}/status`, { method: 'PATCH', json: { status } });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/appointments/${id}`, { method: 'DELETE' });
}
