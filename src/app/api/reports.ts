import { apiJson } from './client';

export interface HeadcountReportRow {
  departmentId?: string;
  departmentName: string;
  total: number;
  active: number;
  inactive: number;
}

export interface AttendanceReportRow {
  employeeId: string;
  employeeName: string;
  month: string;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  totalOtHours: number;
}

export interface PayrollReportRow {
  employeeId: string;
  employeeName: string;
  month: string;
  basicSalary: number;
  totalEarnings: number;
  totalDeductions: number;
  netSalary: number;
}

export async function headcount(): Promise<HeadcountReportRow[]> {
  return apiJson('/api/v1/reports/headcount');
}

export async function attendance(params: { from: string; to: string; departmentId?: string }): Promise<AttendanceReportRow[]> {
  return apiJson('/api/v1/reports/attendance', { query: { ...params } });
}

export async function payroll(params: { from: string; to: string }): Promise<PayrollReportRow[]> {
  return apiJson('/api/v1/reports/payroll', { query: { ...params } });
}
