/**
 * Tenant-wide currency settings (V166). Drives the currency
 * dropdown on Invoice / POS / Quotation / Voucher forms and the
 * secondary-currency display on the POS receipt.
 *
 * <p>Backend GET falls back to USD + KHR @ 4100 when no row
 * exists, so the FE never has to special-case "missing" —
 * but the {@link CurrencySettings} type still allows nulls
 * because a tenant may genuinely run single-currency.</p>
 */
import { apiJson } from './client';

export type AllowedCurrency = 'USD' | 'KHR' | 'KRW';

export const ALLOWED_CURRENCIES: AllowedCurrency[] = ['USD', 'KHR', 'KRW'];

/** Symbol per ISO code — surfaced in dropdowns + display strings so
 *  the operator sees "USD ($)" rather than just "USD" everywhere a
 *  currency is named. Keep these in sync with whichever locale your
 *  invoice / receipt templates use to format amounts. */
export const CURRENCY_SYMBOLS: Record<AllowedCurrency, string> = {
  USD: '$',
  KHR: '៛',
  KRW: '₩',
};

/** "USD ($)" — used as the {@code <SelectItem>} label and any
 *  free-text rendering of a currency name in the settings UI. */
export function currencyLabel(code: AllowedCurrency | string): string {
  const sym = (CURRENCY_SYMBOLS as Record<string, string | undefined>)[code];
  return sym ? `${code} (${sym})` : code;
}

/** Bare symbol for inline use in totals lines / placeholders. */
export function currencySymbol(code: AllowedCurrency | string): string {
  return (CURRENCY_SYMBOLS as Record<string, string | undefined>)[code] ?? code;
}

export interface CurrencySettings {
  tenantId: string;
  primaryCurrency: AllowedCurrency;
  /** Null = single-currency tenant. */
  secondaryCurrency: AllowedCurrency | null;
  /** Conversion rate primary → secondary. Null when secondary
   *  is null. */
  secondaryRate: number | null;
  updatedAt: string | null;
  updatedById: string | null;
}

export interface CurrencySettingsRequest {
  primaryCurrency: AllowedCurrency;
  /** Send null or empty to clear. */
  secondaryCurrency: AllowedCurrency | null;
  /** Required when secondary is non-null. */
  secondaryRate: number | null;
}

export async function get(): Promise<CurrencySettings> {
  return apiJson('/api/v1/currency-settings');
}

export async function save(req: CurrencySettingsRequest): Promise<CurrencySettings> {
  return apiJson('/api/v1/currency-settings', { method: 'PUT', json: req });
}

export interface LiveRate {
  base:      AllowedCurrency | string;
  quote:     AllowedCurrency | string;
  /** Quote units per 1 base — already in the primary→secondary
   *  orientation the settings row expects, so the FE can drop this
   *  straight into the conversion-rate input. */
  rate:      number;
  source:    string;
  updatedAt: string;
}

/** Fetch the live FX rate via the BE proxy (open.er-api.com under
 *  the hood). Works for any pair the aggregator carries — including
 *  USD/KHR which PayWay's own rate API doesn't cover. */
export async function getLiveRate(base: string, quote: string): Promise<LiveRate> {
  const q = new URLSearchParams({ base, quote });
  return apiJson(`/api/v1/currency-settings/live-rate?${q.toString()}`);
}

/** Resolve the active list of currency codes for dropdowns. Always
 *  includes the primary; appends the secondary when non-null.
 *  Handy helper so every form picks the same set in the same order. */
export function enabledCurrencies(s: CurrencySettings | null | undefined): AllowedCurrency[] {
  if (!s) return ['USD', 'KHR'];
  return s.secondaryCurrency
    ? [s.primaryCurrency, s.secondaryCurrency]
    : [s.primaryCurrency];
}
