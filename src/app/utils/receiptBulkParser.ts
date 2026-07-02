/**
 * Receipt bulk-upload parser + template writer.
 *
 * Simpler shape than Invoices/Bills — a Receipt is a flat single-row
 * record (no line items). One workbook row → one receipt.
 * Resolves vendors the same way {@code billBulkParser} does.
 */
import * as XLSX from 'xlsx';
import type { Vendor, VendorRequest } from '../api/vendors';
import type { ReceiptRequest, ReceiptTaxType, SupplierType } from '../api/receipts';

/* -------------------------------------------------------------------------
 * Public shapes
 * ------------------------------------------------------------------------- */

export interface ParsedReceipt {
  /** 1-indexed Excel row. */
  rowNumber: number;
  data: {
    receiptNo?: string;
    issueDate?: string;
    vendorName?: string;
    tin?: string;
    supplierType?: SupplierType;
    currency?: string;
    exchangeRate?: number;
    amount?: number;
    taxType?: ReceiptTaxType | null;
    taxAmount?: number;
    notes?: string;
  };
  vendorId?: string | null;
  /** Populated when Name/TIN don't match any known vendor. The importer
   *  either auto-creates the vendor or blocks the row via the toggle. */
  unresolvedVendor?: { name: string; tin?: string; isFirstMention: boolean };
  errors: string[];
  warnings: string[];
}

export interface ParsedReceiptData {
  receipts: ParsedReceipt[];
  errors: string[];
  totalReceipts: number;
  validReceipts: number;
}

/* -------------------------------------------------------------------------
 * Column headers on Row 1. Kept flat and short; the Guide tab explains
 * codes so the header row itself stays scannable.
 * ------------------------------------------------------------------------- */

const HEADERS = [
  'Receipt No.',    // A
  'Issue Date',     // B
  'Vendor',         // C — vendor name
  'TIN',            // D — vendor tax id
  'Supplier Type',  // E — T (taxable_person) / N (non_taxable) / R (non_resident)
  'Currency',       // F
  'Exchange Rate',  // G — receipt-currency → base
  'Amount',         // H
  'Tax Type',       // I — 11 / 15 / 16 / 20
  'Tax Amount',     // J
  'Notes',          // K
] as const;

const SUPPLIER_BY_CODE: Record<string, SupplierType> = {
  T: 'taxable_person',
  N: 'non_taxable',
  R: 'non_resident',
};

const ALLOWED_TAX_TYPES: ReadonlySet<string> = new Set(['11', '15', '16', '20']);
const ALLOWED_CURRENCIES: ReadonlySet<string> = new Set(['USD', 'KHR', 'KRW']);

/* -------------------------------------------------------------------------
 * Value helpers — identical semantics to billBulkParser so a mixed
 * workbook reads the same way on either side.
 * ------------------------------------------------------------------------- */

function normaliseDate(v: unknown): string | null | undefined {
  if (v == null || v === '') return undefined;
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
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const parts = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2}|\d{4})$/.exec(raw);
  if (parts) {
    const [, aStr, bStr, yStr] = parts;
    let year = parseInt(yStr, 10);
    if (year < 100) year += (year >= 70 ? 1900 : 2000);
    const a = parseInt(aStr, 10);
    const b = parseInt(bStr, 10);
    let day: number, month: number;
    if (a > 12 && b <= 12)        { day = a; month = b; }
    else if (b > 12 && a <= 12)   { day = b; month = a; }
    else                          { day = a; month = b; }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    return null;
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function readString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function readNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/* -------------------------------------------------------------------------
 * Parse + validate
 * ------------------------------------------------------------------------- */

export function parseReceiptsExcel(
  file: File,
  vendors: Vendor[] = [],
  existingReceiptNos: string[] = [],
): Promise<ParsedReceiptData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'binary' });
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'receipt')
          ?? workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          resolve({ receipts: [], errors: ['No sheet found in workbook.'], totalReceipts: 0, validReceipts: 0 });
          return;
        }
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
        resolve(buildReceipts(rows, vendors, existingReceiptNos));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsBinaryString(file);
  });
}

