/**
 * Payout frequency (V383) — how often an employee is paid, and which
 * payroll batch kinds belong to each rhythm. Twin of the mobile app's
 * src/lib/payFrequency.ts; keep the two in step.
 *
 *   monthly       once per month   → One Time Salary
 *   semi_monthly  twice per month  → 1st Salary + 2nd Salary
 *   weekly        weekly wage      → Weekly Salary (one week)
 *   daily         daily wage       → Daily Salary (a date range)
 *
 * The company default lives in Payroll Settings → Display; an employee
 * may override it. Weekly / daily pay keeps the MONTHLY base salary and
 * prorates it by the working days in the batch period.
 */

export type PayFrequency = 'monthly' | 'semi_monthly' | 'weekly' | 'daily';

export type BatchType =
  | 'One Time Salary' | '1st Salary' | '2nd Salary' | 'Weekly Salary' | 'Daily Salary';

export const PAY_FREQUENCIES: {
  key: PayFrequency; label: string; hint: string; batchTypes: BatchType[];
}[] = [
  { key: 'semi_monthly', label: 'Twice per month', hint: '1st Salary mid-month, 2nd Salary at month end', batchTypes: ['1st Salary', '2nd Salary'] },
  { key: 'monthly',      label: 'Once per month',  hint: 'One Time Salary at month end',                 batchTypes: ['One Time Salary'] },
  { key: 'weekly',       label: 'Weekly wage',     hint: 'Weekly Salary — monthly base prorated by the week’s working days', batchTypes: ['Weekly Salary'] },
  { key: 'daily',        label: 'Daily wage',      hint: 'Daily Salary — monthly base prorated by the days worked',          batchTypes: ['Daily Salary'] },
];

export const payFrequencyLabel = (f: string | null | undefined): string =>
  PAY_FREQUENCIES.find(p => p.key === f)?.label ?? 'Once per month';

export const isPayFrequency = (v: unknown): v is PayFrequency =>
  v === 'monthly' || v === 'semi_monthly' || v === 'weekly' || v === 'daily';

/** Which rhythm a batch kind pays. Unknown kinds count as monthly. */
export function frequencyOfBatchType(t: string): PayFrequency {
  if (t === '1st Salary' || t === '2nd Salary') return 'semi_monthly';
  if (t === 'Weekly Salary') return 'weekly';
  if (t === 'Daily Salary') return 'daily';
  return 'monthly';
}

/** Category salary-type token for a batch kind (V113 / V383). */
export function salaryTokenOf(t: string): '1st' | '2nd' | 'onetime' | 'weekly' | 'daily' {
  if (t === '1st Salary') return '1st';
  if (t === '2nd Salary') return '2nd';
  if (t === 'Weekly Salary') return 'weekly';
  if (t === 'Daily Salary') return 'daily';
  return 'onetime';
}

/** The batch kinds paid over an explicit date range, not a month. */
export const isPeriodBatch = (t: string) => t === 'Weekly Salary' || t === 'Daily Salary';

/** An employee's own frequency, else the company's. */
export const effectiveFrequency = (own: string | null | undefined, company: PayFrequency): PayFrequency =>
  isPayFrequency(own) ? own : company;

const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const parseIso = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Working days from..to inclusive: weekend days 0, half days 0.5 —
 *  the same weighting as calcStandardWorkDays for a whole month. */
export function workDaysInRange(fromIso: string, toIso_: string, weekendDays: string[] = ['Sat', 'Sun'], halfDayDays: string[] = []): number {
  if (!fromIso || !toIso_ || toIso_ < fromIso) return 0;
  let n = 0;
  for (let d = parseIso(fromIso); toIso(d) <= toIso_; d.setDate(d.getDate() + 1)) {
    const code = DAY_CODES[d.getDay()];
    if (weekendDays.includes(code)) continue;
    n += halfDayDays.includes(code) ? 0.5 : 1;
  }
  return n;
}

/** Monday-to-Sunday week holding {@code iso}. */
export function weekOf(iso: string): { from: string; to: string } {
  const d = parseIso(iso);
  const back = (d.getDay() + 6) % 7;              // days since Monday
  d.setDate(d.getDate() - back);
  const from = toIso(d);
  d.setDate(d.getDate() + 6);
  return { from, to: toIso(d) };
}

/** Seven days starting on {@code fromIso}. */
export function weekFrom(fromIso: string): { from: string; to: string } {
  const d = parseIso(fromIso);
  d.setDate(d.getDate() + 6);
  return { from: fromIso, to: toIso(d) };
}
