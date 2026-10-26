import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  ListTable,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Eye, RefreshCw, Plus, Download, Search } from 'lucide-react';
import { Input } from '../ui/input';
import { exportListToExcel } from '../../utils/excelExport';
import * as sessionsApi from '../../api/sessions';
import { SessionDetailDialog } from '../common/SessionDetailDialog';
import { AddSessionDialog } from '../common/AddSessionDialog';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { useDateFormat } from '../../context/DateFormatContext';
import { DateInput } from '../common/DateInput';
import { TableRowsSkeleton } from '../common/LoadingSkeletons';
import { ListEmpty, ListError } from '../common/ListStates';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { statusBadgeClass } from '../../utils/statusTones';
import { format } from 'date-fns';

/**
 * V215 / v-attendance-module — the teacher's daily workspace.
 *
 * <p>Three tab modes with implicit date ranges:</p>
 * <ul>
 *   <li><b>Today</b> — from + to = today.</li>
 *   <li><b>Upcoming</b> — from = tomorrow, to = +30 days.</li>
 *   <li><b>History</b> — from = today − 30, to = yesterday (user
 *       can widen via the From/To inputs).</li>
 * </ul>
 *
 * <p>Reports tab is deferred; a placeholder pane surfaces the
 * intended reports so operators know they're coming.</p>
 */
type Tab = 'today' | 'upcoming' | 'history' | 'reports';

// Shared status palette — upcoming reads as "scheduled" (blue), cancelled
// is slate like every other cancelled record.
const STATUS_CLS: Record<sessionsApi.SessionStatus, string> = {
  upcoming:    statusBadgeClass('scheduled'),
  in_progress: statusBadgeClass('in_progress'),
  completed:   statusBadgeClass('completed'),
  cancelled:   statusBadgeClass('cancelled'),
};

const STATUS_LABEL: Record<sessionsApi.SessionStatus, string> = {
  upcoming: 'Upcoming', in_progress: 'In Progress',
  completed: 'Completed', cancelled: 'Cancelled',
};

// Local calendar date — toISOString() is UTC and returned yesterday for
// anyone east of UTC before their offset hour (07:00 in Cambodia).
const isoDate = (d: Date) => format(d, 'yyyy-MM-dd');

function defaultRangeFor(tab: Tab): { from: string; to: string } {
  const today = new Date();
  const in30 = new Date(today);
  in30.setDate(today.getDate() + 30);
  const past30 = new Date(today);
  past30.setDate(today.getDate() - 30);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  switch (tab) {
    case 'today':    return { from: isoDate(today), to: isoDate(today) };
    case 'upcoming': return { from: isoDate(tomorrow), to: isoDate(in30) };
    case 'history':  return { from: isoDate(past30), to: isoDate(yesterday) };
    default:         return { from: isoDate(today), to: isoDate(today) };
  }
}

