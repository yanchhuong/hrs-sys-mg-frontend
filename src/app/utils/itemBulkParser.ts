/**
 * Item (catalog) bulk-upload parser + template writer.
 *
 * Simpler shape than the Invoice / Bill importers — each row is one
 * standalone item with no header/continuation grouping. The parser
 * validates required fields (name), normalises numeric prices,
 * whitelists the POS category enum, and flags SKU collisions against
 * the tenant's existing catalog + against other rows in the file.
 */
import * as XLSX from 'xlsx';
import type { Item, ItemCategory, ItemRequest } from '../api/items';
import type { Warehouse } from '../api/warehouses';

export interface ParsedItemRow {
  /** 1-indexed Excel row this record came from. */
  rowNumber: number;
  data: ItemRequest & { name: string };
  /** When set, the row's SKU matches an existing catalog item — the
   *  importer will UPDATE that item instead of inserting a new one.
   *  The backend records a stock movement for any stockQty change. */
  existingItemId?: string;
  /** Snapshot of the existing item's current stock at parse time so
   *  the dialog can show "10 → 25" style delta previews. */
  existingStockQty?: number;
  errors: string[];
  warnings: string[];
}

export interface ParsedItemData {
  items: ParsedItemRow[];
  errors: string[];             // file-level
  totalItems: number;
  validItems: number;
}

/** Column order on Row 1 of the workbook. `Code` = SKU, `Category` =
 *  the free-text Stock category (V151), `POS Category` = the fixed
 *  drink/snack/food/other enum (V142). Split into two columns so an
 *  operator can populate either or both without confusion. */
const HEADERS = [
  'Code',           // A — SKU
  'Item Name',      // B — required
  'Description',    // C
  'Category',       // D — free-text Stock category
  'POS Category',   // E — drink | snack | food | other
  'Unit',           // F — pcs, kg, hour, cup, …
  'Cost Price',     // G
  'Selling Price',  // H
  'Current Stock',  // I — initial on-hand qty
  'Min Stock',      // J — reorder threshold
  'Active',         // K — Yes / No, defaults Yes
  'Stock IN/OUT',   // L — Yes / No, defaults No. When Yes: Invoices & POS decrement (OUT), Bills increment (IN).
  'Warehouse',      // M — optional. Warehouse NAME (V149); the importer resolves it to the UUID at upload time.
] as const;

const ALLOWED_POS_CATEGORIES: ReadonlySet<string> =
  new Set<ItemCategory>(['drink', 'snack', 'food', 'craft', 'souvenir', 'jewelry', 'other']);

/* -------------------------------------------------------------------------
 * Value helpers
 * ------------------------------------------------------------------------- */

function readString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function readNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/** Loose Yes/No parser — accepts Yes/No, Y/N, True/False, 1/0.
 *  Returns undefined for anything else so the caller can fall back
 *  to the server default. */
function readBool(v: unknown): boolean | undefined {
  const s = readString(v).toLowerCase();
  if (!s) return undefined;
  if (['yes', 'y', 'true', 't', '1'].includes(s)) return true;
  if (['no', 'n', 'false', 'f', '0'].includes(s)) return false;
  return undefined;
}

/* -------------------------------------------------------------------------
 * Parse + validate
 * ------------------------------------------------------------------------- */

export function parseItemsExcel(
  file: File,
  existingItems: Item[] = [],
  /** V149 — warehouses the tenant has configured. The parser uses the
   *  case-insensitive NAME match to resolve a "Warehouse" cell to a
   *  UUID for the ItemRequest. Empty list = feature off or none
   *  configured; parser then treats the Warehouse column as ignored. */
  warehouses: Warehouse[] = [],
): Promise<ParsedItemData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'binary' });
        // Prefer an "Items" sheet if named that way; otherwise sheet[0].
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'items')
          ?? workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          resolve({ items: [], errors: ['No sheet found in workbook.'], totalItems: 0, validItems: 0 });
          return;
        }
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
        resolve(buildItems(rows, existingItems, warehouses));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsBinaryString(file);
  });
}

