import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, EyeOff, History, Info,
  Loader2, Plus, RefreshCw, RotateCcw, Search, Trash2, XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Progress } from '../ui/progress';
import {
  ListTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useI18n } from '../../i18n/I18nContext';
import * as api from '../../api/stockCounts';
import * as warehousesApi from '../../api/warehouses';
import * as itemsApi from '../../api/items';
import { KNOWN_ITEM_CATEGORIES } from '../../api/items';

/**
 * Stock Count (v-stock-count-phase1) — the manager's side.
 *
 * <p>Counting itself is a phone job and lives in the mobile app; this
 * page is where a count is set up, watched, reviewed and approved.
 * Same furniture as Movement and Adjustment next door: page-header-
 * strip, one Card, the shared .filter-strip, ListTable.</p>
 *
 * <p>The page is a list and a detail in one component, as the user
 * moves between them constantly while a count is running and a route
 * change would lose the filters.</p>
 */

const STATUS_TONE: Record<api.StockCountStatus, string> = {
  draft:     'bg-slate-100 text-slate-700',
  counting:  'bg-blue-100 text-blue-700',
  review:    'bg-amber-100 text-amber-700',
  approved:  'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const STATUS_LABEL: Record<api.StockCountStatus, string> = {
  draft: 'Draft', counting: 'Counting', review: 'Review',
  approved: 'Approved', cancelled: 'Cancelled',
};

const fmtQty = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : String(Number(n));

const fmtDate = (iso: string | null) =>
  !iso ? '—' : new Date(iso).toLocaleDateString('en-GB',
    { day: '2-digit', month: 'short', year: 'numeric' });

