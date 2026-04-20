import * as XLSX from 'xlsx';
import { Employee, PayrollItem, Attendance } from '../types/hrms';

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
export interface PayrollExportOptions {
  payrollItems: PayrollItem[];
  employees: Employee[];
  period?: string; // e.g. "April 2026" or "2026-04"
  fileName?: string;
}

export function exportPayrollToExcel({ payrollItems, employees, period, fileName }: PayrollExportOptions) {
  const wb = XLSX.utils.book_new();
  const empById = new Map(employees.map(e => [e.id, e]));

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
    const dept = emp?.department || 'Unknown';
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
      p.employeeId,
      emp?.name || '-',
      emp?.department || '-',
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
    pivotRows.push([
      empId,
      emp?.name || '-',
      emp?.department || '-',
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
