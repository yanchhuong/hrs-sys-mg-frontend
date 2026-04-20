// Attendance Settings Types

export interface BreakTime {
  startTime: string;
  endTime: string;
  autoDeduct: boolean;
}

export interface AttendanceRule {
  id: string;
  name: string;
  standardCheckIn: string;
  standardCheckOut: string;
  lateThresholdMinutes: number;
  otCalculationMode: 'auto' | 'manual';
  isActive: boolean;
  // Break settings
  breakTime: BreakTime;
  // Work settings
  minimumWorkHours: number;
  allowMultiplePunch: boolean;
  // Early leave
  earlyLeaveEnabled: boolean;
  // Absent rule
  autoMarkAbsent: boolean;
  // Department/shift
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
  uploadedBy: string;
  uploadedAt: string;
  status: 'draft' | 'approved' | 'processed';
}