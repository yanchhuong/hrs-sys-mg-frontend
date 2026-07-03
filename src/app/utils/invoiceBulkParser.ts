/**
 * Invoice bulk-upload parser + template writer.
 *
 * The Excel shape mirrors the sample supplied by the ops team:
 * one HEADER row per invoice followed by any number of CONTINUATION
 * rows that only carry the line-item columns (I–Q). Header rows carry
 * the invoice-level fields in columns A–H; continuation rows keep
 * those columns blank so a reader can visually group items under
 * their parent invoice.
 *
 * Grouping rule: a row starts a new invoice when EITHER Issue Date
 * (A) OR Invoice No. (B) is non-blank. Anything else stacks onto
 * the previous invoice as an additional line item.
 */
import * as XLSX from 'xlsx';
import type { Customer, CustomerRequest } from '../api/customers';
import type { InvoiceKind, InvoiceTaxType, InvoiceItemRequest } from '../api/invoices';

/* -------------------------------------------------------------------------
 * Public shapes
 * ------------------------------------------------------------------------- */

export interface ParsedInvoiceItem {
  name: string;
  description?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  /** Excel row this line came from — surfaced to the operator when
   *  something goes wrong so they know which line to fix. */
  sourceRow: number;
}

export interface ParsedInvoice {
  /** 1-indexed Excel row of the HEADER (row that started the group). */
  rowNumber: number;
  data: {
    issueDate?: string;
    invoiceNo?: string;
    kind?: InvoiceKind;
    customerName?: string;
    tin?: string;
    currency?: string;
    dueDate?: string | null;
    notes?: string;
    taxType?: InvoiceTaxType | null;
    /** Invoice-level discount — taken from the FIRST line's Discount
     *  column so the operator doesn't have to invent a spot to put it. */
    discountValue?: number;
    remarks?: string;
    items: ParsedInvoiceItem[];
  };
  /** Resolved on parse when the customer roster is supplied — lets
   *  the importer POST straight to `customerId` without a per-row
   *  lookup at submit time. */
  customerId?: string | null;
  /** Populated when Name (and optionally TIN) don't match any known
   *  customer. The importer uses this to either auto-create the
   *  customer or block the row, driven by the dialog's toggle.
   *
   *  <p>{@code isFirstMention} distinguishes the first row that
   *  introduces this new customer name from later rows that reuse
   *  it — the importer's dedup cache still resolves them to the same
   *  freshly-created record, but the UI only badges the FIRST row so
   *  the operator counts "N new customers" instead of "N new
   *  customers per row that mentioned them".</p> */
  unresolvedCustomer?: { name: string; tin?: string; isFirstMention: boolean };
  errors: string[];
  warnings: string[];
}

export interface ParsedInvoiceData {
  invoices: ParsedInvoice[];
  errors: string[];              // file-level errors
  totalInvoices: number;
  validInvoices: number;
}

/* -------------------------------------------------------------------------
 * Column headers as they appear on Row 1 of the sample workbook.
 * Kept as a tuple so the template writer + parser share one source
 * of truth for column order.
 * ------------------------------------------------------------------------- */

const HEADERS = [
  'Issue Date',      // A
  'Invoice No.',     // B
  'Invoice Type',    // C — T / C / CN / DN
  'Name',            // D — customer name (matched by exact or case-insensitive)
  'TIN',             // E — customer tax id (fallback lookup)
  'Currency',        // F — USD / KHR / KRW
  'Due Date',        // G
  'Note',            // H — invoice-level notes
  'Item',            // I
  'Specification',   // J
  'Quantity',        // K
  'Unit',            // L — UOM
  'Unit Price',      // M
  'Discount',        // N — per-line entry, treated as invoice-level (see above)
  'Amount',          // O — computed by service; column is informational
  'Tax Type',        // P — datakey '1'/'2'/'3'/'11'/'12', header row only
  'Remarks',         // Q
] as const;

/** 'T' → tax, 'C' → commercial, 'CN' → credit_note, 'DN' → debit_note.
 *  Case-insensitive. */
