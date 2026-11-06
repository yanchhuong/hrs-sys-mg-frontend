/**
 * Gold + currency buy / sell prices (V392). Entered in General
 * Settings → Company, read by the Financial Market dashboard widget.
 * Append-only on the server: adding a price never edits an old one.
 */
import { apiJson, apiVoid } from './client';

export type MarketCategory = 'gold' | 'currency';
export type MarketDirection = 'up' | 'down' | 'flat' | 'na';

/**
 * Gold is quoted per chi (ជី, 3.75 g) or per damloeng (ដំឡឹង, 10 chi).
 * Prices are saved — and so shown — per chi: a damloeng price is divided
 * by ten on the way in, so the dashboard always compares chi with chi,
 * whichever way each day's price was entered.
 */
export type GoldWeight = 'chi' | 'damloeng';

export const GOLD_WEIGHTS: { key: GoldWeight; label: string; hint: string; chi: number }[] = [
  { key: 'chi',      label: 'Chi (ជី)',         hint: '3.75 g',          chi: 1 },
  { key: 'damloeng', label: 'Damloeng (ដំឡឹង)', hint: '10 chi · 37.5 g', chi: 10 },
];

/** A price per `weight`, as the price per chi it is saved as. */
export function perChi(value: number, weight: GoldWeight): number {
  const chi = GOLD_WEIGHTS.find(w => w.key === weight)?.chi ?? 1;
  return Math.round((value / chi) * 10000) / 10000;
}

/** The unit a gold price is saved with. " per " splits the currency off
 *  for the spread, as it did for the free-text "USD per chi". */
export function goldUnit(currency: GoldCurrency): string {
  return `${currency} per ជី`;
}

export type GoldCurrency = 'USD' | 'KHR';

/** The currency a saved gold unit names; USD when it names none. */
export function goldCurrency(unit: string | null | undefined): GoldCurrency {
  return /^\s*(KHR|៛)/i.test(unit ?? '') ? 'KHR' : 'USD';
}

/** Grams in one chi (ជី); a damloeng (ដំឡឹង) is ten chi. */
export const GRAMS_PER_CHI = 3.75;

/** Weights the gold calculator takes: as quoted, or weighed in grams. */
export type GoldCalcUnit = GoldWeight | 'gram';

export const GOLD_CALC_UNITS: { key: GoldCalcUnit; label: string }[] = [
  { key: 'chi',      label: 'Chi (ជី)' },
  { key: 'damloeng', label: 'Damloeng (ដំឡឹង)' },
  { key: 'gram',     label: 'Gram (g)' },
];

/** A weight in `unit`, in chi. */
export function weightInChi(qty: number, unit: GoldCalcUnit): number {
  if (unit === 'gram') return qty / GRAMS_PER_CHI;
  return qty * (GOLD_WEIGHTS.find(w => w.key === unit)?.chi ?? 1);
}

export interface GoldQuote {
  chi: number;
  grams: number;
  /** Weight × the price per chi. */
  goldValue: number;
  fee: number;
  /** Sell: what the customer pays (value + fee). Buy: what the customer
   *  is paid (value − fee). */
  total: number;
}

/**
 * The gold calculator's sum, for the shop selling gold (the Sell Out
 * price) or buying it back (the Buy In price). Rounded to the
 * currency: cents for USD, whole riel for KHR.
 */
export function goldQuote(
  side: 'sell' | 'buy', qty: number, unit: GoldCalcUnit,
  ratePerChi: number, fee: number, currency: GoldCurrency,
): GoldQuote {
  const round = (v: number) => (currency === 'KHR' ? Math.round(v) : Math.round(v * 100) / 100);
  const chi = weightInChi(qty, unit);
  const goldValue = round(chi * ratePerChi);
  return { chi, grams: chi * GRAMS_PER_CHI, goldValue, fee, total: round(side === 'sell' ? goldValue + fee : goldValue - fee) };
}