export function StockCounts() {
  const { t } = useI18n();
  const { canCreate, canDelete } = useAuth();
  // Four actions exist in this system, so approving rides on create:
  // whoever may start a count may authorise its result.
  const canManage = canCreate('stock_count');
  const canRemove = canDelete('stock_count');
  const confirm = useConfirm();

  const [rows, setRows] = useState<api.StockCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.list({ status: status === 'all' ? undefined : status, size: 200 });
      setRows(res.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load stock counts');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.countNo.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [rows, search]);

  if (openId) {
    return <CountDetail
      id={openId} canManage={canManage}
      onBack={() => { setOpenId(null); void load(); }}
    />;
  }

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            {t('nav.stock.count') || 'Stock Count'}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                        aria-label="What is Stock Count?">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Check what is physically on the shelf against what the system
                  says. Staff count on the phone; you review the differences here
                  and approve. A count changes nothing — approving posts the
                  difference as a Stock Adjustment, and that is the only step
                  that moves stock.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canManage && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> New Count
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-indigo-600" />
            Counts
          </CardTitle>
          <div className="filter-strip">
            <div className="relative shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="Search no, name…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 pl-7 w-64 text-sm" aria-label="Search stock counts"
              />
            </div>
            <select
              value={status} onChange={e => setStatus(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs
                         focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Filter by status"
            >
              <option value="all">Status : All</option>
              {(Object.keys(STATUS_LABEL) as api.StockCountStatus[]).map(s => (
                <option key={s} value={s}>Status : {STATUS_LABEL[s]}</option>
              ))}
            </select>
            {(search || status !== 'all') && (
              <Button size="sm" variant="ghost" className="h-9 shrink-0"
                      onClick={() => { setSearch(''); setStatus('all'); }}>
                Clear
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <ListTable>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px]">No</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[110px]">Type</TableHead>
                <TableHead className="w-[120px]">Date</TableHead>
                <TableHead className="w-[180px]">Progress</TableHead>
                <TableHead className="text-center w-[110px]">Status</TableHead>
                {canRemove && <TableHead className="text-right w-[70px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </TableCell></TableRow>
              ) : shown.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-gray-500">
                  {rows.length === 0 ? 'No stock counts yet.' : 'No counts match your filter.'}
                </TableCell></TableRow>
              ) : shown.map(r => (
                <TableRow key={r.id} className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => setOpenId(r.id)}>
                  <TableCell className="font-mono text-xs">{r.countNo}</TableCell>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      {r.name}
                      {r.blind && (
                        <EyeOff className="h-3.5 w-3.5 text-gray-400" aria-label="Blind count" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs capitalize">{r.countType}</TableCell>
                  <TableCell className="text-xs">{fmtDate(r.countDate)}</TableCell>
                  <TableCell><ProgressCell row={r} /></TableCell>
                  <TableCell className="text-center">
                    <Badge className={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </TableCell>
                  {canRemove && (
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      {r.status === 'draft' && (
                        <Button size="icon" variant="ghost" title="Delete draft"
                                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={async () => {
                                  if (!(await confirm({
                                    title: `Delete ${r.countNo}?`,
                                    message: 'This draft has not been started, so nothing is lost.',
                                    variant: 'destructive', confirmLabel: 'Delete',
                                  }))) return;
                                  try { await api.remove(r.id); toast.success('Draft deleted'); void load(); }
                                  catch (e) { toast.error(e instanceof Error ? e.message : 'Delete failed'); }
                                }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </ListTable>
        </CardContent>
      </Card>

      {formOpen && (
        <NewCountDialog
          onClose={() => setFormOpen(false)}
          onCreated={id => { setFormOpen(false); void load(); setOpenId(id); }}
        />
      )}
    </div>
  );
}

function ProgressCell({ row }: { row: api.StockCount }) {
  if (row.totalLines === 0) {
    return <span className="text-xs text-gray-400">Not started</span>;
  }
  const pct = Math.round((row.countedLines / row.totalLines) * 100);
  return (
    <div className="flex items-center gap-2">
      <Progress value={pct} className="h-1.5 w-24" />
      <span className="text-xs tabular-nums text-gray-600">
        {row.countedLines} / {row.totalLines}
      </span>
    </div>
  );
}

/* ============================= detail ============================= */

function CountDetail(
  { id, canManage, onBack }: { id: string; canManage: boolean; onBack: () => void },
) {
  const confirm = useConfirm();
  const [count, setCount] = useState<api.StockCount | null>(null);
  const [lines, setLines] = useState<api.StockCountLine[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, l] = await Promise.all([api.get(id), api.lines(id, filter === 'all' ? undefined : filter)]);
      setCount(c); setLines(l);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load the count');
    } finally {
      setLoading(false);
    }
  }, [id, filter]);

  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'That did not work'); }
    finally { setBusy(false); }
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter(l =>
      l.itemName.toLowerCase().includes(q) || (l.sku ?? '').toLowerCase().includes(q));
  }, [lines, search]);

  // `!= null`, not `!== null`: the API omits null fields (Jackson
  // non_null), so an uncounted line's variance arrives as undefined.
  const variances = lines.filter(l => l.variance != null && l.variance !== 0);
  const shortages = variances.filter(l => (l.variance ?? 0) < 0).length;
  const surpluses = variances.filter(l => (l.variance ?? 0) > 0).length;

  if (loading || !count) {
    return <div className="py-20 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 text-gray-500" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> All counts
          </Button>
          <h1 className="text-2xl font-bold flex flex-wrap items-center gap-2">
            <span className="font-mono text-base text-gray-500">{count.countNo}</span>
            {count.name}
            <Badge className={STATUS_TONE[count.status]}>{STATUS_LABEL[count.status]}</Badge>
            {count.blind && (
              <Badge variant="outline" className="gap-1 text-gray-500">
                <EyeOff className="h-3 w-3" /> Blind
              </Badge>
            )}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {count.countType} · {fmtDate(count.countDate)}
            {count.snapshotAt && <> · started {new Date(count.snapshotAt).toLocaleString('en-GB')}</>}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canManage && count.status === 'draft' && (
            <Button
              disabled={busy}
              onClick={() => {
                // A spot count IS its item list, so there is nothing to
                // start until someone picks one. Full and cycle counts
                // resolve their own scope and start straight away.
                if (count.countType === 'spot') { setPicking(true); return; }
                void run(() => api.start(id), 'Count started');
              }}>
              {count.countType === 'spot' ? 'Pick items & start' : 'Start count'}
            </Button>
          )}
          {canManage && count.status === 'review' && (
            <Button
              disabled={busy}
              onClick={async () => {
                if (!(await confirm({
                  title: `Approve ${count.countNo}?`,
                  message: variances.length === 0
                    ? 'Everything matched, so no adjustments will be posted.'
                    : `${shortages} shortage(s) and ${surplus_s(surpluses)} will be posted as `
                      + `${variances.length} stock adjustment(s). This is the step that changes stock.`,
                  confirmLabel: 'Approve',
                }))) return;
                void run(() => api.approve(id), 'Approved — adjustments posted');
              }}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve
            </Button>
          )}
          {canManage && count.status !== 'approved' && count.status !== 'cancelled' && (
            <Button variant="outline" disabled={busy}
              onClick={async () => {
                if (!(await confirm({
                  title: `Cancel ${count.countNo}?`,
                  message: 'The count is kept as history and stock is untouched.',
                  variant: 'destructive', confirmLabel: 'Cancel count',
                }))) return;
                void run(() => api.cancel(id), 'Count cancelled');
              }}>
              <XCircle className="h-4 w-4 mr-1.5" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {count.status === 'counting' && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Counting is under way in the mobile app. Differences appear here once
          staff submit.
        </div>
      )}

      {count.status === 'review' && variances.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {shortages} shortage{shortages === 1 ? '' : 's'} and {surplus_s(surpluses)}.
            Every difference needs a reason before you can approve.
          </span>
        </div>
      )}

      {picking && (
        <SpotItemPicker
          warehouseId={count.warehouseId}
          onClose={() => setPicking(false)}
          onStart={async ids => {
            setPicking(false);
            await run(() => api.start(id, ids), 'Count started');
          }}
        />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-indigo-600" />
            Items
            <span className="text-xs font-normal text-gray-500">
              {count.countedLines} / {count.totalLines} counted
            </span>
          </CardTitle>
          <div className="filter-strip">
            <div className="relative shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input placeholder="Search item, SKU…" value={search}
                     onChange={e => setSearch(e.target.value)}
                     className="h-9 pl-7 w-64 text-sm" aria-label="Search items" />
            </div>
            <select
              value={filter} onChange={e => setFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs
                         focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Filter lines"
            >
              <option value="all">Show : All</option>
              <option value="shortage">Show : Shortage</option>
              <option value="surplus">Show : Surplus</option>
              <option value="matched">Show : Matched</option>
              <option value="uncounted">Show : Not counted</option>
            </select>
            {(search || filter !== 'all') && (
              <Button size="sm" variant="ghost" className="h-9 shrink-0"
                      onClick={() => { setSearch(''); setFilter('all'); }}>
                Clear
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <ListTable>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="w-[90px]">Unit</TableHead>
                <TableHead className="text-right w-[100px]">Expected</TableHead>
                <TableHead className="text-right w-[100px]">Counted</TableHead>
                <TableHead className="text-right w-[110px]">Variance</TableHead>
                <TableHead className="w-[180px]">Reason</TableHead>
                {count.status === 'approved' && (
                  <TableHead className="w-[120px]">Posted as</TableHead>
                )}
                <TableHead className="text-right w-[90px]">History</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-gray-500">
                  {count.totalLines === 0 ? 'Not started yet.' : 'Nothing matches this filter.'}
                </TableCell></TableRow>
              ) : shown.map(l => (
                <TableRow key={l.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium">
                    {l.itemName}
                    {l.sku && <span className="ml-2 font-mono text-xs text-gray-400">{l.sku}</span>}
                    {l.round > 1 && (
                      <Badge variant="outline" className="ml-2 gap-1 text-amber-700 border-amber-300">
                        <RotateCcw className="h-3 w-3" /> Round {l.round}
                      </Badge>
                    )}
                    {l.recountNote && (
                      <div className="mt-0.5 text-xs italic text-gray-500">{l.recountNote}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">{l.unit || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums text-gray-600">
                    {/* Expected is only fixed once the line is counted
                        (stock at start + what moved up to that moment).
                        Until then, whoever may see system quantities
                        gets stock at start, dimmed so it is not read as
                        the final figure. Counting staff on a blind
                        count get neither — the API sends no number. */}
                    {l.expectedQty != null
                      ? fmtQty(l.expectedQty)
                      : l.snapshotQty != null
                        ? <span className="text-gray-400"
                                title="Stock at start — the expected quantity is fixed once this line is counted">
                            {fmtQty(l.snapshotQty)}
                          </span>
                        : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.countedQty == null
                      ? <span className="text-gray-400">—</span>
                      : fmtQty(l.countedQty)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <VarianceCell v={l.variance} />
                  </TableCell>
                  <TableCell>
                    {l.variance != null && l.variance !== 0 ? (
                      <Select
                        value={l.reason ?? ''}
                        disabled={!canManage || count.status !== 'review' || busy}
                        onValueChange={v => void run(() => api.setReason(id, l.id, v), 'Reason saved')}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick a reason" /></SelectTrigger>
                        <SelectContent>
                          {api.VARIANCE_REASONS.map(r => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </TableCell>
                  {count.status === 'approved' && (
                    <TableCell>
                      {/* Closes the loop: this is the number to search
                          for on the Movements page. Without it an
                          approved count is a dead end. */}
                      {l.adjustmentNo
                        ? <span className="font-mono text-xs text-gray-700">{l.adjustmentNo}</span>
                        : <span className="text-xs text-gray-400">—</span>}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <EntryHistory countId={id} line={l} />
                      {/* Recount is the honest third option next to
                          approve-it and cancel-everything: question one
                          line without throwing away the other ninety. */}
                      {canManage && count.status === 'review' && l.countedQty != null && (
                        <Button
                          size="icon" variant="ghost" title="Count this again"
                          className="h-7 w-7 text-amber-600 hover:bg-amber-50"
                          disabled={busy}
                          onClick={async () => {
                            if (!(await confirm({
                              title: `Recount ${l.itemName}?`,
                              message: 'The line goes back to the counting list on the phone. '
                                     + 'What was counted now is kept in its history.',
                              confirmLabel: 'Ask for a recount',
                            }))) return;
                            void run(() => api.recount(id, l.id), 'Sent back for a recount');
                          }}>
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ListTable>
        </CardContent>
      </Card>
    </div>
  );
}

function VarianceCell({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-gray-400">—</span>;
  if (v === 0)    return <span className="text-gray-500">0</span>;
  return (
    <span className={v < 0 ? 'font-semibold text-red-600' : 'font-semibold text-emerald-600'}>
      {v > 0 ? '+' : ''}{Number(v)}
    </span>
  );
}

/**
 * A line's history, on demand.
 *
 * <p>Fetched when opened rather than with the table: most lines are
 * never questioned, and loading every line's log to show none of them
 * is a request per row for nothing.</p>
 */
function EntryHistory({ countId, line }: { countId: string; line: api.StockCountLine }) {
  const [rows, setRows] = useState<api.StockCountEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const open = async () => {
    if (rows) return;
    setLoading(true);
    try { setRows(await api.entries(countId, line.id)); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };

  return (
    <Popover onOpenChange={o => { if (o) void open(); }}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500" title="Count history">
          <History className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="mb-2 text-xs font-semibold text-gray-500">
          {line.itemName} — history
        </div>
        {loading ? (
          <div className="py-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline text-gray-400" /></div>
        ) : !rows || rows.length === 0 ? (
          <p className="py-2 text-sm text-gray-500">Nothing entered yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {rows.map(e => (
              <li key={e.id} className="flex items-baseline gap-2 text-xs">
                <span className="w-10 shrink-0 text-gray-400">R{e.round}</span>
                <span className="font-mono tabular-nums">{Number(e.resultingQty)}</span>
                <span className="rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-600">
                  {e.method}
                </span>
                <span className="min-w-0 flex-1 truncate text-gray-500">
                  {e.countedByName ?? 'unknown'}
                </span>
                <span className="shrink-0 text-gray-400">
                  {new Date(e.createdAt).toLocaleTimeString('en-GB',
                    { hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** "1 surplus" / "3 surpluses" — English is irregular here. */
function surplus_s(n: number): string {
  return `${n} surplus${n === 1 ? '' : 'es'}`;
}

/* ============================== new ============================== */

function NewCountDialog(
  { onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void },
) {
  const [name, setName] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>('none');
  const [countType, setCountType] = useState<api.StockCountType>('full');
  const [categories, setCategories] = useState<string[]>([]);
  const [blind, setBlind] = useState(true);
  const [saving, setSaving] = useState(false);
  const [warehouses, setWarehouses] = useState<warehousesApi.Warehouse[]>([]);

  useEffect(() => { void warehousesApi.list().then(setWarehouses).catch(() => {}); }, []);

  const save = async () => {
    if (countType === 'cycle' && categories.length === 0) {
      toast.error('Pick at least one category for a cycle count');
      return;
    }
    setSaving(true);
    try {
      const c = await api.create({
        name: name.trim() || undefined,
        warehouseId: warehouseId === 'none' ? null : warehouseId,
        countType, categories, blind,
      });
      toast.success(`${c.countNo} created`);
      onCreated(c.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the count');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New stock count</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <Field label="Name">
            <Input value={name} onChange={e => setName(e.target.value)}
                   placeholder="November monthly count" className="h-9" />
          </Field>

          <Field label="Warehouse">
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No warehouse</SelectItem>
                {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Type">
            <Select value={countType} onValueChange={v => setCountType(v as api.StockCountType)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {api.COUNT_TYPES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label} — {c.hint}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {countType === 'cycle' && (
            <Field label="Categories">
              <div className="flex flex-wrap gap-1.5">
                {KNOWN_ITEM_CATEGORIES.map(c => {
                  const on = categories.includes(c);
                  return (
                    <button
                      key={c} type="button"
                      onClick={() => setCategories(on
                        ? categories.filter(x => x !== c) : [...categories, c])}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition ${
                        on ? 'bg-indigo-600 text-white'
                           : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'}`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          <div className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900">Blind count</div>
              <div className="text-xs text-gray-500">
                Hide the system quantity from the people counting. A count you can
                see the answer to is not a count.
              </div>
            </div>
            <Switch checked={blind} onCheckedChange={setBlind} aria-label="Blind count" />
          </div>

          {countType === 'spot' && (
            <p className="text-xs text-gray-500">
              You will pick the items when you start this count.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Pick the items for a spot count, then start it.
 *
 * <p>Search-first rather than a long checklist: a spot count exists
 * because someone suspects two or three specific things, and scrolling
 * a catalogue to find them is the slow way round.</p>
 */
function SpotItemPicker(
  { warehouseId, onClose, onStart }:
  { warehouseId: string | null; onClose: () => void; onStart: (ids: string[]) => void },
) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<itemsApi.Item[]>([]);
  const [picked, setPicked] = useState<itemsApi.Item[]>([]);
  const [searching, setSearching] = useState(false);

  // Debounced: a search per keystroke on a 10k-item catalogue is a
  // request per keystroke too.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setFound([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await itemsApi.list({
          q: term, size: 20, warehouseId: warehouseId ?? undefined,
        });
        setFound(res.content ?? []);
      } catch { /* a failed lookup just shows nothing */ }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, warehouseId]);

  const toggle = (it: itemsApi.Item) =>
    setPicked(prev => prev.some(x => x.id === it.id)
      ? prev.filter(x => x.id !== it.id) : [...prev, it]);

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Which items?</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input autoFocus value={q} onChange={e => setQ(e.target.value)}
                   placeholder="Search name or SKU…" className="h-9 pl-8" />
          </div>

          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {picked.map(it => (
                <button key={it.id} type="button" onClick={() => toggle(it)}
                        className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1
                                   text-xs font-medium text-white">
                  {it.name} <XCircle className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto rounded-md border border-gray-200">
            {searching ? (
              <div className="py-8 text-center text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin inline" />
              </div>
            ) : found.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                {q.trim().length < 2 ? 'Type at least two letters.' : 'Nothing found.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {found.map(it => {
                  const on = picked.some(x => x.id === it.id);
                  return (
                    <li key={it.id}>
                      <button type="button" onClick={() => toggle(it)}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm
                                         hover:bg-gray-50 ${on ? 'bg-indigo-50' : ''}`}>
                        <span className="min-w-0 flex-1 truncate">{it.name}</span>
                        {it.sku && <span className="font-mono text-xs text-gray-400">{it.sku}</span>}
                        {on && <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-600" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={picked.length === 0} onClick={() => onStart(picked.map(i => i.id))}>
            Start with {picked.length} item{picked.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}