const KIND_BY_CODE: Record<string, InvoiceKind> = {
  T: 'tax',
  C: 'commercial',
  CN: 'credit_note',
  DN: 'debit_note',
};

const ALLOWED_TAX_TYPES: ReadonlySet<string> = new Set(['1', '2', '3', '11', '12']);
const ALLOWED_CURRENCIES: ReadonlySet<string> = new Set(['USD', 'KHR', 'KRW']);

/* -------------------------------------------------------------------------
 * Value helpers
 * ------------------------------------------------------------------------- */

/** Returns an ISO `YYYY-MM-DD` string, or `null` if the input is
 *  present but unparseable. Returns `undefined` for genuinely empty
 *  input. Mirrors the accepted formats used in the Employee parser. */
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

/** True when the row has no invoice-header columns populated —
 *  meaning it belongs UNDER the previous header as an extra line. */
function isContinuationRow(row: Record<string, unknown>): boolean {
  return !readString(row['Issue Date']) && !readString(row['Invoice No.']);
}

/* -------------------------------------------------------------------------
 * Parse + validate
 * ------------------------------------------------------------------------- */

/**
 * Parse a `.xlsx` file into a list of ParsedInvoice records.
 *
 * @param file                The user-selected xlsx workbook.
 * @param customers           Live customer roster — used to resolve
 *                            Name/TIN → customerId at parse-time.
 * @param existingInvoiceNos  Invoice numbers already in the tenant's
 *                            system. The parser flags any file row
 *                            that would collide with one of these,
 *                            preventing the DB unique-constraint hit
 *                            at submit time.
 */
export function parseInvoicesExcel(
  file: File,
  customers: Customer[] = [],
  existingInvoiceNos: string[] = [],
): Promise<ParsedInvoiceData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'binary' });
        // Prefer the "Invoice" tab if present (matches the sample);
        // otherwise fall back to the first sheet.
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'invoice')
          ?? workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          resolve({ invoices: [], errors: ['No sheet found in workbook.'], totalInvoices: 0, validInvoices: 0 });
          return;
        }
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
        resolve(buildInvoices(rows, customers, existingInvoiceNos));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsBinaryString(file);
  });
}

