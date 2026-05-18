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
  /** @deprecated kept for legacy mock data; the Holiday Calendar marks
   *  non-working dates only — payroll handles compensation separately. */
  isPaid?: boolean;
  description?: string;
}

/**
 * Leave / attendance-exception entry. The `type` was historically the
 * exception kind ("missed_punch" etc.); the leave UI now uses the
 * coarser leave-shaped enum (full / half_morning / half_noon). Older
 * values are still accepted on the wire — display code maps them.
 */
export interface AttendanceException {
  id: string;
  employeeId: string;
  date: string;
  type: 'full' | 'half_morning' | 'half_noon'
      | 'missed_punch' | 'late_arrival' | 'early_leave' | 'manual_correction';
  originalCheckIn?: string;
  originalCheckOut?: string;
  correctedCheckIn?: string;
  correctedCheckOut?: string;
  reason: string;
  /** Free-form remark — typically the approver's note or HR follow-up text. */
  notes?: string;
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
  /** Explicit unit for {@link amount}. Day-flavoured categories (e.g.
   *  seniority indemnity) carry 'day' so the Amount column reads
   *  "7.5 days" instead of "$7.5". Falls back to isPercentage for
   *  legacy rows. */
  unit?: 'amount' | 'percentage' | 'day';
  effectiveDate: string;
  /** "once" = single payroll cycle (default), "monthly" = recurring. */
  recurrence?: 'once' | 'monthly';
  /** Inclusive end-date for monthly recurrence. Empty = open-ended. */
  effectiveUntil?: string;
  reason: string;
  approvedBy: string;
  approvedAt: string;
}
