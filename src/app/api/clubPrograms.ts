import { apiJson, apiVoid } from './client';
import type { EmployeeRecord } from './employeeRecords';

/** V382 — club programs (HR sets up, each with a person in charge) and
 *  employees' Join Club requests, decided in the Approvals inbox
 *  (source_type 'club_request'). */
export interface ClubProgram {
  id: string;
  name: string;
  /** A Join Club subtype — sport | social | volunteer | interest | ability | other. */
  subtype: string;
  personInChargeId: string | null;
  personInChargeName: string | null;
  fee: number | null;
  expireDate: string | null;
  description: string | null;
  active: boolean;
  /** Active and not expired — takes requests today. */
  open: boolean;
  pendingCount: number;
  memberCount: number;
}

export interface ClubProgramRequest {
  name: string;
  subtype: string;
  personInChargeId?: string | null;
  fee?: number | null;
  expireDate?: string | null;
  description?: string | null;
  active?: boolean;
}

/** `open` = only programs taking requests (what employees browse). */
export async function list(open = false): Promise<ClubProgram[]> {
  return apiJson(`/api/v1/club-programs${open ? '?open=true' : ''}`);
}

export async function create(req: ClubProgramRequest): Promise<ClubProgram> {
  return apiJson('/api/v1/club-programs', { method: 'POST', json: req });
}

export async function update(id: string, req: ClubProgramRequest): Promise<ClubProgram> {
  return apiJson(`/api/v1/club-programs/${id}`, { method: 'PATCH', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/club-programs/${id}`, { method: 'DELETE' });
}

/** The signed-in employee applies to join. */
export async function requestToJoin(programId: string, role: 'member' | 'leader', note?: string): Promise<EmployeeRecord> {
  return apiJson('/api/v1/club-requests', { method: 'POST', json: { programId, role, note } });
}

/** The signed-in employee's Join Club records — requests and memberships. */
export async function mine(): Promise<EmployeeRecord[]> {
  return apiJson('/api/v1/club-requests/me');
}
