import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Plus, Trash2, CalendarClock, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import * as coursesApi from '../../api/courses';
import * as classroomsApi from '../../api/classrooms';
import * as employeesApi from '../../api/employees';
import * as schedulesApi from '../../api/courseSchedules';
import { SearchablePicker } from './SearchablePicker';

/**
 * V213 / v-course-schedule-model — the "teaching session" popup.
 * Glues Course + Classroom + Teacher + weekly learn times + date
 * window + capacity + tuition fee.
 *
 * <p>Learn Time is a MENU inside this dialog: (day of week, from,
 * to) — a schedule can hold multiple entries (Mon 08:00–10:00,
 * Wed 08:00–10:00). Backend rejects overlaps with other schedules
 * on the same classroom + day-of-week + date range.</p>
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: schedulesApi.CourseSchedule | null;
  onSaved: () => void;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Term shortcut — presets seed both Start Date (today) and End
 *  Date (today + N days) in one click. Days are flat counts, not
 *  calendar-month math, per user request (1 Month = 30 days). */
type Term = 'custom' | '1m' | '3m' | '6m' | '1y';

const TERM_OPTIONS: { value: Term; label: string; days: number }[] = [
  { value: 'custom', label: 'Custom',    days: 0 },
  { value: '1m',     label: '1 Month',   days: 30 },
  { value: '3m',     label: '3 Months',  days: 90 },
  { value: '6m',     label: '6 Months',  days: 180 },
  { value: '1y',     label: '1 Year',    days: 365 },
];

/** ISO yyyy-mm-dd for today (local calendar day). */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Add {@code days} to an ISO yyyy-mm-dd date. Empty input passes
 *  through unchanged; a zero-day delta is a no-op. */
function addDaysIso(startIso: string, days: number): string {
  if (!startIso || days <= 0) return startIso;
  const [y, m, d] = startIso.split('-').map(Number);
  if (!y || !m || !d) return startIso;
  const target = new Date(Date.UTC(y, m - 1, d + days));
  return target.toISOString().slice(0, 10);
}

interface LearnRow { dayOfWeek: number; fromTime: string; toTime: string; }

interface FormState {
  courseId: string | null;
  classroomId: string | null;
  teacherId: string | null;
  name: string;
  description: string;
  capacity: number | '';
  unitPrice: number | '';
  startDate: string;
  endDate: string;
  learnTimes: LearnRow[];
}

const blank: FormState = {
  courseId: null, classroomId: null, teacherId: null,
  name: '', description: '',
  capacity: '', unitPrice: '',
  startDate: '', endDate: '',
  learnTimes: [],
};

