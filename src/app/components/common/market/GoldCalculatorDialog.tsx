/**
 * Gold POS calculator — opened from a gold price on the Dashboard
 * (MarketPricesWidget). Type the weight and it prices it at that gold's
 * Sell Out price (the shop selling) or Buy In price (the shop buying
 * back), per chi, plus or minus a fee. The rate starts on the price in
 * force and can be overtyped for one quote; nothing is saved.
 *
 * The sum lives in api/marketPrices (goldQuote), shared with the mobile
 * sheet, so the two give the same figure.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import * as marketApi from '../../../api/marketPrices';
import { NUM, maskNumber } from '../../../utils/validation';

/** One half of the Sell Out / Buy In switch. */
const SWITCH_HALF = 'h-9 rounded-md no-underline data-[state=active]:no-underline '
  + 'data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:font-semibold';

/** '' → null, '1,250.5' → 1250.5, junk → NaN. */
const num = (s: string): number | null => {
  const v = s.replace(/,/g, '').trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export function GoldCalculatorDialog({ item, onClose }: {
  /** The gold price to quote from; null closes the dialog. */
  item: marketApi.MarketItem | null;
  onClose: () => void;
}) {
  const [side, setSide] = useState<'sell' | 'buy'>('sell');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<marketApi.GoldCalcUnit>('chi');
  const [rate, setRate] = useState('');
  const [fee, setFee] = useState('');

  const priceOf = (s: 'sell' | 'buy') => {
    // The rate field takes two places, so the price in force does too.
    const v = item?.[s].today;
    return v != null ? String(Math.round(v * 100) / 100) : '';
  };

  // A fresh quote each time it opens, on the Sell Out price.
  useEffect(() => {
    if (!item) return;
    setSide('sell'); setQty(''); setUnit('chi'); setFee('');
    setRate(priceOf('sell'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const currency = marketApi.goldCurrency(item?.unit);
  const w = num(qty), r = num(rate), f = num(fee) ?? 0;
  const ready = w != null && r != null && !Number.isNaN(w) && !Number.isNaN(r) && !Number.isNaN(f) && w >= 0 && r >= 0;
  const quote = ready ? marketApi.goldQuote(side, w, unit, r, f, currency) : null;
  const money = (v: number | null | undefined) => (v == null ? '—' : marketApi.fmtMoney(v, currency));
  const isSell = side === 'sell';

  return (
    <Dialog open={!!item} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="p-4 sm:p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Calculate Gold Value</DialogTitle>
          <DialogDescription>
            {item?.title} — {isSell ? 'Sell Out' : 'Buy In'} price per ជី
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Transaction type</Label>
            <Tabs value={side} onValueChange={v => { setSide(v as 'sell' | 'buy'); setRate(priceOf(v as 'sell' | 'buy')); }}>
              {/* A switch, not underline tabs: two halves on a grey track,
                  the chosen one raised in the colour of its total. */}
              <TabsList className="grid w-full grid-cols-2 gap-1 rounded-lg border-0 bg-gray-100 p-1">
                <TabsTrigger value="sell" className={`${SWITCH_HALF} data-[state=active]:text-emerald-700`}>Sell Out</TabsTrigger>
                <TabsTrigger value="buy" className={`${SWITCH_HALF} data-[state=active]:text-blue-700`}>Buy In</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gold-calc-weight">Gold weight</Label>
            {/* Side by side from sm up; stacked on a phone, where a fixed
                170px unit picker left the weight box too narrow to read. */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="gold-calc-weight" value={qty} onChange={e => setQty(maskNumber(e.target.value, NUM.goldWeight))}
                inputMode="decimal" placeholder="0.0000" autoFocus className="flex-1 text-right tabular-nums" />
              <Select value={unit} onValueChange={v => setUnit(v as marketApi.GoldCalcUnit)}>
                <SelectTrigger className="w-full sm:w-[170px] shrink-0" aria-label="Weight unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {marketApi.GOLD_CALC_UNITS.map(u => <SelectItem key={u.key} value={u.key}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gold-calc-rate">Market rate per Chi ({currency})</Label>
            <Input id="gold-calc-rate" value={rate} onChange={e => setRate(maskNumber(e.target.value, NUM.money))}
              inputMode="decimal" placeholder="0.00" className="text-right tabular-nums" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gold-calc-fee">
              {isSell ? 'Making fee / Other fee' : 'Deduction / Other fee'} ({currency})
            </Label>
            <Input id="gold-calc-fee" value={fee} onChange={e => setFee(maskNumber(e.target.value, NUM.money))}
              inputMode="decimal" placeholder="0.00" className="text-right tabular-nums" />
          </div>

          <div className="rounded-lg border bg-gray-50 p-3 space-y-1.5">
            <div className="text-xs text-gray-500">
              {isSell ? 'Estimated Customer Pays' : 'Estimated Customer Receives'}
            </div>
            <div className={`text-2xl font-semibold tabular-nums ${isSell ? 'text-emerald-700' : 'text-blue-700'}`}
              data-gold-total="">
              {money(quote?.total)}
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Weight in grams</span>
              <span className="font-medium tabular-nums">{quote ? `${quote.grams.toFixed(4)} g` : '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Gold value</span>
              <span className="font-medium tabular-nums">{money(quote?.goldValue)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{isSell ? 'Additional fee' : 'Deduction'}</span>
              <span className="font-medium tabular-nums">
                {quote ? `${isSell ? '' : '−'}${money(quote.fee)}` : '—'}
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Estimate only: the weight at the {isSell ? 'Sell Out' : 'Buy In'} price per chi
            {isSell ? ', plus the fee' : ', less the fee'}. Purity and rounding rules of the
            actual sale are not applied.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
