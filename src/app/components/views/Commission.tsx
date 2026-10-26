import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import {
  ListTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Percent, Wallet, ReceiptText, DollarSign, Settings as SettingsIcon } from 'lucide-react';
import { StatCard } from '../common/StatCard';
import { Label } from '../ui/label';
import { DateInput } from '../common/DateInput';
import { saleLedger } from '../../api/ledgerReports';
import type { LedgerReportResponse } from '../../api/ledgerReports';
import { commission, commissionFor } from '../../api/commission';
import type { CommissionProgram } from '../../api/commission';
import { commissionSettlement } from '../../api/commissionSettlement';
import type { SettlementHeader } from '../../api/commissionSettlement';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { CommissionSettings } from './CommissionSettings';
import { CommissionSettlementView } from './CommissionSettlementView';
import { formatNumber, formatUSD } from '../../utils/format';
import * as currencyApi from '../../api/currencySettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ListError } from '../common/ListStates';
import { TableBodySkeletonRows } from '../common/LoadingSkeletons';
import { useI18n } from '../../i18n/I18nContext';
import { format as formatLocalDate } from 'date-fns';

/**
 * v-commission-settlement-mvp — Commission page shell. Two tabs:
 * "Commission" (the accrued-per-seller report) and "Settlement"
 * (create + track payout records). Same nav leaf; the tab drives
 * which sub-view renders.
 */
export function Commission() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
    <div className="page-header-strip">
      <h1 className="text-3xl font-bold">{t('nav.commission')}</h1>
    </div>
    <Tabs defaultValue="report" className="w-full">
      <TabsList>
        <TabsTrigger value="report">Commission</TabsTrigger>
        <TabsTrigger value="settlement">Settlement</TabsTrigger>
      </TabsList>
      <TabsContent value="report" className="mt-4">
        <CommissionReport />
      </TabsContent>
      <TabsContent value="settlement" className="mt-4">
        <CommissionSettlementView />
      </TabsContent>
    </Tabs>
    </div>
  );
}

/** The by-seller accrued-commission report (formerly the whole
 *  Commission page). Now the first tab under the shell above. */