export function AddCourseScheduleDialog({ open, onOpenChange, editing, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(blank);
  const [courses, setCourses] = useState<coursesApi.Course[]>([]);
  const [classrooms, setClassrooms] = useState<classroomsApi.Classroom[]>([]);
  const [teachers, setTeachers] = useState<employeesApi.Employee[]>([]);
  const [saving, setSaving] = useState(false);
  // UI-only shortcut. Default 'custom' on edit so existing end dates
  // are preserved untouched — the operator picks a preset to
  // overwrite. On fresh create the operator is expected to set a
  // Start Date first, then pick a term.
  const [term, setTerm] = useState<Term>('custom');

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [c, r, e] = await Promise.all([
          coursesApi.list({ size: 500 }),
          classroomsApi.list({ size: 500 }),
          employeesApi.list({ size: 500, status: 'active' }),
        ]);
        setCourses(c.content ?? []);
        setClassrooms(r.content ?? []);
        setTeachers((e.content ?? []).filter(x => x.clinicalRole === 'teacher'));
      } catch {
        // pickers stay empty; soft-fail
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTerm('custom');
    if (editing) {
      setForm({
        courseId: editing.courseId,
        classroomId: editing.classroomId,
        teacherId: editing.teacherId ?? null,
        name: editing.name ?? '',
        description: editing.description ?? '',
        capacity: editing.capacity ?? '',
        unitPrice: editing.unitPrice ?? '',
        startDate: editing.startDate ?? '',
        endDate: editing.endDate ?? '',
        learnTimes: (editing.learnTimes ?? []).map(t => ({
          dayOfWeek: t.dayOfWeek,
          fromTime: t.fromTime?.slice(0, 5) ?? '',
          toTime:   t.toTime?.slice(0, 5) ?? '',
        })),
      });
    } else {
      setForm(blank);
    }
  }, [open, editing]);

  const addRow = () => setForm(f => {
    // Additional slots default to the first slot's times so a
    // recurring "Mon+Wed 8-10am" schedule only needs one time entry —
    // the operator just changes the day dropdown on each new row.
    const first = f.learnTimes[0];
    const fromTime = first?.fromTime ?? '';
    const toTime   = first?.toTime   ?? '';
    return { ...f, learnTimes: [...f.learnTimes, { dayOfWeek: 1, fromTime, toTime }] };
  });
  const removeRow = (i: number) => setForm(f => ({
    ...f, learnTimes: f.learnTimes.filter((_, j) => j !== i),
  }));
  const setRow = (i: number, patch: Partial<LearnRow>) => setForm(f => ({
    ...f,
    learnTimes: f.learnTimes.map((r, j) => j === i ? { ...r, ...patch } : r),
  }));

  const submit = async () => {
    if (!form.courseId)    { toast.error('Pick a Course');    return; }
    if (!form.classroomId) { toast.error('Pick a Classroom'); return; }
    for (const [i, r] of form.learnTimes.entries()) {
      if (!r.fromTime || !r.toTime) { toast.error(`Learn time #${i + 1}: from and to are required`); return; }
      if (r.fromTime >= r.toTime)   { toast.error(`Learn time #${i + 1}: 'from' must be earlier than 'to'`); return; }
    }
    setSaving(true);
    try {
      const payload: schedulesApi.CourseScheduleRequest = {
        courseId: form.courseId,
        classroomId: form.classroomId,
        teacherId: form.teacherId,
        name: form.name || null,
        description: form.description || null,
        capacity: form.capacity === '' ? null : Number(form.capacity),
        unitPrice: form.unitPrice === '' ? 0 : Number(form.unitPrice),
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        active: true,
        learnTimes: form.learnTimes.map(r => ({
          dayOfWeek: r.dayOfWeek,
          fromTime: r.fromTime,
          toTime: r.toTime,
        })),
      };
      if (editing) {
        await schedulesApi.update(editing.id, payload);
        toast.success('Schedule updated');
      } else {
        await schedulesApi.create(payload);
        toast.success('Schedule created');
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            {editing ? 'Edit course schedule' : 'New course schedule'}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="What is a course schedule?"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  A Course Schedule ties a Course to a Classroom + Teacher +
                  weekly time slots for the given date window.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
          <DialogDescription className="sr-only">
            A Course Schedule ties a Course to a Classroom + Teacher + weekly
            time slots for the given date window.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Course<span className="text-red-500"> *</span>
              </Label>
              <SearchablePicker
                options={courses.map(c => ({
                  value: c.id,
                  label: c.name,
                  secondary: c.code ?? undefined,
                  searchKey: `${c.name} ${c.code ?? ''}`,
                }))}
                value={form.courseId ?? ''}
                onChange={v => setForm(f => ({ ...f, courseId: v || null }))}
                placeholder="Pick a course"
                searchPlaceholder="Search or type a new course name…"
                allowClear={false}
                createLabel={q => `+ Add course "${q}"`}
                onCreate={async label => {
                  // Inline-add on the dropdown — creates a bare
                  // curriculum row (name only) and returns the picker
                  // option so the picker auto-selects it.
                  const created = await coursesApi.create({ name: label });
                  setCourses(cs => [...cs, created]);
                  return { value: created.id, label: created.name };
                }}
                onEdit={async (id, next) => {
                  // Inline-rename: keep the code/description untouched
                  // and just swap the name. Backend PUT takes the full
                  // request so we spread the existing row.
                  const existing = courses.find(c => c.id === id);
                  const updated = await coursesApi.update(id, {
                    name: next,
                    code: existing?.code ?? null,
                    description: existing?.description ?? null,
                    active: existing?.active ?? true,
                  });
                  setCourses(cs => cs.map(c => c.id === id ? updated : c));
                  return { value: updated.id, label: updated.name };
                }}
                onDelete={async id => {
                  await coursesApi.remove(id);
                  setCourses(cs => cs.filter(c => c.id !== id));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Classroom<span className="text-red-500"> *</span>
              </Label>
              <SearchablePicker
                options={classrooms.map(r => ({
                  value: r.id, label: r.name, searchKey: r.name,
                }))}
                value={form.classroomId ?? ''}
                onChange={v => setForm(f => ({ ...f, classroomId: v || null }))}
                placeholder="Pick a classroom"
                searchPlaceholder="Search or type a new classroom name…"
                allowClear={false}
                createLabel={q => `+ Add classroom "${q}"`}
                onCreate={async label => {
                  const created = await classroomsApi.create({ name: label });
                  setClassrooms(rs => [...rs, created]);
                  return { value: created.id, label: created.name };
                }}
                onEdit={async (id, next) => {
                  const existing = classrooms.find(r => r.id === id);
                  const updated = await classroomsApi.update(id, {
                    name: next,
                    description: existing?.description ?? null,
                    active: existing?.active ?? true,
                  });
                  setClassrooms(rs => rs.map(r => r.id === id ? updated : r));
                  return { value: updated.id, label: updated.name };
                }}
                onDelete={async id => {
                  await classroomsApi.remove(id);
                  setClassrooms(rs => rs.filter(r => r.id !== id));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Teacher</Label>
              <SearchablePicker
                options={teachers.map(t => ({
                  value: t.apiId ?? t.id,
                  label: t.name,
                  secondary: t.position || undefined,
                  searchKey: `${t.name} ${t.position ?? ''} ${t.empNo ?? ''}`,
                }))}
                value={form.teacherId ?? ''}
                onChange={v => setForm(f => ({ ...f, teacherId: v || null }))}
                placeholder="Pick a teacher"
                searchPlaceholder="Search a tagged employee…"
                emptyOptionsHint="No teachers yet — tag one via Enrollment Settings → Teachers."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Session name (optional)</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Morning batch"
                maxLength={255}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Capacity</Label>
              <Input
                type="number" min="0" step="1" className="tabular-nums"
                value={form.capacity === '' ? '' : String(form.capacity)}
                onChange={e => setForm(f => ({ ...f, capacity: e.target.value === '' ? '' : Number(e.target.value) }))}
                placeholder="e.g. 30"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tuition fee</Label>
              <Input
                type="number" min="0" step="0.01" className="tabular-nums"
                value={form.unitPrice === '' ? '' : String(form.unitPrice)}
                onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value === '' ? '' : Number(e.target.value) }))}
                placeholder="e.g. 120.00"
              />
            </div>
            {/* Term + Start Date + End Date on one 3-col row inside
                the outer 2-col grid. Picking a preset Term seeds
                Start Date to today AND End Date to today + N days
                (30 / 90 / 180 / 365). A later Start Date change
                with a non-Custom term still recomputes End Date.
                Custom unlocks End Date for manual entry. */}
            <div className="col-span-2 grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Term</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={term}
                  onChange={e => {
                    const next = e.target.value as Term;
                    setTerm(next);
                    if (next !== 'custom') {
                      const days = TERM_OPTIONS.find(t => t.value === next)?.days ?? 0;
                      const nextStart = todayIso();
                      setForm(f => ({
                        ...f,
                        startDate: nextStart,
                        endDate: addDaysIso(nextStart, days),
                      }));
                    }
                  }}
                >
                  {TERM_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Start date</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={e => {
                    const nextStart = e.target.value;
                    setForm(f => {
                      const nextEnd = term !== 'custom'
                        ? addDaysIso(nextStart, TERM_OPTIONS.find(t => t.value === term)?.days ?? 0)
                        : f.endDate;
                      return { ...f, startDate: nextStart, endDate: nextEnd };
                    });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End date</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  disabled={term !== 'custom'}
                  title={term !== 'custom' ? 'Set Term to Custom to edit End Date manually' : undefined}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-emerald-600" />
                Learn times (weekly)
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addRow} className="h-7">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add slot
              </Button>
            </div>
            {form.learnTimes.length === 0 ? (
              <p className="text-[11px] text-gray-500 text-center py-3 border rounded bg-gray-50/40">
                No learn times yet. Add at least one so students know when to attend.
              </p>
            ) : (
              <div className="space-y-2">
                {form.learnTimes.map((r, i) => (
                  <div key={i} className="grid grid-cols-[120px_1fr_1fr_auto] gap-2 items-center">
                    <select
                      className="h-9 px-2 border rounded-md text-sm bg-white"
                      value={r.dayOfWeek}
                      onChange={e => setRow(i, { dayOfWeek: Number(e.target.value) })}
                    >
                      {DAY_LABELS.map((d, idx) => (
                        <option key={idx} value={idx + 1}>{d}</option>
                      ))}
                    </select>
                    <Input
                      type="time"
                      value={r.fromTime}
                      onChange={e => setRow(i, { fromTime: e.target.value })}
                      className="tabular-nums"
                    />
                    <Input
                      type="time"
                      value={r.toTime}
                      onChange={e => setRow(i, { toTime: e.target.value })}
                      className="tabular-nums"
                    />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600"
                      onClick={() => removeRow(i)} title="Remove slot">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
