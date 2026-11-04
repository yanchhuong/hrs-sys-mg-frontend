/**
 * Gold + currency buy / sell prices (V392). Entered in General
 * Settings → Company, read by the Financial Market dashboard widget.
 * Append-only on the server: adding a price never edits an old one.
 */
import { apiJson, apiVoid } from './client';

export type MarketCategory = 'gold' | 'currency';
export type MarketDirection = 'up' | 'down' | 'flat' | 'na';

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
