import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { DateInput } from '../common/DateInput';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { format, startOfYear, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, Wallet, Printer, Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import * as plApi from '../../api/profitLossReport';
import * as currencyApi from '../../api/currencySettings';
import { useI18n } from '../../i18n/I18nContext';
import { StatCard } from '../common/StatCard';

/** Render an amount with the tenant's primary currency prefix. USD
 *  collapses to "$", KHR / KRW show the local symbol without decimals;
 *  any other code falls back to the ISO prefix. Factory-style so we
 *  can bake in the tenant's currency once at mount time and avoid
 *  threading it through every usage site. */
function makeMoneyFormatters(code: string) {
  const sym = currencyApi.currencySymbol(code);
  const noDp = code === 'KHR' || code === 'KRW';
  const fmt = (n: number): string => {
    // Locale-locked to en-US so the decimal separator stays "." even
    // when the browser runs in km-KH / fr / etc. (those default to ",").
    const num = Math.abs(n ?? 0).toLocaleString('en-US',
      noDp
        ? { maximumFractionDigits: 0 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (sym !== code) return noDp ? `${sym} ${num}` : `${sym}${num}`;
    return `${code} ${num}`;
  };
  // Signed money — preserves a leading "− " so the format reads as
  // "− $X" everywhere, matching the convention used in the Invoice /
  // Bill / Receipt / Ledger views.
  const signed = (n: number): string => (n < 0 ? '− ' : '') + fmt(n);
  return { fmt, signed };
}

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
/** The nav-intent key P&L writes before switching the sidebar view.
 *  Invoices / Bills / Receipts read + clear this on mount to open the
 *  matching detail dialog. Kept in sessionStorage so a browser refresh
 *  doesn't leave a stale intent hanging. */
const PL_NAV_INTENT_KEY = 'pl.openDetail';

/** Enum-like union for which source table a P&L line came from. Drives
 *  both the target view id and the receiving page's dialog. */
type PlLineSource = 'invoice' | 'bill' | 'receipt';

/** Classify a P&L line by which side + which detail label it carries.
 *  Income lines are always invoices (kind = commercial / tax / CN / DN
 *  / medical / tuition). Expense lines are bills unless the label is
 *  "Receipt" — receipts are the only flat single-row expense. */
function sourceForLine(l: plApi.ProfitLossLine, side: 'income' | 'expense'): PlLineSource {
  if (side === 'income') return 'invoice';
  if (l.docType === 'Receipt') return 'receipt';
  return 'bill';
}

export function ProfitLossReport({ onNavigate }: { onNavigate?: (view: string) => void } = {}) {
  const { t } = useI18n();
  const [from, setFrom] = useState<string>(() => format(startOfYear(new Date()), 'yyyy-MM-dd'));
  const [to, setTo]     = useState<string>(() => format(endOfMonth(new Date()),   'yyyy-MM-dd'));
  const [report, setReport] = useState<plApi.ProfitLossReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [showIncome, setShowIncome] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  // Tenant currency setting drives the money prefix on every cell.
  // Backend returns numbers in a single native currency, so the P&L
  // renders in the tenant's PRIMARY code — a KHR-primary tenant sees
  // "៛ …" everywhere instead of "$ …".
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  useEffect(() => {
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, []);
  const primaryCode = currencySettings?.primaryCurrency ?? 'USD';
  const { fmt: fmtMoney, signed: signedMoney } = useMemo(
    () => makeMoneyFormatters(primaryCode), [primaryCode]);

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
      <div className="flex items-center gap-3 sm:justify-between sm:flex-wrap overflow-x-auto sm:overflow-visible print:hidden">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-gray-500" />
          <h1 className="text-2xl font-semibold">{t('nav.reports.profit_loss')}</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
        </Button>
      </div>

      {/* Headline strip — separate cards per metric, matching the
          Sale Ledger totals-strip pattern (which mirrors Payroll
          Report's StatCard). Colored icon + big number on top,
          muted label below with a supporting detail hint. */}
      {report && (
        <div className="grid gap-3 sm:grid-cols-3 grid-cols-2 print:grid-cols-3">
          <StatCard
            icon={TrendingUp}
            tone="green"
            label="Total Income"
            hint="Invoices & adjustments"
            value={fmtMoney(report.totalIncome)}
          />
          <StatCard
            icon={TrendingDown}
            tone="red"
            label="Total Expense"
            hint={
              <>
                Bills <span className="tabular-nums">{fmtMoney(report.totalBillExpense)}</span>
                {' · '}Receipts <span className="tabular-nums">{fmtMoney(report.totalReceiptExpense)}</span>
              </>
            }
            value={fmtMoney(report.totalExpense)}
          />
          <StatCard
            icon={Wallet}
            tone={report.netProfit >= 0 ? 'green' : 'red'}
            label="Net Profit"
            hint={report.netProfit >= 0 ? 'Income exceeds expense' : 'Expense exceeds income'}
            value={signedMoney(report.netProfit)}
          />
        </div>
      )}

      {report && report.monthly.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No activity in this period.
          </CardContent>
        </Card>
      )}

      {/* Monthly breakdown — table + bar chart. Filter bar sits
          inline with the CardTitle, same "controls on the header
          row" convention as the Sale Ledger's tabs + filter. */}
      {report && report.monthly.length > 0 && (
        <Card className="print:shadow-none print:border-0">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3 flex-wrap justify-between">
              <CardTitle className="text-base">Monthly Breakdown</CardTitle>
              <div className="flex flex-wrap items-center gap-2 print:hidden">
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
                <Button size="sm" onClick={load} disabled={loading} className="h-8">
                  {loading ? 'Loading…' : 'Apply'}
                </Button>
              </div>
            </div>
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
                      <TableCell className="text-right tabular-nums text-sm text-emerald-700">{fmtMoney(m.income)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-rose-700">{fmtMoney(m.expense)}</TableCell>
                      <TableCell className={`text-right tabular-nums text-sm font-medium ${netClass(m.net)}`}>
                        {signedMoney(m.net)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-gray-50 font-medium">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{fmtMoney(report.totalIncome)}</TableCell>
                  <TableCell className="text-right tabular-nums text-rose-700">{fmtMoney(report.totalExpense)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${netClass(report.netProfit)}`}>
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
              <ProfitLossLineTable
                lines={report.incomeLines}
                sideLabel="Customer"
                side="income"
                signedMoney={signedMoney}
                onOpenDoc={onNavigate ? (line) => openDocDetail(line, 'income', onNavigate) : undefined}
              />
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
              <ProfitLossLineTable
                lines={report.expenseLines}
                sideLabel="Vendor"
                side="expense"
                signedMoney={signedMoney}
                onOpenDoc={onNavigate ? (line) => openDocDetail(line, 'expense', onNavigate) : undefined}
              />
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

/** Stash a "open this doc when you land" intent, then flip the sidebar
 *  to the matching view. Invoices / Bills / Receipts read this on mount
 *  and open the detail dialog with the captured id. sessionStorage —
 *  not localStorage — so a refresh doesn't leave a stale intent. */
function openDocDetail(
  line: plApi.ProfitLossLine,
  side: 'income' | 'expense',
  onNavigate: (view: string) => void,
) {
  const source = sourceForLine(line, side);
  try {
    sessionStorage.setItem(
      PL_NAV_INTENT_KEY,
      JSON.stringify({ source, id: line.id }),
    );
  } catch { /* private-mode → intent silently skipped, nav still happens */ }
  const targetView = source === 'invoice' ? 'invoices'
                   : source === 'bill'    ? 'bills'
                   : 'receipts';
  onNavigate(targetView);
}

/** Detail table used by both Income and Expense sections — same shape
 *  (id, date, docNo, docType, party, amount), just different label on
 *  the party column. Extracted so the two collapsible cards don't drift.
 *  When {@code onOpenDoc} is provided, every row becomes clickable and
 *  navigates to the source document's page + auto-opens its detail
 *  dialog. */
function ProfitLossLineTable({ lines, sideLabel, side, signedMoney, onOpenDoc }: {
  lines: plApi.ProfitLossLine[];
  sideLabel: string;
  // Kept on the prop signature for potential future per-side styling
  // (e.g. positive-only formatter). Unused inside the table for now.
  side: 'income' | 'expense';
  /** Threaded from the parent so the tenant-primary currency formatter
   *  is shared with the summary cards — no double-init and the money
   *  reads identically everywhere on the page. */
  signedMoney: (n: number) => string;
  onOpenDoc?: (line: plApi.ProfitLossLine) => void;
}) {
  void side;
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
          <TableRow
            key={l.id}
            className={`hover:bg-gray-50 ${onOpenDoc ? 'cursor-pointer print:cursor-default' : ''}`}
            onClick={onOpenDoc ? () => onOpenDoc(l) : undefined}
            title={onOpenDoc ? `Open ${l.docNo}` : undefined}
          >
            <TableCell className="text-sm">{l.date}</TableCell>
            <TableCell className={`tabular-nums text-sm ${onOpenDoc ? 'text-blue-700 underline-offset-2 hover:underline' : ''}`}>
              {l.docNo}
            </TableCell>
            <TableCell className="text-sm">{l.docType}</TableCell>
            <TableCell>{l.partyName}</TableCell>
            <TableCell className={`text-right tabular-nums text-sm ${l.amount < 0 ? 'text-rose-600' : ''}`}>
              {signedMoney(l.amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Read + clear the P&L nav-intent, returning the doc id if it matches
 *  the given source page (invoice / bill / receipt). Called from
 *  Invoices / Bills / Receipts on mount so clicking a P&L row opens
 *  the doc's detail dialog on the target page. Returns null when
 *  there's no intent or it targets a different source. */
export function consumeProfitLossNavIntent(source: PlLineSource): string | null {
  try {
    const raw = sessionStorage.getItem(PL_NAV_INTENT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PL_NAV_INTENT_KEY);
    const parsed = JSON.parse(raw) as { source?: string; id?: string };
    if (parsed.source !== source || !parsed.id) return null;
    return parsed.id;
  } catch {
    return null;
  }
}

// StatCard is imported from common/StatCard — single source of truth
// shared with Reports.tsx and LedgerReport.tsx.
