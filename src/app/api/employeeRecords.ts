import { apiJson, apiVoid } from './client';

/** V378 — Employee Records: Accident (a case) and Join Club / Promoted /
 *  Welfare / Ceremony (activities). See common/employeeRecordTypes.ts
 *  for each type's subtypes, statuses and detail fields. */
export type RecordType = 'accident' | 'club' | 'promoted' | 'welfare' | 'ceremony' | 'sick';

export interface EmployeeRecord {
  id: string;
  employeeId: string;
  employeeName: string | null;
  empNo: string | null;
  recordType: RecordType;
  subtype: string;
  recordDate: string;
  status: string;
  amount: number | null;
  /** Per-type fields — keys are listed in employeeRecordTypes.ts. */
  details: Record<string, unknown>;
  notes: string | null;
  /** 'auto' = a Promoted row made by a position / department change;
   *  'leave' = made by approving a sick / accident / ceremony leave (V381). */
  source: 'manual' | 'auto' | 'leave' | 'request';
  leaveRequestId: string | null;
  /** V382 — the club program a Join Club request is for (source = request). */
  programId: string | null;
  /** True when an Accident's medical fields were withheld from this viewer. */
  restricted: boolean;
  /** Somebody is waiting on this in Approvals, so the status buttons
   *  on the Records page stand down — the server refuses them too. */
  hasPendingApproval?: boolean;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
  createdByName: string | null;
  updatedAt: string;
  updatedByName: string | null;
}

export interface EmployeeRecordRequest {
  employeeId: string;
  recordType: RecordType;
  subtype: string;
  recordDate: string;
  amount?: number | null;
  details?: Record<string, unknown>;
  notes?: string | null;
  /** Optional, create only. Ordered approver user ids for Promoted,
   *  Join Club and Welfare; empty means no approval is required and
   *  the type's own rule decides the status. */
  approverUserIds?: string[];
}

export interface ListParams {
  employeeId?: string;
  type?: RecordType | '';
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

export interface RecordPage {
  data: EmployeeRecord[];
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

const BASE = '/api/v1/employee-records';

export async function list(p: ListParams = {}): Promise<RecordPage> {
  const q = new URLSearchParams();
  if (p.employeeId) q.set('employeeId', p.employeeId);
  if (p.type) q.set('type', p.type);
  if (p.status) q.set('status', p.status);
  if (p.from) q.set('from', p.from);
  if (p.to) q.set('to', p.to);
  q.set('page', String(p.page ?? 0));
  q.set('size', String(p.size ?? 200));
  return apiJson(`${BASE}?${q.toString()}`);
}

export async function create(req: EmployeeRecordRequest): Promise<EmployeeRecord> {
  return apiJson(BASE, { method: 'POST', json: req });
}

export async function update(id: string, req: EmployeeRecordRequest): Promise<EmployeeRecord> {
  return apiJson(`${BASE}/${id}`, { method: 'PATCH', json: req });
}

export async function setStatus(id: string, status: string): Promise<EmployeeRecord> {
  return apiJson(`${BASE}/${id}/status`, { method: 'POST', json: { status } });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`${BASE}/${id}`, { method: 'DELETE' });
}
