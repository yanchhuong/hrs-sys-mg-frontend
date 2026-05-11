import * as XLSX from 'xlsx';
import { PayrollCategory } from '../types/settings';
import { loadPayrollCategories } from './payrollCategories';

interface Employee {
  id: string;
  name: string;
  [key: string]: any;
}

// Column 0..3 are fixed identifiers / totals. Category amounts start at E.
const CATEGORY_START_COL = 4;

/**
 * Per-employee, per-category amount overrides. Outer key is the employee
 * lookup id (caller's choice — we just match against whatever key the
 * caller used to build the maps). Inner key is the {@link PayrollCategory}
 * `code`. When an override is missing for a (employee, code) pair the
 * cell falls back to {@code category.defaultAmount}.
 */
export type AmountOverrides = Record<string, Record<string, number>>;

export function downloadPayrollTemplate(
  employees: Employee[],
  monthYear: string = '04-2026',
  options: {
    categories?: PayrollCategory[];
    /** Map from {@link Employee.id} → {category.code → amount}. */
    earningsByEmployee?: AmountOverrides;
    /** Same shape as {@code earningsByEmployee} but for the deduction half. */
    deductionsByEmployee?: AmountOverrides;
  } = {},
) {
  const all = options.categories ?? loadPayrollCategories();
  const earningsByEmployee = options.earningsByEmployee ?? {};
  const deductionsByEmployee = options.deductionsByEmployee ?? {};

  const cellAmount = (
    map: AmountOverrides,
    empId: string,
    code: string,
    fallback: number,
  ): number => {
    const row = map[empId];
    if (!row) return fallback;
    const v = row[code];
    return typeof v === 'number' ? v : fallback;
  };
  const earnings = all
    .filter((c) => c.kind === 'earning' && c.enabled)
    .sort((a, b) => a.order - b.order);
  const deductions = all
    .filter((c) => c.kind === 'deduction' && c.enabled)
    .sort((a, b) => a.order - b.order);

  // Earnings row and deductions row stack vertically — so the header block
  // must be wide enough to fit whichever side has more columns.
  const widest = Math.max(earnings.length, deductions.length);
  const totalCols = CATEGORY_START_COL + widest; // columns 0..(CATEGORY_START_COL + widest - 1)

  const wb = XLSX.utils.book_new();
  const wsData: any[][] = [];

  const [month, year] = monthYear.split('-');

  // Row 0: Title (merged across all columns)
  wsData.push([`${year} Year ${month} Month Payroll`]);

  // Row 1: Earnings header (shared Emp No/Name/Net cells merge into row 2)
  const earningsHeader: any[] = [
    'Employee No.',
    'Employee Name',
    'Net Salary',
    'Total Earnings',
    ...earnings.map((c) => c.label),
  ];
  // pad to totalCols so the columns align
  while (earningsHeader.length < totalCols) earningsHeader.push('');
  wsData.push(earningsHeader);

  // Row 2: Deductions header (Emp No/Name/Net are merged from above)
  const deductionsHeader: any[] = [
    '', // Employee No. (merged)
    '', // Employee Name (merged)
    '', // Net Salary (merged)
    'Total Deductions',
    ...deductions.map((c) => c.label),
  ];
  while (deductionsHeader.length < totalCols) deductionsHeader.push('');
  wsData.push(deductionsHeader);

  // Employee data: 2 rows per employee
  employees.forEach((employee) => {
    const earningsRow: any[] = [
      employee.id,
      employee.name,
      '',                                         // Net Salary (formula)
      '',                                         // Total Earnings (formula)
      ...earnings.map((c) => cellAmount(earningsByEmployee, employee.id, c.code, c.defaultAmount || 0)),
    ];
    while (earningsRow.length < totalCols) earningsRow.push('');
    wsData.push(earningsRow);

    const deductionsRow: any[] = [
      '',
      '',
      '',
      '',                                         // Total Deductions (formula)
      ...deductions.map((c) => cellAmount(deductionsByEmployee, employee.id, c.code, c.defaultAmount || 0)),
    ];
    while (deductionsRow.length < totalCols) deductionsRow.push('');
    wsData.push(deductionsRow);
  });

  // Total row — just a bookmark for the parser to stop.
  const totalRow: any[] = ['Total', `${employees.length} payroll(s)`];
  while (totalRow.length < totalCols) totalRow.push('');
  wsData.push(totalRow);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  const cols: { wch: number }[] = [
    { wch: 15 }, // A: Employee No.
    { wch: 20 }, // B: Employee Name
    { wch: 12 }, // C: Net Salary
    { wch: 15 }, // D: Totals
  ];
  for (let c = 0; c < widest; c++) {
    const label =
      earnings[c]?.label?.length ?? 0 > (deductions[c]?.label?.length ?? 0)
        ? earnings[c]?.label ?? deductions[c]?.label ?? ''
        : deductions[c]?.label ?? '';
    cols.push({ wch: Math.max(12, (label?.length ?? 0) + 2) });
  }
  ws['!cols'] = cols;

  // Title row merged across all columns
  ws['!merges'] = ws['!merges'] || [];
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });

  // Header merges: Emp No. / Name / Net span rows 1–2
  ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } });
  ws['!merges'].push({ s: { r: 1, c: 1 }, e: { r: 2, c: 1 } });
  ws['!merges'].push({ s: { r: 1, c: 2 }, e: { r: 2, c: 2 } });

  // Per-employee merges + total/net formulas
  for (let i = 0; i < employees.length; i++) {
    const startRow = 3 + i * 2;                   // 0-indexed
    const earningsRowExcel = startRow + 1;        // 1-indexed for Excel formulas
    const deductionsRowExcel = startRow + 2;

    ws['!merges'].push({ s: { r: startRow, c: 0 }, e: { r: startRow + 1, c: 0 } });
    ws['!merges'].push({ s: { r: startRow, c: 1 }, e: { r: startRow + 1, c: 1 } });
    ws['!merges'].push({ s: { r: startRow, c: 2 }, e: { r: startRow + 1, c: 2 } });

    // Total Earnings = sum of earning columns (E..)
    const earnStart = XLSX.utils.encode_col(CATEGORY_START_COL);
    const earnEnd = XLSX.utils.encode_col(CATEGORY_START_COL + earnings.length - 1);
    if (earnings.length > 0) {
      ws[XLSX.utils.encode_cell({ r: startRow, c: 3 })] = {
        f: `SUM(${earnStart}${earningsRowExcel}:${earnEnd}${earningsRowExcel})`,
      };
    }

    // Total Deductions = sum of deduction columns
    if (deductions.length > 0) {
      const dedEnd = XLSX.utils.encode_col(CATEGORY_START_COL + deductions.length - 1);
      ws[XLSX.utils.encode_cell({ r: startRow + 1, c: 3 })] = {
        f: `SUM(${earnStart}${deductionsRowExcel}:${dedEnd}${deductionsRowExcel})`,
      };
    }

    // Net Salary = Total Earnings - Total Deductions (cell D of the two rows)
    ws[XLSX.utils.encode_cell({ r: startRow, c: 2 })] = {
      f: `D${earningsRowExcel}-D${deductionsRowExcel}`,
    };
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Payroll');
  XLSX.writeFile(wb, `${monthYear}-Payroll.xlsx`);
}
