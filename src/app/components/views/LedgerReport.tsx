import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { DateInput } from '../common/DateInput';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Users, UserRound } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { BookOpen, Printer, Calendar, Eye, ArrowLeft, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import * as ledgerApi from '../../api/ledgerReports';
import * as currencyApi from '../../api/currencySettings';
import { formatMoneyForCurrency } from '../../utils/format';
import { useDateFormat } from '../../context/DateFormatContext';
import { useI18n } from '../../i18n/I18nContext';

/** Render an amount with the currency in front (matches the Bills /
 *  Invoices list pages). USD collapses to "$" with 2dp, KHR uses ISO
 *  prefix with no decimals, other currencies fall back to 2dp. */
const fmtMoney = (n: number, currency: string): string => {
  const num = formatMoneyForCurrency(Math.abs(n ?? 0), currency);
  if (currency === 'USD') return `$${num}`;
  if (currency === 'KHR') return `៛ ${num}`;
  return `${currency} ${num}`;
};
const formatMoney = fmtMoney;
/** Same as {@link fmtMoney} but preserves a minus sign — used for CN
 *  rows on the Total column and refund rows on the Received column
 *  so the negative contribution is visually distinct. Sign formatted
 *  as "− $X" (space after the minus) to match the convention used in
 *  the Invoice / Bill / Receipt views. */
const signedMoney = (n: number, currency: string): string =>
  (n < 0 ? '− ' : '') + fmtMoney(n, currency);

interface LedgerReportProps {
  /** Drives the endpoint + labels. 'sale' shows AR (customer side);
   *  'purchase' shows AP (vendor side). */
  kind: 'sale' | 'purchase';
}

/** Hover-hint that sits next to the "Received" / "Paid" header cells
 *  in the grand totals strip. Spells out what the column actually is
 *  in P&L terms — Income (+) on the sale side, Expense (-) on
 *  purchase — so a reader can map the friendly label back to the
 *  accounting concept without leaving the page. */
function SettledTooltip({ kind }: { kind: 'sale' | 'purchase' }) {
  const text = kind === 'sale'
    ? 'Total Income (+) — money received from customers in this range.'
    : 'Total Expense (−) — money paid to vendors in this range.';
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
            <Info className="h-3 w-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
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
  const { formatDate } = useDateFormat();
  const { t } = useI18n();
  const [from, setFrom] = useState<string>(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo]     = useState<string>(() => format(endOfMonth(new Date()),   'yyyy-MM-dd'));
  const [report, setReport] = useState<ledgerApi.LedgerReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  // Tenant currency setting — decides which of the USD / KHR split
  // columns actually render. A USD-only tenant hides the KHR column,
  // and vice versa; USD+KHR (default) shows both.
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  useEffect(() => {
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, []);
  const enabled = currencyApi.enabledCurrencies(currencySettings);
  const showUsd = enabled.includes('USD');
  const showKhr = enabled.includes('KHR');
  const splitCols = (showUsd ? 1 : 0) + (showKhr ? 1 : 0);
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
        // Title reads from the i18n catalogue so the page heading
        // follows the sidebar's active language — a Khmer sidebar
        // shouldn't land the operator on an "English-only" page.
        title: t('nav.reports.sale_ledger'),
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
        title: t('nav.reports.purchase_ledger'),
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
    // `t` is stable across renders but including it silences the
    // exhaustive-deps lint and future-proofs against a language flip
    // while the ledger page is open.
    [kind, t]);

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

  /** Per-group Received/Paid split by currency. Reads
   *  {@code receivedUsd} / {@code receivedKhr} from each entry —
   *  the backend tags every payment with its native currency so a
   *  USD invoice paid partly in KHR keeps both rails visible on the
   *  summary list instead of mashing the KHR amount into the USD
   *  column. */
  const receivedByCurrencyPerGroup = useMemo(() => {
    const out: Record<string, { usd: number; khr: number }> = {};
    if (!report) return out;
    for (const g of report.groups) {
      const slot = { usd: 0, khr: 0 };
      for (const e of g.entries) {
        slot.usd += e.receivedUsd ?? 0;
        slot.khr += e.receivedKhr ?? 0;
      }
      out[g.partyId] = slot;
    }
    return out;
  }, [report]);

  /** v-sale-ledger-sellers — regroup the flat entry list by
   *  seller (invoice.createdById). Only the parent doc rows count
   *  (child CN/DN carry balance=null but still contribute to
   *  Total / Received / Refund). Empty when no entry carries a
   *  seller ID (e.g., pre-v-sale-ledger-sellers data or Purchase
   *  side). */
  const sellerGroups = useMemo(() => {
    if (!report) return [] as Array<{
      sellerId: string; sellerName: string;
      invoiceCount: number;
      totalAmount: number;
      receivedUsd: number; receivedKhr: number;
      totalRefund: number;
    }>;
    const acc = new Map<string, {
      sellerId: string; sellerName: string;
      invoiceCount: number;
      totalAmount: number;
      receivedUsd: number; receivedKhr: number;
      totalRefund: number;
    }>();
    for (const g of report.groups) {
      for (const e of g.entries) {
        if (!e.sellerId) continue;
        // Only count parent docs (balance != null) as invoices
        // toward the "Invoices" count — CN/DN children roll their
        // amount + refund up here but shouldn't inflate the count.
        const isRoot = e.balance !== null;
        const key = e.sellerId;
        const cur = acc.get(key) ?? {
          sellerId: e.sellerId,
          sellerName: e.sellerName ?? '(unknown)',
          invoiceCount: 0,
          totalAmount: 0,
          receivedUsd: 0,
          receivedKhr: 0,
          totalRefund: 0,
        };
        cur.invoiceCount += isRoot ? 1 : 0;
        cur.totalAmount  += e.amount ?? 0;
        cur.receivedUsd  += e.receivedUsd ?? 0;
        cur.receivedKhr  += e.receivedKhr ?? 0;
        cur.totalRefund  += e.refund ?? 0;
        acc.set(key, cur);
      }
    }
    return Array.from(acc.values()).sort((a, b) => a.sellerName.localeCompare(b.sellerName));
  }, [report]);

  /** Grand-strip Received split: sum of every group's per-currency
   *  Received. Drives the two cards in the totals strip. */
  const grandReceivedByCurrency = useMemo(() => {
    const slot = { usd: 0, khr: 0 };
    for (const partyId in receivedByCurrencyPerGroup) {
      slot.usd += receivedByCurrencyPerGroup[partyId].usd;
      slot.khr += receivedByCurrencyPerGroup[partyId].khr;
    }
    return slot;
  }, [receivedByCurrencyPerGroup]);

  /** Render a cell — em-dash when the rail has no activity so the
   *  column doesn't fill with $0.00 / ៛0 on parties that only used
   *  one currency. */
  const moneyOrDash = (n: number, currency: string) =>
    n === 0 ? <span className="text-gray-300">—</span> : formatMoney(n, currency);

  /** v-sale-ledger-sellers — extracted so both the Sale-side
   *  Customers tab and the Purchase-side single card render the
   *  same per-party summary without JSX drift. */
  const renderCustomerTable = () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.party}</TableHead>
          <TableHead className="text-right w-28">Opening</TableHead>
          <TableHead className="text-right w-28">{labels.amountHeader}</TableHead>
          {showUsd && (
            <TableHead className="text-right w-28">{labels.settledHeader} (USD)</TableHead>
          )}
          {showKhr && (
            <TableHead className="text-right w-28">{labels.settledHeader} (KHR)</TableHead>
          )}
          <TableHead className="text-right w-28">{labels.refundHeader}</TableHead>
          <TableHead className="text-right w-32">Closing ({labels.balanceLabel})</TableHead>
          <TableHead className="w-28 print:hidden"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report!.groups.map(g => {
          const split = receivedByCurrencyPerGroup[g.partyId] ?? { usd: 0, khr: 0 };
          return (
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
              <TableCell className="text-right tabular-nums text-sm">
                {formatMoney(g.openingBalance, g.currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm">{formatMoney(g.totalAmount, g.currency)}</TableCell>
              {showUsd && (
                <TableCell className="text-right tabular-nums text-sm">{moneyOrDash(split.usd, 'USD')}</TableCell>
              )}
              {showKhr && (
                <TableCell className="text-right tabular-nums text-sm">{moneyOrDash(split.khr, 'KHR')}</TableCell>
              )}
              <TableCell className={`text-right tabular-nums text-sm ${kind === 'sale' ? 'text-rose-600' : 'text-emerald-700'}`}>
                {g.totalRefund === 0
                  ? formatMoney(0, g.currency)
                  : `${labels.refundSign}${formatMoney(g.totalRefund, g.currency)}`}
              </TableCell>
              <TableCell className={`text-right tabular-nums text-sm font-medium ${grandClass(g.closingBalance)}`}>
                {formatMoney(g.closingBalance, g.currency)}
              </TableCell>
              <TableCell className="text-right print:hidden">
                <Button size="sm" variant="outline"
                        onClick={ev => { ev.stopPropagation(); setSelectedPartyId(g.partyId); }}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> View Details
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <div className="p-6 space-y-6 print:p-0 print:space-y-3">
      <div className="flex items-center gap-3 sm:justify-between sm:flex-wrap overflow-x-auto sm:overflow-visible print:hidden">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-gray-500" />
          <h1 className="text-2xl font-semibold">{labels.title}</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
        </Button>
      </div>

      {/* Grand totals strip. Total · Received(USD) · Received(KHR) ·
          Refund · Closing — the Received column splits by currency so
          mixed-currency payments don't get arithmetic-mashed into one
          USD-looking sum that's actually nonsense. */}
      {report && (
        <Card className="print:shadow-none print:border-0">
          <CardContent className="py-4">
            <div className={`grid gap-6 text-sm ${['grid-cols-3', 'grid-cols-4', 'grid-cols-5'][splitCols]}`}>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide">Total</div>
                <div className="text-lg tabular-nums mt-0.5">{formatMoney(report.grandTotalAmount, 'USD')}</div>
              </div>
              {showUsd && (
                <div>
                  <div className="text-gray-500 text-xs uppercase tracking-wide inline-flex items-center gap-1">
                    {labels.settledHeader} (USD)
                    <SettledTooltip kind={kind} />
                  </div>
                  <div className="text-lg tabular-nums mt-0.5">{moneyOrDash(grandReceivedByCurrency.usd, 'USD')}</div>
                </div>
              )}
              {showKhr && (
                <div>
                  <div className="text-gray-500 text-xs uppercase tracking-wide inline-flex items-center gap-1">
                    {labels.settledHeader} (KHR)
                    <SettledTooltip kind={kind} />
                  </div>
                  <div className="text-lg tabular-nums mt-0.5">{moneyOrDash(grandReceivedByCurrency.khr, 'KHR')}</div>
                </div>
              )}
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide">{labels.refundHeader}</div>
                <div className={`text-lg tabular-nums mt-0.5 ${kind === 'sale' ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {report.grandTotalRefund === 0
                    ? formatMoney(0, 'USD')
                    : `${labels.refundSign}${formatMoney(report.grandTotalRefund, 'USD')}`}
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide">
                  Closing Balance ({labels.balanceLabel})
                </div>
                <div className={`text-lg tabular-nums mt-0.5 ${grandClass(report.grandTotalBalance)}`}>
                  {formatMoney(report.grandTotalBalance, 'USD')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compact date-range filter bar — Payroll Report style
          (Card + p-3 CardContent, no CardHeader). Sits next to
          the summary table so the range is where the operator's
          eye is. Left: From → To. Right: Apply. */}
      <Card className="print:hidden">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <DateInput
              value={from}
              onChange={setFrom}
              className="h-8 w-36 text-sm"
              title="From date"
            />
            <span className="text-gray-400 text-xs">→</span>
            <DateInput
              value={to}
              onChange={setTo}
              className="h-8 w-36 text-sm"
              title="To date"
            />
            <div className="ml-auto">
              <Button size="sm" onClick={load} disabled={loading} className="h-8">
                {loading ? 'Loading…' : 'Apply'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {report && report.groups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No activity in this period.
          </CardContent>
        </Card>
      )}

      {/* v-sale-ledger-sellers — Sale-side gets two tabs:
          Customers (existing per-party summary) + Sellers (per-
          cashier aggregate). Purchase side has no cashier concept
          so it keeps the single Vendors view. */}
      {report && report.groups.length > 0 && selectedPartyId === null && kind === 'sale' && (
        <Tabs defaultValue="customers" className="space-y-4">
          <TabsList>
            <TabsTrigger value="customers">
              <Users className="h-3.5 w-3.5" />
              Customers
            </TabsTrigger>
            <TabsTrigger value="sellers">
              <UserRound className="h-3.5 w-3.5" />
              Sellers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sellers" className="mt-0">
            <Card className="print:shadow-none print:border-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Sellers</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {sellerGroups.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">
                    No seller data in this period.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Seller</TableHead>
                        <TableHead className="text-right w-28">Invoices</TableHead>
                        <TableHead className="text-right w-28">{labels.amountHeader}</TableHead>
                        {showUsd && (
                          <TableHead className="text-right w-28">{labels.settledHeader} (USD)</TableHead>
                        )}
                        {showKhr && (
                          <TableHead className="text-right w-28">{labels.settledHeader} (KHR)</TableHead>
                        )}
                        <TableHead className="text-right w-28">{labels.refundHeader}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sellerGroups.map(s => (
                        <TableRow key={s.sellerId}>
                          <TableCell>
                            <span className="font-medium">{s.sellerName}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {s.invoiceCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {formatMoney(s.totalAmount, 'USD')}
                          </TableCell>
                          {showUsd && (
                            <TableCell className="text-right tabular-nums text-sm">
                              {moneyOrDash(s.receivedUsd, 'USD')}
                            </TableCell>
                          )}
                          {showKhr && (
                            <TableCell className="text-right tabular-nums text-sm">
                              {moneyOrDash(s.receivedKhr, 'KHR')}
                            </TableCell>
                          )}
                          <TableCell className={`text-right tabular-nums text-sm ${kind === 'sale' ? 'text-rose-600' : 'text-emerald-700'}`}>
                            {s.totalRefund === 0
                              ? formatMoney(0, 'USD')
                              : `${labels.refundSign}${formatMoney(s.totalRefund, 'USD')}`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers" className="mt-0">
            <Card className="print:shadow-none print:border-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{labels.party}s</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {renderCustomerTable()}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Purchase side keeps the single Vendors card (no seller
          concept on bills). Uses the shared renderCustomerTable
          helper defined above so both sides stay in visual sync. */}
      {report && report.groups.length > 0 && selectedPartyId === null && kind === 'purchase' && (
        <Card className="print:shadow-none print:border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{labels.party}s</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {renderCustomerTable()}
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
                <span>Opening: <span className="tabular-nums">{formatMoney(g.openingBalance, g.currency)}</span></span>
                <span>Closing: <span className={`tabular-nums font-medium ${grandClass(g.closingBalance)}`}>
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
                  {/* Received/Paid split per currency — matches the
                      summary list so the operator sees the same shape
                      after drilling into a single party. Rails are
                      gated on the tenant Currency setting. */}
                  {showUsd && (
                    <TableHead className="text-right w-28">{labels.settledHeader} (USD)</TableHead>
                  )}
                  {showKhr && (
                    <TableHead className="text-right w-28">{labels.settledHeader} (KHR)</TableHead>
                  )}
                  <TableHead className="text-right w-28">{labels.refundHeader}</TableHead>
                  <TableHead className="text-right w-32">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.openingBalance !== 0 && (
                  <TableRow className="bg-gray-50/60">
                    <TableCell className="text-xs text-gray-500" colSpan={6 + splitCols}>Opening balance</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {formatMoney(g.openingBalance, g.currency)}
                    </TableCell>
                  </TableRow>
                )}
                {g.entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7 + splitCols} className="text-center text-gray-400 py-6 text-sm">
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
                    <TableCell className={`text-sm ${isChild ? 'pl-8 text-gray-500' : ''}`}>{formatDate(e.date)}</TableCell>
                    <TableCell className={`tabular-nums text-xs ${isChild ? 'text-gray-500' : ''}`}>
                      {isChild && <span className="text-gray-400 mr-1">└</span>}
                      {e.docNo}
                    </TableCell>
                    <TableCell className={`text-sm ${isChild ? 'text-gray-500' : ''}`}>{e.docType}</TableCell>
                    <TableCell className="text-xs text-gray-500">{e.reference}</TableCell>
                    <TableCell className={`text-right tabular-nums text-sm ${e.amount < 0 ? 'text-rose-600' : ''}`}>
                      {e.amount === 0 ? '—' : signedMoney(e.amount, e.currency)}
                    </TableCell>
                    {showUsd && (
                      <TableCell className="text-right tabular-nums text-sm">
                        {moneyOrDash(e.receivedUsd ?? 0, 'USD')}
                      </TableCell>
                    )}
                    {showKhr && (
                      <TableCell className="text-right tabular-nums text-sm">
                        {moneyOrDash(e.receivedKhr ?? 0, 'KHR')}
                      </TableCell>
                    )}
                    <TableCell className={`text-right tabular-nums text-sm ${kind === 'sale' ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {e.refund === 0 ? '—' : `${labels.refundSign}${formatMoney(e.refund, e.currency)}`}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums text-sm ${e.balance == null ? 'text-gray-300' : grandClass(e.balance)}`}>
                      {e.balance == null ? '—' : formatMoney(e.balance, e.currency)}
                    </TableCell>
                  </TableRow>
                  );
                })}
                {/* Subtotal — per-currency Received sums from the
                    entries themselves so the column footer agrees
                    with the per-row values above. */}
                {(() => {
                  const sumUsd = g.entries.reduce((s, e) => s + (e.receivedUsd ?? 0), 0);
                  const sumKhr = g.entries.reduce((s, e) => s + (e.receivedKhr ?? 0), 0);
                  return (
                <TableRow className="bg-gray-50 font-medium">
                  <TableCell colSpan={4}>Subtotal</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(g.totalAmount, g.currency)}</TableCell>
                  {showUsd && (
                    <TableCell className="text-right tabular-nums">{moneyOrDash(sumUsd, 'USD')}</TableCell>
                  )}
                  {showKhr && (
                    <TableCell className="text-right tabular-nums">{moneyOrDash(sumKhr, 'KHR')}</TableCell>
                  )}
                  <TableCell className={`text-right tabular-nums ${kind === 'sale' ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {g.totalRefund === 0
                      ? formatMoney(0, g.currency)
                      : `${labels.refundSign}${formatMoney(g.totalRefund, g.currency)}`}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${grandClass(g.closingBalance)}`}>
                    {formatMoney(g.closingBalance, g.currency)}
                  </TableCell>
                </TableRow>
                  );
                })()}
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
