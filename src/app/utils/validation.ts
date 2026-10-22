/**
 * Form input limits + format checks — mirrors what the API enforces, so a
 * user mistake is caught at the field instead of as a 400/409 on Save.
 *
 * Kept identical to hrs-mobile-app/src/utils/validation.ts — change both.
 *
 * Sources (hrs-sys-mg-api): request-DTO @Size / @Pattern / @Positive and,
 * where the DTO is silent, the column definition (varchar(n), numeric(p,s)).
 * A varchar overflow or numeric overflow comes back from the server as a
 * raw 409 ("value too long for type character varying(255)"), which is the
 * error this file exists to prevent. Unbounded `text` columns get LONG_TEXT,
 * a generous UI-only cap against accidental mega-pastes.
 */

/** Max lengths for typed text fields. */
export const LEN = {
  name: 255,           // customer / vendor / employee / item / line item name
  khmerName: 255,
  email: 255,
  phone: 64,
  cid: 64,
  tin: 64,
  taxId: 64,
  representative: 255,
  site: 255,
  insurance: 255,
  studentNo: 32,
  guardianName: 255,
  empNo: 32,
  position: 255,
  placeOfBirth: 255,
  nffNo: 64,
  tid: 64,
  sku: 64,
  barcode: 64,
  unit: 32,            // item unit / line UOM
  category: 64,
  docNo: 64,           // invoice / bill / quotation / voucher / expense number
  referenceNo: 64,     // payment reference
  recipientName: 255,
  bankAccount: 64,
  /** `text` columns (address, notes, terms, purpose, description). */
  longText: 5000,
} as const;

/**
 * Number shapes, from the column's numeric(precision, scale):
 * `int` = precision − scale (max integer digits), `dec` = scale.
 */
export interface NumSpec { int: number; dec: number; signed?: boolean }
export const NUM = {
  /** numeric(14,2) — totals, discount, tax, payment amount, stock qty. */
  money:     { int: 12, dec: 2 },
  /** numeric(14,2) — line quantity. */
  qty:       { int: 12, dec: 2 },
  /** numeric(14,4) — line unit price (V367). */
  unitPrice: { int: 10, dec: 4 },
  /** numeric(14,4) — exchange rate. */
  rate:      { int: 10, dec: 4 },
  /** numeric(12,2) — employee salary + allowances. */
  salary:    { int: 10, dec: 2 },
  /** numeric(5,1) — patient height / weight (0–999.9). */
  measure:   { int: 3, dec: 1 },
  /** Whole count, e.g. number of children. */
  count:     { int: 2, dec: 0 },
  /** Item modifier price delta — may be negative. */
  signedMoney: { int: 12, dec: 2, signed: true },
} as const satisfies Record<string, NumSpec>;

/**
 * Mask a raw keystroke/paste to a number shape: digits only, one dot,
 * at most `dec` fractional and `int` integer digits, a leading minus only
 * when `signed`. "41yh00" → "4100", "1.2.3" → "1.23", "-5" → "5" (unsigned).
 * Returns a string so the caller keeps an editable state ("12." while typing).
 */
export function maskNumber(raw: string, spec: NumSpec): string {
  const neg = !!spec.signed && raw.trim().startsWith('-');
  let s = raw.replace(/[^\d.]/g, '');
  const first = s.indexOf('.');
  if (first !== -1) s = s.slice(0, first + 1) + s.slice(first + 1).replace(/\./g, '');
  let [intPart, decPart] = s.split('.') as [string, string | undefined];
  intPart = intPart.slice(0, spec.int);
  if (spec.dec === 0) decPart = undefined;
  s = decPart !== undefined ? `${intPart}.${decPart.slice(0, spec.dec)}` : intPart;
  return neg ? `-${s}` : s;
}

/** Phone-ish text: digits, spaces, + - ( ) only, capped at LEN.phone. */
export function maskPhone(raw: string): string {
  return raw.replace(/[^\d+\-() ]/g, '').slice(0, LEN.phone);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Blank is valid (optional field); use with a required check if needed. */
export const isEmail = (v: string | null | undefined): boolean => !v || !v.trim() || EMAIL_RE.test(v.trim());

/** At least 6 digits once punctuation is stripped. Blank is valid. */
export const isPhone = (v: string | null | undefined): boolean => {
  if (!v || !v.trim()) return true;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 20 && /^[\d+\-() ]+$/.test(v.trim());
};

/** Parse a masked number string; '' / '.' → NaN. */
export const toNum = (v: string | number | null | undefined): number => {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  const t = String(v).trim();
  return t === '' || t === '.' || t === '-' ? NaN : Number(t);
};

/** Due date must not be before the issue date (ISO yyyy-MM-dd strings). */
export const dueNotBeforeIssue = (issue?: string | null, due?: string | null): boolean =>
  !issue || !due || due >= issue;

/** Percent discount must be 0–100. */
export const isValidPercent = (v: string | number): boolean => {
  const n = toNum(v);
  return Number.isFinite(n) && n >= 0 && n <= 100;
};
