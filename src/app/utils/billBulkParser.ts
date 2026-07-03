/**
 * Bill bulk-upload parser + template writer.
 *
 * Purchase-side twin of {@code invoiceBulkParser.ts} — same Excel
 * layout (header row per bill, blank-header rows carry extra line
 * items) but resolves against the Vendor roster instead of the
 * Customer roster and hits {@code billsApi.create}.
 *
 * Grouping rule: a row starts a new bill when EITHER Issue Date (A)
 * OR Bill No. (B) is non-blank. Anything else stacks onto the
 * previous bill as an additional line item.
 */
import * as XLSX from 'xlsx';
import type { Vendor, VendorRequest } from '../api/vendors';
import type { BillKind, BillTaxType, BillItemRequest } from '../api/bills';

/* -------------------------------------------------------------------------
 * Public shapes
 * ------------------------------------------------------------------------- */

export interface ParsedBillItem {
  name: string;
  description?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  /** 1-indexed Excel row this line came from. */
  sourceRow: number;
}

export interface ParsedBill {
  /** 1-indexed Excel row of the HEADER (row that started the group). */
  rowNumber: number;
  data: {
    issueDate?: string;
    billNo?: string;
    kind?: BillKind;
    vendorName?: string;
    tin?: string;
    currency?: string;
    dueDate?: string | null;
    notes?: string;
    taxType?: BillTaxType | null;
    discountValue?: number;
    remarks?: string;
    items: ParsedBillItem[];
  };
  vendorId?: string | null;
  /** Populated when Name (and optionally TIN) don't match any known
   *  vendor. The importer uses this to either auto-create the vendor
   *  or block the row, driven by the dialog's toggle. */
  unresolvedVendor?: { name: string; tin?: string; isFirstMention: boolean };
  errors: string[];
  warnings: string[];
}

export interface ParsedBillData {
  bills: ParsedBill[];
  errors: string[];
  totalBills: number;
  validBills: number;
}

/* -------------------------------------------------------------------------
 * Column headers on Row 1 of the workbook. Bill sheet mirrors the
 * Invoice template — the ops team uses the same shape for both sides.
 * ------------------------------------------------------------------------- */

const HEADERS = [
  'Issue Date',      // A
  'Bill No.',        // B
  'Bill Type',       // C — T / C / CN / DN
  'Vendor',          // D — vendor name
  'TIN',             // E — vendor tax id
  'Currency',        // F
  'Due Date',        // G
  'Note',            // H
  'Item',            // I
  'Specification',   // J
  'Quantity',        // K
  'Unit',            // L
  'Unit Price',      // M
  'Discount',        // N
  'Amount',          // O — computed by service
  'Tax Type',        // P
  'Remarks',         // Q
] as const;

/** 'T' → tax, 'C' → commercial, 'CN' → credit_note, 'DN' → debit_note.
 *  Case-insensitive. */
const KIND_BY_CODE: Record<string, BillKind> = {
  T: 'tax',
  C: 'commercial',
  CN: 'credit_note',
  DN: 'debit_note',
};

const ALLOWED_TAX_TYPES: ReadonlySet<string> = new Set(['1', '2', '3', '11', '12']);
const ALLOWED_CURRENCIES: ReadonlySet<string> = new Set(['USD', 'KHR', 'KRW']);

/* -------------------------------------------------------------------------
 * Value helpers — same accepted formats as the Invoice parser so a
 * mixed-source Excel file behaves identically on either side.
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

function isContinuationRow(row: Record<string, unknown>): boolean {
  return !readString(row['Issue Date']) && !readString(row['Bill No.']);
}

/* -------------------------------------------------------------------------
 * Parse + validate
 * ------------------------------------------------------------------------- */

/**
 * Parse a `.xlsx` file into a list of ParsedBill records.
 *
 * @param file              The user-selected xlsx workbook.
 * @param vendors           Live vendor roster — used to resolve
 *                          Name/TIN → vendorId at parse-time.
 * @param existingBillNos   Bill numbers already in the tenant's system.
 *                          The parser flags any file row that would
 *                          collide with one of these, preventing the
 *                          DB unique-constraint hit at submit time.
 */
