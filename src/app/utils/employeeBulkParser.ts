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

/**
 * Returns an ISO `YYYY-MM-DD` string, or `null` if the input is
 * present but unparseable (so the caller can emit a row-level error).
 * Returns `undefined` for genuinely empty input.
 *
 * Formats accepted:
 *   - Excel serial number (number)
 *   - ISO YYYY-MM-DD  (with optional time suffix, e.g. "2014-01-02T00:00:00Z")
 *   - DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY  ← what most Khmer/European Excel exports use
 *   - MM/DD/YYYY      (US Excel default — disambiguated: only when the first
 *     segment can't be a day, e.g. 13/04/2020 stays DD/MM, but 04/13/2020 is MM/DD)
 *   - JS Date-parseable strings, as a last resort
 */
function normaliseDate(v: any): string | null | undefined {
  if (v == null || v === '') return undefined;

  // 1. Excel serial date
  if (typeof v === 'number') {
    const date = XLSX.SSF?.parse_date_code(v);
    if (date) {
      const mm = String(date.m).padStart(2, '0');
      const dd = String(date.d).padStart(2, '0');
      return `${date.y}-${mm}-${dd}`;
    }
    return null;
  }

  const raw = String(v).trim();
  if (!raw) return undefined;

  // 2. ISO YYYY-MM-DD (bare or with a time suffix)
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  // 3. DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY — and a best-effort US fallback
  const parts = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2}|\d{4})$/.exec(raw);
  if (parts) {
    const [, aStr, bStr, yStr] = parts;
    let year = parseInt(yStr, 10);
    if (year < 100) year += (year >= 70 ? 1900 : 2000);   // 2-digit year heuristic
    let a = parseInt(aStr, 10);
    let b = parseInt(bStr, 10);

    // Prefer day-first (DD/MM) when both parts are valid days — this repo's
    // Excel exports are Khmer/European. Flip to month-first only if the
    // first part clearly can't be a day (e.g. 13/04 → day=13, month=04).
    let day: number, month: number;
    if (a > 12 && b <= 12)        { day = a; month = b; }  // unambiguous DD/MM
    else if (b > 12 && a <= 12)   { day = b; month = a; }  // unambiguous MM/DD
    else                          { day = a; month = b; }  // ambiguous → DD/MM

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    return null;
  }

  // 4. Last resort — let JS Date have a go
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
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

          // Cheap upfront skip — raw row has no cell with real content at all.
          const hasAnyValue = Object.values(raw).some(
            v => v !== '' && v != null && String(v).trim() !== '',
          );
          if (!hasAnyValue) return;

          const rowErrors: string[] = [];
          const rowWarnings: string[] = [];
          const parsed: Partial<Employee> = {};

          // Map columns tolerantly
          for (const [header, value] of Object.entries(raw)) {
            const key = COLUMN_MAP[header.trim()];
            if (!key) continue;
            if (value === '' || value == null) continue;
            if (typeof value === 'string' && value.trim() === '') continue;
            if (key === 'baseSalary') {
              const n = typeof value === 'number' ? value : parseFloat(String(value));
              if (!Number.isFinite(n)) rowErrors.push(`Base Salary "${value}" is not a number`);
              else if (n < 0) rowErrors.push('Base Salary cannot be negative');
              else (parsed as any)[key] = n;
            } else if (key === 'joinDate' || key === 'dateOfBirth' || key === 'contractExpireDate') {
              const iso = normaliseDate(value);
              if (iso === null) {
                // Present but unparseable — emit a visible error rather than
                // sending garbage to the backend (which would 400 the POST).
                const label = key === 'joinDate' ? 'Join Date'
                  : key === 'dateOfBirth' ? 'Date of Birth'
                  : 'Contract Expire';
                rowErrors.push(`${label} "${value}" is not a valid date (use YYYY-MM-DD or DD-MM-YYYY)`);
              } else if (iso !== undefined) {
                (parsed as any)[key] = iso;
              }
            } else if (key === 'gender') {
              const v = String(value).toLowerCase();
              (parsed as any)[key] = v === 'male' || v === 'female' ? v : undefined;
            } else {
              (parsed as any)[key] = String(value).trim();
            }
          }

          // Second-chance skip: after column mapping, if no identifying field
          // was populated, the row was effectively blank — leftover formatting,
          // hidden cells, or formulas that resolved to nothing. Skip silently.
          if (!parsed.id && !parsed.name && !parsed.email && !parsed.position) return;

          // Mandatory fields. Department is optional — left blank, the row
          // imports without a department and can be assigned later.
          if (!parsed.id) rowErrors.push('Employee ID is missing');
          if (!parsed.name) rowErrors.push('Name is missing');
          if (!parsed.email) rowErrors.push('Email is missing');
          else if (!/^\S+@\S+\.\S+$/.test(parsed.email)) rowErrors.push('Email is not valid');
          if (!parsed.position) rowErrors.push('Position is missing');
          if (!parsed.joinDate) rowErrors.push('Join Date is missing');
          if (parsed.baseSalary == null) rowErrors.push('Base Salary is missing');
          if (!parsed.department) rowWarnings.push('No department — can be assigned later');

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
