import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { CheckSquare, Loader2, Plus, RefreshCw, Search, User2, Calendar, ChevronDown } from 'lucide-react';
import * as tasksApi from '../../../api/agencyTasks';
import type { TaskDto, TaskPriority, TaskStatus } from '../../../api/agencyTasks';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import { useAuth } from '../../../context/AuthContext';
import { TaskDialog } from './TaskDialog';
import { PageTitleTooltip } from './PageTitleTooltip';
import { DateRangeFilter, inRange } from '../../common/DateRangeFilter';
import { TableRowsSkeleton } from '../../common/LoadingSkeletons';

type Tab = 'all' | 'todo' | 'in_progress' | 'blocked' | 'done';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'all',         label: 'All' },
  { key: 'todo',        label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'blocked',     label: 'Blocked' },
  { key: 'done',        label: 'Done' },
];

const STATUS_CLS: Record<TaskStatus, string> = {
  todo:        'bg-slate-100 text-slate-700 border-slate-200',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  blocked:     'bg-rose-100 text-rose-700 border-rose-200',
  done:        'bg-emerald-100 text-emerald-700 border-emerald-200',
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
  const [tab, setTab] = useState<Tab>('todo');
  const [scope, setScope] = useState<'portfolio' | 'client' | 'mine'>('portfolio');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo,   setDateTo]   = useState<string | null>(null);
  const [editRow, setEditRow] = useState<TaskDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const opts: Parameters<typeof tasksApi.tasks.list>[0] = {};
      if (scope === 'client' && activeClientId) opts.clientTenantId = activeClientId;
      if (scope === 'mine' && currentUser?.id)  opts.assigneeId     = currentUser.id;
      const list = await tasksApi.tasks.list(opts);
      setRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load tasks');
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-blue-600" />
            Tasks
            <PageTitleTooltip label="About Tasks">
              Internal to-dos for the agency. Optionally scope a task to one
              client, or leave portfolio-wide. Cycle status inline from the
              row's pill; click a row to edit.
            </PageTitleTooltip>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1.5" />
            New task
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={tab} onValueChange={v => setTab(v as Tab)}>
              <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TABS.map(t => (
                  <SelectItem key={t.key} value={t.key}>
                    <div className="flex items-center gap-2">
                      {t.key === 'all' ? (
                        <span className="text-sm">{t.label}</span>
                      ) : (
                        <Badge className={`border text-[10px] px-1.5 py-0 ${STATUS_CLS[t.key as TaskStatus]}`}>
                          {t.label}
                        </Badge>
                      )}
                      <span className="text-[10px] text-gray-500">({counts[t.key]})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {/* v-date-range-filter — filter tasks by due-date range.
                  Tasks without a due date drop out when a range is
                  set (nothing to compare against). */}
              <DateRangeFilter
                enablePresets
                defaultStartDate={dateFrom ?? ''}
                defaultEndDate={dateTo ?? ''}
                onFilterChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
              />
              <Select value={scope} onValueChange={v => setScope(v as typeof scope)}>
                <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="portfolio">All portfolio</SelectItem>
                  <SelectItem value="client" disabled={!activeClientId}>
                    Just this client{activeClient ? '' : ' (pick first)'}
                  </SelectItem>
                  <SelectItem value="mine">My tasks</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="pl-8 h-9 w-52 text-sm"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <TableRowsSkeleton rows={6} columns={6} />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              No tasks match this filter. {scope === 'mine' && 'Try switching to All portfolio.'}
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map(t => {
                const overdue = t.dueDate && t.status !== 'done'
                  && new Date(t.dueDate).getTime() < Date.now() - 86_400_000;
                return (
                  <li key={t.id} className="py-3 px-1 hover:bg-gray-50 flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => cycleStatus(t)}
                      className="mt-0.5 shrink-0"
                      title="Click to cycle status"
                    >
                      <Badge className={`border ${STATUS_CLS[t.status]} text-[10px] px-1.5 py-0 flex items-center gap-1`}>
                        {t.status.replace('_', ' ')}
                        <ChevronDown className="h-2.5 w-2.5" />
                      </Badge>
                    </button>
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
                            Due {t.dueDate}{overdue ? ' — overdue' : ''}
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
          )}
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
