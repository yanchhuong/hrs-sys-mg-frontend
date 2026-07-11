/**
 * Overtime bulk-upload parser + template writer.
 *
 * Same shape as {@code vendorBulkParser} / {@code customerBulkParser} — one
 * row per OT record, per-row validation, in-file dedup pass, and a template
 * writer with a Guide tab. Rows resolve to employees by empNo (preferred)
 * or by exact-match name (fallback for tenants that don't hand out empNo).
 *
 * Consumed by {@link BulkUploadOtDialog}; the caller decides who's allowed
 * to file OT on behalf of others (see the gate in Overtime.tsx).
 */
import * as XLSX from 'xlsx';
import type { CreateOtRequest } from '../api/overtime';
import type { Employee } from '../types/hrms';

export interface ParsedOtRow {
  rowNumber: number;
  /** Resolved employee (populated when we could match) — carried through
   *  so the preview table can render name + department without re-lookups. */
  employee?: Employee;
  data: CreateOtRequest & { employeeIdLabel: string };
  errors: string[];
  warnings: string[];
}

export interface ParsedOtData {
  rows: ParsedOtRow[];
  errors: string[];
  totalRows: number;
  validRows: number;
}

const HEADERS = [
  'Employee ID',   // A — empNo (preferred) or employee name (fallback)
  'Date',          // B — required, YYYY-MM-DD (or Excel date cell)
  'End Date',      // C — optional; defaults to Date. Set date+1 for cross-midnight
  'Start Hour',    // D — optional HH:mm label
  'End Hour',      // E — optional HH:mm label
  'Hours',         // F — required numeric
  'Reason',        // G — optional
  'Day Type',      // H — optional workday | weekend | holiday
  'Rate Override', // I — optional numeric multiplier
] as const;

const ALLOWED_DAY_TYPES: ReadonlySet<string> = new Set(['workday', 'weekend', 'holiday']);
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/** Excel stores dates as serial numbers. Coerce those, ISO strings, and
 *  Date objects to a normalized YYYY-MM-DD. Returns '' if unparseable. */
function readDate(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) return isoLocal(v);
  if (typeof v === 'number') {
    // Excel epoch = 1899-12-30 in the 1900-based ecosystem
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isoLocal(d);
  }
  const s = String(v).trim();
  if (ISO_DATE.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return isoLocal(d);
  return '';
}

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Numeric hour like 17.5 → "17:30". HH:mm strings pass through. */
function readTime(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    // Excel time = fraction of a day (0.5 = noon)
    const totalMin = Math.round(v * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return String(v).trim();
}

function readNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* -------------------------------------------------------------------------
 * Parse + validate
 * ------------------------------------------------------------------------- */

export function parseOtExcel(
  file: File,
  employees: Employee[],
): Promise<ParsedOtData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'overtime')
          ?? workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          resolve({ rows: [], errors: ['No sheet found in workbook.'], totalRows: 0, validRows: 0 });
          return;
        }
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true }) as Record<string, unknown>[];
        resolve(buildRows(rows, employees));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsBinaryString(file);
  });
}

function buildEmployeeIndex(employees: Employee[]) {
  // Index by empNo (case-insensitive) AND by lower-cased name. Multiple
  // employees with the same name get the FIRST match — parser flags the
  // ambiguity as a warning per row so operators know to switch to empNo.
  const byEmpNo = new Map<string, Employee>();
  const byName = new Map<string, Employee[]>();
  for (const e of employees) {
    const empNo = (e.id ?? '').trim().toLowerCase();
    if (empNo) byEmpNo.set(empNo, e);
    const name = (e.name ?? '').trim().toLowerCase();
    if (name) {
      const bucket = byName.get(name) ?? [];
      bucket.push(e);
      byName.set(name, bucket);
    }
  }
  return { byEmpNo, byName };
}

function buildRows(
  rows: Record<string, unknown>[],
  employees: Employee[],
): ParsedOtData {
  const idx = buildEmployeeIndex(employees);
  const out: ParsedOtRow[] = [];

  rows.forEach((row, i) => {
    const excelRow = i + 2;
    const isBlank = HEADERS.every(h => readString(row[h]) === '');
    if (isBlank) return;
    out.push(parseRow(row, excelRow, idx));
  });

  // In-file dedup — same employee + same date is almost always a
  // double-entry mistake. Flag as warning (rows are still importable
  // since a real double-shift is possible).
  const seen = new Map<string, number>();
  for (const rec of out) {
    if (!rec.data.employeeId || !rec.data.date) continue;
    const key = `${rec.data.employeeId}|${rec.data.date}`;
    if (seen.has(key)) {
      rec.warnings.push(`Same employee + date as row ${seen.get(key)}.`);
    } else {
      seen.set(key, rec.rowNumber);
    }
  }

  const validRows = out.filter(r => r.errors.length === 0).length;
  return { rows: out, errors: [], totalRows: out.length, validRows };
}

