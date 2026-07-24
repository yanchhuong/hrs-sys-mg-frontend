import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Eye, RefreshCw, Plus, Download } from 'lucide-react';
import { exportListToExcel } from '../../utils/excelExport';
import * as sessionsApi from '../../api/sessions';
import { SessionDetailDialog } from '../common/SessionDetailDialog';
import { AddSessionDialog } from '../common/AddSessionDialog';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { useDateFormat } from '../../context/DateFormatContext';
import { DateInput } from '../common/DateInput';
import { TableRowsSkeleton } from '../common/LoadingSkeletons';

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

const STATUS_CLS: Record<sessionsApi.SessionStatus, string> = {
  upcoming:    'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled:   'bg-rose-100 text-rose-700 border-rose-200',
};

const STATUS_LABEL: Record<sessionsApi.SessionStatus, string> = {
  upcoming: 'Upcoming', in_progress: 'In Progress',
  completed: 'Completed', cancelled: 'Cancelled',
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

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
    try {
      const data = await sessionsApi.list({ from, to });
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (from && to) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  // Paginate the flat session list first, then re-group by date so
  // date headers only appear for the slice on the current page.
  // 25/page matches the Students + Enrollments cadence for
  // cross-page consistency.
  const pagination = usePagination(rows, 25);

  const grouped = useMemo(() => {
    const byDate = new Map<string, sessionsApi.Session[]>();
    for (const s of pagination.paginatedItems) {
      if (!byDate.has(s.sessionDate)) byDate.set(s.sessionDate, []);
      byDate.get(s.sessionDate)!.push(s);
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [pagination.paginatedItems]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Attendance</h1>
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
                rows: rows,
              })}
              disabled={rows.length === 0}
              title={rows.length === 0 ? 'Nothing to export' : 'Download the visible sessions as Excel'}
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

      <div className="chip-row">
        {(['today', 'upcoming', 'history', 'reports'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors capitalize ${
              tab === t
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'border-gray-200 hover:bg-gray-50 text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
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
              <Label className="text-xs text-gray-500">From</Label>
              <DateInput
                value={from || null}
                onChange={(v) => setFrom(v ?? '')}
                max={to || undefined}
              />
              <Label className="text-xs text-gray-500">To</Label>
              <DateInput
                value={to || null}
                onChange={(v) => setTo(v ?? '')}
                min={from || undefined}
              />
              <div className="ml-auto text-xs text-gray-500 tabular-nums">
                {rows.length} sessions
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading && rows.length === 0 ? (
              <TableRowsSkeleton rows={8} columns={6} />
            ) : rows.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">
                No sessions in this range. Adjust the date filters or add a Course Schedule with
                learn times overlapping the window.
              </p>
            ) : (
              <div className="space-y-4">
                {grouped.map(([date, dayRows]) => (
                  <div key={date}>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      {formatDate(date)}
                    </div>
                    <Table>
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
                      <TableBody>
                        {dayRows.map(s => (
                          <TableRow key={s.id}>
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
                              <Badge className={`inline-flex items-center border ${STATUS_CLS[s.status]}`}>
                                {STATUS_LABEL[s.status]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-gray-600 truncate max-w-[130px]" title={s.createdByName ?? ''}>
                              {s.createdByName ?? '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => setOpenId(s.id)} title="View / take attendance">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
                <Pagination {...pagination} />
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
