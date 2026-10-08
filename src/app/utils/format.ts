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

/**
 * Currency-aware amount formatter. KHR follows the Cambodian convention
 * (whole-riel display, "#,###" — riel doesn't ship in sub-units) while
 * USD and anything else keeps the standard 2-decimal format
 * ("#,###.00"). Returns the bare number — callers add the symbol /
 * currency-code prefix themselves so they keep control over negative
 * sign placement and column alignment.
 */
export function formatMoneyForCurrency(n: number | null | undefined, currency: string): string {
  if (n == null || !Number.isFinite(Number(n))) return currency === 'KHR' ? '0' : '0.00';
  const isKhr = currency === 'KHR';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: isKhr ? 0 : 2,
    maximumFractionDigits: isKhr ? 0 : 2,
  });
}

/**
 * When a notification arrived: "Sep 24, 02:46 PM".
 *
 * The bells used a bare `toLocaleString()`, which renders
 * "9/24/2026, 2:46:33 PM" — a numeric date and seconds nobody reads.
 * This matches the mobile notification list and announcement-detail, so
 * the same event reads the same wherever it is shown.
 *
 * The year appears only when it is not the current one: showing it
 * always is noise, and omitting it always is misleading on an old row.
 */
export function formatNotificationTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  return when.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    ...(when.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}