function CommissionReport() {
  // Local calendar date — toISOString() is UTC and reads as
  // yesterday before 07:00 in Cambodia.
  const today = formatLocalDate(new Date(), 'yyyy-MM-dd');
  const firstOfMonth = today.slice(0, 8) + '01';
  const [from, setFrom] = useState<string>(firstOfMonth);
  const [to, setTo]   = useState<string>(today);
  const [report, setReport] = useState<LedgerReportResponse | null>(null);
  const [plans, setPlans]   = useState<CommissionProgram[]>([]);
  const [settlements, setSettlements] = useState<SettlementHeader[]>([]);
  /** Tenant currency settings — needed to fold Received / Refund
   *  KHR into USD when computing AR. Falls back to 4100 KHR/USD
   *  (server default) so the report still renders on new tenants
   *  that haven't touched the settings row. */
  const [khrPerUsd, setKhrPerUsd] = useState<number>(4100);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rep, ps, cs, st] = await Promise.all([
        saleLedger({ from, to }),
        commission.list().catch(() => [] as CommissionProgram[]),
        currencyApi.get().catch(() => null),
        // Feeds the "Settle No." column. ADMIN/MANAGER-only
        // server-side, so degrade to empty rather than failing the
        // whole report for a narrower role — the sales and commission
        // figures are still correct without it.
        commissionSettlement.list().catch(() => [] as SettlementHeader[]),
      ]);
      setReport(rep);
      setPlans(ps);
      setSettlements(st);
      // Only USD-primary tenants can convert KHR down to USD via
      // secondaryRate. On single-currency or KHR-primary setups
      // we fall back to the built-in 4100 and note the KHR
      // portion may be off — commission tenants in Cambodia are
      // ~always USD-primary so this matches reality.
      if (cs && cs.primaryCurrency === 'USD' && cs.secondaryCurrency === 'KHR' && cs.secondaryRate) {
        setKhrPerUsd(cs.secondaryRate);
      }
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load commission report');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  /**
   * sellerId → settlement numbers covering this seller within the
   * displayed range.
   *
   * Matched on period OVERLAP, not equality: a settlement run rarely
   * lines up exactly with whatever From/To the operator has typed, so
   * requiring identical dates would show "—" on rows that are in fact
   * already settled — the opposite of what this column is for.
   *
   * CANCELLED runs are excluded: they no longer claim their invoices,
   * so showing their number would imply the commission is settled
   * when it is payable again.
   */
  const settledBySeller = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of settlements) {
      if (s.status === 'CANCELLED') continue;
      if (s.periodEnd < from || s.periodStart > to) continue;   // no overlap
      const cur = m.get(s.sellerId) ?? [];
      cur.push(s.settlementNo);
      m.set(s.sellerId, cur);
    }
    return m;
  }, [settlements, from, to]);

  const sellerGroups = useMemo(() => {
    if (!report) return [];
    const acc = new Map<string, {
      sellerId: string; sellerName: string;
      invoiceCount: number;
      totalAmount: number;
      receivedUsd: number; receivedKhr: number;
      refundUsd: number;   refundKhr: number;
      totalRefund: number;
      /** AR accumulated per row using each row's OWN snapshot rate,
       *  so the total matches Sale Ledger's Closing Balance to the
       *  cent (Sale Ledger uses the same per-invoice rate for its
       *  chain math). */
      ar: number;
    }>();
    for (const g of report.groups) {
      for (const e of g.entries) {
        if (!e.sellerId) continue;
        // Skip ghost rows — pre-range invoices with in-range
        // payments (amount=0, balance!=null). See earlier commit.
        const isGhost = (e.amount ?? 0) === 0 && e.balance !== null;
        if (isGhost) continue;
        const isRoot = e.balance !== null;
        const key = e.sellerId;
        const cur = acc.get(key) ?? {
          sellerId: e.sellerId,
          sellerName: e.sellerName ?? '(unknown)',
          invoiceCount: 0,
          totalAmount: 0,
          receivedUsd: 0,
          receivedKhr: 0,
          refundUsd: 0,
          refundKhr: 0,
          totalRefund: 0,
          ar: 0,
        };
        // Per-row rate — falls back to the tenant-wide setting
        // only when the entry was created before the exchangeRate
        // column was populated (old rows). New rows always carry
        // it.
        const rowRate = (e.exchangeRate && e.exchangeRate > 0) ? e.exchangeRate : khrPerUsd;
        const rowReceivedUsdEquiv = (e.receivedUsd ?? 0) + (e.receivedKhr ?? 0) / rowRate;
        const rowRefundUsdEquiv   = (e.refundUsd ?? 0)   + (e.refundKhr ?? 0)   / rowRate;
        const rowRemaining        = (e.amount ?? 0) - rowReceivedUsdEquiv - rowRefundUsdEquiv;

        cur.invoiceCount += isRoot ? 1 : 0;
        cur.totalAmount  += e.amount ?? 0;
        cur.receivedUsd  += e.receivedUsd ?? 0;
        cur.receivedKhr  += e.receivedKhr ?? 0;
        cur.refundUsd    += e.refundUsd ?? 0;
        cur.refundKhr    += e.refundKhr ?? 0;
        cur.totalRefund  += rowRefundUsdEquiv;
        cur.ar           += rowRemaining;
        acc.set(key, cur);
      }
    }
    return Array.from(acc.values())
      .map(g => {
        // TOTAL_PAID plans need the actually-received amount in
        // USD equivalent; PER_INVOICE / PER_ITEM keep using the
        // invoiced total.  Refunds reduce the payable base too
        // — a payment that was later refunded shouldn't count
        // toward a commission plan.
        const totalPaid = Math.max(
          0,
          g.receivedUsd + g.receivedKhr / khrPerUsd - g.totalRefund,
        );
        const c = commissionFor(g.sellerId, g.totalAmount, g.invoiceCount, plans, { totalPaid });
        return { ...g, ar: Math.max(0, g.ar), commission: c.amount, planName: c.plan?.name ?? null };
      })
      .sort((a, b) => b.commission - a.commission || a.sellerName.localeCompare(b.sellerName));
  }, [report, plans, khrPerUsd]);

  const totals = useMemo(() => sellerGroups.reduce((acc, g) => ({
    invoiceCount: acc.invoiceCount + g.invoiceCount,
    totalAmount:  acc.totalAmount  + g.totalAmount,
    ar:           acc.ar           + g.ar,
    commission:   acc.commission   + g.commission,
  }), { invoiceCount: 0, totalAmount: 0, ar: 0, commission: 0 }), [sellerGroups]);

  const anyPlan = plans.some(p => p.status === 'ACTIVE' && p.rate != null && p.mode != null);

  return (
    <div className="space-y-4">
      {/* Totals strip — matches the shared StatCard pattern used by
          Sale Ledger / P&L / Purchase Ledger. */}
      <div className="stat-strip stat-cols-5">
        <StatCard label="Sellers"       value={formatNumber(sellerGroups.length)} icon={Percent}      tone="purple" />
        <StatCard label="Invoices"      value={formatNumber(totals.invoiceCount)} icon={ReceiptText}  tone="blue" />
        <StatCard label="Total Sales"   value={formatUSD(totals.totalAmount)}     icon={DollarSign}   tone="green" />
        <StatCard label="AR"            value={formatUSD(totals.ar)}              icon={Wallet}       tone="orange"
          hint="Accounts Receivable — unpaid balance across sellers in the range"
        />
        <StatCard label="Commission"    value={formatUSD(totals.commission)}      icon={Wallet}       tone="amber"
          hint={anyPlan ? null : 'No active plan with a rate — configure one in POS → Settings → Commission Plans'}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <CardTitle>By Seller</CardTitle>
            {/* Gear icon opens the same Commission Plans manager
                embedded in POS Settings — a manager viewing the
                report can adjust rates without navigating to POS. */}
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-gray-500"
              onClick={() => setSettingsOpen(true)}
              aria-label="Manage Commission Plans"
              title="Manage Commission Plans"
            >
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </div>
          {/* Date filter — matches Transactions verbatim (canonical
              style per feedback: From / To labels + DateInput, no
              calendar icon or arrow). */}
          <div className="filter-strip print:hidden">
            {/* The report reloads on every From/To change (load's deps),
                so the old Apply button was redundant. The range is
                required, so the inputs aren't clearable; Clear puts
                them back to this month. */}
            <Label className="text-xs text-gray-500">From</Label>
            <DateInput value={from} onChange={v => setFrom(v ?? firstOfMonth)} clearable={false} max={to || undefined} className="h-9 w-36 text-sm" title="From date" />
            <Label className="text-xs text-gray-500">To</Label>
            <DateInput value={to}   onChange={v => setTo(v ?? today)}   clearable={false} min={from || undefined} className="h-9 w-36 text-sm" title="To date" />
            {(from !== firstOfMonth || to !== today) && (
              <Button
                size="sm" variant="ghost" className="h-9 shrink-0"
                onClick={() => { setFrom(firstOfMonth); setTo(today); }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ListTable>
              <TableHeader>
                <TableRow>
                  <TableHead>Seller</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Received (USD)</TableHead>
                  <TableHead className="text-right">Received (KHR)</TableHead>
                  <TableHead className="text-right">Refund (−)</TableHead>
                  <TableHead className="text-right">AR</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  {/* Which settlement run already covers this seller
                      in the displayed range. Without it the operator
                      can't tell an unpaid seller from one who was
                      settled last week, and the Commission figure
                      alone reads as still-owed either way. */}
                  <TableHead>Settle No.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && sellerGroups.length === 0 && (
                  <TableBodySkeletonRows columns={9} />
                )}
                {!loading && loadError && sellerGroups.length === 0 && (
                  <ListError colSpan={9} message={loadError} onRetry={() => void load()} />
                )}
                {!loading && !loadError && sellerGroups.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={9} className="text-center text-sm text-gray-500 py-8">
                      No sale invoices in this range.
                    </TableCell>
                  </TableRow>
                )}
                {sellerGroups.map(s => (
                  <TableRow key={s.sellerId} className="hover:bg-gray-50">
                    <TableCell>
                      <div className="font-medium">{s.sellerName}</div>
                      {s.planName && (
                        <div className="text-[11px] text-gray-500">Plan: {s.planName}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(s.invoiceCount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUSD(s.totalAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.receivedUsd > 0 ? formatUSD(s.receivedUsd) : <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.receivedKhr > 0
                        ? `${formatNumber(s.receivedKhr)} ៛`
                        : <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${s.totalRefund > 0 ? 'text-red-600' : ''}`}>
                      {formatUSD(s.totalRefund)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${s.ar > 0 ? 'text-amber-700 font-medium' : ''}`}
                      title="Accounts Receivable — sum of unpaid invoice balances created by this seller">
                      {s.ar > 0 ? formatUSD(s.ar) : <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.commission > 0
                        ? <span className="font-medium text-emerald-700">{formatUSD(s.commission)}</span>
                        : <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {(() => {
                        const nos = settledBySeller.get(s.sellerId);
                        if (!nos?.length) {
                          return (
                            <span
                              className="text-gray-400"
                              title="No settlement run covers this seller in the selected range"
                            >
                              Unsettled
                            </span>
                          );
                        }
                        // More than one run can overlap a wide range —
                        // list them all rather than picking one, or the
                        // operator would chase a payout that's split
                        // across two runs.
                        return (
                          <span className="text-gray-700" title={nos.join(', ')}>
                            {nos.join(', ')}
                          </span>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ListTable>
        </CardContent>
      </Card>

      <Dialog
        open={settingsOpen}
        onOpenChange={open => {
          setSettingsOpen(open);
          // Reload the report once the settings dialog closes —
          // rate / assignment edits in there change how the
          // Commission column computes, so the numbers below
          // should refresh without the operator hitting Reload.
          if (!open) void load();
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Commission Plans</DialogTitle>
          </DialogHeader>
          <CommissionSettings />
        </DialogContent>
      </Dialog>
    </div>
  );
}
