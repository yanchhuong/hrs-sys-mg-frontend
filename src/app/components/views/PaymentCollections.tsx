import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { DateInput } from '../common/DateInput';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { format } from 'date-fns';
import { useDateFormat } from '../../context/DateFormatContext';
import { formatMoney } from '../../utils/format';
import * as paymentPlansApi from '../../api/paymentPlans';

/**
 * Collections / aging report. Buckets overdue rows into 0-30 / 31-60 /
 * 61-90 / 90+ days past due based on `dueDate` vs `asOf`. The FE does
 * the bucketing so the API stays a flat list — easy to reuse.
 */
export function PaymentCollections() {
  const { formatDate } = useDateFormat();
  const [asOf, setAsOf] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [rows, setRows] = useState<paymentPlansApi.PaymentSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await paymentPlansApi.aging(asOf));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load aging');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [asOf]);

  // Three aging buckets — 0-30 (recent overdue), 31-60 (mid), 60+
  // (long-standing). Reduced from the earlier four-bucket split so
  // the collections screen stays scannable at a glance.
  type BucketKey = '0-30' | '31-60' | '60+';
  type BucketRow = paymentPlansApi.PaymentSchedule & { daysPastDue: number; bucket: BucketKey };
  const bucketed = useMemo<BucketRow[]>(() => {
    const now = asOf ? new Date(asOf) : new Date();
    return rows.map(r => {
      const due = new Date(r.dueDate);
      const days = Math.floor((now.getTime() - due.getTime()) / (24 * 3600 * 1000));
      const bucket: BucketKey = days <= 30 ? '0-30'
                              : days <= 60 ? '31-60'
                              : '60+';
      return { ...r, daysPastDue: Math.max(0, days), bucket };
    });
  }, [rows, asOf]);

  const [filter, setFilter] = useState<'all' | BucketKey>('all');
  const filtered = useMemo(() => filter === 'all' ? bucketed : bucketed.filter(r => r.bucket === filter), [bucketed, filter]);

  const counts = useMemo(() => ({
    'all':   bucketed.length,
    '0-30':  bucketed.filter(r => r.bucket === '0-30').length,
    '31-60': bucketed.filter(r => r.bucket === '31-60').length,
    '60+':   bucketed.filter(r => r.bucket === '60+').length,
  }), [bucketed]);

  const sums = useMemo(() => ({
    'all':   bucketed.reduce((s, r) => s + Number(r.balance ?? 0), 0),
    '0-30':  bucketed.filter(r => r.bucket === '0-30').reduce((s, r) => s + Number(r.balance ?? 0), 0),
    '31-60': bucketed.filter(r => r.bucket === '31-60').reduce((s, r) => s + Number(r.balance ?? 0), 0),
    '60+':   bucketed.filter(r => r.bucket === '60+').reduce((s, r) => s + Number(r.balance ?? 0), 0),
  }), [bucketed]);

  const BUCKET_BADGE: Record<BucketKey, string> = {
    '0-30':  'bg-amber-100 text-amber-800 hover:bg-amber-100',
    '31-60': 'bg-orange-100 text-orange-800 hover:bg-orange-100',
    '60+':   'bg-red-100 text-red-800 hover:bg-red-100',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold inline-flex items-center gap-2">
            <AlertTriangle className="h-7 w-7 text-red-600" />
            Collections
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Overdue installments across every active plan, bucketed by days past due.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500 mr-1">As of</div>
          <DateInput value={asOf} onChange={v => setAsOf(v ?? '')} />
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="stat-strip stat-cols-4">
        <BucketTile label="Total Overdue"  count={counts.all}     amount={sums.all}     tone="red" />
        <BucketTile label="0-30 days"      count={counts['0-30']} amount={sums['0-30']} tone="amber" />
        <BucketTile label="31-60 days"     count={counts['31-60']} amount={sums['31-60']} tone="amber" />
        <BucketTile label="60+ days"       count={counts['60+']}  amount={sums['60+']}  tone="red" />
      </div>

      <Card>
        {/* Aging bucket tabs — nowrap + horizontal-scroll on narrow
            screens per [[feedback_filter_row_uxpattern]] so the four
            pills never wrap onto two rows. */}
        <CardHeader className="pb-3">
          <Tabs value={filter} onValueChange={v => setFilter(v as any)}>
            <TabsList className="filter-strip w-max">
              <TabsTrigger value="all">All <Badge variant="secondary" className="ml-2">{counts.all}</Badge></TabsTrigger>
              <TabsTrigger value="0-30">0-30 days <Badge variant="secondary" className="ml-2">{counts['0-30']}</Badge></TabsTrigger>
              <TabsTrigger value="31-60">31-60 days <Badge variant="secondary" className="ml-2">{counts['31-60']}</Badge></TabsTrigger>
              <TabsTrigger value="60+">60+ days <Badge variant="secondary" className="ml-2">{counts['60+']}</Badge></TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Bucket</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (<TableRow><TableCell colSpan={7} className="text-center text-sm text-gray-400 py-10">Loading…</TableCell></TableRow>)}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-gray-400 py-10">
                  {rows.length === 0 ? 'Nothing overdue as of that date.' : 'No rows in this bucket.'}
                </TableCell></TableRow>
              )}
              {filtered.map(r => (
                <TableRow key={r.id} className="bg-red-50/40">
                  <TableCell className="font-mono text-xs">#{r.installmentNo}</TableCell>
                  <TableCell className="text-sm">{formatDate(r.dueDate)}</TableCell>
                  <TableCell className="text-sm text-red-700 font-medium tabular-nums">{r.daysPastDue}d</TableCell>
                  <TableCell><Badge className={BUCKET_BADGE[r.bucket]}>{r.bucket}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">${formatMoney(r.dueAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums text-green-700">${formatMoney(r.paidAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">${formatMoney(r.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function BucketTile({ label, count, amount, tone }: {
  label: string; count: number; amount: number; tone?: 'red' | 'amber';
}) {
  const cls = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-gray-900';
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-gray-500">{label}</div>
        <div className={`text-xl font-bold ${cls}`}>{count}</div>
        <div className="text-sm text-gray-600 tabular-nums">${formatMoney(amount)}</div>
      </CardContent>
    </Card>
  );
}
