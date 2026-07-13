import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  Dialog as SubDialog, DialogContent as SubDialogContent, DialogDescription as SubDialogDescription,
  DialogFooter as SubDialogFooter, DialogHeader as SubDialogHeader, DialogTitle as SubDialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import {
  CalendarClock, Plus, Pencil, Trash2,
  UserSquare2, Loader2, Info, X,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { SearchablePicker } from './SearchablePicker';
import * as coursesApi from '../../api/courses';
import * as classroomsApi from '../../api/classrooms';
import * as schedulesApi from '../../api/courseSchedules';
import * as employeesApi from '../../api/employees';
import { useAuth } from '../../context/AuthContext';
import { AddCourseScheduleDialog } from './AddCourseScheduleDialog';

/**
 * Enrollment Settings — one popup for the school setup catalog
 * (V213 / v-course-schedule-model). Four sections:
 *
 *   • Courses      — curriculum ({@link coursesApi.Course}).
 *   • Classrooms   — physical rooms ({@link classroomsApi.Classroom}).
 *   • Course Schedules — enrollable sessions
 *     ({@link schedulesApi.CourseSchedule}).
 *   • Teachers     — Employees tagged with clinicalRole='teacher'.
 */
// v-enrollment-settings-trim — Courses + Classrooms are managed
// inline on the Course Schedule popup (SearchablePicker onCreate /
// onEdit / onDelete), so their standalone settings tabs were
// redundant. Left menu now shows only Course Schedules + Teachers.
type Section = 'schedules' | 'teachers';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function EnrollmentSettingsDialog({ open, onOpenChange }: Props) {
  const { canCreate, canUpdate, canDelete } = useAuth();
  const canWrite = canCreate('enrollment');

  const [section, setSection] = useState<Section>('schedules');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle>Enrollment Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Set up the school catalog: Courses, Classrooms, Course Schedules,
            and Teachers.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[220px_1fr] flex-1 min-h-0">
          <aside className="border-r bg-gray-50/60 p-2 overflow-y-auto">
            <SidebarButton
              active={section === 'schedules'}
              onClick={() => setSection('schedules')}
              icon={<CalendarClock className="h-4 w-4" />}
              label="Course Schedules"
              hint="Teaching sessions"
            />
            <SidebarButton
              active={section === 'teachers'}
              onClick={() => setSection('teachers')}
              icon={<UserSquare2 className="h-4 w-4" />}
              label="Teachers"
              hint="Tag employees"
            />
          </aside>

          <div className="p-6 overflow-y-auto">
            {section === 'schedules' && (
              <SchedulesSection canWrite={canWrite}
                canUpdate={canUpdate('enrollment')} canDelete={canDelete('enrollment')} />
            )}
            {section === 'teachers' && <TeachersSection />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SidebarButton({
  active, onClick, icon, label, hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  // v-settings-menu-tooltip — hint moved from a truncated subtitle
  // line to a right-side tooltip so the menu is single-line-per-item
  // and the descriptive copy still shows on hover / keyboard focus.
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className={`w-full text-left rounded-md p-2 flex items-center gap-2 transition ${
              active ? 'bg-white shadow-sm border border-gray-200' : 'hover:bg-white/60'
            }`}
          >
            <span className={active ? 'text-blue-600' : 'text-gray-400'}>
              {icon}
            </span>
            <span className={`flex-1 min-w-0 text-sm font-medium truncate ${active ? 'text-gray-900' : 'text-gray-700'}`}>
              {label}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs text-xs">
          {hint}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}


/* ========================= Course Schedules ========================= */

function SchedulesSection({ canWrite, canUpdate, canDelete }: {
  canWrite: boolean; canUpdate: boolean; canDelete: boolean;
}) {
  const [rows, setRows] = useState<schedulesApi.CourseSchedule[]>([]);
  const [courses, setCourses] = useState<coursesApi.Course[]>([]);
  const [classrooms, setClassrooms] = useState<classroomsApi.Classroom[]>([]);
  const [teachers, setTeachers] = useState<employeesApi.Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<schedulesApi.CourseSchedule | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<schedulesApi.CourseSchedule | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, c, r, e] = await Promise.all([
        schedulesApi.list({ size: 200 }),
        coursesApi.list({ size: 500 }),
        classroomsApi.list({ size: 500 }),
        employeesApi.list({ size: 500, status: 'active' }),
      ]);
      setRows(s.content ?? []);
      setCourses(c.content ?? []);
      setClassrooms(r.content ?? []);
      setTeachers((e.content ?? []).filter(x => x.clinicalRole === 'teacher'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const courseName    = useMemo(() => new Map(courses.map(c => [c.id, c.name])), [courses]);
  const classroomName = useMemo(() => new Map(classrooms.map(c => [c.id, c.name])), [classrooms]);
  const teacherName   = useMemo(
    () => new Map(teachers.map(e => [e.apiId ?? e.id, e.name])), [teachers]);

  const doDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await schedulesApi.remove(deleteConfirm.id);
      toast.success('Schedule deleted');
      setDeleteConfirm(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete schedule');
    }
  };

  const summariseLearnTimes = (lts: schedulesApi.LearnTime[]): string => {
    if (!lts || lts.length === 0) return '—';
    return lts.map(t => `${DAY_LABELS[t.dayOfWeek - 1]} ${t.fromTime.slice(0, 5)}–${t.toTime.slice(0, 5)}`).join(', ');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
          <CalendarClock className="h-4 w-4 text-emerald-600" /> Course Schedules
        </h3>
        {canWrite && (
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Schedule
          </Button>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">No schedules yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Classroom</TableHead>
              <TableHead>Teacher</TableHead>
              <TableHead>Learn Times</TableHead>
              <TableHead className="text-right w-[80px]">Fee</TableHead>
              <TableHead className="text-right w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {courseName.get(r.courseId) ?? '—'}
                  {r.name ? <span className="text-gray-500"> · {r.name}</span> : null}
                </TableCell>
                <TableCell className="text-sm text-gray-600">{classroomName.get(r.classroomId) ?? '—'}</TableCell>
                <TableCell className="text-sm text-gray-600">
                  {r.teacherId ? teacherName.get(r.teacherId) ?? '—' : '—'}
                </TableCell>
                <TableCell className="text-sm text-gray-600 max-w-[280px] truncate" title={summariseLearnTimes(r.learnTimes)}>
                  {summariseLearnTimes(r.learnTimes)}
                </TableCell>
                <TableCell className="text-sm text-right tabular-nums text-gray-600">
                  {r.unitPrice != null ? r.unitPrice.toFixed(2) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    {canUpdate && (
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditing(r); setDialogOpen(true); }} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteConfirm(r)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AddCourseScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => void load()}
      />

      <AlertDialog open={!!deleteConfirm} onOpenChange={o => !o && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This teaching session and its learn times will be removed. Existing
              enrollments will stay in place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ============================ Teachers ============================ */

/**
 * Follows the Doctor tagging UX from AppointmentSettingsDialog
 * (v-healthcare-staff-roles): the table shows ONLY employees
 * currently tagged as Teacher. The "Add Teacher" button opens a
 * SearchablePicker over the pool of employees who have no role tag
 * yet. Row-level Remove untags in place. One role per employee, so
 * tagging Teacher clears any previous doctor / cashier / staff tag
 * — the popup pool filters to untagged so the admin has to
 * consciously choose to reassign via the other role's Settings.
 */
function TeachersSection() {
  const { canUpdate } = useAuth();
  const canTag = canUpdate('employees');
  const [employees, setEmployees] = useState<employeesApi.Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await employeesApi.list({ size: 500, status: 'active' });
      setEmployees(r.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load employees');
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const teachers = useMemo(() => employees.filter(e => e.clinicalRole === 'teacher'), [employees]);
  // Untagged pool — same filter as the Doctor UX. Employees with any
  // other role stay hidden so the admin picks role-swaps deliberately.
  const untagged = useMemo(() => employees.filter(e => !e.clinicalRole), [employees]);

  const patchRole = async (emp: employeesApi.Employee, next: employeesApi.ClinicalRole | null) => {
    const key = emp.apiId ?? emp.id;
    setBusyId(key);
    try {
      const saved = await employeesApi.update(emp.apiId ?? emp.id, {
        ...(emp as unknown as employeesApi.CreateEmployeeRequest),
        clinicalRole: next,
      });
      setEmployees(list => list.map(e => (e.apiId ?? e.id) === key ? saved : e));
      toast.success(next === 'teacher'
        ? `Tagged ${emp.name} as Teacher`
        : `Removed Teacher tag from ${emp.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update role');
    } finally {
      setBusyId(null);
    }
  };

  const remove = (emp: employeesApi.Employee) => {
    if (!confirm(`Remove ${emp.name} from the Teacher list?`)) return;
    void patchRole(emp, null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
            <UserSquare2 className="h-4 w-4 text-emerald-600" /> Teachers
          </h3>
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Teacher role guidance"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                Tag an employee as Teacher to make them selectable in the Course
                Schedule form's Teacher picker. One role per employee — a Teacher
                tag clears any previous doctor / cashier / staff tag.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          disabled={!canTag || loading || untagged.length === 0}
          title={untagged.length === 0 ? 'Every active employee is already tagged' : 'Add an employee to the Teacher list'}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Teacher
        </Button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-500">
          <Loader2 className="h-4 w-4 inline mr-1 animate-spin" /> Loading employees…
        </div>
      ) : teachers.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          No teachers yet — click <b>Add Teacher</b> to tag your first.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Emp No</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Position</TableHead>
              <TableHead className="text-right w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teachers.map(e => {
              const key = e.apiId ?? e.id;
              const busy = busyId === key;
              return (
                <TableRow key={key} className="hover:bg-gray-50">
                  <TableCell className="tabular-nums text-sm">{e.empNo}</TableCell>
                  <TableCell className="text-sm font-medium">{e.name}</TableCell>
                  <TableCell className="text-sm text-gray-600">{e.position || '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => remove(e)}
                      disabled={!canTag || busy}
                      title="Remove from Teacher list"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <AddTeacherDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        candidates={untagged}
        onAdded={async emp => {
          setAddOpen(false);
          await patchRole(emp, 'teacher');
        }}
      />
    </div>
  );
}

/**
 * Compact "Add Teacher" popup, matching the AddStaffDialog shape in
 * AppointmentSettingsDialog. Employees already carrying a role tag
 * don't appear as candidates — the admin removes their prior tag
 * from the owning Settings (Healthcare, Cashier, etc.) first.
 */
function AddTeacherDialog({ open, onOpenChange, candidates, onAdded }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidates: employeesApi.Employee[];
  onAdded: (emp: employeesApi.Employee) => Promise<void> | void;
}) {
  const [empId, setEmpId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setEmpId(''); }, [open]);

  const options = useMemo(
    () => candidates.map(e => ({
      value: e.apiId ?? e.id,
      label: e.name,
      secondary: e.position || e.empNo || undefined,
      searchKey: `${e.name} ${e.position ?? ''} ${e.empNo ?? ''} ${e.email ?? ''}`,
    })),
    [candidates],
  );

  const save = async () => {
    const emp = candidates.find(e => (e.apiId ?? e.id) === empId);
    if (!emp) { toast.error('Pick an employee'); return; }
    setSaving(true);
    try {
      await onAdded(emp);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SubDialog open={open} onOpenChange={onOpenChange}>
      <SubDialogContent className="sm:max-w-[520px] w-[92vw]">
        <SubDialogHeader>
          <SubDialogTitle>Add teacher</SubDialogTitle>
          <SubDialogDescription className="sr-only">
            Pick an untagged employee to add to the Teacher list.
          </SubDialogDescription>
        </SubDialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Employee *</Label>
            <SearchablePicker
              options={options}
              value={empId}
              onChange={setEmpId}
              placeholder="Pick an employee"
              searchPlaceholder="Search name, position, empNo, email…"
              allowClear={false}
              emptyResultsLabel="No untagged employees left."
            />
          </div>
          <p className="text-[11px] text-gray-500 leading-snug">
            Employees already tagged with another clinical role (doctor / cashier
            / staff) don't appear here — remove that tag from their owning
            Settings first.
          </p>
        </div>
        <SubDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="h-4 w-4 mr-1.5" /> Cancel
          </Button>
          <Button onClick={save} disabled={saving || !empId}>
            <Plus className="h-4 w-4 mr-1.5" /> {saving ? 'Adding…' : 'Add'}
          </Button>
        </SubDialogFooter>
      </SubDialogContent>
    </SubDialog>
  );
}
