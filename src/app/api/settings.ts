import { apiJson, apiVoid } from './client';

// ---- Attendance rule -------------------------------------------------------
export interface AttendanceRule {
  id: string;
  name: string;
  mode: 'two' | 'four';
  standardCheckIn: string;
  standardCheckOut: string;
  morningOut?: string;
  afternoonIn?: string;
  graceInMinutes?: number;
  graceOutMinutes?: number;
  halfDayCountsAsHalfScan?: boolean;
  isDefault?: boolean;
  lateThresholdMinutes: number;
  otCalculationMode: 'auto' | 'manual';
  isActive: boolean;
  breakTime: { startTime: string; endTime: string; autoDeduct: boolean };
  minimumWorkHours: number;
  allowMultiplePunch: boolean;
  earlyLeaveEnabled: boolean;
  autoMarkAbsent: boolean;
  department?: string;
  shiftType?: string;
}

export async function listAttendanceRules(): Promise<AttendanceRule[]> {
  return apiJson('/api/v1/settings/attendance-rules');
}

export async function createAttendanceRule(req: Omit<AttendanceRule, 'id'>): Promise<AttendanceRule> {
  return apiJson('/api/v1/settings/attendance-rules', { method: 'POST', json: req });
}

export async function updateAttendanceRule(id: string, req: Partial<AttendanceRule>): Promise<AttendanceRule> {
  return apiJson(`/api/v1/settings/attendance-rules/${id}`, { method: 'PATCH', json: req });
}

export async function removeAttendanceRule(id: string): Promise<void> {
  return apiVoid(`/api/v1/settings/attendance-rules/${id}`, { method: 'DELETE' });
}

// ---- Holidays --------------------------------------------------------------
export interface Holiday {
  id: string;
  name: string;
  date: string;
  type: 'national' | 'company' | string;
  isRecurring?: boolean;
  description?: string;
  /** Set when this row was cloned from another holiday — used to show
   *  a "cloned" badge in the table and surface the source date on hover. */
  clonedFromId?: string | null;
}

export async function listHolidays(params: { year?: number; type?: string } = {}): Promise<Holiday[]> {
  return apiJson('/api/v1/settings/holidays', { query: { ...params } });
}

export async function createHoliday(req: Omit<Holiday, 'id'>): Promise<Holiday> {
  return apiJson('/api/v1/settings/holidays', { method: 'POST', json: req });
}

export async function updateHoliday(id: string, req: Partial<Holiday>): Promise<Holiday> {
  return apiJson(`/api/v1/settings/holidays/${id}`, { method: 'PATCH', json: req });
}

export async function removeHoliday(id: string): Promise<void> {
  return apiVoid(`/api/v1/settings/holidays/${id}`, { method: 'DELETE' });
}

// ---- Company info ----------------------------------------------------------
export interface CompanyInfo {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  currency?: string;
  /** date-fns pattern used to render visible dates across the app (V60).
   *  Null on the wire leaves the persisted value untouched on PUT. */
  dateFormat?: string;
}

export async function getCompanyInfo(): Promise<CompanyInfo> {
  return apiJson('/api/v1/settings/company');
}

export async function updateCompanyInfo(req: CompanyInfo): Promise<CompanyInfo> {
  return apiJson('/api/v1/settings/company', { method: 'PUT', json: req });
}

