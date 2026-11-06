/**
 * One side of a market price — BUY IN or SELL OUT — today against
 * yesterday (V392). Shared by the gold and currency sections so both
 * read the same: green up, red down, grey for no change or no data.
 */
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { fmtChange, fmtPrice, type MarketSide } from '../../../api/marketPrices';
import { useI18n } from '../../../i18n/I18nContext';

export const DIRECTION_TEXT: Record<MarketSide['direction'], string> = {
  up: 'text-green-600',
  down: 'text-red-600',
  flat: 'text-gray-500',
  na: 'text-gray-400',
};

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

export function PriceComparisonCard({
  side, label, unit, today, tone,
}: {
  side: MarketSide;
  /** "Buy In" — already in the user's language. */
  label: string;
  unit?: string | null;
  /** The dashboard's today — an older effective date is called out. */
  today?: string;
  /** Soft background for the currency tiles; plain for gold. */
  tone?: 'buy' | 'sell';
}) {
  const { t } = useI18n();
  const color = side.today == null ? 'text-gray-400' : DIRECTION_TEXT[side.direction];
  // Sell Out is money in (green), Buy In money out (red), as on mobile.
  const bg = tone === 'buy' ? 'bg-red-50 border-red-100'
    : tone === 'sell' ? 'bg-green-50 border-green-100'
    : 'bg-transparent border-transparent';
  const stale = side.todayDate && today && side.todayDate !== today;
  return (
    <div className={`rounded-lg border p-3 space-y-1.5 ${bg}`}>
      {/* v-market-one-lang — one language, in a neutral chip; green and
          red stay reserved for which way the price moved. */}
      <span className="inline-block rounded-full bg-slate-900/[0.06] px-2 py-0.5 text-xs font-semibold text-slate-700">
        {label}
      </span>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{fmtPrice(side.today)}</div>
      {unit && <div className="text-xs text-gray-500">{unit}</div>}
      <div className={`text-xs font-medium inline-flex items-center gap-1 ${DIRECTION_TEXT[side.direction]}`}>
        <DirectionIcon dir={side.direction} />
        {marketWord(t, fmtChange(side))}
      </div>
      <div className="text-xs text-gray-500 tabular-nums">
        {t('market.yesterday', 'Yesterday')}: {fmtPrice(side.yesterday)}
        {stale && <span className="ml-1 text-gray-400">· since {side.todayDate}</span>}
      </div>
    </div>
  );
}