function buildInvoices(
  rows: Record<string, unknown>[],
  customers: Customer[],
  existingInvoiceNos: string[] = [],
): ParsedInvoiceData {
  const invoices: ParsedInvoice[] = [];
  const byName = new Map<string, Customer>();
  const byTin  = new Map<string, Customer>();
  for (const c of customers) {
    if (c.name) byName.set(c.name.toLowerCase().trim(), c);
    if (c.tin)  byTin.set(c.tin.trim(), c);
  }
  // Case-insensitive lookup for tenant-wide invoice-number collisions
  // — the DB unique constraint is case-sensitive but the operator's
  // intent almost always is: "INV-001" and "inv-001" would confuse a
  // human reader even if the DB accepted both.
  const existingNoLower = new Set(existingInvoiceNos.map(n => n.toLowerCase().trim()).filter(Boolean));
  // Tracks unresolved customer names we've already seen across the
  // file, so subsequent invoices sharing the same missing customer
  // get isFirstMention=false. Matches the dedup key used at import
  // time in the dialog's createdCustomerIds cache.
  const seenUnresolved = new Set<string>();

  let current: ParsedInvoice | null = null;

  rows.forEach((row, idx) => {
    // Excel row 1 is the header; the first data row is Excel row 2.
    const excelRow = idx + 2;
    const rowIsBlank = HEADERS.every(h => readString(row[h]) === '');
    if (rowIsBlank) return;

    if (!isContinuationRow(row) || current === null) {
      // Close out the running invoice (if any) — validated below on
      // the whole set so we don't emit partial errors here.
      const inv = parseHeaderRow(row, excelRow, byName, byTin);
      invoices.push(inv);
      current = inv;
    }

    // Every non-blank row contributes a line item — the header row
    // itself carries the FIRST line's Item/Qty/UnitPrice, so this
    // pass runs regardless of whether we just opened a new header.
    const item = parseItemRow(row, excelRow);
    if (item) {
      current!.data.items.push(item);
    } else {
      current!.errors.push(`Row ${excelRow}: line item is missing Item or Quantity/Unit Price.`);
    }
  });

  // Duplicate Invoice No. detection — two passes. The FIRST pass
  // builds a count map so we can distinguish the row that first
  // introduced a number (kept) from the collisions below it
  // (flagged). Case-insensitive to match the tenant lookup.
  const invoiceNoCount = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.data.invoiceNo) {
      const key = inv.data.invoiceNo.toLowerCase().trim();
      invoiceNoCount.set(key, (invoiceNoCount.get(key) ?? 0) + 1);
    }
  }

  // Per-invoice validation — everything the create endpoint requires.
  for (const inv of invoices) {
    if (!inv.data.issueDate) inv.errors.push('Issue Date is required.');
    if (!inv.data.invoiceNo) inv.errors.push('Invoice No. is required.');
    if (!inv.data.kind)      inv.errors.push('Invoice Type must be T (Tax), C (Commercial), CN, or DN.');
    if (!inv.data.customerName) inv.errors.push('Customer Name is required.');
    if (!inv.data.currency)  inv.errors.push('Currency is required (USD, KHR, or KRW).');

    // Invoice No. collisions — hits either the tenant's existing set
    // OR another row in this file. Both are hard errors: the backend
    // enforces uniqueness with a DB constraint, so either case would
    // fail server-side. We flag EVERY row in a duplicate group (not
    // just the second occurrence) so the operator sees the whole
    // conflict, not a half-fix.
    if (inv.data.invoiceNo) {
      const key = inv.data.invoiceNo.toLowerCase().trim();
      if (existingNoLower.has(key)) {
        inv.errors.push(`Invoice No. "${inv.data.invoiceNo}" already exists in the system.`);
      } else if ((invoiceNoCount.get(key) ?? 0) > 1) {
        inv.errors.push(`Invoice No. "${inv.data.invoiceNo}" is used by another row in this file.`);
      }
    }
    if (inv.data.currency && !ALLOWED_CURRENCIES.has(inv.data.currency)) {
      inv.errors.push(`Currency "${inv.data.currency}" not supported (allowed: USD, KHR, KRW).`);
    }
    if (inv.data.items.length === 0) inv.errors.push('At least one line item is required.');
    if (inv.data.taxType && !ALLOWED_TAX_TYPES.has(inv.data.taxType)) {
      inv.errors.push(`Tax Type "${inv.data.taxType}" not recognised (allowed keys: 1, 2, 3, 11, 12).`);
    }

    // Resolve customer if we haven't yet — Name preferred, TIN as
    // fallback. When neither hits, we FLAG it (metadata only, no
    // warning text) rather than hard-fail: the "+ New customer"
    // badge in the preview card and the toggle banner up top carry
    // the same message, so a separate warning line would be
    // redundant. Runs even when the tenant's Customer list is empty
    // — a fresh tenant hitting bulk-upload has no customers yet but
    // still needs every row marked unresolved so the auto-create
    // flow can spawn them at submit time.
    if (!inv.customerId && inv.data.customerName) {
      const byNameHit = byName.get(inv.data.customerName.toLowerCase().trim());
      const byTinHit  = inv.data.tin ? byTin.get(inv.data.tin.trim()) : undefined;
      const hit = byNameHit ?? byTinHit;
      if (hit) {
        inv.customerId = hit.id;
      } else {
        const key = inv.data.customerName.toLowerCase().trim();
        const isFirstMention = !seenUnresolved.has(key);
        if (isFirstMention) seenUnresolved.add(key);
        inv.unresolvedCustomer = {
          name: inv.data.customerName,
          tin: inv.data.tin,
          isFirstMention,
        };
      }
    }
  }

  const validInvoices = invoices.filter(i => i.errors.length === 0).length;
  return { invoices, errors: [], totalInvoices: invoices.length, validInvoices };
}

