/**
 * Financial Market widget (V392) — the latest gold and currency buy /
 * sell prices against the day before, on the Dashboard. The badge on
 * each card says which day it is showing, so a card nobody has
 * updated since Monday says Monday rather than "Today". Read-only: prices
 * are entered in General Settings → Company. Renders nothing until a
 * tenant has entered at least one price.
 */
import { useEffect, useState } from 'react';
import { History, NotebookPen } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { useI18n } from '../../../i18n/I18nContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import * as marketApi from '../../../api/marketPrices';
import { PriceComparisonCard, marketWord } from './PriceComparisonCard';
import { MarketPriceHistoryDialog } from './MarketPriceHistoryDialog';


export function MarketPricesWidget() {
  const { t } = useI18n();
  const [data, setData] = useState<marketApi.MarketDashboard | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                  {marketWord(t, goldAsOf.label)}
                </Badge>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setHistoryFor('all')}
                  title="Price history">
                  <History className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {gold.map(g => (
              <div key={g.title} className="rounded-lg border p-3">
                <button type="button" className="text-sm font-semibold hover:underline"
                  onClick={() => setHistoryFor(g.title)}>
                  {g.title}{g.unit && <span className="ml-1 text-xs font-normal text-gray-500">({g.unit})</span>}
                </button>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <PriceComparisonCard side={g.buy} label={t('market.buy', 'Buy In')} today={data.today} />
                  <PriceComparisonCard side={g.sell} label={t('market.sell', 'Sell Out')} today={data.today} />
                </div>
              </div>
            ))}
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
                  {marketWord(t, currencyAsOf.label)}
                </Badge>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setHistoryFor('all')}
                  title="Price history">
                  <History className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {currency.map(c => (
              <div key={c.title} className="space-y-2">
                <button type="button" className="text-sm font-semibold hover:underline"
                  onClick={() => setHistoryFor(c.title)}>
                  {c.title}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <PriceComparisonCard side={c.buy} label={t('market.buy', 'Buy In')} unit={c.unit} today={data.today} tone="buy" />
                  <PriceComparisonCard side={c.sell} label={t('market.sell', 'Sell Out')} unit={c.unit} today={data.today} tone="sell" />
                </div>
                <div className="rounded-lg border px-3 py-2">
                  <div className="text-xs text-gray-500">{t('market.spread', 'Exchange spread')}</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {marketApi.fmtPrice(c.spread)}{c.spread != null && c.unit ? ` ${c.unit.split(' per ')[0]}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <MarketPriceHistoryDialog
        open={historyFor != null}
        onOpenChange={v => { if (!v) setHistoryFor(null); }}
        titles={titles}
        initialTitle={historyFor ?? undefined}
      />
    </div>
  );
}
