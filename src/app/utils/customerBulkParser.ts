/**
 * Customer / Patient / Student bulk-upload parser + template writer.
 *
 * One row per record (no header / continuation grouping). Header set,
 * validation rules, sample data, and sheet name all vary by lens:
 *
 *   - customer — full accounting shape (V79/V109): Individual /
 *     Business + TIN / Representative / Business Type constraints.
 *   - patient  — V187 + V202 fields: Birth Date, Sex, Insurance,
 *     Height, Weight. No business fields.
 *   - student  — V205 fields: Student No, Guardian Name / Phone /
 *     Email, plus the shared Birth Date / Sex / Insurance.
 *     No Height / Weight (per v-school-students-patient-parity).
 *
 * The parser mirrors CustomerService's service-layer validation so
 * an operator sees the same errors client-side that would otherwise
 * come back as 400s halfway through the import.
 *
 * Kind stamping happens at the dialog layer via
 * v-bulk-upload-lens — the parser leaves `kind` off the returned
 * CustomerRequest and the caller spreads `{ ...toCustomerRequest,
 * kind: presentAs }` before POSTing.
 */
import * as XLSX from 'xlsx';
import type {
  Customer, CustomerRequest, CustomerType, BusinessSubType,
  CustomerKind, PatientSex,
} from '../api/customers';

export interface ParsedCustomerRow {
  rowNumber: number;
  data: CustomerRequest;
  errors: string[];
  warnings: string[];
}

export interface ParsedCustomerData {
  customers: ParsedCustomerRow[];
  errors: string[];
  totalCustomers: number;
  validCustomers: number;
}

/* -------------------------------------------------------------------------
 * Per-lens headers + sheet name + template file name
 * ------------------------------------------------------------------------- */

const CUSTOMER_HEADERS = [
  'Type', 'Name', 'Phone', 'Email', 'Address', 'CID',
  'TIN', 'Representative', 'Business Type', 'Site',
] as const;

const PATIENT_HEADERS = [
  'Name', 'Phone', 'Email', 'Address', 'CID',
  'Birth Date', 'Sex', 'Insurance', 'Height (cm)', 'Weight (kg)',
] as const;

const STUDENT_HEADERS = [
  'Student No', 'Name', 'Phone', 'Email', 'Address',
  'Birth Date', 'Sex', 'Insurance',
  'Guardian Name', 'Guardian Phone', 'Guardian Email',
] as const;

const HEADERS_BY_KIND: Record<CustomerKind, ReadonlyArray<string>> = {
  customer: CUSTOMER_HEADERS,
  patient:  PATIENT_HEADERS,
  student:  STUDENT_HEADERS,
};

const SHEET_NAME: Record<CustomerKind, string> = {
  customer: 'Customers',
  patient:  'Patients',
  student:  'Students',
};

const FILE_NAME: Record<CustomerKind, string> = {
  customer: 'Customers-Template.xlsx',
  patient:  'Patients-Template.xlsx',
  student:  'Students-Template.xlsx',
};

const ALLOWED_TYPES: ReadonlySet<string> =
  new Set<CustomerType>(['individual', 'business']);
const ALLOWED_BIZ_TYPES: ReadonlySet<string> =
  new Set<BusinessSubType>(['non_taxable', 'taxable', 'oversee']);
const ALLOWED_SEX: ReadonlySet<string> =
  new Set<PatientSex>(['male', 'female', 'other']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* -------------------------------------------------------------------------
 * Value helpers
 * ------------------------------------------------------------------------- */

function readString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/** Excel serial dates come through as numbers; strings pass through
 *  after a trim + ISO shape check. Returns yyyy-mm-dd or null. */
function readIsoDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  // Excel serial (days since 1900-01-01). xlsx returns them as
  // numbers when cellDates: false.
  if (typeof v === 'number' && Number.isFinite(v)) {
    // 25569 = days between 1900-01-01 and 1970-01-01
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  // Accept yyyy-mm-dd or dd/mm/yyyy or mm/dd/yyyy → normalise.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return s;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function readNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/* -------------------------------------------------------------------------
 * Parse + validate
 * ------------------------------------------------------------------------- */

export function parseCustomersExcel(
  file: File,
  existingCustomers: Customer[] = [],
  kind: CustomerKind = 'customer',
): Promise<ParsedCustomerData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'binary' });
        // Prefer the lens's own sheet name; fall back to the first
        // sheet so an operator who saved with the wrong tab name
        // (or dropped in a plain workbook) still gets a shot.
        const target = SHEET_NAME[kind].toLowerCase();
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === target)
          ?? workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          resolve({ customers: [], errors: ['No sheet found in workbook.'], totalCustomers: 0, validCustomers: 0 });
          return;
        }
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
        resolve(buildCustomers(rows, existingCustomers, kind));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsBinaryString(file);
  });
}

