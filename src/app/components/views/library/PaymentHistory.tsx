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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import { DateInput } from '../../common/DateInput';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '../../ui/table';
import * as library from '../../../api/library';
import { useDateFormat } from '../../../context/DateFormatContext';
import { usePagination } from '../../../hooks/usePagination';
import { Pagination } from '../../common/Pagination';
import { InvoiceViewDialog } from './InvoiceViewDialog';

type RemarkFilter = 'all' | 'New Registration' | 'Renewal';

export function PaymentHistory() {
  const { formatDate } = useDateFormat();
  const [rows, setRows] = useState<library.MemberPayment[]>([]);
  const [loading, setLoading] = useState(false);
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
    try { setRows(await library.payments.list()); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Load failed'); }
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

  const totalAmount = useMemo(
    () => filtered.reduce((acc, r) => acc + (Number(r.amount) || 0), 0),
    [filtered],
  );

  const statusVariant = (s: string | null): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (!s) return 'secondary';
    if (s === 'paid') return 'default';
    if (s === 'void' || s === 'overdue') return 'destructive';
    return 'outline';
  };

  const REMARK_FILTERS: Array<{ value: RemarkFilter; label: string }> = [
    { value: 'all',              label: 'All' },
    { value: 'New Registration', label: 'New Registration' },
    { value: 'Renewal',          label: 'Renewal' },
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border bg-white p-4 flex items-center gap-3">
          <div className="rounded-md bg-teal-100 text-teal-700 p-2"><Receipt className="h-5 w-5" /></div>
          <div>
            <div className="text-[11px] uppercase text-gray-500 tracking-wide">Total Records</div>
            <div className="text-2xl font-bold">{filtered.length.toLocaleString('en-US')}</div>
          </div>
        </div>
        <div className="rounded-lg border bg-white p-4 flex items-center gap-3">
          <div className="rounded-md bg-emerald-100 text-emerald-700 p-2"><Receipt className="h-5 w-5" /></div>
          <div>
            <div className="text-[11px] uppercase text-gray-500 tracking-wide">Total Amount</div>
            <div className="text-2xl font-bold">
              $ {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          {/* v-library-filter-strip — Invoice-shape strip. */}
          <div className="filter-strip">
            <div className="flex items-center gap-2 shrink-0">
              <Label className="text-xs text-gray-600">Type</Label>
              <Select value={remarkFilter} onValueChange={(v) => setRemarkFilter(v as RemarkFilter)}>
                <SelectTrigger className="h-8 w-44 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMARK_FILTERS.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Label className="text-xs text-gray-600">From</Label>
              <DateInput value={dateFrom || null} onChange={v => setDateFrom(v ?? '')} max={dateTo || null} className="h-8 w-36" />
              <Label className="text-xs text-gray-600">To</Label>
              <DateInput value={dateTo   || null} onChange={v => setDateTo(v   ?? '')} min={dateFrom || null} className="h-8 w-36" />
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-gray-500"
                        onClick={() => { setDateFrom(''); setDateTo(''); }}>
                  Clear
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search member / receipt / invoice…"
                  className="h-8 pl-7 w-64 text-sm"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {rows.length === 0 ? 'No membership payments yet.' : 'No matches — try clearing the filter.'}
            </p>
          ) : (
            <Table>
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
                    <TableCell className="whitespace-nowrap">{r.paymentDate ? formatDate(r.paymentDate) : '—'}</TableCell>
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
                        <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          New Registration
                        </span>
                      ) : r.remark === 'Renewal' ? (
                        <span className="inline-flex items-center rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
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
                      {(() => {
                        const amt = (Number(r.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        const sym = r.currency === 'USD' ? '$' : r.currency === 'KHR' ? '៛' : null;
                        return sym ? `${sym} ${amt}` : (r.currency ? `${amt} ${r.currency}` : amt);
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.invoiceStatus)} className="capitalize">
                        {r.invoiceStatus ?? '—'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {pagination.totalPages > 1 && (
            <div className="mt-4">
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
