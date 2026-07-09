import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { BookOpen, GraduationCap, Plus, Pencil, Trash2 } from 'lucide-react';
import * as itemsApi from '../../api/items';
import * as employeesApi from '../../api/employees';
import { useAuth } from '../../context/AuthContext';

/**
 * Enrollment Settings — one popup for the school-side setup catalog
 * (v-enrollment-settings-courses). Two left-menu sections:
 *
 *   • Courses — curriculum templates ({@code stock_items.type='course'}).
 *     Minimal fields: Code (via {@code sku}), Name, Description,
 *     Base fee. Fed into the Classes tab as the "which course does
 *     this offering realise" pointer once the FK lands (v2).
 *   • Classes — enrollable offerings ({@code stock_items.type='class'}).
 *     Same shape as the top-level Classes page but tucked into the
 *     Enrollment workflow. Teacher / Term / Dates / Capacity / Fee.
 *
 * Both tabs hit the same {@code /api/v1/stock-items} endpoint with a
 * type filter — no new backend surface. Layout mirrors
 * {@link EmployeeSettingsDialog} so the left-sidebar-with-right-pane
 * pattern is consistent across settings dialogs.
 */
type Section = 'courses' | 'classes';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const emptyCourse: itemsApi.ItemRequest = {
  name: '', description: '', unitPrice: 0, active: true, type: 'course',
};
const emptyClass: itemsApi.ItemRequest = {
  name: '', description: '', unitPrice: 0, active: true, type: 'class',
  teacherId: null, capacity: null, termCode: '', startDate: null, endDate: null,
};

export function EnrollmentSettingsDialog({ open, onOpenChange }: Props) {
  const { canCreate, canUpdate, canDelete } = useAuth();
  const canWriteClass  = canCreate('class');
  const canWriteCourse = canCreate('enrollment');

  const [section, setSection] = useState<Section>('courses');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle>Enrollment Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Set up the curriculum catalog: Courses (templates) and
            Classes (offerings) that students enroll into.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[200px_1fr] flex-1 min-h-0">
          <aside className="border-r bg-gray-50/60 p-2 overflow-y-auto">
            <SidebarButton
              active={section === 'courses'}
              onClick={() => setSection('courses')}
              icon={<BookOpen className="h-4 w-4" />}
              label="Courses"
              hint="Curriculum templates"
            />
            <SidebarButton
              active={section === 'classes'}
              onClick={() => setSection('classes')}
              icon={<GraduationCap className="h-4 w-4" />}
              label="Classes"
              hint="Enrollable offerings"
            />
          </aside>

          <div className="p-6 overflow-y-auto">
            {section === 'courses' && (
              <CatalogSection
                key="courses"
                title="Courses"
                icon={<BookOpen className="h-4 w-4 text-emerald-600" />}
                type="course"
                emptyFormFactory={() => ({ ...emptyCourse })}
                canWrite={canWriteCourse}
                canUpdate={canUpdate('enrollment')}
                canDelete={canDelete('enrollment')}
              />
            )}
            {section === 'classes' && (
              <CatalogSection
                key="classes"
                title="Classes"
                icon={<GraduationCap className="h-4 w-4 text-emerald-600" />}
                type="class"
                emptyFormFactory={() => ({ ...emptyClass })}
                canWrite={canWriteClass}
                canUpdate={canUpdate('class')}
                canDelete={canDelete('class')}
              />
            )}
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-md p-2 flex items-start gap-2 transition ${
        active ? 'bg-white shadow-sm border border-gray-200' : 'hover:bg-white/60'
      }`}
    >
      <span className={active ? 'text-blue-600 mt-0.5' : 'text-gray-400 mt-0.5'}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-medium ${active ? 'text-gray-900' : 'text-gray-700'}`}>
          {label}
        </span>
        <span className="block text-[11px] text-gray-500 truncate">{hint}</span>
      </span>
    </button>
  );
}

/**
 * Shared list + create/edit inline pane for a single {@code stock_items.type}.
 * Kept in-file (not extracted to its own component) so both tabs
 * can share the layout without a public API to maintain. Class-only
 * fields render only when {@code type === 'class'}.
 */