function buildCustomers(
  rows: Record<string, unknown>[],
  existing: Customer[],
  kind: CustomerKind,
): ParsedCustomerData {
  const out: ParsedCustomerRow[] = [];
  const headers = HEADERS_BY_KIND[kind];
  const existingNames = new Set(existing.map(c => c.name.toLowerCase().trim()).filter(Boolean));
  const existingTins  = new Set(existing.map(c => (c.tin ?? '').trim()).filter(Boolean));

  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const isBlank = headers.every(h => readString(row[h]) === '');
    if (isBlank) return;
    out.push(parseRow(row, excelRow, existingNames, existingTins, kind));
  });

  // Within-file dupes — same as before (name warning, TIN blocking).
  const seenName = new Map<string, number>();
  const seenTin  = new Map<string, number>();
  for (const rec of out) {
    const nameKey = rec.data.name.toLowerCase().trim();
    if (nameKey) {
      if (seenName.has(nameKey)) {
        rec.warnings.push(`Duplicate Name — same as row ${seenName.get(nameKey)} in this file.`);
      } else {
        seenName.set(nameKey, rec.rowNumber);
      }
    }
    const tin = (rec.data.tin ?? '').trim();
    if (tin) {
      if (seenTin.has(tin)) {
        rec.errors.push(`Duplicate TIN "${tin}" — also used by row ${seenTin.get(tin)} in this file.`);
      } else {
        seenTin.set(tin, rec.rowNumber);
      }
    }
  }

  const validCustomers = out.filter(r => r.errors.length === 0).length;
  return { customers: out, errors: [], totalCustomers: out.length, validCustomers };
}