export function parseBillsExcel(
  file: File,
  vendors: Vendor[] = [],
  existingBillNos: string[] = [],
): Promise<ParsedBillData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'binary' });
        // Prefer the "Bill" tab if present (matches the template);
        // otherwise fall back to the first sheet.
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'bill')
          ?? workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          resolve({ bills: [], errors: ['No sheet found in workbook.'], totalBills: 0, validBills: 0 });
          return;
        }
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
        resolve(buildBills(rows, vendors, existingBillNos));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsBinaryString(file);
  });
}

function buildBills(
  rows: Record<string, unknown>[],
  vendors: Vendor[],
  existingBillNos: string[] = [],
): ParsedBillData {
  const bills: ParsedBill[] = [];
  const byName = new Map<string, Vendor>();
  const byTin  = new Map<string, Vendor>();
  for (const v of vendors) {
    if (v.name) byName.set(v.name.toLowerCase().trim(), v);
    if (v.tin)  byTin.set(v.tin.trim(), v);
  }
  const existingNoLower = new Set(existingBillNos.map(n => n.toLowerCase().trim()).filter(Boolean));
  // Tracks unresolved vendor names we've already seen; first mention
  // gets the "+ New" badge, subsequent ones show as "Shared".
  const seenUnresolved = new Set<string>();

  let current: ParsedBill | null = null;

  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const rowIsBlank = HEADERS.every(h => readString(row[h]) === '');
    if (rowIsBlank) return;

    if (!isContinuationRow(row) || current === null) {
      const bill = parseHeaderRow(row, excelRow);
      bills.push(bill);
      current = bill;
    }

    const item = parseItemRow(row, excelRow);
    if (item) {
      current!.data.items.push(item);
    } else {
      current!.errors.push(`Row ${excelRow}: line item is missing Item or Quantity/Unit Price.`);
    }
  });

  // Duplicate Bill No. detection — one pass to build a count map, so
  // every row in a duplicate group gets tagged (not just the second
  // occurrence). Matches the Invoice parser's behaviour.
  const billNoCount = new Map<string, number>();
  for (const b of bills) {
    if (b.data.billNo) {
      const key = b.data.billNo.toLowerCase().trim();
      billNoCount.set(key, (billNoCount.get(key) ?? 0) + 1);
    }
  }

  for (const b of bills) {
    if (!b.data.issueDate) b.errors.push('Issue Date is required.');
    if (!b.data.billNo)    b.errors.push('Bill No. is required.');
    if (!b.data.kind)      b.errors.push('Bill Type must be T (Tax), C (Commercial), CN, or DN.');
    if (!b.data.vendorName) b.errors.push('Vendor Name is required.');
    if (!b.data.currency)  b.errors.push('Currency is required (USD, KHR, or KRW).');
    if (b.data.currency && !ALLOWED_CURRENCIES.has(b.data.currency)) {
      b.errors.push(`Currency "${b.data.currency}" not supported (allowed: USD, KHR, KRW).`);
    }
    if (b.data.items.length === 0) b.errors.push('At least one line item is required.');
    if (b.data.taxType && !ALLOWED_TAX_TYPES.has(b.data.taxType)) {
      b.errors.push(`Tax Type "${b.data.taxType}" not recognised (allowed keys: 1, 2, 3, 11, 12).`);
    }

    if (b.data.billNo) {
      const key = b.data.billNo.toLowerCase().trim();
      if (existingNoLower.has(key)) {
        b.errors.push(`Bill No. "${b.data.billNo}" already exists in the system.`);
      } else if ((billNoCount.get(key) ?? 0) > 1) {
        b.errors.push(`Bill No. "${b.data.billNo}" is used by another row in this file.`);
      }
    }

    // Resolve vendor — Name first, then TIN as fallback. Missing
    // vendors become fixable warnings (via unresolvedVendor
    // metadata) rather than hard errors: the importer's
    // "Auto-create missing vendors" toggle spawns them at submit
    // time. This branch runs even when the tenant's Vendor list is
    // empty — a fresh tenant hitting bulk-upload has no vendors yet
    // but still needs every row to be marked unresolved so the
    // auto-create flow can spawn them at submit time.
    if (!b.vendorId && b.data.vendorName) {
      const nameHit = byName.get(b.data.vendorName.toLowerCase().trim());
      const tinHit  = b.data.tin ? byTin.get(b.data.tin.trim()) : undefined;
      const hit = nameHit ?? tinHit;
      if (hit) {
        b.vendorId = hit.id;
      } else {
        const key = b.data.vendorName.toLowerCase().trim();
        const isFirstMention = !seenUnresolved.has(key);
        if (isFirstMention) seenUnresolved.add(key);
        b.unresolvedVendor = {
          name: b.data.vendorName,
          tin: b.data.tin,
          isFirstMention,
        };
      }
    }
  }

  const validBills = bills.filter(b => b.errors.length === 0).length;
  return { bills, errors: [], totalBills: bills.length, validBills };
}

