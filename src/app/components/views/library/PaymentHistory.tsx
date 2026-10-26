/**
 * V-library-membership — Payment History list page.
 *
 * <p>Read-only view over the {@code payments} + {@code invoices} +
 * {@code customers} join, filtered to customers whose {@code kind}
 * is {@code 'member'}. No writes here — payments are captured through
 * the Sales → Invoices → Record Payment flow; this page is the
 * consolidated audit view for the Membership vertical.</p>
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Receipt, Search } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardHeader } from '../../ui/card';
import { DateInput } from '../../common/DateInput';
import { StatCard } from '../../common/StatCard';
import { TableRowsSkeleton } from '../../common/LoadingSkeletons';
import { ListEmpty, ListError } from '../../common/ListStates';
import { statusBadgeClass, TONE_CLASS } from '../../../utils/statusTones';
import { formatMoneyForCurrency } from '../../../utils/format';
import {
  ListTable, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '../../ui/table';
import * as library from '../../../api/library';
import { useDateFormat } from '../../../context/DateFormatContext';
import { usePagination } from '../../../hooks/usePagination';
import { Pagination } from '../../common/Pagination';
import { InvoiceViewDialog } from './InvoiceViewDialog';
import { DocAuditLine } from '../../common/DocAuditLine';

// v-doc-audit-line — server adds creator / last-editor names to each
// payment row. Widened locally because api/library.ts is owned elsewhere.
type PaymentAudit = { createdByName?: string | null; updatedByName?: string | null };

type RemarkFilter = 'all' | 'New Registration' | 'Renewal';

export function PaymentHistory() {
  const { formatDate } = useDateFormat();
  const [rows, setRows] = useState<library.MemberPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [remarkFilter, setRemarkFilter] = useState<RemarkFilter>('all');
  // v-library-filter-strip — inclusive From/To range on paymentDate.
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  // V-library-payment-invoice-view — pop the Invoice View dialog on
  // an Invoice-No click. Whole row is passed so the dialog can seed
  // the member name / no without a second lookup.
  const [invoicePeek, setInvoicePeek] = useState<library.MemberPayment | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try { setRows(await library.payments.list()); }
    catch (e) {
      const msg = e instanceof Error ? e.message : 'Load failed';
      setLoadError(msg);
      toast.error(msg);
    }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (remarkFilter !== 'all' && r.remark !== remarkFilter) return false;
      // v-library-filter-strip — payment-date range, inclusive.
      if (dateFrom || dateTo) {
        const d = r.paymentDate ?? '';
        if (!d) return false;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo   && d > dateTo)   return false;
      }
      if (!q) return true;
      return (
        (r.memberName ?? '').toLowerCase().includes(q)
        || (r.memberNo ?? '').toLowerCase().includes(q)
        || (r.receiptNo ?? '').toLowerCase().includes(q)
        || (r.invoiceNo ?? '').toLowerCase().includes(q)
        || (r.purpose ?? '').toLowerCase().includes(q)
        || (r.remark ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, remarkFilter, dateFrom, dateTo]);

  const pagination = usePagination(filtered, 25);

  // Per-currency totals — USD and KHR are never added into one number.
  const totalsByCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const cur = r.currency || 'USD';
      m.set(cur, (m.get(cur) ?? 0) + (Number(r.amount) || 0));
    }
    return Array.from(m.entries());
  }, [filtered]);

  const moneyLabel = (amount: number, currency: string | null | undefined) => {
    const cur = currency || 'USD';
    const amt = formatMoneyForCurrency(amount, cur);
    const sym = cur === 'USD' ? '$' : cur === 'KHR' ? '៛' : null;
    return sym ? `${sym} ${amt}` : `${amt} ${cur}`;
  };

  const totalAmountLabel = totalsByCurrency.length === 0
    ? moneyLabel(0, 'USD')
    : totalsByCurrency.map(([cur, amt]) => moneyLabel(amt, cur)).join(' · ');

  const filtersActive = !!(search.trim() || remarkFilter !== 'all' || dateFrom || dateTo);
  const clearFilters = () => { setSearch(''); setRemarkFilter('all'); setDateFrom(''); setDateTo(''); };

  const REMARK_FILTERS: Array<{ value: RemarkFilter; label: string }> = [
    { value: 'all',              label: 'Type : All' },
    { value: 'New Registration', label: 'Type : New Registration' },
    { value: 'Renewal',          label: 'Type : Renewal' },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-teal-100 text-teal-700 p-2"><Receipt className="h-5 w-5" /></div>
          <div>
            <h1 className="text-3xl font-bold">Payment History</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* v-library-payment-history-summary — hero band mirrors the
          Members page (Total Records / Total Amount) so the three
          Membership list pages share one visual rhythm. */}
      <div className="stat-strip">
        <StatCard label="Total Records" value={filtered.length.toLocaleString('en-US')} icon={Receipt} tone="blue" />
        <StatCard
          label="Total Amount"
          value={totalAmountLabel}
          hint={totalsByCurrency.length > 1 ? 'Totalled separately per currency' : undefined}
          icon={Receipt}
          tone="green"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          {/* v-library-filter-strip — Transactions-shape strip. */}
          <div className="filter-strip">
            <select
              value={remarkFilter}
              onChange={e => setRemarkFilter(e.target.value as RemarkFilter)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Filter by type"
            >
              {REMARK_FILTERS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <Label className="text-xs text-gray-500 shrink-0">From</Label>
            <div className="shrink-0"><DateInput value={dateFrom || null} onChange={v => setDateFrom(v ?? '')} max={dateTo || undefined} /></div>
            <Label className="text-xs text-gray-500 shrink-0">To</Label>
            <div className="shrink-0"><DateInput value={dateTo || null} onChange={v => setDateTo(v ?? '')} min={dateFrom || undefined} /></div>
            <div className="relative shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search member / receipt / invoice…"
                className="h-9 pl-7 w-64 text-sm"
              />
            </div>
            {filtersActive && (
              <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <TableRowsSkeleton rows={8} columns={9} />
          ) : loadError && rows.length === 0 ? (
            <ListError message={loadError} onRetry={() => void load()} />
          ) : filtered.length === 0 ? (
            <ListEmpty noun="membership payments" filtered={filtersActive && rows.length > 0} />
          ) : (
            <ListTable>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Remark</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Receipt No.</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map(r => (
                  <TableRow key={r.paymentId}>
                    <TableCell className="whitespace-nowrap">
                      {r.paymentDate ? formatDate(r.paymentDate) : '—'}
                      {/* v-doc-audit-line — creator / last editor */}
                      <DocAuditLine compact createdBy={(r as PaymentAudit).createdByName} updatedBy={(r as PaymentAudit).updatedByName} className="max-w-[180px]" />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.memberName ?? '—'}</div>
                      <div className="text-xs text-gray-500 font-mono">{r.memberNo ?? ''}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.invoiceNo && r.invoiceId ? (
                        <button
                          onClick={() => setInvoicePeek(r)}
                          className="text-blue-600 hover:text-blue-800 underline decoration-dotted underline-offset-2"
                          title="Open invoice preview"
                        >
                          {r.invoiceNo}
                        </button>
                      ) : (r.invoiceNo ?? '—')}
                    </TableCell>
                    <TableCell>
                      {r.remark === 'New Registration' ? (
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${TONE_CLASS.success}`}>
                          New Registration
                        </span>
                      ) : r.remark === 'Renewal' ? (
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${TONE_CLASS.info}`}>
                          Renewal
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="truncate max-w-[220px]">{r.purpose ?? '—'}</TableCell>
                    <TableCell className="capitalize">{r.method ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.receiptNo ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* V-library-money-symbol-prefix — "$ 560.00" */}
                      {moneyLabel(Number(r.amount) || 0, r.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${statusBadgeClass(r.invoiceStatus)}`}>
                        {r.invoiceStatus ?? '—'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ListTable>
          )}
          {pagination.totalPages > 1 && (
            <div className="px-1 py-0 border-t">
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                onPageChange={pagination.goToPage}
                startIndex={pagination.startIndex}
                endIndex={pagination.endIndex}
                totalItems={pagination.totalItems}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice View popup. */}
      <InvoiceViewDialog
        open={invoicePeek != null}
        onOpenChange={(v) => { if (!v) setInvoicePeek(null); }}
        invoiceId={invoicePeek?.invoiceId ?? null}
        memberName={invoicePeek?.memberName ?? null}
        memberNo={invoicePeek?.memberNo ?? null}
      />
    </div>
  );
}
