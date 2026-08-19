/**
 * V-library-membership-activity — Activity log for members.
 *
 * <p>One row per member activity — Reading (book link required),
 * Meeting, Conference, or Other. Duration is derived on the BE
 * from {@code startDate} → {@code returnDate} (or today for
 * still-active rows).</p>
 *
 * <p>Add / edit form:</p>
 * <ul>
 *   <li>Type picker first — chooses the activity kind</li>
 *   <li>Reading → Book dropdown appears (required)</li>
 *   <li>Non-reading → free-text Subject field appears</li>
 * </ul>
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, RefreshCw, Activity, BookOpen, Users2, Presentation, MoreHorizontal, Info, Search } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardHeader } from '../../ui/card';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '../../ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '../../ui/tooltip';
import { SearchablePicker } from '../../common/SearchablePicker';
import { DateInput } from '../../common/DateInput';
import * as library from '../../../api/library';
import { useAuth } from '../../../context/AuthContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { useDateFormat } from '../../../context/DateFormatContext';
import { usePagination } from '../../../hooks/usePagination';
import { Pagination } from '../../common/Pagination';

type Status = 'progress' | 'delay' | 'done';
type ActivityType = 'reading' | 'meeting' | 'conference' | 'other';

interface FormState {
  customerId: string;
  activityType: ActivityType;
  stockItemId: string;
  subject: string;
  startDate: string;
  returnDate: string;
  status: Status;
  term: string;
  notes: string;
}

const EMPTY: FormState = {
  customerId: '',
  activityType: 'reading',
  stockItemId: '',
  subject: '',
  startDate: new Date().toISOString().slice(0, 10),
  returnDate: '',
  status: 'progress',
  term: '',
  notes: '',
};

const ACTIVITY_TYPES: Array<{ value: ActivityType; label: string; icon: React.ElementType }> = [
  { value: 'reading',    label: 'Reading',    icon: BookOpen },
  { value: 'meeting',    label: 'Meeting',    icon: Users2 },
  { value: 'conference', label: 'Conference', icon: Presentation },
  { value: 'other',      label: 'Other',      icon: MoreHorizontal },
];

export function ReadingTracking() {
  const { canCreate, canUpdate, canDelete } = useAuth();
  const { formatDate } = useDateFormat();
  const confirm = useConfirm();
  const [rows, setRows] = useState<library.ReadingRecord[]>([]);
  const [members, setMembers] = useState<library.Member[]>([]);
  const [books, setBooks] = useState<library.Book[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Fan-out all three in parallel; the picker dropdowns need
      // them anyway so we amortise the load.
      const [rs, ms, bs, ts] = await Promise.all([
        library.readings.list(),
        library.members.list(),
        library.books.list(),
        library.readings.terms().catch(() => [] as string[]),
      ]);
      setRows(rs); setMembers(ms); setBooks(bs); setTerms(ts);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Load failed'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const openNew = () => { setEditingId(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (r: library.ReadingRecord) => {
    setEditingId(r.id);
    setForm({
      customerId: r.customerId,
      activityType: r.activityType,
      stockItemId: r.stockItemId ?? '',
      // For non-reading activities the subject IS what the user
      // typed; for reading rows the BE returns the book title as the
      // subject too, but the form's Subject field is hidden so we
      // leave this at the stored value and it never surfaces.
      subject: r.subject ?? '',
      startDate: r.startDate,
      returnDate: r.returnDate ?? '',
      status: r.status,
      term: r.term ?? '',
      notes: r.notes ?? '',
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.customerId) { toast.error('Pick a member'); return; }
    if (form.activityType === 'reading' && !form.stockItemId) {
      toast.error('Pick a book for a Reading activity'); return;
    }
    if (form.activityType !== 'reading' && !form.subject.trim()) {
      toast.error('Add a subject'); return;
    }
    setSaving(true);
    try {
      const payload: library.ReadingInput = {
        customerId: form.customerId,
        activityType: form.activityType,
        stockItemId: form.activityType === 'reading' ? form.stockItemId : null,
        subject: form.activityType === 'reading' ? undefined : form.subject.trim(),
        startDate: form.startDate || undefined,
        returnDate: form.returnDate || undefined,
        status: form.status,
        term: form.term.trim() || undefined,
        notes: form.notes || undefined,
      };
      if (editingId) await library.readings.update(editingId, payload);
      else            await library.readings.create(payload);
      toast.success(editingId ? 'Activity updated' : 'Activity added');
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const remove = async (r: library.ReadingRecord) => {
    const ok = await confirm({
      title: 'Delete activity?',
      message: `${r.memberName ?? 'Member'} · ${r.subject ?? 'Activity'} will be removed.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try { await library.readings.remove(r.id); toast.success('Deleted'); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Delete failed'); }
  };

  const statusVariant = (s: Status): 'default' | 'secondary' | 'destructive' | 'outline' =>
    s === 'progress' ? 'default' : s === 'done' ? 'outline' : 'destructive';

  // Only show ACTIVE members in the picker — no point starting a new
  // reading against a suspended / expired card.
  const activeMembers = useMemo(() => members.filter(m => m.status === 'active'), [members]);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all');
  // v-library-filter-strip — inclusive From/To range on startDate.
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (typeFilter !== 'all' && r.activityType !== typeFilter) return false;
      if (dateFrom || dateTo) {
        const d = r.startDate ?? '';
        if (!d) return false;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo   && d > dateTo)   return false;
      }
      if (!q) return true;
      return (
        (r.memberName ?? '').toLowerCase().includes(q)
        || (r.memberNo ?? '').toLowerCase().includes(q)
        || (r.subject ?? '').toLowerCase().includes(q)
        || (r.notes ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, typeFilter, dateFrom, dateTo]);

  const pagination = usePagination(filteredRows, 25);

  return (
    <div className="space-y-6">
      {/* Header — matches Members / Vendors page-header-strip pattern. */}
      <div className="page-header-strip">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-emerald-100 text-emerald-700 p-2"><Activity className="h-5 w-5" /></div>
          <div>
            <h1 className="text-3xl font-bold">Activity</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canCreate('reading') && (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-1.5" /> New Activity
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          {/* v-library-filter-strip — Invoice-shape strip. */}
          <div className="filter-strip">
            <div className="flex items-center gap-2 shrink-0">
              <Label className="text-xs text-gray-600">Type</Label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ActivityType | 'all')}>
                <SelectTrigger className="h-8 w-40 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {ACTIVITY_TYPES.map(a => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
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
                  placeholder="Search member, subject, notes…"
                  className="h-8 pl-7 w-64 text-sm"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && filteredRows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {rows.length === 0 ? 'No activities yet.' : 'No matches — try clearing the filter.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map(r => {
                  const activityMeta = ACTIVITY_TYPES.find(a => a.value === r.activityType) ?? ACTIVITY_TYPES[3];
                  const Icon = activityMeta.icon;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.memberName ?? '—'}</div>
                        <div className="text-xs text-gray-500 font-mono">{r.memberNo ?? ''}</div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs">
                          <Icon className="h-3.5 w-3.5 text-gray-600" />
                          {activityMeta.label}
                        </span>
                      </TableCell>
                      <TableCell>{r.subject}</TableCell>
                      <TableCell>{r.startDate ? formatDate(r.startDate) : '—'}</TableCell>
                      <TableCell>{r.returnDate ? formatDate(r.returnDate) : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(r.status)} className="capitalize">{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.durationDays}d</TableCell>
                      <TableCell>
                        {r.term
                          ? <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs">{r.term}</span>
                          : <span className="text-gray-400">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {canUpdate('reading') && (
                          <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete('reading') && (
                          <Button variant="ghost" size="icon" onClick={() => void remove(r)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingId ? 'Edit Activity' : 'New Activity'}
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button"
                            className="text-gray-400 hover:text-gray-600 cursor-help"
                            aria-label="What this form does">
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    Log a member activity — reading, meeting, conference, or other.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Member <span className="text-red-500">*</span></Label>
              <Select value={form.customerId} onValueChange={v => setForm({ ...form, customerId: v })}>
                <SelectTrigger><SelectValue placeholder="Pick a member" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {activeMembers.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} {m.memberNo ? `(${m.memberNo})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* V-library-membership-activity — activity type first,
                then a conditional Book picker OR free-text Subject. */}
            <div className="col-span-2">
              <Label>Activity Type <span className="text-red-500">*</span></Label>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {ACTIVITY_TYPES.map(a => {
                  const Icon = a.icon;
                  const active = form.activityType === a.value;
                  return (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => setForm({ ...form, activityType: a.value })}
                      className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs transition-colors ${
                        active
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {form.activityType === 'reading' ? (
              <div className="col-span-2">
                <Label>Book <span className="text-red-500">*</span></Label>
                {/* V-library-activity-book-picker — searchable +
                    inline-create, same pattern as the Invoice Purpose
                    picker. Typing a title that doesn't exist offers
                    "Add '{query}' as a new book" — the callback POSTs
                    to the Books endpoint, appends to the local list
                    so the picker refreshes without a full reload,
                    and auto-selects the new row. */}
                <SearchablePicker
                  value={form.stockItemId}
                  onChange={v => setForm({ ...form, stockItemId: v })}
                  placeholder="Pick a book"
                  searchPlaceholder="Search or type a new book title…"
                  emptyResultsLabel="No match — type a new book to add."
                  createLabel={q => `Add "${q}" as a new book`}
                  allowClear={false}
                  onCreate={async (label) => {
                    const trimmed = label.trim();
                    try {
                      const created = await library.books.create({ title: trimmed });
                      setBooks(prev => [...prev, created]);
                      toast.success(`Book "${created.title}" added`);
                      return {
                        value: created.id,
                        label: created.title,
                        secondary: created.author ?? undefined,
                      };
                    } catch (e) {
                      // Surface the BE reason instead of the picker
                      // silently staying open on a 403 / validation
                      // fail — otherwise the operator has no idea
                      // why the "+ Add" click did nothing.
                      const msg = e instanceof Error ? e.message : 'Could not add book';
                      toast.error(msg);
                      throw e;
                    }
                  }}
                  options={books.map(b => ({
                    value: b.id,
                    label: b.title,
                    secondary: b.author ?? undefined,
                    searchKey: `${b.title} ${b.author ?? ''} ${b.isbn ?? ''}`,
                  }))}
                />
              </div>
            ) : (
              <div className="col-span-2">
                <Label>Subject <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. Q4 Board Meeting"
                       value={form.subject}
                       onChange={e => setForm({ ...form, subject: e.target.value })} />
              </div>
            )}
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate}
                     onChange={e => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={form.returnDate}
                     onChange={e => setForm({ ...form, returnDate: e.target.value })} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="progress">Progress</SelectItem>
                  <SelectItem value="delay">Delay</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Term</Label>
              {/* V-library-activity-term — same SearchablePicker
                  pattern as the Book field: filter by typing, and
                  "+ Add" inline-creates a new term (just a distinct
                  label — no separate table). */}
              <SearchablePicker
                value={form.term}
                onChange={v => setForm({ ...form, term: v })}
                placeholder="Pick or type a term"
                searchPlaceholder="Search or type a new term…"
                emptyResultsLabel="No match — type a new term to add."
                createLabel={q => `Add "${q}" as a new term`}
                allowClear
                onCreate={async (label) => {
                  const trimmed = label.trim();
                  // No backend persist — new terms come into the
                  // distinct list the moment the parent Activity
                  // saves. Add locally so the picker refreshes for
                  // the rest of the session.
                  setTerms(prev => prev.includes(trimmed) ? prev : [...prev, trimmed].sort());
                  return { value: trimmed, label: trimmed };
                }}
                options={terms.map(t => ({ value: t, label: t }))}
              />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes}
                        onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
