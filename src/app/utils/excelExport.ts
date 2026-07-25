import * as XLSX from 'xlsx';
import { Employee, PayrollItem, Attendance } from '../types/hrms';

// ---------------------------------------------------------------------------
// Generic list-page exporter — used by Invoices / Bills / Receipts / Items
// for their "Download Excel" toolbar button. Kept small on purpose; the
// payroll + attendance exporters below own their own richer layouts.
// ---------------------------------------------------------------------------

export interface ListColumn<T> {
  /** Header text on row 1. */
  header: string;
  /** How to derive the cell value from a row. Return null/undefined for
   *  blank cells. */
  value: (row: T) => string | number | null | undefined;
  /** Column width in characters. Defaults to header length + 2. */
  width?: number;
}

export interface ListExportOptions<T> {
  /** File base name without extension. A YYYY-MM-DD stamp is appended so
   *  operators can pile up exports without collision. */
  filename: string;
  /** Sheet tab name. Truncated to 31 chars (Excel's limit). */
  sheetName: string;
  columns: ListColumn<T>[];
  rows: T[];
}

/** Excel enforces a hard per-cell cap of 32,767 characters — writeFile
 *  throws "Text length must not exceed 32767 characters" if any cell
 *  overshoots (long item descriptions, pasted HTML, etc.). Truncate
 *  with an ellipsis so the export still succeeds. */
const XLSX_CELL_MAX = 32767;
const clampCell = (v: string | number | null | undefined): string | number => {
  if (v == null) return '';
  if (typeof v !== 'string') return v;
  return v.length > XLSX_CELL_MAX ? v.slice(0, XLSX_CELL_MAX - 1) + '…' : v;
};

/** Drop the currently-loaded rows into a one-tab xlsx and trigger the
 *  browser download. */