function buildItems(rows: Record<string, unknown>[], existing: Item[], warehouses: Warehouse[]): ParsedItemData {
  const out: ParsedItemRow[] = [];
  // Case-insensitive SKU → Item lookup. A collision no longer blocks
  // the row — the importer flips into UPDATE mode for that SKU and
  // the backend records a stock movement for any delta. Within-file
  // dupes remain hard errors because two rows targeting the same
  // existing SKU would double-post the movement.
  const existingBySku = new Map<string, Item>();
  for (const it of existing) {
    const k = (it.sku ?? '').toLowerCase().trim();
    if (k) existingBySku.set(k, it);
  }
  // V149 — case-insensitive warehouse name → id lookup. Built once
  // per parse so a 500-row upload doesn't rebuild the map on every
  // parseRow call.
  const warehouseByName = new Map<string, Warehouse>();
  for (const w of warehouses) {
    const k = (w.name ?? '').toLowerCase().trim();
    if (k) warehouseByName.set(k, w);
  }

  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const isBlank = HEADERS.every(h => readString(row[h]) === '');
    if (isBlank) return;
    out.push(parseRow(row, excelRow, warehouseByName));
  });

  const seenSku = new Map<string, number>(); // sku → first-seen row number
  for (const rec of out) {
    const sku = (rec.data.sku ?? '').toLowerCase().trim();
    if (!sku) continue;
    const hit = existingBySku.get(sku);
    if (hit) {
      rec.existingItemId = hit.id;
      rec.existingStockQty = hit.stockQty ?? 0;
    }
    if (seenSku.has(sku)) {
      rec.errors.push(`Code "${rec.data.sku}" is used by row ${seenSku.get(sku)} in this file.`);
    } else {
      seenSku.set(sku, rec.rowNumber);
    }
  }

  const validItems = out.filter(r => r.errors.length === 0).length;
  return { items: out, errors: [], totalItems: out.length, validItems };
}

function parseRow(
  row: Record<string, unknown>,
  excelRow: number,
  warehouseByName: Map<string, Warehouse>,
): ParsedItemRow {
  const name = readString(row['Item Name']);
  const sku  = readString(row['Code']);
  const posCategoryRaw = readString(row['POS Category']).toLowerCase();
  const itemCategory  = readString(row['Category']);
  const unit = readString(row['Unit']);
  const cost = readNumber(row['Cost Price']);
  const price = readNumber(row['Selling Price']);
  const stock = readNumber(row['Current Stock']);
  const minStock = readNumber(row['Min Stock']);
  const active = readBool(row['Active']);
  // v-bill-stock-in-two-way — column was renamed from "Deduct on Sale"
  // to "Stock IN/OUT" to reflect the two-way movement. Accept the old
  // header too so upload spreadsheets in circulation don't break.
  const deduct = readBool(row['Stock IN/OUT'] ?? row['Deduct on Sale']);
  const description = readString(row['Description']);
  // V149 — Warehouse column is optional. Empty cell → no assignment.
  // Non-empty name that doesn't match any configured warehouse →
  // warning + skip assignment (row still imports without a warehouse).
  const warehouseName = readString(row['Warehouse']);
  const matchedWarehouse = warehouseName
    ? warehouseByName.get(warehouseName.toLowerCase())
    : undefined;

  const rec: ParsedItemRow = {
    rowNumber: excelRow,
    data: {
      sku: sku || undefined,
      name,
      description: description || undefined,
      unit: unit || undefined,
      unitCost: cost ?? undefined,
      unitPrice: price ?? undefined,
      stockQty: stock ?? undefined,
      minStock: minStock ?? undefined,
      active: active ?? undefined,
      deductionEnabled: deduct ?? undefined,
      itemCategory: itemCategory || undefined,
      category: (posCategoryRaw as ItemCategory) || undefined,
      warehouseId: matchedWarehouse?.id ?? undefined,
    },
    errors: [],
    warnings: [],
  };
  if (warehouseName && !matchedWarehouse) {
    rec.warnings.push(
      `Warehouse "${warehouseName}" doesn't match any configured warehouse — row will import without a warehouse assignment.`,
    );
  }

  if (!name) rec.errors.push('Item Name is required.');
  // v-item-category-free-text (V269) — no allow-list check anymore.
  // Any non-empty string is accepted and saved as-is; the BE trims +
  // lowercases and caps at 64 chars. Warn (don't error) when the
  // value falls outside the common set so the operator knows their
  // POS filter chip will bucket the item under "Other".
  if (posCategoryRaw && !ALLOWED_POS_CATEGORIES.has(posCategoryRaw) && posCategoryRaw.length > 64) {
    rec.errors.push(`POS Category "${row['POS Category']}" is over 64 characters — shorten it.`);
  } else if (posCategoryRaw && !ALLOWED_POS_CATEGORIES.has(posCategoryRaw)) {
    rec.warnings.push(`POS Category "${row['POS Category']}" is not one of drink / snack / food / craft / souvenir / jewelry — it will appear under "Other" on POS + shop filters.`);
  }
  if (cost != null && cost < 0)   rec.errors.push('Cost Price cannot be negative.');
  if (price != null && price < 0) rec.errors.push('Selling Price cannot be negative.');
  return rec;
}