function parseHeaderRow(
  row: Record<string, unknown>,
  excelRow: number,
  _byName: Map<string, Customer>,
  _byTin: Map<string, Customer>,
): ParsedInvoice {
  const rawKind = readString(row['Invoice Type']).toUpperCase();
  const rawTax  = readString(row['Tax Type']);
  const rawCurrency = readString(row['Currency']).toUpperCase();
  const issueDate = normaliseDate(row['Issue Date']);
  const dueDate   = normaliseDate(row['Due Date']);
  const discountRaw = readNumber(row['Discount']);

  const inv: ParsedInvoice = {
    rowNumber: excelRow,
    data: {
      issueDate: issueDate ?? undefined,
      invoiceNo: readString(row['Invoice No.']) || undefined,
      kind: KIND_BY_CODE[rawKind],
      customerName: readString(row['Name']) || undefined,
      tin: readString(row['TIN']) || undefined,
      currency: rawCurrency || undefined,
      dueDate: dueDate === undefined ? undefined : dueDate,
      notes: readString(row['Note']) || undefined,
      taxType: rawTax ? (rawTax as InvoiceTaxType) : null,
      discountValue: discountRaw ?? undefined,
      remarks: readString(row['Remarks']) || undefined,
      items: [],
    },
    errors: [],
    warnings: [],
  };

  if (issueDate === null) inv.errors.push(`Row ${excelRow}: Issue Date is not a valid date.`);
  if (dueDate   === null) inv.errors.push(`Row ${excelRow}: Due Date is not a valid date.`);
  if (rawKind && !KIND_BY_CODE[rawKind]) {
    inv.errors.push(`Row ${excelRow}: Invoice Type "${rawKind}" not recognised (use T, C, CN, or DN).`);
  }
  return inv;
}

