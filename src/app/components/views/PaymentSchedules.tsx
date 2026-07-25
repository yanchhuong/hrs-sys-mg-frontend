import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Pagination } from '../common/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { DateRangeFilter } from '../common/DateRangeFilter';
import { toast } from 'sonner';
import { Search, CalendarClock } from 'lucide-react';
import { useDateFormat } from '../../context/DateFormatContext';
import { formatMoney } from '../../utils/format';
import * as paymentPlansApi from '../../api/paymentPlans';

const SCHEDULE_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  partial: 'bg-amber-100 text-amber-800',
  paid:    'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
};

/**
 * Flat schedule view across every plan for the tenant. Filterable by
 * status + due-date range. Used to answer "what payments are coming
 * this month" without opening each plan.
 */
export function PaymentSchedules() {
  const { formatDate } = useDateFormat();
  const [rows, setRows] = useState<paymentPlansApi.PaymentSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | paymentPlansApi.ScheduleStatus>('all');
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setRows(await paymentPlansApi.searchSchedules({
        status: statusFilter === 'all' ? '' : statusFilter,
        from: dateFilter.start ?? undefined,
        to:   dateFilter.end   ?? undefined,
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, dateFilter.start, dateFilter.end]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => `${r.installmentNo}`.includes(q));
  }, [rows, search]);

  const pagination = usePagination(filtered, 25);
  useEffect(() => pagination.resetPage(), [search, statusFilter, dateFilter.start, dateFilter.end]);

  const totals = useMemo(() => ({
    due:     filtered.reduce((s, r) => s + Number(r.dueAmount ?? 0), 0),
    paid:    filtered.reduce((s, r) => s + Number(r.paidAmount ?? 0), 0),
    balance: filtered.reduce((s, r) => s + Number(r.balance ?? 0), 0),
    overdue: filtered.filter(r => r.isOverdue).length,
  }), [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold inline-flex items-center gap-2">
          <CalendarClock className="h-7 w-7 text-blue-600" />
          Payment Schedules
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Every expected installment across all active plans. Filter by status or due-date range.
        </p>
      </div>

      <div className="stat-strip stat-cols-4">
        <SummaryTile label="Rows"          value={String(filtered.length)} />
        <SummaryTile label="Due total"     value={`$${formatMoney(totals.due)}`} />
        <SummaryTile label="Paid total"    value={`$${formatMoney(totals.paid)}`}    tone="green" />
        <SummaryTile label="Overdue count" value={String(totals.overdue)}            tone={totals.overdue > 0 ? 'red' : undefined} />
      </div>

      <Card>
        {/* Filter strip — see [[feedback_filter_row_uxpattern]] +
            .filter-strip in styles/index.css. Single nowrap row that
            scrolls horizontally on narrow screens, matching Items and
            every other list page for cross-app consistency. */}
        <CardHeader className="pb-3">
          <div className="filter-strip">
            <div className="relative w-[240px] shrink-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input placeholder="Search installment #" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
            </div>
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
              <SelectTrigger className="w-40 h-9 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            <div className="shrink-0">
              <DateRangeFilter onFilterChange={setDateFilter} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (<TableRow><TableCell colSpan={6} className="text-center text-sm text-gray-400 py-10">Loading…</TableCell></TableRow>)}
              {!loading && pagination.paginatedItems.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-gray-400 py-10">No rows for these filters.</TableCell></TableRow>
              )}
              {pagination.paginatedItems.map(s => (
                <TableRow key={s.id} className={s.isOverdue ? 'bg-red-50/50' : ''}>
                  <TableCell className="font-mono text-xs">#{s.installmentNo}</TableCell>
                  <TableCell className="text-sm">{formatDate(s.dueDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">${formatMoney(s.dueAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums text-green-700">${formatMoney(s.paidAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">${formatMoney(s.balance)}</TableCell>
                  <TableCell><Badge className={SCHEDULE_BADGE[s.status] ?? ''}>{s.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            onPageChange={pagination.goToPage}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            totalItems={pagination.totalItems}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  const cls = tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-700' : 'text-gray-900';
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-gray-500">{label}</div>
        <div className={`text-xl font-bold ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
