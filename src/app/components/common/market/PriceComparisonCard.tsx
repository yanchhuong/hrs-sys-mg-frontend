/**
 * One side of a market price — BUY IN or SELL OUT — today against
 * yesterday (V392). Shared by the gold and currency sections so both
 * read the same: green up, red down, grey for no change or no data.
 */
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { fmtChange, fmtPrice, type MarketSide } from '../../../api/marketPrices';

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

export function PriceComparisonCard({
  side, label, unit, today, tone,
}: {
  side: MarketSide;
  /** "BUY IN · ទិញចូល" */
  label: string;
  unit?: string | null;
  /** The dashboard's today — an older effective date is called out. */
  today?: string;
  /** Soft background for the currency tiles; plain for gold. */
  tone?: 'buy' | 'sell';
}) {
  const color = side.today == null ? 'text-gray-400' : DIRECTION_TEXT[side.direction];
  const bg = tone === 'buy' ? 'bg-green-50 border-green-100'
    : tone === 'sell' ? 'bg-red-50 border-red-100'
    : 'bg-transparent border-transparent';
  const stale = side.todayDate && today && side.todayDate !== today;
  return (
    <div className={`rounded-lg border p-3 space-y-1.5 ${bg}`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{fmtPrice(side.today)}</div>
      {unit && <div className="text-xs text-gray-500">{unit}</div>}
      <div className={`text-xs font-medium inline-flex items-center gap-1 ${DIRECTION_TEXT[side.direction]}`}>
        <DirectionIcon dir={side.direction} />
        {fmtChange(side)}
      </div>
      <div className="text-xs text-gray-500 tabular-nums">
        Yesterday: {fmtPrice(side.yesterday)}
        {stale && <span className="ml-1 text-gray-400">· since {side.todayDate}</span>}
      </div>
    </div>
  );
}
