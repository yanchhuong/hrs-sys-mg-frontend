import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { format, startOfYear, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { TrendingUp, Printer, Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import * as plApi from '../../api/profitLossReport';

/** Render an amount with the currency prefix. USD collapses to "$"; other
 *  currencies use an ISO-code prefix. */
const fmtMoney = (n: number): string => {
  const num = Math.abs(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${num}`;
};
/** Signed money — preserves a leading "− " (with trailing space) so
 *  the format reads as "− $X" everywhere, matching the convention used
 *  in the Invoice / Bill / Receipt / Ledger views. */
const signedMoney = (n: number): string => (n < 0 ? '− ' : '') + fmtMoney(n);

/** Friendly month label — "Jun 2026" instead of the raw "2026-06"
 *  bucket key. Done in JS so the backend stays locale-neutral. */
const formatMonth = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' });
};

/**
 * Profit &amp; Loss report. Income = invoices (Sale side); expenses =
 * bills + receipts (Purchase side). Headline cards show period totals
 * + net; the monthly table breaks it down by month so a trend is
 * visible at a glance. Two expandable detail tables list every
 * contributing document.
 *
 * <p>Default range is YTD (Jan 1 of the current year through end of
 * the current month). Drafts and voided documents are excluded —
 * matches the Ledger report and the accounting convention of
 * recognising only issued documents.</p>
 */
export function ProfitLossReport() {
  const [from, setFrom] = useState<string>(() => format(startOfYear(new Date()), 'yyyy-MM-dd'));
  const [to, setTo]     = useState<string>(() => format(endOfMonth(new Date()),   'yyyy-MM-dd'));
  const [report, setReport] = useState<plApi.ProfitLossReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [showIncome, setShowIncome] = useState(false);
  const [showExpense, setShowExpense] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await plApi.profitLoss({ from, to });
      setReport(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load profit & loss');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Net-coloured roll-ups — positive net is green (profit), negative
  // is red (loss). Zero stays neutral so a flat period doesn't shout.
  const netClass = (n: number) => n === 0
    ? 'text-gray-500'
    : n > 0 ? 'text-emerald-700' : 'text-rose-700';

  // Monthly chart bars — quick visual on top of the table. Same scale
  // for income and expense so the bars are directly comparable; we
  // anchor on the largest single-month value across both series.
  const maxBar = useMemo(() => {
    if (!report) return 1;
    let m = 0;
    for (const r of report.monthly) {
      m = Math.max(m, Math.abs(r.income), Math.abs(r.expense));
    }
    return m || 1;
  }, [report]);

  return (
    <div className="p-6 space-y-6 print:p-0 print:space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-gray-500" />
          <h1 className="text-2xl font-semibold">Profit &amp; Loss</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
        </Button>
      </div>

      <Card className="print:shadow-none print:border-0">
        <CardHeader className="pb-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> From
              </label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-44" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> To
              </label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-44" />
            </div>
            <Button onClick={load} disabled={loading}>
              {loading ? 'Loading…' : 'Apply'}
            </Button>
            <div className="ml-auto text-xs text-gray-500 max-w-xs text-right">
              Income from Invoices (Sales side); expenses from Bills and Receipts (Purchase side).
              Drafts and voided documents are excluded.
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Headline strip — Total Income · Total Expense · Net Profit.
          The Expense card shows the Bills / Receipts split as a
          sub-line so the user can see where the spend is concentrated. */}
      {report && (
        <Card className="print:shadow-none print:border-0">
          <CardContent className="py-4">
            <div className="grid grid-cols-3 gap-6">
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide">Total Income</div>
                <div className="text-2xl font-mono mt-1 text-emerald-700">{fmtMoney(report.totalIncome)}</div>
                <div className="text-xs text-gray-400 mt-0.5">Invoices &amp; adjustments</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide">Total Expense</div>
                <div className="text-2xl font-mono mt-1 text-rose-700">{fmtMoney(report.totalExpense)}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Bills <span className="font-mono">{fmtMoney(report.totalBillExpense)}</span>
                  {' · '}Receipts <span className="font-mono">{fmtMoney(report.totalReceiptExpense)}</span>
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide">Net Profit</div>
                <div className={`text-2xl font-mono mt-1 font-medium ${netClass(report.netProfit)}`}>
                  {signedMoney(report.netProfit)}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {report.netProfit >= 0 ? 'Income exceeds expense' : 'Expense exceeds income'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {report && report.monthly.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No activity in this period.
          </CardContent>
        </Card>
      )}

      {/* Monthly breakdown — table + bar chart. Same dataset, two
          views: the table is exact, the bars give a quick "is the
          trend up or down" read at a glance. */}
      {report && report.monthly.length > 0 && (
        <Card className="print:shadow-none print:border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Monthly Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Month</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead className="text-right w-32">Income</TableHead>
                  <TableHead className="text-right w-32">Expense</TableHead>
                  <TableHead className="text-right w-32">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.monthly.map(m => {
                  const incPct = (Math.abs(m.income)  / maxBar) * 100;
                  const expPct = (Math.abs(m.expense) / maxBar) * 100;
                  return (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium">{formatMonth(m.month)}</TableCell>
                      <TableCell className="py-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="w-12 text-[10px] text-emerald-700 text-right">income</div>
                            <div className="flex-1 h-2 bg-emerald-50 rounded">
                              <div className="h-2 bg-emerald-500 rounded" style={{ width: `${incPct}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-12 text-[10px] text-rose-700 text-right">expense</div>
                            <div className="flex-1 h-2 bg-rose-50 rounded">
                              <div className="h-2 bg-rose-500 rounded" style={{ width: `${expPct}%` }} />
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-700">{fmtMoney(m.income)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-rose-700">{fmtMoney(m.expense)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-medium ${netClass(m.net)}`}>
                        {signedMoney(m.net)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-gray-50 font-medium">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right font-mono text-emerald-700">{fmtMoney(report.totalIncome)}</TableCell>
                  <TableCell className="text-right font-mono text-rose-700">{fmtMoney(report.totalExpense)}</TableCell>
                  <TableCell className={`text-right font-mono ${netClass(report.netProfit)}`}>
                    {signedMoney(report.netProfit)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Income detail — collapsed by default to keep the page
          scannable. Opens to a list of every invoice / adjustment
          that contributed to the income total. */}
      {report && report.incomeLines.length > 0 && (
        <Card className="print:shadow-none print:border-0">
          <CardHeader className="pb-2 cursor-pointer print:cursor-default"
                      onClick={() => setShowIncome(s => !s)}>
            <CardTitle className="text-base flex items-center gap-2">
              {showIncome
                ? <ChevronDown className="h-4 w-4 print:hidden" />
                : <ChevronRight className="h-4 w-4 print:hidden" />}
              Income detail
              <span className="text-xs text-gray-500 font-normal">
                ({report.incomeLines.length} {report.incomeLines.length === 1 ? 'document' : 'documents'})
              </span>
            </CardTitle>
          </CardHeader>
          {showIncome && (
            <CardContent className="pt-0">
              <ProfitLossLineTable lines={report.incomeLines} sideLabel="Customer" />
            </CardContent>
          )}
        </Card>
      )}

      {report && report.expenseLines.length > 0 && (
        <Card className="print:shadow-none print:border-0">
          <CardHeader className="pb-2 cursor-pointer print:cursor-default"
                      onClick={() => setShowExpense(s => !s)}>
            <CardTitle className="text-base flex items-center gap-2">
              {showExpense
                ? <ChevronDown className="h-4 w-4 print:hidden" />
                : <ChevronRight className="h-4 w-4 print:hidden" />}
              Expense detail
              <span className="text-xs text-gray-500 font-normal">
                ({report.expenseLines.length} {report.expenseLines.length === 1 ? 'document' : 'documents'})
              </span>
            </CardTitle>
          </CardHeader>
          {showExpense && (
            <CardContent className="pt-0">
              <ProfitLossLineTable lines={report.expenseLines} sideLabel="Vendor" />
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

/** Detail table used by both Income and Expense sections — same shape
 *  (id, date, docNo, docType, party, amount), just different label on
 *  the party column. Extracted so the two collapsible cards don't drift. */
function ProfitLossLineTable({ lines, sideLabel }: {
  lines: plApi.ProfitLossLine[];
  sideLabel: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Date</TableHead>
          <TableHead className="w-36">Document</TableHead>
          <TableHead className="w-32">Type</TableHead>
          <TableHead>{sideLabel}</TableHead>
          <TableHead className="text-right w-32">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map(l => (
          <TableRow key={l.id} className="hover:bg-gray-50">
            <TableCell className="text-sm">{l.date}</TableCell>
            <TableCell className="font-mono text-sm">{l.docNo}</TableCell>
            <TableCell className="text-sm">{l.docType}</TableCell>
            <TableCell>{l.partyName}</TableCell>
            <TableCell className={`text-right font-mono text-sm ${l.amount < 0 ? 'text-rose-600' : ''}`}>
              {signedMoney(l.amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
