import * as XLSX from 'xlsx';

export interface PayrollPreviewData {
  employeeNo: string;
  employeeName: string;
  netSalary: number;
  totalEarnings: number;
  basicSalary: number;
  positionAllowance: number;
  overtime: number;
  annualAllowance: number;
  seniorityAllowance: number;
  bonus: number;
  totalDeductions: number;
  withholdingTax: number;
  advancedPayment: number;
  loan: number;
  nssfPension: number;
  others: number;
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
}

export interface ParsePayrollOptions {
  knownEmployeeIds?: string[]; // if provided, each empNo must appear in this list
}

const MATH_TOLERANCE = 0.01;

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

          // Unknown employee
          if (employeeNo && knownIds && !knownIds.has(employeeNo.toUpperCase())) {
            rowErrors.push(`Unknown employee "${employeeNo}" — not in master list`);
          }

          // Duplicate detection
          if (employeeNo) {
            const previousRow = seenEmpNos.get(employeeNo.toUpperCase());
            if (previousRow != null) {
              rowErrors.push(`Duplicate employee "${employeeNo}" — already on row ${previousRow}`);
            } else {
              seenEmpNos.set(employeeNo.toUpperCase(), rowNumber);
            }
          }

          // Numeric parsing — detect invalid numbers separately from zero
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

          const basicSalary = parseNum(earningsRow[4], 'Basic salary');
          const positionAllowance = parseNum(earningsRow[5], 'Position allowance');
          const overtime = parseNum(earningsRow[6], 'Overtime');
          const annualAllowance = parseNum(earningsRow[7], 'Annual allowance');
          const seniorityAllowance = parseNum(earningsRow[8], 'Seniority allowance');
          const bonus = parseNum(earningsRow[9], 'Bonus');
          const declaredTotalEarnings = parseNum(earningsRow[3], 'Total earnings');

          const withholdingTax = parseNum(deductionsRow[4], 'Withholding tax');
          const advancedPayment = parseNum(deductionsRow[5], 'Advanced payment');
          const loan = parseNum(deductionsRow[6], 'Loan');
          const nssfPension = parseNum(deductionsRow[7], 'NSSF pension');
          const others = parseNum(deductionsRow[8], 'Other deductions');
          const declaredTotalDeductions = parseNum(deductionsRow[3], 'Total deductions');

          // Compute expected totals (authoritative)
          const computedEarnings = +(basicSalary + positionAllowance + overtime + annualAllowance + seniorityAllowance + bonus).toFixed(2);
          const computedDeductions = +(withholdingTax + advancedPayment + loan + nssfPension + others).toFixed(2);

          // Math consistency check against declared totals (if user filled them in)
          if (declaredTotalEarnings > 0 && Math.abs(declaredTotalEarnings - computedEarnings) > MATH_TOLERANCE) {
            rowErrors.push(`Total earnings mismatch: file says $${declaredTotalEarnings.toFixed(2)}, components sum to $${computedEarnings.toFixed(2)}`);
          }
          if (declaredTotalDeductions > 0 && Math.abs(declaredTotalDeductions - computedDeductions) > MATH_TOLERANCE) {
            rowErrors.push(`Total deductions mismatch: file says $${declaredTotalDeductions.toFixed(2)}, components sum to $${computedDeductions.toFixed(2)}`);
          }

          const totalEarnings = computedEarnings;
          const totalDeductions = computedDeductions;
          const netSalary = +(totalEarnings - totalDeductions).toFixed(2);

          // Warning: fully zero row
          if (totalEarnings === 0 && totalDeductions === 0) {
            rowWarnings.push('All amounts are zero');
          }
          // Warning: negative net salary (deductions > earnings)
          if (netSalary < 0) {
            rowWarnings.push(`Negative net salary ($${netSalary.toFixed(2)}) — deductions exceed earnings`);
          }

          // Accumulate into top-level lists, prefixed with row reference
          rowErrors.forEach(msg => errors.push(`Row ${rowNumber}: ${msg}`));
          rowWarnings.forEach(msg => warnings.push(`Row ${rowNumber}: ${msg}`));

          employees.push({
            employeeNo,
            employeeName,
            netSalary,
            totalEarnings,
            basicSalary,
            positionAllowance,
            overtime,
            annualAllowance,
            seniorityAllowance,
            bonus,
            totalDeductions,
            withholdingTax,
            advancedPayment,
            loan,
            nssfPension,
            others,
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