function buildReceipts(
  rows: Record<string, unknown>[],
  vendors: Vendor[],
  existingReceiptNos: string[],
): ParsedReceiptData {
  const receipts: ParsedReceipt[] = [];
  const byName = new Map<string, Vendor>();
  const byTin  = new Map<string, Vendor>();
  for (const v of vendors) {
    if (v.name) byName.set(v.name.toLowerCase().trim(), v);
    if (v.tin)  byTin.set(v.tin.trim(), v);
  }
  const existingNoLower = new Set(existingReceiptNos.map(n => n.toLowerCase().trim()).filter(Boolean));
  const seenUnresolved = new Set<string>();

  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const rowIsBlank = HEADERS.every(h => readString(row[h]) === '');
    if (rowIsBlank) return;
    receipts.push(parseReceiptRow(row, excelRow));
  });

  // Duplicate Receipt No. detection across the file.
  const noCount = new Map<string, number>();
  for (const r of receipts) {
    if (r.data.receiptNo) {
      const key = r.data.receiptNo.toLowerCase().trim();
      noCount.set(key, (noCount.get(key) ?? 0) + 1);
    }
  }

  for (const r of receipts) {
    if (!r.data.issueDate)  r.errors.push('Issue Date is required.');
    if (!r.data.receiptNo)  r.errors.push('Receipt No. is required.');
    if (!r.data.vendorName) r.errors.push('Vendor Name is required.');
    if (!r.data.currency)   r.errors.push('Currency is required (USD, KHR, or KRW).');
    if (r.data.currency && !ALLOWED_CURRENCIES.has(r.data.currency)) {
      r.errors.push(`Currency "${r.data.currency}" not supported (allowed: USD, KHR, KRW).`);
    }
    if (r.data.amount == null || r.data.amount <= 0) {
      r.errors.push('Amount must be a positive number.');
    }
    if (r.data.taxType && !ALLOWED_TAX_TYPES.has(r.data.taxType)) {
      r.errors.push(`Tax Type "${r.data.taxType}" not recognised (allowed keys: 11, 15, 16, 20).`);
    }

    if (r.data.receiptNo) {
      const key = r.data.receiptNo.toLowerCase().trim();
      if (existingNoLower.has(key)) {
        r.errors.push(`Receipt No. "${r.data.receiptNo}" already exists in the system.`);
      } else if ((noCount.get(key) ?? 0) > 1) {
        r.errors.push(`Receipt No. "${r.data.receiptNo}" is used by another row in this file.`);
      }
    }

    // Resolve vendor — Name first, then TIN as fallback.
    if (!r.vendorId && r.data.vendorName && vendors.length > 0) {
      const nameHit = byName.get(r.data.vendorName.toLowerCase().trim());
      const tinHit  = r.data.tin ? byTin.get(r.data.tin.trim()) : undefined;
      const hit = nameHit ?? tinHit;
      if (hit) {
        r.vendorId = hit.id;
      } else {
        const key = r.data.vendorName.toLowerCase().trim();
        const isFirstMention = !seenUnresolved.has(key);
        if (isFirstMention) seenUnresolved.add(key);
        r.unresolvedVendor = {
          name: r.data.vendorName,
          tin: r.data.tin,
          isFirstMention,
        };
      }
    }
  }

  const validReceipts = receipts.filter(r => r.errors.length === 0).length;
  return { receipts, errors: [], totalReceipts: receipts.length, validReceipts };
}

function parseReceiptRow(row: Record<string, unknown>, excelRow: number): ParsedReceipt {
  const rawSupplier = readString(row['Supplier Type']).toUpperCase();
  const rawTax      = readString(row['Tax Type']);
  const rawCurrency = readString(row['Currency']).toUpperCase();
  const issueDate   = normaliseDate(row['Issue Date']);

  const receipt: ParsedReceipt = {
    rowNumber: excelRow,
    data: {
      receiptNo:    readString(row['Receipt No.']) || undefined,
      issueDate:    issueDate ?? undefined,
      vendorName:   readString(row['Vendor']) || undefined,
      tin:          readString(row['TIN']) || undefined,
      supplierType: SUPPLIER_BY_CODE[rawSupplier] ?? (rawSupplier === '' ? undefined : undefined),
      currency:     rawCurrency || undefined,
      exchangeRate: readNumber(row['Exchange Rate']) ?? undefined,
      amount:       readNumber(row['Amount']) ?? undefined,
      taxType:      rawTax ? (rawTax as ReceiptTaxType) : null,
      taxAmount:    readNumber(row['Tax Amount']) ?? undefined,
      notes:        readString(row['Notes']) || undefined,
    },
    errors: [],
    warnings: [],
  };

  if (issueDate === null) receipt.errors.push(`Row ${excelRow}: Issue Date is not a valid date.`);
  if (rawSupplier && !SUPPLIER_BY_CODE[rawSupplier]) {
    receipt.errors.push(`Row ${excelRow}: Supplier Type "${rawSupplier}" not recognised (use T, N, or R).`);
  }
  return receipt;
}

