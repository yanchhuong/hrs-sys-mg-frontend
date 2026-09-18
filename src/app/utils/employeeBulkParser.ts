import { loadXlsx } from './xlsxLoader';
import { Employee } from '../types/hrms';
import { parseIdTypeCell, formatIdTypeCell, visaExpireFor } from './idType';

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
  // ID document type (V352). 'nationalityType' is the source of truth and
  // the only one of the three ID columns a sheet may carry: 'tidType' is
  // derived at request-build time, because a file able to set the two
  // independently is exactly how a row ends up claiming "National ID" and
  // "PA" at once — the bug the merged UI control was built to kill.
  // 'TID Type' is deliberately NOT an alias. A roster carrying that header
  // predates V352, where 'PA' meant "personal account" and said nothing
  // about nationality, so reading it here would silently reclassify
  // tax-id rows as passport holders — the one case idType.ts says to
  // resolve by hand. 'Nationality' is out for the mirror-image reason: it
  // holds a country ("Cambodian"), not a document type.
  // NO ALIASES. 'Identity Type' and especially 'Document Type' are
  // generic HR headers that existing rosters already use for something
  // else entirely ('Contract', 'NDA', 'Work Permit'). Mapping them
  // here turned a file that imported cleanly yesterday into one where
  // EVERY row fails on a column the operator never touched.
  'ID Type': 'nationalityType',
  // Only meaningful alongside 'ID Type' = Passport; the export writes it
  // through visaExpireFor so a stale date never round-trips.
  'Visa Expire': 'visaExpireDate',
  'Visa Expire Date': 'visaExpireDate',
  'Contract Expire': 'contractExpireDate',
  'Contract Expire Date': 'contractExpireDate',
  'Bank Name': 'bankName',
  'Bank': 'bankName',
  'Account Number': 'bankAccount',
  'Bank Account': 'bankAccount',
  // Reports-to ladder (V349). The cells carry the manager's Employee ID
  // (empNo) — not a name, not a UUID — so an exported file re-imports with
  // its ladder intact. The importer turns them into UUIDs after every row
  // of the upload exists; see BulkUploadEmployeesDialog's second pass.
  // 'Reports To' is deliberately NOT an alias. It is the label the
  // Employees UI puts on this field, so a hand-maintained roster is the
  // likely place to already have that column holding a manager's NAME —
  // which would parse as an empNo ref and never resolve.
  'Manager 1 ID': 'managerId',
  'Manager 1': 'managerId',
  'Manager ID': 'managerId',
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
function normaliseDate(v: any, XLSX: typeof import('xlsx')): string | null | undefined {
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
  return loadXlsx().then(XLSX => new Promise((resolve, reject) => {
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
            } else if (key === 'joinDate' || key === 'dateOfBirth'
                       || key === 'contractExpireDate' || key === 'visaExpireDate') {
              const iso = normaliseDate(value, XLSX);
              if (iso === null) {
                // Present but unparseable — emit a visible error rather than
                // sending garbage to the backend (which would 400 the POST).
                const label = key === 'joinDate' ? 'Join Date'
                  : key === 'dateOfBirth' ? 'Date of Birth'
                  : key === 'visaExpireDate' ? 'Visa Expire'
                  : 'Contract Expire';
                const msg = `${label} "${value}" is not a valid date (use YYYY-MM-DD or DD-MM-YYYY)`;
                // Visa Expire is a column this release STARTED reading, so
                // rosters already carrying it were never written to be
                // parseable — 'N/A', '-', 'TBD', 'see passport' are all
                // normal in the wild. Failing those rows would block an
                // import that worked yesterday, over a field the operator
                // did not add. Warn and skip the value instead. The other
                // three dates have always been read, so their hard error
                // stays: changing it would hide real typos.
                if (key === 'visaExpireDate') rowWarnings.push(`${msg} — ignored`);
                else rowErrors.push(msg);
              } else if (iso !== undefined) {
                (parsed as any)[key] = iso;
              }
            } else if (key === 'department') {
              // Export writes the "no department" placeholder ('-'/'—') for
              // an employee whose departmentId is unset or unknown. Letting
              // it through would make the backend find-or-create a real
              // Department literally named "-" on the round trip.
              const v = String(value).trim();
              if (v && v !== '-' && v !== '—') (parsed as any)[key] = v;
            } else if (key === 'gender') {
              const v = String(value).toLowerCase();
              (parsed as any)[key] = v === 'male' || v === 'female' ? v : undefined;
            } else if (key === 'nationalityType') {
              // parseIdTypeCell returns undefined for "no value here", and an
              // import must leave the column alone in that case rather than
              // default to national_id: PUT /employees is a full replace of
              // the three ID columns, so a default would stamp a document
              // type onto every row of a file that never had the column, and
              // would demote every passport holder on a re-import of an
              // export that predates the column. The drawer can default —
              // a human sees the select before saving — an upload cannot.
              // Unparseable is an error, not a guess: picking the wrong side
              // silently rewrites which document the person was hired on.
              const nt = parseIdTypeCell(value);
              if (nt === null) {
                rowErrors.push(`ID Type "${value}" is not valid (use National ID or Passport)`);
              } else if (nt !== undefined) {
                (parsed as any)[key] = nt;
              }
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
          // Employee ID is validated up-front (format + uniqueness) at parse
          // time — not deferred to the Import button — so the user sees
          // problems as soon as the file is read.
          if (!parsed.id) {
            rowErrors.push('Employee ID is missing');
          } else {
            if (parsed.id.length > 32) {
              rowErrors.push(`Employee ID "${parsed.id}" exceeds 32 characters`);
            }
            if (!/^[A-Za-z0-9._\- ]+$/.test(parsed.id)) {
              rowErrors.push(`Employee ID "${parsed.id}" contains invalid characters`);
            }
          }
          if (!parsed.name) rowErrors.push('Name is missing');
          if (!parsed.email) rowErrors.push('Email is missing');
          else if (!/^\S+@\S+\.\S+$/.test(parsed.email)) rowErrors.push('Email is not valid');
          if (!parsed.position) rowWarnings.push('No position — can be assigned later');
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
          // A visa date only persists on a Passport row — visaExpireFor()
          // drops it otherwise, which is correct but was invisible: HR
          // copies the template example down (it ships 'National ID'),
          // fills Visa Expire for 80 expats, every row imports 'success'
          // and all 80 dates land NULL. Say so before they press Import.
          if (parsed.visaExpireDate && parsed.nationalityType !== 'passport') {
            rowWarnings.push(parsed.nationalityType
              ? 'Visa Expire is only saved when ID Type is Passport — this date will be dropped'
              : 'Visa Expire needs an ID Type of Passport to be saved — set it or this date is dropped');
          }
          if (parsed.bankName && !parsed.bankAccount) rowWarnings.push('Bank selected but Account Number missing');
          if (!parsed.contactNumber) rowWarnings.push('No contact number provided');

          // Only the direct leader is stored — the levels above are
          // derived by walking the chain — so the one thing a file can
          // get wrong here is pointing someone at themselves, which the
          // server rejects. A warning, not an error: the rest of the row
          // is importable and the import reports the failure per row.
          if (parsed.managerId && parsed.id
              && parsed.managerId.toUpperCase() === parsed.id.toUpperCase()) {
            rowWarnings.push('Manager is this employee — it will be rejected on import');
          }

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
  }));
}

