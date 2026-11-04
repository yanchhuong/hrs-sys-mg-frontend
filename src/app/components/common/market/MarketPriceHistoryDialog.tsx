/**
 * Price history (V392) — every entry in a range, with a Buy / Sell
 * chart for one title. Read-only: prices are entered in General
 * Settings → Company.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { TableRowsSkeleton } from '../LoadingSkeletons';
import { ListError } from '../ListStates';
import * as marketApi from '../../../api/marketPrices';

type Range = 'today' | 'yesterday' | '7d' | '30d' | '3m' | 'custom';

const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '3m', label: 'Last 3 months' },
  { value: 'custom', label: 'Custom range' },
];

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function rangeOf(r: Range, today: string, from: string, to: string): { from: string; to: string } {
  switch (r) {
    case 'today': return { from: today, to: today };
    case 'yesterday': return { from: shift(today, -1), to: shift(today, -1) };
    case '7d': return { from: shift(today, -6), to: today };
    case '30d': return { from: shift(today, -29), to: today };
    case '3m': return { from: shift(today, -89), to: today };
    default: return { from: from || shift(today, -29), to: to || today };
  }
}

export function MarketPriceHistoryDialog({
  open, onOpenChange, titles, initialTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Configured titles with their category, from the dashboard. */
  titles: { title: string; category: marketApi.MarketCategory }[];
  initialTitle?: string;
}) {
  const today = marketApi.todayPP();
  const [range, setRange] = useState<Range>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [category, setCategory] = useState<'all' | marketApi.MarketCategory>('all');
  const [title, setTitle] = useState<string>('all');
  const [rows, setRows] = useState<marketApi.MarketEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { if (open) setTitle(initialTitle ?? 'all'); }, [open, initialTitle]);

  const span = rangeOf(range, today, from, to);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setRows(null); setError(null);
    marketApi.history({
      from: span.from, to: span.to,
      category: category === 'all' ? undefined : category,
      title: title === 'all' ? undefined : title,
    })
      .then(r => { if (live) setRows(r); })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : 'Failed to load history'); });
    return () => { live = false; };
  }, [open, span.from, span.to, category, title, attempt]);

  const titleOptions = titles.filter(t => category === 'all' || t.category === category);

  // One point per date for the chart: the last entry of each key that
  // day (rows arrive newest first, so the first seen wins).
  const chart = useMemo(() => {
    if (!rows || title === 'all') return [];
    const byDate = new Map<string, { date: string; buy?: number; sell?: number }>();
    for (const r of rows) {
      if (r.title !== title) continue;
      const p = byDate.get(r.effectiveDate) ?? { date: r.effectiveDate };
      if (p[r.key] === undefined) p[r.key] = Number(r.value);
      byDate.set(r.effectiveDate, p);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [rows, title]);

  const selectCls = 'h-9 w-[160px] shrink-0';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Price history</DialogTitle>
          <DialogDescription>
            Every buy and sell price entered, newest first. Earlier prices are never overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 overflow-x-auto hover-scroll-x pb-1">
          <Select value={category} onValueChange={v => { setCategory(v as typeof category); setTitle('all'); }}>
            <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="gold">Gold</SelectItem>
              <SelectItem value="currency">Currency</SelectItem>
            </SelectContent>
          </Select>
          <Select value={title} onValueChange={setTitle}>
            <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All titles</SelectItem>
              {titleOptions.map(t => <SelectItem key={t.title} value={t.title}>{t.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={v => setRange(v as Range)}>
            <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {range === 'custom' && (
            <>
              <span className="text-xs text-gray-500 shrink-0">From</span>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-[150px] shrink-0" />
              <span className="text-xs text-gray-500 shrink-0">To</span>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-[150px] shrink-0" />
            </>
          )}
        </div>

        {title !== 'all' && chart.length > 1 && (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']}
                  tickFormatter={v => marketApi.fmtPrice(Number(v))} width={80} />
                <Tooltip formatter={(v: number) => marketApi.fmtPrice(v)} />
                <Legend />
                <Line type="monotone" dataKey="buy" name="Buy In" stroke="#16a34a" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="sell" name="Sell Out" stroke="#dc2626" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {title === 'all' && (
          <div className="text-xs text-gray-500">Pick a title to see its Buy In and Sell Out chart.</div>
        )}

        {error ? (
          <ListError message={error} onRetry={() => setAttempt(a => a + 1)} />
        ) : rows == null ? (
          <TableRowsSkeleton rows={5} columns={6} />
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">No prices in this range.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2 pr-3">Effective date</th>
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Key</th>
                  <th className="py-2 pr-3 text-right">Value</th>
                  <th className="py-2 pr-3">Updated by</th>
                  <th className="py-2">Updated at</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 tabular-nums">{r.effectiveDate}</td>
                    <td className="py-2 pr-3">{r.title}</td>
                    <td className={`py-2 pr-3 ${r.key === 'buy' ? 'text-green-700' : 'text-red-700'}`}>
                      {r.key === 'buy' ? 'Buy' : 'Sell'}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{marketApi.fmtPrice(r.value)}</td>
                    <td className="py-2 pr-3 text-gray-600">{r.createdByName ?? '—'}</td>
                    <td className="py-2 text-gray-500 tabular-nums">
                      {new Date(r.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
