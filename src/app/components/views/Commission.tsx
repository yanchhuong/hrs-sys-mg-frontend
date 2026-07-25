import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Percent, Wallet, ReceiptText, DollarSign, Settings as SettingsIcon } from 'lucide-react';
import { StatCard } from '../common/StatCard';
import { Label } from '../ui/label';
import { DateInput } from '../common/DateInput';
import { saleLedger } from '../../api/ledgerReports';
import type { LedgerReportResponse } from '../../api/ledgerReports';
import { commission, commissionFor } from '../../api/commission';
import type { CommissionProgram } from '../../api/commission';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { CommissionSettings } from './CommissionSettings';
import { CommissionSettlementView } from './CommissionSettlementView';
import { formatNumber, formatUSD } from '../../utils/format';
import * as currencyApi from '../../api/currencySettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

/**
 * v-commission-settlement-mvp — Commission page shell. Two tabs:
 * "Commission" (the accrued-per-seller report) and "Settlement"
 * (create + track payout records). Same nav leaf; the tab drives
 * which sub-view renders.
 */
export function Commission() {
  return (
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
  );
}

/** The by-seller accrued-commission report (formerly the whole
 *  Commission page). Now the first tab under the shell above. */
function CommissionReport() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + '01';
  const [from, setFrom] = useState<string>(firstOfMonth);
  const [to, setTo]   = useState<string>(today);
  const [report, setReport] = useState<LedgerReportResponse | null>(null);
  const [plans, setPlans]   = useState<CommissionProgram[]>([]);
  /** Tenant currency settings — needed to fold Received / Refund
   *  KHR into USD when computing AR. Falls back to 4100 KHR/USD
   *  (server default) so the report still renders on new tenants
   *  that haven't touched the settings row. */
  const [khrPerUsd, setKhrPerUsd] = useState<number>(4100);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rep, ps, cs] = await Promise.all([
        saleLedger({ from, to }),
        commission.list().catch(() => [] as CommissionProgram[]),
        currencyApi.get().catch(() => null),
      ]);
      setReport(rep);
      setPlans(ps);
      // Only USD-primary tenants can convert KHR down to USD via
      // secondaryRate. On single-currency or KHR-primary setups
      // we fall back to the built-in 4100 and note the KHR
      // portion may be off — commission tenants in Cambodia are
      // ~always USD-primary so this matches reality.
      if (cs && cs.primaryCurrency === 'USD' && cs.secondaryCurrency === 'KHR' && cs.secondaryRate) {
        setKhrPerUsd(cs.secondaryRate);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load commission report');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

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
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle>By Seller</CardTitle>
            {/* Gear icon opens the same Commission Plans manager
                embedded in POS Settings — a manager viewing the
                report can adjust rates without navigating to POS. */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="text-gray-400 hover:text-gray-700 transition"
              aria-label="Manage Commission Plans"
              title="Manage Commission Plans"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
          </div>
          {/* Date filter — matches Transactions verbatim (canonical
              style per feedback: From / To labels + DateInput, no
              calendar icon or arrow). */}
          <div className="filter-strip print:hidden">
            <Label className="text-xs text-gray-500">From</Label>
            <DateInput value={from} onChange={setFrom} className="h-9 w-36 text-sm" title="From date" />
            <Label className="text-xs text-gray-500">To</Label>
            <DateInput value={to}   onChange={setTo}   className="h-9 w-36 text-sm" title="To date" />
            <Button size="sm" onClick={load} disabled={loading} className="h-9">
              {loading ? 'Loading…' : 'Apply'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sellerGroups.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              No sale invoices in this range.
            </div>
          ) : (
            <Table>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {sellerGroups.map(s => (
                  <TableRow key={s.sellerId}>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
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