/** Canonical column order for the Bulk Upload template and the
 *  "Export Excel" round-trip. Keep these in sync with COLUMN_MAP above
 *  so the file the Export button produces is re-importable as-is. */
const EXPORT_HEADERS = [
  'Employee ID', 'Name', 'Khmer Name', 'Email', 'Position', 'Department',
  'Join Date', 'Base Salary', 'Gender', 'Date of Birth', 'Contact Number',
  'Place of Birth', 'Current Address', 'NFF No', 'ID Type', 'TID', 'Visa Expire',
  'Contract Expire',
  'Bank Name', 'Account Number',
  'Manager 1 ID',
] as const;

export function downloadEmployeeTemplate() {
  void loadXlsx().then(XLSX => {
    const wb = XLSX.utils.book_new();
    const example = [
      'EMP128', 'Dara Sok', 'តារា សុខ', 'dara@company.com', 'Junior Developer', 'Engineering',
      '2026-04-22', 2800, 'male', '1996-03-14', '+855-12-345-678',
      // The TID cell is the bare number: the prefix is rendered from ID
      // Type ("National ID 000128"), so a 'TID000128' example teaches HR to
      // bake it in and the roster prints it twice. Visa Expire is blank
      // because this example row is a National ID holder.
      'Phnom Penh', '123 Main St, Phnom Penh', 'NFF000128', 'National ID', '000128', '',
      '2028-04-22',
      'ABA', '000-123-456',
      // The manager is named by their Employee ID, not their name. Only
      // the direct leader is imported — the levels above are derived
      // from the chain, so there is nothing else to fill in.
      'EMP001',
    ];
    const ws = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS as unknown as string[], example]);
    ws['!cols'] = EXPORT_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, 'Employees-Template.xlsx');
  });
}