export function exportListToExcel<T>(opts: ListExportOptions<T>): void {
  const { filename, sheetName, columns, rows } = opts;
  const header = columns.map(c => c.header);
  const data = rows.map(r => columns.map(c => clampCell(c.value(r))));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws['!cols'] = columns.map(c => ({ wch: c.width ?? Math.max(c.header.length + 2, 12) }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${filename}-${fmt(new Date())}.xlsx`);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const autoSizeColumns = (rows: any[][], minWidth = 10) => {
  if (rows.length === 0) return [];
  const colCount = Math.max(...rows.map(r => r.length));
  const widths: { wch: number }[] = [];
  for (let c = 0; c < colCount; c++) {
    let max = minWidth;
    for (const row of rows) {
      const cell = row[c];
      if (cell != null) {
        const len = String(cell).length + 2;
        if (len > max) max = len;
      }
    }
    widths.push({ wch: Math.min(max, 50) });
  }
  return widths;
};

const appendSheet = (wb: XLSX.WorkBook, name: string, rows: any[][]) => {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = autoSizeColumns(rows);
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
};

const fmt = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ---------------------------------------------------------------------------
// Payroll export
// ---------------------------------------------------------------------------
/**
 * Template registry for payroll exports.
 *
 * - `standard`  — full multi-sheet HR report (Summary + Detail + Pivot).
 *                 Use for internal record-keeping.
 * - `simple`    — one sheet, plain-English columns, matching the
 *                 "Simple Payroll System" template style. Good for sharing
 *                 with managers who just want a single readable table.
 * - `aba`       — ABA Bank bulk-payment template. One sheet, beneficiary
 *                 account / name / amount / currency / reference.
 * - `acleda`    — ACLEDA Bank bulk-payroll template (same shape as ABA
 *                 with bank-specific header wording).
 * - `wing`      — Wing bulk-disbursement template, keyed by Wing ID /
 *                 phone instead of bank account.
 *
 * Bank templates are best-effort approximations of common Cambodian bulk
 * payment formats — adjust column headers if your bank-supplied template
 * names them differently.
 */
export type PayrollTemplate = 'standard' | 'simple' | 'nssf' | 'aba' | 'acleda' | 'wing';

/** Logical grouping for the export-template menu. Drives the dividers and
 *  group headers above each block so adding a new template only needs a
 *  group label, not new index-based separator code in the caller. */
export type PayrollTemplateGroup = 'hr' | 'gov' | 'bank';

export interface PayrollTemplateInfo {
  id: PayrollTemplate;
  label: string;
  description: string;
  group: PayrollTemplateGroup;
  /** True when the layout hasn't been verified against the bank's real
   *  upload template yet — UI shows a (draft) tag to discourage portal
   *  uploads until headers are confirmed with a real sample file. */
  draft?: boolean;
}

export const PAYROLL_TEMPLATES: PayrollTemplateInfo[] = [
  { id: 'standard', label: 'Standard Report', description: 'Full multi-sheet HR report (Summary + Detail + Pivot)', group: 'hr' },
  { id: 'simple',   label: 'Simple Summary',  description: 'One sheet, plain-English columns — easy to share',      group: 'hr' },
  { id: 'nssf',     label: 'NSSF Submission', description: 'ប.ស.ស. registration template — bilingual headers, KHR + USD salary columns', group: 'gov' },
  { id: 'aba',      label: 'ABA Bank',        description: 'Bulk-payroll template for ABA Bank',                    group: 'bank' },
  { id: 'acleda',   label: 'ACLEDA Bank',     description: 'Draft layout — confirm headers with a real ACLEDA template before uploading', group: 'bank', draft: true },
  { id: 'wing',     label: 'Wing',            description: 'Draft layout — confirm headers with a real Wing template before uploading',   group: 'bank', draft: true },
];

/** Display label rendered above the first template in each group. */
export const PAYROLL_TEMPLATE_GROUP_LABELS: Record<PayrollTemplateGroup, string> = {
  hr:   'HR reports',
  gov:  'Government / regulator',
  bank: 'Bank portals (draft)',
};

export interface PayrollExportOptions {
  payrollItems: PayrollItem[];
  employees: Employee[];
  period?: string; // e.g. "April 2026" or "2026-04"
  fileName?: string;
  /** Defaults to 'standard' to preserve legacy callers. */
  template?: PayrollTemplate;
  /** Resolver that turns the raw `Employee.department` value (which is a
   *  departmentId UUID in live mode) into a human-readable department name.
   *  Caller passes the same helper used to render the on-screen tables.
   *  Falls back to the raw value when omitted. */
  deptName?: (raw: string | undefined) => string;
  /** USD → KHR rate used by the NSSF template's "Salary (រៀល)" column.
   *  When omitted the template falls back to 4,100 KHR/USD (the common
   *  default used elsewhere in the app) so a stale FX setting still
   *  produces a usable file. */
  khrPerUsd?: number;
}

export function exportPayrollToExcel({ payrollItems, employees, period, fileName, template = 'standard', deptName, khrPerUsd }: PayrollExportOptions) {
  // Live mode keys PayrollItem.employeeId by the backend UUID, while the
  // human-readable empNo lives on Employee.id and the UUID on Employee.apiId.
  // Index by both so every row resolves regardless of which side it came from.
  const empById = new Map<string, Employee>();
  for (const e of employees) {
    if (e.id) empById.set(e.id, e);
    if (e.apiId) empById.set(e.apiId, e);
  }
  // Default resolver: if `dept` looks like a UUID, hide it ("-") so we never
  // leak FK UUIDs into a user-facing export. Otherwise pass through. Caller-
  // provided resolver always wins.
  const resolveDept = deptName ?? ((raw?: string) => {
    if (!raw) return '-';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? '-' : raw;
  });
  const ctx = { payrollItems, empById, period, fileName, deptName: resolveDept };
  if (template === 'simple')  return exportSimpleSummary(ctx);
  if (template === 'nssf')    return exportNssfTemplate({ ...ctx, khrPerUsd: khrPerUsd ?? 4100 });
  if (template === 'aba')     return exportAbaTemplate(ctx);
  if (template === 'acleda')  return exportBankTemplate({ ...ctx, bank: 'acleda' });
  if (template === 'wing')    return exportWingTemplate({ ...ctx, employees });
  return exportStandardReport(ctx);
}

type TemplateCtx = {
  payrollItems: PayrollItem[];
  empById: Map<string, Employee>;
  period?: string;
  fileName?: string;
  deptName: (raw: string | undefined) => string;
};

function exportStandardReport({ payrollItems, empById, period, fileName, deptName }: TemplateCtx) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const totalNet = payrollItems.reduce((s, p) => s + p.totalPay, 0);
  const totalEarnings = payrollItems.reduce((s, p) => s + p.totalEarnings, 0);
  const totalDeductions = payrollItems.reduce((s, p) => s + p.deductions, 0);
  const totalOT = payrollItems.reduce((s, p) => s + (p.otPay || 0), 0);

  const summaryRows: any[][] = [
    ['Payroll Report'],
    ['Period', period || 'All'],
    ['Generated At', new Date().toLocaleString()],
    ['Records', payrollItems.length],
    [],
    ['Totals'],
    ['Total Net Salary (USD)', totalNet.toFixed(2)],
    ['Total Earnings (USD)', totalEarnings.toFixed(2)],
    ['Total Deductions (USD)', totalDeductions.toFixed(2)],
    ['Total OT Pay (USD)', totalOT.toFixed(2)],
    [],
    ['By Department'],
    ['Department', 'Employees', 'Total Earnings', 'Total Deductions', 'Net Salary'],
  ];

  const deptTotals = new Map<string, { emp: Set<string>; earn: number; ded: number; net: number }>();
  payrollItems.forEach(p => {
    const emp = empById.get(p.employeeId);
    const dept = deptName(emp?.department) || 'Unknown';
    const entry = deptTotals.get(dept) || { emp: new Set(), earn: 0, ded: 0, net: 0 };
    entry.emp.add(p.employeeId);
    entry.earn += p.totalEarnings;
    entry.ded += p.deductions;
    entry.net += p.totalPay;
    deptTotals.set(dept, entry);
  });
  Array.from(deptTotals.entries()).forEach(([dept, v]) => {
    summaryRows.push([dept, v.emp.size, v.earn.toFixed(2), v.ded.toFixed(2), v.net.toFixed(2)]);
  });

  appendSheet(wb, 'Summary', summaryRows);

  // Sheet 2: Detailed Payroll
  const detailRows: any[][] = [
    [
      'Month', 'Employee ID', 'Employee Name', 'Department', 'Position',
      'Base Salary', 'Position Allowance', 'Evaluation Allowance',
      'OT Hours', 'OT Pay', 'Total Earnings',
      '1st Salary Deduction', 'NSSF Pension', 'Tax on Salary', 'Other Deductions', 'Total Deductions',
      'Net Salary', 'Currency', 'Payroll Account', 'Generated At',
    ],
  ];
  payrollItems.forEach(p => {
    const emp = empById.get(p.employeeId);
    detailRows.push([
      p.month,
      // Always emit the human-readable empNo (Employee.id), never the
      // backend UUID — UUIDs in user-facing files are confusing and the
      // codebase has a hard rule against leaking them.
      emp?.id || p.employeeId,
      emp?.name || p.employeeName || '-',
      deptName(emp?.department),
      emp?.position || '-',
      p.baseSalary,
      p.positionAllowance || 0,
      p.evaluationAllowance || 0,
      p.otHours,
      p.otPay,
      p.totalEarnings,
      p.firstSalaryDeduction || 0,
      p.nssfPension || 0,
      p.taxOnSalary || 0,
      p.otherDeductions || 0,
      p.deductions,
      p.totalPay,
      p.currency,
      p.payrollAccount || '',
      p.generatedAt,
    ]);
  });
  appendSheet(wb, 'Payroll Detail', detailRows);

  // Sheet 3: Per-Employee Pivot (totals across all months)
  const pivotMap = new Map<string, { earn: number; ded: number; net: number; ot: number; months: Set<string> }>();
  payrollItems.forEach(p => {
    const entry = pivotMap.get(p.employeeId) || { earn: 0, ded: 0, net: 0, ot: 0, months: new Set() };
    entry.earn += p.totalEarnings;
    entry.ded += p.deductions;
    entry.net += p.totalPay;
    entry.ot += p.otPay || 0;
    entry.months.add(p.month);
    pivotMap.set(p.employeeId, entry);
  });
  const pivotRows: any[][] = [
    ['Employee ID', 'Name', 'Department', 'Months', 'Total Earnings', 'Total Deductions', 'Total OT Pay', 'Total Net'],
  ];
  Array.from(pivotMap.entries()).forEach(([empId, v]) => {
    const emp = empById.get(empId);
    const sample = payrollItems.find(p => p.employeeId === empId);
    pivotRows.push([
      emp?.id || empId,
      emp?.name || sample?.employeeName || '-',
      deptName(emp?.department),
      v.months.size,
      v.earn.toFixed(2),
      v.ded.toFixed(2),
      v.ot.toFixed(2),
      v.net.toFixed(2),
    ]);
  });
  appendSheet(wb, 'Per-Employee Totals', pivotRows);

  const name = fileName || `Payroll-Report-${period || fmt(new Date())}.xlsx`;
  XLSX.writeFile(wb, name);
}

// ---------------------------------------------------------------------------
// Simple Summary template — single sheet, plain English columns. Mirrors the
// "Simple Payroll System" layout that's common in shared spreadsheets so a
// non-HR reader can scan a payroll run without learning our internal jargon.
// Ends with a Total row.
// ---------------------------------------------------------------------------
/** Builds the data + total rows for the ABA-style simple-payroll layout.
 *  Shared by Simple Summary (no banner) and ABA Bank (with banner). */
function buildSimplePayrollRows(payrollItems: PayrollItem[], empById: Map<string, Employee>): {
  header: string[];
  data: any[][];
  total: any[];
} {
  const header = [
    'Name', 'PAY', 'TOTAL HOURS WORKED', 'OVERTIME',
    'TOTAL OVERTIME HOURS', 'GROSS PAY', 'INCOME TAX(15%)',
    'OTHER DEDUCTIBLES', 'NET PAY',
  ];
  const data: any[][] = [];
  let tBase = 0, tHrs = 0, tOtPay = 0, tOtHrs = 0, tGross = 0, tTax = 0, tOther = 0, tNet = 0;
  payrollItems.forEach(p => {
    const emp = empById.get(p.employeeId);
    // "Total Hours Worked" isn't tracked on PayrollItem itself; derive it
    // from a flat 8h × working-days assumption since that's what the bank
    // template asks for at month granularity. Falls back to 0 if the
    // month can't be parsed.
    const hoursWorked = estimateMonthHours(p.month);
    const tax = p.taxOnSalary || 0;
    const other = (p.firstSalaryDeduction || 0) + (p.nssfPension || 0) + (p.otherDeductions || 0);
    data.push([
      emp?.name || p.employeeName || '-',
      p.baseSalary,
      hoursWorked,
      p.otPay || 0,
      p.otHours || 0,
      p.totalEarnings,
      tax,
      other,
      p.totalPay,
    ]);
    tBase += p.baseSalary; tHrs += hoursWorked; tOtPay += p.otPay || 0; tOtHrs += p.otHours || 0;
    tGross += p.totalEarnings; tTax += tax; tOther += other; tNet += p.totalPay;
  });
  return {
    header,
    data,
    total: ['TOTAL', tBase, tHrs, tOtPay, tOtHrs, tGross, tTax, tOther, tNet],
  };
}

function exportSimpleSummary({ payrollItems, empById, period, fileName }: TemplateCtx) {
  const wb = XLSX.utils.book_new();
  const { header, data, total } = buildSimplePayrollRows(payrollItems, empById);
  const rows: any[][] = [
    [`Payroll Summary — ${period || 'All'}`],
    [],
    header,
    ...data,
    total,
  ];
  appendSheet(wb, 'Payroll Summary', rows);
  XLSX.writeFile(wb, fileName || `Payroll-Simple-${period || fmt(new Date())}.xlsx`);
}

/**
 * ABA Bank bulk-payroll template. Layout matches the actual ABA-issued
 * Excel template:
 *   Row 1 — "SIMPLE PAYROLL SYSTEM IN EXCEL" banner merged across A:I
 *   Row 2 — column headers (Name, PAY, TOTAL HOURS WORKED, ...)
 *   Row 3..n — one row per employee
 *   Row n+1 — TOTAL row
 * Sheet name and file name use ABA branding so the bank's import parser
 * picks up the file by convention.
 */
function exportAbaTemplate({ payrollItems, empById, period, fileName }: TemplateCtx) {
  const wb = XLSX.utils.book_new();
  const { header, data, total } = buildSimplePayrollRows(payrollItems, empById);
  const rows: any[][] = [
    ['SIMPLE PAYROLL SYSTEM IN EXCEL'],
    header,
    ...data,
    total,
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = autoSizeColumns(rows);
  // Merge the banner cell across all 9 data columns (A1:I1) so it renders
  // as a single title row matching the ABA-supplied template.
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }];
  XLSX.utils.book_append_sheet(wb, ws, 'ABA Payroll');
  XLSX.writeFile(wb, fileName || `ABA-Payroll-${period || fmt(new Date())}.xlsx`);
}

// ---------------------------------------------------------------------------
// NSSF (ប.ស.ស.) submission template. Mirrors the Cambodian National Social
// Security Fund's enrolment / monthly-roster spreadsheet — bilingual headers
// (Khmer + English) and a salary column in both KHR and USD because the
// portal accepts either. One row per employee in the selected payroll batch.
// ---------------------------------------------------------------------------
function exportNssfTemplate({ payrollItems, empById, period, fileName, khrPerUsd }: TemplateCtx & { khrPerUsd: number }) {
  const wb = XLSX.utils.book_new();
  const header = [
    'ល.រ',
    'អត្ត.នៅសហគ្រាស Employee ID',
    'អត្ត.សមាជិកប.ស.ស. (NSSF Member ID)',
    'គោតនាម នាម Name in Khmer',
    'គោតនាម នាមឡាតាំង Name in English',
    'ភេទ/Sex',
    'ថ្ងៃខែឆ្នាំកំណើត Date of birth',
    'ប្រាក់បៀវត្ស(រៀល) Salary',
    'ប្រាក់បៀវត្ស(ដុល្លារ) Salary',
    'ស្ថានភាព Status',
  ];
  // Sex column is Khmer-only (portal labels rows in Khmer); Status column is
  // emitted in English ('Active' / 'Inactive') so downstream filters / pivots
  // key off ASCII.
  const sexLabel = (g?: string) => g === 'female' ? 'ស្រី' : g === 'male' ? 'ប្រុស' : '';
  const statusLabel = (s?: string) => s === 'active' ? 'Active' : s === 'inactive' ? 'Inactive' : (s ?? '');

  const data: any[][] = payrollItems.map((p, idx) => {
    const emp = empById.get(p.employeeId);
    const usdSalary = p.baseSalary ?? emp?.baseSalary ?? 0;
    const khrSalary = Math.round(usdSalary * khrPerUsd);
    return [
      idx + 1,
      emp?.empNo ?? emp?.id ?? '',
      emp?.nffNo ?? '',
      emp?.khmerName ?? '',
      emp?.name ?? p.employeeName ?? '',
      sexLabel(emp?.gender),
      emp?.dateOfBirth ?? '',
      khrSalary,
      usdSalary,
      statusLabel(emp?.status),
    ];
  });

  const rows: any[][] = [header, ...data];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = autoSizeColumns(rows);
  // Apply number formats to the salary columns. Excel cell addresses are
  // 1-based row + letter column; data starts on row 2 (row 1 = headers).
  // Column H = KHR (###,###), column I = USD (#,##0.00).
  for (let r = 0; r < data.length; r++) {
    const row = r + 2;
    const khrCell = ws[`H${row}`];
    if (khrCell) khrCell.z = '#,##0';
    const usdCell = ws[`I${row}`];
    if (usdCell) usdCell.z = '#,##0.00';
  }
  XLSX.utils.book_append_sheet(wb, ws, 'NSSF');
  XLSX.writeFile(wb, fileName || `NSSF-${period || fmt(new Date())}.xlsx`);
}

/** Rough month-hours estimate (working days × 8h) so the Simple Summary
 *  has a sensible "Total Hours Worked" column even though we don't store
 *  that on PayrollItem directly. Returns 0 when month can't be parsed. */
function estimateMonthHours(month?: string): number {
  if (!month) return 0;
  const m = /^(\d{4})-(\d{2})/.exec(month);
  if (!m) return 0;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const last = new Date(y, mo + 1, 0).getDate();
  let workdays = 0;
  for (let d = 1; d <= last; d++) {
    const wd = new Date(y, mo, d).getDay();
    if (wd !== 0 && wd !== 6) workdays++;
  }
  return workdays * 8;
}

// ---------------------------------------------------------------------------
// Bank beneficiary-list templates. ACLEDA accepts a flat beneficiary list
// (account / name / amount / currency / reference). ABA uses a different
// payroll-summary layout — see exportAbaTemplate above.
// Header wording differs slightly per bank's published template; if your
// bank's actual template uses different headers, edit the per-bank config
// below — the row-builder is the same.
// ---------------------------------------------------------------------------
type Bank = 'acleda';
const BANK_CONFIG: Record<Bank, { sheetName: string; filePrefix: string; headers: string[] }> = {
  acleda: {
    sheetName: 'ACLEDA Payroll',
    filePrefix: 'ACLEDA-Payroll',
    headers: ['No.', 'Beneficiary Account', 'Beneficiary Name', 'Amount', 'Currency', 'Reference'],
  },
};

function exportBankTemplate({ payrollItems, empById, period, fileName, bank }: TemplateCtx & { bank: Bank }) {
  const cfg = BANK_CONFIG[bank];
  const wb = XLSX.utils.book_new();
  const rows: any[][] = [cfg.headers];
  payrollItems.forEach((p, i) => {
    const emp = empById.get(p.employeeId);
    rows.push([
      i + 1,
      p.payrollAccount || '',
      emp?.name || p.employeeName || '-',
      Number(p.totalPay.toFixed(2)),
      p.currency || 'USD',
      `Salary ${period || ''}`.trim(),
    ]);
  });
  appendSheet(wb, cfg.sheetName, rows);
  XLSX.writeFile(wb, fileName || `${cfg.filePrefix}-${period || fmt(new Date())}.xlsx`);
}

// ---------------------------------------------------------------------------
// Wing bulk-disbursement template — keyed by Wing ID / phone instead of a
// bank account number. Falls back to the employee's contact number when no
// dedicated Wing ID is stored.
// ---------------------------------------------------------------------------
function exportWingTemplate({ payrollItems, empById, period, fileName }: TemplateCtx & { employees?: Employee[] }) {
  const wb = XLSX.utils.book_new();
  const rows: any[][] = [
    ['No.', 'Wing ID / Phone', 'Receiver Name', 'Amount', 'Currency', 'Remark'],
  ];
  payrollItems.forEach((p, i) => {
    const emp = empById.get(p.employeeId);
    rows.push([
      i + 1,
      p.payrollAccount || emp?.contactNumber || '',
      emp?.name || p.employeeName || '-',
      Number(p.totalPay.toFixed(2)),
      p.currency || 'USD',
      `Salary ${period || ''}`.trim(),
    ]);
  });
  appendSheet(wb, 'Wing Bulk Disbursement', rows);
  XLSX.writeFile(wb, fileName || `Wing-Payroll-${period || fmt(new Date())}.xlsx`);
}

// ---------------------------------------------------------------------------
// Attendance export
// ---------------------------------------------------------------------------
export interface AttendanceExportOptions {
  attendance: Attendance[];
  employees: Employee[];
  startDate?: string;
  endDate?: string;
  fileName?: string;
}

export function exportAttendanceToExcel({ attendance, employees, startDate, endDate, fileName }: AttendanceExportOptions) {
  const wb = XLSX.utils.book_new();
  const empById = new Map(employees.map(e => [e.id, e]));

  const filtered = attendance.filter(a => {
    if (startDate && a.date < startDate) return false;
    if (endDate && a.date > endDate) return false;
    return true;
  });

  // Sheet 1: Summary
  const summary: Record<string, number> = {};
  filtered.forEach(a => { summary[a.status] = (summary[a.status] || 0) + 1; });
  const totalDays = filtered.length;
  const periodLabel = startDate && endDate ? `${startDate} to ${endDate}` : startDate ? `from ${startDate}` : 'All';

  const summaryRows: any[][] = [
    ['Attendance Report'],
    ['Period', periodLabel],
    ['Generated At', new Date().toLocaleString()],
    ['Total Records', totalDays],
    [],
    ['Status Breakdown'],
    ['Status', 'Count', 'Percent'],
  ];
  Object.entries(summary).forEach(([status, count]) => {
    summaryRows.push([status, count, totalDays > 0 ? ((count / totalDays) * 100).toFixed(1) + '%' : '0%']);
  });

  // By employee
  summaryRows.push([], ['By Employee'], [
    'Employee ID', 'Name', 'Department', 'Total', 'Present', 'Late', 'Early Leave', 'Leave', 'Absent', 'No Check-in', 'No Check-out', 'OT Hours',
  ]);
  const empStats = new Map<string, { total: number; present: number; late: number; early: number; leave: number; absent: number; noIn: number; noOut: number; ot: number }>();
  filtered.forEach(a => {
    const s = empStats.get(a.employeeId) || { total: 0, present: 0, late: 0, early: 0, leave: 0, absent: 0, noIn: 0, noOut: 0, ot: 0 };
    s.total++;
    if (a.status === 'present') s.present++;
    else if (a.status === 'late') s.late++;
    else if (a.status === 'early_leave') s.early++;
    else if (a.status === 'leave') s.leave++;
    else if (a.status === 'absent') s.absent++;
    else if (a.status === 'no_checkin') s.noIn++;
    else if (a.status === 'no_checkout') s.noOut++;
    s.ot += a.otHours || 0;
    empStats.set(a.employeeId, s);
  });
  Array.from(empStats.entries()).forEach(([empId, s]) => {
    const emp = empById.get(empId);
    summaryRows.push([
      empId, emp?.name || '-', emp?.department || '-',
      s.total, s.present, s.late, s.early, s.leave, s.absent, s.noIn, s.noOut, s.ot.toFixed(2),
    ]);
  });
  appendSheet(wb, 'Summary', summaryRows);

  // Sheet 2: Daily detail
  const detailRows: any[][] = [
    ['Date', 'Employee ID', 'Employee Name', 'Department', 'Status', 'Morning In', 'Morning Out', 'Noon In', 'Noon Out', 'OT Hours', 'Work Hours', 'Notes'],
  ];
  filtered
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId))
    .forEach(a => {
      const emp = empById.get(a.employeeId);
      detailRows.push([
        a.date,
        a.employeeId,
        emp?.name || '-',
        emp?.department || '-',
        a.status,
        a.morningIn || '',
        a.morningOut || '',
        a.noonIn || '',
        a.noonOut || '',
        a.otHours ?? '',
        a.workHours ?? '',
        a.notes || '',
      ]);
    });
  appendSheet(wb, 'Daily Log', detailRows);

  const name = fileName || `Attendance-Report-${startDate || 'all'}_${endDate || 'all'}.xlsx`;
  XLSX.writeFile(wb, name);
}
