import { apiJson, apiVoid, Page } from './client';

/** V196 — clinical role tag surfaced on the Healthcare business
 *  base. Drives the Doctor picker filter + the Staff Roles
 *  settings screen. */
/** V196 healthcare tags + V210 school tag. Column name is legacy
 *  ("clinical_role") but the field carries any industry-role tag. */
export type ClinicalRole = 'doctor' | 'cashier' | 'staff' | 'teacher';

export interface Employee {
  id: string;
  empNo: string;
  name: string;
  khmerName?: string | null;
  email: string;
  position: string;
  departmentId?: string | null;
  joinDate: string;
  status: 'active' | 'inactive' | string;
  contactNumber?: string | null;
  baseSalary: number;
  managerId?: string | null;
  profileImage?: string | null;
  gender?: 'male' | 'female' | 'other' | string | null;
  /** "single" | "married" | null. Drives the Cambodia TOS dependents count. */
  maritalStatus?: 'single' | 'married' | string | null;
  /** Children claimed as dependents. Only meaningful when married. */
  numberOfChildren?: number | null;
  dateOfBirth?: string | null;
  placeOfBirth?: string | null;
  currentAddress?: string | null;
  nffNo?: string | null;
  tid?: string | null;
  contractExpireDate?: string | null;
  /** Resign / termination date. null = still employed. */
  resignDate?: string | null;
  /**
   * When false the employee is opted out of attendance ("Exception").
   * Field engineers, remote contractors, and similar non-punching roles
   * should sit at false so they don't pollute compliance metrics or the
   * daily roster's absent count.
   */
  attendanceYn?: boolean;
  /** V53 — opt-in for claiming family dependents in the TOS calculation.
   *  When false, the employee's payslip subtracts no dependent allowance
   *  even if married / has children. Lets dual-earner couples designate
   *  which spouse is the claimant. */
  decouple?: boolean;
  /** V55 — explicit spouse-claim toggle. Spouse dependent counts only
   *  when both decouple and claimSpouse are true. Lets widowed /
   *  divorced single parents claim children without a spouse line. */
  claimSpouse?: boolean;
  /** V51 — date the Long-term Exception began. Surfaced as the "Start Date"
   *  column on the Exception → Long-term view. */
  attendanceExceptionStartDate?: string | null;
  /** V51 — optional planned restore date for the Exception. */
  attendanceExceptionEndDate?: string | null;
  /** V51 — free-form note explaining why the employee is on Exception. */
  attendanceExceptionRemark?: string | null;
  /** Fixed Position Allowance — NOT NULL DEFAULT 0 since V43. */
  positionAllowance?: number;
  /** Fixed Evaluation Allowance — NOT NULL DEFAULT 0 since V43. */
  evaluationAllowance?: number;
  /** V70 — Cambodian skill level: office | specialized | ns_cook | ns_labour. */
  level?: string | null;
  /** V196 — clinical role tag for the Hospital business base.
   *  {@code doctor} lands the employee in the Doctor picker on
   *  Encounter + Appointment forms. Null = untagged. */
  clinicalRole?: ClinicalRole | null;
  /** Author + modifier audit. Display names resolved server-side. */
  createdAt?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
}

export type CreateEmployeeRequest = Omit<Employee, 'id' | 'status' | 'profileImage'> & {
  status?: string;
  /** Bulk-upload only: lets the server find-or-create a Department when the
   *  frontend couldn't resolve `departmentId` from a name on the spreadsheet. */
  departmentName?: string | null;
};

export interface ListParams {
  q?: string;
  departmentId?: string;
  status?: string;
  page?: number;
  size?: number;
}

export async function list(params: ListParams = {}): Promise<Page<Employee>> {
  return apiJson<Page<Employee>>('/api/v1/employees', { query: { ...params } });
}

export async function get(id: string): Promise<Employee> {
  return apiJson<Employee>(`/api/v1/employees/${id}`);
}

export async function me(): Promise<Employee> {
  return apiJson<Employee>('/api/v1/employees/me');
}

export async function create(req: CreateEmployeeRequest): Promise<Employee> {
  return apiJson<Employee>('/api/v1/employees', { method: 'POST', json: req });
}

export async function update(id: string, req: CreateEmployeeRequest): Promise<Employee> {
  return apiJson<Employee>(`/api/v1/employees/${id}`, { method: 'PUT', json: req });
}

/** v-user-profile-save-full-fields — the six low-risk fields the
 *  Profile dialog is allowed to edit for the signed-in user. Any
 *  other Employee field goes through the admin endpoints. */
export interface UpdateSelfRequest {
  khmerName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  placeOfBirth?: string | null;
  contactNumber?: string | null;
  currentAddress?: string | null;
}

export async function updateMe(req: UpdateSelfRequest): Promise<Employee> {
  return apiJson<Employee>('/api/v1/employees/me', { method: 'PATCH', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/employees/${id}`, { method: 'DELETE' });
}