// ---- OT settings -----------------------------------------------------------
// Singleton per tenant. Backend exposes `GET/PUT /api/v1/settings/ot`.
// `workdayRule`, `weekendRule`, `holidayRule` are free-form JSON (Map<String,Object>)
// the UI fills in — backend stores them verbatim.
export interface OtSettings {
  otStartAfter: string;            // HH:mm (LocalTime)
  minimumOTThresholdMinutes: number;
  otRoundingMinutes: number;
  weekdayRate: number;
  weekendRate: number;
  holidayRate: number;
  /** Night-work (Art. 144 + 162). The window may wrap past midnight.
   *  Compose with day-type rate as max(dayTypeRate, nightRate). */
  nightEnabled?: boolean;
  nightRate?: number;
  /** HH:mm. */
  nightStartTime?: string;
  /** HH:mm. */
  nightEndTime?: string;
  maxOTHoursPerDay: number;
  requireApproval: boolean;
  calculationMode: 'factory' | 'office' | string;
  workdayRule?: Record<string, unknown>;
  weekendRule?: Record<string, unknown>;
  holidayRule?: Record<string, unknown>;
  departmentAssignments?: unknown;
}

export async function getOtSettings(): Promise<OtSettings> {
  return apiJson('/api/v1/settings/ot');
}

export async function updateOtSettings(req: OtSettings): Promise<OtSettings> {
  return apiJson('/api/v1/settings/ot', { method: 'PUT', json: req });
}

/**
 * General attendance settings — drive the "Absent & Missing Punch Rules",
 * notifications, and weekend chips in the Attendance Settings → General tab.
 * One row per tenant; the GET auto-creates a defaults row on first read.
 */
export interface GeneralAttendanceSettings {
  autoMarkAbsent: boolean;
  /** "HH:mm" 24-hour. */
  absentDeadlineTime: string;
  trackMissingCheckout: boolean;
  notifyManager: boolean;
  notifyEmployee: boolean;
  /** 3-letter day codes: Mon, Tue, Wed, Thu, Fri, Sat, Sun. */
  weekendDays: string[];
}

export async function getGeneralAttendanceSettings(): Promise<GeneralAttendanceSettings> {
  return apiJson('/api/v1/settings/attendance/general');
}

export async function updateGeneralAttendanceSettings(
  req: Partial<GeneralAttendanceSettings>,
): Promise<GeneralAttendanceSettings> {
  return apiJson('/api/v1/settings/attendance/general', { method: 'PUT', json: req });
}

// ---- Payroll tax brackets (Cambodia TOS) -----------------------------------
// Backs the "Tax Brackets" tab on Employee Settings. Backend bundles the
// per-tenant KHR/USD fixed exchange rate + the ordered progressive bracket
// list into one GET / PUT to keep the UI simple. PUT is a full replace.
//
// Bracket interpretation:
//   • fromAmount / toAmount are in KHR (Riels).
//   • toAmount null = open-ended top bracket ("Over 12,500,000").
//   • Tax payable per row = (monthlyTaxableKhr × ratePercent / 100) − excessAmount
export interface TaxBracket {
  /** Backend UUID — undefined for rows the UI just created locally. */
  id?: string;
  /** KHR. */
  fromAmount: number;
  /** KHR. Null/undefined on the last row (open-ended). */
  toAmount?: number | null;
  /** 0..100. */
  ratePercent: number;
  /** KHR. The fixed deduction in the formula. */
  excessAmount: number;
  /** 1-based rank — backend re-numbers on save, but the UI may set this
   *  for stable list ordering pre-save. */
  sortOrder: number;
}

export interface PayrollTaxSettings {
  /** Riels per 1 USD; HR updates monthly per the NBC published rate. */
  khrPerUsd: number;
  brackets: TaxBracket[];
}

export async function getPayrollTaxSettings(): Promise<PayrollTaxSettings> {
  return apiJson('/api/v1/settings/tax');
}

export async function updatePayrollTaxSettings(
  req: Partial<PayrollTaxSettings>,
): Promise<PayrollTaxSettings> {
  return apiJson('/api/v1/settings/tax', { method: 'PUT', json: req });
}

/** Resets the tenant's brackets to the canonical NBC default schedule.
 *  Doesn't touch the FX rate. */
export async function resetPayrollTaxDefaults(): Promise<PayrollTaxSettings> {
  return apiJson('/api/v1/settings/tax/reset-defaults', { method: 'POST' });
}
