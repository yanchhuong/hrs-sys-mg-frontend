/**
 * Common number formatters used across the app.
 *
 * Two flavours by convention:
 *   formatNumber  → "#,###"     for counts, days, hours, indices — no decimals.
 *   formatMoney   → "#,###.00"  for currency amounts — always 2 decimals.
 *
 * Both use the en-US grouping (comma thousands) regardless of the user's
 * locale so payroll / report output is consistent across browsers and
 * Excel exports. Null / undefined / NaN safely render as "0" / "0.00".
 */

/** "1234.5" → "1,234"  ·  null / NaN → "0" */
export function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '0';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** "1234.5" → "1,234.50"  ·  null / NaN → "0.00" */
export function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '0.00';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "1234.5" → "$1,234.50". Pure convenience for the common case. */
export function formatUSD(n: number | null | undefined): string {
  return `$${formatMoney(n)}`;
}
