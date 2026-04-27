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
