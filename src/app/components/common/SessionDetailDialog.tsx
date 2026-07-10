import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Loader2, Save, CheckCircle2 } from 'lucide-react';
import * as sessionsApi from '../../api/sessions';

/**
 * V215 / v-attendance-module — session details + attendance grid.
 * Read-write until the session is Completed / Cancelled, then
 * read-only for non-admins (admin reopen is a future phase).
 *
 * <p>Roster comes from the schedule's active enrollments (see
 * {@link CourseScheduleSessionService.hydrateDetail}). Historic
 * attendance rows for students who later withdrew still surface at
 * the bottom of the grid so the record survives.</p>
 */
interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sessionId: string | null;
  onSaved?: () => void;
}

const STATUS_CLS: Record<sessionsApi.SessionStatus, string> = {
  upcoming:    'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled:   'bg-rose-100 text-rose-700 border-rose-200',
};

const ATT_STATUSES: sessionsApi.AttendanceStatus[] = [
  'present', 'late', 'absent', 'sick', 'left_early',
];

const ATT_LABEL: Record<sessionsApi.AttendanceStatus, string> = {
  present: 'Present', late: 'Late', absent: 'Absent',
  sick: 'Sick', left_early: 'Left Early',
};

export function SessionDetailDialog({ open, onOpenChange, sessionId, onSaved }: Props) {
  const [session, setSession] = useState<sessionsApi.Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [topic, setTopic] = useState('');
  // Local editable copy of the attendance grid.
  const [rows, setRows] = useState<sessionsApi.AttendanceRow[]>([]);

  useEffect(() => {
    if (!open || !sessionId) { setSession(null); setRows([]); setTopic(''); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const s = await sessionsApi.get(sessionId);
        if (cancelled) return;
        setSession(s);
        setTopic(s.topic ?? '');
        setRows(s.attendances);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Failed to load session');
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, sessionId, onOpenChange]);

  // v-attendance-editable-terminal — admin / teacher can amend
  // attendance on completed / cancelled sessions too (late fixes,
  // retroactive corrections). The dialog only goes read-only while
  // the session hasn't loaded yet.
  const readOnly = !session;

  const setRow = (studentId: string, patch: Partial<sessionsApi.AttendanceRow>) =>
    setRows(list => list.map(r => r.studentId === studentId ? { ...r, ...patch } : r));

  const save = async (options?: { thenComplete?: boolean }) => {
    if (!session) return;
    setSaving(true);
    try {
      // Persist the topic first so a save-only click doesn't lose
      // an inline edit of it.
      if ((session.topic ?? '') !== topic) {
        await sessionsApi.updateTopic(session.id, topic || null);
      }
      const entries: sessionsApi.AttendanceEntry[] = rows.map(r => ({
        studentId: r.studentId,
        status: r.status,
        checkIn: r.checkIn || null,
        checkOut: r.checkOut || null,
        remark: r.remark || null,
      }));
      const saved = await sessionsApi.saveAttendance(session.id, entries);
      setSession(saved);
      setRows(saved.attendances);
      toast.success('Attendance saved');
      if (options?.thenComplete) {
        const done = await sessionsApi.complete(session.id);
        setSession(done);
        toast.success('Session marked completed');
      }
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const markedCount = rows.filter(r => r.status !== 'absent').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{session?.courseName ?? 'Session'}</span>
            {session && (
              <Badge className={`inline-flex items-center border ${STATUS_CLS[session.status]}`}>
                {session.status.replace('_', ' ')}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Session details + per-student attendance grid.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">
            <Loader2 className="h-4 w-4 inline mr-1 animate-spin" /> Loading…
          </div>
        ) : session ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-gray-500">Classroom</div>
                <div className="font-medium">{session.classroomName ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Teacher</div>
                <div>{session.teacherName ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Date</div>
                <div className="tabular-nums">{session.sessionDate}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Time</div>
                <div className="tabular-nums">
                  {session.fromTime.slice(0, 5)}–{session.toTime.slice(0, 5)}
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="sess-topic" className="text-xs">Topic</Label>
                <Input
                  id="sess-topic"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. Introduction to Grammar"
                  maxLength={255}
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Student attendance</h4>
              <div className="text-xs text-gray-500 tabular-nums">
                {markedCount} / {rows.length} marked
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">
                No students enrolled in this schedule yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="w-[130px]">Status</TableHead>
                    <TableHead className="w-[110px]">Check In</TableHead>
                    <TableHead className="w-[110px]">Check Out</TableHead>
                    <TableHead>Remark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.studentId}>
                      <TableCell className="font-medium">{r.studentName || '—'}</TableCell>
                      <TableCell>
                        <select
                          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          value={r.status}
                          onChange={e => setRow(r.studentId, { status: e.target.value as sessionsApi.AttendanceStatus })}
                          disabled={readOnly}
                        >
                          {ATT_STATUSES.map(s => (
                            <option key={s} value={s}>{ATT_LABEL[s]}</option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="time"
                          value={(r.checkIn ?? '').slice(0, 5)}
                          onChange={e => setRow(r.studentId, { checkIn: e.target.value || null })}
                          className="h-8 tabular-nums text-xs"
                          disabled={readOnly}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="time"
                          value={(r.checkOut ?? '').slice(0, 5)}
                          onChange={e => setRow(r.studentId, { checkOut: e.target.value || null })}
                          className="h-8 tabular-nums text-xs"
                          disabled={readOnly}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.remark ?? ''}
                          onChange={e => setRow(r.studentId, { remark: e.target.value })}
                          placeholder="Optional"
                          className="h-8 text-xs"
                          disabled={readOnly}
                          maxLength={500}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-6 text-center">No session loaded.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Close</Button>
          {session && (
            <>
              <Button onClick={() => void save()} disabled={saving}>
                <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Saving…' : 'Save Attendance'}
              </Button>
              {/* Complete only offered when the session isn't already
                  in a terminal state — the button is idempotently
                  safe on the backend but re-completing is noise. */}
              {session.status !== 'completed' && session.status !== 'cancelled' && (
                <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => void save({ thenComplete: true })} disabled={saving}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Complete Session
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