/* -------------------------------------------------------------------------
 * Template writer
 * ------------------------------------------------------------------------- */

export function downloadItemTemplate(): void {
  const wb = XLSX.utils.book_new();

  const sample: (string | number)[][] = [
    ['PR-001', 'Cappuccino',        'Classic Italian espresso with steamed milk', 'Coffee',    'drink', 'cup', 0.80, 1.50, 20, 5,  'Yes', 'No',  'Main Store'],
    ['PR-002', 'Americano',         'Espresso topped with hot water',              'Coffee',    'drink', 'cup', 0.60, 1.50, 30, 5,  'Yes', 'No',  'Main Store'],
    ['PR-003', 'Macha Latte',       'Matcha green tea whisked with steamed milk',  'Tea',       'drink', 'cup', 1.10, 1.50, 15, 5,  'Yes', 'No',  'Main Store'],
    ['SNK-01', 'Chocolate Croissant', 'Buttery pastry with chocolate filling',     'Bakery',    'snack', 'pcs', 0.90, 2.00, 10, 3,  'Yes', 'Yes', 'Warehouse A'],
  ];

  const ws = XLSX.utils.aoa_to_sheet([HEADERS as unknown as string[], ...sample]);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Items');

  const guide: (string | number)[][] = [
    ['Field',           'Rule'],
    ['Code',            'Optional SKU — must be unique per tenant when set. Leave blank to let the operator hand out codes manually later.'],
    ['Item Name',       'Required. Free text.'],
    ['Description',     'Optional. Free text; shown under the name on the catalog table.'],
    ['Category',        'Optional free-text Stock category (V151) — e.g. "Coffee", "Bakery", "Beverages/Hot".'],
    ['POS Category',    'Optional. One of drink / snack / food / other. Drives the POS filter tabs.'],
    ['Unit',            'Optional. Free text — pcs, kg, hour, cup, …'],
    ['Cost Price',      'Optional. Non-negative decimal.'],
    ['Selling Price',   'Optional. Non-negative decimal.'],
    ['Current Stock',   'Optional. Initial on-hand quantity. Negatives allowed if the tenant tracks back-orders.'],
    ['Min Stock',       'Optional. Reorder threshold — drives the Low / Out status badge.'],
    ['Active',          'Optional. Yes / No (accepts Y/N, True/False, 1/0). Defaults Yes on the server.'],
    ['Stock IN/OUT',    'Optional. When Yes: Invoices & POS lines with this item decrement stock (OUT), Bills increment (IN). Defaults No.'],
    ['Warehouse',       'Optional. Warehouse NAME as configured under Stock → Warehouses (case-insensitive). Leave blank for no assignment. Unknown names skip the assignment with a warning — the row still imports.'],
  ];
  const gws = XLSX.utils.aoa_to_sheet(guide);
  gws['!cols'] = [{ wch: 18 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, gws, 'Guide');

  XLSX.writeFile(wb, 'Items-Template.xlsx');
}

/** Adapt to the ItemRequest the create endpoint expects. Blank
 *  optional fields fall through as undefined so the server keeps
 *  its own defaults. */
export function toItemRequest(rec: ParsedItemRow): ItemRequest {
  return { ...rec.data };
}
