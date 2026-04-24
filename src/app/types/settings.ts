// Attendance Settings Types

export interface BreakTime {
  startTime: string;
  endTime: string;
  autoDeduct: boolean;
}

export type ScanMode = 'two' | 'four';

export interface AttendanceRule {
  id: string;
  name: string;

  // -- Scan rule -------------------------------------------------------------
  /** 2-scan (morning-in + evening-out) or 4-scan (morning + afternoon sessions). */
  mode: ScanMode;
  /** Morning check-in target — also `standardCheckIn` / session "in" in 2-scan mode. */
  standardCheckIn: string;
  /** Evening check-out target — also `standardCheckOut` / session "out" in 2-scan mode. */
  standardCheckOut: string;
  /** Lunch-out target; only meaningful in 4-scan mode. */
  morningOut?: string;
  /** Lunch-return target; only meaningful in 4-scan mode. */
  afternoonIn?: string;
  /**
   * Grace minutes AFTER {@link standardCheckIn} that still count as on-time.
   * Historic alias: {@link lateThresholdMinutes}. The evaluator reads this
   * field when present and falls back to {@link lateThresholdMinutes} otherwise.
   */
  graceInMinutes?: number;
  /** Grace minutes BEFORE {@link standardCheckOut} that still count as on-time. */
  graceOutMinutes?: number;
  /** 2-scan only: approved half-day leave → skip the absent half. */
  halfDayCountsAsHalfScan?: boolean;
  /** Exactly one rule per tenant should be marked default — the fallback for unassigned employees. */
  isDefault?: boolean;

  // -- Existing fields -------------------------------------------------------
  lateThresholdMinutes: number;
  otCalculationMode: 'auto' | 'manual';
  isActive: boolean;
  breakTime: BreakTime;
  minimumWorkHours: number;
  allowMultiplePunch: boolean;
  earlyLeaveEnabled: boolean;
  autoMarkAbsent: boolean;
  department?: string;
  shiftType?: string;
}

export interface WorkdayOTRule {
  otStartAfter: string;
  minimumOTMinutes: number;
  maxOTHours: number;
  rate: number;
  roundingMinutes: number;
}

export interface WeekendOTRule {
  countAllHoursAsOT: boolean;
  rate: number;
  minimumWorkMinutes: number;
  roundingMinutes: number;
}

export interface HolidayOTRule {
  holidaySource: 'system_calendar' | 'manual';
  rate: number;
  specialBonusEnabled: boolean;
  specialBonusAmount: number;
  roundingMinutes: number;
}

export interface DepartmentOTAssignment {
  id: string;
  department: string;
  ruleLabel: string;
  weekdayRate: number;
  weekendRate: number;
  holidayRate: number;
}

export interface OTSettings {
  // legacy compat
  otStartAfter: string;
  minimumOTThresholdMinutes: number;
  otRoundingMinutes: number;
  weekdayRate: number;
  weekendRate: number;
  holidayRate: number;
  maxOTHoursPerDay: number;
  requireApproval: boolean;
  // new per-type rules
  workdayRule: WorkdayOTRule;
  weekendRule: WeekendOTRule;
  holidayRule: HolidayOTRule;
  departmentAssignments: DepartmentOTAssignment[];
  calculationMode: 'factory' | 'office';
}

// ---------------------------------------------------------------------------
// Payroll Categories (customizable earnings / deductions)
// ---------------------------------------------------------------------------
export type PayrollCategoryKind = 'earning' | 'deduction';
export type PayrollCategoryValueType = 'flat' | 'percentage';

export interface PayrollCategory {
  id: string;
  code: string;              // stable machine key (e.g. "basic", "nssf")
  label: string;             // display name shown on payslip / UI
  kind: PayrollCategoryKind;
  valueType: PayrollCategoryValueType;
  defaultAmount: number;     // seed for new payroll rows; 0 = no default
  order: number;             // display / column order within its kind
  enabled: boolean;          // toggled off = hidden from payroll but preserved for history
  system: boolean;           // true = built-in seed row, cannot be deleted (only disabled/renamed)
}

export type PayrollBatchStatus = 'pending' | 'approved' | 'done' | 'rejected';

export interface PayrollBatch {
  id: string;
  date: string; // e.g., "2026-04-01"
  monthYear: string; // e.g., "03-2026"
  type: string; // e.g., "Salary", "Salary & Bonus"
  subject: string; // e.g., "Salary Table of March 20"
  totalEmployees: number;
  currency: string; // e.g., "USD"
  netSalary: number;
  totalEarnings: number;
  deductions: number;
  remarks?: string;
  /** Who created the batch. Segregation-of-duties requires approver ≠ uploader. */
  uploadedBy: string;
  uploadedAt: string;
  status: PayrollBatchStatus;
  /** Admin who approved. Must differ from uploadedBy. */
  approvedBy?: string;
  approvedAt?: string;
  /** Admin who marked the batch paid / done. */
  completedBy?: string;
  completedAt?: string;
  /** Audit for rejections — rejected batches can be re-submitted as a new run. */
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}