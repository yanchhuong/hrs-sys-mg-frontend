// Core HRMS Types

export type UserRole =
  | 'super_admin' | 'admin' | 'manager' | 'employee'
  // V222/V223 — agency users are a separate identity pool. When
  // `role` starts with `agency_`, the user's session lives in the
  // agency workspace and `agencyId` / `agencySlug` on the User row
  // are populated instead of `tenantId` / `tenantSlug`.
  | 'agency_partner' | 'agency_manager' | 'agency_senior' | 'agency_staff';

export type EmployeeStatus = 'active' | 'inactive';

export type ContractStatus = 'active' | 'expiring' | 'expired';

export type OTStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export type AttendanceStatus = 'present' | 'late' | 'early_leave' | 'absent' | 'no_checkin' | 'no_checkout' | 'leave';

export interface User {
  id: string;
  email: string;
  password: string;
  role: UserRole;
  employeeId: string;
  departmentId?: string;
  /** UUID of the tenant this user belongs to. Populated from
   *  {@code /auth/me}; needed by tenant-scoped surfaces like the
   *  Encounter Settings logo upload (V190). Optional on the type
   *  so pre-login state and mock rows stay valid. Null for agency
   *  users, whose session lives on {@link #agencyId} instead. */
  tenantId?: string | null;
  /** V222 — populated only for agency users (role starts with
   *  {@code agency_}). Regular tenant users get null / undefined. */
  agencyId?: string | null;
  agencySlug?: string | null;
  /** V196 — clinical role tag on the linked employee (if any).
   *  Drives Doctor-only affordances like the editable Diagnosis
   *  on Appointments. Null when user has no employee link. */
  clinicalRole?: 'doctor' | 'cashier' | 'staff' | null;
  /** Display name set via the Profile dialog (V140). When set,
   *  takes precedence over the linked employee's name across the
   *  app (sidebar avatar, POS Cashier line, etc.). */
  name?: string;
  /** V146 — optional secondary login identifier (3..64 chars from
   *  [a-z0-9._-]). Null when the user signs in by email only. */
  username?: string | null;
  /** V199 — six personal profile fields resolved server-side from
   *  the linked Employee when present, otherwise from the User row
   *  itself. Populated on every /auth/me hydrate; the Profile
   *  dialog uses them to seed the form for admin-without-employee. */
  khmerName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  placeOfBirth?: string | null;
  contactNumber?: string | null;
  currentAddress?: string | null;
  /** v-tenant-freeze — current tenant lifecycle status. Populated
   *  from /auth/me. Layout renders a top-bar banner when this is
   *  'frozen' so users know why writes are being blocked. */
  tenantStatus?: 'active' | 'suspended' | 'cancelled' | 'frozen' | null;
  tenantFrozenReason?: string | null;
  /** v-tenant-freeze-schedule — auto-thaw deadline (ISO). Null =
   *  indefinite freeze OR tenant not frozen at all. */
  tenantFrozenUntil?: string | null;
  createdAt: string;
  lastLogin?: string;
  isActive: boolean;
}

