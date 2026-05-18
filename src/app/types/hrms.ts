// Core HRMS Types

export type UserRole = 'super_admin' | 'admin' | 'manager' | 'employee';

export type EmployeeStatus = 'active' | 'inactive';

export type ContractStatus = 'active' | 'expiring' | 'expired';

export type OTStatus = 'pending' | 'approved' | 'rejected';

export type AttendanceStatus = 'present' | 'late' | 'early_leave' | 'absent' | 'no_checkin' | 'no_checkout' | 'leave';

export interface User {
  id: string;
  email: string;
  password: string;
  role: UserRole;
  employeeId: string;
  departmentId?: string;
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
  /** Drives the dependents count for Cambodia TOS (KHR 150,000 each). */
  maritalStatus?: 'single' | 'married';
  /** Children claimed as dependents. Only meaningful when married. */
  numberOfChildren?: number;
  dateOfBirth?: string;
  placeOfBirth?: string;
  currentAddress?: string;
  nffNo?: string;
  tid?: string;
  contractExpireDate?: string;
  /** Resign / termination date. Empty = still employed. */
  resignDate?: string;
  /**
   * False = "Exception" — employee opted out of attendance counting
   * (field engineers, remote staff). Defaults to true.
   */
  attendanceYn?: boolean;
  /** Fixed Position Allowance — standing earning shown on every payslip.
   *  NOT NULL on the server (V43); defaults to 0 when HR didn't set it. */
  positionAllowance?: number;
  /** Fixed Evaluation Allowance — standing earning shown on every payslip.
   *  Same NOT NULL DEFAULT 0 semantics as {@link positionAllowance}. */
  evaluationAllowance?: number;
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