/**
 * Export the given employee list to an Excel workbook in the same
 * column order Upload Bulk expects, so the file can round-trip back
 * through the importer without any reshaping.
 *
 * Department names (not UUIDs) are written out — the importer looks up
 * the matching dept by name. `deptNameById` resolves the live-mode
 * `Employee.department` UUID to the human-readable name; pass an
 * identity function for mock mode where `department` already is a name.
 *
 * The three manager columns are written as Employee IDs for the same
 * reason — a raw UUID means nothing to the person editing the file, and
 * the importer can't resolve one either. `lookupPool` is the roster the
 * manager refs are resolved against: pass the FULL employee list, not
 * the filtered rows being exported, or a manager sitting outside the
 * current filter writes a blank cell that reads as "has no manager".
 */
export function exportEmployeesToExcel(
  employees: Employee[],
  deptNameById: (idOrName: string | undefined) => string,
  lookupPool: Employee[] = employees,
  filename = `Employees-${new Date().toISOString().slice(0, 10)}.xlsx`,
): void {
  void loadXlsx().then(XLSX => {
    // Manager fields hold the backend UUID in live mode and the empNo in
    // mock mode, so key the lookup on both. A manager missing from the
    // pool entirely has no Employee ID to write — leave the cell empty
    // rather than emit a UUID the importer would reject.
    const empNoByRef = new Map<string, string>();
    lookupPool.forEach(e => {
      if (e.apiId) empNoByRef.set(e.apiId, e.id);
      if (e.id) empNoByRef.set(e.id, e.id);
    });
    const managerEmpNo = (ref: string | undefined) => (ref ? empNoByRef.get(ref) ?? '' : '');

    const rows: (string | number)[][] = employees.map(e => [
      e.id ?? '',
      e.name ?? '',
      e.khmerName ?? '',
      e.email ?? '',
      e.position ?? '',
      deptNameById(e.department) || '',
      e.joinDate ?? '',
      e.baseSalary ?? 0,
      e.gender ?? '',
      e.dateOfBirth ?? '',
      e.contactNumber ?? '',
      e.placeOfBirth ?? '',
      e.currentAddress ?? '',
      e.nffNo ?? '',
      // Without this cell the round trip was lossy in the worst direction:
      // export → edit → bulk upload read every passport holder back as a
      // National ID row and dropped their visa expiry. Blank stays blank
      // (see formatIdTypeCell) so an unset row doesn't acquire a type by
      // passing through Excel, and visaExpireFor drops a date stranded on a
      // row that has since flipped back to National ID.
      formatIdTypeCell(e.nationalityType),
      e.tid ?? '',
      visaExpireFor(e.nationalityType, e.visaExpireDate) ?? '',
      e.contractExpireDate ?? '',
      e.bankName ?? '',
      e.bankAccount ?? '',
      managerEmpNo(e.managerId),
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS as unknown as string[], ...rows]);
    ws['!cols'] = EXPORT_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, filename);
  });
}
