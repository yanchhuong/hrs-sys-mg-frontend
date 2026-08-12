import { loadXlsx } from './xlsxLoader';

/**
 * One row parsed out of the Attendance Records upload template (see
 * {@link downloadAttendanceTemplate}). Field shape mirrors the backend
 * DTO {@code AttendanceUploadRow} so the result of {@link parseAttendanceExcel}
 * can be POSTed verbatim.
 */
export interface AttendanceUploadRow {
  empNo: string;
  date: string; // YYYY-MM-DD
  morningIn?: string;  // HH:mm
  morningOut?: string;
  noonIn?: string;
  noonOut?: string;
  status?: string;
  notes?: string;
}

export interface ParsedAttendance {
  rows: AttendanceUploadRow[];
  errors: string[];
  /** Excel rows the parser silently dropped — title row, sample rows
   *  prefixed with "Sample —", entirely-blank rows, etc. */
  skipped: number;
}

const STATUS_VALUES = new Set([
  'present', 'late', 'absent', 'leave', 'no_checkin', 'no_checkout', 'early_leave',
]);

/** Convert any cell to "HH:mm" or empty string. Tolerates:
 *   - native string ("08:12", "08:12:00", " 8:5 ")
 *   - Excel time fraction (number 0..1, e.g. 0.3416666 = 08:12)
 *   - native Date object
 *   - empty / null / undefined → ""
 */
function toHhmm(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    const h = String(v.getHours()).padStart(2, '0');
    const m = String(v.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel stores time as a fraction of a day. Below 1 = pure time;
    // larger numbers are likely date-times where the fractional part
    // still encodes the time-of-day.
    const frac = v - Math.floor(v);
    const totalMin = Math.round(frac * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  if (!s) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return '';
  const h = Number(m[1]);
  const mn = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mn) || h > 23 || mn > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
}

/** Convert any cell to "YYYY-MM-DD" or empty string. Tolerates:
 *   - native string ("2026-05-07", "5/7/2026", "07/05/2026")
 *   - Excel date serial (number)
 *   - Date object
 */
function toIsoDate(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel epoch = 1899-12-30 (accounts for the 1900 leap-year bug).
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  if (!s) return '';
  // ISO already.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // M/D/YYYY or D/M/YYYY — let Date parse and pull pieces. Ambiguous in
  // theory but downstream errors will catch a swapped month/day far
  // better than this parser can.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Parse the Attendance Records upload template. Skips:
 *   - the title row ("Attendance Records — Upload Template")
 *   - the header row
 *   - sample rows where Employee Name starts with "Sample —"
 *   - entirely-blank rows
 *   - rows whose date is blank AND no punches were filled in (template
 *     leftover where the admin only filled in 30 of 100 employees)
 *
 * Rows with a date but missing empNo, or vice versa, are reported as
 * errors so the user can fix them before retrying.
 */
export function parseAttendanceExcel(file: File): Promise<ParsedAttendance> {
  return loadXlsx().then(XLSX => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

        // Find the header row — first row whose A cell is "Employee No"
        // (case-insensitive). Anything before it is title / banner.
        let headerIdx = -1;
        for (let i = 0; i < Math.min(aoa.length, 10); i++) {
          const a = String(aoa[i]?.[0] ?? '').trim().toLowerCase();
          if (a === 'employee no') { headerIdx = i; break; }
        }
        if (headerIdx < 0) {
          resolve({ rows: [], errors: ['Could not find header row "Employee No". Use the downloaded template.'], skipped: 0 });
          return;
        }

        const rows: AttendanceUploadRow[] = [];
        const errors: string[] = [];
        let skipped = 0;

        for (let i = headerIdx + 1; i < aoa.length; i++) {
          const r = aoa[i] || [];
          const empNoRaw = r[0];
          const empNameRaw = r[1];
          const dateRaw = r[2];
          const mIn = toHhmm(r[3]);
          const mOut = toHhmm(r[4]);
          const nIn = toHhmm(r[5]);
          const nOut = toHhmm(r[6]);
          const statusRaw = r[7];
          const notesRaw = r[8];

          const empNo = empNoRaw == null ? '' : String(empNoRaw).trim();
          const empName = empNameRaw == null ? '' : String(empNameRaw).trim();
          const date = toIsoDate(dateRaw);
          const status = (statusRaw == null ? '' : String(statusRaw).trim().toLowerCase());
          const notes = notesRaw == null ? '' : String(notesRaw).trim();

          // Skip sample rows the template ships with.
          if (empName.toLowerCase().startsWith('sample')) { skipped++; continue; }

          // Skip blank rows (no empNo, no date, no punches, no status).
          const hasAnyContent = empNo || date || mIn || mOut || nIn || nOut || status || notes;
          if (!hasAnyContent) { skipped++; continue; }

          // Skip "template leftover" rows — has empNo + date but absolutely
          // nothing else. Equivalent to "I didn't have data for this
          // employee on this day"; no value posting it.
          if (empNo && date && !mIn && !mOut && !nIn && !nOut && !status && !notes) {
            skipped++;
            continue;
          }

          const rowNo = i + 1;
          if (!empNo) {
            errors.push(`Row ${rowNo}: missing Employee No`);
            continue;
          }
          if (!date) {
            errors.push(`Row ${rowNo} (${empNo}): missing or unparseable Date`);
            continue;
          }
          if (status && !STATUS_VALUES.has(status)) {
            errors.push(`Row ${rowNo} (${empNo}): unknown Status "${statusRaw}"`);
            continue;
          }

          rows.push({
            empNo,
            date,
            morningIn:  mIn  || undefined,
            morningOut: mOut || undefined,
            noonIn:     nIn  || undefined,
            noonOut:    nOut || undefined,
            status:     status || undefined,
            notes:      notes  || undefined,
          });
        }

        resolve({ rows, errors, skipped });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  }));
}