export function Attendances() {
  const { formatDate } = useDateFormat();
  const [tab, setTab] = useState<Tab>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<sessionsApi.Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // When the tab changes, seed the date range to its default. The
  // operator can then narrow / widen without losing tab context.
  useEffect(() => {
    if (tab === 'reports') return;
    const r = defaultRangeFor(tab);
    setFrom(r.from);
    setTo(r.to);
  }, [tab]);

  const load = async () => {
    if (tab === 'reports') return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await sessionsApi.list({ from, to });
      setRows(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load sessions';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (from && to) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  // Paginate the flat session list first, then re-group by date so
  // date headers only appear for the slice on the current page.
  // 25/page matches the Students + Enrollments cadence for
  // cross-page consistency.
  const visibleRows = useMemo(() => {
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return rows;
    return rows.filter(s => {
      const hay = [s.courseName, s.classroomName, s.teacherName, s.topic, s.createdByName]
        .filter(Boolean).join(' ').toLowerCase();
      return tokens.every(tok => hay.includes(tok));
    });
  }, [rows, search]);
  const pagination = usePagination(visibleRows, 25);
  // Clear resets the search and puts the dates back to the tab's default
  // window (an empty range would load nothing).
  const tabDefault = tab === 'reports' ? null : defaultRangeFor(tab);
  const filtersSet = !!search || (!!tabDefault && (from !== tabDefault.from || to !== tabDefault.to));

  const grouped = useMemo(() => {
    const byDate = new Map<string, sessionsApi.Session[]>();
    for (const s of pagination.paginatedItems) {
      if (!byDate.has(s.sessionDate)) byDate.set(s.sessionDate, []);
      byDate.get(s.sessionDate)!.push(s);
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [pagination.paginatedItems]);

  // The session list renders one <Table> per day-group, so the header
  // row is repeated. Kept in a single constant here so the empty-state
  // table (which must still show the columns) and the per-day tables
  // can never drift apart. 8 columns — colSpan on the empty row below
  // must match.
  const sessionTableHeader = (
    <TableHeader>
      <TableRow>
        <TableHead className="w-[130px]">Time</TableHead>
        <TableHead>Course</TableHead>
        <TableHead className="w-[140px]">Classroom</TableHead>
        <TableHead className="w-[140px]">Teacher</TableHead>
        <TableHead className="w-[110px] text-right">Attendance</TableHead>
        <TableHead className="w-[130px]">Status</TableHead>
        <TableHead className="w-[130px]">Registror</TableHead>
        <TableHead className="w-[70px] text-right">Action</TableHead>
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="space-y-4">
      <div className="page-header-strip">
        <h1 className="text-3xl font-bold">Attendance</h1>
        {tab !== 'reports' && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportListToExcel({
                filename: `Attendance-${tab}`,
                sheetName: 'Sessions',
                columns: [
                  { header: 'Date',       value: s => s.sessionDate },
                  { header: 'From',       value: s => s.fromTime.slice(0, 5) },
                  { header: 'To',         value: s => s.toTime.slice(0, 5) },
                  { header: 'Course',     value: s => s.courseName ?? '' },
                  { header: 'Classroom',  value: s => s.classroomName ?? '' },
                  { header: 'Teacher',    value: s => s.teacherName ?? '' },
                  { header: 'Topic',      value: s => s.topic ?? '' },
                  { header: 'Marked',     value: s => Number(s.markedCount ?? 0) },
                  { header: 'Roster',     value: s => Number(s.rosterSize ?? 0) },
                  { header: 'Status',     value: s => s.status },
                ],
                rows: visibleRows,
              })}
              disabled={visibleRows.length === 0}
              title={visibleRows.length === 0 ? 'Nothing to export' : 'Download the visible sessions as Excel'}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Session
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto hover-scroll-x">
        <Tabs value={tab} onValueChange={v => setTab(v as Tab)}>
          <TabsList className="w-max">
            {(['today', 'upcoming', 'history', 'reports'] as const).map(t => (
              <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {tab === 'reports' ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-gray-500 space-y-2">
            <div>Attendance reports are coming in a follow-up phase.</div>
            <div className="text-xs">
              Planned: by Student · by Classroom · by Course · by Teacher · by Date Range.
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="filter-strip">
              <div className="relative w-64 shrink-0">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search course, classroom, teacher…"
                  className="h-9 pl-7"
                />
              </div>
              <Label className="text-xs text-gray-500 shrink-0">From</Label>
              <div className="shrink-0">
                <DateInput
                  value={from || null}
                  onChange={(v) => setFrom(v ?? '')}
                  max={to || undefined}
                />
              </div>
              <Label className="text-xs text-gray-500 shrink-0">To</Label>
              <div className="shrink-0">
                <DateInput
                  value={to || null}
                  onChange={(v) => setTo(v ?? '')}
                  min={from || undefined}
                />
              </div>
              {filtersSet && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 shrink-0"
                  onClick={() => {
                    setSearch('');
                    if (tabDefault) { setFrom(tabDefault.from); setTo(tabDefault.to); }
                  }}
                >
                  Clear
                </Button>
              )}
              <div className="ml-auto text-xs text-gray-500 tabular-nums shrink-0">
                {visibleRows.length} sessions
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading && rows.length === 0 ? (
              <TableRowsSkeleton rows={8} columns={6} />
            ) : loadError && rows.length === 0 ? (
              <ListTable>
                {sessionTableHeader}
                <TableBody>
                  <ListError message={loadError} onRetry={() => void load()} colSpan={8} />
                </TableBody>
              </ListTable>
            ) : visibleRows.length === 0 ? (
              /* Empty state lives inside a table so the column headers
                 stay visible, same as the other list pages. */
              <ListTable>
                {sessionTableHeader}
                <TableBody>
                  <ListEmpty noun="sessions" filtered={filtersSet} colSpan={8}>
                    {!filtersSet && (
                      <p className="mt-1 text-xs text-gray-400">
                        Add a Course Schedule with learn times overlapping this window.
                      </p>
                    )}
                  </ListEmpty>
                </TableBody>
              </ListTable>
            ) : (
              /* One box around every day-group rather than one per
                 group: the shell's sticky rule reaches each day's
                 header, so as you scroll, the current day stays
                 pinned and the next pushes it up. N bordered boxes
                 each with their own pinned header would not. */
              <div className="list-table space-y-4">
                {grouped.map(([date, dayRows]) => (
                  <div key={date}>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      {formatDate(date)}
                    </div>
                    <Table>
                      {sessionTableHeader}
                      <TableBody>
                        {dayRows.map(s => (
                          <TableRow key={s.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpenId(s.id)}>
                            <TableCell className="tabular-nums text-sm">
                              {s.fromTime.slice(0, 5)}–{s.toTime.slice(0, 5)}
                            </TableCell>
                            <TableCell className="font-medium">
                              {s.courseName ?? '—'}
                              {s.topic && (
                                <span className="text-gray-500"> · {s.topic}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">{s.classroomName ?? '—'}</TableCell>
                            <TableCell className="text-sm text-gray-600">{s.teacherName ?? '—'}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums text-gray-600">
                              {s.rosterSize > 0
                                ? `${s.markedCount} / ${s.rosterSize}`
                                : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={STATUS_CLS[s.status]}>
                                {STATUS_LABEL[s.status]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-gray-600 truncate max-w-[130px]" title={s.createdByName ?? ''}>
                              {s.createdByName ?? '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                onClick={e => { e.stopPropagation(); setOpenId(s.id); }} title="View / take attendance">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
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
      )}

      <SessionDetailDialog
        open={!!openId}
        onOpenChange={o => { if (!o) setOpenId(null); }}
        sessionId={openId}
        onSaved={() => void load()}
      />

      <AddSessionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => void load()}
      />
    </div>
  );
}