function parseHeaderRow(row: Record<string, unknown>, excelRow: number): ParsedBill {
  const rawKind = readString(row['Bill Type']).toUpperCase();
  const rawTax  = readString(row['Tax Type']);
  const rawCurrency = readString(row['Currency']).toUpperCase();
  const issueDate = normaliseDate(row['Issue Date']);
  const dueDate   = normaliseDate(row['Due Date']);
  const discountRaw = readNumber(row['Discount']);

  const bill: ParsedBill = {
    rowNumber: excelRow,
    data: {
      issueDate: issueDate ?? undefined,
      billNo: readString(row['Bill No.']) || undefined,
      kind: KIND_BY_CODE[rawKind],
      vendorName: readString(row['Vendor']) || undefined,
      tin: readString(row['TIN']) || undefined,
      currency: rawCurrency || undefined,
      dueDate: dueDate === undefined ? undefined : dueDate,
      notes: readString(row['Note']) || undefined,
      taxType: rawTax ? (rawTax as BillTaxType) : null,
      discountValue: discountRaw ?? undefined,
      remarks: readString(row['Remarks']) || undefined,
      items: [],
    },
    errors: [],
    warnings: [],
  };

  if (issueDate === null) bill.errors.push(`Row ${excelRow}: Issue Date is not a valid date.`);
  if (dueDate   === null) bill.errors.push(`Row ${excelRow}: Due Date is not a valid date.`);
  if (rawKind && !KIND_BY_CODE[rawKind]) {
    bill.errors.push(`Row ${excelRow}: Bill Type "${rawKind}" not recognised (use T, C, CN, or DN).`);
  }
  return bill;
}

function parseItemRow(row: Record<string, unknown>, excelRow: number): ParsedBillItem | null {
  const name = readString(row['Item']);
  const qty  = readNumber(row['Quantity']);
  const price = readNumber(row['Unit Price']);
  if (!name && qty == null && price == null) return null;
  if (!name || qty == null || price == null) return null;
  return {
    name,
    description: readString(row['Specification']) || undefined,
    unit: readString(row['Unit']) || undefined,
    quantity: qty,
    unitPrice: price,
    sourceRow: excelRow,
  };
}

/* -------------------------------------------------------------------------
 * Template writer — one-click Download button in the dialog.
 * ------------------------------------------------------------------------- */

