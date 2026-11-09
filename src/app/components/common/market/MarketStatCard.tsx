/**
 * One side of a market price — Buy In or Sell Out, gold or currency —
 * as a dashboard stat card, the way the mobile Home draws it: a plain
 * white card raised by its shadow (no outline, no coloured band), the
 * label with its icon — Sell up and green, Buy down and red — the price
 * large in dark text, and its move since yesterday in a small pill (green
 * up, red down, grey for no change or no data) with yesterday's price.
 * The price reads first; colour says only which side and which way.
 */
import { ArrowDown, ArrowDownCircle, ArrowRight, ArrowUp, ArrowUpCircle } from 'lucide-react';
import { fmtPrice, type MarketSide } from '../../../api/marketPrices';
import { useI18n } from '../../../i18n/I18nContext';

export function DirectionIcon({ dir, className = 'h-3.5 w-3.5' }: { dir: MarketSide['direction']; className?: string }) {
  if (dir === 'up') return <ArrowUp className={className} />;
  if (dir === 'down') return <ArrowDown className={className} />;
  if (dir === 'flat') return <ArrowRight className={className} />;
  return null;
}

/** v-market-one-lang — asOfLabel / fmtChange speak English; these words
 *  are swapped for the user's language where they are shown (dates and
 *  numbers pass through). */
const MARKET_WORDS: Record<string, [string, string]> = {
  Today: ['market.today', 'Today'],
  Yesterday: ['market.yesterday', 'Yesterday'],
  'No price': ['market.no_price', 'No price'],
  'No change': ['market.no_change', 'No change'],
};

export function marketWord(t: (k: string, f?: string) => string, s: string): string {
  const w = MARKET_WORDS[s];
  return w ? t(w[0], w[1]) : s;
}

/** Sell is money in (up, green) and Buy money out (down, red) — as on
 *  mobile and the Gold calculator. Only the icon and a faint corner ring
 *  carry the colour. */
const TONE = {
  sell: { Icon: ArrowUpCircle,   icon: 'text-green-600', ring: 'text-emerald-400' },
  buy:  { Icon: ArrowDownCircle, icon: 'text-red-600',   ring: 'text-rose-400' },
} as const;

const PILL: Record<MarketSide['direction'], string> = {
  up:   'bg-emerald-100 text-emerald-700',
  down: 'bg-rose-100 text-rose-700',
  flat: 'bg-slate-100 text-slate-600',
  na:   'bg-slate-100 text-slate-500',
};

/** "06 Nov" from "2026-11-06" — read as a local date, not UTC midnight. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** "1.08%" — or the amount when yesterday was zero; "No change" / "N/A". */
function moveText(s: MarketSide): string {
  if (s.direction === 'na' || s.difference == null) return 'N/A';
  if (s.direction === 'flat') return 'No change';
  return s.percent != null ? `${Math.abs(s.percent).toFixed(2)}%` : fmtPrice(Math.abs(s.difference));
}

export function MarketStatCard({ side, label, tone, unit, today }: {
  side: MarketSide;
  /** "Buy In" — already in the user's language. */
  label: string;
  tone: 'buy' | 'sell';
  /** "KHR per USD" under a currency price; gold names its unit in the title. */
  unit?: string | null;
  /** The dashboard's today — an older effective date is called out. */
  today?: string;
}) {
  const { t } = useI18n();
  const stale = side.todayDate && today && side.todayDate !== today;
  const { Icon } = TONE[tone];
  return (
    <div className="relative overflow-hidden rounded-xl bg-white shadow-[0_6px_14px_rgba(15,23,42,0.12)]">
      {/* Decoration only: a faint ring in the corner, as on KPI cards. */}
      <svg aria-hidden="true" viewBox="0 0 100 100" fill="none"
        className={`pointer-events-none absolute -right-8 -bottom-10 h-28 w-28 opacity-20 ${TONE[tone].ring}`}>
        <circle cx="60" cy="60" r="38" stroke="currentColor" strokeWidth="8" />
        <circle cx="60" cy="60" r="22" stroke="currentColor" strokeWidth="4" />
      </svg>
      <div className="relative flex items-center justify-between gap-2 px-4 pt-3">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-gray-500">
          <Icon className={`h-4 w-4 ${TONE[tone].icon}`} />
          {label}
        </span>
        {/* A price older than today says its date beside the label. */}
        {stale && <span className="whitespace-nowrap text-xs font-medium text-amber-700">{shortDate(side.todayDate!)}</span>}
      </div>
      <div className="relative flex flex-wrap items-end gap-x-4 gap-y-1 px-4 pb-3 pt-1">
        <div>
          <div className={`text-3xl font-bold tabular-nums ${side.today == null ? 'text-gray-400' : 'text-gray-900'}`}>
            {fmtPrice(side.today)}
          </div>
          {unit && <div className="text-xs text-gray-500">{unit}</div>}
        </div>
        <div className="min-w-0 space-y-0.5 pb-1">
          <span className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${PILL[side.direction]}`}>
            <DirectionIcon dir={side.direction} className="h-3 w-3" />
            {marketWord(t, moveText(side))}
          </span>
          <div className="text-xs text-gray-500 tabular-nums">
            {t('market.yesterday', 'Yesterday')} {fmtPrice(side.yesterday)}
          </div>
        </div>
      </div>
    </div>
  );
}
