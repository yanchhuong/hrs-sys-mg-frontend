/**
 * Shared rules of the Increase and Deduction pages — the web twin of the
 * mobile app's src/lib/payrollAdjust.ts, so both platforms default,
 * label and classify a row the same way.
 */

export type AdjustUnit = 'amount' | 'percentage' | 'day';

export const UNIT_LABEL: Record<AdjustUnit, string> = {
  amount: 'Fixed Amount',
  percentage: 'Percentage',
  day: 'Day(s)',
};

export function formatAdjustAmount(amount: number, unit: AdjustUnit): string {
  if (unit === 'day') return `${amount} days`;
  if (unit === 'percentage') return `${amount}%`;
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** What Settings → Payroll Categories says a category is: its unit and
 *  default value. Picking a Type on the Add dialogs starts from these,
 *  and the hint under the Type field says where they came from. */
export function categoryDefaults(cat: { valueType?: string | null; defaultAmount?: number | null } | undefined): {
  unit: AdjustUnit; amount: string; hint: string | null;
} {
  const vt = (cat?.valueType ?? '').toLowerCase();
  const unit: AdjustUnit = vt === 'day' ? 'day' : vt === 'percentage' || vt === 'percent' ? 'percentage' : 'amount';
  const n = Number(cat?.defaultAmount ?? 0);
  const amount = n > 0 ? String(n) : '';
  const hint = cat ? `From Settings: ${UNIT_LABEL[unit]}${n > 0 ? ` · default ${formatAdjustAmount(n, unit)}` : ''}` : null;
  return { unit, amount, hint };
}

/** Increase lifecycle against today — Scheduled until the effective
 *  date, Ended after Effective Until, Active otherwise. Same rule as the
 *  mobile Increase list's status chip. */
export type IncreaseLifecycle = 'active' | 'scheduled' | 'ended';

export function increaseLifecycle(effectiveDate?: string | null, effectiveUntil?: string | null, today = new Date()): IncreaseLifecycle {
  const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (effectiveDate && effectiveDate.slice(0, 10) > t) return 'scheduled';
  if (effectiveUntil && effectiveUntil.slice(0, 10) < t) return 'ended';
  return 'active';
}

export const LIFECYCLE_LABEL: Record<IncreaseLifecycle, string> = {
  active: 'Active',
  scheduled: 'Scheduled',
  ended: 'Ended',
};