export function downloadBillTemplate(): void {
  const wb = XLSX.utils.book_new();

  const sample: (string | number)[][] = [
    ['2020-01-30', 'B-001', 'T', 'Global Supplies Co., Ltd', 'V0001-000000001', 'USD', '2020-02-28', 'Purchase agreement — Q1 hardware refresh.', 'Server Rack', '12 Slots', 1, '', 500, 50, 500, '1', ''],
    ['',            '',      '',  '',                          '',                  '',    '',           '',                                              'HDD',         '1TB',      20, '', 400, '',  8000, '1', ''],
    ['',            '',      '',  '',                          '',                  '',    '',           '',                                              'Memory',      'DDR4 16G', 10, '',  80, '',   800, '1', ''],
    ['2020-01-31', 'B-002', 'C', 'Peripheral Depot',           'V0021-000000009',   'KHR', '2020-03-01', 'Monitor batch order.',                          'Monitor',     '27 inch',   4, '', 200, 50,   800, '3', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet([HEADERS as unknown as string[], ...sample]);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Bill');

  const guide: (string | number)[][] = [
    ['Field',          'Rule'],
    ['Issue Date',     'Required on header row. Formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, Excel date cell.'],
    ['Bill No.',       'Required on header row. Must be unique per tenant.'],
    ['Bill Type',      'T = Tax bill, C = Commercial, CN = Credit Note, DN = Debit Note.'],
    ['Vendor',         'Vendor name — matched case-insensitively against your Vendors list.'],
    ['TIN',            'Optional for individuals; required for business vendors auto-created during import.'],
    ['Currency',       'USD, KHR, or KRW (must match the tenant Currency setting).'],
    ['Due Date',       'Optional. Same date formats as Issue Date.'],
    ['Note',           'Optional bill-level note (printed on the bill head).'],
    ['Item / Qty / Unit Price', 'Required on every non-blank row.'],
    ['Specification',  'Optional line-level description.'],
    ['Unit',           'Optional UOM (pcs, box, kg, hour, …).'],
    ['Discount',       'On the header row only. Treated as a BILL-level flat discount.'],
    ['Amount',         'Informational — the server computes Qty × Unit Price at save time.'],
    ['Tax Type',       'Datakey: 1 = VAT 10%, 2 = VAT 0%, 3 = Exclusive VAT, 11 = WHT 15%, 12 = WHT 14%.'],
    ['Remarks',        'Optional. Not persisted on the bill today — informational.'],
    ['', ''],
    ['Grouping rule',  'A row with Issue Date OR Bill No. filled starts a NEW bill. Subsequent rows that leave columns A–H blank attach as extra line items to the previous bill.'],
  ];
  const gws = XLSX.utils.aoa_to_sheet(guide);
  gws['!cols'] = [{ wch: 22 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, gws, 'Guide');

  XLSX.writeFile(wb, 'Bills-Template.xlsx');
}

/* -------------------------------------------------------------------------
 * Adapter → API request. The dialog calls this per row at submit time.
 * ------------------------------------------------------------------------- */

export function toBillRequest(bill: ParsedBill, vendorIdOverride?: string): {
  kind: BillKind;
  billNo?: string;
  vendorId: string;
  issueDate?: string;
  dueDate?: string | null;
  currency?: string;
  taxType?: BillTaxType | null;
  discountType: 'amount';
  discountValue: number;
  notes?: string | null;
  items: BillItemRequest[];
} {
  const vid = vendorIdOverride ?? bill.vendorId;
  if (!vid) throw new Error('Vendor not resolved — importer should have blocked this row.');
  return {
    kind: bill.data.kind!,
    billNo: bill.data.billNo,
    // Backend BillRequest.java field is `vendorId` — the TS
    // BillRequest interface still names it `customerId` (legacy
    // typo), but the existing BillFormDialog already sends
    // `vendorId` and the server binds by name. Match that.
    vendorId: vid,
    issueDate: bill.data.issueDate,
    dueDate: bill.data.dueDate ?? null,
    currency: bill.data.currency,
    taxType: bill.data.taxType ?? null,
    discountType: 'amount',
    discountValue: bill.data.discountValue ?? 0,
    notes: bill.data.notes ?? null,
    items: bill.data.items.map(it => ({
      name: it.name,
      description: it.description ?? null,
      unit: it.unit ?? null,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    })),
  };
}

/**
 * Build the VendorRequest payload for an auto-created row.
 *
 * <p>Vendors have a simpler shape than customers — no businessType
 * sub-classification. Any row with a TIN becomes type=business and
 * carries TIN + representative (both required by the service);
 * TIN-less rows fall back to type=individual which needs neither.</p>
 *
 * <p>The template has no Representative column, so we seed it with
 * the vendor name itself — the operator can rename it later on the
 * Vendors page if the real contact person is known.</p>
 */
export function buildAutoCreateVendorRequest(bill: ParsedBill): VendorRequest {
  const u = bill.unresolvedVendor!;
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

/** True when a row can be imported given the current toggle state.
 *  Rows with unresolved vendors are gated on {@code autoCreate}. */
export function isImportable(bill: ParsedBill, autoCreate: boolean): boolean {
  if (bill.errors.length > 0) return false;
  if (bill.unresolvedVendor && !autoCreate) return false;
  return true;
}
