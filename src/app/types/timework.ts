// Timework Module Types

export interface Timetable {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakStart?: string;
  breakEnd?: string;
  workingHours: number;
  isActive: boolean;
}

export interface Shift {
  id: string;
  name: string;
  timetableId: string;
  type: 'day' | 'night' | 'split';
  color: string;
  isActive: boolean;
}

export interface Schedule {
  id: string;
  employeeId: string;
  shiftId: string;
  date: string;
  timetableId: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  type: 'public' | 'company';
  isPaid: boolean;
  description?: string;
}

export interface AttendanceException {
  id: string;
  employeeId: string;
  date: string;
  type: 'missed_punch' | 'late_arrival' | 'early_leave' | 'manual_correction';
  originalCheckIn?: string;
  originalCheckOut?: string;
  correctedCheckIn?: string;
  correctedCheckOut?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedBy: string;
  approvedBy?: string;
  submittedAt: string;
  approvedAt?: string;
}

export interface SalaryDeduction {
  id: string;
  employeeId: string;
  name: string;
  /** References a PayrollCategory.code where kind === 'deduction'. */
  type: string;
  amount: number;
  isPercentage: boolean;
  startDate: string;
  endDate?: string;
  isRecurring: boolean;
  status: 'active' | 'completed' | 'cancelled';
}

export interface SalaryIncrease {
  id: string;
  employeeId: string;
  /** References a PayrollCategory.code where kind === 'earning'. */
  type: string;
  amount: number;
  isPercentage: boolean;
  effectiveDate: string;
  reason: string;
  approvedBy: string;
  approvedAt: string;
}
