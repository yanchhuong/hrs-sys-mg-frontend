import * as XLSX from 'xlsx';

interface Employee {
  id: string;
  name: string;
  [key: string]: any;
}

export function downloadPayrollTemplate(employees: Employee[], monthYear: string = '04-2026') {
  // Create a new workbook
  const wb = XLSX.utils.book_new();

  // Create worksheet data with the WABOOKS format
  const wsData: any[][] = [];

  // Parse month and year
  const [month, year] = monthYear.split('-');

  // Row 1: Title
  wsData.push([`${year} Year ${month} Month Payroll`]);

  // Row 2-3: Two-row stacked headers
  wsData.push([
    'Employee No.',
    'Employee Name',
    'Net Salary',
    'Total Earnings',
    'Basic Salary',
    'Position Allowance',
    'OverTime',
    'Annual Allowance',
    'Seniority allowance',
    'Bonus'
  ]);

  wsData.push([
    '', // Employee No. (merged)
    '', // Employee Name (merged)
    '', // Net Salary (merged)
    'Total Deductions',
    'Withholding TAX',
    'Advanced Payment',
    'Loan',
    'NSSF PENSION',
    'Others',
    '' // Empty
  ]);

  // Add all employees from the staff list
  employees.forEach((employee) => {
    // Earnings row
    wsData.push([
      employee.id,           // Employee No.
      employee.name,         // Employee Name
      '',                    // Net Salary (will be calculated)
      '',                    // Total Earnings (will be calculated)
      0,                     // Basic Salary
      0,                     // Position Allowance
      0,                     // OverTime
      0,                     // Annual Allowance
      0,                     // Seniority allowance
      0                      // Bonus
    ]);

    // Deductions row
    wsData.push([
      '',                    // Employee No. (merged)
      '',                    // Employee Name (merged)
      '',                    // Net Salary (merged)
      '',                    // Total Deductions (will be calculated)
      0,                     // Withholding TAX
      0,                     // Advanced Payment
      0,                     // Loan
      0,                     // NSSF PENSION
      0,                     // Others
      ''                     // Empty
    ]);
  });

  // Add Total row
  wsData.push(['Total', `${employees.length} payroll(s)`, '', '', '', '', '', '', '', '']);

  // Create worksheet from data
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 15 }, // A: Employee No.
    { wch: 20 }, // B: Employee Name
    { wch: 12 }, // C: Net Salary
    { wch: 15 }, // D: Total Earnings/Deductions
    { wch: 15 }, // E: Basic Salary/Tax
    { wch: 18 }, // F: Position/Advanced
    { wch: 12 }, // G: OT/Loan
    { wch: 18 }, // H: Annual/NSSF
    { wch: 18 }, // I: Seniority/Others
    { wch: 12 }  // J: Bonus
  ];

  // Merge cells for title (Row 1, A1:J1)
  ws['!merges'] = ws['!merges'] || [];
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });

  // Merge cells for Employee No., Employee Name, Net Salary in header
  ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }); // Employee No.
  ws['!merges'].push({ s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }); // Employee Name
  ws['!merges'].push({ s: { r: 1, c: 2 }, e: { r: 2, c: 2 } }); // Net Salary

  // Merge cells for each employee (columns A, B, C across 2 rows)
  for (let i = 0; i < employees.length; i++) {
    const startRow = 3 + (i * 2); // Starting row for this employee (0-indexed)
    ws['!merges'].push({ s: { r: startRow, c: 0 }, e: { r: startRow + 1, c: 0 } }); // Employee No.
    ws['!merges'].push({ s: { r: startRow, c: 1 }, e: { r: startRow + 1, c: 1 } }); // Employee Name
    ws['!merges'].push({ s: { r: startRow, c: 2 }, e: { r: startRow + 1, c: 2 } }); // Net Salary

    // Add formulas for each employee
    const earningsRow = startRow + 1; // Convert to 1-indexed for Excel
    const deductionsRow = startRow + 2; // Convert to 1-indexed for Excel

    // Total Earnings = E+F+G+H+I+J
    ws[XLSX.utils.encode_cell({ r: startRow, c: 3 })] = {
      f: `E${earningsRow}+F${earningsRow}+G${earningsRow}+H${earningsRow}+I${earningsRow}+J${earningsRow}`
    };

    // Total Deductions = E+F+G+H+I
    ws[XLSX.utils.encode_cell({ r: startRow + 1, c: 3 })] = {
      f: `E${deductionsRow}+F${deductionsRow}+G${deductionsRow}+H${deductionsRow}+I${deductionsRow}`
    };

    // Net Salary = Total Earnings - Total Deductions
    ws[XLSX.utils.encode_cell({ r: startRow, c: 2 })] = {
      f: `D${earningsRow}-D${deductionsRow}`
    };
  }

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Payroll');

  // Generate file and trigger download with format MM-YYYY-Payroll.xlsx
  XLSX.writeFile(wb, `${monthYear}-Payroll.xlsx`);
}