function CatalogSection({
  title, icon, type, emptyFormFactory, canWrite, canUpdate, canDelete,
}: {
  title: string;
  icon: React.ReactNode;
  type: 'course' | 'class';
  emptyFormFactory: () => itemsApi.ItemRequest;
  canWrite: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const [rows, setRows] = useState<itemsApi.Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [teachers, setTeachers] = useState<employeesApi.Employee[]>([]);
  const [editing, setEditing] = useState<itemsApi.Item | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<itemsApi.ItemRequest>(emptyFormFactory);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<itemsApi.Item | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const page = await itemsApi.list({ type, size: 200 });
      setRows(page.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to load ${title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    if (type === 'class') {
      (async () => {
        try {
          const emps = await employeesApi.list({ size: 500, status: 'active' });
          setTeachers(emps.content ?? []);
        } catch { /* soft-fail */ }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const teacherName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of teachers) map.set(e.apiId ?? e.id, e.name);
    return (id: string | null | undefined) => id ? map.get(id) ?? '—' : '—';
  }, [teachers]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyFormFactory());
    setShowForm(true);
  };

  const openEdit = (r: itemsApi.Item) => {
    setEditing(r);
    setForm({
      name: r.name, description: r.description ?? '',
      unitPrice: r.unitPrice ?? 0, active: r.active ?? true, type,
      teacherId: r.teacherId ?? null,
      capacity: r.capacity ?? null,
      termCode: r.termCode ?? '',
      startDate: r.startDate ?? null,
      endDate: r.endDate ?? null,
      sku: r.sku ?? '',
    });
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.name?.trim()) { toast.error(`${title.slice(0, -1)} name is required`); return; }
    setSaving(true);
    try {
      if (editing) {
        await itemsApi.update(editing.id, form);
        toast.success(`${title.slice(0, -1)} updated`);
      } else {
        await itemsApi.create(form);
        toast.success(`${title.slice(0, -1)} created`);
      }
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to save ${title.slice(0, -1).toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await itemsApi.remove(deleteConfirm.id);
      toast.success(`${title.slice(0, -1)} deleted`);
      setDeleteConfirm(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to delete ${title.slice(0, -1).toLowerCase()}`);
    }
  };

  const isClass = type === 'class';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
          {icon} {title}
        </h3>
        {canWrite && !showForm && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add {title.slice(0, -1)}
          </Button>
        )}
      </div>

      {showForm ? (
        <div className="border rounded-md p-4 space-y-3 bg-gray-50/40">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">
                Name<span className="text-red-500"> *</span>
              </Label>
              <Input
                value={form.name ?? ''}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={isClass ? 'e.g. Math Grade 7 (Morning)' : 'e.g. English Language Arts'}
              />
            </div>
            {isClass && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Teacher</Label>
                  <select
                    className="w-full h-9 px-3 border rounded-md text-sm bg-white"
                    value={form.teacherId ?? ''}
                    onChange={e => setForm(f => ({ ...f, teacherId: e.target.value || null }))}
                  >
                    <option value="">—</option>
                    {teachers.map(t => (
                      <option key={t.apiId ?? t.id} value={t.apiId ?? t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Term code</Label>
                  <Input
                    value={form.termCode ?? ''}
                    onChange={e => setForm(f => ({ ...f, termCode: e.target.value }))}
                    placeholder="e.g. 2026-T1"
                    maxLength={32}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Start date</Label>
                  <Input
                    type="date"
                    value={form.startDate ?? ''}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value || null }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End date</Label>
                  <Input
                    type="date"
                    value={form.endDate ?? ''}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value || null }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Capacity</Label>
                  <Input
                    type="number" min="0" step="1" className="tabular-nums"
                    value={form.capacity == null ? '' : String(form.capacity)}
                    onChange={e => setForm(f => ({ ...f, capacity: e.target.value === '' ? null : Number(e.target.value) }))}
                    placeholder="e.g. 30"
                  />
                </div>
              </>
            )}
            {!isClass && (
              <div className="space-y-1.5">
                <Label className="text-xs">Course code (optional)</Label>
                <Input
                  value={form.sku ?? ''}
                  onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                  placeholder="e.g. ELA-G7"
                  maxLength={64}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">{isClass ? 'Tuition fee' : 'Base fee'}</Label>
              <Input
                type="number" min="0" step="0.01" className="tabular-nums"
                value={form.unitPrice == null ? '' : String(form.unitPrice)}
                onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value === '' ? 0 : Number(e.target.value) }))}
                placeholder="e.g. 120.00"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input
              value={form.description ?? ''}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      ) : loading && rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">
          No {title.toLowerCase()} yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {isClass && <TableHead className="w-[150px]">Teacher</TableHead>}
              {isClass && <TableHead className="w-[100px]">Term</TableHead>}
              {!isClass && <TableHead className="w-[110px]">Code</TableHead>}
              <TableHead className="w-[90px] text-right">Fee</TableHead>
              <TableHead className="text-right w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                {isClass && <TableCell className="text-sm text-gray-600">{teacherName(r.teacherId)}</TableCell>}
                {isClass && <TableCell className="text-sm text-gray-600 tabular-nums">{r.termCode || '—'}</TableCell>}
                {!isClass && <TableCell className="text-sm text-gray-600 tabular-nums">{r.sku || '—'}</TableCell>}
                <TableCell className="text-sm text-right tabular-nums text-gray-600">
                  {r.unitPrice != null ? r.unitPrice.toFixed(2) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    {canUpdate && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)} title="Edit">
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

      <AlertDialog open={!!deleteConfirm} onOpenChange={o => !o && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {title.slice(0, -1).toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.name} will be removed. Existing enrollments referencing it stay in place.
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