export interface Employee {
  /** Human-readable Employee ID — what the user sees and types in Excel (e.g. "EMP001"). */
  id: string;
  /** Backend primary-key UUID — populated in live mode only, used for API calls. */
  apiId?: string;
  /**
   * Explicit Employee Number for views that key `id` to a backend UUID
   * (e.g. Reports). Populated in live mode; in mock mode it equals `id`.
   */
  empNo?: string;
  name: string;
  khmerName?: string;
  email: string;
  position: string;
  department: string;
  joinDate: string;
  status: EmployeeStatus;
  contactNumber: string;
  baseSalary: number;
  managerId?: string;
  profileImage?: string;
  gender?: 'male' | 'female';
  /** Drives the dependents count for Cambodia TOS (KHR 150,000 each).
   *  Only 'married' adds a spouse dependent (housewife rule); children
   *  count regardless of marital status, so 'divorced' and 'widowed'
   *  single parents still claim their kids. */
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed';
  /** Children claimed as dependents. Only meaningful when married. */
  numberOfChildren?: number;
  dateOfBirth?: string;
  placeOfBirth?: string;
  currentAddress?: string;
  nffNo?: string;
  tid?: string;
  /** V300 — ID document type. Foreign employees on a work visa
   *  flip this to 'passport' so {@link visaExpireDate} becomes the
   *  authoritative renewal deadline. */
  nationalityType?: 'national_id' | 'passport';
  /** V300 — Work-visa expiry (ISO date). Only meaningful when
   *  {@link nationalityType} = 'passport'. */
  visaExpireDate?: string;
  contractExpireDate?: string;
  /** Resign / termination date. Empty = still employed. */
  resignDate?: string;
  /**
   * False = "Exception" — employee opted out of attendance counting
   * (field engineers, remote staff). Defaults to true.
   */
  attendanceYn?: boolean;
  /** V53 — opt-in for claiming family dependents in the TOS calculation.
   *  When false (default), the payslip subtracts no dependent allowance
   *  even if maritalStatus = 'married' or numberOfChildren > 0. Used to
   *  designate the single claimant in dual-earner couples. */
  decouple?: boolean;
  /** V55 — explicit spouse-claim toggle. The spouse dependent is only
   *  added when both `decouple` and `claimSpouse` are true. Independent
   *  of maritalStatus so a widowed / divorced single parent can claim
   *  children only. */
  claimSpouse?: boolean;
  /** V51 — explicit Long-term Exception start date. The Exception →
   *  Long-term view's "Start Date" column reads this; falls back to
   *  {@link updatedAt} for pre-V51 rows. */
  attendanceExceptionStartDate?: string;
  /** V51 — optional planned restore date. Empty = open-ended. */
  attendanceExceptionEndDate?: string;
  /** V51 — free-form note explaining the Exception. */
  attendanceExceptionRemark?: string;
  /** Server-side last-updated timestamp. Used on the Exception →
   *  Long-term sub-view as a fallback for the Start Date column when
   *  pre-V51 rows don't have an explicit start date. Not auditable. */
  updatedAt?: string;
  /** Fixed Position Allowance — standing earning shown on every payslip.
   *  NOT NULL on the server (V43); defaults to 0 when HR didn't set it. */
  positionAllowance?: number;
  /** Fixed Evaluation Allowance — standing earning shown on every payslip.
   *  Same NOT NULL DEFAULT 0 semantics as {@link positionAllowance}. */
  evaluationAllowance?: number;
  /** V70 — Cambodian Labour Law skill / occupational level. One of:
   *  'office', 'specialized', 'ns_cook', 'ns_labour'. Drives the
   *  probation-max auto-fill on the Add Contract dialog. */
  level?: 'office' | 'specialized' | 'ns_cook' | 'ns_labour';
  // Banking
  bankName?: string;
  bankAccount?: string;
  // Attached documents (contracts, IDs, certificates)
  documents?: EmployeeDocument[];
}

export type EmployeeDocumentType =
  | 'contract'
  | 'id_card'
  | 'passport'
  | 'certificate'
  | 'resume'
  | 'tax_form'
  | 'other';

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  name: string;
  type: EmployeeDocumentType;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy?: string;
  /** In production this is an object-storage URL or signed link. */
  url?: string;
  notes?: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string;       // kept for backward compat
  checkOut?: string;      // kept for backward compat
  morningIn?: string;     // Morning check-in
  morningOut?: string;    // Morning check-out (lunch break)
  noonIn?: string;        // Noon check-in (back from lunch)
  noonOut?: string;       // Noon check-out (end of day)
  otHours?: number;       // OT hours (when noonOut > standard end)
  workHours?: number;
  status: AttendanceStatus;
  notes?: string;
}

export interface OTRequest {
  id: string;
  employeeId: string;
  date: string;
  /** HH:mm. Optional for legacy rows that only carried total hours. */
  startHour?: string;
  /** HH:mm. Optional for legacy rows that only carried total hours. */
  endHour?: string;
  hours: number;
  reason: string;
  status: OTStatus;
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  isWeekend: boolean;
  isHoliday: boolean;
  /** Human-readable label of the owning payroll batch (its subject,
   *  e.g. "Salary of July 2026"). Populated only for status='paid'
   *  so the OT table can render a "Paid · <batch>" reference. */
  payrollBatchSubject?: string | null;
}

export interface PayrollItem {
  id: string;
  employeeId: string;
  /** Server-resolved name. In live mode the backend joins user→employee
   *  and sends this so the UI doesn't need a separate lookup; useful as a
   *  fallback when the local employee list misses (e.g. terminated). */
  employeeName?: string;
  month: string;
  baseSalary: number;
  positionAllowance?: number;
  evaluationAllowance?: number;
  otHours: number;
  otPay: number;
  firstSalaryDeduction?: number; // 1st Salary deduction
  nssfPension?: number; // NSSF Pension 2%
  taxOnSalary?: number; // Tax on Salary (TOS)
  otherDeductions?: number;
  deductions: number; // Total Deductions
  totalPay: number; // Net Salary
  totalEarnings: number; // Total Earnings (baseSalary + allowances + otPay)
  payrollAccount?: string;
  currency: string;
  generatedAt: string;
  approvedBy?: string;
  /**
   * Per-category earnings keyed by PayrollCategory.code (e.g. {basic: 500,
   * position: 100}). Lets reports render columns that match the user's
   * configured Payroll Categories without baking field names into the UI.
   */
  earnings?: Record<string, number>;
  /** Per-category deductions keyed by PayrollCategory.code. */
  deductionsBreakdown?: Record<string, number>;
}

export interface Contract {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  documentUrl?: string;
  contractType: string;
  salary?: number;
  notes?: string;
  renewedFrom?: string;
  renewedTo?: string;
  createdAt: string;
}

export interface Department {
  id: string;
  name: string;
  managerId?: string;
  employeeCount?: number;
  description?: string;
}