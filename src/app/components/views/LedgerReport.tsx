import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { BookOpen, Printer, Calendar, Eye, ArrowLeft } from 'lucide-react';
import * as ledgerApi from '../../api/ledgerReports';

/** Render an amount with the currency in front (matches the Bills /
 *  Invoices list pages). USD collapses to "$"; other currencies use
 *  an ISO-code prefix. */
const fmtMoney = (n: number, currency: string): string => {
  const num = Math.abs(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'USD' ? `$${num}` : `${currency} ${num}`;
};
const formatMoney = fmtMoney;
/** Same as {@link fmtMoney} but preserves a minus sign — used for CN
 *  rows on the Total column and refund rows on the Received column
 *  so the negative contribution is visually distinct. */
const signedMoney = (n: number, currency: string): string =>
  (n < 0 ? '−' : '') + fmtMoney(n, currency);

interface LedgerReportProps {
  /** Drives the endpoint + labels. 'sale' shows AR (customer side);
   *  'purchase' shows AP (vendor side). */
  kind: 'sale' | 'purchase';
}

/**
 * Sale / Purchase Ledger report. One component drives both reports
 * because the data shape is identical and only the labels differ.
 *
 * <p>Per-party cards, chronological rows, running balance per group,
 * grand totals at the top. Date range defaults to the current month
 * so the page lands with a useful view on first open. Empty groups
 * (party with no in-range activity but a non-zero opening) still
 * render so the user can see the carry-forward state.</p>
 */
export function LedgerReport({ kind }: LedgerReportProps) {
  const [from, setFrom] = useState<string>(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo]     = useState<string>(() => format(endOfMonth(new Date()),   'yyyy-MM-dd'));
  const [report, setReport] = useState<ledgerApi.LedgerReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  // Drives the two-level navigation: null = summary list (one row
  // per party), partyId = detail page for that customer / vendor.
  // Lives in component state instead of the URL because the Ledger
  // is mounted via a single nav leaf — keeps the change scoped.
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const selectedGroup = useMemo(
    () => report?.groups.find(g => g.partyId === selectedPartyId) ?? null,
    [report, selectedPartyId]
  );

  const labels = useMemo(() => kind === 'sale'
    ? {
        title: 'Sale Ledger',
        party: 'Customer',
        // "Received" reads the way the user thinks about it on the sale
        // side — money the company collected, even though accountants
        // call this column Credit. Same number, friendlier label.
        amountHeader: 'Total',
        settledHeader: 'Received',
        // Refund on Sales = cash OUT to customer (we refunded them).
        // Negative contribution to "received", shown with leading −.
        refundHeader: 'Refund (-)',
        refundSign: '−',
        balanceLabel: 'AR',
        balanceMeaning: 'Accounts Receivable (customer owes us)',
      }
    : {
        title: 'Purchase Ledger',
        party: 'Vendor',
        amountHeader: 'Total',
        settledHeader: 'Paid',
        // Return on Purchases = cash / credit IN from vendor (we
        // returned goods or got refunded). Positive contribution,
        // shown with leading + to mirror the (-) sign on the sale
        // side and stay symmetric.
        refundHeader: 'Return (+)',
        refundSign: '+',
        balanceLabel: 'AP',
        balanceMeaning: 'Accounts Payable (we owe vendor)',
      },
    [kind]);

  const load = async () => {
    setLoading(true);
    try {
      const fn = kind === 'sale' ? ledgerApi.saleLedger : ledgerApi.purchaseLedger;
      const r = await fn({ from, to });
      setReport(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load ledger');
    } finally {
      setLoading(false);
    }
  };

  // Auto-load on mount + whenever the date range changes via Apply.
  // Not on every keystroke — the Apply button is the trigger so
  // half-typed dates don't fire a fetch.
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const grandClass = (n: number) => n === 0
    ? 'text-gray-500'
    : (kind === 'sale' ? (n > 0 ? 'text-amber-700' : 'text-emerald-700')
                       : (n > 0 ? 'text-rose-700'  : 'text-emerald-700'));

  return (
    <div className="p-6 space-y-6 print:p-0 print:space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-gray-500" />
          <h1 className="text-2xl font-semibold">{labels.title}</h1>
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
              Balance shows {labels.balanceMeaning}. Drafts and voided
              documents are excluded; pre-range activity rolls into
              each group's opening balance.
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Grand totals strip. Total · Received|Paid · Refund · Closing
          balance — same shape the user sees on the Invoice / Bill list,
          with Refund split out so the reverse-direction cash is
          visible at a glance. */}
      {report && (
        <Card className="print:shadow-none print:border-0">
          <CardContent className="py-4">
            <div className="grid grid-cols-4 gap-6 text-sm">
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide">Total</div>
                <div className="text-lg font-mono mt-0.5">{formatMoney(report.grandTotalAmount, 'USD')}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide">{labels.settledHeader}</div>
                <div className="text-lg font-mono mt-0.5">{formatMoney(report.grandTotalReceived, 'USD')}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide">{labels.refundHeader}</div>
                <div className={`text-lg font-mono mt-0.5 ${kind === 'sale' ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {report.grandTotalRefund === 0
                    ? formatMoney(0, 'USD')
                    : `${labels.refundSign}${formatMoney(report.grandTotalRefund, 'USD')}`}
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide">
                  Closing Balance ({labels.balanceLabel})
                </div>
                <div className={`text-lg font-mono mt-0.5 ${grandClass(report.grandTotalBalance)}`}>
                  {formatMoney(report.grandTotalBalance, 'USD')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {report && report.groups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No activity in this period.
          </CardContent>
        </Card>
      )}

      {/* Summary list — one row per party. Renders when no party is
          selected; clicking View Details switches to the per-party
          detail view (the chain-grouped table below). */}
      {report && report.groups.length > 0 && selectedPartyId === null && (
        <Card className="print:shadow-none print:border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{labels.party}s</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{labels.party}</TableHead>
                  <TableHead className="text-right w-28">Opening</TableHead>
                  <TableHead className="text-right w-28">{labels.amountHeader}</TableHead>
                  <TableHead className="text-right w-28">{labels.settledHeader}</TableHead>
                  <TableHead className="text-right w-28">{labels.refundHeader}</TableHead>
                  <TableHead className="text-right w-32">Closing ({labels.balanceLabel})</TableHead>
                  <TableHead className="w-28 print:hidden"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.groups.map(g => (
                  <TableRow key={g.partyId} className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => setSelectedPartyId(g.partyId)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{g.partyName}</span>
                        {g.partyType && (
                          <Badge variant="outline" className={g.partyType === 'business'
                            ? 'bg-violet-50 text-violet-700 border-violet-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'}>
                            {g.partyType}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatMoney(g.openingBalance, g.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatMoney(g.totalAmount, g.currency)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatMoney(g.totalReceived, g.currency)}</TableCell>
                    <TableCell className={`text-right font-mono text-sm ${kind === 'sale' ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {g.totalRefund === 0
                        ? formatMoney(0, g.currency)
                        : `${labels.refundSign}${formatMoney(g.totalRefund, g.currency)}`}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm font-medium ${grandClass(g.closingBalance)}`}>
                      {formatMoney(g.closingBalance, g.currency)}
                    </TableCell>
                    <TableCell className="text-right print:hidden">
                      <Button size="sm" variant="outline"
                              onClick={ev => { ev.stopPropagation(); setSelectedPartyId(g.partyId); }}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Back button — only on detail view. Lives above the per-party
          card so it's the first action the user sees on the page. */}
      {report && selectedPartyId !== null && (
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => setSelectedPartyId(null)}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to {labels.party}s
          </Button>
          {selectedGroup && (
            <span className="text-sm text-gray-600">
              · {selectedGroup.partyName}
            </span>
          )}
        </div>
      )}

      {report && selectedPartyId !== null && report.groups
        .filter(g => g.partyId === selectedPartyId)
        .map(g => (
        <Card key={g.partyId} className="print:shadow-none print:border print:break-inside-avoid">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                {g.partyName}
                {g.partyType && (
                  <Badge variant="outline" className={g.partyType === 'business'
                    ? 'bg-violet-50 text-violet-700 border-violet-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'}>
                    {g.partyType}
                  </Badge>
                )}
              </CardTitle>
              <div className="text-xs text-gray-500 flex gap-4">
                <span>Opening: <span className="font-mono">{formatMoney(g.openingBalance, g.currency)}</span></span>
                <span>Closing: <span className={`font-mono font-medium ${grandClass(g.closingBalance)}`}>
                  {formatMoney(g.closingBalance, g.currency)}
                </span></span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-44">Doc No</TableHead>
                  <TableHead className="w-32">Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right w-28">{labels.amountHeader}</TableHead>
                  <TableHead className="text-right w-28">{labels.settledHeader}</TableHead>
                  <TableHead className="text-right w-28">{labels.refundHeader}</TableHead>
                  <TableHead className="text-right w-32">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.openingBalance !== 0 && (
                  <TableRow className="bg-gray-50/60">
                    <TableCell className="text-xs text-gray-500" colSpan={7}>Opening balance</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatMoney(g.openingBalance, g.currency)}
                    </TableCell>
                  </TableRow>
                )}
                {g.entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-gray-400 py-6 text-sm">
                      No activity in this period.
                    </TableCell>
                  </TableRow>
                ) : g.entries.map(e => {
                  // Child rows (Credit / Debit Note) carry balance = null,
                  // which is how the backend signals "indent + hide
                  // Balance cell". Same shape as the Invoice list page:
                  // one Balance line per chain, on the parent row.
                  const isChild = e.balance === null;
                  return (
                  <TableRow key={e.id} className={isChild ? 'bg-gray-50/40' : ''}>
                    <TableCell className={`text-sm ${isChild ? 'pl-8 text-gray-500' : ''}`}>{e.date}</TableCell>
                    <TableCell className={`font-mono text-xs ${isChild ? 'text-gray-500' : ''}`}>
                      {isChild && <span className="text-gray-400 mr-1">└</span>}
                      {e.docNo}
                    </TableCell>
                    <TableCell className={`text-sm ${isChild ? 'text-gray-500' : ''}`}>{e.docType}</TableCell>
                    <TableCell className="text-xs text-gray-500">{e.reference}</TableCell>
                    <TableCell className={`text-right font-mono text-sm ${e.amount < 0 ? 'text-rose-600' : ''}`}>
                      {e.amount === 0 ? '—' : signedMoney(e.amount, e.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {e.received === 0 ? '—' : formatMoney(e.received, e.currency)}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${kind === 'sale' ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {e.refund === 0 ? '—' : `${labels.refundSign}${formatMoney(e.refund, e.currency)}`}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${e.balance == null ? 'text-gray-300' : grandClass(e.balance)}`}>
                      {e.balance == null ? '—' : formatMoney(e.balance, e.currency)}
                    </TableCell>
                  </TableRow>
                  );
                })}
                <TableRow className="bg-gray-50 font-medium">
                  <TableCell colSpan={4}>Subtotal</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(g.totalAmount, g.currency)}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(g.totalReceived, g.currency)}</TableCell>
                  <TableCell className={`text-right font-mono ${kind === 'sale' ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {g.totalRefund === 0
                      ? formatMoney(0, g.currency)
                      : `${labels.refundSign}${formatMoney(g.totalRefund, g.currency)}`}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${grandClass(g.closingBalance)}`}>
                    {formatMoney(g.closingBalance, g.currency)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Sale Ledger wrapper for the nav system — keeps the leaf
 *  configuration tidy without a custom `initialView` prop. */
export function SaleLedger()     { return <LedgerReport kind="sale" />; }
/** Purchase Ledger wrapper — same idea, vendor-side. */
export function PurchaseLedger() { return <LedgerReport kind="purchase" />; }
