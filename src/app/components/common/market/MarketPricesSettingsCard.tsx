/**
 * General Settings → Company → Market Prices (V392). The one place gold
 * and currency buy / sell prices are entered. Each save adds new rows
 * (Title · Key · Value · Date); nothing earlier is edited, so the
 * dashboard's yesterday and the history stay true. A wrong entry can be
 * deleted, after a confirm.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Copy, GripVertical, Trash2 } from 'lucide-react';
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
  /** Gold only: what the typed prices are per, and in. Saved per chi. */
  const [weight, setWeight] = useState<marketApi.GoldWeight>('chi');
  const [currency, setCurrency] = useState<marketApi.GoldCurrency>('USD');
  const [date, setDate] = useState(marketApi.todayPP());
  const [buy, setBuy] = useState('');
  const [sell, setSell] = useState('');
  const [saving, setSaving] = useState(false);

  /* V394 — drag-and-drop order. The row moves under the pointer as it
   * is dragged (state only); the drop saves the whole order once. The
   * grip also takes ArrowUp / ArrowDown for keyboard users. */
  const [dragging, setDragging] = useState<string | null>(null);
  const [orderBefore, setOrderBefore] = useState<string[] | null>(null);
  const moveTo = (title: string, targetIdx: number) => setDash(d => {
    if (!d) return d;
    const from = d.items.findIndex(i => i.title === title);
    if (from < 0 || from === targetIdx) return d;
    const items = [...d.items];
    const [moved] = items.splice(from, 1);
    items.splice(targetIdx, 0, moved);
    return { ...d, items };
  });
  const saveOrder = async (titles: string[], before: string[] | null) => {
    if (before && before.join('|') === titles.join('|')) return;
    try {
      await marketApi.reorder(titles);
      toast.success('Order saved — the Dashboard follows it');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save the order');
      await load();
    }
  };
  const endDrag = () => {
    if (dragging && dash) void saveOrder(dash.items.map(i => i.title), orderBefore);
    setDragging(null); setOrderBefore(null);
  };
  const nudge = (idx: number, delta: number) => {
    if (!dash) return;
    const to = idx + delta;
    if (to < 0 || to >= dash.items.length) return;
    const titles = dash.items.map(i => i.title);
    const [moved] = titles.splice(idx, 1);
    titles.splice(to, 0, moved);
    moveTo(moved, to);
    void saveOrder(titles, null);
  };

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
   * one of these means. Every save is its own entry, several on one
   * day included — the latest stands and the rest are that day's
   * trail.
   */
  const pick = (item: marketApi.MarketItem) => {
    setCategory(item.category);
    setTitle(item.title);
    // The price in force is per chi, so the copy starts on chi.
    setWeight('chi');
    setCurrency(marketApi.goldCurrency(item.unit));
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
      const gold = category === 'gold';
      await marketApi.add({
        category, title: title.trim(), unit: gold ? marketApi.goldUnit(currency) : null,
        effectiveDate: date,
        buy: gold && b != null ? marketApi.perChi(b, weight) : b,
        sell: gold && s != null ? marketApi.perChi(s, weight) : s,
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
          Copy a title to price it again: same title, new date and price. Every save is
          its own entry — a day can hold several, and each is stamped with its time.
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
              <Label className="text-xs text-gray-600">Price per</Label>
              {/* One control for both halves — currency and weight —
                  so the cell stays one field wide. */}
              <Select value={`${currency}|${weight}`} onValueChange={v => {
                const [c, w] = v.split('|');
                setCurrency(c as marketApi.GoldCurrency); setWeight(w as marketApi.GoldWeight);
              }}>
                <SelectTrigger aria-label="Gold price per">
                  <SelectValue>{currency} / {weight === 'damloeng' ? 'ដំឡឹង' : 'ជី'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(['USD', 'KHR'] as const).flatMap(c => marketApi.GOLD_WEIGHTS.map(w => (
                    <SelectItem key={`${c}|${w.key}`} value={`${c}|${w.key}`}>
                      {c} per {w.label} <span className="text-gray-500">· {w.hint}</span>
                    </SelectItem>
                  )))}
                </SelectContent>
              </Select>
            </div>
          ) : <div className="hidden lg:block" />}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Effective date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-red-700">Buy In · ទិញចូល</Label>
            <Input value={buy} onChange={e => setBuy(e.target.value)} inputMode="decimal" placeholder="0.00"
              className="text-right tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-green-700">Sell Out · លក់ចេញ</Label>
            <Input value={sell} onChange={e => setSell(e.target.value)} inputMode="decimal" placeholder="0.00"
              className="text-right tabular-nums" />
          </div>
        </div>
        {/* Outside the grid — inside a cell it nudged the Title field up. */}
        <datalist id="market-titles">{known.map(t => <option key={t} value={t} />)}</datalist>
        <div className="flex items-center justify-end gap-3">
          {/* Gold is shown per chi everywhere; a damloeng price is saved
              as a tenth of itself, said here before it is. */}
          {category === 'gold' && weight === 'damloeng' && (num(buy) != null || num(sell) != null) && (
            <span className="text-xs text-gray-500">
              Saved per ជី (÷10):
              {[['Buy', num(buy)], ['Sell', num(sell)]].map(([k, v]) => typeof v === 'number' && !Number.isNaN(v) && (
                <span key={k as string} className="ml-2 tabular-nums">
                  {k} {marketApi.fmtPrice(marketApi.perChi(v, 'damloeng'))} {currency}
                </span>
              ))}
            </span>
          )}
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
                    <th className="py-2 w-6" aria-label="Order" />
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
                  {dash.items.map((i, idx) => (
                    <tr
                      key={i.title}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', i.title);
                        setDragging(i.title);
                        setOrderBefore(dash.items.map(x => x.title));
                      }}
                      onDragOver={e => { if (!dragging) return; e.preventDefault(); moveTo(dragging, idx); }}
                      onDrop={e => e.preventDefault()}
                      onDragEnd={endDrag}
                      className={`border-b last:border-0 ${i.showOnDashboard ? '' : 'text-gray-400'} ${
                        dragging === i.title ? 'bg-blue-50 opacity-70' : ''}`}
                    >
                      <td className="py-2 pl-1">
                        <button
                          type="button"
                          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-0.5 rounded"
                          title="Drag to reorder (or focus and use ↑ ↓)"
                          aria-label={`Reorder ${i.title}`}
                          onKeyDown={e => {
                            if (e.key === 'ArrowUp') { e.preventDefault(); nudge(idx, -1); }
                            if (e.key === 'ArrowDown') { e.preventDefault(); nudge(idx, 1); }
                          }}
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                      </td>
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
                    <th className="py-2 pr-3">Date &amp; time</th>
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
                      <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap">{marketApi.fmtEntryStamp(r)}</td>
                      <td className="py-1.5 pr-3">{r.title}</td>
                      <td className={`py-1.5 pr-3 ${r.key === 'buy' ? 'text-red-700' : 'text-green-700'}`}>
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
