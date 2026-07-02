/**
 * Customer bulk-upload parser + template writer.
 *
 * One row per customer (no header / continuation grouping). Handles
 * both Individual and Business customers, whose required-field sets
 * differ:
 *   - Individual: name only.
 *   - Business:   name + businessType (taxable / non_taxable / oversee).
 *   - Business + taxable: also requires TIN.
 *   - Business:   also requires a representative.
 *
 * The parser mirrors CustomerService's service-layer validation so
 * an operator sees the same errors client-side that would otherwise
 * surface as 400s halfway through the import.
 */
import * as XLSX from 'xlsx';
import type {
  Customer, CustomerRequest, CustomerType, BusinessSubType,
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

const HEADERS = [
  'Type',           // A — individual | business (blank → individual)
  'Name',           // B — required
  'Phone',          // C
  'Email',          // D
  'Address',        // E
  'CID',            // F — national ID (individuals) / business reg id (business)
  'TIN',            // G — taxable business only
  'Representative', // H — business only
  'Business Type',  // I — non_taxable | taxable | oversee (business only)
  'Site',           // J — optional business website
] as const;

const ALLOWED_TYPES: ReadonlySet<string> =
  new Set<CustomerType>(['individual', 'business']);
const ALLOWED_BIZ_TYPES: ReadonlySet<string> =
  new Set<BusinessSubType>(['non_taxable', 'taxable', 'oversee']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* -------------------------------------------------------------------------
 * Value helpers
 * ------------------------------------------------------------------------- */

function readString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/* -------------------------------------------------------------------------
 * Parse + validate
 * ------------------------------------------------------------------------- */

export function parseCustomersExcel(
  file: File,
  existingCustomers: Customer[] = [],
): Promise<ParsedCustomerData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'binary' });
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'customers')
          ?? workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          resolve({ customers: [], errors: ['No sheet found in workbook.'], totalCustomers: 0, validCustomers: 0 });
          return;
        }
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
        resolve(buildCustomers(rows, existingCustomers));
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
): ParsedCustomerData {
  const out: ParsedCustomerRow[] = [];
  // Dupe-name detection is soft (a warning, not a block) — two
  // customers with the same name are valid business-wise (different
  // legal entities). The operator sees a warning so they can decide.
  const existingNames = new Set(existing.map(c => c.name.toLowerCase().trim()).filter(Boolean));
  const existingTins  = new Set(existing.map(c => (c.tin ?? '').trim()).filter(Boolean));

  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const isBlank = HEADERS.every(h => readString(row[h]) === '');
    if (isBlank) return;
    out.push(parseRow(row, excelRow, existingNames, existingTins));
  });

  // Within-file dupes — flag the second-and-later mentions so the
  // first occurrence still counts as the "canonical" one.
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
): ParsedCustomerRow {
  const rawType = readString(row['Type']).toLowerCase();
  // Blank defaults to individual — matches the manual create form's
  // opening state, which most operators just accept.
  const type: CustomerType = (rawType as CustomerType) || 'individual';
  const name = readString(row['Name']);
  const phone = readString(row['Phone']);
  const email = readString(row['Email']);
  const address = readString(row['Address']);
  const cid = readString(row['CID']);
  const tin = readString(row['TIN']);
  const representative = readString(row['Representative']);
  const site = readString(row['Site']);
  const bizRaw = readString(row['Business Type']).toLowerCase();

  const rec: ParsedCustomerRow = {
    rowNumber: excelRow,
    data: {
      type,
      name,
      phone: phone || undefined,
      email: email || undefined,
      address: address || undefined,
      cid: cid || undefined,
      tin: tin || undefined,
      representative: representative || undefined,
      site: site || undefined,
      businessType: type === 'business' && bizRaw
        ? (bizRaw as BusinessSubType)
        : undefined,
    },
    errors: [],
    warnings: [],
  };

  if (!name) rec.errors.push('Name is required.');
  if (rawType && !ALLOWED_TYPES.has(rawType)) {
    rec.errors.push(`Type "${row['Type']}" is not one of individual / business.`);
  }
  if (email && !EMAIL_RE.test(email)) {
    rec.errors.push(`Email "${email}" is not a valid address.`);
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

  // Roster collisions land as warnings — a repeat customer isn't
  // strictly wrong (some tenants list branches separately), but the
  // operator should see it before doubling the record.
  if (name && existingNames.has(name.toLowerCase().trim())) {
    rec.warnings.push(`Name "${name}" already exists in the roster.`);
  }
  if (tin && existingTins.has(tin.trim())) {
    rec.errors.push(`TIN "${tin}" already exists on another customer.`);
  }

  return rec;
}

/* -------------------------------------------------------------------------
 * Template writer
 * ------------------------------------------------------------------------- */

export function downloadCustomerTemplate(): void {
  const wb = XLSX.utils.book_new();

  const sample: (string | number)[][] = [
    ['individual', 'Chan Sokha',              '+855-12-000-111', 'sokha@example.com',  'Phnom Penh',                     'IDC-000001',      '',                     '',                'individual',   ''],
    ['business',   'Test Trading Co., Ltd',   '+855-23-000-222', 'sales@testtrade.kh', 'Toul Kork, Phnom Penh',          '',                'L0001-000000001',      'Mr. Vireak Chan', 'taxable',      'https://testtrade.kh'],
    ['business',   'Enterprise Corp.',        '+855-23-000-333', 'ops@ent.kh',         'Chamkarmon, Phnom Penh',         '',                '',                     'Ms. Sophea Kim',  'non_taxable',  ''],
    ['business',   'Overseas Buyer Ltd.',     '+65-6-000-4444',  'buyer@oseabuyer.sg', '80 Robinson Rd, Singapore',      '',                '',                     'Mr. Wei Chen',    'oversee',      'https://oseabuyer.sg'],
  ];

  const ws = XLSX.utils.aoa_to_sheet([HEADERS as unknown as string[], ...sample]);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 16) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');

  const guide: (string | number)[][] = [
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
  ];
  const gws = XLSX.utils.aoa_to_sheet(guide);
  gws['!cols'] = [{ wch: 18 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, gws, 'Guide');

  XLSX.writeFile(wb, 'Customers-Template.xlsx');
}

export function toCustomerRequest(rec: ParsedCustomerRow): CustomerRequest {
  return { ...rec.data };
}
