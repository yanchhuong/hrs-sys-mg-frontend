/**
 * V-library-membership-activity — Activity log for members.
 *
 * <p>One row per member activity — Reading (book link required),
 * Meeting, Conference, or Other. Duration is derived on the BE
 * from {@code startDate} → {@code returnDate} (or today for
 * still-active rows).</p>
 *
 * <p>V369 — activities read like a Facebook Event: optional cover
 * photo, title, host, date + time range, location (place or online
 * link) and a guest list with RSVPs (going / maybe / invited /
 * can't go). The operator records answers on the guests' behalf.</p>
 *
 * <p>Add / edit form — compact "create event" layout:</p>
 * <ul>
 *   <li>Title (Reading links a book, picked or inline-created; other
 *       types take free text) with an inline "Add details" toggle;
 *       optional cover via "Add cover" in the header (slim banner)</li>
 *   <li>Type chips; Date | Time | Duration (Duration writes the end
 *       time, "Ends on another day" opens end date/time) + summary</li>
 *   <li>Location (place / online), Add guests (avatars) — no Host field: the signed-in user hosts (V370)</li>
 *   <li>Status chips, Term</li>
 * </ul>
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, RefreshCw, Activity, BookOpen, Users2, Presentation, MoreHorizontal, Info, Search,
  Eye, CalendarDays, Clock, MapPin, ImageIcon, UserPlus, X, Check, Crown, Users, Video,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardHeader } from '../../ui/card';
import {
  ListTable, TableHeader, TableRow, TableHead, TableBody, TableCell,
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
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '../../ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '../../ui/command';
import { SearchablePicker } from '../../common/SearchablePicker';
import { DateInput } from '../../common/DateInput';
import * as library from '../../../api/library';
import { useAuth } from '../../../context/AuthContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { useDateFormat } from '../../../context/DateFormatContext';
import { usePagination } from '../../../hooks/usePagination';
import { Pagination } from '../../common/Pagination';
import { LEN } from '../../../utils/validation';
import { readImageAsDataUrl } from '../../../utils/imageUpload';
import { TONE_CLASS, type Tone } from '../../../utils/statusTones';
import { TableRowsSkeleton } from '../../common/LoadingSkeletons';
import { ListEmpty, ListError } from '../../common/ListStates';
import { format } from 'date-fns';

type Status = 'progress' | 'delay' | 'done';
type ActivityType = 'reading' | 'meeting' | 'conference' | 'other';
type Rsvp = library.ActivityRsvp;

/** Cover photo cap — the BE column takes ~3 MB of base64, so 2 MB
 *  of image (≈2.67 MB as a data URL) leaves a safe margin. */
const COVER_MAX_BYTES = 2 * 1024 * 1024;
/** BE caps `notes` at 4000 (below LEN.longText), so match the server. */
const DETAILS_MAX = Math.min(LEN.longText, 4000);
const LOCATION_MAX = 255;

interface FormState {
  customerId: string;
  activityType: ActivityType;
  stockItemId: string;
  subject: string;
  startDate: string;
  startTime: string;
  returnDate: string;
  endTime: string;
  location: string;
  coverImageUrl: string | null;
  inviteeIds: string[];
  status: Status;
  term: string;
  notes: string;
}

const EMPTY: FormState = {
  customerId: '',
  activityType: 'reading',
  stockItemId: '',
  subject: '',
  // Overwritten with the local "today" on every openNew (see below).
  startDate: format(new Date(), 'yyyy-MM-dd'),
  startTime: '',
  returnDate: '',
  endTime: '',
  location: '',
  coverImageUrl: null,
  inviteeIds: [],
  status: 'progress',
  term: '',
  notes: '',
};

const ACTIVITY_TYPES: Array<{ value: ActivityType; label: string; icon: React.ElementType; banner: string; chip: string }> = [
  { value: 'reading',    label: 'Reading',    icon: BookOpen,       banner: 'from-emerald-500 to-teal-600',  chip: 'bg-emerald-600 text-white border-emerald-600' },
  { value: 'meeting',    label: 'Meeting',    icon: Users2,         banner: 'from-sky-500 to-blue-600',      chip: 'bg-sky-600 text-white border-sky-600' },
  { value: 'conference', label: 'Conference', icon: Presentation,   banner: 'from-violet-500 to-purple-600', chip: 'bg-violet-600 text-white border-violet-600' },
  { value: 'other',      label: 'Other',      icon: MoreHorizontal, banner: 'from-slate-500 to-gray-600',    chip: 'bg-slate-600 text-white border-slate-600' },
];

/** ONE status map for the form dropdown dots AND the list / detail
 *  badges, so they always agree. Tones come from the app-wide palette
 *  (utils/statusTones): Progress = blue (info), Delay = red (danger),
 *  Done = green (success). */
const STATUS_CHIPS: Array<{ value: Status; label: string; tone: Tone; dot: string }> = [
  { value: 'progress', label: 'Progress', tone: 'info',    dot: 'bg-blue-500' },
  { value: 'delay',    label: 'Delay',    tone: 'danger',  dot: 'bg-red-500' },
  { value: 'done',     label: 'Done',     tone: 'success', dot: 'bg-emerald-500' },
];
const statusBadgeCls = (s: Status) =>
  TONE_CLASS[(STATUS_CHIPS.find(c => c.value === s) ?? STATUS_CHIPS[0]).tone];

