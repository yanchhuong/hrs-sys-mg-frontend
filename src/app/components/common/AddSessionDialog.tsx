import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import * as sessionsApi from '../../api/sessions';
import * as schedulesApi from '../../api/courseSchedules';
import * as coursesApi from '../../api/courses';
import * as classroomsApi from '../../api/classrooms';

/**
 * v-attendance-add-session — ad-hoc session creator on the
 * Attendance page. Given a schedule + date range + time window,
 * the backend materialises one session per day in the range.
 * Idempotent — re-running for the same tuple returns the existing
 * rows.
 */
interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: (count: number) => void;
}

const isoToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

interface FormState {
  courseScheduleId: string;
  fromDate: string;
  toDate: string;
  fromTime: string;
  toTime: string;
  topic: string;
}

const blank: FormState = {
  courseScheduleId: '',
  fromDate: '', toDate: '',
  fromTime: '', toTime: '',
  topic: '',
};

export function AddSessionDialog({ open, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(blank);
  const [schedules, setSchedules] = useState<schedulesApi.CourseSchedule[]>([]);
  const [courses, setCourses] = useState<coursesApi.Course[]>([]);
  const [classrooms, setClassrooms] = useState<classroomsApi.Classroom[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Seed the range to today (single-day session by default) so a
    // one-off "make-up class" save doesn't require typing two dates.
    const today = isoToday();
    setForm({ ...blank, fromDate: today, toDate: today });
    (async () => {
      try {
        const [s, c, r] = await Promise.all([
          schedulesApi.list({ size: 500 }),
          coursesApi.list({ size: 500 }),
          classroomsApi.list({ size: 500 }),
        ]);
        setSchedules(s.content ?? []);
        setCourses(c.content ?? []);
        setClassrooms(r.content ?? []);
      } catch { /* soft-fail — schedule picker empties */ }
    })();
  }, [open]);

  // Composed schedule label matches the Enrollments page format so
  // the operator recognises the row: "Course · Room · Session name".
  const scheduleLabel = (s: schedulesApi.CourseSchedule): string => {
    const parts: string[] = [];
    const cname = courses.find(c => c.id === s.courseId)?.name;
    const rname = classrooms.find(r => r.id === s.classroomId)?.name;
    if (cname) parts.push(cname);
    if (s.name) parts.push(s.name);
    if (rname) parts.push(rname);
    return parts.join(' · ') || s.id;
  };

  const submit = async () => {
    if (!form.courseScheduleId) { toast.error('Pick a Course Schedule'); return; }
    if (!form.fromDate || !form.toDate) { toast.error('Both From and To dates are required'); return; }
    if (form.toDate < form.fromDate) { toast.error("'To date' must be on or after 'From date'"); return; }
    if (!form.fromTime || !form.toTime) { toast.error('Both From and To times are required'); return; }
    if (form.fromTime >= form.toTime) { toast.error("'From time' must be earlier than 'To time'"); return; }
    setSaving(true);
    try {
      const created = await sessionsApi.bulkAdd({
        courseScheduleId: form.courseScheduleId,
        fromDate: form.fromDate,
        toDate: form.toDate,
        fromTime: form.fromTime,
        toTime: form.toTime,
        topic: form.topic || null,
      });
      toast.success(created.length === 1
        ? 'Session added'
        : `${created.length} sessions added`);
      onSaved?.(created.length);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add session');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add session</DialogTitle>
          <DialogDescription className="sr-only">
            Materialise one or more ad-hoc sessions for the picked schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">
              Course Schedule<span className="text-red-500"> *</span>
            </Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={form.courseScheduleId}
              onChange={e => setForm(f => ({ ...f, courseScheduleId: e.target.value }))}
            >
              <option value="">— pick a schedule —</option>
              {schedules.map(s => (
                <option key={s.id} value={s.id}>{scheduleLabel(s)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">From date<span className="text-red-500"> *</span></Label>
              <Input type="date" value={form.fromDate}
                onChange={e => setForm(f => ({ ...f, fromDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To date<span className="text-red-500"> *</span></Label>
              <Input type="date" value={form.toDate}
                onChange={e => setForm(f => ({ ...f, toDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From time<span className="text-red-500"> *</span></Label>
              <Input type="time" value={form.fromTime}
                onChange={e => setForm(f => ({ ...f, fromTime: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To time<span className="text-red-500"> *</span></Label>
              <Input type="time" value={form.toTime}
                onChange={e => setForm(f => ({ ...f, toTime: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Topic (optional)</Label>
            <Input
              value={form.topic}
              onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
              placeholder="e.g. Make-up class · Workshop"
              maxLength={255}
            />
          </div>

          <p className="text-[11px] text-gray-500 leading-snug">
            One session is created for each day between From and To at the given time.
            Existing sessions at the same (schedule, date, time) are kept as-is — no duplicates.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
