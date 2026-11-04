/**
 * General Settings → Company → Market Prices (V392). The one place gold
 * and currency buy / sell prices are entered. Each save adds new rows
 * (Title · Key · Value · Date); nothing earlier is edited, so the
 * dashboard's yesterday and the history stay true. A wrong entry can be
 * deleted, after a confirm.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { TableRowsSkeleton } from '../LoadingSkeletons';
import { useConfirm } from '../../../context/ConfirmContext';
import * as marketApi from '../../../api/marketPrices';

const num = (s: string): number | null => {
  const v = s.replace(/,/g, '').trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export function MarketPricesSettingsCard() {
  const confirm = useConfirm();
  const [dash, setDash] = useState<marketApi.MarketDashboard | null>(null);
  const [recent, setRecent] = useState<marketApi.MarketEntry[] | null>(null);
  const [category, setCategory] = useState<marketApi.MarketCategory>('gold');
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('');
  const [date, setDate] = useState(marketApi.todayPP());
  const [buy, setBuy] = useState('');
  const [sell, setSell] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, h] = await Promise.all([marketApi.dashboard({ all: true }), marketApi.history()]);
      setDash(d); setRecent(h);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load market prices');
      setDash({ today: marketApi.todayPP(), yesterday: '', items: [] }); setRecent([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const known = useMemo(
    () => (dash?.items ?? []).filter(i => i.category === category).map(i => i.title),
    [dash, category],
  );

  /**
   * v-market-copy — the one way to price a title that already
   * exists. The form above is filled from the price in force, the
   * title and category come along locked, and the date resets to
   * today: same title, new date, new price, which is what copying
   * one of these means. Saving a date that already has a price
   * replaces that day's entry; earlier days stay as history.
   */
  const pick = (item: marketApi.MarketItem) => {
    setCategory(item.category);
    setTitle(item.title);
    setUnit(item.category === 'gold' ? (item.unit ?? '') : '');
    setBuy(item.buy.today != null ? String(item.buy.today) : '');
    setSell(item.sell.today != null ? String(item.sell.today) : '');
    setDate(marketApi.todayPP());
  };

  const save = async () => {
    const b = num(buy), s = num(sell);
    if (!title.trim()) { toast.error('Enter a title, e.g. មាសដុំ or USD/KHR'); return; }
    if (b == null && s == null) { toast.error('Enter a buy or a sell price'); return; }
    if (Number.isNaN(b) || Number.isNaN(s) || (b ?? 0) < 0 || (s ?? 0) < 0) {
      toast.error('Prices must be numbers, zero or more'); return;
    }
    setSaving(true);
    try {
      await marketApi.add({
        category, title: title.trim(), unit: category === 'gold' ? (unit.trim() || null) : null,
        effectiveDate: date, buy: b, sell: s,
      });
      toast.success(`${title.trim()} saved for ${date}`);
      setBuy(''); setSell('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const toggleShow = async (item: marketApi.MarketItem, show: boolean) => {
    // Flip it in place so the switch answers at once; reload on failure.
    setDash(d => d && { ...d, items: d.items.map(i => (i.title === item.title ? { ...i, showOnDashboard: show } : i)) });
    try {
      await marketApi.setShowOnDashboard(item.title, show);
      toast.success(show ? `${item.title} is shown on the Dashboard` : `${item.title} is hidden from the Dashboard`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
      await load();
    }
  };

  const removeTitle = async (item: marketApi.MarketItem) => {
    const ok = await confirm({
      title: `Remove ${item.title}?`,
      message: 'Every buy and sell price entered for it is deleted, history included. To keep the history, turn off Show on Dashboard instead.',
      variant: 'destructive', confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      const { removed } = await marketApi.removeTitle(item.title);
      toast.success(`${item.title} removed (${removed} ${removed === 1 ? 'entry' : 'entries'})`);
      if (title === item.title) setTitle('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove');
    }
  };

  const remove = async (r: marketApi.MarketEntry) => {
    const ok = await confirm({
      title: `Delete ${r.title} ${r.key === 'buy' ? 'Buy' : 'Sell'} ${marketApi.fmtPrice(r.value)} (${r.effectiveDate})?`,
      message: 'The dashboard falls back to the price entered before it.',
      variant: 'destructive', confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await marketApi.remove(r.id);
      toast.success('Price deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2">
          <Coins className="h-4 w-4 text-yellow-600" />
          Market Prices — Gold &amp; Currency
        </CardTitle>
        <CardDescription className="mt-1">
          Buy In and Sell Out prices shown on the Dashboard, compared with the day before.
          Copy a title to price it again: same title, new date and price. One entry
          per day — saving a day again replaces it, earlier days are kept as history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Category</Label>
            <Select value={category} onValueChange={v => { setCategory(v as marketApi.MarketCategory); setTitle(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gold">Gold</SelectItem>
                <SelectItem value="currency">Currency</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} list="market-titles"
              placeholder={category === 'gold' ? 'មាសដុំ' : 'USD/KHR'} />
          </div>
          {category === 'gold' ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Unit (optional)</Label>
              <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="USD per chi" />
            </div>
          ) : <div className="hidden lg:block" />}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Effective date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-green-700">Buy In · ទិញចូល</Label>
            <Input value={buy} onChange={e => setBuy(e.target.value)} inputMode="decimal" placeholder="0.00"
              className="text-right tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-red-700">Sell Out · លក់ចេញ</Label>
            <Input value={sell} onChange={e => setSell(e.target.value)} inputMode="decimal" placeholder="0.00"
              className="text-right tabular-nums" />
          </div>
        </div>
        {/* Outside the grid — inside a cell it nudged the Title field up. */}
        <datalist id="market-titles">{known.map(t => <option key={t} value={t} />)}</datalist>
        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Add prices'}</Button>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Current prices</div>
          {dash == null ? (
            <TableRowsSkeleton rows={3} columns={5} />
          ) : dash.items.length === 0 ? (
            <div className="text-sm text-gray-500">No prices yet. Add a gold type or currency pair above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3 text-right">Buy In</th>
                    <th className="py-2 pr-3 text-right">Sell Out</th>
                    <th className="py-2 pr-3">Effective</th>
                    <th className="py-2 pr-3">Show on Dashboard</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {dash.items.map(i => (
                    <tr key={i.title} className={`border-b last:border-0 ${i.showOnDashboard ? '' : 'text-gray-400'}`}>
                      <td className="py-2 pr-3 font-medium">{i.title}</td>
                      <td className="py-2 pr-3 capitalize text-gray-600">{i.category}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{marketApi.fmtPrice(i.buy.today)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{marketApi.fmtPrice(i.sell.today)}</td>
                      <td className="py-2 pr-3 text-gray-500 tabular-nums">{i.buy.todayDate ?? i.sell.todayDate ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <Switch
                          checked={i.showOnDashboard}
                          onCheckedChange={v => void toggleShow(i, v)}
                          aria-label={`Show ${i.title} on the Dashboard`}
                        />
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={() => pick(i)}
                          title={`Copy ${i.title} — same title, new date and price`}>
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          onClick={() => void removeTitle(i)} title={`Remove ${i.title}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Entries — last 30 days</div>
          {recent == null ? (
            <TableRowsSkeleton rows={3} columns={6} />
          ) : recent.length === 0 ? (
            <div className="text-sm text-gray-500">No entries in the last 30 days.</div>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3">Key</th>
                    <th className="py-2 pr-3 text-right">Value</th>
                    <th className="py-2 pr-3">By</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {recent.map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 tabular-nums">{r.effectiveDate}</td>
                      <td className="py-1.5 pr-3">{r.title}</td>
                      <td className={`py-1.5 pr-3 ${r.key === 'buy' ? 'text-green-700' : 'text-red-700'}`}>
                        {r.key === 'buy' ? 'Buy' : 'Sell'}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{marketApi.fmtPrice(r.value)}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{r.createdByName ?? '—'}</td>
                      <td className="py-1.5 text-right">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          onClick={() => void remove(r)} title="Delete this entry">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