/* ─── Compact "create event" form styling ───────────────────────── */
/** Small bold label. */
const FORM_LABEL = 'text-xs font-semibold text-gray-700';
/** Light-grey filled input. */
const FORM_INPUT = 'h-9 bg-gray-100 border-transparent shadow-none focus-visible:bg-white';
/** Grey field row that hosts an input plus an inline right-side button. */
const FORM_ROW = 'flex items-center gap-1 rounded-md bg-gray-100 pr-1 focus-within:bg-white focus-within:ring-[3px] focus-within:ring-ring/50 transition-[color,box-shadow]';
/** Input living inside {@link FORM_ROW} — the row draws the chrome. */
const FORM_ROW_INPUT = 'h-9 flex-1 min-w-0 bg-transparent border-0 shadow-none focus-visible:ring-0';
/** Small ghost button on the right edge of a {@link FORM_ROW}. */
const FORM_ROW_BTN = 'h-7 shrink-0 px-2 text-xs font-medium text-gray-600 hover:bg-gray-200';
/** Guests shown before the list collapses into a "+N" circle. */
const GUESTS_VISIBLE = 6;

const metaOf = (t: ActivityType) => ACTIVITY_TYPES.find(a => a.value === t) ?? ACTIVITY_TYPES[3];

const RSVP_GROUPS: Array<{ value: Rsvp; label: string }> = [
  { value: 'going',    label: 'Going' },
  { value: 'maybe',    label: 'Maybe' },
  { value: 'invited',  label: 'Invited' },
  { value: 'declined', label: "Can't go" },
];

const RSVP_CHOICES: Array<{ value: Rsvp; label: string; active: string }> = [
  { value: 'going',    label: 'Going',    active: 'bg-emerald-600 text-white border-emerald-600' },
  { value: 'maybe',    label: 'Maybe',    active: 'bg-amber-500 text-white border-amber-500' },
  { value: 'declined', label: "Can't go", active: 'bg-gray-600 text-white border-gray-600' },
];

/** "HH:mm:ss" | "HH:mm" → "HH:mm" for the time input. */
const toHm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

