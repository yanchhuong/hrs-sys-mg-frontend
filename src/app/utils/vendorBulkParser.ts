/**
 * Vendor bulk-upload parser + template writer.
 *
 * Purchase-side twin of {@code customerBulkParser.ts}. Vendors have a
 * slimmer shape — no email / CID / businessType sub-classification —
 * but a stricter validation rule: any {@code business} vendor
 * requires BOTH a TIN and a representative (see VendorService.validate).
 * TIN-less rows must therefore be typed as {@code individual}.
 */
import { loadXlsx } from './xlsxLoader';
import type {
  Vendor, VendorRequest, VendorType,
} from '../api/vendors';

export interface ParsedVendorRow {
  rowNumber: number;
  data: VendorRequest;
  errors: string[];
  warnings: string[];
}

export interface ParsedVendorData {
  vendors: ParsedVendorRow[];
  errors: string[];
  totalVendors: number;
  validVendors: number;
}

const HEADERS = [
  'Type',           // A — individual | business (blank → individual)
  'Name',           // B — required
  'Phone',          // C
  'Address',        // D
  'TIN',            // E — required for business vendors
  'Representative', // F — required for business vendors
  'Site',           // G — optional business website
] as const;

const ALLOWED_TYPES: ReadonlySet<string> =
  new Set<VendorType>(['individual', 'business']);

function readString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/* -------------------------------------------------------------------------
 * Parse + validate
 * ------------------------------------------------------------------------- */

export function parseVendorsExcel(
  file: File,
  existingVendors: Vendor[] = [],
): Promise<ParsedVendorData> {
  return loadXlsx().then(XLSX => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'binary' });
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'vendors')
          ?? workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          resolve({ vendors: [], errors: ['No sheet found in workbook.'], totalVendors: 0, validVendors: 0 });
          return;
        }
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
        resolve(buildVendors(rows, existingVendors));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsBinaryString(file);
  }));
}

function buildVendors(
  rows: Record<string, unknown>[],
  existing: Vendor[],
): ParsedVendorData {
  const out: ParsedVendorRow[] = [];
  const existingNames = new Set(existing.map(v => v.name.toLowerCase().trim()).filter(Boolean));
  const existingTins  = new Set(existing.map(v => (v.tin ?? '').trim()).filter(Boolean));

  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const isBlank = HEADERS.every(h => readString(row[h]) === '');
    if (isBlank) return;
    out.push(parseRow(row, excelRow, existingNames, existingTins));
  });

  // Within-file dedup — same policy as the Customer parser: repeat
  // Names are warnings (branches are legitimate); repeat TINs are
  // hard errors (a TIN can only belong to one legal entity).
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

  const validVendors = out.filter(r => r.errors.length === 0).length;
  return { vendors: out, errors: [], totalVendors: out.length, validVendors };
}

function parseRow(
  row: Record<string, unknown>,
  excelRow: number,
  existingNames: Set<string>,
  existingTins: Set<string>,
): ParsedVendorRow {
  const rawType = readString(row['Type']).toLowerCase();
  const type: VendorType = (rawType as VendorType) || 'individual';
  const name = readString(row['Name']);
  const phone = readString(row['Phone']);
  const address = readString(row['Address']);
  const tin = readString(row['TIN']);
  const representative = readString(row['Representative']);
  const site = readString(row['Site']);

  const rec: ParsedVendorRow = {
    rowNumber: excelRow,
    data: {
      type,
      name,
      phone: phone || undefined,
      address: address || undefined,
      tin: tin || undefined,
      representative: representative || undefined,
      site: site || undefined,
    },
    errors: [],
    warnings: [],
  };

  if (!name) rec.errors.push('Name is required.');
  if (rawType && !ALLOWED_TYPES.has(rawType)) {
    rec.errors.push(`Type "${row['Type']}" is not one of individual / business.`);
  }
  if (type === 'business') {
    if (!tin) rec.errors.push('TIN is required for business vendors.');
    if (!representative) rec.errors.push('Representative is required for business vendors.');
  }

  if (name && existingNames.has(name.toLowerCase().trim())) {
    rec.warnings.push(`Name "${name}" already exists in the roster.`);
  }
  if (tin && existingTins.has(tin.trim())) {
    rec.errors.push(`TIN "${tin}" already exists on another vendor.`);
  }

  return rec;
}

/* -------------------------------------------------------------------------
 * Template writer
 * ------------------------------------------------------------------------- */

export function downloadVendorTemplate(): void {
  void loadXlsx().then(XLSX => {
    const wb = XLSX.utils.book_new();

    const sample: (string | number)[][] = [
      ['individual', 'Sok Panha',                '+855-12-000-111', 'Phnom Penh',                    '',                    '',                  ''],
      ['business',   'Global Supplies Co., Ltd', '+855-23-000-222', 'Toul Kork, Phnom Penh',         'V0001-000000001',     'Mr. Vireak Chan',   'https://globalsupplies.kh'],
      ['business',   'Peripheral Depot',         '+855-23-000-333', 'Chamkarmon, Phnom Penh',        'V0021-000000009',     'Ms. Sophea Kim',    ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet([HEADERS as unknown as string[], ...sample]);
    ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 16) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Vendors');

    const guide: (string | number)[][] = [
      ['Field',          'Rule'],
      ['Type',           'individual (default when blank) or business.'],
      ['Name',           'Required. Free text.'],
      ['Phone',          'Optional.'],
      ['Address',        'Optional. Free text.'],
      ['TIN',            'Required for business vendors; optional for individuals.'],
      ['Representative', 'Required for business vendors; optional for individuals.'],
      ['Site',           'Optional. Business website URL.'],
      ['', ''],
      ['Duplicates',     'A repeat Name is a warning only (some tenants list branches separately). A repeat TIN blocks the row — TINs are meant to be unique per tenant.'],
    ];
    const gws = XLSX.utils.aoa_to_sheet(guide);
    gws['!cols'] = [{ wch: 18 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, gws, 'Guide');

    XLSX.writeFile(wb, 'Vendors-Template.xlsx');
  });
}

export function toVendorRequest(rec: ParsedVendorRow): VendorRequest {
  return { ...rec.data };
}