function parseRow(
  row: Record<string, unknown>,
  excelRow: number,
  existingNames: Set<string>,
  existingTins: Set<string>,
  kind: CustomerKind,
): ParsedCustomerRow {
  // Shared fields — every lens carries them.
  const name    = readString(row['Name']);
  const phone   = readString(row['Phone']);
  const email   = readString(row['Email']);
  const address = readString(row['Address']);

  const rec: ParsedCustomerRow = {
    rowNumber: excelRow,
    data: {
      // Customer lens keeps its Individual/Business picker;
      // Patient forces business+non_taxable behind the scenes (the
      // dialog's outbound override handles this on save, but the
      // parser produces a request that would round-trip through the
      // manual form's validation too — so we pre-stamp the same
      // values here); Student uses individual.
      type: kind === 'patient' ? 'business' : kind === 'student' ? 'individual' :
            (readString(row['Type']).toLowerCase() as CustomerType) || 'individual',
      name,
      phone: phone || undefined,
      email: email || undefined,
      address: address || undefined,
    },
    errors: [],
    warnings: [],
  };

  if (!name) rec.errors.push('Name is required.');
  if (email && !EMAIL_RE.test(email)) {
    rec.errors.push(`Email "${email}" is not a valid address.`);
  }

  if (kind === 'customer') {
    const rawType = readString(row['Type']).toLowerCase();
    const cid = readString(row['CID']);
    const tin = readString(row['TIN']);
    const representative = readString(row['Representative']);
    const site = readString(row['Site']);
    const bizRaw = readString(row['Business Type']).toLowerCase();
    const type = rec.data.type;

    rec.data.cid = cid || undefined;
    rec.data.tin = tin || undefined;
    rec.data.representative = representative || undefined;
    rec.data.site = site || undefined;
    rec.data.businessType = type === 'business' && bizRaw
      ? (bizRaw as BusinessSubType)
      : undefined;

    if (rawType && !ALLOWED_TYPES.has(rawType)) {
      rec.errors.push(`Type "${row['Type']}" is not one of individual / business.`);
    }
    if (type === 'business') {
      if (!bizRaw) {
        rec.errors.push('Business Type is required for business customers (non_taxable / taxable / oversee).');
      } else if (!ALLOWED_BIZ_TYPES.has(bizRaw)) {
        rec.errors.push(`Business Type "${row['Business Type']}" is not one of non_taxable / taxable / oversee.`);
      }
      if (!representative) {
        rec.errors.push('Representative is required for business customers.');
      }
      if (bizRaw === 'taxable' && !tin) {
        rec.errors.push('TIN is required for Taxable business customers.');
      }
    }
  } else if (kind === 'patient') {
    // Patient rows are forced to business+non_taxable and
    // auto-populate the representative with the patient's own name
    // so the backend's business validation never fires. Matches the
    // manual-form outbound override in Customers.tsx.
    rec.data.cid = readString(row['CID']) || undefined;
    rec.data.businessType = 'non_taxable';
    rec.data.representative = name;

    const dob = readIsoDate(row['Birth Date']);
    if (row['Birth Date'] != null && readString(row['Birth Date']) !== '' && !dob) {
      rec.errors.push(`Birth Date "${row['Birth Date']}" is not a recognisable date (use yyyy-mm-dd).`);
    }
    rec.data.birthDate = dob;

    const sexRaw = readString(row['Sex']).toLowerCase();
    if (sexRaw) {
      if (!ALLOWED_SEX.has(sexRaw)) {
        rec.errors.push(`Sex "${row['Sex']}" must be male / female / other.`);
      } else {
        rec.data.sex = sexRaw as PatientSex;
      }
    }

    rec.data.insurance = readString(row['Insurance']) || undefined;
    rec.data.heightCm = readNumber(row['Height (cm)']);
    rec.data.weightKg = readNumber(row['Weight (kg)']);
  } else /* student */ {
    // Student rows are type='individual'; no business validation
    // fires. The full set of Patient shared fields applies (DoB,
    // Sex, Insurance) but Height + Weight are intentionally absent
    // (v-school-students-patient-parity).
    rec.data.studentNo = readString(row['Student No']) || undefined;

    const dob = readIsoDate(row['Birth Date']);
    if (row['Birth Date'] != null && readString(row['Birth Date']) !== '' && !dob) {
      rec.errors.push(`Birth Date "${row['Birth Date']}" is not a recognisable date (use yyyy-mm-dd).`);
    }
    rec.data.birthDate = dob;

    const sexRaw = readString(row['Sex']).toLowerCase();
    if (sexRaw) {
      if (!ALLOWED_SEX.has(sexRaw)) {
        rec.errors.push(`Sex "${row['Sex']}" must be male / female / other.`);
      } else {
        rec.data.sex = sexRaw as PatientSex;
      }
    }

    rec.data.insurance     = readString(row['Insurance'])       || undefined;
    rec.data.guardianName  = readString(row['Guardian Name'])   || undefined;
    rec.data.guardianPhone = readString(row['Guardian Phone'])  || undefined;
    const gEmail = readString(row['Guardian Email']);
    if (gEmail && !EMAIL_RE.test(gEmail)) {
      rec.errors.push(`Guardian Email "${gEmail}" is not a valid address.`);
    }
    rec.data.guardianEmail = gEmail || undefined;
  }

  // Roster collisions — Name a warning, TIN blocking (customer only,
  // since Patient/Student never carry a TIN).
  if (name && existingNames.has(name.toLowerCase().trim())) {
    rec.warnings.push(`Name "${name}" already exists in the roster.`);
  }
  if (kind === 'customer') {
    const tin = (rec.data.tin ?? '').trim();
    if (tin && existingTins.has(tin)) {
      rec.errors.push(`TIN "${tin}" already exists on another customer.`);
    }
  }

  return rec;
}

/* -------------------------------------------------------------------------
 * Template writer — kind-aware
 * ------------------------------------------------------------------------- */

export function downloadCustomerTemplate(kind: CustomerKind = 'customer'): void {
  const wb = XLSX.utils.book_new();
  const headers = HEADERS_BY_KIND[kind];
  const sample = SAMPLE_ROWS[kind];
  const ws = XLSX.utils.aoa_to_sheet([headers as unknown as string[], ...sample]);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 16) }));
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME[kind]);

  const guide = GUIDE_ROWS[kind];
  const gws = XLSX.utils.aoa_to_sheet(guide);
  gws['!cols'] = [{ wch: 18 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, gws, 'Guide');

  XLSX.writeFile(wb, FILE_NAME[kind]);
}