/* -------------------------------------------------------------------------
 * Template writer
 * ------------------------------------------------------------------------- */

export function downloadReceiptTemplate(): void {
  const wb = XLSX.utils.book_new();

  const sample: (string | number)[][] = [
    ['R-2026-0001', '2026-01-15', 'ACME Services Ltd.', 'K001-000123456', 'T', 'USD', 1,    1000,   '11', 150,  'Consulting fee'],
    ['R-2026-0002', '2026-01-20', 'Sok Sopheak',        '',                'N', 'USD', 1,     500,   '',    0,   'Freelance design'],
    ['R-2026-0003', '2026-01-22', 'Overseas Vendor SA', '',                'R', 'USD', 1,    2500,   '20', 350,  'Technical service fee'],
  ];

  const ws = XLSX.utils.aoa_to_sheet([HEADERS as unknown as string[], ...sample]);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Receipt');

  const guide: (string | number)[][] = [
    ['Field',           'Rule'],
    ['Receipt No.',     'Required. Must be unique per tenant.'],
    ['Issue Date',      'Required. Formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, or an Excel date cell.'],
    ['Vendor',          'Vendor name — matched case-insensitively against your Vendors list. Missing vendors can be auto-created at import.'],
    ['TIN',             'Optional for individuals; required if you want the auto-created vendor to be Business type.'],
    ['Supplier Type',   'T = Taxable Person, N = Non-Taxable Person, R = Non-Resident. Optional.'],
    ['Currency',        'USD, KHR, or KRW (must match your tenant Currency setting).'],
    ['Exchange Rate',   'Receipt-currency → base rate. Leave 1 for same-currency receipts.'],
    ['Amount',          'Required. Positive number, taxes shown separately.'],
    ['Tax Type',        'Datakey: 11 = WHT Service 15%, 15 = WHT Rental (Physical) 10%, 16 = WHT Rental (Legal) 10%, 20 = WHT Non-resident 14%.'],
    ['Tax Amount',      'Withholding amount computed from Amount × rate. Leave 0 or blank for no WHT.'],
    ['Notes',           'Optional free-text note.'],
    ['', ''],
    ['Row rule',        'One row = one receipt. No continuation rows (receipts have no line items).'],
  ];
  const gws = XLSX.utils.aoa_to_sheet(guide);
  gws['!cols'] = [{ wch: 18 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, gws, 'Guide');

  XLSX.writeFile(wb, 'Receipts-Template.xlsx');
}

/* -------------------------------------------------------------------------
 * Adapter → API request
 * ------------------------------------------------------------------------- */

export function toReceiptRequest(r: ParsedReceipt, vendorIdOverride?: string): ReceiptRequest {
  const vid = vendorIdOverride ?? r.vendorId;
  if (!vid) throw new Error('Vendor not resolved — importer should have blocked this row.');
  return {
    receiptNo:    r.data.receiptNo,
    vendorId:     vid,
    issueDate:    r.data.issueDate,
    supplierType: r.data.supplierType,
    taxId:        r.data.tin,
    currency:     r.data.currency,
    exchangeRate: r.data.exchangeRate,
    amount:       r.data.amount,
    taxType:      (r.data.taxType ?? '') as ReceiptTaxType | '',
    taxAmount:    r.data.taxAmount ?? 0,
    notes:        r.data.notes,
  };
}

/** Auto-create payload for a vendor referenced in a receipt with no
 *  matching roster row. Same rule as Bill imports — with TIN → Business,
 *  otherwise Individual. */
export function buildAutoCreateVendorRequest(r: ParsedReceipt): VendorRequest {
  const u = r.unresolvedVendor!;
  const trimmedName = u.name.trim();
  const hasTin = !!u.tin && u.tin.trim().length > 0;
  if (hasTin) {
    return {
      type: 'business',
      name: trimmedName,
      tin: u.tin!.trim(),
      representative: trimmedName,
    };
  }
  return {
    type: 'individual',
    name: trimmedName,
  };
}

export function isImportable(r: ParsedReceipt, autoCreate: boolean): boolean {
  if (r.errors.length > 0) return false;
  if (r.unresolvedVendor && !autoCreate) return false;
  return true;
}
