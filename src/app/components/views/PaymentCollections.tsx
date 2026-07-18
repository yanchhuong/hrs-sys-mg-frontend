import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { DateInput } from '../common/DateInput';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw } from 'lucide-react';
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

  const buckets = useMemo(() => {
    const b = { '0-30': [] as any[], '31-60': [] as any[], '61-90': [] as any[], '90+': [] as any[] };
    const now = asOf ? new Date(asOf) : new Date();
    for (const r of rows) {
      const due = new Date(r.dueDate);
      const days = Math.floor((now.getTime() - due.getTime()) / (24 * 3600 * 1000));
      const key = days <= 30 ? '0-30'
                : days <= 60 ? '31-60'
                : days <= 90 ? '61-90'
                : '90+';
      b[key as keyof typeof b].push({ ...r, daysPastDue: Math.max(0, days) });
    }
    return b;
  }, [rows, asOf]);

  const total = rows.reduce((s, r) => s + Number(r.balance ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold inline-flex items-center gap-2">
            <AlertTriangle className="h-7 w-7 text-red-600" />
            Collections
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Overdue installments across every active plan, bucketed by days past due.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500 mr-1">As of</div>
          <DateInput value={asOf} onChange={v => setAsOf(v ?? '')} />
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <BucketTile label="Total Overdue" count={rows.length} amount={total} tone="red" />
        {(['0-30','31-60','61-90','90+'] as const).map(k => (
          <BucketTile
            key={k}
            label={`${k} days`}
            count={buckets[k].length}
            amount={buckets[k].reduce((s, r) => s + Number(r.balance ?? 0), 0)}
            tone={k === '90+' ? 'red' : k === '61-90' ? 'amber' : undefined}
          />
        ))}
      </div>

      {(['0-30','31-60','61-90','90+'] as const).map(k => (
        <Card key={k}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">
                {k} days past due
              </h3>
              <Badge variant="outline">{buckets[k].length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buckets[k].length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-gray-400 py-6">No rows in this bucket.</TableCell></TableRow>
                )}
                {buckets[k].map((r: any) => (
                  <TableRow key={r.id} className="bg-red-50/40">
                    <TableCell className="font-mono text-xs">#{r.installmentNo}</TableCell>
                    <TableCell className="text-sm">{formatDate(r.dueDate)}</TableCell>
                    <TableCell className="text-sm text-red-700 font-medium tabular-nums">{r.daysPastDue}d</TableCell>
                    <TableCell className="text-right tabular-nums">${formatMoney(r.dueAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-green-700">${formatMoney(r.paidAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">${formatMoney(r.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
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
