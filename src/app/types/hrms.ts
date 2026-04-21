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
  id: string;
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
  dateOfBirth?: string;
  placeOfBirth?: string;
  currentAddress?: string;
  nffNo?: string;
  tid?: string;
  contractExpireDate?: string;
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