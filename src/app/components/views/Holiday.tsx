import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import * as settingsApi from '../../api/settings';
import { USE_MOCKS } from '../../api/client';
import { mockHolidays } from '../../data/timeworkData';
import {
  CalendarDays, Plus, Search, Copy, Pencil, Trash2, X,
} from 'lucide-react';
import {
  format, parseISO, addYears, addDays, getYear, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isSameMonth, addMonths, subMonths,
} from 'date-fns';
import { toast } from 'sonner';

/** Live shape — mirrors api/settings.Holiday but adds a non-null id for table keys. */
interface Holiday {
  id: string;
  name: string;
  date: string;            // YYYY-MM-DD
  type: 'public' | 'company' | string;
  isPaid?: boolean;
  description?: string;
  /** When set, this row was created by cloning another holiday — drives
   *  the "cloned" badge in the table and the source-date hover. */
  clonedFromId?: string | null;
}

const ALL_YEARS_OPT = 'all';

interface HolidayProps {
  /** Hides the standalone page title + description when this view is
   *  rendered inside another page's tab (e.g. Attendance Settings).
   *  Toolbar buttons + cards + table all stay. */
  embedded?: boolean;
}

export function Holiday({ embedded = false }: HolidayProps = {}) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(!USE_MOCKS);
  const [busy, setBusy] = useState(false);

  // Default to the current year so the page opens to "what's relevant
  // right now" — admins almost always want this year's holidays first.
  // They can still switch to "All years" or any other year via the picker.
  const [yearFilter, setYearFilter] = useState<string>(String(new Date().getFullYear()));
  const [search, setSearch] = useState('');
  /** Which presentation the user is looking at — table vs full-year calendar. */
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Add / Edit dialog ---------------------------------------------------------
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'add' | 'edit'>('add');
  const [editorTarget, setEditorTarget] = useState<Holiday | null>(null);
  const [formName, setFormName] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formType, setFormType] = useState<'public' | 'company'>('public');
  const [formIsPaid, setFormIsPaid] = useState(true);
  const [formDescription, setFormDescription] = useState('');

  // Clone dialog --------------------------------------------------------------
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneSourceIds, setCloneSourceIds] = useState<string[]>([]);
  /**
   * Two complementary clone modes:
   *   • `year` — shift every source to the same MM-DD in a target year
   *     (most common — "copy 2026's holidays into 2027").
   *   • `days` — shift every source by N days (handy for one-off
   *     adjustments like rolling a strike-affected holiday forward).
   * The admin can still override any individual target date afterwards.
   */
  const [cloneMode, setCloneMode] = useState<'year' | 'days'>('year');
  const [cloneTargetYear, setCloneTargetYear] = useState<number>(new Date().getFullYear() + 1);
  const [cloneShiftDays, setCloneShiftDays] = useState<number>(7);
  /**
   * Per-source override of the target date. The dialog seeds this from
   * the active mode but the admin can edit any entry — handy when a
   * holiday lands on a weekend after the auto-shift and the company
   * decides to observe it on the nearest weekday instead.
   */
  const [cloneOverrides, setCloneOverrides] = useState<Record<string, string>>({});

  // Calendar dialog -----------------------------------------------------------
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarFocus, setCalendarFocus] = useState<Date | null>(null);

  // ---------------------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------------------
  const loadHolidays = async () => {
    if (USE_MOCKS) {
      setHolidays(mockHolidays.map(h => ({
        id: h.id, name: h.name, date: h.date, type: h.type as 'public' | 'company',
        isPaid: h.isPaid, description: h.description,
      })));
      return;
    }
    setLoading(true);
    try {
      const list = await settingsApi.listHolidays();
      setHolidays(list.map(h => ({
        id: h.id,
        name: h.name,
        date: h.date,
        type: (h.type as 'public' | 'company') ?? 'public',
        isPaid: (h as { isPaid?: boolean }).isPaid ?? true,
        description: h.description,
        clonedFromId: h.clonedFromId ?? null,
      })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load holidays');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadHolidays(); }, []);

  // ---------------------------------------------------------------------------
  // Derived: filtered + paginated list
  // ---------------------------------------------------------------------------
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const h of holidays) {
      try { set.add(getYear(parseISO(h.date))); } catch { /* skip bad date */ }
    }
    // Always offer next year so admins can pre-populate.
    set.add(new Date().getFullYear());
    set.add(new Date().getFullYear() + 1);
    return Array.from(set).sort((a, b) => b - a);
  }, [holidays]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return holidays
      .filter(h => yearFilter === ALL_YEARS_OPT || String(getYear(parseISO(h.date))) === yearFilter)
      .filter(h => !q
        || h.name.toLowerCase().includes(q)
        || (h.description ?? '').toLowerCase().includes(q)
        || h.date.includes(q))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [holidays, yearFilter, search]);

  // No pagination — the table scrolls inside its card so the user
  // sees the full filtered list without page-flipping.
  const allFilteredSelected = filtered.length > 0
    && filtered.every(h => selectedIds.has(h.id));

  // ---------------------------------------------------------------------------
  // Add / Edit
  // ---------------------------------------------------------------------------
  const openAdd = () => {
    setEditorMode('add');
    setEditorTarget(null);
    setFormName('');
    setFormDate(format(new Date(), 'yyyy-MM-dd'));
    setFormType('public');
    setFormIsPaid(true);
    setFormDescription('');
    setEditorOpen(true);
  };

  const openEdit = (h: Holiday) => {
    setEditorMode('edit');
    setEditorTarget(h);
    setFormName(h.name);
    setFormDate(h.date);
    setFormType(h.type === 'company' ? 'company' : 'public');
    setFormIsPaid(h.isPaid ?? true);
    setFormDescription(h.description ?? '');
    setEditorOpen(true);
  };

  const saveEditor = async () => {
    if (!formName.trim()) { toast.error('Holiday name is required'); return; }
    if (!formDate)         { toast.error('Date is required'); return; }
    setBusy(true);
    try {
      if (USE_MOCKS) {
        if (editorMode === 'add') {
          setHolidays(prev => [...prev, {
            id: `mock-${Date.now()}`,
            name: formName.trim(),
            date: formDate,
            type: formType,
            isPaid: formIsPaid,
            description: formDescription.trim() || undefined,
          }]);
        } else if (editorTarget) {
          setHolidays(prev => prev.map(h => h.id === editorTarget.id
            ? { ...h, name: formName.trim(), date: formDate, type: formType, isPaid: formIsPaid, description: formDescription.trim() || undefined }
            : h));
        }
      } else if (editorMode === 'add') {
        await settingsApi.createHoliday({
          name: formName.trim(),
          date: formDate,
          type: formType,
          isRecurring: false,
          description: formDescription.trim() || undefined,
        });
        await loadHolidays();
      } else if (editorTarget) {
        await settingsApi.updateHoliday(editorTarget.id, {
          name: formName.trim(),
          date: formDate,
          type: formType,
          description: formDescription.trim() || undefined,
        });
        await loadHolidays();
      }
      toast.success(editorMode === 'add' ? 'Holiday added' : 'Holiday updated');
      setEditorOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save holiday');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (h: Holiday) => {
    if (!window.confirm(`Delete "${h.name}" (${h.date})?`)) return;
    try {
      if (USE_MOCKS) {
        setHolidays(prev => prev.filter(x => x.id !== h.id));
      } else {
        await settingsApi.removeHoliday(h.id);
        await loadHolidays();
      }
      toast.success('Holiday deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete holiday');
    }
  };

  // ---------------------------------------------------------------------------
  // Clone — single or multi
  // ---------------------------------------------------------------------------
  /**
   * Compute the auto-shifted date for a single source, based on the
   * dialog's current mode. Year-mode keeps the calendar position;
   * days-mode adds the delta. Centralising avoids drift between the
   * seed and the recompute-on-change effect.
   */
  const autoShiftedDate = (srcIso: string): string => {
    const srcDate = parseISO(srcIso);
    if (cloneMode === 'year') {
      return format(addYears(srcDate, cloneTargetYear - getYear(srcDate)), 'yyyy-MM-dd');
    }
    return format(addDays(srcDate, cloneShiftDays), 'yyyy-MM-dd');
  };

  const openCloneFor = (ids: string[]) => {
    if (ids.length === 0) return;
    setCloneSourceIds(ids);
    setCloneMode('year');
    const targetYear = new Date().getFullYear() + 1;
    setCloneTargetYear(targetYear);
    setCloneShiftDays(7);
    // Seed each source with the year-shifted date (the default mode);
    // admin can switch to days-mode or hand-edit any row from there.
    const seed: Record<string, string> = {};
    for (const id of ids) {
      const src = holidays.find(h => h.id === id);
      if (!src) continue;
      const srcDate = parseISO(src.date);
      seed[id] = format(addYears(srcDate, targetYear - getYear(srcDate)), 'yyyy-MM-dd');
    }
    setCloneOverrides(seed);
    setCloneOpen(true);
  };

  // Whenever the admin changes the mode or its parameter, recompute
  // every row's auto-shifted date. Hand-edits are flushed (intentional
  // — toggling modes is the "reset" affordance).
  useEffect(() => {
    if (!cloneOpen) return;
    setCloneOverrides(() => {
      const next: Record<string, string> = {};
      for (const id of cloneSourceIds) {
        const src = holidays.find(h => h.id === id);
        if (!src) continue;
        next[id] = autoShiftedDate(src.date);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloneMode, cloneTargetYear, cloneShiftDays]);

  const performClone = async () => {
    const sources = holidays.filter(h => cloneSourceIds.includes(h.id));
    if (sources.length === 0) { setCloneOpen(false); return; }
    setBusy(true);
    let created = 0;
    let failed = 0;
    try {
      for (const src of sources) {
        // Per-source override wins; falls back to the mode-aware
        // auto-shift if the override is missing (shouldn't happen in
        // practice but guards against state drift).
        const newDate = cloneOverrides[src.id] ?? autoShiftedDate(src.date);
        try {
          if (USE_MOCKS) {
            setHolidays(prev => [...prev, {
              ...src,
              id: `mock-${Date.now()}-${created}`,
              date: newDate,
              clonedFromId: src.id,
            }]);
          } else {
            await settingsApi.createHoliday({
              name: src.name,
              date: newDate,
              type: src.type as 'national' | 'company',
              isRecurring: false,
              description: src.description,
              // Persisted lineage — the table can render the "cloned"
              // badge with a tooltip back to the source year.
              clonedFromId: src.id,
            });
          }
          created++;
        } catch {
          failed++;
        }
      }
      if (!USE_MOCKS) await loadHolidays();
      if (failed === 0) {
        toast.success(`Cloned ${created} holiday${created === 1 ? '' : 's'}`);
      } else {
        toast.warning(`Cloned ${created}, skipped ${failed} (already exist or rejected by server)`);
      }
      setSelectedIds(new Set());
      setCloneOpen(false);
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Calendar modal — opens centered on a given month, highlights holidays
  // ---------------------------------------------------------------------------
  const openCalendarOn = (date: Date) => {
    setCalendarFocus(date);
    setCalendarOpen(true);
  };

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------
  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllFiltered = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const ids = filtered.map(h => h.id);
      const allSelected = ids.every(id => next.has(id));
      ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        {!embedded && (
          <div>
            <h1 className="text-3xl font-bold">Holiday Management</h1>
            <p className="text-gray-500">Configure public and company holidays — clone year-over-year, filter, and inspect.</p>
          </div>
        )}
        <div className={`flex flex-wrap gap-2 ${embedded ? 'ml-auto' : ''}`}>
          <Button
            variant="outline"
            disabled={selectedIds.size === 0}
            onClick={() => openCloneFor(Array.from(selectedIds))}
          >
            <Copy className="mr-2 h-4 w-4" />
            Clone Selected ({selectedIds.size})
          </Button>
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Holiday
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <CalendarDays className="h-5 w-5 text-blue-600" />
              <span className="text-2xl font-bold text-blue-600">{filtered.length}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Total Holidays</p>
            <p className="text-[11px] text-gray-500 truncate">Match current filters</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <CalendarDays className="h-5 w-5 text-green-600" />
              <span className="text-2xl font-bold text-green-600">{filtered.filter(h => h.type === 'public').length}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Public</p>
            <p className="text-[11px] text-gray-500 truncate">National observances</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <CalendarDays className="h-5 w-5 text-purple-600" />
              <span className="text-2xl font-bold text-purple-600">{filtered.filter(h => h.type === 'company').length}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Company</p>
            <p className="text-[11px] text-gray-500 truncate">Internal off-days</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Year (YYYY)</Label>
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-32 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_YEARS_OPT}>All years</SelectItem>
                  {years.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[240px]">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Holiday name, description, or date…"
                  className="pl-9 h-9"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title="Clear"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <CardTitle className="text-base">Holiday Calendar</CardTitle>
              {/* Toggle between the data table and a full 12-month
                  calendar view of the selected year. Defaults to table
                  on mount. */}
              <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1 text-xs rounded ${
                    viewMode === 'table' ? 'bg-white shadow-sm font-medium' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Table
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('calendar')}
                  className={`px-3 py-1 text-xs rounded ${
                    viewMode === 'calendar' ? 'bg-white shadow-sm font-medium' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Calendar
                </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === 'calendar' ? (
            <CalendarYearGrid
              year={yearFilter === ALL_YEARS_OPT ? new Date().getFullYear() : Number(yearFilter)}
              holidays={filtered}
              onDayClick={d => openCalendarOn(d)}
            />
          ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10 shadow-[inset_0_-1px_0_rgb(229,231,235)]">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={toggleAllFiltered}
                    aria-label="Select all filtered"
                  />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Holiday Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-gray-400 py-10">
                    {loading ? 'Loading…' : 'No holidays match the current filters.'}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(h => {
                const d = parseISO(h.date);
                const source = h.clonedFromId ? holidays.find(x => x.id === h.clonedFromId) : null;
                return (
                  <TableRow key={h.id} className="hover:bg-gray-50">
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(h.id)}
                        onCheckedChange={() => toggleOne(h.id)}
                        aria-label={`Select ${h.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <button
                        onClick={() => openCalendarOn(d)}
                        className="text-blue-700 hover:underline"
                        title="Show this date on the calendar"
                      >
                        {format(d, 'MMM dd, yyyy')}
                      </button>
                      <p className="text-[11px] text-gray-500 font-normal">{format(d, 'EEEE')}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{h.name}</span>
                        {h.clonedFromId && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-normal text-gray-600 border-gray-300"
                            title={
                              source
                                ? `Cloned from ${source.date} (${format(parseISO(source.date), 'yyyy')})`
                                : 'Cloned from a holiday that was later deleted'
                            }
                          >
                            <Copy className="h-2.5 w-2.5 mr-1" />
                            cloned{source ? ` · ${format(parseISO(source.date), 'yyyy')}` : ''}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={h.type === 'public' ? 'default' : 'secondary'} className="capitalize">
                        {h.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 max-w-xs truncate">
                      {h.description || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="outline" size="sm" className="h-7" onClick={() => openCloneFor([h.id])}>
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          Clone
                        </Button>
                        <Button variant="outline" size="sm" className="h-7" onClick={() => openEdit(h)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-red-700 border-red-200 hover:bg-red-50"
                          onClick={() => handleDelete(h)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
          )}
          <p className="text-[11px] text-gray-500 mt-2">
            {viewMode === 'table'
              ? `Showing ${filtered.length} holiday${filtered.length === 1 ? '' : 's'} (scroll inside the table)`
              : `Calendar view — ${filtered.length} holiday${filtered.length === 1 ? '' : 's'} highlighted`}
          </p>
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editorMode === 'add' ? 'Add New Holiday' : 'Edit Holiday'}</DialogTitle>
            <DialogDescription>
              {editorMode === 'add'
                ? 'Configure a new public or company holiday.'
                : 'Adjust the date, name, type, or notes — saves to the live calendar.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Holiday Name</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g., Independence Day" />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Type</Label>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value as 'public' | 'company')}
                  className="w-full px-3 py-2 border rounded-md text-sm h-9"
                >
                  <option value="public">Public Holiday</option>
                  <option value="company">Company Holiday</option>
                </select>
              </div>
              <label className="flex items-center gap-2 mt-6 cursor-pointer text-sm">
                <input type="checkbox" checked={formIsPaid} onChange={e => setFormIsPaid(e.target.checked)} />
                Paid Holiday
              </label>
            </div>
            <div className="space-y-1">
              <Label>Description (Optional)</Label>
              <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Additional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={saveEditor} disabled={busy}>
              {busy ? 'Saving…' : editorMode === 'add' ? 'Add Holiday' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone dialog — wider layout, sticky footer, the per-row preview
          gets the bulk of the vertical space. Each row shows source +
          weekday on the left and an editable target date with weekday
          on the right; weekend targets are flagged in amber so admins
          notice when a year-shift moves a holiday onto a Sat/Sun. */}
      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Clone {cloneSourceIds.length} holiday{cloneSourceIds.length === 1 ? '' : 's'}</DialogTitle>
            <DialogDescription>
              Pick a shift mode below — each row's target date follows the rule but can be
              overridden inline. Existing holidays on the target dates are skipped server-side.
            </DialogDescription>
          </DialogHeader>

          {/* Mode + parameter row — single line, compact. */}
          <div className="grid grid-cols-[auto_1fr] items-center gap-3 pb-3 border-b">
            <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setCloneMode('year')}
                className={`px-3 py-1.5 text-xs rounded ${
                  cloneMode === 'year' ? 'bg-white shadow-sm font-medium' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Shift to year
              </button>
              <button
                type="button"
                onClick={() => setCloneMode('days')}
                className={`px-3 py-1.5 text-xs rounded ${
                  cloneMode === 'days' ? 'bg-white shadow-sm font-medium' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Shift by N days
              </button>
            </div>
            {cloneMode === 'year' ? (
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Target year</Label>
                <Input
                  type="number"
                  value={cloneTargetYear}
                  onChange={e => setCloneTargetYear(Number(e.target.value) || cloneTargetYear)}
                  min={1970}
                  max={2100}
                  className="h-8 w-24 text-sm"
                />
                <p className="text-[11px] text-gray-500">Same month/day in {cloneTargetYear}.</p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Days</Label>
                <Input
                  type="number"
                  value={cloneShiftDays}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === '' || v === '-') { setCloneShiftDays(0); return; }
                    const n = Number(v);
                    if (Number.isFinite(n)) setCloneShiftDays(n);
                  }}
                  className="h-8 w-24 text-sm"
                />
                <p className="text-[11px] text-gray-500">
                  + forward, − backward. Each source shifts by {cloneShiftDays} day{Math.abs(cloneShiftDays) === 1 ? '' : 's'}.
                </p>
              </div>
            )}
          </div>

          {/* Per-source preview — main content, scrollable. Each row's
              target date is editable; weekend-landing dates surface an
              amber dot so the admin can spot them. */}
          {cloneSourceIds.length > 0 && (
            <div className="rounded-md border bg-white max-h-[55vh] overflow-y-auto">
              <div className="px-3 py-2 sticky top-0 bg-gray-50 border-b text-[11px] text-gray-500 flex items-center justify-between">
                <span>Edit any target date to override the auto-shift.</span>
                <span className="font-medium">{cloneSourceIds.length} row{cloneSourceIds.length === 1 ? '' : 's'}</span>
              </div>
              <ul className="divide-y">
                {holidays
                  .filter(h => cloneSourceIds.includes(h.id))
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map(h => {
                    const targetIso = cloneOverrides[h.id] ?? autoShiftedDate(h.date);
                    const targetDate = (() => { try { return parseISO(targetIso); } catch { return null; } })();
                    const targetDow = targetDate ? getDay(targetDate) : -1;
                    const targetIsWeekend = targetDow === 0 || targetDow === 6;
                    const isOverridden = cloneOverrides[h.id] !== undefined
                      && cloneOverrides[h.id] !== autoShiftedDate(h.date);
                    return (
                      <li key={h.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{h.name}</p>
                          <p className="text-[11px] text-gray-500">
                            from {format(parseISO(h.date), 'MMM dd, yyyy')} ({format(parseISO(h.date), 'EEE')})
                          </p>
                        </div>
                        <span className="text-gray-300 text-sm">→</span>
                        <div className="flex items-center gap-2">
                          <Input
                            type="date"
                            value={cloneOverrides[h.id] ?? ''}
                            onChange={e => setCloneOverrides(prev => ({ ...prev, [h.id]: e.target.value }))}
                            className="h-8 w-40 text-xs"
                          />
                          {targetDate && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                targetIsWeekend
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                              title={targetIsWeekend ? 'Lands on a weekend' : ''}
                            >
                              {format(targetDate, 'EEE')}
                            </span>
                          )}
                          {isOverridden && (
                            <button
                              type="button"
                              onClick={() => setCloneOverrides(prev => {
                                const next = { ...prev };
                                next[h.id] = autoShiftedDate(h.date);
                                return next;
                              })}
                              className="text-[10px] text-gray-500 hover:text-gray-800 px-1"
                              title="Reset to the auto-shifted default"
                            >
                              reset
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCloneOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={performClone} disabled={busy}>
              {busy
                ? 'Cloning…'
                : cloneMode === 'year'
                  ? `Clone ${cloneSourceIds.length} → ${cloneTargetYear}`
                  : `Clone ${cloneSourceIds.length} (shift ${cloneShiftDays >= 0 ? '+' : ''}${cloneShiftDays}d)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Calendar modal */}
      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Holiday Calendar</DialogTitle>
            <DialogDescription>
              Months around the selected date. Highlighted cells are public / company holidays.
            </DialogDescription>
          </DialogHeader>
          {calendarFocus && (
            <CalendarTriple focus={calendarFocus} holidays={holidays} onMonthChange={setCalendarFocus} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CalendarYearGrid — full 12-month calendar for a single year. Used as
// the "Calendar" view-mode of the Holiday tab. Each holiday cell is
// clickable, opening the smaller 3-month modal for context.
// ---------------------------------------------------------------------------
function CalendarYearGrid({
  year, holidays, onDayClick,
}: {
  year: number;
  holidays: Holiday[];
  onDayClick: (d: Date) => void;
}) {
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
  const byDate = useMemo(() => {
    const m = new Map<string, Holiday>();
    for (const h of holidays) m.set(h.date, h);
    return m;
  }, [holidays]);
  return (
    <div className="space-y-3">
      <div className="text-center font-semibold text-sm">{year}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {months.map((m, i) => (
          <CalendarMonthGrid key={i} month={m} byDate={byDate} onDayClick={onDayClick} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CalendarTriple — three-month panel (prev / current / next) with holidays
// dotted in. Tiny on its own; the dialog just wraps it.
// ---------------------------------------------------------------------------
function CalendarTriple({
  focus, holidays, onMonthChange,
}: {
  focus: Date;
  holidays: Holiday[];
  onMonthChange: (d: Date) => void;
}) {
  const months = [subMonths(focus, 1), focus, addMonths(focus, 1)];
  const byDate = useMemo(() => {
    const m = new Map<string, Holiday>();
    for (const h of holidays) m.set(h.date, h);
    return m;
  }, [holidays]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => onMonthChange(subMonths(focus, 1))}>← Prev</Button>
        <p className="text-sm font-medium">{format(focus, 'yyyy')}</p>
        <Button variant="outline" size="sm" onClick={() => onMonthChange(addMonths(focus, 1))}>Next →</Button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {months.map((m, i) => (
          <CalendarMonthGrid key={i} month={m} byDate={byDate} highlightDate={i === 1 ? focus : undefined} />
        ))}
      </div>
    </div>
  );
}

function CalendarMonthGrid({
  month, byDate, highlightDate, onDayClick,
}: {
  month: Date;
  byDate: Map<string, Holiday>;
  highlightDate?: Date;
  /** Optional — turns each in-month cell into a button that fires
   *  with the clicked date. The 12-month year grid uses this to open
   *  the 3-month detail modal centered on that day. */
  onDayClick?: (d: Date) => void;
}) {
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const offset = getDay(startOfMonth(month)); // 0..6, Sun-first
  const cells = Array<Date | null>(offset).fill(null).concat(days);
  const focusISO = highlightDate ? format(highlightDate, 'yyyy-MM-dd') : null;
  return (
    <div className="border rounded-md p-2">
      <p className="text-center font-semibold text-sm mb-2">{format(month, 'MMMM yyyy')}</p>
      <div className="grid grid-cols-7 text-[10px] text-gray-400 mb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          if (!isSameMonth(d, month)) return <div key={i} />;
          const iso = format(d, 'yyyy-MM-dd');
          const holiday = byDate.get(iso);
          const isFocus = iso === focusISO;
          const cls = `text-center text-xs py-1 rounded ${
            holiday
              ? holiday.type === 'public'
                ? 'bg-red-100 text-red-700 font-medium'
                : 'bg-purple-100 text-purple-700 font-medium'
              : ''
          } ${isFocus ? 'ring-2 ring-blue-500' : ''}`;
          const title = holiday
            ? `${holiday.name}${holiday.description ? ' — ' + holiday.description : ''}`
            : '';
          if (onDayClick && holiday) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onDayClick(d)}
                className={`${cls} cursor-pointer hover:opacity-80`}
                title={title}
              >
                {format(d, 'd')}
              </button>
            );
          }
          return (
            <div key={i} className={cls} title={title}>
              {format(d, 'd')}
            </div>
          );
        })}
      </div>
    </div>
  );
}