/** "$950.00" / "-$5.00" / "៛1,000,000". */
export function fmtMoney(v: number, currency: GoldCurrency): string {
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  return currency === 'KHR'
    ? `${sign}៛${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface MarketSide {
  today: number | null;
  todayDate: string | null;
  yesterday: number | null;
  yesterdayDate: string | null;
  difference: number | null;
  percent: number | null;
  direction: MarketDirection;
}

export interface MarketItem {
  category: MarketCategory;
  title: string;
  /** "KHR per USD" for a pair, the entered unit for gold, or null. */
  unit: string | null;
  buy: MarketSide;
  sell: MarketSide;
  spread: number | null;
  /** V393 — false: hidden from the Dashboard, still listed in Settings. */
  showOnDashboard: boolean;
}

export interface MarketDashboard {
  today: string;
  yesterday: string;
  items: MarketItem[];
}

export interface MarketEntry {
  id: string;
  category: MarketCategory;
  title: string;
  key: 'buy' | 'sell';
  value: number;
  unit: string | null;
  effectiveDate: string;
  createdByName: string | null;
  createdAt: string;
}

/** `all` — Settings: every title, hidden ones included. */
export function dashboard(opts: { date?: string; all?: boolean } = {}): Promise<MarketDashboard> {
  const p = new URLSearchParams();
  if (opts.date) p.set('date', opts.date);
  if (opts.all) p.set('all', 'true');
  const qs = p.toString();
  return apiJson(`/api/v1/market-prices/dashboard${qs ? `?${qs}` : ''}`);
}

/** V393 — show or hide one title on the Dashboard. */
export function setShowOnDashboard(title: string, show: boolean): Promise<void> {
  return apiVoid('/api/v1/market-prices/titles/show', { method: 'PUT', json: { title, show } });
}

/** V394 — every title, in the order the admin dragged them into. */
export function reorder(titles: string[]): Promise<void> {
  return apiVoid('/api/v1/market-prices/titles/order', { method: 'PUT', json: { titles } });
}

/** V393 — remove a title and every entry of it. */
export function removeTitle(title: string): Promise<{ removed: number }> {
  return apiJson(`/api/v1/market-prices/titles?title=${encodeURIComponent(title)}`, { method: 'DELETE' });
}

export function history(q: { from?: string; to?: string; category?: string; title?: string } = {}): Promise<MarketEntry[]> {
  const p = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v) p.set(k, v); });
  const qs = p.toString();
  return apiJson(`/api/v1/market-prices/history${qs ? `?${qs}` : ''}`);
}

export function add(req: {
  category: MarketCategory; title: string; unit?: string | null;
  effectiveDate: string; buy?: number | null; sell?: number | null;
}): Promise<MarketEntry[]> {
  return apiJson('/api/v1/market-prices', { method: 'POST', json: req });
}

export function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/market-prices/${id}`, { method: 'DELETE' });
}

const PP = 'Asia/Phnom_Penh';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "03 Nov", or "03 Nov 2025" once the year stops being obvious. */
function fmtDay(iso: string): string {
  const m = /^(d{4})-(d{2})-(d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${m[3]} ${month}${m[1] === todayPP().slice(0, 4) ? '' : ` ${m[1]}`}`;
}

/**
 * v-market-asof — the day a dashboard card is actually showing.
 *
 * <p>The cards used to read "Today" no matter what. A tenant who had
 * not entered a price since Monday was told Monday's number was
 * today's, which is the one claim a market card must never make. So
 * the badge now reports the newest effective date the card's items
 * carry, and says Today only when that is today.</p>
 *
 * <p>{@code stale} is for the colour: fresh reads green, anything
 * older reads amber, so the card looks out of date from across the
 * room rather than only on reading the label.</p>
 */
export function asOfLabel(
  items: MarketItem[],
  d: { today: string; yesterday: string },
): { label: string; stale: boolean } {
  let latest: string | null = null;
  for (const i of items) {
    for (const date of [i.buy.todayDate, i.sell.todayDate]) {
      // yyyy-MM-dd compares lexically, so no Date parsing is needed.
      if (date && (latest == null || date > latest)) latest = date;
    }
  }
  if (latest == null) return { label: 'No price', stale: true };
  if (latest === d.today) return { label: 'Today', stale: false };
  if (latest === d.yesterday) return { label: 'Yesterday', stale: true };
  return { label: fmtDay(latest), stale: true };
}


/**
 * v-market-entry-time — an entry's day and the clock time it was
 * recorded. A price can move several times in one day, and the date
 * alone makes those rows look like duplicates of each other; the
 * time is what tells them apart and says which one stands.
 *
 * <p>Both parts are Phnom Penh, like every other day in this
 * module. A backdated entry — effective one day, typed on another —
 * says so rather than quietly showing the wrong clock against the
 * wrong date.</p>
 */
export function fmtEntryStamp(e: MarketEntry): string {
  const at = new Date(e.createdAt);
  if (Number.isNaN(at.getTime())) return e.effectiveDate;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: PP }).format(at);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: PP, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(at);
  return day === e.effectiveDate
    ? `${e.effectiveDate} · ${time}`
    : `${e.effectiveDate} · entered ${day} ${time}`;
}

/** #,##0.00 — every price, difference and spread. */
export function fmtPrice(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return 'N/A';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "+5.00 (1.08%)" / "-5.00 (1.05%)" / "No change" / "N/A". */
export function fmtChange(s: MarketSide): string {
  if (s.direction === 'na' || s.difference == null) return 'N/A';
  if (s.direction === 'flat') return 'No change';
  const sign = s.difference > 0 ? '+' : '-';
  const pct = s.percent == null ? 'N/A' : `${Math.abs(s.percent).toFixed(2)}%`;
  return `${sign}${fmtPrice(Math.abs(s.difference))} (${pct})`;
}

/** Today's date in Phnom Penh as yyyy-MM-dd — the server's "today". */
export function todayPP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh' }).format(new Date());
}
