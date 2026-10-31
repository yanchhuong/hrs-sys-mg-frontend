import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../../ui/card';
import { Button, PlainButton } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Label } from '../../ui/label';
import { format } from 'date-fns';
import { Plus, RefreshCw, Search, User2, Calendar, ChevronDown } from 'lucide-react';
import * as tasksApi from '../../../api/agencyTasks';
import type { TaskDto, TaskPriority, TaskStatus } from '../../../api/agencyTasks';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import { useAuth } from '../../../context/AuthContext';
import { TaskDialog } from './TaskDialog';
import { PageTitleTooltip } from './PageTitleTooltip';
import { inRange } from '../../common/DateRangeFilter';
import { DateInput } from '../../common/DateInput';
import { TableRowsSkeleton } from '../../common/LoadingSkeletons';
import { ListEmpty, ListError } from '../../common/ListStates';
import { Pagination } from '../../common/Pagination';
import { usePagination } from '../../../hooks/usePagination';
import { statusBadgeClass } from '../../../utils/statusTones';
import { useDateFormat } from '../../../context/DateFormatContext';

type Tab = 'all' | 'todo' | 'in_progress' | 'blocked' | 'done';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'all',         label: 'All' },
  { key: 'todo',        label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'blocked',     label: 'Blocked' },
  { key: 'done',        label: 'Done' },
];

// App-wide palette (utils/statusTones): not started = slate,
// in progress = blue, blocked = red, done = green.
const STATUS_CLS: Record<TaskStatus, string> = {
  todo:        statusBadgeClass('draft'),
  in_progress: statusBadgeClass('in_progress'),
  blocked:     statusBadgeClass('failed'),
  done:        statusBadgeClass('done'),
};

const PRIORITY_CLS: Record<TaskPriority, string> = {
  low:    'bg-slate-50 text-slate-700 border-slate-200',
  normal: 'bg-gray-100 text-gray-700 border-gray-200',
  high:   'bg-orange-100 text-orange-700 border-orange-200',
  urgent: 'bg-rose-100 text-rose-700 border-rose-200',
};

/**
 * v-agency-fe-6 — agency task list. Filters by status tab +
 * scope toggle (All portfolio / Just this client / My tasks).
 * Click a row → edit dialog; status quick-cycle from the row's
 * status pill.
 */
