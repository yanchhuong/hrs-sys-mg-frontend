/**
 * Financial Market widget (V392) — today's gold and currency buy /
 * sell prices against yesterday, on the Dashboard. Read-only: prices
 * are entered in General Settings → Company. Renders nothing until a
 * tenant has entered at least one price.
 */
import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import * as marketApi from '../../../api/marketPrices';
import { PriceComparisonCard } from './PriceComparisonCard';
import { MarketPriceHistoryDialog } from './MarketPriceHistoryDialog';

const BUY = 'BUY IN · ទិញចូល';
const SELL = 'SELL OUT · លក់ចេញ';

export function MarketPricesWidget() {
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {gold.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Gold Market Price</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Today</Badge>
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
                  <PriceComparisonCard side={g.buy} label={BUY} today={data.today} />
                  <PriceComparisonCard side={g.sell} label={SELL} today={data.today} />
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
              <CardTitle className="text-base">Currency Exchange</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Today</Badge>
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
                  <PriceComparisonCard side={c.buy} label={BUY} unit={c.unit} today={data.today} tone="buy" />
                  <PriceComparisonCard side={c.sell} label={SELL} unit={c.unit} today={data.today} tone="sell" />
                </div>
                <div className="rounded-lg border px-3 py-2">
                  <div className="text-xs text-gray-500">Exchange spread</div>
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