function parseRow(
  row: Record<string, unknown>,
  excelRow: number,
  idx: { byEmpNo: Map<string, Employee>; byName: Map<string, Employee[]> },
): ParsedOtRow {
  const empLabel = readString(row['Employee ID']);
  const date = readDate(row['Date']);
  const endDateRaw = readString(row['End Date']);
  const endDate = endDateRaw ? readDate(row['End Date']) : '';
  const startHour = readTime(row['Start Hour']);
  const endHour = readTime(row['End Hour']);
  const hours = readNumber(row['Hours']);
  const reason = readString(row['Reason']);
  const dayTypeRaw = readString(row['Day Type']).toLowerCase();
  const rateOverride = readNumber(row['Rate Override']);

  const rec: ParsedOtRow = {
    rowNumber: excelRow,
    data: {
      employeeIdLabel: empLabel,
      date,
      hours: hours ?? 0,
      endDate: endDate || undefined,
      startHour: startHour || undefined,
      endHour: endHour || undefined,
      reason: reason || undefined,
      dayType: (dayTypeRaw as CreateOtRequest['dayType']) || undefined,
      rateOverride: rateOverride ?? undefined,
    },
    errors: [],
    warnings: [],
  };

  // Employee resolution — empNo first, name fallback with ambiguity check.
  if (!empLabel) {
    rec.errors.push('Employee ID is required.');
  } else {
    const empByNo = idx.byEmpNo.get(empLabel.toLowerCase());
    if (empByNo) {
      rec.employee = empByNo;
      rec.data.employeeId = (empByNo as any).apiId ?? empByNo.id;
    } else {
      const byName = idx.byName.get(empLabel.toLowerCase()) ?? [];
      if (byName.length === 1) {
        rec.employee = byName[0];
        rec.data.employeeId = (byName[0] as any).apiId ?? byName[0].id;
        rec.warnings.push('Resolved by name — prefer Employee ID for clarity.');
      } else if (byName.length > 1) {
        rec.errors.push(`Ambiguous — "${empLabel}" matches ${byName.length} employees. Use Employee ID instead.`);
      } else {
        rec.errors.push(`Employee "${empLabel}" not found in the roster.`);
      }
    }
  }

  if (!date) rec.errors.push('Date is required (YYYY-MM-DD).');
  if (endDate && date && endDate < date) rec.errors.push('End Date is before Date.');
  if (endDate && date && (new Date(endDate).getTime() - new Date(date).getTime()) > 86400000) {
    rec.errors.push('End Date must be same day or one day after Date.');
  }

  if (hours == null) rec.errors.push('Hours is required.');
  else if (hours <= 0 || hours > 24) rec.errors.push('Hours must be between 0 and 24.');

  if (startHour && !HH_MM.test(startHour)) rec.errors.push(`Start Hour "${startHour}" is not HH:mm.`);
  if (endHour && !HH_MM.test(endHour))     rec.errors.push(`End Hour "${endHour}" is not HH:mm.`);

  if (dayTypeRaw && !ALLOWED_DAY_TYPES.has(dayTypeRaw)) {
    rec.errors.push(`Day Type "${row['Day Type']}" is not one of workday / weekend / holiday.`);
  }

  if (rateOverride != null && (rateOverride <= 0 || rateOverride > 10)) {
    rec.errors.push('Rate Override must be a positive multiplier <= 10.');
  }

  return rec;
}

/* -------------------------------------------------------------------------
 * Template writer
 * ------------------------------------------------------------------------- */

export function downloadOtTemplate(): void {
  const wb = XLSX.utils.book_new();

  const sample: (string | number)[][] = [
    ['E001', '2026-07-10', '',           '18:00', '21:00', 3,   'Month-end closing',       '',        ''],
    ['E002', '2026-07-11', '',           '17:30', '19:30', 2,   'Customer demo prep',      'weekend', ''],
    ['E003', '2026-07-12', '2026-07-13', '22:00', '02:00', 4,   'Night deploy rollback',   '',        1.5],
  ];

  const ws = XLSX.utils.aoa_to_sheet([HEADERS as unknown as string[], ...sample]);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Overtime');

  const guide: (string | number)[][] = [
    ['Field',         'Rule'],
    ['Employee ID',   'Required. Use the empNo shown on the Employees page (e.g. E001). Name is accepted as a fallback but flags a warning.'],
    ['Date',          'Required. YYYY-MM-DD or an Excel date cell. Calendar day the OT begins.'],
    ['End Date',      'Optional. Same as Date for same-day OT; Date + 1 for cross-midnight shifts.'],
    ['Start Hour',    'Optional HH:mm label (e.g. 18:00). Not used by pay calc, shown in history.'],
    ['End Hour',      'Optional HH:mm label (e.g. 21:00). Not used by pay calc, shown in history.'],
    ['Hours',         'Required. Total OT hours worked, e.g. 3 for 18:00–21:00.'],
    ['Reason',        'Optional free text.'],
    ['Day Type',      'Optional. workday | weekend | holiday. Blank = auto-detect from Date.'],
    ['Rate Override', 'Optional numeric multiplier that bypasses day-type + night composition. Leave blank to use the auto-detected rate.'],
    ['', ''],
    ['Duplicates',    'Same employee + same date is flagged as a warning (still importable — real double-shifts exist).'],
    ['Access',        'This upload is available only to users with full Overtime permission AND tenant-wide employee visibility.'],
  ];
  const gws = XLSX.utils.aoa_to_sheet(guide);
  gws['!cols'] = [{ wch: 16 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, gws, 'Guide');

  XLSX.writeFile(wb, 'Overtime-Template.xlsx');
}

/** Strip the {@code employeeIdLabel} helper field before sending to the API. */
export function toCreateOtRequest(rec: ParsedOtRow): CreateOtRequest {
  const { employeeIdLabel: _label, ...clean } = rec.data;
  return clean;
}
