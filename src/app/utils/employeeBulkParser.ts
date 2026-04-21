import * as XLSX from 'xlsx';
import { Employee } from '../types/hrms';

export interface ParsedEmployeeRow {
  rowNumber: number;
  data: Partial<Employee>;
  errors: string[];
  warnings: string[];
}

export interface ParsedEmployeeData {
  employees: ParsedEmployeeRow[];
  errors: string[];              // file-level errors
  totalRows: number;
  validRows: number;
}

const COLUMN_MAP: Record<string, keyof Employee> = {
  'Employee ID': 'id',
  'ID': 'id',
  'Name': 'name',
  'Full Name': 'name',
  'Khmer Name': 'khmerName',
  'Email': 'email',
  'Position': 'position',
  'Department': 'department',
  'Join Date': 'joinDate',
  'Contact': 'contactNumber',
  'Contact Number': 'contactNumber',
  'Phone': 'contactNumber',
  'Base Salary': 'baseSalary',
  'Salary': 'baseSalary',
  'Gender': 'gender',
  'Date of Birth': 'dateOfBirth',
  'DOB': 'dateOfBirth',
  'Place of Birth': 'placeOfBirth',
  'Current Address': 'currentAddress',
  'Address': 'currentAddress',
  'NFF No': 'nffNo',
  'TID': 'tid',
  'Contract Expire': 'contractExpireDate',
  'Contract Expire Date': 'contractExpireDate',
  'Bank Name': 'bankName',
  'Bank': 'bankName',
  'Account Number': 'bankAccount',
  'Bank Account': 'bankAccount',
};

function normaliseDate(v: any): string | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') {
    // Excel serial date
    const date = XLSX.SSF?.parse_date_code(v);
    if (date) {
      const mm = String(date.m).padStart(2, '0');
      const dd = String(date.d).padStart(2, '0');
      return `${date.y}-${mm}-${dd}`;
    }
  }
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return String(v);
}

export function parseEmployeesExcel(
  file: File,
  knownIds: string[] = [],
  knownEmails: string[] = [],
): Promise<ParsedEmployeeData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];

        const employees: ParsedEmployeeRow[] = [];
        const fileErrors: string[] = [];
        const knownIdSet = new Set(knownIds.map(s => s.toUpperCase()));
        const knownEmailSet = new Set(knownEmails.map(s => s.toLowerCase()));
        const seenIds = new Set<string>();
        const seenEmails = new Set<string>();

        if (rows.length === 0) {
          fileErrors.push('The file contains no data rows.');
        }

        rows.forEach((raw, i) => {
          const rowNumber = i + 2; // +1 for header, +1 for 1-based numbering
          const rowErrors: string[] = [];
          const rowWarnings: string[] = [];
          const parsed: Partial<Employee> = {};

          // Map columns tolerantly
          for (const [header, value] of Object.entries(raw)) {
            const key = COLUMN_MAP[header.trim()];
            if (!key) continue;
            if (value === '' || value == null) continue;
            if (key === 'baseSalary') {
              const n = typeof value === 'number' ? value : parseFloat(String(value));
              if (!Number.isFinite(n)) rowErrors.push(`Base Salary "${value}" is not a number`);
              else if (n < 0) rowErrors.push('Base Salary cannot be negative');
              else (parsed as any)[key] = n;
            } else if (key === 'joinDate' || key === 'dateOfBirth' || key === 'contractExpireDate') {
              (parsed as any)[key] = normaliseDate(value);
            } else if (key === 'gender') {
              const v = String(value).toLowerCase();
              (parsed as any)[key] = v === 'male' || v === 'female' ? v : undefined;
            } else {
              (parsed as any)[key] = String(value).trim();
            }
          }

          // Mandatory fields
          if (!parsed.id) rowErrors.push('Employee ID is missing');
          if (!parsed.name) rowErrors.push('Name is missing');
          if (!parsed.email) rowErrors.push('Email is missing');
          else if (!/^\S+@\S+\.\S+$/.test(parsed.email)) rowErrors.push('Email is not valid');
          if (!parsed.position) rowErrors.push('Position is missing');
          if (!parsed.department) rowErrors.push('Department is missing');
          if (!parsed.joinDate) rowErrors.push('Join Date is missing');
          if (parsed.baseSalary == null) rowErrors.push('Base Salary is missing');

          // Duplicate / collision checks
          if (parsed.id) {
            const up = parsed.id.toUpperCase();
            if (knownIdSet.has(up)) rowErrors.push(`Employee ID "${parsed.id}" already exists`);
            if (seenIds.has(up)) rowErrors.push(`Duplicate Employee ID within this file: "${parsed.id}"`);
            seenIds.add(up);
          }
          if (parsed.email) {
            const lo = parsed.email.toLowerCase();
            if (knownEmailSet.has(lo)) rowErrors.push(`Email "${parsed.email}" already exists`);
            if (seenEmails.has(lo)) rowErrors.push(`Duplicate email within this file: "${parsed.email}"`);
            seenEmails.add(lo);
          }

          // Soft warnings
          if (parsed.bankName && !parsed.bankAccount) rowWarnings.push('Bank selected but Account Number missing');
          if (!parsed.contactNumber) rowWarnings.push('No contact number provided');

          parsed.status = 'active';

          employees.push({ rowNumber, data: parsed, errors: rowErrors, warnings: rowWarnings });
        });

        const validRows = employees.filter(e => e.errors.length === 0).length;

        resolve({
          employees,
          errors: fileErrors,
          totalRows: employees.length,
          validRows,
        });
      } catch (err) {
        reject(new Error(`Failed to parse file: ${err instanceof Error ? err.message : 'unknown'}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  });
}

export function downloadEmployeeTemplate() {
  const wb = XLSX.utils.book_new();
  const headers = [
    'Employee ID', 'Name', 'Khmer Name', 'Email', 'Position', 'Department',
    'Join Date', 'Base Salary', 'Gender', 'Date of Birth', 'Contact Number',
    'Place of Birth', 'Current Address', 'NFF No', 'TID', 'Contract Expire',
    'Bank Name', 'Account Number',
  ];
  const example = [
    'EMP128', 'Dara Sok', 'តារា សុខ', 'dara@company.com', 'Junior Developer', 'Engineering',
    '2026-04-22', 2800, 'male', '1996-03-14', '+855-12-345-678',
    'Phnom Penh', '123 Main St, Phnom Penh', 'NFF000128', 'TID000128', '2028-04-22',
    'ABA', '000-123-456',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  XLSX.writeFile(wb, 'Employees-Template.xlsx');
}