function parseItemRow(row: Record<string, unknown>, excelRow: number): ParsedInvoiceItem | null {
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

export function downloadInvoiceTemplate(): void {
  const wb = XLSX.utils.book_new();

  // Sample rows: one Tax invoice with three line items, one
  // Commercial invoice with a single line — mirrors the shape the
  // ops team already uses so the operator sees the grouping rule
  // (blank A–H = continuation) rendered concretely.
  const sample: (string | number)[][] = [
    ['2020-01-30', '001', 'T', 'Test Trading Co., Ltd', 'L0001-000000001', 'USD', '2020-02-28', 'Agreement on the first Quotation with the customer.', 'Server Rack', '12 Slots', 1, '', 500, 50, 500, '1', ''],
    ['',            '',    '',  '',                      '',                  '',    '',           '',                                                       'HDD',         '1TB',      20, '', 400, '',  8000, '1', ''],
    ['',            '',    '',  '',                      '',                  '',    '',           '',                                                       'Memory',      'DDR4 16G', 10, '',  80, '',   800, '1', ''],
    ['2020-01-31', '002', 'C', 'Enterprise Corp.',       'E0021-000000009',   'KHR', '2020-03-01', 'The amount agreed with the Manager.',                    'Monitor',     '27 inch',   4, '', 200, 50,   800, '3', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet([HEADERS as unknown as string[], ...sample]);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Invoice');

  // Guide tab — one-page cheat-sheet for the grouping rule + the
  // enum codes so the operator doesn't have to guess.
  const guide: (string | number)[][] = [
    ['Field',          'Rule'],
    ['Issue Date',     'Required on header row. Formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, Excel date cell.'],
    ['Invoice No.',    'Required on header row. Must be unique per tenant.'],
    ['Invoice Type',   'T = Tax invoice, C = Commercial, CN = Credit Note, DN = Debit Note.'],
    ['Name',           'Customer name — matched case-insensitively against your Customers list.'],
    ['TIN',            'Optional. Used as a fallback when Name doesn’t match a customer.'],
    ['Currency',       'USD, KHR, or KRW (must match the tenant Currency setting).'],
    ['Due Date',       'Optional. Same date formats as Issue Date.'],
    ['Note',           'Optional invoice-level note (printed on the invoice head).'],
    ['Item / Qty / Unit Price', 'Required on every non-blank row.'],
    ['Specification',  'Optional line-level description.'],
    ['Unit',           'Optional UOM (pcs, box, kg, hour, …).'],
    ['Discount',       'On the header row only. Treated as an INVOICE-level flat discount.'],
    ['Amount',         'Informational — the server computes Qty × Unit Price at save time.'],
    ['Tax Type',       'Datakey: 1 = VAT 10%, 2 = VAT 0%, 3 = Exclusive VAT, 11 = WHT 15%, 12 = WHT 14%.'],
    ['Remarks',        'Optional. Not persisted on the invoice today — informational.'],
    ['', ''],
    ['Grouping rule',  'A row with Issue Date OR Invoice No. filled starts a NEW invoice. Subsequent rows that leave columns A–H blank attach as extra line items to the previous invoice.'],
  ];
  const gws = XLSX.utils.aoa_to_sheet(guide);
  gws['!cols'] = [{ wch: 22 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, gws, 'Guide');

  XLSX.writeFile(wb, 'Invoices-Template.xlsx');
}

/* -------------------------------------------------------------------------
 * Adapter → API request. The dialog calls this per row at submit time.
 * ------------------------------------------------------------------------- */

export function toInvoiceRequest(inv: ParsedInvoice, customerIdOverride?: string): {
  kind: InvoiceKind;
  invoiceNo?: string;
  customerId: string;
  issueDate?: string;
  dueDate?: string | null;
  currency?: string;
  taxType?: InvoiceTaxType | null;
  discountType: 'amount';
  discountValue: number;
  notes?: string | null;
  items: InvoiceItemRequest[];
} {
  const cid = customerIdOverride ?? inv.customerId;
  if (!cid) throw new Error('Customer not resolved — importer should have blocked this row.');
  return {
    kind: inv.data.kind!,
    invoiceNo: inv.data.invoiceNo,
    customerId: cid,
    issueDate: inv.data.issueDate,
    dueDate: inv.data.dueDate ?? null,
    currency: inv.data.currency,
    taxType: inv.data.taxType ?? null,
    discountType: 'amount',
    discountValue: inv.data.discountValue ?? 0,
    notes: inv.data.notes ?? null,
    items: inv.data.items.map(it => ({
      name: it.name,
      description: it.description ?? null,
      unit: it.unit ?? null,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    })),
  };
}

/**
 * Build the CustomerRequest payload for an auto-created row.
 *
 * A missing customer is treated as a BUSINESS (the sample workbook's
 * columns and the ops-team's typical Excel are B2B). When the row has
 * a TIN, we mark it `taxable` (TIN presence implies VAT registration);
 * otherwise `non_taxable` — the backend requires a sub-type on every
 * business customer. Individual imports can add customers manually.
 *
 * <p>The Excel template doesn't carry a Representative column but the
 * backend rejects any business customer without one. We seed it with
 * the company name itself so the record saves cleanly on import;
 * the operator can rename it later on the Customers page.</p>
 */
export function buildAutoCreateCustomerRequest(inv: ParsedInvoice): CustomerRequest {
  const u = inv.unresolvedCustomer!;
  const trimmedName = u.name.trim();
  const hasTin = !!u.tin && u.tin.trim().length > 0;
  return {
    type: 'business',
    name: trimmedName,
    tin: hasTin ? u.tin!.trim() : undefined,
    businessType: hasTin ? 'taxable' : 'non_taxable',
    // Backend requires a non-blank representative for every business
    // customer (see CustomerService#validate). Excel has no such
    // column, so we seed it with the company name — the operator
    // can rename it after import if they know the real contact.
    representative: trimmedName,
  };
}

/** True when a row can be imported given the current toggle state.
 *  Rows with unresolved customers are gated on {@code autoCreate} —
 *  the dialog uses this to enable/disable per-row checkboxes and to
 *  compute the "N valid of M" tally. */
export function isImportable(inv: ParsedInvoice, autoCreate: boolean): boolean {
  if (inv.errors.length > 0) return false;
  if (inv.unresolvedCustomer && !autoCreate) return false;
  return true;
}
