import { apiJson } from './client';

/** One employee currently pinned to an office. Hydrated by the server
 *  so the FE doesn't need to JOIN. V152. */
export interface EmployeeAssignee {
  employeeId: string;
  name?: string | null;
  empNo?: string | null;
}

/** Snapshot shape: officeId → list of assignees. */
export type AssignmentSnapshot = Record<string, EmployeeAssignee[]>;

export async function snapshot(): Promise<AssignmentSnapshot> {
  return apiJson('/api/v1/office-assignments');
}

/** Replace the assignee set for one office. Empty list clears it
 *  (everyone falls back to flexible scan). */
export async function setAssignees(officeId: string, employeeIds: string[]): Promise<AssignmentSnapshot> {
  return apiJson(`/api/v1/office-assignments/offices/${officeId}`, {
    method: 'PUT',
    json: { employeeIds },
  });
}

/** Replace the office allow-list for one employee. Empty list = back
 *  to flexible (any office geofence passes). */
export async function setOfficesForEmployee(employeeId: string, officeIds: string[]): Promise<AssignmentSnapshot> {
  return apiJson(`/api/v1/office-assignments/employees/${employeeId}`, {
    method: 'PUT',
    json: { officeIds },
  });
}
