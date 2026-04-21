import * as XLSX from 'xlsx';
import { PayrollCategory } from '../types/settings';
import { loadPayrollCategories } from './payrollCategories';

// Dynamic payroll preview shape.
// Earnings/deductions are keyed by category.code so admin-defined custom
// categories flow through the pipeline the same way as built-ins.
export interface PayrollPreviewData {
  employeeNo: string;
  employeeName: string;
  netSalary: number;
  totalEarnings: number;
  totalDeductions: number;
  earnings: Record<string, number>;     // { basic: 500, position: 100, ... }
  deductions: Record<string, number>;   // { tax: 50, nssf: 10, ... }
  rowNumber?: number;        // 1-based Excel row
  errors?: string[];         // row-level errors (block upload)
  warnings?: string[];       // row-level warnings (allow upload)
}

export interface ParsedPayrollData {
  employees: PayrollPreviewData[];
  errors: string[];          // all errors (file-level + row-level) — blocks upload
  warnings: string[];        // non-blocking advisories
  totalEmployees: number;
  validEmployees: number;    // employees with no errors
  /** Snapshot of the categories used to parse — so the UI can render using
   *  the same ordering the file was interpreted with. */
  categoriesAtParseTime: PayrollCategory[];
}

export interface ParsePayrollOptions {
  knownEmployeeIds?: string[]; // if provided, each empNo must appear in this list
  /** Inject categories for testing; defaults to loadPayrollCategories() */
  categories?: PayrollCategory[];
}

const MATH_TOLERANCE = 0.01;

// Column layout inside each 2-row employee block:
//   A (0): Employee No.   (merged across both rows)
//   B (1): Employee Name  (merged across both rows)
//   C (2): Net Salary     (merged across both rows, often empty)
//   D (3): Total Earnings / Total Deductions (per row)
//   E+ (4..): enabled earning or deduction amounts in category order
const CATEGORY_START_COL = 4;

export function parsePayrollExcel(
  file: File,
  options: ParsePayrollOptions = {},
): Promise<ParsedPayrollData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const allCategories = options.categories ?? loadPayrollCategories();
        const enabledEarnings = allCategories
          .filter((c) => c.kind === 'earning' && c.enabled)
          .sort((a, b) => a.order - b.order);
        const enabledDeductions = allCategories
          .filter((c) => c.kind === 'deduction' && c.enabled)
          .sort((a, b) => a.order - b.order);

        const employees: PayrollPreviewData[] = [];
        const errors: string[] = [];
        const warnings: string[] = [];

        const knownIds = options.knownEmployeeIds
          ? new Set(options.knownEmployeeIds.map(id => id.toUpperCase()))
          : null;
        const seenEmpNos = new Map<string, number>(); // empNo -> first row number

        // WABOOKS format: Row 0 title, Rows 1-2 headers, data from row 3.
        // Each employee = 2 rows (earnings row then deductions row).
        const dataStartRow = 3;

        for (let i = dataStartRow; i < rawData.length; i += 2) {
          const earningsRow = rawData[i];
          const deductionsRow = rawData[i + 1];

          if (!earningsRow || !deductionsRow) break;
          if (earningsRow[0] === 'Total') break;
          if (!earningsRow[0] && !earningsRow[1]) continue;

          const rowNumber = i + 1; // Excel is 1-based
          const rowErrors: string[] = [];
          const rowWarnings: string[] = [];

          const employeeNo = earningsRow[0]?.toString().trim() || '';
          const employeeName = earningsRow[1]?.toString().trim() || '';

          if (!employeeNo) rowErrors.push('Missing employee number');
          if (!employeeName) rowErrors.push('Missing employee name');

          if (employeeNo && knownIds && !knownIds.has(employeeNo.toUpperCase())) {
            rowErrors.push(`Unknown employee "${employeeNo}" — not in master list`);
          }

          if (employeeNo) {
            const previousRow = seenEmpNos.get(employeeNo.toUpperCase());
            if (previousRow != null) {
              rowErrors.push(`Duplicate employee "${employeeNo}" — already on row ${previousRow}`);
            } else {
              seenEmpNos.set(employeeNo.toUpperCase(), rowNumber);
            }
          }

          const parseNum = (v: any, label: string): number => {
            if (v === null || v === undefined || v === '') return 0;
            const n = typeof v === 'number' ? v : parseFloat(String(v));
            if (!Number.isFinite(n)) {
              rowErrors.push(`${label} is not a number ("${v}")`);
              return 0;
            }
            if (n < 0) {
              rowErrors.push(`${label} cannot be negative (${n})`);
            }
            return n;
          };

          // Read each enabled earning from its mapped column.
          const earnings: Record<string, number> = {};
          enabledEarnings.forEach((cat, idx) => {
            earnings[cat.code] = parseNum(earningsRow[CATEGORY_START_COL + idx], cat.label);
          });

          const deductions: Record<string, number> = {};
          enabledDeductions.forEach((cat, idx) => {
            deductions[cat.code] = parseNum(deductionsRow[CATEGORY_START_COL + idx], cat.label);
          });

          const declaredTotalEarnings = parseNum(earningsRow[3], 'Total earnings');
          const declaredTotalDeductions = parseNum(deductionsRow[3], 'Total deductions');

          const computedEarnings = +Object.values(earnings).reduce((s, n) => s + n, 0).toFixed(2);
          const computedDeductions = +Object.values(deductions).reduce((s, n) => s + n, 0).toFixed(2);

          if (declaredTotalEarnings > 0 && Math.abs(declaredTotalEarnings - computedEarnings) > MATH_TOLERANCE) {
            rowErrors.push(`Total earnings mismatch: file says $${declaredTotalEarnings.toFixed(2)}, components sum to $${computedEarnings.toFixed(2)}`);
          }
          if (declaredTotalDeductions > 0 && Math.abs(declaredTotalDeductions - computedDeductions) > MATH_TOLERANCE) {
            rowErrors.push(`Total deductions mismatch: file says $${declaredTotalDeductions.toFixed(2)}, components sum to $${computedDeductions.toFixed(2)}`);
          }

          const totalEarnings = computedEarnings;
          const totalDeductions = computedDeductions;
          const netSalary = +(totalEarnings - totalDeductions).toFixed(2);

          if (totalEarnings === 0 && totalDeductions === 0) {
            rowWarnings.push('All amounts are zero');
          }
          if (netSalary < 0) {
            rowWarnings.push(`Negative net salary ($${netSalary.toFixed(2)}) — deductions exceed earnings`);
          }

          rowErrors.forEach(msg => errors.push(`Row ${rowNumber}: ${msg}`));
          rowWarnings.forEach(msg => warnings.push(`Row ${rowNumber}: ${msg}`));

          employees.push({
            employeeNo,
            employeeName,
            netSalary,
            totalEarnings,
            totalDeductions,
            earnings,
            deductions,
            rowNumber,
            errors: rowErrors.length ? rowErrors : undefined,
            warnings: rowWarnings.length ? rowWarnings : undefined,
          });
        }

        if (employees.length === 0 && errors.length === 0) {
          errors.push('No employee data found in the file');
        }

        const validEmployees = employees.filter(e => !e.errors || e.errors.length === 0).length;

        resolve({
          employees,
          errors,
          warnings,
          totalEmployees: employees.length,
          validEmployees,
          categoriesAtParseTime: allCategories,
        });
      } catch (error) {
        reject(new Error(`Failed to parse Excel file: ${error}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsBinaryString(file);
  });
}