export function AgencyTasksPage() {
  const { currentUser } = useAuth();
  const { activeClient, activeClientId } = useAgencyClient();
  const [rows, setRows] = useState<TaskDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { formatDate } = useDateFormat();
  const [tab, setTab] = useState<Tab>('todo');
  const [scope, setScope] = useState<'portfolio' | 'client' | 'mine'>('portfolio');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo,   setDateTo]   = useState<string | null>(null);
  const [editRow, setEditRow] = useState<TaskDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const opts: Parameters<typeof tasksApi.tasks.list>[0] = {};
      if (scope === 'client' && activeClientId) opts.clientTenantId = activeClientId;
      if (scope === 'mine' && currentUser?.id)  opts.assigneeId     = currentUser.id;
      const list = await tasksApi.tasks.list(opts);
      setRows(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [scope, activeClientId, currentUser?.id]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(t => {
      if (tab !== 'all' && t.status !== tab) return false;
      // Due-date range filter — treats null due dates as excluded
      // when a range is set (they have no due date to fall inside).
      if ((dateFrom || dateTo) && !inRange(t.dueDate, dateFrom, dateTo)) return false;
      if (q && !t.title.toLowerCase().includes(q)
           && !(t.tenantName ?? '').toLowerCase().includes(q)
           && !(t.description ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, search, dateFrom, dateTo]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: rows.length, todo: 0, in_progress: 0, blocked: 0, done: 0 };
    for (const r of rows) c[r.status as Tab] += 1;
    return c;
  }, [rows]);

  // Defaults: "To do" over the whole portfolio. Clear returns there.
  const hasFilters = !!(search.trim() || tab !== 'todo' || scope !== 'portfolio' || dateFrom || dateTo);
  const clearFilters = () => {
    setSearch(''); setTab('todo'); setScope('portfolio'); setDateFrom(null); setDateTo(null);
  };
  const pager = usePagination(filtered, 25);
  useEffect(() => {
    pager.goToPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tab, scope, dateFrom, dateTo]);
  // Local "today" (not UTC) so a task due today isn't flagged overdue.
  const today = format(new Date(), 'yyyy-MM-dd');

  const cycleStatus = async (task: TaskDto) => {
    const next: TaskStatus =
      task.status === 'todo' ? 'in_progress'
      : task.status === 'in_progress' ? 'done'
      : task.status === 'blocked' ? 'in_progress'
      : 'todo';
    try {
      await tasksApi.tasks.setStatus(task.id, next);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Status change failed');
    }
  };

  const openNew = () => { setEditRow(null); setDialogOpen(true); };
  const openEdit = (t: TaskDto) => { setEditRow(t); setDialogOpen(true); };

  return (
    <div className="space-y-4">
      <div className="page-header-strip">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          Tasks
          <PageTitleTooltip label="About Tasks">
            Internal to-dos for the agency. Optionally scope a task to one
            client, or leave portfolio-wide. Cycle status inline from the
            row's pill; click a row to edit.
          </PageTitleTooltip>
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1.5" />
            New task
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="filter-strip">
            <div className="relative shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search title / client / notes…"
                className="h-9 pl-7 w-64 text-sm"
              />
            </div>
            <select
              value={tab}
              onChange={e => setTab(e.target.value as Tab)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Filter by status"
            >
              {TABS.map(t => (
                <option key={t.key} value={t.key}>Status : {t.label} ({counts[t.key]})</option>
              ))}
            </select>
            <select
              value={scope}
              onChange={e => setScope(e.target.value as typeof scope)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Filter by scope"
            >
              <option value="portfolio">Scope : All portfolio</option>
              <option value="client" disabled={!activeClientId}>
                Scope : Just this client{activeClient ? '' : ' (pick first)'}
              </option>
              <option value="mine">Scope : My tasks</option>
            </select>
            {/* Due-date range. Tasks without a due date drop out when a
                range is set (nothing to compare against). */}
            <Label className="text-xs text-gray-500 shrink-0">From</Label>
            <div className="shrink-0"><DateInput value={dateFrom} onChange={setDateFrom} max={dateTo || undefined} /></div>
            <Label className="text-xs text-gray-500 shrink-0">To</Label>
            <div className="shrink-0"><DateInput value={dateTo} onChange={setDateTo} min={dateFrom || undefined} /></div>
            {hasFilters && (
              <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <TableRowsSkeleton rows={6} columns={6} />
          ) : loadError && rows.length === 0 ? (
            <ListError message={loadError} onRetry={() => void load()} />
          ) : filtered.length === 0 ? (
            <ListEmpty noun="tasks" filtered={hasFilters}>
              {scope === 'mine' && <p className="text-xs text-gray-400 mt-1">Try switching to All portfolio.</p>}
            </ListEmpty>
          ) : (<>
            <ul className="divide-y">
              {pager.paginatedItems.map(t => {
                const overdue = !!t.dueDate && t.status !== 'done' && t.dueDate.slice(0, 10) < today;
                return (
                  <li key={t.id} className="py-3 px-1 hover:bg-gray-50 cursor-pointer flex items-start gap-3">
                    <PlainButton
                      type="button"
                      onClick={() => cycleStatus(t)}
                      className="mt-0.5 shrink-0"
                      title="Click to cycle status"
                    >
                      <Badge variant="outline" className={`${STATUS_CLS[t.status]} text-[10px] px-1.5 py-0 flex items-center gap-1`}>
                        {t.status.replace('_', ' ')}
                        <ChevronDown className="h-2.5 w-2.5" />
                      </Badge>
                    </PlainButton>
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${t.status === 'done' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                          {t.title}
                        </span>
                        <Badge className={`border ${PRIORITY_CLS[t.priority]} text-[10px] px-1.5 py-0`}>
                          {t.priority}
                        </Badge>
                        {t.tenantName && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {t.tenantName}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-3">
                        {t.dueDate && (
                          <span className={`inline-flex items-center gap-1 ${overdue ? 'text-rose-700 font-medium' : ''}`}>
                            <Calendar className="h-3 w-3" />
                            Due {formatDate(t.dueDate)}{overdue ? ' — overdue' : ''}
                          </span>
                        )}
                        {t.assigneeName && (
                          <span className="inline-flex items-center gap-1">
                            <User2 className="h-3 w-3" />
                            {t.assigneeName}
                          </span>
                        )}
                        {!t.assigneeName && (
                          <span className="text-gray-400 italic">Unassigned</span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <Pagination
              currentPage={pager.currentPage}
              totalPages={pager.totalPages}
              onPageChange={pager.goToPage}
              startIndex={pager.startIndex}
              endIndex={pager.endIndex}
              totalItems={pager.totalItems}
            />
          </>)}
        </CardContent>
      </Card>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editRow}
        defaultTenantId={scope === 'client' ? activeClientId : null}
        onSaved={() => void load()}
      />
    </div>
  );
}
