/**
 * Financial Market widget (V392) — the latest gold and currency buy /
 * sell prices against the day before, on the Dashboard, drawn like the
 * mobile Home: each title on a band (gold-lettered for gold, blue for
 * currency) over its two raised Sell / Buy cards. Each section spans the page, and
 * its titles share the row — one fills it, two halve it, three a third
 * each — so a wide screen is not left half empty. The badge on
 * each card says which day it is showing, so a card nobody has
 * updated since Monday says Monday rather than "Today". Read-only: prices
 * are entered in General Settings → Company. Renders nothing until a
 * tenant has entered at least one price.
 */
import { useEffect, useState } from 'react';
import { Calculator, History, NotebookPen } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { useI18n } from '../../../i18n/I18nContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import * as marketApi from '../../../api/marketPrices';
import { MarketStatCard, marketWord } from './MarketStatCard';
import { MarketPriceHistoryDialog } from './MarketPriceHistoryDialog';
import { GoldCalculatorDialog } from './GoldCalculatorDialog';


/**
 * The title bands.
 *
 * v-market-quiet-bands — the colour used to be the fill (amber-300 /
 * blue-300) with near-black text on it. A fully saturated block the
 * width of the card made the label the loudest thing on the Dashboard
 * when the thing worth looking at is the price underneath it. The
 * colour now lives in the text and the fill is the same neutral tint
 * the Exchange-spread block below already uses, so the section still
 * reads as gold or currency at a glance while the Sell / Buy cards
 * keep the eye.
 *
 * Not transparent: the band groups a title with its own pair of
 * cards, and several gold titles sit side by side in ITEMS_ROW on a
 * wide screen. With no fill at all the grouping goes and it stops
 * being obvious which title owns which pair.
 *
 * amber-700 / blue-700 rather than a brighter gold or blue: this is
 * 16px bold, which WCAG still counts as normal-size text, so it needs
 * 4.5:1. amber-600 on this tint is about 3.9:1 and fails; amber-700
 * is about 5.7:1.
 */
const BAND = {
  gold:     'bg-slate-50 text-amber-700',
  currency: 'bg-slate-50 text-blue-700',
} as const;

/** Calculate on the band: a white pill with a blue outline, as on mobile. */
const CALC_BTN = 'inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-600 bg-white '
  + 'px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50';

/** A section's titles across the row: as many as fit at ≥ 22rem each,
 *  stretched to fill it — one title takes the full width. */
const ITEMS_ROW = 'grid gap-6 grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))]';