/** "14:30[:00]" → "2:30 PM". */
function fmtTime(t: string | null | undefined): string {
  if (!t) return '';
  const [hs, ms] = t.split(':');
  const h = Number(hs);
  if (Number.isNaN(h)) return t;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${ms ?? '00'} ${suffix}`;
}

/** Local-date parse of "YYYY-MM-DD" (no UTC shift). */
function parseYmd(d: string | null | undefined): Date | null {
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return null;
  return new Date(y, m - 1, day);
}

/** "HH:mm" → minutes after midnight. */
function hmToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Minutes after midnight → "HH:mm". */
function minToHm(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" + n days (local calendar). */
function addDaysYmd(d: string, n: number): string {
  const dt = parseYmd(d);
  if (!dt) return d;
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Whole days from {@code a} to {@code b} (0 when either is blank). */
function dayDiff(a: string, b: string): number {
  const da = parseYmd(a), db = parseYmd(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** 130 → "2h 10m", 1560 → "1d 2h". */
function fmtSpan(min: number): string {
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  const parts = [d ? `${d}d` : '', h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean);
  return parts.length ? parts.join(' ') : '0m';
}

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];

/** Start → end span in minutes, or null when either time is missing. */
function spanOf(f: Pick<FormState, 'startDate' | 'startTime' | 'returnDate' | 'endTime'>): number | null {
  if (!f.startTime || !f.endTime) return null;
  const days = f.returnDate ? dayDiff(f.startDate, f.returnDate) : 0;
  return days * 1440 + hmToMin(f.endTime) - hmToMin(f.startTime);
}

/** Ends the next morning, under 24h — a Duration, not a multi-day event. */
function isOvernight(f: Pick<FormState, 'startDate' | 'startTime' | 'returnDate' | 'endTime'>): boolean {
  return !!f.returnDate && !!f.startTime && !!f.endTime
    && dayDiff(f.startDate, f.returnDate) === 1
    && hmToMin(f.endTime) < hmToMin(f.startTime);
}

const looksLikeUrl = (s: string) => /^(https?:\/\/|www\.)\S+$/i.test(s.trim());
const hrefOf = (s: string) => (/^https?:\/\//i.test(s.trim()) ? s.trim() : `https://${s.trim()}`);

function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function InitialsAvatar({ name, size = 'md' }: { name: string | null | undefined; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-5 w-5 text-[9px]' : 'h-8 w-8 text-xs';
  return (
    <span className={`${cls} shrink-0 rounded-full bg-emerald-100 text-emerald-700 font-semibold inline-flex items-center justify-center`}>
      {initials(name)}
    </span>
  );
}

/** Checklist of members inside a cmdk list — shared by the form's
 *  "Invite members" picker and the detail view's Invite button. */
function MemberChecklist({ options, selected, onToggle }: {
  options: library.Member[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <Command>
      <CommandInput placeholder="Search members…" />
      <CommandList className="hover-scroll-y max-h-56">
        <CommandEmpty>No members found.</CommandEmpty>
        <CommandGroup>
          {options.map(m => {
            const on = selected.includes(m.id);
            return (
              <CommandItem key={m.id} value={`${m.name} ${m.memberNo ?? ''} ${m.id}`} onSelect={() => onToggle(m.id)}>
                <span className={`mr-2 h-4 w-4 shrink-0 rounded border inline-flex items-center justify-center ${
                  on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-300'
                }`}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{m.name}</span>
                {m.memberNo && <span className="ml-1.5 text-xs text-gray-500 font-mono">{m.memberNo}</span>}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/** Form "Add guests" field — a search-style row with an inline Add
 *  button; both open the member checklist (selection applies live). */
function GuestSearchField({ options, value, onChange, disabled }: {
  options: library.Member[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={FORM_ROW}>
          <PopoverTrigger asChild>
            <button type="button" disabled={disabled}
                    className="h-9 flex-1 min-w-0 flex items-center gap-2 pl-3 text-left text-sm text-gray-400 outline-none disabled:opacity-50">
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Search members to invite…</span>
            </button>
          </PopoverTrigger>
          <Button type="button" variant="ghost" size="sm" className={FORM_ROW_BTN} disabled={disabled}
                  onClick={() => setOpen(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0" align="start">
        <MemberChecklist
          options={options}
          selected={value}
          onToggle={id => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Detail-view Invite button — pick several, then send in one call. */
function InviteButton({ options, onInvite, disabled }: {
  options: library.Member[];
  onInvite: (ids: string[]) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  useEffect(() => { if (!open) setPicked([]); }, [open]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" className="h-8" disabled={disabled}>
          <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Invite
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        {options.length === 0 ? (
          <p className="px-3 py-4 text-xs text-gray-500">Every active member is already on the list.</p>
        ) : (
          <>
            <MemberChecklist
              options={options}
              selected={picked}
              onToggle={id => setPicked(p => (p.includes(id) ? p.filter(v => v !== id) : [...p, id]))}
            />
            <div className="flex justify-end gap-2 border-t p-2">
              <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                type="button" size="sm" className="h-7"
                disabled={picked.length === 0 || sending}
                onClick={async () => {
                  setSending(true);
                  try { if (await onInvite(picked)) setOpen(false); }
                  finally { setSending(false); }
                }}
              >
                {sending ? 'Inviting…' : `Invite${picked.length ? ` (${picked.length})` : ''}`}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ReadingTracking() {
  const { canView, canCreate, canUpdate, canDelete } = useAuth();
  const { formatDate } = useDateFormat();
  const confirm = useConfirm();
  const [rows, setRows] = useState<library.ReadingRecord[]>([]);
  const [members, setMembers] = useState<library.Member[]>([]);
  const [books, setBooks] = useState<library.Book[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  /** The list omits covers, so Edit fetches GET /{id} for it; Save
   *  waits for that — a PUT without the cover would clear it. */
  const [coverLoading, setCoverLoading] = useState(false);
  const coverReq = useRef(0);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  // Form-only UI toggles (layout state — none of these are sent).
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [multiDayOpen, setMultiDayOpen] = useState(false);
  const [guestsExpanded, setGuestsExpanded] = useState(false);
  const [locationOnline, setLocationOnline] = useState(false);

  // Detail view (Facebook-Event style).
  const [view, setView] = useState<library.ReadingRecord | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [guestBusy, setGuestBusy] = useState<string | null>(null);
  const viewReq = useRef(0);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Load failed';
      setLoadError(msg);
      toast.error(msg);
    }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const openNew = () => {
    coverReq.current++;
    setCoverLoading(false);
    // Local-date today (the old UTC toISOString() gave yesterday before
    // 07:00 in UTC+7, and EMPTY's value went stale past midnight).
    setEditingId(null); setForm({ ...EMPTY, startDate: format(new Date(), 'yyyy-MM-dd') });
    setDetailsOpen(false); setMultiDayOpen(false); setGuestsExpanded(false); setLocationOnline(false);
    setDialogOpen(true);
  };
  const openEdit = (r: library.ReadingRecord) => {
    setEditingId(r.id);
    const loaded = {
      startDate: r.startDate,
      startTime: toHm(r.startTime),
      returnDate: r.returnDate ?? '',
      endTime: toHm(r.endTime),
    };
    setDetailsOpen(!!(r.notes ?? '').trim());
    // Multi-day panel opens for a real multi-day span; an overnight
    // (< 24h) end reads as a Duration instead.
    setMultiDayOpen(!!loaded.returnDate && loaded.returnDate !== loaded.startDate && !isOvernight(loaded));
    setGuestsExpanded(false);
    setLocationOnline(looksLikeUrl(r.location ?? ''));
    setForm({
      customerId: r.customerId,
      activityType: r.activityType,
      stockItemId: r.stockItemId ?? '',
      // For non-reading activities the subject IS what the user
      // typed; for reading rows the BE returns the book title as the
      // subject too, but the form's free-text Title is hidden so we
      // leave this at the stored value and it never surfaces.
      subject: r.subject ?? '',
      startDate: r.startDate,
      startTime: toHm(r.startTime),
      returnDate: r.returnDate ?? '',
      endTime: toHm(r.endTime),
      location: r.location ?? '',
      coverImageUrl: r.coverImageUrl ?? null,
      inviteeIds: (r.participants ?? []).filter(p => !p.host && p.customerId !== r.customerId).map(p => p.customerId),
      status: r.status,
      term: r.term ?? '',
      notes: r.notes ?? '',
    });
    const token = ++coverReq.current;
    if (r.hasCover && !r.coverImageUrl) {
      setCoverLoading(true);
      library.getReading(r.id)
        .then(full => {
          if (coverReq.current !== token) return;
          setForm(f => ({ ...f, coverImageUrl: full.coverImageUrl ?? null }));
        })
        .catch(e => { if (coverReq.current === token) toast.error(e instanceof Error ? e.message : 'Could not load the cover photo'); })
        .finally(() => { if (coverReq.current === token) setCoverLoading(false); });
    } else {
      setCoverLoading(false);
    }
    setDialogOpen(true);
  };

  const save = async () => {
    if (form.activityType === 'reading' && !form.stockItemId) {
      toast.error('Pick a title for a Reading activity'); return;
    }
    if (form.activityType !== 'reading' && !form.subject.trim()) {
      toast.error('Add a title'); return;
    }
    if (form.returnDate && form.startDate && form.returnDate < form.startDate) {
      toast.error("End date can't be before the start date"); return;
    }
    const sameDay = !form.returnDate || form.returnDate === form.startDate;
    if (sameDay && form.startTime && form.endTime && form.endTime <= form.startTime) {
      toast.error('End time must be after the start time'); return;
    }
    if (coverLoading) { toast.error('Still loading the cover photo — try again in a moment'); return; }
    setSaving(true);
    try {
      const payload: library.ReadingInput = {
        // Host = the session user (server). Keep an older row's member;
        // a new activity sends none.
        customerId: form.customerId || null,
        activityType: form.activityType,
        stockItemId: form.activityType === 'reading' ? form.stockItemId : null,
        subject: form.activityType === 'reading' ? undefined : form.subject.trim(),
        startDate: form.startDate || undefined,
        returnDate: form.returnDate || undefined,
        status: form.status,
        term: form.term.trim() || undefined,
        notes: form.notes || undefined,
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        location: form.location.trim() || null,
        // '' removes the cover; null would mean "keep" on the server.
        coverImageUrl: form.coverImageUrl || '',
        // Create: the guests to invite. Edit: the full kept list —
        // the BE invites new ones, drops missing ones, keeps answers.
        inviteeIds: form.inviteeIds.filter(id => id !== form.customerId),
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

  /* ─── Detail view ─────────────────────────────────────────────── */

  const openView = (r: library.ReadingRecord) => {
    setView(r);
    const token = ++viewReq.current;
    // Re-fetch for the cover (the list omits it) + a fresh guest list.
    setViewLoading(true);
    library.getReading(r.id)
      .then(full => { if (viewReq.current === token) setView(full); })
      .catch(e => { if (viewReq.current === token) toast.error(e instanceof Error ? e.message : 'Could not load activity'); })
      .finally(() => { if (viewReq.current === token) setViewLoading(false); });
  };

  /** Close + invalidate any in-flight fetch so it can't reopen the view. */
  const closeView = () => { viewReq.current++; setView(null); setViewLoading(false); };

  /** Push a write response into the view + the list row. The list
   *  never carries covers, so drop it there to keep rows light. */
  const applyUpdated = (updated: library.ReadingRecord) => {
    setView(v => (v && v.id === updated.id ? updated : v));
    setRows(prev => prev.map(r => (r.id === updated.id ? { ...updated, coverImageUrl: null } : r)));
  };

  const inviteGuests = async (ids: string[]): Promise<boolean> => {
    if (!view || ids.length === 0) return false;
    try {
      const updated = await library.inviteToActivity(view.id, ids);
      applyUpdated(updated);
      toast.success(ids.length === 1 ? 'Member invited' : `${ids.length} members invited`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invite failed');
      return false;
    }
  };

  const setRsvp = async (p: library.ActivityParticipant, rsvp: Rsvp) => {
    if (!view) return;
    setGuestBusy(p.customerId);
    try { applyUpdated(await library.setActivityRsvp(view.id, p.customerId, rsvp)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save the answer'); }
    finally { setGuestBusy(null); }
  };

  const removeGuest = async (p: library.ActivityParticipant) => {
    if (!view) return;
    const ok = await confirm({
      title: 'Remove guest?',
      message: `${p.name ?? 'This member'} will be taken off the guest list.`,
      confirmLabel: 'Remove',
      variant: 'destructive',
    });
    if (!ok) return;
    setGuestBusy(p.customerId);
    try { applyUpdated(await library.removeActivityGuest(view.id, p.customerId)); toast.success('Guest removed'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not remove guest'); }
    finally { setGuestBusy(null); }
  };


  // Only show ACTIVE members in the picker — no point starting a new
  // reading against a suspended / expired card.
  const activeMembers = useMemo(() => members.filter(m => m.status === 'active'), [members]);
  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);


  // Invitee options exclude the host.
  const inviteOptions = useMemo(
    () => activeMembers.filter(m => m.id !== form.customerId),
    [activeMembers, form.customerId],
  );

  // Names for the invitee chips — member list first, then whatever
  // the edited row's participants carried (covers lapsed members).
  const editingRow = useMemo(() => rows.find(r => r.id === editingId) ?? null, [rows, editingId]);
  const guestName = (id: string) =>
    memberById.get(id)?.name
    ?? editingRow?.participants?.find(p => p.customerId === id)?.name
    ?? 'Member';

  const canEditActivity = canUpdate('reading') && canView('member') && canView('book');
  const canManageGuests = canUpdate('reading');
  const canInvite = canUpdate('reading') && canView('member');

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
        || (r.location ?? '').toLowerCase().includes(q)
        || (r.notes ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, typeFilter, dateFrom, dateTo]);

  const filtersActive = !!(search.trim() || typeFilter !== 'all' || dateFrom || dateTo);
  const clearFilters = () => { setSearch(''); setTypeFilter('all'); setDateFrom(''); setDateTo(''); };

  const pagination = usePagination(filteredRows, 25);

  /** "Sat, 25 Oct 2026 · 2:00 PM – 4:00 PM" style range. */
  const whenText = (r: library.ReadingRecord): string => {
    const weekday = (d: string) => parseYmd(d)?.toLocaleDateString('en-US', { weekday: 'short' }) ?? '';
    const day = (d: string) => `${weekday(d)}, ${formatDate(d)}`;
    let s = r.startDate ? day(r.startDate) : '—';
    if (r.startTime) s += ` · ${fmtTime(r.startTime)}`;
    const multiDay = !!r.returnDate && r.returnDate !== r.startDate;
    if (multiDay) {
      s += ` – ${day(r.returnDate!)}`;
      if (r.endTime) s += ` · ${fmtTime(r.endTime)}`;
    } else if (r.endTime) {
      s += ` – ${fmtTime(r.endTime)}`;
    }
    return s;
  };

  const pickCover = async (file: File) => {
    try {
      const url = await readImageAsDataUrl(file, { maxBytes: COVER_MAX_BYTES });
      setForm(f => ({ ...f, coverImageUrl: url }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to read image');
    }
  };

  /* ─── Date | Time | Duration helpers (form only) ──────────────── */

  // Single-day mode keeps the end date at the same day offset (0, or 1
  // for an overnight Duration) when the start date moves.
  const changeStartDate = (d: string) => setForm(f => {
    if (multiDayOpen || !f.returnDate || !d || !f.startDate) return { ...f, startDate: d };
    const offset = Math.max(0, dayDiff(f.startDate, f.returnDate));
    return { ...f, startDate: d, returnDate: addDaysYmd(d, offset) };
  });

  // Single-day mode keeps the chosen Duration when the start time moves;
  // clearing the start time makes it all day.
  const changeStartTime = (t: string) => setForm(f => {
    if (multiDayOpen) return { ...f, startTime: t };
    if (!t) return { ...f, startTime: '', endTime: '', returnDate: f.returnDate ? f.startDate : '' };
    const span = spanOf(f);
    if (span == null || span <= 0 || span >= 1440) return { ...f, startTime: t };
    const end = hmToMin(t) + span;
    return {
      ...f,
      startTime: t,
      endTime: minToHm(end % 1440),
      returnDate: end >= 1440 ? addDaysYmd(f.startDate, 1) : (f.returnDate ? f.startDate : ''),
    };
  });

  /** Duration pick → endTime = start + duration (past midnight → next day). */
  const applyDuration = (v: string) => {
    if (v === 'custom') return;
    if (v === 'allday') {
      setForm(f => ({
        ...f, startTime: '', endTime: '',
        returnDate: !multiDayOpen && f.returnDate ? f.startDate : f.returnDate,
      }));
      return;
    }
    setForm(f => {
      if (!f.startTime) return f;
      const end = hmToMin(f.startTime) + Number(v);
      return {
        ...f,
        endTime: minToHm(end % 1440),
        returnDate: end >= 1440 ? addDaysYmd(f.startDate, 1) : (f.returnDate ? f.startDate : ''),
      };
    });
    setMultiDayOpen(false);
  };

  /** Collapse "Ends on another day" back to a single-day event. */
  const collapseMultiDay = () => {
    setMultiDayOpen(false);
    setForm(f => ({
      ...f,
      returnDate: f.returnDate ? f.startDate : '',
      endTime: f.startTime && f.endTime && f.endTime > f.startTime ? f.endTime : '',
    }));
  };

  const formSpan = spanOf(form);
  const formOvernight = isOvernight(form);
  const durationValue = !form.startTime || formSpan == null || formSpan <= 0
    ? ''
    : DURATION_PRESETS.includes(formSpan) ? String(formSpan) : 'custom';

  /** Muted sentence under Date | Time | Duration. */
  const formSummary = (() => {
    const f = form;
    if (!f.startDate) return 'Pick a date for this event.';
    const sd = formatDate(f.startDate);
    if (f.returnDate && f.returnDate !== f.startDate && !formOvernight) {
      return `This event will run from ${sd}${f.startTime ? ` at ${fmtTime(f.startTime)}` : ''}`
        + ` until ${formatDate(f.returnDate)}${f.endTime ? ` at ${fmtTime(f.endTime)}` : ''}`;
    }
    if (!f.startTime) {
      return f.endTime
        ? `This event will take place on ${sd}, ending at ${fmtTime(f.endTime)}`
        : `This event will take place on ${sd}, all day`;
    }
    if (!f.endTime) return `This event will take place on ${sd} starting at ${fmtTime(f.startTime)}`;
    return `This event will take place on ${sd} from ${fmtTime(f.startTime)} until ${fmtTime(f.endTime)}`
      + (formOvernight ? ` the next day (${formatDate(f.returnDate)})` : '');
  })();

  const removeInvitee = (id: string) =>
    setForm(f => ({ ...f, inviteeIds: f.inviteeIds.filter(v => v !== id) }));
  const visibleInvitees = guestsExpanded ? form.inviteeIds : form.inviteeIds.slice(0, GUESTS_VISIBLE);
  const hiddenInvitees = form.inviteeIds.length - visibleInvitees.length;

  const viewMeta = view ? metaOf(view.activityType) : null;
  const viewDate = view ? parseYmd(view.startDate) : null;
  const viewParticipants: library.ActivityParticipant[] = view
    ? (view.participants && view.participants.length > 0
        ? view.participants
        // Pre-V369 rows have no guest rows yet — show the host alone.
        : view.customerId
          ? [{ customerId: view.customerId, memberNo: view.memberNo, name: view.memberName, rsvp: 'going', host: true, respondedAt: null }]
          : [])
    : [];
  const viewInviteOptions = view
    ? activeMembers.filter(m => m.id !== view.customerId && !viewParticipants.some(p => p.customerId === m.id))
    : [];

  const infoRow = (icon: ReactNode, body: ReactNode) => (
    <div className="flex items-start gap-3 text-sm">
      <span className="mt-0.5 text-gray-500 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">{body}</div>
    </div>
  );

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
          {/* v-activity-view-only — the New Activity flow pops the
              member + book pickers, so it needs `member:view` (to
              list members) and `book:view` (to seed the reading
              picker). A role granted `reading:*` but not those two
              still opens the page in read-only mode; hide the
              button rather than lead the operator into a 403 chain
              inside the dialog. */}
          {canCreate('reading') && canView('member') && canView('book') && (
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
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as ActivityType | 'all')}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Filter by type"
            >
              <option value="all">Type : All</option>
              {ACTIVITY_TYPES.map(a => (
                <option key={a.value} value={a.value}>Type : {a.label}</option>
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
                placeholder="Search host, title, location, notes…"
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
          ) : filteredRows.length === 0 ? (
            <ListEmpty noun="activities" filtered={filtersActive && rows.length > 0} />
          ) : (
            <ListTable>
              <TableHeader>
                <TableRow>
                  <TableHead>Host</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead className="text-right w-[130px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map(r => {
                  const activityMeta = metaOf(r.activityType);
                  const Icon = activityMeta.icon;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.hostName ?? r.memberName ?? '—'}</div>
                        {!r.hostUserId && <div className="text-xs text-gray-500 font-mono">{r.memberNo ?? ''}</div>}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs">
                          <Icon className="h-3.5 w-3.5 text-gray-600" />
                          {activityMeta.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <button type="button" onClick={() => openView(r)}
                                className="inline-flex items-center gap-1.5 text-left font-medium hover:underline">
                          {r.subject}
                          {r.hasCover && (
                            <ImageIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" aria-label="Has cover photo" />
                          )}
                        </button>
                        {(r.location || (r.goingCount ?? 0) > 0) && (
                          <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
                            {r.location && (
                              <span className="inline-flex items-center gap-1 max-w-[220px]">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{r.location}</span>
                              </span>
                            )}
                            {(r.goingCount ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-1 shrink-0">
                                <Users className="h-3 w-3" /> {r.goingCount} going
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>{r.startDate ? formatDate(r.startDate) : '—'}</div>
                        {r.startTime && (
                          <div className="text-xs text-gray-500 inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {fmtTime(r.startTime)}
                            {r.endTime && (!r.returnDate || r.returnDate === r.startDate) ? ` – ${fmtTime(r.endTime)}` : ''}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>{r.returnDate ? formatDate(r.returnDate) : '—'}</div>
                        {r.endTime && r.returnDate && r.returnDate !== r.startDate && (
                          <div className="text-xs text-gray-500 inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {fmtTime(r.endTime)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${statusBadgeCls(r.status)}`}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.durationDays}d</TableCell>
                      <TableCell>
                        {r.term
                          ? <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs">{r.term}</span>
                          : <span className="text-gray-400">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openView(r)} title="View" aria-label="View">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {/* Edit needs member + book pickers too, so gate
                              the pencil on the same combo as the New
                              Activity button. Delete only touches the
                              reading row — no cross-module fetch — so it
                              stays on the base `reading:delete` gate. */}
                          {canEditActivity && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)} title="Edit" aria-label="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete('reading') && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void remove(r)} title="Delete" aria-label="Delete">
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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

      {/* ─── New / Edit — compact "create event" form ────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto gap-3">
          <DialogHeader className="pr-8">
            <div className="flex items-center justify-between gap-2">
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
                      Set up a member activity — reading, meeting, conference, or other — and invite members to it.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </DialogTitle>
              {/* Cover photo — compact "Add cover" until one is set. */}
              {!form.coverImageUrl && !coverLoading && (
                <Button type="button" variant="ghost" size="sm"
                        className="h-7 shrink-0 px-2 text-xs text-gray-600"
                        title="Optional cover photo · up to 2 MB"
                        onClick={() => coverInputRef.current?.click()}>
                  <ImageIcon className="h-3.5 w-3.5 mr-1" /> Add cover
                </Button>
              )}
            </div>
          </DialogHeader>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void pickCover(f);
              e.target.value = '';
            }}
          />

          {/* Slim cover banner once set (or while the edit loads it). */}
          {coverLoading ? (
            <div className="h-24 rounded-md bg-gray-100 animate-pulse flex items-center justify-center text-xs text-gray-500">
              Loading cover photo…
            </div>
          ) : form.coverImageUrl ? (
            <div className="relative h-24 rounded-md overflow-hidden bg-gray-100">
              <img src={form.coverImageUrl} alt="" className="w-full h-full object-cover" />
              <div className="absolute right-2 bottom-2 flex gap-1.5">
                <Button type="button" size="sm" variant="secondary" className="h-6 px-2 text-xs shadow-sm"
                        onClick={() => coverInputRef.current?.click()}>
                  <ImageIcon className="h-3 w-3 mr-1" /> Change
                </Button>
                <Button type="button" size="sm" variant="secondary" className="h-6 px-2 text-xs shadow-sm text-red-600"
                        onClick={() => setForm(f => ({ ...f, coverImageUrl: null }))}>
                  <X className="h-3 w-3 mr-1" /> Remove
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            {/* Title — Reading links a book; other types take free
                text. Inline "Add details" reveals the Details box. */}
            <div className="space-y-1">
              <Label className={FORM_LABEL}>Title <span className="text-red-500">*</span></Label>
              <div className={FORM_ROW}>
                {form.activityType === 'reading' ? (
                  <div className="flex-1 min-w-0">
                    {/* V-library-activity-book-picker — searchable +
                        inline-create, same pattern as the Invoice Purpose
                        picker. Typing a title that doesn't exist offers
                        "Add '{query}' as a new title" — the callback POSTs
                        to the Books endpoint, appends to the local list
                        so the picker refreshes without a full reload,
                        and auto-selects the new row. */}
                    <SearchablePicker
                      className="bg-transparent border-0 shadow-none hover:bg-transparent focus-visible:ring-0"
                      value={form.stockItemId}
                      onChange={v => setForm({ ...form, stockItemId: v })}
                      placeholder="Pick a title"
                      searchPlaceholder="Search or type a title…"
                      emptyResultsLabel="No match — type a new title to add."
                      createLabel={q => `Add "${q}" as a new title`}
                      allowClear={false}
                      onCreate={async (label) => {
                        const trimmed = label.trim();
                        try {
                          const created = await library.books.create({ title: trimmed });
                          setBooks(prev => [...prev, created]);
                          toast.success(`Title "${created.title}" added`);
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
                          const msg = e instanceof Error ? e.message : 'Could not add title';
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
                  <Input placeholder="e.g. Q4 Board Meeting"
                         className={`${FORM_ROW_INPUT} font-medium`}
                         maxLength={LEN.name}
                         value={form.subject}
                         onChange={e => setForm({ ...form, subject: e.target.value })} />
                )}
                <Button type="button" variant="ghost" size="sm" className={FORM_ROW_BTN}
                        aria-expanded={detailsOpen}
                        onClick={() => setDetailsOpen(o => !o)}>
                  {detailsOpen ? 'Hide details' : 'Add details'}
                </Button>
              </div>
              {detailsOpen && (
                <Textarea rows={3} value={form.notes} maxLength={DETAILS_MAX}
                          aria-label="Details"
                          className="mt-1.5 min-h-0 bg-gray-100 border-transparent shadow-none text-sm focus-visible:bg-white"
                          placeholder="What's this activity about?"
                          onChange={e => setForm({ ...form, notes: e.target.value })} />
              )}
            </div>

            {/* Type — small tag chips, selected one filled in its tone. */}
            <div className="space-y-1">
              <Label className={FORM_LABEL}>Type <span className="text-red-500">*</span></Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Activity type">
                {ACTIVITY_TYPES.map(a => {
                  const Icon = a.icon;
                  const active = form.activityType === a.value;
                  return (
                    <button
                      key={a.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setForm({ ...form, activityType: a.value })}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        active ? a.chip : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date | Time | Duration + summary sentence. */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 sm:grid-cols-[1.3fr_1fr_1fr] gap-2">
                <div className="space-y-1">
                  <Label className={FORM_LABEL}>Date</Label>
                  <DateInput className={`${FORM_INPUT} w-full`} value={form.startDate || null} clearable={false}
                             onChange={v => changeStartDate(v ?? '')} />
                </div>
                <div className="space-y-1">
                  <Label className={FORM_LABEL}>Time</Label>
                  <Input type="time" className={FORM_INPUT} value={form.startTime}
                         onChange={e => changeStartTime(e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-1" title={form.startTime ? undefined : 'Set a time first'}>
                  <Label className={FORM_LABEL}>Duration</Label>
                  <Select value={durationValue} onValueChange={applyDuration} disabled={!form.startTime}>
                    <SelectTrigger className={`${FORM_INPUT} w-full text-sm`}>
                      <SelectValue placeholder={form.startTime ? 'Duration' : 'All day'} />
                    </SelectTrigger>
                    <SelectContent>
                      {durationValue === 'custom' && formSpan != null && (
                        <SelectItem value="custom">Custom · {fmtSpan(formSpan)}</SelectItem>
                      )}
                      {DURATION_PRESETS.map(m => (
                        <SelectItem key={m} value={String(m)}>{fmtSpan(m)}</SelectItem>
                      ))}
                      <SelectItem value="allday">All day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-gray-500">{formSummary}</p>
                <button type="button"
                        className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                        onClick={() => {
                          if (multiDayOpen) { collapseMultiDay(); return; }
                          setMultiDayOpen(true);
                          setForm(f => (f.startDate && (!f.returnDate || f.returnDate === f.startDate)
                            ? { ...f, returnDate: addDaysYmd(f.startDate, 1) }
                            : f));
                        }}>
                  {multiDayOpen ? 'Ends same day' : 'Ends on another day'}
                </button>
              </div>
              {multiDayOpen && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className={FORM_LABEL}>End date <span className="text-xs text-gray-400 font-normal">(optional)</span></Label>
                    <DateInput className={`${FORM_INPUT} w-full`} value={form.returnDate || null} min={form.startDate || undefined}
                               onChange={v => setForm({ ...form, returnDate: v ?? '' })} />
                  </div>
                  <div className="space-y-1">
                    <Label className={FORM_LABEL}>End time <span className="text-xs text-gray-400 font-normal">(optional)</span></Label>
                    <Input type="time" className={FORM_INPUT} value={form.endTime}
                           onChange={e => setForm({ ...form, endTime: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            {/* Location — place or online link (same `location` value). */}
            <div className="space-y-1">
              <Label className={FORM_LABEL}>Location</Label>
              <div className={FORM_ROW}>
                <MapPin className="ml-2.5 h-4 w-4 shrink-0 text-gray-400" />
                <Input className={`${FORM_ROW_INPUT} pl-1.5`}
                       placeholder={locationOnline ? 'Paste a meeting link' : 'Add a place'}
                       maxLength={LOCATION_MAX}
                       value={form.location}
                       onChange={e => setForm({ ...form, location: e.target.value })} />
                <Button type="button" variant="ghost" size="sm"
                        aria-pressed={locationOnline}
                        className={`${FORM_ROW_BTN} ${locationOnline ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : ''}`}
                        onClick={() => setLocationOnline(o => !o)}>
                  <Video className="h-3.5 w-3.5 mr-1" /> Online
                </Button>
              </div>
            </div>

            {/* Guests — besides the host; round avatars with × badges. */}
            <div className="space-y-1.5">
              <Label className={FORM_LABEL}>
                Add guests {form.inviteeIds.length > 0 && <span className="text-xs text-gray-500 font-normal">({form.inviteeIds.length})</span>}
              </Label>
              <GuestSearchField
                options={inviteOptions}
                value={form.inviteeIds}
                onChange={ids => setForm(f => ({ ...f, inviteeIds: ids }))}
              />
              {form.inviteeIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {visibleInvitees.map(id => (
                    <div key={id} className="relative" title={guestName(id)}>
                      <span className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold inline-flex items-center justify-center">
                        {initials(guestName(id))}
                      </span>
                      <button type="button" aria-label={`Remove ${guestName(id)}`}
                              className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-gray-700 text-white ring-2 ring-white inline-flex items-center justify-center hover:bg-red-600"
                              onClick={() => removeInvitee(id)}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                  {hiddenInvitees > 0 && (
                    <button type="button"
                            className="h-9 w-9 rounded-full bg-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-300"
                            title={`Show ${hiddenInvitees} more`}
                            onClick={() => setGuestsExpanded(true)}>
                      +{hiddenInvitees}
                    </button>
                  )}
                  {guestsExpanded && form.inviteeIds.length > GUESTS_VISIBLE && (
                    <button type="button" className="text-xs font-medium text-blue-600 hover:underline"
                            onClick={() => setGuestsExpanded(false)}>
                      Show less
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* No Host field: the signed-in user hosts (V370). */}

            {/* Status — edit only: a new activity starts as Progress (the
                server's default too), so the field would only be noise. */}
            <div className={`grid grid-cols-1 gap-3 ${editingId ? 'sm:grid-cols-2' : ''}`}>
              {editingId && (
              <div className="space-y-1">
                <Label className={FORM_LABEL}>Status</Label>
                {/* A dropdown, not a button row — three fixed choices. */}
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as Status })}>
                  <SelectTrigger className={`${FORM_INPUT} w-full text-sm`} aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_CHIPS.map(st => (
                      <SelectItem key={st.value} value={st.value}>
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              )}
              <div className="space-y-1">
                <Label className={FORM_LABEL}>Term</Label>
                {/* V-library-activity-term — same SearchablePicker
                    pattern as the Title field: filter by typing, and
                    "+ Add" inline-creates a new term (just a distinct
                    label — no separate table). */}
                <SearchablePicker
                  className={FORM_INPUT}
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || coverLoading}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Activity'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail view — Facebook-Event layout ─────────────────── */}
      <Dialog open={!!view} onOpenChange={o => { if (!o) closeView(); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          {view && viewMeta && (
            <>
              {/* Cover banner, or a coloured header by activity type. */}
              {view.coverImageUrl ? (
                <img src={view.coverImageUrl} alt="" className="w-full h-44 object-cover rounded-t-lg" />
              ) : view.hasCover && viewLoading ? (
                <div className="w-full h-44 bg-gray-100 animate-pulse rounded-t-lg" />
              ) : (
                <div className={`w-full h-28 rounded-t-lg bg-gradient-to-br ${viewMeta.banner} flex items-center justify-center`}>
                  <viewMeta.icon className="h-10 w-10 text-white/80" />
                </div>
              )}

              <div className="p-5 space-y-4">
                <DialogHeader className="text-left">
                  <div className="flex items-start gap-3">
                    {viewDate && (
                      <div className="shrink-0 w-14 rounded-md border bg-white text-center overflow-hidden shadow-sm">
                        <div className="bg-red-500 text-white text-[10px] font-semibold uppercase py-0.5">
                          {viewDate.toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                        <div className="text-2xl font-bold leading-9 tabular-nums">{viewDate.getDate()}</div>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <DialogTitle className="text-xl leading-snug break-words">{view.subject}</DialogTitle>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs">
                          <viewMeta.icon className="h-3.5 w-3.5 text-gray-600" />
                          {viewMeta.label}
                        </span>
                        <Badge variant="outline" className={`capitalize ${statusBadgeCls(view.status)}`}>{view.status}</Badge>
                        {view.term && (
                          <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs">{view.term}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-2.5">
                  {infoRow(<CalendarDays className="h-4 w-4" />, whenText(view))}
                  {view.location && infoRow(
                    <MapPin className="h-4 w-4" />,
                    looksLikeUrl(view.location)
                      ? <a href={hrefOf(view.location)} target="_blank" rel="noopener noreferrer"
                           className="text-blue-600 hover:underline break-all">{view.location}</a>
                      : <span className="break-words">{view.location}</span>,
                  )}
                  {infoRow(
                    <Crown className="h-4 w-4" />,
                    <span>Hosted by <span className="font-medium">{view.hostName ?? view.memberName ?? '—'}</span></span>,
                  )}
                  {infoRow(
                    <Users className="h-4 w-4" />,
                    <span>
                      {view.goingCount ?? 0} going · {view.maybeCount ?? 0} maybe · {view.invitedCount ?? 0} invited
                      {(view.declinedCount ?? 0) > 0 ? ` · ${view.declinedCount} can't go` : ''}
                    </span>,
                  )}
                </div>

                {view.notes && (
                  <div className="rounded-md bg-gray-50 border px-3 py-2 text-sm whitespace-pre-wrap break-words">
                    {view.notes}
                  </div>
                )}

                {/* Guest list grouped by RSVP. */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Guests</h3>
                    {canInvite && (
                      <InviteButton options={viewInviteOptions} onInvite={inviteGuests} disabled={!!guestBusy} />
                    )}
                  </div>
                  {RSVP_GROUPS.map(g => {
                    const list = viewParticipants.filter(p => p.rsvp === g.value);
                    if (list.length === 0) return null;
                    return (
                      <div key={g.value} className="space-y-1.5">
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {g.label} · {list.length}
                        </div>
                        {list.map(p => (
                          <div key={p.customerId} className="flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-gray-50">
                            <InitialsAvatar name={p.name} />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate flex items-center gap-1.5">
                                {p.name ?? 'Member'}
                                {p.host && (
                                  <span className="rounded bg-emerald-100 text-emerald-700 px-1.5 py-px text-[10px] font-semibold">Host</span>
                                )}
                              </div>
                              {p.memberNo && <div className="text-xs text-gray-500 font-mono">{p.memberNo}</div>}
                            </div>
                            {canManageGuests && !p.host && (
                              <div className="flex items-center gap-1 shrink-0">
                                <div className="inline-flex rounded-md border overflow-hidden">
                                  {RSVP_CHOICES.map(c => {
                                    const on = p.rsvp === c.value;
                                    return (
                                      <button
                                        key={c.value}
                                        type="button"
                                        disabled={guestBusy === p.customerId}
                                        // Clicking the current answer resets it to "invited".
                                        onClick={() => void setRsvp(p, on ? 'invited' : c.value)}
                                        title={on ? 'Clear answer' : `Mark as ${c.label.toLowerCase()}`}
                                        className={`px-2 py-0.5 text-[11px] border-l first:border-l-0 transition-colors disabled:opacity-50 ${
                                          on ? c.active : 'bg-white text-gray-600 hover:bg-gray-50'
                                        }`}
                                      >
                                        {c.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
                                        disabled={guestBusy === p.customerId}
                                        onClick={() => void removeGuest(p)}
                                        title="Remove guest" aria-label="Remove guest">
                                  <X className="h-3.5 w-3.5 text-red-600" />
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {viewParticipants.length <= 1 && (
                    <p className="text-xs text-gray-500">No guests invited yet.</p>
                  )}
                </div>
              </div>

              <DialogFooter className="px-5 pb-5">
                <Button variant="outline" onClick={closeView}>Close</Button>
                {canEditActivity && (
                  <Button onClick={() => { const r = view; closeView(); openEdit(r); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