const SAMPLE_ROWS: Record<CustomerKind, (string | number)[][]> = {
  customer: [
    ['individual', 'Chan Sokha',              '+855-12-000-111', 'sokha@example.com',  'Phnom Penh',                     'IDC-000001', '',                     '',                'individual',  ''],
    ['business',   'Test Trading Co., Ltd',   '+855-23-000-222', 'sales@testtrade.kh', 'Toul Kork, Phnom Penh',          '',           'L0001-000000001',      'Mr. Vireak Chan', 'taxable',     'https://testtrade.kh'],
    ['business',   'Enterprise Corp.',        '+855-23-000-333', 'ops@ent.kh',         'Chamkarmon, Phnom Penh',         '',           '',                     'Ms. Sophea Kim',  'non_taxable', ''],
    ['business',   'Overseas Buyer Ltd.',     '+65-6-000-4444',  'buyer@oseabuyer.sg', '80 Robinson Rd, Singapore',      '',           '',                     'Mr. Wei Chen',    'oversee',     'https://oseabuyer.sg'],
  ],
  patient: [
    ['Sopheaktra Pich',     '+855-12-345-678', 'sopheaktra@example.com', 'Phnom Penh',           'PAT-000001', '1988-10-04', 'male',   'ABC Insurance Policy A-123', 170, 65],
    ['Malis Chan',          '+855-12-345-679', '',                       'Siem Reap',            'PAT-000002', '1992-03-21', 'female', '',                            160, 55],
    ['Dara Sok',            '+855-12-345-680', 'dara.sok@example.com',   'Battambang',           '',           '2015-07-15', 'other',  '',                            140, 34],
  ],
  student: [
    ['STU-001', 'Chan Rithy',    '+855-93-111-222', 'rithy@example.com',    'Phnom Penh',   '2010-04-12', 'male',   '',                    'Mr. Chan Vibol',    '+855-12-333-444', 'chan.vibol@example.com'],
    ['STU-002', 'Sopheaktra Um', '+855-93-111-333', '',                     'Kandal',       '2011-09-05', 'female', 'School Kids Cover',   'Ms. Um Chenda',     '+855-12-333-555', ''],
    ['STU-003', 'Bopha Ny',      '',                'bopha.ny@example.com', 'Siem Reap',    '2009-12-30', 'female', '',                    'Ms. Ny Sopheap',    '+855-97-000-777', ''],
  ],
};

const GUIDE_ROWS: Record<CustomerKind, (string | number)[][]> = {
  customer: [
    ['Field',           'Rule'],
    ['Type',            'individual (default when blank) or business.'],
    ['Name',            'Required. Free text.'],
    ['Phone',           'Optional.'],
    ['Email',           'Optional. Must be a well-formed address when set.'],
    ['Address',         'Optional. Free text.'],
    ['CID',             'Optional. National ID (individuals) or business registration id (business).'],
    ['TIN',             'Required for business customers with Business Type = taxable; optional otherwise.'],
    ['Representative',  'Required for business customers.'],
    ['Business Type',   'non_taxable / taxable / oversee. Required when Type = business.'],
    ['Site',            'Optional. Business website URL.'],
    ['', ''],
    ['Duplicates',      'A repeat Name is a warning only (some tenants list branches separately). A repeat TIN blocks the row — TINs are meant to be unique per tenant.'],
  ],
  patient: [
    ['Field',       'Rule'],
    ['Name',        'Required. Free text.'],
    ['Phone',       'Optional.'],
    ['Email',       'Optional. Must be a well-formed address when set.'],
    ['Address',     'Optional. Free text.'],
    ['CID',         'Optional. National ID / patient card number.'],
    ['Birth Date',  'Optional. yyyy-mm-dd preferred; dd/mm/yyyy also accepted.'],
    ['Sex',         'Optional. male / female / other.'],
    ['Insurance',   'Optional. Free text (provider + policy number).'],
    ['Height (cm)', 'Optional. Non-negative decimal, up to 999.9.'],
    ['Weight (kg)', 'Optional. Non-negative decimal, up to 999.9.'],
    ['', ''],
    ['Duplicates',  'A repeat Name is a warning only. Patients do not carry a TIN.'],
  ],
  student: [
    ['Field',          'Rule'],
    ['Student No',     'Optional. School-issued ID (e.g. STU-001). Uniqueness is a tenant policy.'],
    ['Name',           'Required. Student full name.'],
    ['Phone',          'Optional. Student contact.'],
    ['Email',          'Optional. Must be a well-formed address when set.'],
    ['Address',        'Optional. Free text.'],
    ['Birth Date',     'Optional. yyyy-mm-dd preferred; dd/mm/yyyy also accepted.'],
    ['Sex',            'Optional. male / female / other.'],
    ['Insurance',      'Optional. Provider / policy for accident coverage.'],
    ['Guardian Name',  'Optional. Parent / guardian full name.'],
    ['Guardian Phone', 'Optional. Primary guardian contact.'],
    ['Guardian Email', 'Optional. Must be a well-formed address when set.'],
    ['', ''],
    ['Duplicates',     'A repeat Name is a warning only (siblings, transfers, etc.).'],
  ],
};

export function toCustomerRequest(rec: ParsedCustomerRow): CustomerRequest {
  return { ...rec.data };
}