export function MarketPricesWidget() {
  const { t } = useI18n();
  const [data, setData] = useState<marketApi.MarketDashboard | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  /** The gold price the calculator is quoting from, when open. */
  const [calcFor, setCalcFor] = useState<marketApi.MarketItem | null>(null);

  useEffect(() => {
    let live = true;
    // Quiet on failure: a widget the tenant never set up must not put
    // an error on everyone's dashboard.
    marketApi.dashboard().then(d => { if (live) setData(d); }).catch(() => {});
    return () => { live = false; };
  }, []);

  if (!data || data.items.length === 0) return null;
  const gold = data.items.filter(i => i.category === 'gold');
  const currency = data.items.filter(i => i.category === 'currency');
  const titles = data.items.map(i => ({ title: i.title, category: i.category }));
  // v-market-asof — each card reports its own newest date: gold can be
  // current while the currency pairs have not been touched for a week.
  const goldAsOf = marketApi.asOfLabel(gold, data);
  const currencyAsOf = marketApi.asOfLabel(currency, data);

  return (
    <div className="space-y-4">
      {gold.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-base">{t('market.gold_title', 'Gold Market Price')}</CardTitle>
                {/* v-market-remark — the price disclaimer, one tap away
                    rather than a line under every card. */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="text-amber-600 hover:text-amber-700 p-0.5 rounded"
                      title={t('market.remark_label', 'Remark')} aria-label={t('market.remark_label', 'Remark')}>
                      <NotebookPen className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 text-sm">
                    <div className="text-xs font-semibold text-gray-500 mb-1">{t('market.remark_label', 'Remark')}</div>
                    <div className="text-gray-800">{t('market.remark', '*We reserve the right to adjust prices to actual market conditions!')}</div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" title={`Showing prices effective ${goldAsOf.label.toLowerCase()}`}
                  className={goldAsOf.stale
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-green-200 bg-green-50 text-green-700'}>
                  {marketWord(t, goldAsOf.label)}{goldAsOf.time ? ` ${goldAsOf.time}` : ''}
                </Badge>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setHistoryFor('all')}
                  title="Price history">
                  <History className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className={ITEMS_ROW}>
            {gold.map(g => (
              <div key={g.title} className="space-y-3">
                {/* The title on its gold band, as on mobile. */}
                <div className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${BAND.gold}`}>
                  <button type="button" className="text-left text-base font-bold hover:underline"
                    onClick={() => setHistoryFor(g.title)}>
                    {/* The unit is grey, not faded gold: at 12px a
                        dimmed amber on the pale band drops under the
                        contrast floor, while grey stays legible and
                        still reads as secondary. */}
                    {g.title}{g.unit && <span className="ml-1.5 text-xs font-normal text-gray-500">({g.unit})</span>}
                  </button>
                  {/* Prices a weight at this gold's Buy In / Sell Out.
                      Still a white pill: on the pale band it is the
                      blue outline rather than the fill that marks it
                      out as something to press. */}
                  <button type="button" onClick={() => setCalcFor(g)} title={`Calculate ${g.title} by weight`}
                    className={CALC_BTN}>
                    <Calculator className="h-3.5 w-3.5" /> {t('market.calculate', 'Calculate')}
                  </button>
                </div>
                {/* Sell first, as on mobile and the Gold calculator. */}
                <div className="grid grid-cols-2 gap-3">
                  <MarketStatCard side={g.sell} label={t('market.sell', 'Sell Out')} tone="sell" today={data.today} />
                  <MarketStatCard side={g.buy} label={t('market.buy', 'Buy In')} tone="buy" today={data.today} />
                </div>
              </div>
            ))}
            </div>
          </CardContent>
        </Card>
      )}

      {currency.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">{t('market.currency_title', 'Currency Exchange')}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" title={`Showing prices effective ${currencyAsOf.label.toLowerCase()}`}
                  className={currencyAsOf.stale
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-green-200 bg-green-50 text-green-700'}>
                  {marketWord(t, currencyAsOf.label)}{currencyAsOf.time ? ` ${currencyAsOf.time}` : ''}
                </Badge>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setHistoryFor('all')}
                  title="Price history">
                  <History className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className={ITEMS_ROW}>
            {currency.map(c => (
              <div key={c.title} className="space-y-3">
                {/* The pair on its blue-lettered band, as on mobile. */}
                <div className={`rounded-lg px-3 py-2 ${BAND.currency}`}>
                  <button type="button" className="text-left text-base font-bold hover:underline"
                    onClick={() => setHistoryFor(c.title)}>
                    {c.title}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MarketStatCard side={c.sell} label={t('market.sell', 'Sell Out')} tone="sell" unit={c.unit} today={data.today} />
                  <MarketStatCard side={c.buy} label={t('market.buy', 'Buy In')} tone="buy" unit={c.unit} today={data.today} />
                </div>
                {/* A soft fill, not another outline — as on mobile. */}
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-xs text-gray-500">{t('market.spread', 'Exchange spread')}</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {marketApi.fmtPrice(c.spread)}{c.spread != null && c.unit ? ` ${c.unit.split(' per ')[0]}` : ''}
                  </div>
                </div>
              </div>
            ))}
            </div>
          </CardContent>
        </Card>
      )}

      <GoldCalculatorDialog item={calcFor} onClose={() => setCalcFor(null)} />

      <MarketPriceHistoryDialog
        open={historyFor != null}
        onOpenChange={v => { if (!v) setHistoryFor(null); }}
        titles={titles}
        initialTitle={historyFor ?? undefined}
      />
    </div>
  );
}
